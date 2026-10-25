# RLS real de produção — spec (24/10/2026, decisão A do dono, lançamento 27/10)

DONO ESCOLHEU: Opção A — papel `authenticated` + TODAS as policies documentadas aplicadas na produção, banco "redondo" ponta a ponta. VALENDO: produção a 3 dias do lançamento; app TEM que continuar funcionando; rollback instantâneo (DROP POLICY / role); prova antes/depois obrigatória.

## 0. LEIA AS SKILLS PRIMEIRO (obrigatório)
C:\Users\rayna\.agents\skills\neon-postgres\SKILL.md + C:\Users\rayna\.agents\skills\neon-auth\SKILL.md (+ filhos se referenciados): determine o que a NEON suporta de verdade para papel authenticated em app serverless com pooler (proxy de JWT? claims por transação? grant model?). O desenho segue o que a plataforma dá — não inventar arquitetura Supabase se a Neon não suportar.

## 1. Papel authenticated
Criar papel `authenticated` (NOLOGIN — uso via proxy/plataforma; confirme na skill) + GRANTs exatamente como docs/neon-migration/neon-schema.sql define (usage schema public + SELECT/INSERT/UPDATE/DELETE nas tabelas multi-tenant conforme o doc; neon_auth tables NÃO tocar). Idempotente (DO $$ ... EXCEPTION $$ ou IF NOT EXISTS via catalog).

## 2. TODAS as policies do schema doc
Extrair e aplicar TODAS as CREATE POLICY de docs/neon-migration/neon-schema.sql (DROP POLICY IF EXISTS + CREATE, transacional por tabela, log). Casos especiais do doc: `account_integrations` append-only (sem UPDATE/DELETE), `billing_churn_surveys` owner-only (sem policy de UPDATE = deny), policies que usam `auth.user_id()` — confira na skill se a função/claims existem na Neon (se a Neon usa `neon_auth.user_id()` ou claims de JWT diferentes, use o que a skill manda e reporte o mapeamento; se NÃO existir claim em conexão de app, as policies seguem Deny-All pra authenticated — que é o comportamento correto/seguro).

## 3. Conexão do app (a pergunta do dono: "owner tem bypass")
O app conecta como neondb_owner (bypass) com filtro accountOwnerId + suíte BOLA (12 testes cross-tenant) — NÃO refatore a camada de dados 3 dias antes do lançamento. O que a spec pede: (a) verifique na skill se a Neon oferece conexão autenticada por JWT pra app serverless (proxy) e documente o caminho real pós-lançamento; (b) se existir um modo seguro suportado (ex.: segunda connection string pra leituras), AVALIE sem aplicar — reporte. Aplicar agora = só se a skill mostrar caminho oficial de baixo risco.

## 4. Prova real (antes/depois)
Re-executar a matriz (script temp .cjs): antes (policies=0) vs depois (policies=N, role existe, grants ok). PROVA DE FONTE A FONTE: conectar como `authenticated` (SET role via owner session se NOLOGIN permita `SET ROLE`), simular claims (se a skill definir como), confirmar: linha de outro tenant = 0 rows (deny), própria = rows. Se claims não aplicáveis a sessão de teste, provar o DENY-ALL (SELECT retorna 0 em tabela populada) + documentar o que falta pro allow.

## 5. Fechamento LGPD + pendências baratas
- .lgpd/retention.md: nota do PITR 7 dias (retém eliminados por até 7d, Art. 15/16 + Art. 9 transparência) + status das policies.
- Confirmar `VIDEO_EVENTS_RETENTION_DAYS`: a env é na Vercel (o Lead aplica se o dono pedir; documente o comando).
- Realtime_test/support_notes: reportar origem (sem apagar).

## REGRAS DURAS
pg via node --env-file=.env.local + script .cjs (nunca -e inline). PROIBIDO: DROP/DELETE de dados, tocar neon_auth tables, mudar compute/PITR, tocar código de app, mexer nos WIPs não-commitados da sessão kanban paralela (package.json/kibo-ui/AdminShell/app-shared/lib-roadmap-novo). Únicas escritas: scripts temp (remover ao final), docs/reports/NEON_RLS_APPLY.md, .lgpd/retention.md. Zero deps. Sem travessões em textos novos. Set-Content proibido com acentos.

## RESPOSTA FINAL
Antes/depois da matriz, policies aplicadas (contagem por tabela), resultado da prova de deny/allow, o que a skill Neon diz sobre conexão autenticada de app (e o caminho pós-lançamento), rollback (1 linha), veredito de lançamento.
