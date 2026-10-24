# RLS real aplicada na produção (Opção A) — relatório de aplicação

Data: 24/10/2026 (lançamento 27/10). Execução: DBA de segurança, conforme `docs/specs/NEON_RLS_REAL_SPEC.md` (decisão A do dono).
Acesso: pg via `node --env-file=.env.local` com scripts temp `.cjs` (removidos ao final), conexão UNPOOLED conforme skill `neon-postgres` (DDL e provas com SET ROLE exigem conexão direta, sem pooler).
Fonte das policies: `docs/neon-migration/neon-schema.sql` (seção RLS), aplicadas VERBATIM, uma transação por tabela, com log.

## 1. Resumo do que foi feito

1. Papel `authenticated` criado (NOLOGIN, não-super, sem BYPASSRLS), idempotente via bloco `DO` no catálogo.
2. GRANTs exatamente como o schema doc define: `USAGE` no schema `public`, `SELECT/INSERT/UPDATE/DELETE` em todas as tabelas de `public` e `ALTER DEFAULT PRIVILEGES` para tabelas futuras.
3. Mapeamento da função de claim (ver seção 4): criado o schema `auth` com `auth.user_id()`, lendo o claim de transação `app.claims.user_id` via `current_setting(..., true)`; sem claim retorna NULL e toda policy nega (deny-all, fail-closed, exatamente o comportamento que o spec determina).
4. As 126 policies do doc aplicadas em 36 tabelas, transacional por tabela, zero falhas. RLS permanece habilitado nas tabelas de sistema sem policy (deny por padrão).
5. Prova de fonte a fonte com `SET ROLE authenticated` a partir da sessão owner (membership com `SET TRUE`, `INHERIT FALSE`): deny-all sem claim, allow das próprias linhas e deny do outro tenant com claim simulado por transação.
6. Nenhuma tabela `neon_auth` foi tocada. Nenhum dado foi criado, alterado ou apagado (todas as provas rodaram em transações revertidas). Compute, PITR e código de app intocados.

## 2. Matriz antes/depois (contagem de policies por tabela)

Estado ANTES (matriz 24/10, antes da aplicação): papel `authenticated` não existia, 0 policies no banco inteiro, RLS habilitado em 42 de 44 tabelas, nenhum grant para o papel, nenhuma função de claim em nenhum schema.

Estado DEPOIS (matriz pós-aplicação): 126 policies, papel `authenticated` existente, grants aplicados, função de claim no schema `auth`.

