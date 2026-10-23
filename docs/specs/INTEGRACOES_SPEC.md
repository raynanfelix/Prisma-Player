# Integrações — especificação de implementação (decisões do dono, 2026-10-17)

Fonte das decisões: dono (voz/texto). Este documento é o contrato de build. Nada aqui é "sugestão".

## Modelo de produto (definições do dono)

1. A Prisma **não é gateway** e não confirma vendas. O checkout do cliente confirma e dispara nos **pixels dele** (Facebook/Google/TikTok — pixel de browser e/ou CAPI do gateway dele).
2. A Prisma **só recebe/exibe** o que as plataformas confirmarem (vendas reportadas) — via conexões oficiais. **Em breve**: conexão OAuth de Meta/TikTok/Google Ads (roadmap: docs/metricas-ads-prompt-v2.md — o caminho crítico é a aprovação de app de cada plataforma).
3. **Integrações é o ÚNICO lugar** de configuração. Tudo que existe hoje em outros cantos **soma**:
   - Aba "Pixels" do studio → REMOVIDA por inteiro (module, PixelTrackingPanel, campos por-VSL)
   - Painéis inline de webhook no motor de Inteligência → REMOVIDOS, substituídos por telas próprias
4. **Vínculo pixel ↔ VSL flexível**: 1 pixel em N VSLs, N pixels em 1 VSL, ou qualquer combinação. No detalhe da integração, o cliente **seleciona as VSLs** alvo.
5. Toda integração tem **tela própria**: Configurações + Eventos + Histórico de Ações + Como funciona (padrão App Store adaptado ao design system Prisma: verde #B9FF66, escuro preto, PT-BR; sem copiar padrões de terceiros).

## Dados (Drizzle + SQL)

Tabela nova `account_integrations`:

```sql
CREATE TABLE IF NOT EXISTS "account_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_owner_id" text NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  "provider" text NOT NULL CHECK ("provider" in ('meta_pixel','google_ads','tiktok','utmify','discord','telegram')),
  "config" jsonb NOT NULL DEFAULT '{}',
  "vsl_ids" jsonb NOT NULL DEFAULT '[]',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "account_integrations_provider_owner_uidx" UNIQUE ("account_owner_id","provider")
);
ALTER TABLE public."account_integrations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_integrations_owner" ON public."account_integrations" FOR ALL TO authenticated USING ("account_owner_id" = auth.user_id()) WITH CHECK ("account_owner_id" = auth.user_id());
CREATE INDEX "account_integrations_owner_idx" ON "account_integrations" ("account_owner_id");
```

- `config` por provider: `meta_pixel` = {pixelId, accessToken, testEventCode}; `google_ads` = {tagId, conversionDestination}; `tiktok` = {pixelId}; `discord`/`telegram` = {webhookUrl}; `utmify` = {} (em breve).
- `vsl_ids` = array de IDs de VSL do dono (a página lista as VSLs dele para seleção — multi-select).
- UNIQUE (owner, provider): 1 integração por plataforma (reeditar em vez de duplicar; os 10 pixels do exemplo = 1 integração meta_pixel com N vsl_ids, ou várias contas). Drizzle: tabela + índices + RLS em drizzle/schema.ts E bloco idempotente em docs/neon-migration/neon-schema.sql; **o dono roda o SQL no Neon Console**.

## Telas (todas novas, do zero)

### 1. App Store — `/dashboard/integracoes` (sidebar: "Integrações", ícone Webhook, badge "Novo")
- Grade de cards por categoria: **Plataformas de anúncios** (Meta Pixel Ads, Google Ads, TikTok) e **Webhooks** (Discord, Telegram) + **UTMify** (Em breve).
- Card: logo (src/assets), nome, status (badge **Instalado** verde / botão **Instalar** / **Em breve** secundário), descrição curta, VSLs vinculadas ("3 VSLs conectadas").
- Busca por nome. Click → tela de detalhe.

### 2. Detalhe por integração (mesma rota, estado local ou /dashboard/integracoes/[provider])
- Header: logo, nome, descrição, badge de status, contagem de VSLs vinculadas.
- **Configurações** (campos por provider, ex. Meta Pixel Ads): Chave da API (pixel id), Access Token (CAPI), Test Event Code (opcional). Salvar → PUT na tabela.
- **Seleção de VSLs**: lista das VSLs do dono (fetch /api/videos) com multi-select (checkbox/switch); salvar grava `vsl_ids`.
- **Eventos**: "Pagamento Confirmado" · `payment.received` · "Disparado quando um pagamento é confirmado".
- **Histórico de Ações**: tabela Status | Evento | Data — v1 honesta: estado vazio "Nenhuma ação registrada" (log de entregas reais entra com as conexões reportadas).
- **Como funciona**: parágrafo + bullets (Purchase; valor+moeda; id do pedido; e-mail SHA256; dispositivo; permissão ads_management).
- Botões: "Testar conexão" (diagnóstico), "Cancelar"/"Salvar", "Remover integração" (destructive, com confirm).

## Backend

- `GET/PUT /api/integrations` e `GET/PUT /api/integrations/[provider]`: `guard`, queries por `accountOwnerId`, validação por provider (pixel id/token/tag — reusar regex de src/lib/player/pixels.ts), sanitização de config, rate limit.
- Resolução no EMBED (troca da fonte): player-loader + server-events + diagnostics passam a resolver por `account_integrations` (provider + vsl_ids contains videoId) — **fallback compatível**: VSL sem integração na tabela mas com pixels no config legado segue servindo (nada quebra antes da migração do dono).
- `server-events.ts`: tokens passam a vir da tabela (config do provider); env global vira fallback.

## Remoção (só DEPOIS da nova cadeia no ar)

- VslStudio: module "pixels" (linha ~123), entrada no ModuleId, dispatch (linha ~2027), PixelTrackingPanel.tsx, campos pixel do StudioConfig/initialConfig/normalize (mantidos SÓ como fallback legado do embed até migração).
- Motor de Inteligência: painéis inline de webhook substituídos por link "Configurar em Integrações".
- Logos movidas de uso: src/assets (facebook, google-ads, tiktok, utmify) passam a alimentar as telas novas.

## Critérios de aceite

1. Sidebar mostra "Integrações"; store com categorias/busca/badges corretos.
2. Meta Pixel Ads: instalar → configurar (3 campos) → selecionar VSLs (multi) → salvar persiste.
3. Embed de VSL vinculada dispara os eventos nos pixels da conta; VSL sem vínculo não dispara.
4. Fallback legado: VSL com config antiga continua funcionando.
5. 435+ testes verdes, tsc 0 (sem WIP de outras frentes), lint 0, build 0.
6. Nenhum arquivo da landing/pricing tocado. Sem push pelo implementador.
