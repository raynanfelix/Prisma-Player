-- ============================================================================
-- Prisma Player — schema completo do banco (Lakebase Postgres / Neon)
-- ============================================================================
-- COMO USAR: cole este arquivo INTEIRO no SQL Editor do seu projeto no Neon
-- (Console → SQL Editor). É idempotente: pode ser executado mais de uma vez.
--
-- AUTH (Neon Auth / Managed Better Auth): ao ativar o Auth no painel da Neon
-- (Project → Branch → Auth), a Neon cria e gerencia AUTOMATICAMENTE o schema
-- `neon_auth` com as tabelas user, session, account, verification,
-- organization, member, invitation, jwks, project, config e a função
-- auth.user_id() usada pelas policies abaixo. NÃO recrie nada disso aqui.
--
-- MODELO DE SEGURANÇA (defesa em profundidade):
--   1ª camada — aplicação Next.js: guard() + filtro accountOwnerId em TODA
--      query (Drizzle, conexão owner, bypassa RLS por design do Postgres).
--   2ª camada — RLS abaixo: qualquer conexão que NÃO seja do dono do banco
--      (ex.: roles authenticated/anonymous do Neon Auth) só vê as próprias
--      linhas. Tabelas de sistema (rate_limits, webhooks, auditoria) ficam
--      SEM policy = acesso negado por padrão para essas roles.
-- ============================================================================
-- =================== SCHEMA (DDL) ===================

CREATE TABLE IF NOT EXISTS "ab_test_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ab_test_folders_user_id_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "ab_test_folders_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "ab_test_folders_name_check" CHECK (char_length("ab_test_folders"."name") between 1 and 100)
);

CREATE TABLE IF NOT EXISTS "ab_test_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"weight" smallint DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ab_test_variants_test_id_video_id_key" UNIQUE("test_id","video_id"),
	CONSTRAINT "ab_test_variants_weight_check" CHECK ("ab_test_variants"."weight" between 1 and 100)
);

CREATE TABLE IF NOT EXISTS "ab_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ab_tests_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "ab_tests_name_check" CHECK (char_length("ab_tests"."name") between 1 and 150),
	CONSTRAINT "ab_tests_status_check" CHECK ("ab_tests"."status" in ('draft', 'active', 'paused', 'completed'))
);

CREATE TABLE IF NOT EXISTS "account_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"trial_status" text DEFAULT 'available' NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_access_trial_status_check" CHECK ("account_access"."trial_status" in ('available', 'active', 'used', 'expired')),
	CONSTRAINT "account_access_trial_dates_check" CHECK ("account_access"."trial_status" <> 'active' or ("account_access"."trial_started_at" is not null and "account_access"."trial_ends_at" is not null))
);

CREATE TABLE IF NOT EXISTS "account_security_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "account_team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_team_invites_team_id_email_key" UNIQUE("team_id","email"),
	CONSTRAINT "account_team_invites_email_check" CHECK ("account_team_invites"."email" = lower("account_team_invites"."email") and char_length("account_team_invites"."email") between 3 and 320),
	CONSTRAINT "account_team_invites_role_check" CHECK ("account_team_invites"."role" in ('admin', 'editor', 'analyst', 'viewer')),
	CONSTRAINT "account_team_invites_status_check" CHECK ("account_team_invites"."status" in ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE TABLE IF NOT EXISTS "account_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_team_members_team_id_user_id_key" UNIQUE("team_id","user_id"),
	CONSTRAINT "account_team_members_role_check" CHECK ("account_team_members"."role" in ('owner', 'admin', 'editor', 'analyst', 'viewer')),
	CONSTRAINT "account_team_members_status_check" CHECK ("account_team_members"."status" in ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS "account_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text DEFAULT 'Minha equipe' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_teams_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "account_teams_name_check" CHECK (char_length("account_teams"."name") between 1 and 100)
);

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_user_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_log_action_check" CHECK ("admin_audit_log"."action" in (
        'plan_change', 'subscription_suspend', 'subscription_reactivate',
        'trial_extend', 'trial_reset', 'credit_adjust',
        'support_case_opened', 'support_case_updated', 'support_note_added',
        'team_role_changed'
      ))
);

CREATE TABLE IF NOT EXISTS "ai_analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid,
	"analysis_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"model" text,
	"error_code" text,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_analysis_jobs_analysis_type_check" CHECK ("ai_analysis_jobs"."analysis_type" in ('performance', 'retention', 'funnel', 'copy', 'experiment')),
	CONSTRAINT "ai_analysis_jobs_status_check" CHECK ("ai_analysis_jobs"."status" in ('queued', 'processing', 'completed', 'failed')),
	CONSTRAINT "ai_analysis_jobs_credits_used_check" CHECK ("ai_analysis_jobs"."credits_used" >= 0)
);

CREATE TABLE IF NOT EXISTS "ai_credit_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"provider_checkout_id" text,
	"checkout_url" text,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_checkouts_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "ai_credit_checkouts_provider_checkout_id_unique" UNIQUE("provider_checkout_id"),
	CONSTRAINT "ai_credit_checkouts_amount_cents_check" CHECK ("ai_credit_checkouts"."amount_cents" > 0),
	CONSTRAINT "ai_credit_checkouts_status_check" CHECK ("ai_credit_checkouts"."status" in ('creating', 'pending', 'paid', 'expired', 'failed', 'refunded', 'disputed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "ai_credit_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_credit_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"reference" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_ledger_reference_unique" UNIQUE("reference"),
	CONSTRAINT "ai_credit_ledger_amount_check" CHECK ("ai_credit_ledger"."amount" <> 0),
	CONSTRAINT "ai_credit_ledger_reason_check" CHECK ("ai_credit_ledger"."reason" in ('purchase', 'plan_grant', 'usage', 'refund', 'adjustment', 'stripe_checkout'))
);

CREATE TABLE IF NOT EXISTS "ai_credit_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"bonus_credits" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider_product_id" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ai_credit_products_provider_product_id_unique" UNIQUE("provider_product_id"),
	CONSTRAINT "ai_credit_products_credits_check" CHECK ("ai_credit_products"."credits" > 0),
	CONSTRAINT "ai_credit_products_bonus_credits_check" CHECK ("ai_credit_products"."bonus_credits" >= 0),
	CONSTRAINT "ai_credit_products_amount_cents_check" CHECK ("ai_credit_products"."amount_cents" > 0)
);

CREATE TABLE IF NOT EXISTS "ai_credit_wallets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_purchased" integer DEFAULT 0 NOT NULL,
	"lifetime_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_wallets_balance_check" CHECK ("ai_credit_wallets"."balance" >= 0),
	CONSTRAINT "ai_credit_wallets_lifetime_purchased_check" CHECK ("ai_credit_wallets"."lifetime_purchased" >= 0),
	CONSTRAINT "ai_credit_wallets_lifetime_used_check" CHECK ("ai_credit_wallets"."lifetime_used" >= 0)
);