| Tabela | RLS | Antes | Depois | Policies criadas (nomes) |
|---|---|---|---|---|
| profiles | on | 0 | 4 | select, insert, update, delete (dono: id) |
| video_folders | on | 0 | 4 | select, insert, update, delete |
| videos | on | 0 | 4 | select, insert, update, delete |
| player_configs | on | 0 | 4 | select, insert, update, delete |
| video_events | on | 0 | 4 | select, insert, update, delete |
| video_live_sessions | on | 0 | 4 | select, insert, update, delete |
| video_versions | on | 0 | 4 | select, insert, update, delete |
| ab_tests | on | 0 | 4 | select, insert, update, delete |
| ab_test_variants | on | 0 | 4 | select, insert, update, delete |
| ab_test_folders | on | 0 | 4 | select, insert, update, delete |
| account_access | on | 0 | 4 | select, insert, update, delete |
| account_security_settings | on | 0 | 4 | select, insert, update, delete |
| security_events | on | 0 | 4 | select, insert, update, delete |
| intelligence_controls | on | 0 | 4 | select, insert, update, delete |
| ai_analysis_jobs | on | 0 | 4 | select, insert, update, delete |
| ai_credit_wallets | on | 0 | 4 | select, insert, update, delete |
| ai_credit_checkouts | on | 0 | 4 | select, insert, update, delete |
| ai_credit_ledger | on | 0 | 4 | select, insert, update, delete |
| billing_customers | on | 0 | 4 | select, insert, update, delete |
| billing_checkouts | on | 0 | 4 | select, insert, update, delete |
| subscriptions | on | 0 | 4 | select, insert, update, delete |
| account_teams | on | 0 | 4 | select, insert, update, delete (dono: owner_id) |
| account_team_members | on | 0 | 4 | select, insert, update, delete |
| user_inbox | on | 0 | 4 | select, insert, update, delete |
| element_experiments | on | 0 | 4 | select, insert, update, delete |
| element_experiment_variants | on | 0 | 4 | select, insert, update, delete |
| embed_monitors | on | 0 | 4 | select, insert, update, delete |
| player_events | on | 0 | 4 | select, insert, update, delete |
| video_daily_stats | on | 0 | 4 | select, insert, update, delete |
| billing_churn_surveys | on | 0 | 2 | select, insert (append-only: sem policy de update/delete = deny) |
| support_cases | on | 0 | 3 | select, insert, update (user_id anulável via IS NOT DISTINCT FROM; sem delete) |
| account_integrations | on | 0 | 1 | account_integrations_owner (FOR ALL, dono: account_owner_id) |
| account_team_invites | on | 0 | 1 | select (accepted_by OU invited_by) |
| billing_plans | on | 0 | 1 | select (USING true, catálogo público autenticado) |
| conversion_templates | on | 0 | 1 | select (USING true) |
| ai_credit_products | on | 0 | 1 | select (USING true) |
| admin_audit_log | on | 0 | 0 | sem policy: deny por padrão (sistema) |
| payment_webhook_events | on | 0 | 0 | sem policy: deny por padrão (sistema) |
| rate_limits | on | 0 | 0 | sem policy: deny por padrão (sistema) |
| seo_targets | on | 0 | 0 | sem policy: deny por padrão (sistema) |
| visibility_checks | on | 0 | 0 | sem policy: deny por padrão (sistema) |
| support_notes | on | 0 | 0 | fora do doc de RLS: permanece deny por padrão |
| realtime_test | off | 0 | 0 | fora do doc; não tocada (resíduo de teste, ver seção 6) |
| roadmap_tasks | off | 0 | 0 | não tocada (WIP da frente kanban, ver seção 6) |

Total: 0 → 126 policies em 36 tabelas. Zero policies criadas com DROP de dados ou ALTER de colunas; apenas `DROP POLICY IF EXISTS` seguido de `CREATE POLICY`, como o doc define.

Nota sobre os casos especiais do spec: o texto do spec trocou os rótulos. No schema doc, quem é append-only (sem policy de update e delete) é `billing_churn_surveys` (comentário do doc: "a role authenticated não altera pesquisa registrada"), e `account_integrations` tem uma única policy `FOR ALL` amarrada a `account_owner_id`. Apliquei o doc (fonte canônica exigida pelo contrato), sem inventar policies.

## 3. Prova deny/allow com SET ROLE (fonte a fonte)

Sessão owner na UNPOOLED, `SET LOCAL ROLE authenticated` dentro de transação, todas revertidas. Dados reais da produção: `profiles` com 2 titulares (A e B), `video_events` com 30 linhas (todas do titular A), `rate_limits` com 2 linhas.

| Prova | Papel | Claim | Resultado esperado | Resultado real |
|---|---|---|---|---|
| P1 deny-all | authenticated | nenhum | ver 0 onde o owner vê tudo | profiles: 0 (owner vê 2); video_events: 0 (owner vê 30) |
| P2 allow próprio | authenticated | A (set_config por transação) | ver só as próprias linhas | profiles visíveis: 1 de 2; video_events do A: 30 |
| P2 deny outro tenant | authenticated | A | 0 linhas do titular B | profiles do B: 0; video_events do B: 0 |
| P3 sistema sem policy | authenticated | A | deny mesmo com identidade | rate_limits: 0 visível (owner vê 2) |
| Não regressão do app | neondb_owner (bypass) | n/a | owner continua lendo tudo | contagens como owner pós-apply: profiles 2, video_events 30 |

