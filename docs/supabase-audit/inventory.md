# Inventário — schema Supabase (Equipe A, somente leitura)

Fonte: `supabase/migrations/*.sql` + `seed.sql`. Extensões: só `pgcrypto`.
Views/materialized: zero. `pg_cron/pgnet/pg_partman`: ausentes.

## Tabelas (36 ativas + legado dropado)

Núcleo (`20260715220249`): `profiles`(PK→auth.users) `video_folders` `videos`
(UNIQUE user_id+object_path, UNIQUE id+user_id, FK composta pasta)
`player_configs`(UNIQUE video_id) `security_events`(identity).
Analytics: `player_events` (UNIQUE test+variant+session+type+progress),
`video_events` (UNIQUE video+session+type+progress; +tráfego/risco/viewer por
4 ALTERs), `video_live_sessions` (PK video+session), `ai_analysis_jobs`
(parcial única 1 ativo/user via `EXECUTE` em `20260717163038:28-31`).
Billing (`20260717184500`): `billing_plans/customers/checkouts/subscriptions`
(UNIQUE user_id)/`payment_webhook_events` (UNIQUE provider_event_id).
Créditos/trial (`20260717193000`): `account_access/user_inbox/ai_credit_products/
wallets/checkouts/ledger` (UNIQUE reference, reason enum + purchase/plan_grant/
usage/refund/adjustment). Equipes (`20260717200000`): `account_teams`(UNIQUE
owner)/`members`(UNIQUE team+user)/`invites`(UNIQUE team+email).
Inteligência: `intelligence_controls`(PK user), `embed_monitors`,
`video_versions`, `conversion_templates`, `element_experiments(+variants)`.
Infra: `rate_limits`(PK key). Admin novo: `admin_audit_log/seo_targets/
visibility_checks/support_cases/support_notes`. Legado dropado: tabelas
Better Auth (`20260127000000` → drops `20260729130000`, `20260805000000`;
sem RLS, com `account.password/accessToken`) e billing antigo
(`20260717150000` drop de tabelas nunca criadas no repo).

## Índices (padrão: btree; sem GIN/GiST/BRIN/partição)

Quentes por tabela: `video_events`: `user_event_created(user,event,created)`
`video_event_type(video,event)` `video_created` `conversion_created` parcial
`unique_transaction(video,transaction) WHERE conversion` `attribution_idx`
`risk_idx` parciais `viewer_id_idx` parcial `campaign_idx` parcial;
`player_events`: `owner_test(user,test,created)` + `test_variant`;
`video_live_sessions`: `active(video,last_seen)` + `viewer` parcial;
`payment_webhook_events`: `status_received` + UNIQUE provider_event_id;
`ai_credit_ledger`: `user_idx` + UNIQUE reference; `security_events`:
`user_created`; `rate_limits`: PK + `expires_at_idx`;
`ai_analysis_jobs`: `user_created` + 1-ativo parcial; teams/members/invites,
billing, inbox (`unread` parcial), subscriptions(`status,period`) cobertos.
FKs compostas têm UNIQUE de apoio; colunas FK avulsas têm índice próprio.

## Triggers e funções

`auth.users AFTER INSERT` → `bootstrap_prisma_account()` (único vivo; 3
anteriores dropados). Quotas atômicas (`pg_advisory_xact_lock`): `videos`
→ `enforce_video_storage_quota` (soma **todos** status pós-`20260810120000`)
+ `guard_video_status_transitions` (authenticated não forja `failed`);
`members/invites` → seat/invite quota. Toda `SECURITY DEFINER` tem
`SET search_path=''` + `REVOKE EXECUTE public/anon/authenticated` (só
`service_role` nas `public.*`). Exceção inócua: `update_updated_at_column()`
(não-definer, tabela dropada).

## RLS e grants

RLS em todas as ativas. Leitura própria (`auth.uid()=user_id`) quase geral;
`billing_plans`/`conversion_templates` legíveis anon; `video/player_events`,
créditos, billing, teams: SELECT-only p/ authenticated (writes só
service_role); `profiles` select+update own; `security_events` select+insert
own; `user_inbox` +update; teams via `is_account_team_member()` (ressalva em
`schema-gaps.md`). Zero-policy (deny exceto service_role, `revoke all`):
`rate_limits`, `payment_webhook_events`, `admin_audit_log`, `seo_targets`,
`visibility_checks`, `support_cases`, `support_notes`. Storage `objects`:
ownership por `owner_id`/`foldername()[1]` nos buckets privados `videos`
(5GB) e `player-assets` (10MB + gif).

## JSON/blob e CHECKs

`player_configs.config{}` `security_events.metadata` `ai jobs
input_snapshot/result` `webhook payload NOT NULL` `ledger.metadata`
`audit.details` `conversion/element configs`. Sem binário (só `object_path`).
CHECKs: status/type/progress/risk/enums de plano/papel/convite/trial ativo
com datas/trial/inbox 7d/webhook `https://`/email lower/suporte.
Divergência: `risk_score` com dois padrões (`between` vs `>=/<=`) e colunas
de atribuição adicionadas 2x (segundo `IF NOT EXISTS` parcial).