CREATE TABLE IF NOT EXISTS "billing_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"provider" text DEFAULT 'abacatepay' NOT NULL,
	"checkout_type" text NOT NULL,
	"external_id" text NOT NULL,
	"provider_checkout_id" text,
	"checkout_url" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'creating' NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_url" text,
	"previous_provider_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_checkouts_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "billing_checkouts_provider_checkout_id_unique" UNIQUE("provider_checkout_id"),
	CONSTRAINT "billing_checkouts_checkout_type_check" CHECK ("billing_checkouts"."checkout_type" in ('pix', 'card_subscription')),
	CONSTRAINT "billing_checkouts_amount_cents_check" CHECK ("billing_checkouts"."amount_cents" > 0),
	CONSTRAINT "billing_checkouts_currency_check" CHECK ("billing_checkouts"."currency" = 'BRL'),
	CONSTRAINT "billing_checkouts_status_check" CHECK ("billing_checkouts"."status" in ('creating', 'pending', 'paid', 'expired', 'failed', 'refunded', 'disputed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS "billing_churn_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_churn_surveys_reason_check" CHECK ("billing_churn_surveys"."reason" in ('preco', 'nao_uso', 'problemas_tecnicos', 'migrei_ferramenta', 'outro')),
	CONSTRAINT "billing_churn_surveys_feedback_check" CHECK ("billing_churn_surveys"."feedback" is null or char_length("billing_churn_surveys"."feedback") <= 1100)
);

CREATE TABLE IF NOT EXISTS "billing_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'abacatepay' NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_provider_customer_id_unique" UNIQUE("provider_customer_id"),
	CONSTRAINT "billing_customers_provider_check" CHECK ("billing_customers"."provider" = 'abacatepay')
);

CREATE TABLE IF NOT EXISTS "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"interval" text DEFAULT 'monthly' NOT NULL,
	"included_plays" integer NOT NULL,
	"storage_gb" integer NOT NULL,
	"prisma_ai_analyses" integer NOT NULL,
	"team_seats" integer DEFAULT 1 NOT NULL,
	"play_overage_millicents" integer DEFAULT 800 NOT NULL,
	"storage_overage_cents_per_gb" integer DEFAULT 50 NOT NULL,
	"provider_pix_product_id" text,
	"provider_card_product_id" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" smallint DEFAULT 0 NOT NULL,
	"automatic_reports" boolean DEFAULT false NOT NULL,
	"audience_sync" boolean DEFAULT false NOT NULL,
	"outgoing_webhooks" boolean DEFAULT false NOT NULL,
	"private_benchmark" boolean DEFAULT false NOT NULL,
	"portfolio_comparison" boolean DEFAULT false NOT NULL,
	"conversion_drop_alerts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_plans_slug_unique" UNIQUE("slug"),
	CONSTRAINT "billing_plans_provider_pix_product_id_unique" UNIQUE("provider_pix_product_id"),
	CONSTRAINT "billing_plans_provider_card_product_id_unique" UNIQUE("provider_card_product_id"),
	CONSTRAINT "billing_plans_amount_cents_check" CHECK ("billing_plans"."amount_cents" > 0),
	CONSTRAINT "billing_plans_currency_check" CHECK ("billing_plans"."currency" = 'BRL'),
	CONSTRAINT "billing_plans_interval_check" CHECK ("billing_plans"."interval" = 'monthly'),
	CONSTRAINT "billing_plans_included_plays_check" CHECK ("billing_plans"."included_plays" >= 0),
	CONSTRAINT "billing_plans_storage_gb_check" CHECK ("billing_plans"."storage_gb" >= 0),
	CONSTRAINT "billing_plans_prisma_ai_analyses_check" CHECK ("billing_plans"."prisma_ai_analyses" >= 0),
	CONSTRAINT "billing_plans_team_seats_check" CHECK ("billing_plans"."team_seats" > 0),
	CONSTRAINT "billing_plans_play_overage_check" CHECK ("billing_plans"."play_overage_millicents" >= 0),
	CONSTRAINT "billing_plans_storage_overage_check" CHECK ("billing_plans"."storage_overage_cents_per_gb" >= 0)
);

CREATE TABLE IF NOT EXISTS "conversion_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversion_templates_slug_unique" UNIQUE("slug"),
	CONSTRAINT "conversion_templates_category_check" CHECK ("conversion_templates"."category" in ('direct_response', 'webinar', 'lead_generation', 'product_launch'))
);

CREATE TABLE IF NOT EXISTS "element_experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"experiment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"weight" smallint DEFAULT 50 NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"conversions" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "element_experiment_variants_experiment_id_name_key" UNIQUE("experiment_id","name"),
	CONSTRAINT "element_experiment_variants_weight_check" CHECK ("element_experiment_variants"."weight" between 1 and 100)
);

CREATE TABLE IF NOT EXISTS "element_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"name" text NOT NULL,
	"element_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"winning_variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "element_experiments_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "element_experiments_name_check" CHECK (char_length("element_experiments"."name") between 1 and 150),
	CONSTRAINT "element_experiments_element_type_check" CHECK ("element_experiments"."element_type" in ('headline', 'autoplay', 'cta', 'thumbnail', 'speed')),
	CONSTRAINT "element_experiments_status_check" CHECK ("element_experiments"."status" in ('draft', 'active', 'paused', 'completed'))
);

CREATE TABLE IF NOT EXISTS "embed_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_status" text DEFAULT 'pending' NOT NULL,
	"last_http_status" smallint,
	"last_checked_at" timestamp with time zone,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embed_monitors_video_id_page_url_key" UNIQUE("video_id","page_url"),
	CONSTRAINT "embed_monitors_page_url_check" CHECK ("embed_monitors"."page_url" ~ '^https://'),
	CONSTRAINT "embed_monitors_last_status_check" CHECK ("embed_monitors"."last_status" in ('pending', 'healthy', 'missing', 'blocked', 'error')),
	CONSTRAINT "embed_monitors_consecutive_failures_check" CHECK ("embed_monitors"."consecutive_failures" >= 0)
);

CREATE TABLE IF NOT EXISTS "intelligence_controls" (
	"user_id" text PRIMARY KEY NOT NULL,
	"automatic_reports_enabled" boolean DEFAULT false NOT NULL,
	"report_frequency" text DEFAULT 'weekly' NOT NULL,
	"report_email" text,
	"audience_sync_enabled" boolean DEFAULT false NOT NULL,
	"audience_provider" text DEFAULT 'meta' NOT NULL,
	"audience_retention_threshold" smallint DEFAULT 75 NOT NULL,
	"outgoing_webhooks_enabled" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_events" text[] DEFAULT ARRAY['play', 'cta_click', 'conversion']::text[] NOT NULL,
	"conversion_alerts_enabled" boolean DEFAULT false NOT NULL,
	"conversion_drop_threshold" smallint DEFAULT 20 NOT NULL,
	"alert_webhook_enabled" boolean DEFAULT false NOT NULL,
	"alert_webhook_url" text,
	"last_report_sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intelligence_controls_report_frequency_check" CHECK ("intelligence_controls"."report_frequency" in ('daily', 'weekly', 'monthly')),
	CONSTRAINT "intelligence_controls_audience_provider_check" CHECK ("intelligence_controls"."audience_provider" in ('meta', 'google', 'tiktok', 'kwai')),
	CONSTRAINT "intelligence_controls_retention_threshold_check" CHECK ("intelligence_controls"."audience_retention_threshold" in (25, 50, 75, 90, 100)),
	CONSTRAINT "intelligence_controls_webhook_url_check" CHECK ("intelligence_controls"."webhook_url" is null or "intelligence_controls"."webhook_url" ~ '^https://'),
	CONSTRAINT "intelligence_controls_alert_webhook_url_check" CHECK ("intelligence_controls"."alert_webhook_url" is null or "intelligence_controls"."alert_webhook_url" ~ '^https://'),
	CONSTRAINT "intelligence_controls_drop_threshold_check" CHECK ("intelligence_controls"."conversion_drop_threshold" between 5 and 90)
);

CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_webhook_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text DEFAULT 'abacatepay' NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"provider_object_id" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"processing_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_webhook_events_provider_event_id_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "payment_webhook_events_provider_check" CHECK ("payment_webhook_events"."provider" in ('abacatepay', 'stripe')),
	CONSTRAINT "payment_webhook_events_status_check" CHECK ("payment_webhook_events"."status" in ('received', 'processing', 'processed', 'ignored', 'failed'))
);

CREATE TABLE IF NOT EXISTS "player_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_configs_video_id_key" UNIQUE("video_id")
);

CREATE TABLE IF NOT EXISTS "player_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "player_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"test_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"watched_seconds" numeric(12, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_events_dedupe_key" UNIQUE("test_id","variant_id","session_id","event_type","progress_percent"),
	CONSTRAINT "player_events_event_type_check" CHECK ("player_events"."event_type" in ('impression', 'play', 'progress', 'complete')),
	CONSTRAINT "player_events_progress_percent_check" CHECK ("player_events"."progress_percent" in (0, 25, 50, 75, 100)),
	CONSTRAINT "player_events_watched_seconds_check" CHECK ("player_events"."watched_seconds" >= 0)
);

CREATE TABLE IF NOT EXISTS "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"phone" text,
	"avatar_url" text,
	"stripe_customer_id" text,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"security_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_locale_check" CHECK ("profiles"."locale" in ('pt-BR', 'es', 'en'))
);

CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "security_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "security_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "seo_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_targets_keyword_check" CHECK (char_length("seo_targets"."keyword") between 2 and 200)
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"source_checkout_id" uuid,
	"provider" text DEFAULT 'abacatepay' NOT NULL,
	"billing_method" text NOT NULL,
	"provider_subscription_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id"),
	CONSTRAINT "subscriptions_billing_method_check" CHECK ("subscriptions"."billing_method" in ('pix', 'card')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('pending', 'active', 'past_due', 'suspended', 'cancelled', 'expired'))
);

CREATE TABLE IF NOT EXISTS "support_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"subject" text NOT NULL,
	"category" text DEFAULT 'geral' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"assignee_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_cases_subject_check" CHECK (char_length("support_cases"."subject") between 3 and 140),
	CONSTRAINT "support_cases_category_check" CHECK ("support_cases"."category" in ('geral', 'cobranca', 'tecnico', 'conta', 'reembolso', 'outro')),
	CONSTRAINT "support_cases_priority_check" CHECK ("support_cases"."priority" in ('baixa', 'normal', 'alta', 'urgente')),
	CONSTRAINT "support_cases_status_check" CHECK ("support_cases"."status" in ('aberto', 'em_andamento', 'aguardando_cliente', 'resolvido'))
);

CREATE TABLE IF NOT EXISTS "support_notes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "support_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"author_admin_id" text,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_notes_body_check" CHECK (char_length("support_notes"."body") between 1 and 2000)
);

CREATE TABLE IF NOT EXISTS "user_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_label" text,
	"action_url" text,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_inbox_kind_check" CHECK ("user_inbox"."kind" in ('welcome', 'trial', 'tip', 'alert', 'billing', 'security', 'system')),
	CONSTRAINT "user_inbox_title_check" CHECK (char_length("user_inbox"."title") between 1 and 120),
	CONSTRAINT "user_inbox_message_check" CHECK (char_length("user_inbox"."message") between 1 and 600)
);

CREATE TABLE IF NOT EXISTS "account_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"instance_id" text NOT NULL DEFAULT 'default',
	"name" text NOT NULL DEFAULT 'Principal',
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vsl_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_integrations_provider_check" CHECK ("account_integrations"."provider" in ('meta_pixel', 'google_ads', 'tiktok', 'utmify', 'discord', 'telegram', 'outgoing_webhooks'))
);

CREATE TABLE IF NOT EXISTS "video_daily_stats" (
	"video_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"completes" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"watch_seconds" numeric DEFAULT '0' NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_daily_stats_video_id_day_pk" PRIMARY KEY("video_id","day"),
	CONSTRAINT "video_daily_stats_impressions_check" CHECK ("video_daily_stats"."impressions" >= 0),
	CONSTRAINT "video_daily_stats_plays_check" CHECK ("video_daily_stats"."plays" >= 0),
	CONSTRAINT "video_daily_stats_completes_check" CHECK ("video_daily_stats"."completes" >= 0),
	CONSTRAINT "video_daily_stats_conversions_check" CHECK ("video_daily_stats"."conversions" >= 0),
	CONSTRAINT "video_daily_stats_watch_seconds_check" CHECK ("video_daily_stats"."watch_seconds" >= 0),
	CONSTRAINT "video_daily_stats_sessions_check" CHECK ("video_daily_stats"."sessions" >= 0)
);

CREATE TABLE IF NOT EXISTS "video_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "video_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"watched_seconds" numeric(12, 3) DEFAULT '0' NOT NULL,
	"country_code" text DEFAULT 'XX' NOT NULL,
	"device_type" text DEFAULT 'desktop' NOT NULL,
	"os_name" text DEFAULT 'Other' NOT NULL,
	"browser_name" text DEFAULT 'Other' NOT NULL,
	"traffic_source" text DEFAULT 'Direto' NOT NULL,
	"page_url" text,
	"campaign_id" text,
	"creative_id" text,
	"ad_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"risk_score" smallint DEFAULT 0 NOT NULL,
	"risk_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"viewer_id" text,
	"transaction_id" text,
	"conversion_value" numeric(14, 2),
	"currency" text,
	"advertising_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_events_session_event_key" UNIQUE("video_id","session_id","event_type","progress_percent"),
	CONSTRAINT "video_events_event_type_check" CHECK ("video_events"."event_type" in ('impression', 'play', 'progress', 'complete', 'cta_click', 'conversion')),
	CONSTRAINT "video_events_progress_percent_check" CHECK ("video_events"."progress_percent" in (0, 10, 25, 50, 75, 90, 100)),
	CONSTRAINT "video_events_watched_seconds_check" CHECK ("video_events"."watched_seconds" >= 0),
	CONSTRAINT "video_events_country_code_check" CHECK (char_length("video_events"."country_code") = 2),
	CONSTRAINT "video_events_device_type_check" CHECK ("video_events"."device_type" in ('desktop', 'mobile', 'tablet', 'other')),
	CONSTRAINT "video_events_risk_score_check" CHECK ("video_events"."risk_score" between 0 and 100),
	CONSTRAINT "video_events_conversion_fields_check" CHECK ("video_events"."event_type" <> 'conversion' or (
        "video_events"."transaction_id" is not null and char_length("video_events"."transaction_id") between 1 and 120 and
        "video_events"."conversion_value" is not null and "video_events"."conversion_value" >= 0 and
        "video_events"."currency" ~ '^[A-Z]{3}$'
      ))
);

CREATE TABLE IF NOT EXISTS "video_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_folders_user_id_name_key" UNIQUE("user_id","name"),
	CONSTRAINT "video_folders_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "video_folders_name_check" CHECK (char_length("video_folders"."name") between 1 and 100)
);