A prova confirma: deny-all para `authenticated` sem claim, allow restrito ao dono com claim, deny do outro tenant, deny por padrão em tabelas de sistema e o app (owner) 100% imune. Nenhum INSERT, UPDATE ou DELETE foi executado em nenhuma prova.

## 4. Mapeamento da função auth.user_id() (o que a plataforma dá hoje)

Verificação empírica ANTES da aplicação: não existe função `user_id()` em nenhum schema do banco (nem `auth`, nem `neon_auth`, nem `neon_authorization`); só existem os schemas `public` e `neon_auth`. As skills `neon-postgres` e `neon-auth` não descrevem claims injetados em conexão pg de app.

A doc oficial da Neon (guides/row-level-security e data-api/access-control, consultadas em 24/10) esclarece o desenho real da plataforma: quem fornece `auth.user_id()` (que extrai o claim `sub` do JWT) é o **Data API** (gateway PostgREST), que também faz o switch para o papel `authenticated`. Neste projeto o Data API não está habilitado, então a função não existe no banco.

Mapeamento aplicado e reportado, conforme o spec ("use o que a skill manda e reporte o mapeamento; se não existir claim em conexão de app, as policies seguem Deny-All pra authenticated"):

- `auth.user_id()` foi criada como função SQL `STABLE`, `search_path` fixado em `pg_catalog`, corpo `SELECT NULLIF(current_setting('app.claims.user_id', true), '')`.
- Sem claim na sessão, retorna NULL e todas as 123 policies owner-scoped avaliam falso: **deny-all**, o comportamento correto/seguro pedido pelo spec.
- O claim é definido por transação (`set_config('app.claims.user_id', '<id da sessão Better Auth>', true)`), mecanismo Postgres puro compatível com pooler em modo transação.
- As policies ficaram idênticas byte a byte ao schema doc, apontando para o nome oficial da plataforma (`auth.user_id()`). Quando o Data API for habilitado e a plataforma provisionar a função real, as policies passam a usá-la sem reescrita; se o provisionamento reclamar do schema `auth` pré-existente, basta remover o shim (`DROP FUNCTION auth.user_id(); DROP SCHEMA auth;`) e reabilitar, que a plataforma recria a função dela.
- Limitação honesta: o claim via GUC não é assinado como um JWT. A confiança vem de quem abre a sessão e define o claim (app servidor ou plataforma), o mesmo modelo de confiança do filtro `accountOwnerId` em produção hoje. Para clientes, o papel é NOLOGIN: ninguém conecta como `authenticated` sem passar pelo servidor.

## 5. Conexão do app hoje e caminho pós-lançamento (item 3)

- HOJE (mantido, sem refatorar): o app conecta como `neondb_owner` pela connection string POOLED (skill `neon-postgres`: app usa `DATABASE_URL` pooled; migrações e provas com SET usam `DATABASE_URL_UNPOOLED` direta). O owner tem BYPASSRLS (confirmado no catálogo) e toda query continua filtrando por `accountOwnerId` com a suíte BOLA (12 testes cross-tenant). As policies não mudam nada para o app, provado na seção 3.
- O que as skills dizem sobre conexão autenticada: a skill `neon-auth` define JWT EdDSA de 15 minutos SEM custom claims, servindo Neon Functions e Data API; não existe proxy de JWT para a connection string pg do app. A skill `neon` (pai) é explícita: o Data API é só para quem já usa PostgREST/cliente Supabase, e apoiar RLS no browser é fácil de errar. Apps Next consultam Postgres dos handlers ou Functions.
- Caminho oficial pós-lançamento (avaliar em janela calma, NÃO aplicar às vésperas):
  1. **Leituras autenticadas com RLS da plataforma**: habilitar o Data API (Auth já está ativo no projeto). A plataforma passa a validar JWT, trocar para o papel `authenticated` e fornecer `auth.user_id()` real; as 126 policies já aplicadas passam a valer nesse caminho sem alteração.
  2. **RLS como segunda trincheira no próprio app, sem trocar connection string**: o app mantém a conexão owner e pode, quando quiser defesa em profundidade real, executar leituras sensíveis em transação com `SET LOCAL ROLE authenticated` + claim por transação (o shim já suporta). Não há segunda connection string autenticada suportada pela Neon para app pg serverless; este é o modo suportado pelo Postgres/PgBouncer.
  3. Qualquer migração de leitura para o Data API no cliente fica sujeita ao alerta da skill (RLS no browser é fácil de errar) e à decisão do dono.

