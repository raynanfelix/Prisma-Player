# ROPA - Registro de Operações de Tratamento de Dados Pessoais

**Projeto**: Prisma Player · **Versão**: v1 - 23/10/2026 · **Fundamento**: **Art. 37 LGPD** (obrigatório para controlador e operador).
**Fonte**: consolidado do inventário real de código em [data-map.md](./data-map.md) (v1, 20/10/2026) e das bases em [legal-basis.md](./legal-basis.md) (v1, 20/10/2026). Atualizar este registro a cada nova atividade de tratamento.

## Identificação dos agentes

| Campo | Valor |
|---|---|
| Controlador (dados das contas) | Prisma / dono ([PREENCHER: RAZÃO SOCIAL + CNPJ], ver GAP-01) |
| Controlador (dados de espectadores das VSLs) | Cliente que publicou a VSL (a Prisma é operadora desses dados) |
| Operador | Prisma (software e infraestrutura) |
| Encarregado | Pendente de designação formal (Res. 18/2024); canal publicado: privacidade@prismaplayer.com.br + `/contact` |
| Classificação ATPP | Pendente de registro por escrito (Res. 2/2022); se enquadrado, prazos de titular em dobro (Art. 14) |

## Registro por atividade (Art. 37: finalidade, titulares, dados, compartilhamento, segurança, prazos)

### A001 - Conta e autenticação

