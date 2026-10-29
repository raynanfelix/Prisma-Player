# Webhooks Inbound de Plataformas de Anúncio — especificação (2026-10-28)

Fonte: dono (28/10/2026). "Receber eventos de compra confirmados pelas plataformas (Meta, TikTok, Google) quando o gateway do usuário dispara a conversão nos pixels dele. A Prisma só recebe, não envia."

## O que é

A Prisma Player atua como **espelho/receptor** de eventos de conversão que já aconteceram entre o gateway de pagamento do usuário (Kiwify, Hotmart, etc.) e as plataformas de anúncio (Meta Ads, TikTok Ads, Google Ads). O fluxo é:

1. Usuário configura pixel na VSL da Prisma
2. Gateway do usuário confirma venda → dispara evento para a plataforma usando o pixel configurado
3. Plataforma recebe a conversão
4. **Prisma recebe da plataforma** via webhook → grava em `video_events` → exibe no dashboard

A Prisma **não envia nada** para as plataformas neste fluxo. Apenas consome as APIs de notificação/webhook de cada plataforma para receber confirmações de conversão atribuídas aos pixels configurados.

## Plataformas suportadas (v1)

### Meta (Facebook/Instagram) — Conversions API Webhook
- **Endpoint:** `/api/webhooks/ads/meta`
- **Autenticação:** Verify Token (configurado no Meta Events Manager → Settings → Webhook)
- **Eventos recebidos:** `purchase`, `lead`, `complete_registration` (filtrar por `pixel_id` configurado na integração)
- **Documentação:** https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/webhook-events

### TikTok — Events API Webhook
- **Endpoint:** `/api/webhooks/ads/tiktok`
- **Autenticação:** Access Token (header `Access-Token`)
- **Eventos recebidos:** `CompletePayment`, `PlaceAnOrder`, `SubmitOrder` (filtrar por `event_source_id` = pixel configurado)
- **Documentação:** https://business-api.tiktok.com/portal/docs?id=17395

### Google Ads — Enhanced Conversions Webhook
- **Endpoint:** `/api/webhooks/ads/google`
- **Autenticação:** Google-Cloud-Signature header (HMAC-SHA256)
- **Eventos recebidos:** `conversion` (filtrar por `conversion_action` vinculado ao `tag_id` configurado)
- **Documentação:** https://developers.google.com/google-ads/api/docs/conversions/enhance-conversions

## Dados (Drizzle + SQL)

