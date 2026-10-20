# Serviço Impecável — spec final (19/10/2026)

Fonte: dono — "construa já o que ficou pendente, melhor qualidade possível". Itens na ordem de valor. Valide tsc+vitest após cada item.

## 1. Vitest 5 (fecha o último critical dev, CI fica 100% verde)
`npm i -D vitest@^5` + ajustar quebras (API de config mudou: workers/config; fakes). Suíte atual: 508 testes em 45 arquivos — meta: TUDO verde no v5. Se após 2 horas de tentativa persistirem quebras estruturais profundas: REVERTA o lockfile e reporte (não deixe o repo quebrado). package.json + lock commitados juntos.

## 2. Job de reconciliação Stripe↔banco (o cinto de segurança de escala)
`src/lib/billing/stripe/reconcile.ts` (server-only + PRIVILEGED + regex boundary): `reconcileSubscriptions()` — lista subscriptions ativas/canceled do Stripe (auto-pagination, cap 200) → para cada, confere a linha local (subscriptions por provider_subscription_id): estados divergentes (Stripe active + local cancelled, ou inverso; period_end dessincronizado >2 dias) → NÃO corrige sozinho (decisão humana): grava `payment_webhook_events` com provider='stripe', event_id=`reconcile:{date}:{sub_id}` (status received, processing_error com o diff) + `alertOperations({kind:"reconcile", title:"Assinatura divergente", detail: sub X stripe=A local=B})`. Cron: adicionar a task em `src/lib/cron-tasks/tasks.ts` (padrão das existentes) rodando 1×/dia. Testes: fake stripe + fake-db (divergência ativa↔cancelled gera alerta; igual não gera; idempotente por event_id).

## 3. Toggle mensal/anual na página de Planos do app
`src/app/dashboard/billing/page.tsx` (o fixes-agent pode ter tocado o card do trial — rebase): toggle pill (padrão do PricingSection da landing: pill suave, ativo verde-lima) acima da vitrine; estado mensal/anual muda o preço exibido (formatBRL de CATALOG_PLANS: mensal amount_cents, anual = amount_cents do ANUAL... CATALOG_PLANS tem só mensal — adicionar `annual_amount_cents` (53880/117480/275880) + `annual_monthly_equivalent` (4490/9790/22990) e a label "cobrado R$ X à vista/ano — economize 34%") e os botões enviam `billing: "monthly"|"annual"` pra /api/billing/checkout (a rota já aceita). Client component pequeno (BillingCheckoutButtons já existe — estender ou novo BillingCycleToggle).

## 4. UI de Time (entrega o plano Escala)
Backend EXISTE (/api/account/team: POST convite por email, PATCH papel, DELETE membro; BOLA suite já cobre posse). Construir em Configurações: aba "Equipe" — listar membros (nome/email/papel/status do convite), campo de email + botão Convidar, mudar papel (owner/member), remover. Limite por plano (teamSeats 1/3/10): acima do limite → mensagem honesta "Seu plano permite N assentos — faça upgrade". Verificar como /api/account/team responde (ler a rota primeiro) e refletir os status de convite reais. Estilo shadcn Prisma (cards brancos, verde-lima, pills).

## 5. LGPD formal (pipeline das skills, aplicado ao código real)
Gere com base em GREP REAL do código (não invente):
- `.lgpd/data-map.md`: cada dado pessoal coletado (email, full_name, page_url do espectador, viewer_id, IP/country_code nos video_events, session_id, stripe_customer_id, posthog ids) — campo, tabela, finalidade, retenção (ver docs/SECURITY.md se existir policy), quem acessa.
- `.lgpd/legal-basis.md`: Art. 7/V/VI ou Art. 11 por atividade (execução de contrato p/ conta; legítimo interesse p/ analytics agregados; consentimento p/ publicidade — o banner opt-in já existe no embed).
- Verificar DSAR: /api/account/export existe? (rota listada no build) — se existe, referenciar; se o export não cobre tudo, listar gap honesto.
Não gere política de privacidade (checkpoint skill exige revisão jurídica) — só os dois documentos técnicos.

## 6. Runbooks de escala (docs/SCALE_RUNBOOK.md)
Curto e operacional: (a) quando ativar Cloudflare na frente (>1M plays/mês) — passos; (b) quando rollups de analytics (>10M eventos/mês — video_daily_stats já existe, plano de migração das queries); (c) overage Metronome — como abrir a conta e o que conecta onde (STRIPE_PHASE2_OVERAGE.md já tem a spec, referencie); (d) RLS real: POR QUE ainda não (exige validar policies contra JWT real de produção — risco de lockout; a suíte BOLA cobre a trincheira principal) e o passo a passo pra quando decidir.

## Regras
- NÃO toque: features/landing-page, auth, assets, .github (CI novo está ok), lib/integrations, api/integrations (outro agente voou ali).
- O fixes-agent 0d8d1852 mexe em billing/page.tsx e admin — vocês podem colidir: antes de editar billing/page.tsx, git status pra ver se ele terminou; se o arquivo tiver mudanças suas E dele, rebase com cuidado (o dele: card do trial + admin; o seu: toggle anual).
- PowerShell Set-Content PROIBIDO com acentos. tsc 0 + vitest (508+; v5 target) + eslint 0 após TUDO. Build NÃO. Push NÃO.
- RESPOSTA FINAL: por item — feito/decisões/testes; se vitest 5 falhar, o relatório do revert.