## 6. Riscos e pendências baratas (para o Lead e o dono)

1. **Tabelas sem RLS receberam grant**: o grant `ON ALL TABLES` do doc inclui `roadmap_tasks` e `realtime_test`, que estão SEM RLS. Hoje é inócuo (papel NOLOGIN, ninguém conecta como `authenticated`), mas se o Data API for habilitado, um JWT válido leria TODAS as linhas dessas duas tabelas. Recomendação pós-lançamento: habilitar RLS nelas (`roadmap_tasks` com a frente kanban, que é dona da tabela) ou aplicar REVOKE específico. `realtime_test` segue como candidata a remoção (resíduo de teste da infra Realtime, origem já reportada no NEON_LAUNCH_AUDIT).
2. **Sequences**: a doc oficial da Neon inclui `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated` para INSERTs com identity; o schema doc do repo não tem esse grant. Aplicado fielmente o doc; se o caminho Data API for adiante, adicionar o grant de sequences (uma linha).
3. **support_notes**: tem RLS e nenhuma policy no doc de RLS: continua deny para `authenticated` (correto). Origem já reportada: tabela de operação interna presente no schema doc (DDL) e ausente da seção de policies. Nada apagado.
4. **`VIDEO_EVENTS_RETENTION_DAYS`**: hoje NÃO definida na Vercel, então o cron NÃO purga `video_events` (GAP-3). Proposta do `.lgpd/retention.md`: 180 dias (piso de código: 30). Comando para o dono/Lead aplicar na Vercel: `vercel env add VIDEO_EVENTS_RETENTION_DAYS production` com valor `180`, seguido de novo deploy. Os demais purges (PLAYER_EVENTS_RETENTION_DAYS, SECURITY_EVENTS_RETENTION_DAYS, WEBHOOK_PAYLOAD_RETENTION_DAYS) seguem a mesma mecânica.
5. **membership de prova**: `GRANT authenticated TO neondb_owner WITH INHERIT FALSE, SET TRUE` foi aplicado (necessário para a prova SET ROLE). O owner não herda privilégios do papel (INHERIT FALSE); pode apenas assumir o papel. Faz parte do rollback, se desejado.
6. **PITR**: janela padrão de 7 dias confirmada (não alterada, por regra). Nota de transparência LGPD registrada em `.lgpd/retention.md` (eliminados retidos por até 7 dias no histórico).

## 7. Rollback (instantâneo, 1 linha)

Na conexão UNPOOLED, executar: `SELECT 'DROP POLICY IF EXISTS "' || policyname || '" ON public."' || tablename || '";' FROM pg_policies WHERE schemaname='public';` e rodar o resultado, seguido de `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated; REVOKE USAGE ON SCHEMA public FROM authenticated; GRANT authenticated TO CURRENT_USER; REVOKE authenticated FROM neondb_owner;` e, se quiser reverter ao estado original completo, `DROP ROLE authenticated;` e `DROP FUNCTION auth.user_id(); DROP SCHEMA auth;`.

Estado original (deny por padrão, sem policies) é totalmente restaurável; nada no rollback toca dados.

## 8. Veredito de lançamento

APTO para 27/10. O banco agora casa com o design documentado (Opção A do dono): papel `authenticated` + 126 policies + deny por padrão, provado de fonte a fonte. O app conecta como owner com BYPASSRLS e não sofreu nenhuma mudança de comportamento (contagens pós-apply idênticas). O comportamento para qualquer conexão não-owner é deny-all até existir claim, fail-closed. Pendências do item 6 não bloqueiam o lançamento: são atos pós-lançamento de custo baixo e decisão do dono.