CREATE TABLE IF NOT EXISTS "video_live_sessions" (
	"video_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"country_code" text DEFAULT 'XX' NOT NULL,
	"device_type" text DEFAULT 'other' NOT NULL,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewer_id" text,
	CONSTRAINT "video_live_sessions_video_id_session_id_pk" PRIMARY KEY("video_id","session_id"),
	CONSTRAINT "video_live_sessions_country_code_check" CHECK (char_length("video_live_sessions"."country_code") = 2),
	CONSTRAINT "video_live_sessions_device_type_check" CHECK ("video_live_sessions"."device_type" in ('desktop', 'mobile', 'tablet', 'other')),
	CONSTRAINT "video_live_sessions_progress_check" CHECK ("video_live_sessions"."progress_percent" between 0 and 100)
);

CREATE TABLE IF NOT EXISTS "video_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"video_id" uuid NOT NULL,
	"object_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_seconds" numeric(12, 3),
	"version_number" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_versions_video_id_version_number_key" UNIQUE("video_id","version_number"),
	CONSTRAINT "video_versions_size_bytes_check" CHECK ("video_versions"."size_bytes" > 0),
	CONSTRAINT "video_versions_version_number_check" CHECK ("video_versions"."version_number" > 0)
);

CREATE TABLE IF NOT EXISTS "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"object_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"duration_seconds" numeric(12, 3),
	"storage_provider" text DEFAULT 'r2' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videos_user_id_object_path_key" UNIQUE("user_id","object_path"),
	CONSTRAINT "videos_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "videos_title_check" CHECK (char_length("videos"."title") between 1 and 200),
	CONSTRAINT "videos_size_bytes_check" CHECK ("videos"."size_bytes" > 0),
	CONSTRAINT "videos_status_check" CHECK ("videos"."status" in ('draft', 'processing', 'ready', 'failed', 'archived')),
	CONSTRAINT "videos_storage_provider_check" CHECK ("videos"."storage_provider" in ('r2'))
);

CREATE TABLE IF NOT EXISTS "visibility_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "visibility_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"target_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"cited" boolean DEFAULT false NOT NULL,
	"runs" smallint DEFAULT 1 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_checks_platform_check" CHECK ("visibility_checks"."platform" in ('google-aio', 'chatgpt', 'perplexity', 'gemini', 'copilot')),
	CONSTRAINT "visibility_checks_runs_check" CHECK ("visibility_checks"."runs" between 1 and 10)
);

DO $ BEGIN
  ALTER TABLE "ab_test_variants" ADD CONSTRAINT "ab_test_variants_test_owner_fk" FOREIGN KEY ("test_id","user_id") REFERENCES "public"."ab_tests"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "ab_test_variants" ADD CONSTRAINT "ab_test_variants_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."ab_test_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "account_team_invites" ADD CONSTRAINT "account_team_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."account_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "account_team_members" ADD CONSTRAINT "account_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."account_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "ai_analysis_jobs" ADD CONSTRAINT "ai_analysis_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "ai_credit_checkouts" ADD CONSTRAINT "ai_credit_checkouts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."ai_credit_products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "element_experiment_variants" ADD CONSTRAINT "element_experiment_variants_experiment_owner_fk" FOREIGN KEY ("experiment_id","user_id") REFERENCES "public"."element_experiments"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "element_experiments" ADD CONSTRAINT "element_experiments_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "embed_monitors" ADD CONSTRAINT "embed_monitors_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "player_configs" ADD CONSTRAINT "player_configs_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "player_events" ADD CONSTRAINT "player_events_test_owner_fk" FOREIGN KEY ("test_id","user_id") REFERENCES "public"."ab_tests"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "player_events" ADD CONSTRAINT "player_events_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."ab_test_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "player_events" ADD CONSTRAINT "player_events_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."billing_plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_checkout_id_fkey" FOREIGN KEY ("source_checkout_id") REFERENCES "public"."billing_checkouts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "support_notes" ADD CONSTRAINT "support_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "video_daily_stats" ADD CONSTRAINT "video_daily_stats_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "video_events" ADD CONSTRAINT "video_events_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "video_live_sessions" ADD CONSTRAINT "video_live_sessions_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_owner_fk" FOREIGN KEY ("video_id","user_id") REFERENCES "public"."videos"("id","user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "videos" ADD CONSTRAINT "videos_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."video_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
DO $ BEGIN
  ALTER TABLE "visibility_checks" ADD CONSTRAINT "visibility_checks_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."seo_targets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $;
