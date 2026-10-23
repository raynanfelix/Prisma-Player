# Sprint 1 — Pixel Verdadeiro: verificação real Meta/Google/TikTok

Fonte: dono (17/10/2026). "Fazer as plataformas lançarem o evento pra gente — botão de verificar com resposta real, logo de 'evento recebido'. A maneira mais simples que tiver."

## O que é

Cada integração de anúncio (meta_pixel, google_ads, tiktok) ganha um botão **"Testar conexão"** que dispara um evento de teste REAL na API oficial da plataforma e mostra a resposta REAL:

- **Meta**: `POST graph.facebook.com/v21.0/{pixel_id}/events` com `test_event_code` + `access_token` → resposta `{ events_received: N, messages: [] }` → "✓ Meta recebeu N evento(s) de teste". Antes: `GET /{pixel_id}?access_token=` para confirmar que o pixel existe e pertence ao dono (erro 400/404 se ID inválido).
- **Google (GA4/G-tag)**: `POST google-analytics.com/debug/mp/collect?measurement_id=G-XXX&api_secret=SECRET` com payload de teste → resposta `{ validationResponse: { validationMessages: [] } }` = válido. Se o dono tem só AW- (Google Ads sem G-), validar formato e informar "tag de conversão configurada — Google Ads mostra o evento em até 3h" (honesto). Novo campo opcional: `apiSecret` (GA4 API secret, que o dono pega em Admin → Data Streams → Measurement Protocol).
- **TikTok**: `POST business-api.tiktok.com/open_api/v1.3/event/track/` com headers `Access-Token` + body `{ event_source: "web", event_id, page_url, ... }` → resposta `{ code: 0, message: "success" }` = recebido. Novo campo: `accessToken` (TikTok Events API token). Suporta `test_event_code`? Sim — incluir se preenchido.

## Backend

- Rota: `POST /api/integrations/verify` — body `{ provider, instanceId?, config }` (não salva nada; teste puro). `guard` + `csrfGuard` + rate limit `integrations-verify:{ownerId}` 10/min fail-closed.
- Módulo server-only `src/lib/integrations/verify-pixels.ts` com as 3 chamadas (fetch com timeout 8s, `cache: "no-store"`, tokens NUNCA logados). Entrada em tests/server-boundary.test.ts PRIVILEGED.
- Resposta padronizada: `{ ok: boolean, platform: "meta"|"google"|"tiktok", message: string, detail: string, receivedAt: ISO }` — `detail` traz o trecho da resposta real (ex.: `events_received: 1`).
- Quando o teste passa e a instância está salva: PUT com `config.lastVerifiedAt = now` + `config.lastVerifyOk = true` (o frontend chama o PUT normal após o verify ok) → o card/lista mostra "✓ Verificada" com data.

## Frontend (IntegrationDetail)

- Botão "Testar conexão" (secondary, ícone FlaskConical/CheckCircle2) ao lado de Salvar — visível para meta_pixel, google_ads, tiktok quando os campos mínimos estiverem preenchidos.
- Estados: testando (spinner) → sucesso: badge verde "✓ Evento recebido" + a mensagem da plataforma (ex.: "Meta confirmou: 1 evento recebido") → falha: mensagem honesta com o motivo REAL (token inválido / pixel não existe / secret errado).
- Na lista de instâncias e no card do marketplace: badge "Verificada" quando `config.lastVerifyOk` (com `lastVerifiedAt` curto "há 2h").

## Fora de escopo (fase 2 — outro sprint)

- Puxar insights da Meta (gasto/compras por anúncio via `act_{id}/insights`) — campo `adAccountId` e dashboard ROI por VSL.
- Google OAuth/Ads API real (developer token).
- TikTok Reporting API (app_id+secret).
- Webhook universal de gateways (filtro por produto).

## Validação

tsc 0 · 445/445 sem regressão · lint 0 · build pelo Lead. Sem push. Sem tocar landing/pricing/auth/assets.
