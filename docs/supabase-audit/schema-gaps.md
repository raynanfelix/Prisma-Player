# Divergências: migrations × código × banco (Equipe F)

## Banco real: NÃO ACESSADO
Sem credenciais/projeto nesta sessão. Tudo abaixo é migrations × código.
Validar tamanhos no `sql-collection.md`.

## G1. Claims antigos corrigidos aqui (não repetir)
1. `cleanup_rate_limits` sem chamada → REFUTADO: piggyback ≤1/min por
   instância (`lib/security/rate-limit.ts:9-15,93`). Residual: sem tráfego,
   sem limpeza; multi-instância limpa redundante (inócuo).
2. `video_live_sessions` sem limpeza → PARCIAL: podada no cron app
   (`api/cron/route.ts:63`); sem pg_cron e sem filtro além de 10min.
3. "Particionamento lógico por user_id" → terminologia errada: é escopo,
   não `PARTITION BY` (ausente em tudo).
4. Upsert sem `onConflict` (`dashboard-security`) → inócuo (PK=user_id).

## G2. Divergências reais
1. **Drop do inexistente**: `20260717150000` dropa billing que nunca foi
   criado no repo; `billing_plans` renasce com outro schema. Risco: replay
   em banco virgem diverge do banco que viveu a história (tabelas-fantasma).
2. **Better Auth quebrado e morto**: trigger referencia função inexistente
   (`20260127000000:88`); drops miraram nomes errados; sobra sem RLS com
   `password/tokens` até `20260805000000`. Hoje dropado — verificar no banco
   real que não restou nada (`sql-collection.md` Q1).
3. **Referência futura + duplicação**: `consume_ai_credit` (16) atualiza
   tabelas criadas na 19; colunas de atribuição/risco adicionadas 2x com
   CHECK/índices divergentes (segunda parcial no-op).
4. **Tabelas sem escritor**: `video_versions`, `embed_monitors`,
   `element_experiments(+variants)`, `conversion_templates` — código morto
   ou futuro; ocupam schema/RLS sem uso. `asset-sign` sem chamador (rota
   órfã aparente). `live-logs` sem chamador.
5. **`is_account_team_member` revogado dentro de policies**: leituras de
   equipe como JWT podem falhar (app usa service_role e não sente).
   Validar com usuário real ou remover o revoke.
6. **`user_inbox` seed sem idempotência** (`inbox:60`, 4 inserts sem
   onConflict): race no primeiro GET duplica boas-vindas.
7. **Seed × migrations**: `seed.sql` insere colunas que só existem após
   `20260717200000`/`20260717230000` — `db reset` ordenado ok, fora de
   ordem quebra.
8. **Check duplo de `risk_score`** (`between` vs `>=/<=`) — inócuo, unificar.
9. **Docs com chave publicável real** (`CONFIGURACAO_COMPLETA:111-114`,
   `vercel-production:37-40`): trocar por placeholders (publishable é
   pública, mas expõe o projeto).
10. **CI usa `NEXT_PUBLIC_SUPABASE_*` que o código nunca lê** (só `SUPABASE_*`
    server-side): alinhar ou documentar.

## G3. Schema real enviado pelo dono × migrations (2026-10-11)
O dump veio com aviso ("for context only"): comparado item a item, ele
**omite constraints que as migrations provadamente contêm** —
`unique(video_id)` em `player_configs` (`20260715220249:51`), FK composta
com `ON DELETE CASCADE` (`:52`, que apaga o config ao excluir o vídeo: o
código nunca deleta config porque a cascata cuida disso), e os UNIQUEs de
`video_events`/`player_events`/`ledger.reference`/`checkouts.external_id`.
Conclusão: o dump é parcial e **não serve para afirmar falta de constraint**.
As 2 checagens que decidem (1 min no SQL Editor, Q4b em `sql-collection.md`)
confirmam se o banco aplicado == migrations. Se algum UNIQUE crítico faltar
de verdade, os upserts `onConflict` correspondentes falham alto (fail-closed,
sem corrupção silenciosa) — exceto ledger duplicado, que seria silencioso.
