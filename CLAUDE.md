@AGENTS.md

# Prisma Player

O `AGENTS.md` (importado acima) é a fonte canônica de regras. Este arquivo é
apenas o mapa da realidade atual e dos docs vivos; regras de backend, frontend
e design não se repetem aqui.

## Realidade atual (23/10/2026)

- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4.
- Dados: Drizzle ORM sobre Postgres gerenciado Neon (Lakebase). Client `db` e
  schema em `src/lib/db`; migrations em `drizzle/` (aplicar exige
  `DATABASE_URL_UNPOOLED`).
- Auth: Neon Auth gerenciado (Managed Better Auth, sem MFA) via
  `@neondatabase/auth`; login com Google opcional.
- Storage: Cloudflare R2, único (multipart do navegador, URLs assinadas de
  curta duração, sem fallback de storage).
- Billing: Stripe Checkout hospedado (webhooks idempotentes, reconcile diário
  no cron, dunning com grace de 7 dias, churn survey). Overage de plays é
  informativo; fase 2 em `docs/specs/STRIPE_PHASE2_OVERAGE.md`.
- Analytics: PostHog + eventos próprios com rollup diário e retenção
  configurável.
- Testes: Vitest 5 (suíte offline, 632+). CI em `.github/workflows/verify.yml`:
  tsc, lint, vitest, quality gates, audit de deps e gate anti-sprawl (warn).
- ZERO Supabase e ZERO AbacatePay no produto: o legado histórico está só em
  `docs/archive/`.

## Mapa dos docs vivos

Fontes canônicas de interface (leia antes de criar ou modificar qualquer UI):
`docs/UI_ARCHITECTURE.md`, `docs/design.md`, `src/components/README.md`.

- `docs/ARCHITECTURE.md`: fronteiras, guard, checklist de nova funcionalidade.
- `docs/SECURITY.md`: isolamento, padrão de rotas, testes de segurança.
- `docs/quality.md`: checks de qualidade. `docs/onboarding.md`: preparação
  local. `docs/setup.md`: setup e evidências.
- `docs/neon-migration/`: ativação do Neon (DEPLOY, auth setup, schema SQL).
- `docs/CLOUDFLARE_R2.md`: storage de vídeo. `docs/SCALE_RUNBOOK.md`:
  gatilhos de escala e o plano da RLS real.
- `docs/videojs-integration.md`: player. `docs/MARKETING_ASSETS.md` e
  `docs/metricas-ads-prompt-v2.md`: marketing e métricas de anúncios.
- `docs/specs/`: specs de feature (índice próprio). Arquivo novo de feature
  exige spec aqui, referenciada na mensagem do commit.
- `docs/reports/`: relatórios e validações.
- `docs/archive/`: legado com índice próprio (não usar como instrução ativa).
- `.lgpd/`: pipeline LGPD (data map, base legal, retenção, DSAR, incidentes).
- `PRODUCT.md`: escopo do produto.

Preserve o trabalho local existente e não instale bibliotecas sem necessidade
concreta e verificada.
