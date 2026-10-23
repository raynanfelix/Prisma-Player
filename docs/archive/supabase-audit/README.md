# Auditoria Supabase — Prisma Player

Investigação somente-leitura (código + migrations). Nenhum arquivo de aplicação
tocado, nada executado no banco. Tamanhos reais exigem `sql-collection.md`.

## Estrutura

| Arquivo | Descrição |
|---------|-----------|
| `inventory.md` | Tabelas, índices, triggers, funções, RLS, buckets (Equipe A) |
| `write-map.md` | Todas as escritas por funcionalidade/tabela (Equipe B) |
| `read-map.md` | Leituras, paginação, polling, downloads (Equipe C) |
| `schema-gaps.md` | Divergências migrations × código (+ correções a claims antigos) |
| `recommendations.md` | Recomendações P0–P3 com risco, esforço e rollback |
| `scale-projections.md` | Cenários 1k/10k/100k usuários (hipóteses explícitas) |
| `sql-collection.md` | Somente-leitura para o SQL Editor |
| `skills-used.md` | Skills e equipes reais |

## Resumo Executivo

Fontes dominantes de crescimento: `video_events` (~6 linhas por view completa:
impression+play+progress 25/50/75+complete), `player_events`, `video_live_sessions`
(podada 1x/dia), `payment_webhook_events` (payload integral), `security_events`
(1 por falha de login), `ai_credit_ledger` (1 por movimento). Binário nunca vai
para o Postgres (só `object_path` + metadados); R2 é o backend real de vídeo.

Riscos corrigidos em relação à auditoria anterior (`README` antigo, 5 correções):
1. `cleanup_rate_limits()` **é** chamada (piggyback ≤1/min por instância em
   `lib/security/rate-limit.ts:9-15,93`) — sem pg_cron, mas sem bloat explosivo.
2. `video_live_sessions` é podada no cron diário **da aplicação**
   (`api/cron/route.ts:63`, `last_seen_at < now-10min`) — não há pg_cron nem
   DELETE no SQL, mas há limpeza.
3. "Particionamento lógico por user_id" não existe — é escopo por FK/índice,
   sem `PARTITION BY` em nenhuma tabela.
4. Upsert sem `onConflict` em `dashboard-security` é inócuo (PK = `user_id`).
5. `is_account_team_member` com `EXECUTE` revogado dentro de policies RLS:
   precisa de validação (leituras como usuário podem falhar; app usa
   service_role e não sente).

P0 real: `video_events` sem retenção/partição (cresce por view, para sempre);
payloads integrais de webhook sem expiração; eventos A/B idem. Detalhes e
provas em `recommendations.md`.