| Campo | Valor |
|---|---|
| Finalidade | Criar e autenticar a conta do app (Art. 6º, I) |
| Base legal | Art. 7º, V - execução de contrato ([legal-basis](./legal-basis.md#conta-e-autenticação)) |
| Titulares | Usuários adultos do app (B2B) |
| Dados | E-mail, hash de senha (custody do Neon Auth), cookies de sessão |
| Sistemas | `neon_auth."user"`, `session`, `account` (schema gerenciado Better Auth) |
| Compartilhamento | Neon Auth / Neon Postgres (operadores) |
| Transferência intl. | Sim - Neon (região do projeto) |
| Segurança | TLS, rate limit nas rotas de auth, `security_events` de auditoria, reauth com senha na exclusão |
| Prazo | Até a exclusão da conta (cascade das sessões) |
| Alto risco (Res. 2/2022, Art. 4º) | Não |

### A002 - Perfil da conta

| Campo | Valor |
|---|---|
| Finalidade | Identificar o titular, contato e preferências de notificação |
| Base legal | Art. 7º, V ([legal-basis](./legal-basis.md#perfil-da-conta)) |
| Titulares | Usuários adultos |
| Dados | E-mail, nome completo, telefone, avatar, `stripe_customer_id`, preferências de e-mail, locale |
| Sistemas | `profiles` (Postgres) |
| Compartilhamento | Stripe (referência de customer); acesso do próprio titular e admin |
| Transferência intl. | Sim - Stripe |
| Segurança | Queries sempre por `userId` da sessão; guard CSRF nas rotas mutantes |
| Prazo | Até a exclusão da conta |
| Alto risco | Não |

### A003 - Equipes e convites

| Campo | Valor |
|---|---|
| Finalidade | Colaboração multiusuário com papéis na conta |
| Base legal | Membros: Art. 7º, V. Convite de terceiro: Art. 7º, IX + LIA ([legal-basis](./legal-basis.md#equipes-e-convites)) |
| Titulares | Usuários adultos; convidado é titular terceiro (só o e-mail é tratado) |
| Dados | E-mail do convidado, papel proposto, status, expiração (7 dias) |
| Sistemas | `account_teams`, `account_team_members`, `account_team_invites` |
| Compartilhamento | Nenhum externo além dos operadores de infra |
| Transferência intl. | Não (fora os operadores de DB) |
| Segurança | Sem envio de e-mail (convite fica pendente); expira em 7 dias; revogável |
| Prazo | Convite: 7 dias (cron `expireTeamInvites`). Membro: até exclusão. Pendência: convites por e-mail sobrevivem 7 dias à exclusão da conta (GAP-11) |
| Alto risco | Não |

### A004 - Assinaturas e pagamentos

| Campo | Valor |
|---|---|
| Finalidade | Executar assinatura paga e créditos IA (cobrança do contrato) |
| Base legal | Art. 7º, V ([legal-basis](./legal-basis.md#assinaturas-e-pagamentos)) |
| Titulares | Usuários adultos |
| Dados | `stripe_customer_id`, id de subscription, status, período, `receipt_url`, payloads de webhook (idempotência). Cartão/Pix ficam só na Stripe |
| Sistemas | `subscriptions`, `billing_checkouts`, `billing_customers`, `payment_webhook_events`, `ai_credit_ledger`, `ai_credit_wallets` |
| Compartilhamento | Stripe (operadora de pagamentos; controladora dos próprios registros) |
| Transferência intl. | Sim - Stripe |
| Segurança | Checkout hospedado (sem instrumento de pagamento em posse); webhook com verificação de assinatura e idempotência |
| Prazo | Até exclusão da conta; payload de webhook com scrub após piso de 7 dias (cron). Retenção fiscal de recibos: a decidir com contador (GAP-05, Art. 16) |
| Alto risco | Não (sem dado de cartão em posse) |

### A005 - Analytics de espectadores das VSLs (Prisma como OPERADORA; cliente controlador)

| Campo | Valor |
|---|---|
| Finalidade | Medir retenção, funil e conversão das VSLs para o cliente que as publicou |
| Base legal | Art. 7º, IX do CLIENTE controlador + LIA ([legal-basis](./legal-basis.md#analytics-de-espectadores)) |
| Titulares | Espectadores (terceiros; controle do cliente) |
| Dados | `session_id`, `viewer_id` (pseudônimos), `country_code`, device/os/browser, `page_url` + UTMs (truncado), tempo assistido, risco antifraude, transação de conversão, consentimento de publicidade. **IP não é persistido** |
| Sistemas | `video_events`, `video_live_sessions` (podadas em 10 min), `player_events`, rollups `video_daily_stats` |
| Compartilhamento | Nenhum além da infra; derivados só para o cliente dono da VSL |
| Transferência intl. | Não para esta tabela (dados ficam no Neon); ver A006 quando há publicidade |
| Segurança | Token HMAC de origem + rate limit no ingest; pseudonimização |
| Prazo | Purges OPT-IN com piso de 30 dias; **desligados por padrão** (GAP-03). Proposta: 180 dias ([retention.md](./retention.md)) |
| Alto risco | Não (dados pseudonimizados, sem IP). Revisar se `page_url` passar a carregar PII (GAP-12) |

### A006 - Publicidade e conversão (pixels server-side + client-side)

| Campo | Valor |
|---|---|
| Finalidade | Atribuir conversões de venda às campanhas do cliente |
| Base legal | Art. 7º, I - consentimento do espectador, banner opt-in do embed, revogável ([legal-basis](./legal-basis.md#publicidade-e-conversão)) |
| Titulares | Espectadores adultos |
| Dados | IP de peer confiável (transitório), user-agent, `event_source_url`, valor/moeda/id da transação |
| Sistemas | Envio direto a Meta CAPI, TikTok Events API, Google; na Prisma fica o `advertising_consent` + evento |
| Compartilhamento | Meta, TikTok, Google (em nome do CLIENTE controlador) |
| Transferência intl. | Sim - EUA (Art. 33; contratos/SCCs do lado do cliente, GAP-07) |
| Segurança | Gate duplo de consentimento (client e server, `src/lib/analytics/ingest.ts:303`); `denied` suprime |
| Prazo | No provedor de ads: regido por ele. Na Prisma: igual A005 |
| Alto risco | Não com consentimento; sem consentimento o envio não acontece (gate em código) |

### A007 - Product analytics (PostHog)

| Campo | Valor |
|---|---|
| Finalidade | Medir uso do produto (onboarding, upload, ativação de trial) para melhorá-lo |
| Base legal | Art. 7º, IX + LIA ([legal-basis](./legal-basis.md#product-analytics-posthog)) |
| Titulares | Usuários do app (não espectadores) |
| Dados | `user.id` + `email` no identify (GAP-04: remover e-mail), eventos de produto |
| Sistemas | PostHog Cloud (região do projeto: a verificar) |
| Compartilhamento | PostHog (operador internacional) |
| Transferência intl. | Sim (Art. 33; Res. 19/2024 Anexo II a adotar, GAP-04/GAP-07) |
| Segurança | Ativo só com `POSTHOG_KEY`; Noop caso contrário |
| Prazo | Regida pelo projeto PostHog (definir no painel: pendência GAP-04) |
| Alto risco | Não |

### A008 - Segurança e auditoria

| Campo | Valor |
|---|---|
| Finalidade | Prevenir fraude/abuso; registrar eventos de segurança (login, exclusão, suspensão) |
| Base legal | Art. 7º, IX ([legal-basis](./legal-basis.md#segurança-e-auditoria)) |
| Titulares | Usuários do app |
| Dados | `security_events`: user_id, event_type, metadata jsonb sanitizada; rate limit por IP em memória (não persistido) |
| Sistemas | `security_events` (Postgres) |
| Compartilhamento | Nenhum externo |
| Transferência intl. | Não (fora o DB gerenciado) |
| Segurança | Metadata sanitizada; escrita por rotas autenticadas; trilha preservada na exclusão de conta (pseudonimizada em `admin_audit_log`) |
| Prazo | Purge OPT-IN piso 30 dias (desligado: GAP-03). Proposta: 180 dias |
| Alto risco | Não |

### A009 - Créditos IA, inbox, suporte, relatórios

| Campo | Valor |
|---|---|
| Finalidade | Executar créditos IA, comunicar a conta, suporte, relatórios periódicos |
| Base legal | Art. 7º, V ([legal-basis](./legal-basis.md#créditos-ia-inbox-suporte-e-relatórios)) |
| Titulares | Usuários adultos |
| Dados | Carteira/ledger de créditos, mensagens de inbox, casos de suporte, e-mail de relatório escolhido pelo titular |
| Sistemas | `ai_credit_wallets`, `ai_credit_ledger`, `user_inbox`, `support_cases`, `intelligence_controls` |
| Compartilhamento | Resend (e-mail transacional) |
| Transferência intl. | Sim - Resend |
| Segurança | Queries por `userId` da sessão; guard nas rotas |
| Prazo | Até a exclusão da conta |
| Alto risco | Não |

### A010 - Conteúdo hospedado (vídeos)

| Campo | Valor |
|---|---|
| Finalidade | Hospedar e servir as VSLs do cliente |
| Base legal | Art. 7º, V ([legal-basis](./legal-basis.md#conteúdo-hospedado)) |
| Titulares | Cliente (autor do conteúdo); espectadores se o VÍDEO contiver dados pessoais (responsabilidade do cliente, repassar nos termos: GAP-09) |
| Dados | Arquivos de vídeo em R2 (`{ownerId}/video-{id}.mp4`); manifest do embed (config pública, sem PII) |
| Sistemas | Cloudflare R2; KV/Worker do embed (TTL 30s) |
| Compartilhamento | Cloudflare (armazenamento); CDN para espectadores |
| Transferência intl. | Sim - Cloudflare |
| Segurança | Upload autenticado por dono; URLs assinadas; DELETE da conta remove objetos R2 |
| Prazo | Até a exclusão da conta (objetos R2 removidos no fluxo de delete) |
| Alto risco | Não |

## Uso deste registro

- Nova feature que trata dado pessoal = nova linha aqui + entrada no data-map + base legal. Fluxo definido em `docs/ARCHITECTURE.md`.
- O ROPA é a peça que a fiscalização pede primeiro (**Art. 37**; Res. 31/2025 fase 1). Manter em Git, versionado.
