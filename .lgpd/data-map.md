# Mapa de Dados — Prisma Player

**Versão**: v1 — gerado em 20/10/2026 por inventário reverso do código (grep real; toda linha abaixo cita o arquivo de origem).
**Owner global**: Dono da Prisma (controlador). Em atividades de espectadores, o CLIENTE é o controlador e a Prisma é operadora.
**Escopo**: este documento é técnico — não substitui política de privacidade nem revisão jurídica.

## Papéis que aparecem em todas as atividades

| Papel | Quem |
|---|---|
| Controlador (contas) | Prisma / dono |
| Controlador (dados de espectadores de VSLs) | Cliente que publicou a VSL |
| Operadora | Prisma (infra e software) |
| Operadores externos | Neon/Lakebase (Postgres), Neon Auth (Managed Better Auth), Stripe, Cloudflare R2 (+ Worker/KV do embed), PostHog Cloud, Resend, Meta (CAPI/pixel), TikTok (Events API/pixel), Google (tag client-side) |

## Atividades de Tratamento

### A001 — Conta e autenticação

| Campo | Valor |
|---|---|
| Finalidade | Criar e autenticar a conta do usuário do app |
| Base legal | Art. 7º, V ([A001](./legal-basis.md#conta-e-autenticação)) |
| Titulares | Usuários adultos (produto B2B de marketing; sem fluxo para menores) |
| Dados | e-mail, senha (hash — custody do Neon Auth), sessões (cookies) |
| Fonte | Coletado do titular no signup/login (`src/services/auth/client.ts`) |
| Sistemas | `neon_auth."user"`, `session`/`account` (schema gerenciado do Better Auth); exclusão via `DELETE FROM neon_auth."user"` (`src/app/api/account/delete/route.ts:141`) |
| Operadores | Neon Auth (Managed Better Auth), Neon Postgres |
| Transferência intl. | Sim — Neon (região do projeto) |
| Retenção | Até a exclusão da conta (cascade ON DELETE das sessões) |
| Segurança | TLS, rate limit nas rotas de auth, `security_events` de auditoria |
| Alto risco? | Não |
| Owner | Dono |

### A002 — Perfil da conta

| Campo | Valor |
|---|---|
| Finalidade | Identificar o titular, contato e preferências de notificação |
| Base legal | Art. 7º, V ([A002](./legal-basis.md#perfil-da-conta)) |
| Titulares | Usuários adultos |
| Dados | `email`, `full_name`, `phone`, `avatar_url`, `stripe_customer_id`, preferências de e-mail (`drizzle/schema.ts:61-69` — `profiles`) |
| Fonte | Coletado do titular (formulário de perfil, `src/app/api/account/profile/route.ts`) |
| Sistemas | `profiles` (Postgres) |
| Operadores | Neon Postgres; `stripe_customer_id` referencia registro na Stripe |
| Retenção | Até a exclusão da conta |
| Quem acessa | O próprio titular, dono/admin da equipe, admin Prisma |
| Alto risco? | Não |

### A003 — Equipes e convites

| Campo | Valor |
|---|---|
| Finalidade | Colaboração multiusuário e concessão de papéis na conta |
| Base legal | Membros: Art. 7º, V. Convite de terceiro: Art. 7º, IX + LIA ([A003](./legal-basis.md#equipes-e-convites)) |
| Titulares | Usuários adultos; CONVIDADO é titular terceiro (só o e-mail é tratado) |
| Dados | `account_team_invites.email`, papel proposto, status, `expires_at` (7 dias) — `drizzle/schema.ts:1071-1083`; `account_team_members` (user_id, papel, status) |
| Fonte | E-mail digitado pelo invitante (dado do titular convidado, não coletado dele) |
| Sistemas | `account_teams`, `account_team_members`, `account_team_invites` |
| Particularidade honesta | NÃO há envio de e-mail: o convite fica pendente e aparece para quem criar conta com esse e-mail (`src/lib/account/team.ts:378-388`) |
| Retenção | Convite expira em 7 dias (`expiresAt` + sweep do cron `src/lib/cron-tasks/tasks.ts` `expireTeamInvites`); membros até exclusão |
| Alto risco? | Não (7 dias, mínimo, revogável) |

### A004 — Assinaturas e pagamentos

| Campo | Valor |
|---|---|
| Finalidade | Executar a assinatura paga (plano mensal/anual) e créditos IA |
| Base legal | Art. 7º, V ([A004](./legal-basis.md#assinaturas-e-pagamentos)) |
| Titulares | Usuários adultos |
| Dados | `profiles.stripe_customer_id`, `subscriptions` (provider_subscription_id, status, período), `billing_checkouts.receipt_url`, payloads de eventos em `payment_webhook_events.payload` (`drizzle/schema.ts:808-869`). Cartão/Pix NUNCA tocam a Prisma — ficam na Stripe (Checkout hospedado) |
| Fonte | Coletado do titular no checkout; eventos chegam por webhook |
| Sistemas | `subscriptions`, `billing_checkouts`, `payment_webhook_events`, `ai_credit_ledger` |
| Operadores | Stripe (customer/subscription/invoice) |
| Transferência intl. | Sim — Stripe |
| Retenção | Assinatura/ledger: até exclusão da conta. `payment_webhook_events.payload`: scrub do blob após piso de 7 dias (`WEBHOOK_PAYLOAD_RETENTION_DAYS`, cron `scrubOldWebhookPayloads`) |
| Alto risco? | Não (sem dado de cartão em posse) |

### A005 — Analytics de espectadores das VSLs

| Campo | Valor |
|---|---|
| Finalidade | Medir retenção, funil e conversão das VSLs para o cliente que as publicou |
| Base legal | Art. 7º, IX + LIA do CLIENTE controlador ([A005](./legal-basis.md#analytics-de-espectadores)) |
| Titulares | ESPECTADORES (terceiros; controle do cliente) |
| Dados | `session_id` (uuid), `viewer_id` (pseudônimo de atribuição), `country_code` (2 letras), device/os/browser, `page_url` (com UTMs), `traffic_source`, `campaign_id/creative_id/ad_id`, `watched_seconds`, `risk_score/reasons`, `transaction_id`/valor de conversão, `advertising_consent` — `drizzle/schema.ts:186-286`; sessões ativas em `video_live_sessions` (podadas após 10 min, cron) |
| IP | **NÃO é persistido** — audit e ingest confirmam (`src/lib/analytics/ingest.ts:149-157`: só headers confiáveis de plataforma, usados transitoriamente para o CAPI; `country_code` vem de header de país, `normalizedCountry`) |
| Fonte | Observado do espectador no embed (`/api/analytics-events`, token por sessão) |
| Sistemas | `video_events`, `video_live_sessions`, `player_events` (A/B), rollups em `video_daily_stats` (agregado) |
| Retenção | Purges OPT-IN por env com piso de 30 dias (`VIDEO_EVENTS_RETENTION_DAYS`, `PLAYER_EVENTS_RETENTION_DAYS`, `WEBHOOK_PAYLOAD_RETENTION_DAYS` — `src/lib/cron-tasks/tasks.ts:215-301`); **política formal de retenção ainda não definida — pendência** |
| Quem acessa | Cliente dono da VSL (analytics), Prisma (ops/cron), admin |
| Alto risco? | Não — dados de navegação pseudonimizados, sem IP armazenado. Flag para revisão se `page_url` passar a carregar e-mails/ids de lead em query string (hoje truncado a 1000 chars e sem parser de PII) |

### A006 — Publicidade e conversão (pixels server-side + client-side)

| Campo | Valor |
|---|---|
| Finalidade | Atribuir conversões de venda às campanhas de anúncio do cliente |
| Base legal | Art. 7º, I — consentimento do espectador ([A006](./legal-basis.md#publicidade-e-conversão)) |
| Titulares | Espectadores adultos |
| Dados | `client_ip_address` (peer confiável da plataforma), `client_user_agent`, `event_source_url`, valor/moeda/`transaction_id` → Meta CAPI e TikTok Events API (`src/services/ads/server-events.ts:52-79`). Client-side: pixels Meta/TikTok/Google no embed |
| Consentimento | Banner opt-in do embed, estado em `localStorage['prisma-player:advertising-consent:v1']`, eventos só saem com `granted`; `denied` suprime; revogável (`setConsent`/`resetConsent` — `src/app/api/player-loader/[id]/route.ts:58-80`). Server-side também gated: `if (event.advertisingConsent)` (`src/lib/analytics/ingest.ts:303`) |
| Transferência intl. | Sim — Meta (US), TikTok, Google |
| Retenção | Regida pelos provedores (Meta/TikTok/Google) após o envio; na Prisma fica só o `advertising_consent` + evento em `video_events` |
| Alto risco? | Não com consentimento; SEM consentimento o envio não acontece (gate em código) |

### A007 — Product analytics (PostHog)

| Campo | Valor |
|---|---|
| Finalidade | Medir uso do produto (onboarding, upload, ativação de trial) para melhorá-lo |
| Base legal | Art. 7º, IX + LIA ([A007](./legal-basis.md#product-analytics-posthog)) |
| Titulares | Usuários do app (não espectadores) |
| Dados | `posthog.identify(user.id, { email })` em login/signup (`src/services/auth/client.ts:31,51`); eventos de produto (`video_upload_completed` com nome/tamanho de arquivo, `trial_activated`); server-side `posthog-node` em rotas (`src/lib/posthog-server.ts`, `src/lib/security/auth-events.ts`); cookie/localStorage do SDK no navegador |
| Fonte | Observado no uso + identificadores da própria conta |
| Transferência intl. | Sim — PostHog Cloud (região do projeto — **verificar instância: pendência**) |
| Ativo quando | `POSTHOG_KEY` configurada (Noop caso contrário) |
| Retenção | Regida pelo projeto PostHog (**definir prazo no painel — pendência**) |
| Alto risco? | Não |

### A008 — Segurança e auditoria

| Campo | Valor |
|---|---|
| Finalidade | Prevenir fraude/abuso, registrar eventos de segurança (login, exclusão, suspensão) |
| Base legal | Art. 7º, IX ([A008](./legal-basis.md#segurança-e-auditoria)) |
| Titulares | Usuários do app |
| Dados | `security_events` (user_id, event_type, metadata jsonb sanitizado — `drizzle/schema.ts:164-174`); rate limiting por IP (em memória, não persistido) |
| Retenção | Purge OPT-IN `SECURITY_EVENTS_RETENTION_DAYS` (piso 30 dias, default off) |
| Alto risco? | Não |

### A009 — Créditos IA, inbox, suporte, relatórios

| Campo | Valor |
|---|---|
| Finalidade | Executar créditos de IA, comunicar a conta, atender suporte, enviar relatórios |
| Base legal | Art. 7º, V ([A009](./legal-basis.md#créditos-ia-inbox-suporte-e-relatórios)) |
| Dados | `ai_credit_wallets`/`ai_credit_ledger` (userId, saldo, referência de compra); `user_inbox` (mensagens do sistema); `support_cases` (mensagens do usuário); `intelligence_controls.report_email` (e-mail escolhido pelo titular para relatórios) |
| Operadores | Resend (`api.resend.com`, `src/lib/email/operational-report.ts:16`) — transferência intl. |
| Retenção | Até exclusão da conta (`support_cases`, inbox, ledger, controls listados no DELETE da conta) |

### A010 — Conteúdo hospedado (vídeos)

| Campo | Valor |
|---|---|
| Finalidade | Hospedar e servir as VSLs do cliente |
| Base legal | Art. 7º, V |
| Titulares | Cliente (autor do conteúdo); espectadores se o VÍDEO em si contiver dados pessoais (responsabilidade do cliente — incluir nos termos) |
| Dados | Arquivos de vídeo em Cloudflare R2 (`{ownerId}/video-{id}.mp4`); manifest do embed cacheado em Cloudflare KV/Worker (TTL 30s, contém config pública, sem PII de espectador) |
| Retenção | Até exclusão (DELETE da conta remove objetos R2 — `deleteR2Object`) |

## DSAR — direitos do titular (Art. 18) — estado REAL do código

| Direito | Implementação | Cobertura e gaps honestos |
|---|---|---|
| Acesso/portabilidade (V) | `GET /api/account/export` (`src/app/api/account/export/route.ts`) | Exporta profile (email/nome/telefone/stripe_customer_id), access/trial, assinatura, controles, créditos+ledger, vídeos (metadados), pastas, players, inbox, security_events (tipo+data). **Gaps:** não exporta `account_team_members`/`account_team_invites` (participação e convites da pessoa), `billing_checkouts`, e dados enviados à PostHog/Stripe (terceiros — titular deve pedir direto). Eventos de ESPECTADORES não entram **por design** (titular é terceiro; cliente é controlador — comentário no próprio arquivo) |
| Correção (III) | `PATCH /api/account/profile` | Nome, telefone, locale, notificações |
| Eliminação (VI) | `POST /api/account/delete` (confirm "EXCLUIR") | Completo: R2 + todas as tabelas + `neon_auth."user"` (`src/app/api/account/delete/route.ts:100-141`). **Gap:** não cancela a assinatura ATIVA na Stripe antes de apagar a linha local — apagar conta com assinatura viva deixa a cobrança rodando (**pendência funcional**) |
| Revogação de consentimento | Player: `PrismaPlayer.setConsent(false)` / `resetConsent()` (localStorage `prisma-player:advertising-consent:v1`); app: preferências de e-mail no perfil | Pixels server-side leem o consentimento POR EVENTO de conversão |
| Info sobre compartilhamento (IV) | Este documento | — |

## Pendências honestas (fora do escopo "2 documentos técnicos")

1. **Política formal de retenção** para `video_events`/`player_events`/`security_events` — os purges existem no cron mas são OPT-IN por env e estão desligados por padrão; definir prazos e ligar (recomendação existente: 12–24 meses, `docs/supabase-audit/recommendations.md` P1-6).
2. **PostHog**: definir região de processamento e prazo de retenção no painel; considerar remover o `email` do `identify` (não é necessário para analytics de produto).
3. **Exclusão de conta com assinatura Stripe ativa**: cancelar a subscription no provedor antes do wipe local.
4. **Export**: incluir team members/invites.
5. Política de privacidade — checkpoint que exige revisão jurídica (fora do escopo aqui).
