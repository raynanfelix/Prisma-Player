# Neon launch-readiness — spec (24/10/2026, lançamento 27/10)

Projeto: falling-cloud-45294262 (prisma), branch de produção. ACESSO: (a) CLI neon 8.8.0 autenticada (management: projeto/branches/compute/history), (b) pg direto com DATABASE_URL do .env.local (padrão comprovado: script temp .cjs via node --env-file — one-liner -e quebra escaping no PowerShell, NUNCA use -e com aspas duplas). REGRAS DE OURO: produção a 3 dias do lançamento — AUDITA PRIMEIRO, aplica SÓ correção idempotente que o schema documentado define, e REPORTA tudo que exige decisão. PROIBIDO: DROP/DELETE/TRUNCATE de dados, deletar branch, mudar compute/IP allowlist/PITR sem aprovação, qualquer operação irreversível.

## ENTREGA 1 — Matriz RLS completa (pg)
Script temp .cjs: para cada tabela de public (43): RLS habilitado? FORCED? nº de policies e comandos (SELECT/INSERT/UPDATE/DELETE). Saída: docs/reports/NEON_LAUNCH_AUDIT.md com a matriz + lista de tabelas SEM RLS ou SEM policy. Comparar com docs/neon-migration/neon-schema.sql (a fonte documentada): tabelas que o schema diz ter RLS e o banco não tem = gap de drift.

## ENTREGA 2 — Roles e grants
Roles existentes (authenticated existe? neondb_owner?), grants do authenticated nas tabelas multi-tenant. Contexto honesto (já documentado no SECURITY.md): a app conecta como neondb_owner que BYPASSA RLS — a barreira real é o filtro accountOwnerId na camada de API (testado pela suíte BOLA). RLS aqui é defesa para o papel authenticated.

## ENTREGA 3 — Aplicação de correção segura (SÓ o que o schema documentado define)
Para cada drift (tabela com RLS/policy no neon-schema.sql mas ausente no banco): aplicar o bloco idempotente DO PRÓPRIO neon-schema.sql (ENABLE ROW LEVEL SECURITY + DROP POLICY IF EXISTS + CREATE POLICY) num script .cjs de migração com transação por tabela e log do que aplicou. NADA além do documento (nova policy inventada = NÃO). Depois re-rodar a matriz e colar o antes/depois no relatório.

## ENTREGA 4 — PITR/history retention (GAP-10 da auditoria LGPD, Art. 16)
Via CLI: neon branches list --project falling-cloud-45294262 (e settings do projeto se exposto) → qual a janela de histórico/restauração hoje e quanto custa estender. Recomendação concreta no relatório (ex.: 7 dias mínimos para Art. 16 + rollback de lançamento). NÃO aplicar sem aprovação do dono (muda custo).

## ENTREGA 5 — Compute e disponibilidade para o lançamento
Autoscaling/min/max do branch de produção, scale-to-zero (cold start do cron diário 12:00 UTC e do primeiro acesso), horário do cron (12:00 UTC = 9h BRT: ok?), recomendações (ex.: subir minimum pra lançamento). REPORTAR — mudar compute é decisão do dono (custo).

## ENTREGA 6 — Conferência de migrations aplicadas
Tabelas esperadas pelo drizzle/ vs tabelas no banco (re-gerar lista do schema local): faltando alguma? (billing_churn_surveys e as do Stripe devem existir). Indexes críticos presentes (user_id nas tabelas de eventos)? Reportar drift.

## Formato do relatório
docs/reports/NEON_LAUNCH_AUDIT.md: matriz RLS antes/depois, roles, PITR, compute, migrations drift, e seção final "CORRIGIDO POR MIM" vs "PRECISA DE VOCÊ NO CONSOLE" (cada item com o porquê e o custo estimado se aplicável). Toda recomendação cita norma/risco. Sem travessões em textos novos. Zero deps. Set-Content proibido com acentos (write tool). Nada em código de aplicação. RESPOSTA FINAL: veredito de lançamento do banco (pronto/não-pronto + os 3 riscos maiores), o que corrigiu, o que pende de decisão.
