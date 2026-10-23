# Recomendações priorizadas (Equipe F; nada implementado nesta fase)

## P0 — provar tamanho antes, mas desenhar agora
- **P0-1 `video_events` sem retenção/partição.** → ENTREGUE em
  `20261013000000` (`video_daily_stats` + `rollup_video_daily_stats`,
  cron chama todo dia) + `purge_old_video_events` env-gated. Falta: rodar
  a migration + validar totais rollup vs cru (Q6).
  Proposta: retenção 12–24m + rollup diário por vídeo (`video_daily_stats`
  via cron) + RANGE mensal quando >50M linhas. Benefício: trava crescimento
  infinito. Risco: médio (muda queries de analytics). Esforço: alto.
  Rollback: manter tabela crua X dias após rollup. Testes: totais idênticos
  pré/pós.
- **P0-2 Payload integral de webhook sem expiração.** Evidência:
  `webhooks:90-91`. Proposta: após 90d processado, `payload=NULL` mantendo
  metadados (idempotência passa a ser só por `provider_event_id`). Benefício:
  corta o maior blob quente. Risco: baixo. Rollback: backup prévio.
  Testes: replay de evento antigo ainda deduplica.

## P1 — alto impacto, baixo/médio risco
- **P1-1 `player_events` mesma receita do P0-1** (retenção por teste
  encerrado + rollup). Esforço médio.
- **P1-2 Assinaturas R2 na lista de vídeos sob demanda.** Evidência:
  30/request (`videos:72-80`). Proposta: assinar só ao clicar Editar/preview.
  Benefício: −N assinaturas + CPU por abertura de tela. Risco baixo.
  Rollback: revert de 1 hunk. Testes: preview continua tocando.
- **P1-3 `getStorageUsedBytes`/overview sem limite.** Proposta: `count` por
  agregação (`sum(size_bytes)` no banco) ou view materializada. Risco baixo.
- **P1-4 `user_inbox` seed idempotente** (`onConflict` ou tabela de flags).
  Risco baixo.
- **P1-5 Dedup duplo de conversão/impression** (chave única entre as 2 vias).
  Risco baixo-médio (muda contagem — avisar marketing).
- **P1-6 `security_events` com retenção 12m** (LGPD minimização; manter
  tipos críticos). Risco baixo.

## P2 — importante, não urgente
- **P2-1 pg_cron (ou documentar piggyback) p/ `cleanup_rate_limits`.**
- **P2-2 Prune `video_live_sessions` fora do cron diário** (job próprio ou
  TTL menor) — validar necessidade real primeiro.
- **P2-3 `ab-tests:29` 100k e `analyze/analytics` 50k**: paginar/agregar no
  banco em vez de fatiar em JS.
- **P2-4 `dashboard-security` fan-out sem limite**: paginar configs.
- **P2-5 `is_account_team_member` revoke × policies**: testar como JWT e
  decidir.
- **P2-6 Remover/marcar mortos**: `video_versions`, `embed_monitors`,
  `element_*`, `conversion_templates`, rota `asset-sign`, `live-logs`
  (após confirmar zero uso em 30d de logs).
- **P2-7 Unificar CHECK `risk_score` e colunas duplicadas.**
- **P2-8 Docs com chave real → placeholders; alinhar `NEXT_PUBLIC_*`.**

## P3 — futuro
- Particionamento físico só com >50M linhas medidas; fila p/ webhooks de
  saída/CAPI com retry; Redis p/ rate-limit fora do Postgres; Redis/caching
  de leitura quente; particionar `ai_credit_ledger` por ano se crescer.
