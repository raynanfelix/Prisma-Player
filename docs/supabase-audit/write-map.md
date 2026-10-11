# Mapa de escritas (Equipe B, somente leitura)

`SIM` = cresce persistente. Limites são fato do código; volumes, ESTIMATIVA.

## Alto volume
- `video_events` upsert `onConflict(video,session,type,progress)+ignoreDuplicates`
  (`api/analytics-events/route.ts:166-168`, payload ≤4096B, heartbeat filtrado)
  → SIM (~6 linhas/view completa; duplicata descartada).
- `player_events` upsert idem (`api/ab-events/route.ts:55`, 120/min + 1000/min
  global) → SIM.
- `video_live_sessions` upsert sem duplicata (`analytics-events:129`) → NÃO
  (sobrescreve; podada no cron `cron:63`).
- `payment_webhook_events` upsert `provider_event_id` (`webhooks:90-91`,
  payload integral) + claim `pending/failed→processing` (`:96-101`) → SIM
  (1 por evento; duplicata `duplicate:true`).
- `security_events` insert por falha login/signup (`auth-events.ts:10`,
  metadata email+IP), troca de senha, delete → SIM (baixo volume).
- `ai_credit_ledger` insert por débito/estorno/ajuste (`analyze:111,130`,
  `adjust:41`, UNIQUE reference) → SIM.
- `ai_analysis_jobs` insert por análise (`analyze:98-99`, guards 1 ativo +
  3/10min + diária) + `after()` completa (`:121`) → SIM (1 por análise).

## Operacionais
- `videos`/`player_configs` insert por vídeo (+1 config default); duplicate
  copia linha + objeto R2 (`duplicate:34-55`, assets NÃO copiados); updates
  in-place; delete remove storage antes (`[id]:86-96`).
- `subscriptions` upsert por user (webhook `:183`, ativação, admin plan);
  cron expira vencidas (`cron:69`); cancel/suspend pontuais.
- `billing/ai_credit_checkouts` insert por tentativa + updates de status;
  `failed` permanece (lixo contábil menor).
- `user_inbox` seed 4 linhas/usuário novo (`inbox:60`, sem onConflict —
  race duplica), 1 por ativação trial (`trial:35-36`), 1 por relatório/alerta
  com dedup 24h (`cron:89-104`).
- `account_access` update trial (condicional `available`, 1x); teams
  members/invites com triggers de assento; invites re-sobrescrevem por email.
- `intelligence_controls` ensure/upsert por user; `dashboard-security`
  upsert sem `onConflict` (inócuo: PK=user_id) + fan-out em N configs.
- Admin (`plan/status/credits/plans/seo/support`): updates pontuais +
  `admin_audit_log` 1 por ação; `seo_targets/checks`, `support_cases/notes`
  por ticket.
- `video_versions/embed_monitors/element_*` sem escritor no `src` (morto ou
  futuro) — ver `schema-gaps.md`.

## Loops N-query e leituras pesadas
- Cron/conta: 2 counts relatório + por vídeo (≤500) 4 counts + dedup +
  insert + webhook ≈ 3500 ops no teto; `CONCURRENCY=5`, budget 240s.
- `videos/route`: ≤30 counts + ≤30 assinaturas/request; `getStorageUsedBytes`
  e `overview` somam `videos` **sem limite**; `ab-tests:29` 100k,
  `analyze`/`analytics`/exports 50k, `overview` 20k×2, `conversions` 10k,
  `diagnostics` 2k, `export/delete` 2k, admin 5k.
- `analytics-events after()`: por evento actionable, 2 selects + webhook/CAPI.
- `delete` conta: vídeos `limit 2000` + assets 1+1 nível (órfãos além disso).
- `dashboard-security`: purge 1 por config (select sem limite).
- Sem retry com backoff em DB; `deliverWebhook` 1 tentativa (timeout 8s);
  `after()` de AI regrava `completed` 1x.

## RPCs
`consume_rate_limit` (por request com rateLimit) e `cleanup_rate_limits`
(piggyback ≤1/min) — escrita por request, tabela podada. `consume/refund/
apply/revoke_ai_credit` — débito antes do provedor, estorno idempotente.