CREATE INDEX IF NOT EXISTS "ab_test_folders_user_created_idx" ON "ab_test_folders" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "ab_test_variants_test_idx" ON "ab_test_variants" USING btree ("test_id");
CREATE INDEX IF NOT EXISTS "ab_test_variants_user_idx" ON "ab_test_variants" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "ab_test_variants_video_id_idx" ON "ab_test_variants" USING btree ("video_id");
CREATE INDEX IF NOT EXISTS "ab_tests_user_created_idx" ON "ab_tests" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "ab_tests_folder_idx" ON "ab_tests" USING btree ("folder_id");
CREATE INDEX IF NOT EXISTS "account_team_invites_team_idx" ON "account_team_invites" USING btree ("team_id","status","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "account_team_invites_email_idx" ON "account_team_invites" USING btree ("email","status");
CREATE INDEX IF NOT EXISTS "account_team_members_user_idx" ON "account_team_members" USING btree ("user_id","status");
CREATE INDEX IF NOT EXISTS "account_team_members_team_idx" ON "account_team_members" USING btree ("team_id","status");
CREATE INDEX IF NOT EXISTS "admin_audit_log_target_created_idx" ON "admin_audit_log" USING btree ("target_user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_created_idx" ON "admin_audit_log" USING btree ("admin_user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "ai_analysis_jobs_user_created_idx" ON "ai_analysis_jobs" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "ai_analysis_jobs_video_id_idx" ON "ai_analysis_jobs" USING btree ("video_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_analysis_jobs_one_active_per_user_idx" ON "ai_analysis_jobs" USING btree ("user_id") WHERE "ai_analysis_jobs"."status" in ('queued', 'processing');
CREATE INDEX IF NOT EXISTS "ai_credit_checkouts_user_idx" ON "ai_credit_checkouts" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "ai_credit_checkouts_product_id_idx" ON "ai_credit_checkouts" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "ai_credit_ledger_user_idx" ON "ai_credit_ledger" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "billing_checkouts_user_created_idx" ON "billing_checkouts" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "billing_checkouts_status_created_idx" ON "billing_checkouts" USING btree ("status","created_at");
CREATE INDEX IF NOT EXISTS "billing_checkouts_plan_id_idx" ON "billing_checkouts" USING btree ("plan_id");
CREATE INDEX IF NOT EXISTS "billing_checkouts_previous_subscription_idx" ON "billing_checkouts" USING btree ("previous_provider_subscription_id") WHERE "billing_checkouts"."previous_provider_subscription_id" is not null;
CREATE INDEX IF NOT EXISTS "billing_churn_surveys_user_created_idx" ON "billing_churn_surveys" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "element_experiments_video_idx" ON "element_experiments" USING btree ("user_id","video_id","status");
CREATE INDEX IF NOT EXISTS "embed_monitors_due_idx" ON "embed_monitors" USING btree ("enabled","last_checked_at") WHERE "embed_monitors"."enabled";
CREATE INDEX IF NOT EXISTS "payment_webhook_events_status_received_idx" ON "payment_webhook_events" USING btree ("status","received_at");
CREATE INDEX IF NOT EXISTS "player_configs_user_id_idx" ON "player_configs" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "player_configs_video_id_idx" ON "player_configs" USING btree ("video_id");
CREATE INDEX IF NOT EXISTS "player_events_owner_test_idx" ON "player_events" USING btree ("user_id","test_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "player_events_test_variant_idx" ON "player_events" USING btree ("test_id","variant_id","event_type");
CREATE INDEX IF NOT EXISTS "player_events_variant_id_idx" ON "player_events" USING btree ("variant_id");
CREATE INDEX IF NOT EXISTS "player_events_video_id_idx" ON "player_events" USING btree ("video_id");
CREATE INDEX IF NOT EXISTS "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "security_events_user_created_idx" ON "security_events" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "subscriptions_status_period_idx" ON "subscriptions" USING btree ("status","current_period_end");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");
CREATE INDEX IF NOT EXISTS "subscriptions_source_checkout_id_idx" ON "subscriptions" USING btree ("source_checkout_id");
CREATE INDEX IF NOT EXISTS "support_cases_status_updated_idx" ON "support_cases" USING btree ("status","updated_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "support_cases_user_idx" ON "support_cases" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "support_notes_case_idx" ON "support_notes" USING btree ("case_id","created_at");
CREATE INDEX IF NOT EXISTS "user_inbox_unread_idx" ON "user_inbox" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "user_inbox"."read_at" is null and "user_inbox"."dismissed_at" is null;
CREATE UNIQUE INDEX IF NOT EXISTS "user_inbox_welcome_uidx" ON "user_inbox" USING btree ("user_id","kind") WHERE "user_inbox"."kind" = 'welcome';
CREATE UNIQUE INDEX IF NOT EXISTS "account_integrations_provider_owner_instance_uidx" ON "account_integrations" USING btree ("account_owner_id","provider","instance_id");
CREATE INDEX IF NOT EXISTS "account_integrations_owner_idx" ON "account_integrations" USING btree ("account_owner_id");
CREATE INDEX IF NOT EXISTS "video_daily_stats_user_day_idx" ON "video_daily_stats" USING btree ("user_id","day" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_events_owner_video_created_idx" ON "video_events" USING btree ("user_id","video_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_events_video_type_created_idx" ON "video_events" USING btree ("video_id","event_type","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_events_live_idx" ON "video_events" USING btree ("video_id","created_at" DESC NULLS LAST) WHERE "video_events"."event_type" in ('impression', 'play', 'progress');
CREATE INDEX IF NOT EXISTS "video_events_attribution_idx" ON "video_events" USING btree ("user_id","video_id","campaign_id","creative_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_events_risk_idx" ON "video_events" USING btree ("user_id","video_id","risk_score","created_at" DESC NULLS LAST) WHERE "video_events"."risk_score" >= 60;
CREATE INDEX IF NOT EXISTS "video_events_campaign_idx" ON "video_events" USING btree ("campaign_id") WHERE "video_events"."campaign_id" is not null;
CREATE INDEX IF NOT EXISTS "video_events_viewer_id_idx" ON "video_events" USING btree ("viewer_id") WHERE "video_events"."viewer_id" is not null;
CREATE INDEX IF NOT EXISTS "video_events_video_event_type_idx" ON "video_events" USING btree ("video_id","event_type");
CREATE INDEX IF NOT EXISTS "video_events_video_created_idx" ON "video_events" USING btree ("video_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_events_conversion_created_idx" ON "video_events" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "video_events"."event_type" = 'conversion';
CREATE INDEX IF NOT EXISTS "video_events_user_event_created_idx" ON "video_events" USING btree ("user_id","event_type","created_at" DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS "video_events_unique_transaction_idx" ON "video_events" USING btree ("video_id","transaction_id") WHERE "video_events"."event_type" = 'conversion' and "video_events"."transaction_id" is not null;
CREATE INDEX IF NOT EXISTS "video_folders_user_created_idx" ON "video_folders" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_live_sessions_active_idx" ON "video_live_sessions" USING btree ("video_id","last_seen_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "video_live_sessions_viewer_id_idx" ON "video_live_sessions" USING btree ("viewer_id") WHERE "video_live_sessions"."viewer_id" is not null;
CREATE UNIQUE INDEX IF NOT EXISTS "video_versions_one_active_idx" ON "video_versions" USING btree ("video_id") WHERE "video_versions"."is_active";
CREATE INDEX IF NOT EXISTS "videos_user_created_idx" ON "videos" USING btree ("user_id","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "videos_user_status_created_idx" ON "videos" USING btree ("user_id","status","created_at" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "videos_folder_id_idx" ON "videos" USING btree ("folder_id");
CREATE INDEX IF NOT EXISTS "videos_storage_provider_idx" ON "videos" USING btree ("storage_provider","status");
CREATE INDEX IF NOT EXISTS "visibility_checks_target_idx" ON "visibility_checks" USING btree ("target_id","checked_at" DESC NULLS LAST);

-- ============================================================================
-- MIGRATIONS INCREMENTAIS (idempotentes) — Stripe Opção A (drizzle 0002)
-- ============================================================================
-- Para bancos criados ANTES do Stripe: o CREATE TABLE IF NOT EXISTS acima
-- não altera tabelas existentes — este bloco converte o schema atual.
-- Bancos novos já nascem com tudo (o DDL acima já reflete).

-- Customer do Stripe criado no primeiro Checkout (portal + reuso de session).
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;

-- Idempotência de webhooks do Stripe: a MESMA tabela que a AbacatePay usa
-- (o admin/UptimeCard continua lendo sem mudança) — libera o provider.
ALTER TABLE "payment_webhook_events" DROP CONSTRAINT IF EXISTS "payment_webhook_events_provider_check";
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_provider_check" CHECK ("payment_webhook_events"."provider" in ('abacatepay', 'stripe'));

-- Razão do ledger para compras de créditos via Stripe Checkout.
ALTER TABLE "ai_credit_ledger" DROP CONSTRAINT IF EXISTS "ai_credit_ledger_reason_check";
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_reason_check" CHECK ("ai_credit_ledger"."reason" in ('purchase', 'plan_grant', 'usage', 'refund', 'adjustment', 'stripe_checkout'));

-- ============================================================================
-- MIGRAÇÃO INCREMENTAL (idempotente) — pesquisa de churn (drizzle 0003)
-- ============================================================================
-- Tabela da pesquisa de cancelamento (spec Billing Completo, item 4). O
-- CREATE TABLE IF NOT EXISTS acima já cobre bancos novos; este bloco é o
-- mesmo DDL isolado para bancos existentes — pode colar e executar direto:

CREATE TABLE IF NOT EXISTS "billing_churn_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_churn_surveys_reason_check" CHECK ("billing_churn_surveys"."reason" in ('preco', 'nao_uso', 'problemas_tecnicos', 'migrei_ferramenta', 'outro')),
	CONSTRAINT "billing_churn_surveys_feedback_check" CHECK ("billing_churn_surveys"."feedback" is null or char_length("billing_churn_surveys"."feedback") <= 1100)
);
CREATE INDEX IF NOT EXISTS "billing_churn_surveys_user_created_idx" ON "billing_churn_surveys" USING btree ("user_id","created_at" DESC NULLS LAST);
ALTER TABLE public."billing_churn_surveys" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_churn_surveys_select" ON public."billing_churn_surveys";
CREATE POLICY "billing_churn_surveys_select" ON public."billing_churn_surveys" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_churn_surveys_insert" ON public."billing_churn_surveys";
CREATE POLICY "billing_churn_surveys_insert" ON public."billing_churn_surveys" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());

-- ============================================================================
-- ROW LEVEL SECURITY — habilita e restringe por proprietário (auth.user_id())
-- ============================================================================

-- profiles (dono: id)
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON public."profiles";
CREATE POLICY "profiles_select" ON public."profiles" FOR SELECT TO authenticated USING ("id" = auth.user_id());
DROP POLICY IF EXISTS "profiles_insert" ON public."profiles";
CREATE POLICY "profiles_insert" ON public."profiles" FOR INSERT TO authenticated WITH CHECK ("id" = auth.user_id());
DROP POLICY IF EXISTS "profiles_update" ON public."profiles";
CREATE POLICY "profiles_update" ON public."profiles" FOR UPDATE TO authenticated USING ("id" = auth.user_id()) WITH CHECK ("id" = auth.user_id());
DROP POLICY IF EXISTS "profiles_delete" ON public."profiles";
CREATE POLICY "profiles_delete" ON public."profiles" FOR DELETE TO authenticated USING ("id" = auth.user_id());

-- video_folders (dono: user_id)
ALTER TABLE public."video_folders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_folders_select" ON public."video_folders";
CREATE POLICY "video_folders_select" ON public."video_folders" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_folders_insert" ON public."video_folders";
CREATE POLICY "video_folders_insert" ON public."video_folders" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_folders_update" ON public."video_folders";
CREATE POLICY "video_folders_update" ON public."video_folders" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_folders_delete" ON public."video_folders";
CREATE POLICY "video_folders_delete" ON public."video_folders" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- videos (dono: user_id)
ALTER TABLE public."videos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "videos_select" ON public."videos";
CREATE POLICY "videos_select" ON public."videos" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "videos_insert" ON public."videos";
CREATE POLICY "videos_insert" ON public."videos" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "videos_update" ON public."videos";
CREATE POLICY "videos_update" ON public."videos" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "videos_delete" ON public."videos";
CREATE POLICY "videos_delete" ON public."videos" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- player_configs (dono: user_id)
ALTER TABLE public."player_configs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_configs_select" ON public."player_configs";
CREATE POLICY "player_configs_select" ON public."player_configs" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_configs_insert" ON public."player_configs";
CREATE POLICY "player_configs_insert" ON public."player_configs" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_configs_update" ON public."player_configs";
CREATE POLICY "player_configs_update" ON public."player_configs" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_configs_delete" ON public."player_configs";
CREATE POLICY "player_configs_delete" ON public."player_configs" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- video_events (dono: user_id)
ALTER TABLE public."video_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_events_select" ON public."video_events";
CREATE POLICY "video_events_select" ON public."video_events" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_events_insert" ON public."video_events";
CREATE POLICY "video_events_insert" ON public."video_events" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_events_update" ON public."video_events";
CREATE POLICY "video_events_update" ON public."video_events" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_events_delete" ON public."video_events";
CREATE POLICY "video_events_delete" ON public."video_events" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- video_live_sessions (dono: user_id)
ALTER TABLE public."video_live_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_live_sessions_select" ON public."video_live_sessions";
CREATE POLICY "video_live_sessions_select" ON public."video_live_sessions" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_live_sessions_insert" ON public."video_live_sessions";
CREATE POLICY "video_live_sessions_insert" ON public."video_live_sessions" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_live_sessions_update" ON public."video_live_sessions";
CREATE POLICY "video_live_sessions_update" ON public."video_live_sessions" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_live_sessions_delete" ON public."video_live_sessions";
CREATE POLICY "video_live_sessions_delete" ON public."video_live_sessions" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- video_versions (dono: user_id)
ALTER TABLE public."video_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_versions_select" ON public."video_versions";
CREATE POLICY "video_versions_select" ON public."video_versions" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_versions_insert" ON public."video_versions";
CREATE POLICY "video_versions_insert" ON public."video_versions" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_versions_update" ON public."video_versions";
CREATE POLICY "video_versions_update" ON public."video_versions" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_versions_delete" ON public."video_versions";
CREATE POLICY "video_versions_delete" ON public."video_versions" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ab_tests (dono: user_id)
ALTER TABLE public."ab_tests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ab_tests_select" ON public."ab_tests";
CREATE POLICY "ab_tests_select" ON public."ab_tests" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_tests_insert" ON public."ab_tests";
CREATE POLICY "ab_tests_insert" ON public."ab_tests" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_tests_update" ON public."ab_tests";
CREATE POLICY "ab_tests_update" ON public."ab_tests" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_tests_delete" ON public."ab_tests";
CREATE POLICY "ab_tests_delete" ON public."ab_tests" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ab_test_variants (dono: user_id)
ALTER TABLE public."ab_test_variants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ab_test_variants_select" ON public."ab_test_variants";
CREATE POLICY "ab_test_variants_select" ON public."ab_test_variants" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_variants_insert" ON public."ab_test_variants";
CREATE POLICY "ab_test_variants_insert" ON public."ab_test_variants" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_variants_update" ON public."ab_test_variants";
CREATE POLICY "ab_test_variants_update" ON public."ab_test_variants" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_variants_delete" ON public."ab_test_variants";
CREATE POLICY "ab_test_variants_delete" ON public."ab_test_variants" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ab_test_folders (dono: user_id)
ALTER TABLE public."ab_test_folders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ab_test_folders_select" ON public."ab_test_folders";
CREATE POLICY "ab_test_folders_select" ON public."ab_test_folders" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_folders_insert" ON public."ab_test_folders";
CREATE POLICY "ab_test_folders_insert" ON public."ab_test_folders" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_folders_update" ON public."ab_test_folders";
CREATE POLICY "ab_test_folders_update" ON public."ab_test_folders" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ab_test_folders_delete" ON public."ab_test_folders";
CREATE POLICY "ab_test_folders_delete" ON public."ab_test_folders" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- account_access (dono: user_id)
ALTER TABLE public."account_access" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_access_select" ON public."account_access";
CREATE POLICY "account_access_select" ON public."account_access" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_access_insert" ON public."account_access";
CREATE POLICY "account_access_insert" ON public."account_access" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_access_update" ON public."account_access";
CREATE POLICY "account_access_update" ON public."account_access" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_access_delete" ON public."account_access";
CREATE POLICY "account_access_delete" ON public."account_access" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- account_security_settings (dono: user_id)
ALTER TABLE public."account_security_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_security_settings_select" ON public."account_security_settings";
CREATE POLICY "account_security_settings_select" ON public."account_security_settings" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_security_settings_insert" ON public."account_security_settings";
CREATE POLICY "account_security_settings_insert" ON public."account_security_settings" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_security_settings_update" ON public."account_security_settings";
CREATE POLICY "account_security_settings_update" ON public."account_security_settings" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_security_settings_delete" ON public."account_security_settings";
CREATE POLICY "account_security_settings_delete" ON public."account_security_settings" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- security_events (dono: user_id)
ALTER TABLE public."security_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "security_events_select" ON public."security_events";
CREATE POLICY "security_events_select" ON public."security_events" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "security_events_insert" ON public."security_events";
CREATE POLICY "security_events_insert" ON public."security_events" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "security_events_update" ON public."security_events";
CREATE POLICY "security_events_update" ON public."security_events" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "security_events_delete" ON public."security_events";
CREATE POLICY "security_events_delete" ON public."security_events" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- intelligence_controls (dono: user_id)
ALTER TABLE public."intelligence_controls" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intelligence_controls_select" ON public."intelligence_controls";
CREATE POLICY "intelligence_controls_select" ON public."intelligence_controls" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "intelligence_controls_insert" ON public."intelligence_controls";
CREATE POLICY "intelligence_controls_insert" ON public."intelligence_controls" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "intelligence_controls_update" ON public."intelligence_controls";
CREATE POLICY "intelligence_controls_update" ON public."intelligence_controls" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "intelligence_controls_delete" ON public."intelligence_controls";
CREATE POLICY "intelligence_controls_delete" ON public."intelligence_controls" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ai_analysis_jobs (dono: user_id)
ALTER TABLE public."ai_analysis_jobs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_analysis_jobs_select" ON public."ai_analysis_jobs";
CREATE POLICY "ai_analysis_jobs_select" ON public."ai_analysis_jobs" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_analysis_jobs_insert" ON public."ai_analysis_jobs";
CREATE POLICY "ai_analysis_jobs_insert" ON public."ai_analysis_jobs" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_analysis_jobs_update" ON public."ai_analysis_jobs";
CREATE POLICY "ai_analysis_jobs_update" ON public."ai_analysis_jobs" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_analysis_jobs_delete" ON public."ai_analysis_jobs";
CREATE POLICY "ai_analysis_jobs_delete" ON public."ai_analysis_jobs" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ai_credit_wallets (dono: user_id)
ALTER TABLE public."ai_credit_wallets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credit_wallets_select" ON public."ai_credit_wallets";
CREATE POLICY "ai_credit_wallets_select" ON public."ai_credit_wallets" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_wallets_insert" ON public."ai_credit_wallets";
CREATE POLICY "ai_credit_wallets_insert" ON public."ai_credit_wallets" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_wallets_update" ON public."ai_credit_wallets";
CREATE POLICY "ai_credit_wallets_update" ON public."ai_credit_wallets" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_wallets_delete" ON public."ai_credit_wallets";
CREATE POLICY "ai_credit_wallets_delete" ON public."ai_credit_wallets" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ai_credit_checkouts (dono: user_id)
ALTER TABLE public."ai_credit_checkouts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credit_checkouts_select" ON public."ai_credit_checkouts";
CREATE POLICY "ai_credit_checkouts_select" ON public."ai_credit_checkouts" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_checkouts_insert" ON public."ai_credit_checkouts";
CREATE POLICY "ai_credit_checkouts_insert" ON public."ai_credit_checkouts" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_checkouts_update" ON public."ai_credit_checkouts";
CREATE POLICY "ai_credit_checkouts_update" ON public."ai_credit_checkouts" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_checkouts_delete" ON public."ai_credit_checkouts";
CREATE POLICY "ai_credit_checkouts_delete" ON public."ai_credit_checkouts" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- ai_credit_ledger (dono: user_id)
ALTER TABLE public."ai_credit_ledger" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credit_ledger_select" ON public."ai_credit_ledger";
CREATE POLICY "ai_credit_ledger_select" ON public."ai_credit_ledger" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_ledger_insert" ON public."ai_credit_ledger";
CREATE POLICY "ai_credit_ledger_insert" ON public."ai_credit_ledger" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_ledger_update" ON public."ai_credit_ledger";
CREATE POLICY "ai_credit_ledger_update" ON public."ai_credit_ledger" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "ai_credit_ledger_delete" ON public."ai_credit_ledger";
CREATE POLICY "ai_credit_ledger_delete" ON public."ai_credit_ledger" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- billing_churn_surveys (dono: user_id; append-only — sem policy de
-- update/delete, a role authenticated não altera pesquisa registrada)
ALTER TABLE public."billing_churn_surveys" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_churn_surveys_select" ON public."billing_churn_surveys";
CREATE POLICY "billing_churn_surveys_select" ON public."billing_churn_surveys" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_churn_surveys_insert" ON public."billing_churn_surveys";
CREATE POLICY "billing_churn_surveys_insert" ON public."billing_churn_surveys" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());

-- billing_customers (dono: user_id)
ALTER TABLE public."billing_customers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_customers_select" ON public."billing_customers";
CREATE POLICY "billing_customers_select" ON public."billing_customers" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_customers_insert" ON public."billing_customers";
CREATE POLICY "billing_customers_insert" ON public."billing_customers" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_customers_update" ON public."billing_customers";
CREATE POLICY "billing_customers_update" ON public."billing_customers" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_customers_delete" ON public."billing_customers";
CREATE POLICY "billing_customers_delete" ON public."billing_customers" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- billing_checkouts (dono: user_id)
ALTER TABLE public."billing_checkouts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_checkouts_select" ON public."billing_checkouts";
CREATE POLICY "billing_checkouts_select" ON public."billing_checkouts" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_checkouts_insert" ON public."billing_checkouts";
CREATE POLICY "billing_checkouts_insert" ON public."billing_checkouts" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_checkouts_update" ON public."billing_checkouts";
CREATE POLICY "billing_checkouts_update" ON public."billing_checkouts" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "billing_checkouts_delete" ON public."billing_checkouts";
CREATE POLICY "billing_checkouts_delete" ON public."billing_checkouts" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- subscriptions (dono: user_id)
ALTER TABLE public."subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_select" ON public."subscriptions";
CREATE POLICY "subscriptions_select" ON public."subscriptions" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "subscriptions_insert" ON public."subscriptions";
CREATE POLICY "subscriptions_insert" ON public."subscriptions" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "subscriptions_update" ON public."subscriptions";
CREATE POLICY "subscriptions_update" ON public."subscriptions" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "subscriptions_delete" ON public."subscriptions";
CREATE POLICY "subscriptions_delete" ON public."subscriptions" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- account_teams (dono: owner_id)
ALTER TABLE public."account_teams" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_teams_select" ON public."account_teams";
CREATE POLICY "account_teams_select" ON public."account_teams" FOR SELECT TO authenticated USING ("owner_id" = auth.user_id());
DROP POLICY IF EXISTS "account_teams_insert" ON public."account_teams";
CREATE POLICY "account_teams_insert" ON public."account_teams" FOR INSERT TO authenticated WITH CHECK ("owner_id" = auth.user_id());
DROP POLICY IF EXISTS "account_teams_update" ON public."account_teams";
CREATE POLICY "account_teams_update" ON public."account_teams" FOR UPDATE TO authenticated USING ("owner_id" = auth.user_id()) WITH CHECK ("owner_id" = auth.user_id());
DROP POLICY IF EXISTS "account_teams_delete" ON public."account_teams";
CREATE POLICY "account_teams_delete" ON public."account_teams" FOR DELETE TO authenticated USING ("owner_id" = auth.user_id());

-- account_team_members (dono: user_id)
ALTER TABLE public."account_team_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_team_members_select" ON public."account_team_members";
-- Hardening 2026-10-27: membros da mesma equipe podem ver uns aos outros.
-- A policy anterior (user_id = auth.user_id()) impedia listagem de colegas via RLS;
-- o servidor já contorna isso com conexão owner, mas a defesa em profundidade exige
-- que o RLS também reflita a regra de negócio correta.
CREATE POLICY "account_team_members_select" ON public."account_team_members" FOR SELECT TO authenticated USING (
  "team_id" IN (SELECT "team_id" FROM public."account_team_members" WHERE "user_id" = auth.user_id())
);
DROP POLICY IF EXISTS "account_team_members_insert" ON public."account_team_members";
CREATE POLICY "account_team_members_insert" ON public."account_team_members" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_team_members_update" ON public."account_team_members";
CREATE POLICY "account_team_members_update" ON public."account_team_members" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "account_team_members_delete" ON public."account_team_members";
CREATE POLICY "account_team_members_delete" ON public."account_team_members" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- user_inbox (dono: user_id)
ALTER TABLE public."user_inbox" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_inbox_select" ON public."user_inbox";
CREATE POLICY "user_inbox_select" ON public."user_inbox" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "user_inbox_insert" ON public."user_inbox";
CREATE POLICY "user_inbox_insert" ON public."user_inbox" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "user_inbox_update" ON public."user_inbox";
CREATE POLICY "user_inbox_update" ON public."user_inbox" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "user_inbox_delete" ON public."user_inbox";
CREATE POLICY "user_inbox_delete" ON public."user_inbox" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());
ALTER TABLE public."account_integrations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_integrations_owner" ON public."account_integrations";
CREATE POLICY "account_integrations_owner" ON public."account_integrations" FOR ALL TO authenticated USING ("account_owner_id" = auth.user_id()) WITH CHECK ("account_owner_id" = auth.user_id());

-- element_experiments (dono: user_id)
ALTER TABLE public."element_experiments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "element_experiments_select" ON public."element_experiments";
CREATE POLICY "element_experiments_select" ON public."element_experiments" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiments_insert" ON public."element_experiments";
CREATE POLICY "element_experiments_insert" ON public."element_experiments" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiments_update" ON public."element_experiments";
CREATE POLICY "element_experiments_update" ON public."element_experiments" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiments_delete" ON public."element_experiments";
CREATE POLICY "element_experiments_delete" ON public."element_experiments" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- element_experiment_variants (dono: user_id)
ALTER TABLE public."element_experiment_variants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "element_experiment_variants_select" ON public."element_experiment_variants";
CREATE POLICY "element_experiment_variants_select" ON public."element_experiment_variants" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiment_variants_insert" ON public."element_experiment_variants";
CREATE POLICY "element_experiment_variants_insert" ON public."element_experiment_variants" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiment_variants_update" ON public."element_experiment_variants";
CREATE POLICY "element_experiment_variants_update" ON public."element_experiment_variants" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "element_experiment_variants_delete" ON public."element_experiment_variants";
CREATE POLICY "element_experiment_variants_delete" ON public."element_experiment_variants" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- embed_monitors (dono: user_id)
ALTER TABLE public."embed_monitors" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "embed_monitors_select" ON public."embed_monitors";
CREATE POLICY "embed_monitors_select" ON public."embed_monitors" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "embed_monitors_insert" ON public."embed_monitors";
CREATE POLICY "embed_monitors_insert" ON public."embed_monitors" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "embed_monitors_update" ON public."embed_monitors";
CREATE POLICY "embed_monitors_update" ON public."embed_monitors" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "embed_monitors_delete" ON public."embed_monitors";
CREATE POLICY "embed_monitors_delete" ON public."embed_monitors" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- player_events (dono: user_id)
ALTER TABLE public."player_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "player_events_select" ON public."player_events";
CREATE POLICY "player_events_select" ON public."player_events" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_events_insert" ON public."player_events";
CREATE POLICY "player_events_insert" ON public."player_events" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_events_update" ON public."player_events";
CREATE POLICY "player_events_update" ON public."player_events" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "player_events_delete" ON public."player_events";
CREATE POLICY "player_events_delete" ON public."player_events" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- video_daily_stats (dono: user_id)
ALTER TABLE public."video_daily_stats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_daily_stats_select" ON public."video_daily_stats";
CREATE POLICY "video_daily_stats_select" ON public."video_daily_stats" FOR SELECT TO authenticated USING ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_daily_stats_insert" ON public."video_daily_stats";
CREATE POLICY "video_daily_stats_insert" ON public."video_daily_stats" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_daily_stats_update" ON public."video_daily_stats";
CREATE POLICY "video_daily_stats_update" ON public."video_daily_stats" FOR UPDATE TO authenticated USING ("user_id" = auth.user_id()) WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "video_daily_stats_delete" ON public."video_daily_stats";
CREATE POLICY "video_daily_stats_delete" ON public."video_daily_stats" FOR DELETE TO authenticated USING ("user_id" = auth.user_id());

-- support_cases (dono: user_id nullable — linhas sem dono só via owner role)
ALTER TABLE public."support_cases" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support_cases_select" ON public."support_cases";
CREATE POLICY "support_cases_select" ON public."support_cases" FOR SELECT TO authenticated USING ("user_id" IS NOT DISTINCT FROM auth.user_id());
DROP POLICY IF EXISTS "support_cases_insert" ON public."support_cases";
CREATE POLICY "support_cases_insert" ON public."support_cases" FOR INSERT TO authenticated WITH CHECK ("user_id" = auth.user_id());
DROP POLICY IF EXISTS "support_cases_update" ON public."support_cases";
CREATE POLICY "support_cases_update" ON public."support_cases" FOR UPDATE TO authenticated USING ("user_id" IS NOT DISTINCT FROM auth.user_id()) WITH CHECK ("user_id" IS NOT DISTINCT FROM auth.user_id());

-- account_team_invites (leitura apenas dos convites relacionados a mim; escritas via servidor)
ALTER TABLE public."account_team_invites" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "account_team_invites_select" ON public."account_team_invites";
CREATE POLICY "account_team_invites_select" ON public."account_team_invites" FOR SELECT TO authenticated USING ("accepted_by" = auth.user_id() OR "invited_by" = auth.user_id());

-- Catálogos globais (leitura autenticada; escrita via servidor)
-- Hardening 2026-10-27: removido USING (true) — catálogos são dados da plataforma,
-- mas acesso anônimo ao DB não deve listar planos/templates/créditos sem sessão.
ALTER TABLE public."billing_plans" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_plans_select" ON public."billing_plans";
CREATE POLICY "billing_plans_select" ON public."billing_plans" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);
ALTER TABLE public."conversion_templates" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversion_templates_select" ON public."conversion_templates";
CREATE POLICY "conversion_templates_select" ON public."conversion_templates" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);
ALTER TABLE public."ai_credit_products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_credit_products_select" ON public."ai_credit_products";
CREATE POLICY "ai_credit_products_select" ON public."ai_credit_products" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);


-- Tabelas de sistema: SEM policy => nenhuma role de aplicação lê/escreve
-- (apenas a conexão owner do servidor, que bypassa RLS). Não habilite RLS
-- aqui sem adicionar policies — ENABLE sem policy já nega app roles.
--   admin_audit_log, payment_webhook_events, rate_limits, seo_targets,
--   visibility_checks
ALTER TABLE public."admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seo_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."visibility_checks" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- GRANTs (RLS decide as linhas; conexão owner do app bypassa e mantém acesso)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