### Tabela existente: `account_integrations`
Já existe em [drizzle/schema.ts:1312](../drizzle/schema.ts#L1312). Estrutura:
- `account_owner_id` (text, FK implícita para auth)
- `provider` (enum: 'meta_pixel', 'google_ads', 'tiktok', ...)
- `instance_id` (text, default 'default')
- `config` (jsonb, armazena tokens/IDs de leitura da API de relatórios)
- `vsl_ids` (jsonb array, VSLs vinculadas a esta integração)
- `enabled` (boolean)

### Config por provider (campos em `config` jsonb)
```json
{
  "meta_pixel": {
    "pixelId": "1234567890",
    "accessToken": "EAAx...", // Token de leitura da API de relatórios (não CAPI)
    "verifyToken": "prisma-verify-abc123", // Token de verificação do webhook
    "adAccountId": "act_1234567890" // Opcional, para filtrar por conta de anúncios
  },
  "google_ads": {
    "tagId": "AW-123456789",
    "conversionDestination": "AW-123456789/Checkout_1",
    "webhookSecret": "google-webhook-secret-xyz", // HMAC secret para validação
    "customerId": "123-456-7890" // Google Ads Customer ID
  },
  "tiktok": {
    "pixelId": "C123456789ABCDEF",
    "accessToken": "tiktok-access-token", // Token de leitura da Reporting API
    "advertiserId": "1234567890" // TikTok Advertiser ID
  }
}
```

### Tabela existente: `video_events`
Já existe em [drizzle/schema.ts:185](../drizzle/schema.ts#L185). Estrutura:
- `user_id` (text, dono da VSL)
- `video_id` (uuid, FK para `videos`)
- `session_id` (uuid, sessão do espectador)
- `event_type` (enum: 'impression', 'play', 'progress', 'complete', 'cta_click', 'conversion')
- `transaction_id` (text, ID da transação do gateway)
- `conversion_value` (numeric, valor da venda)
- `currency` (text, moeda ISO 4217)
- `advertising_consent` (boolean)

**Deduplicação:** Índice único em `(video_id, transaction_id)` quando `event_type = 'conversion'` ([schema.ts:282](../drizzle/schema.ts#L282)).

## Backend

### 1. Rota de webhook inbound: `POST /api/webhooks/ads/[provider]`
- **Autenticação por provider:**
  - Meta: verificar `hub.verify_token` no challenge de subscrição + validar `x-hub-signature-256` (HMAC-SHA256 do payload com app secret)
  - TikTok: validar header `Access-Token` + verificar `event_source_id` corresponde a um pixel configurado
  - Google: validar header `Google-Cloud-Signature` (HMAC-SHA256 com webhook secret)
- **Rate limit:** 120 req/min por provider (fail-closed)
- **Idempotência:** INSERT em `video_events` com ON CONFLICT DO NOTHING (dedup por `video_id + transaction_id`)
- **Isolamento multi-tenant:**
  1. Extrair `pixel_id`/`tag_id` do payload
  2. Buscar `account_integrations` WHERE `provider` = X AND `config->>'pixelId'` = Y
  3. Para cada integração encontrada, iterar `vsl_ids` e gravar evento em `video_events` com `user_id` = `account_owner_id` da integração
  4. **Nunca cruzar dados entre contas:** query sempre filtra por `account_owner_id` da integração encontrada

### 2. Módulo server-only: `src/lib/ads/inbound-webhooks.ts`
```typescript
import "server-only";

export interface InboundConversion {
  provider: "meta" | "google" | "tiktok";
  pixelId: string;
  transactionId: string;
  value: number;
  currency: string;
  timestamp: Date;
  rawPayload: Record<string, unknown>;
}

export async function processInboundConversion(
  conversion: InboundConversion
): Promise<{ processed: number; duplicates: number }> {
  // 1. Buscar integrações que têm este pixel configurado
  const integrations = await db
    .select()
    .from(accountIntegrations)
    .where(
      and(
        eq(accountIntegrations.provider, `${conversion.provider}_pixel`),
        eq(sql`config->>'pixelId'`, conversion.pixelId),
        eq(accountIntegrations.enabled, true)
      )
    );

  let processed = 0;
  let duplicates = 0;

  // 2. Para cada integração, gravar evento em cada VSL vinculada
  for (const integration of integrations) {
    const vslIds = integration.vslIds as string[];
    for (const videoId of vslIds) {
      try {
        await db
          .insert(videoEvents)
          .values({
            userId: integration.accountOwnerId,
            videoId,
            sessionId: crypto.randomUUID(), // Sessão sintética para webhooks
            eventType: "conversion",
            progressPercent: 100,
            watchedSeconds: "0",
            transactionId: conversion.transactionId,
            conversionValue: String(conversion.value),
            currency: conversion.currency,
            advertisingConsent: true, // Webhook implica consentimento
            createdAt: conversion.timestamp,
          })
          .onConflictDoNothing();

        processed++;
      } catch (error) {
        if (error instanceof Error && error.message.includes("duplicate")) {
          duplicates++;
        } else {
          throw error;
        }
      }
    }
  }

  return { processed, duplicates };
}
```

### 3. Handlers por provider
```typescript
// src/lib/ads/providers/meta.ts
export async function verifyMetaWebhook(
  request: Request
): Promise<{ valid: boolean; conversions: InboundConversion[] }> {
  const signature = request.headers.get("x-hub-signature-256");
  const body = await request.text();
  
  // Validar HMAC-SHA256
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signature) return { valid: false, conversions: [] };
  
  const expectedSignature = `sha256=${createHmac("sha256", appSecret)
    .update(body)
    .digest("hex")}`;
  
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { valid: false, conversions: [] };
  }

  const payload = JSON.parse(body);
  const conversions: InboundConversion[] = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "pixel" && change.value.event === "purchase") {
        conversions.push({
          provider: "meta",
          pixelId: entry.id,
          transactionId: change.value.event_id || change.value.order_id,
          value: change.value.value,
          currency: change.value.currency,
          timestamp: new Date(change.value.event_time * 1000),
          rawPayload: change.value,
        });
      }
    }
  }

  return { valid: true, conversions };
}
```

### 4. Rota principal
```typescript
// src/app/api/webhooks/ads/[provider]/route.ts
export async function POST(
  request: Request,
  { params }: { params: { provider: string } }
) {
  const { provider } = params;
  
  // Rate limit por provider
  const limited = await rateLimit(request, `ads-webhook-${provider}`, {
    max: 120,
    windowMs: 60_000,
    failClosed: true,
  });
  if (limited) return limited;

  let result: { valid: boolean; conversions: InboundConversion[] };
  
  switch (provider) {
    case "meta":
      result = await verifyMetaWebhook(request);
      break;
    case "google":
      result = await verifyGoogleWebhook(request);
      break;
    case "tiktok":
      result = await verifyTikTokWebhook(request);
      break;
    default:
      return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  if (!result.valid) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let totalProcessed = 0;
  let totalDuplicates = 0;

  for (const conversion of result.conversions) {
    const { processed, duplicates } = await processInboundConversion(conversion);
    totalProcessed += processed;
    totalDuplicates += duplicates;
  }

  return NextResponse.json({
    received: true,
    processed: totalProcessed,
    duplicates: totalDuplicates,
  });
}
```

## Frontend

### 1. Tela de configuração de webhook em `/dashboard/integracoes/[provider]`
- **Meta Pixel:**
  - Campos: Pixel ID, Access Token (leitura), Verify Token, Ad Account ID (opcional)
  - Instruções: "No Meta Events Manager → Settings → Webhooks, configure a URL: `https://app.prismaplayer.online/api/webhooks/ads/meta` e use o Verify Token exibido aqui."
  - Botão: "Testar conexão" (dispara evento de teste via API de relatórios)

- **Google Ads:**
  - Campos: Tag ID, Conversion Destination, Webhook Secret, Customer ID
  - Instruções: "No Google Ads → Tools → Conversions → Conversion Actions, configure o webhook com a URL acima e o secret exibido aqui."

- **TikTok:**
  - Campos: Pixel ID, Access Token (leitura), Advertiser ID
  - Instruções: "No TikTok Events Manager → Webhooks, configure a URL: `https://app.prismaplayer.online/api/webhooks/ads/tiktok`."

### 2. Dashboard de conversões recebidas
- **Local:** `/dashboard/analytics/[videoId]` (aba "Vendas Reportadas")
- **Exibição:**
  - Tabela: Data | Plataforma | Transaction ID | Valor | Moeda | Status
  - Filtros: plataforma, período, VSL
  - Gráfico: linha do tempo de conversões por plataforma

### 3. Badge de status na tela de integrações
- **Verificada:** última conversão recebida há menos de 24h
- **Aguardando:** integração configurada mas sem conversões recebidas ainda
- **Erro:** última tentativa de webhook falhou (exibir motivo)

## Segurança

### Isolamento multi-tenant (crítico)
1. **Nunca confiar no `user_id` do payload:** sempre derivar do `account_owner_id` da integração encontrada
2. **Filtro por `account_owner_id` em todas as queries:** `WHERE account_owner_id = :ownerId`
3. **Tokens de API de relatórios são diferentes de tokens de CAPI:** permissões de leitura (`ads_read`, `analytics.read`), não de envio
4. **Webhook secrets armazenados em `config` jsonb:** nunca expostos no client, nunca logados

### Validação de assinatura
- **Meta:** HMAC-SHA256 com `META_APP_SECRET` (env global)
- **Google:** HMAC-SHA256 com `webhookSecret` por integração (em `config`)
- **TikTok:** Access Token validado via API de autenticação

### Rate limit
- 120 req/min por provider (fail-closed)
- Burst protection: 10 req/s por IP

### Idempotência
- Dedup por `(video_id, transaction_id)` em `video_events`
- ON CONFLICT DO NOTHING no INSERT

## Critérios de aceite

1. Webhook Meta recebe evento de teste do Events Manager e grava em `video_events`
2. Webhook TikTok recebe evento de teste do Events Manager e grava em `video_events`
3. Webhook Google recebe evento de teste do Ads Console e grava em `video_events`
4. Conversão duplicada (mesmo `transaction_id`) não grava duas vezes
5. Integração de User A não recebe conversões do pixel de User B (teste de isolamento)
6. Dashboard exibe conversões recebidas com filtros por plataforma/período
7. Tokens de API nunca aparecem em logs ou responses
8. 435+ testes verdes, tsc 0, lint 0, build 0

## Fora de escopo (fase 2)

- Polling de API de relatórios (alternativa ao webhook)
- Webhooks de gateways de pagamento (Kiwify, Hotmart, etc.)
- Envio de eventos para as plataformas (CAPI server-side)
- Atribuição multi-touch (first-click, last-click, etc.)

## Validação

tsc 0 · 435+ testes sem regressão · lint 0 · build pelo Lead. Sem push. Sem tocar landing/pricing/auth/assets.