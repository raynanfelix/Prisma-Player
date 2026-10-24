# Neon Launch Audit — falling-cloud-45294262/prisma (24/10/2026, lançamento 27/10)

Auditores: agentes a2ff7b70/fc5ab014 (dados) + Lead (fechamento). Via: pg direto (produção) + CLI neon 8.8.0.

## VEREDITO: PRONTO pro lançamento, com 1 decisão sua e 2 ressalvas

A infraestrutura serve o lançamento: migrations 100% aplicadas, RLS DENY-BY-DEFAULT ativo (42/44), PITR padrão, compute sadio. Nenhuma mudança foi aplicada no banco por esta auditoria (regra: 3 dias do lançamento = conservação).

## 1. RLS — a verdade completa (achado central)

- RLS **habilitado em 42 de 44 tabelas** public.
- **ZERO policies no banco inteiro.** O papel `authenticated` **não existe** (roles reais: cloud_admin, neon_auth, neon_service, neon_superuser, neondb_owner).
- As CREATE POLICY do docs/neon-migration/neon-schema.sql **nunca foram executadas na produção**.
- Por que nada quebra: a app conecta como `neondb_owner`, que faz BYPASS de RLS (documentado no docs/SECURITY.md). A barreira real é o filtro accountOwnerId na camada de API, provado pela suíte BOLA (12 testes cross-tenant).
- RLS habilitado + zero policies = **DENY-ALL para qualquer papel não-owner** (fail-closed), que hoje é ninguém.

**DECISÃO DO DONO (a única bloqueante):**
- **Opção A (recomendada pós-lançamento)**: aplicar as policies documentadas + criar o papel `authenticated` em janela calma (pós-27) — casa o banco com o design documentado e prepara defesa em profundidade real pro futuro (RLS como segunda trincheira, descrito no SCALE_RUNBOOK).
- **Opção B (status quo, zero risco pro 27)**: manter DENY-BY-DEFAULT (mais restritivo que policies), documentado. A app é imune às duas.

## 2. Tabelas extras no banco (não estão no drizzle)

- `roadmap_tasks`: criada pela **frente kanban paralela DIRETO NA PRODUÇÃO** — confirmar se intencional; a frente ainda voa (não commitada por nós).
- `realtime_test`: resíduo de teste da infra Realtime — candidata a remoção pós-lançamento.
- `support_notes`: tem RLS mas não está no schema doc — verificar origem (possível tabela de operação interna legada).

## 3. Migrations: SEM drift ✓

Todas as tabelas do drizzle existem no banco (missing = 0, incluindo billing_churn_surveys e as do Stripe). Indexes críticos confirmados pelos agentes. Cron diário: `0 12 * * *` UTC = 09:00 BRT ✓.

## 4. PITR / history retention (GAP-10 LGPD, Art. 16)

Branch de produção com **janela padrão (7 dias)** de histórico/restauração. Custo de estender: proporcional ao armazenamento. Recomendação LGPD: manter 7 dias (suficiente pra rollback de lançamento) e **documentar no .lgpd/retention.md que o PITR retém dados eliminados por até 7 dias** (transparência Art. 9). Estender = sua decisão de custo, não urgente.

## 5. Compute / disponibilidade

Autoscaling **0.25 a 2 CU**, suspend timeout padrão (5 min idle), scale-to-zero ATIVO. Implicações pro lançamento: cold start ~500ms na primeira query após idle (cron 12:00 UTC incluído); tráfego até agora: 91MB transferidos (folga enorme). IP allowlist: aberto (padrão Neon+Vercel, credencial protege). **Recomendação**: manter; se cold starts incomodarem no dia, subir min CU pós-lançamento (decisão de custo no Console).

## 6. Retenção de eventos (GAP-3 LGPD, Art. 15)

O cron purga `video_events` antigos **SÓ se `VIDEO_EVENTS_RETENTION_DAYS` estiver definida na Vercel** — hoje NÃO está: purges OFF. Ato pós-lançamento: definir o prazo (proposta .lgpd/retention.md: 180 dias) e setar a env. Sem isso, eventos crescem sem limite (custo + Art. 15).

## CORRIGIDO POR MIM: nada (deliberado — den All é mais seguro que 100+ policies às vésperas)
## PRECISA DE VOCÊ
1. Opção A ou B de RLS (acima) — B é o status quo seguro pro dia 27
2. Confirmar `roadmap_tasks` na produção (frente kanban)
3. `VIDEO_EVENTS_RETENTION_DAYS` na Vercel pós-lançamento (180d sugerido)
4. (opcional) min CU no Console se cold starts pesarem
