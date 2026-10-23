# Runbook de Escala — Prisma Player

Operacional, curto e com gatilhos numéricos. Cada seção: QUANDO ativar, o que
JÁ existe no código, os PASSOS e como REVERTER. Referências profundas nos
docs citados.

## (a) Cloudflare na frente — gatilho: >1M plays/mês

**Já existe** (Fase 1 no ar): Worker `prisma-embed-cache` com cache KV do
manifest (TTL 30s), rate limit por IP na borda e endpoint de purge —
`docs/archive/CONFIGURACAO_COMPLETA.md`, `docs/archive/SYSTEM_DESIGN_SCALE.md` §Fase 1.
O que falta no gatilho é só colocar o Worker na frente do tráfego público.

**Gatilhos (dashboard admin + Cloudflare Analytics):**
- plays/mês passando de ~1M, OU latência de manifest subindo, OU custo de
  function invocations da Vercel crescendo linearmente com plays.

**Passos:**
1. Roteamento DNS apontando o domínio/embed para o Worker — passo a passo e
   verificação em `docs/archive/CONFIGURACAO_COMPLETA.md` §"Roteamento DNS".
2. Confirmar `CLOUDFLARE_PURGE_URL` na Vercel (já documentado) e o secret do
   `/__purge` no Worker (Bearer; comparado em tempo constante).
3. Validar cache: `x-prisma-cache: MISS` → `HIT` na 2ª chamada; hit ratio
   KV ≥ 90% (Cloudflare Analytics). Sem HIT, ver troubleshooting do doc.
4. Ajustar o rate limit da borda por volume real (429 exagerado = tuning).
5. Observar por 48h: egress R2, invocations Vercel, erros 5xx do Worker.

**Reverter:** tirar o roteamento DNS (o Worker continua de pé, fora do
caminho). O app nunca depende dele para corretude — é cache e shield.

## (b) Rollups de analytics — gatilho: >10M eventos/mês

**Já existe:** `video_daily_stats` + rollup diário idempotente do cron
(`rollupDailyStats`, últimos 7 dias, `src/lib/cron-tasks/tasks.ts`) e
recomendação P0-1 em `docs/archive/supabase-audit/recommendations.md`.

**Realidade honesta:** NENHUMA query lê o rollup hoje — todos os consumidores
ainda varrem `video_events` cru (13 call sites: `getAccountPlan`/quota,
realtime, benchmark, conversions, live-logs, listagem de vídeos, overview,
diagnóstico de pixels, admin content/users).

**Passos (ordem de valor):**
1. Migrar leituras de PERÍODO para `video_daily_stats`: overview do painel
   (`src/app/api/account/overview/route.ts`), conversões
   (`src/app/dashboard/conversions/page.tsx`), benchmark
   (`src/lib/intelligence/benchmark.ts`) e contagens do admin.
2. Manter no evento cru apenas o que é intra-diário ou granular:
   mapa ao vivo, heatmap/curva de retenção, live-logs, realtime
   (`src/lib/realtime/server.ts`) e quota do mês corrente.
3. Ligar purges de retenção (env `VIDEO_EVENTS_RETENTION_DAYS`,
   piso 30 dias — recomendação 12–24 meses) e acompanhar o tamanho da
   tabela; se >10 GB, considerar particionamento por mês
   (próximo degrau do `docs/archive/supabase-audit/README.md` P0).
4. Acima de ~50k eventos/s de pico, o design-alvo é fila: Worker → queue →
   consumidores (`docs/archive/SYSTEM_DESIGN_SCALE.md` §Eventos) — não fazer antes
   do gatilho.

**Reverter:** cada query migrada volta a ler `video_events` independentemente
(migração é por call site, sem flag global).

## (c) Overage de plays com Metronome — gatilho: contas estourando `included_plays`

Spec completa: `docs/specs/STRIPE_PHASE2_OVERAGE.md` (decisão de 19/10/2026). Resumo
operacional:

1. **Abrir a conta**: Metronome (app.metronome.com) — plano com Stripe
   Subscriptions integration habilitada.
2. **O que conecta onde**: customer Metronome criado com o
   `profiles.stripe_customer_id` (já gravado no primeiro webhook); meterar
   plays a partir de `getMonthPlaysUsed` (fonte que já existe); o Metronome
   empurra a fatura de uso para o MESMO Customer Stripe — checkout e portal
   que já funcionam não mudam.
3. **Regras travadas**: plano flat PERMANECE na subscription atual; nunca
   Billing Meters; nunca meterar dentro de `items` metered; não
   cancelar/recriar a subscription ao adicionar uso.
4. **Gatilho para começar**: frequência real de contas passando do
   `included_plays` que compense a operacionalização — medir no admin antes
   (hoje o excedente é informativo e o dono decide case a case).

**Reverter:** parar de meterar (a fatura de uso para de compor; a
subscription flat segue intacta — por isso o padrão Metronome+Stripe).

## (d) RLS real no Postgres — por que AINDA não

**Por que não agora:**
1. Policies precisam ser validadas contra o **JWT real de produção** do Neon
   Auth (Managed Better Auth) — claims, algoritmo e `sub` precisam casar com
   o que o pool da app envia; erro aqui é **lockout de clientes em produção**.
2. A trincheira principal já está coberta em código: TODA query filtra por
   `accountOwnerId` da sessão (`guard` + revisão de SECURITY.md) e a suíte
   BOLA (`tests/bola-cross-tenant.test.ts`, fake-db que AVALIA o where
   compilado) reprova sozinha qualquer rota que esqueça o filtro.
   RLS seria defesa-em-profundidade, não a primeira barreira.
3. Custom claims de papel/equipe vivem no contexto de sessão da app
   (`team-context`), não no token — policies por papel exigiriam modelar isso
   no JWT primeiro.

**Passo a passo quando decidir:**
1. Capturar um JWT REAL de produção (sessão normal) e documentar os claims
   (`sub`, exp, algoritmo de assinatura, JWKS do projeto Neon).
2. Escrever policies por tabela no BRANCH Neon de staging: `user_id =
   auth.jwt() ->> 'sub'` nas tabelas de conta (videos, player_configs,
   subscriptions, ...), validando contra o token real — nunca contra
   suposições.
3. Rodar a suíte BOLA contra o banco COM RLS ligado (hoje ela valida o
   where da app; acrescentar harness que conecta como usuário real).
4. Canário: habilitar RLS numa tabela de baixo risco (ex. `video_folders`)
   e observar 48h; depois as demais, em lotes.
5. Manter os filtros da app (defesa em profundidade) e o `tests/server-boundary`.
6. **Reverter:** `DROP POLICY`/`DISABLE ROW LEVEL SECURITY` por tabela —
   instantâneo, sem deploy.

## Sinais gerais (qualquer seção)

- Neon: conexões ativas > 80% do limite → POOLED URL + `attachDatabasePool`.
- Vercel: erros 5xx + latência p95 por rota no dashboard.
- Cron: `success: false` no JSON de `/api/cron` (campo `errors` nomeia a
  etapa; `reconcileDivergences` > 0 = conferir divergências no admin).
- Alertas operacionais: `ALERT_WEBHOOK_URL` (canal do dono) — webhook Stripe
  failed, checkout falhou, disputa, reconcile divergente.
