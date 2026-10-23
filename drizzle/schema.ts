/**
 * Prisma Player — schema Drizzle (Lakebase Postgres / Neon).
 *
 * Consolidado de `docs/archive/legacy-supabase/migrations/*.sql` (37 migrations, ordem
 * cronológica), respeitando drops posteriores:
 *   - tabelas do Better Auth legado ("user", "session", "account",
 *     "verification", "better_auth_*") foram dropadas — auth agora é
 *     Neon Auth (Managed Better Auth), fora deste schema;
 *   - o billing antigo (payment_events, subscription_*, play_pack_products)
 *     foi removido e recriado via AbacatePay.
 *
 * Decisões de design (detalhes em docs/neon-migration/):
 *   - `user_id`/`owner_id`/`admin_*_id` são TEXT: os ids do Neon Auth
 *     (Better Auth) são textuais. Não há FK para o schema de auth — o
 *     sync do Neon Auth gerencia `neon_auth` e a integridade usuário→dados
 *     é aplicada no servidor (filtros por accountOwnerId no guard).
 *   - RLS: as policies completas (auth.user_id() + roles authenticated)
 *     vivem em docs/neon-migration/neon-schema.sql — defesa em profundidade
 *     no banco. A camada primária continua sendo o servidor Next.js, que
 *     sempre filtra por accountOwnerId (guard()); a conexão da aplicação é
 *     owner e bypassa RLS por design do Postgres.
 *   - IDs de produto permanecem UUID (`gen_random_uuid()`).
 *   - `storage_provider` restrito a 'r2': Cloudflare R2 é o único storage
 *     a partir da migração (começo limpo, sem binários legados).
 *   - `videos.folder_id` / `ab_tests.folder_id` usam FK simples
 *     (ON DELETE SET NULL); a garantia de dono do folder é aplicada nas
 *     queries do app (o par (id, user_id) do folder).
 *   - FKs compostas (video_id, user_id) → videos(id, user_id) foram
 *     mantidas onde o DELETE original era CASCADE: elas impedem gravar
 *     eventos/sessões de um vídeo que não pertence ao mesmo usuário.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Perfis — espelho do usuário Neon Auth (id TEXT).                    */
/* ------------------------------------------------------------------ */

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    // Customer do Stripe criado no primeiro Checkout — alimenta o
    // Customer Portal e o reuso de customer nas próximas sessions.
    stripeCustomerId: text("stripe_customer_id"),
    locale: text("locale").notNull().default("pt-BR"),
    emailNotifications: boolean("email_notifications").notNull().default(true),
    securityNotifications: boolean("security_notifications").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("profiles_locale_check", sql`${t.locale} in ('pt-BR', 'es', 'en')`)],
);

/* ------------------------------------------------------------------ */
/* Núcleo: pastas, vídeos e player.                                    */
/* ------------------------------------------------------------------ */

export const videoFolders = pgTable(
  "video_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("video_folders_user_id_name_key").on(t.userId, t.name),
    unique("video_folders_id_user_id_key").on(t.id, t.userId),
    check("video_folders_name_check", sql`char_length(${t.name}) between 1 and 100`),
    index("video_folders_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    folderId: uuid("folder_id"),
    title: text("title").notNull(),
    objectPath: text("object_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull().default("draft"),
    durationSeconds: numeric("duration_seconds", { precision: 12, scale: 3 }),
    // R2 é o único storage na migração; começo limpo, sem 'supabase'.
    storageProvider: text("storage_provider").notNull().default("r2"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("videos_user_id_object_path_key").on(t.userId, t.objectPath),
    unique("videos_id_user_id_key").on(t.id, t.userId),
    foreignKey({
      name: "videos_folder_id_fkey",
      columns: [t.folderId],
      foreignColumns: [videoFolders.id],
    }).onDelete("set null"),
    check("videos_title_check", sql`char_length(${t.title}) between 1 and 200`),
    check("videos_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check(
      "videos_status_check",
      sql`${t.status} in ('draft', 'processing', 'ready', 'failed', 'archived')`,
    ),
    check("videos_storage_provider_check", sql`${t.storageProvider} in ('r2')`),
    index("videos_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("videos_user_status_created_idx").on(t.userId, t.status, t.createdAt.desc()),
    index("videos_folder_id_idx").on(t.folderId),
    index("videos_storage_provider_idx").on(t.storageProvider, t.status),
  ],
);

export const playerConfigs = pgTable(
  "player_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    config: jsonb("config").notNull().default({}),
    allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("player_configs_video_id_key").on(t.videoId),
    foreignKey({
      name: "player_configs_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    index("player_configs_user_id_idx").on(t.userId),
    index("player_configs_video_id_idx").on(t.videoId),
  ],
);

/* ------------------------------------------------------------------ */
/* Segurança da conta.                                                 */
/* ------------------------------------------------------------------ */

export const securityEvents = pgTable(
  "security_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_events_user_created_idx").on(t.userId, t.createdAt.desc())],
);

export const accountSecuritySettings = pgTable("account_security_settings", {
  userId: text("user_id").primaryKey(),
  allowedDomains: text("allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Analytics de vídeo (eventos de player e sessões ativas).            */
/* ------------------------------------------------------------------ */

export const videoEvents = pgTable(
  "video_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    eventType: text("event_type").notNull(),
    progressPercent: smallint("progress_percent").notNull().default(0),
    watchedSeconds: numeric("watched_seconds", { precision: 12, scale: 3 }).notNull().default("0"),
    countryCode: text("country_code").notNull().default("XX"),
    deviceType: text("device_type").notNull().default("desktop"),
    osName: text("os_name").notNull().default("Other"),
    browserName: text("browser_name").notNull().default("Other"),
    trafficSource: text("traffic_source").notNull().default("Direto"),
    // Atribuição de tráfego e anti-fraude.
    pageUrl: text("page_url"),
    campaignId: text("campaign_id"),
    creativeId: text("creative_id"),
    adId: text("ad_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    riskScore: smallint("risk_score").notNull().default(0),
    riskReasons: text("risk_reasons").array().notNull().default(sql`'{}'::text[]`),
    // Atribuição entre visitas (PRISMA R1.2).
    viewerId: text("viewer_id"),
    // Pixel / conversão.
    transactionId: text("transaction_id"),
    conversionValue: numeric("conversion_value", { precision: 14, scale: 2 }),
    currency: text("currency"),
    advertisingConsent: boolean("advertising_consent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("video_events_session_event_key").on(
      t.videoId,
      t.sessionId,
      t.eventType,
      t.progressPercent,
    ),
    foreignKey({
      name: "video_events_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check(
      "video_events_event_type_check",
      sql`${t.eventType} in ('impression', 'play', 'progress', 'complete', 'cta_click', 'conversion')`,
    ),
    check(
      "video_events_progress_percent_check",
      sql`${t.progressPercent} in (0, 10, 25, 50, 75, 90, 100)`,
    ),
    check("video_events_watched_seconds_check", sql`${t.watchedSeconds} >= 0`),
    check("video_events_country_code_check", sql`char_length(${t.countryCode}) = 2`),
    check(
      "video_events_device_type_check",
      sql`${t.deviceType} in ('desktop', 'mobile', 'tablet', 'other')`,
    ),
    check("video_events_risk_score_check", sql`${t.riskScore} between 0 and 100`),
    check(
      "video_events_conversion_fields_check",
      sql`${t.eventType} <> 'conversion' or (
        ${t.transactionId} is not null and char_length(${t.transactionId}) between 1 and 120 and
        ${t.conversionValue} is not null and ${t.conversionValue} >= 0 and
        ${t.currency} ~ '^[A-Z]{3}$'
      )`,
    ),
    index("video_events_owner_video_created_idx").on(t.userId, t.videoId, t.createdAt.desc()),
    index("video_events_video_type_created_idx").on(t.videoId, t.eventType, t.createdAt.desc()),
    index("video_events_live_idx")
      .on(t.videoId, t.createdAt.desc())
      .where(sql`${t.eventType} in ('impression', 'play', 'progress')`),
    index("video_events_attribution_idx").on(
      t.userId,
      t.videoId,
      t.campaignId,
      t.creativeId,
      t.createdAt.desc(),
    ),
    index("video_events_risk_idx")
      .on(t.userId, t.videoId, t.riskScore, t.createdAt.desc())
      .where(sql`${t.riskScore} >= 60`),
    index("video_events_campaign_idx")
      .on(t.campaignId)
      .where(sql`${t.campaignId} is not null`),
    index("video_events_viewer_id_idx")
      .on(t.viewerId)
      .where(sql`${t.viewerId} is not null`),
    index("video_events_video_event_type_idx").on(t.videoId, t.eventType),
    index("video_events_video_created_idx").on(t.videoId, t.createdAt.desc()),
    index("video_events_conversion_created_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.eventType} = 'conversion'`),
    index("video_events_user_event_created_idx").on(t.userId, t.eventType, t.createdAt.desc()),
    uniqueIndex("video_events_unique_transaction_idx")
      .on(t.videoId, t.transactionId)
      .where(sql`${t.eventType} = 'conversion' and ${t.transactionId} is not null`),
  ],
);

export const videoLiveSessions = pgTable(
  "video_live_sessions",
  {
    videoId: uuid("video_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    userId: text("user_id").notNull(),
    countryCode: text("country_code").notNull().default("XX"),
    deviceType: text("device_type").notNull().default("other"),
    progressPercent: smallint("progress_percent").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    viewerId: text("viewer_id"),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.sessionId] }),
    foreignKey({
      name: "video_live_sessions_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check("video_live_sessions_country_code_check", sql`char_length(${t.countryCode}) = 2`),
    check(
      "video_live_sessions_device_type_check",
      sql`${t.deviceType} in ('desktop', 'mobile', 'tablet', 'other')`,
    ),
    check("video_live_sessions_progress_check", sql`${t.progressPercent} between 0 and 100`),
    index("video_live_sessions_active_idx").on(t.videoId, t.lastSeenAt.desc()),
    index("video_live_sessions_viewer_id_idx")
      .on(t.viewerId)
      .where(sql`${t.viewerId} is not null`),
  ],
);

export const videoVersions = pgTable(
  "video_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    objectPath: text("object_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: numeric("duration_seconds", { precision: 12, scale: 3 }),
    versionNumber: integer("version_number").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("video_versions_video_id_version_number_key").on(t.videoId, t.versionNumber),
    foreignKey({
      name: "video_versions_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check("video_versions_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check("video_versions_version_number_check", sql`${t.versionNumber} > 0`),
    uniqueIndex("video_versions_one_active_idx")
      .on(t.videoId)
      .where(sql`${t.isActive}`),
  ],
);

/* ------------------------------------------------------------------ */
/* Prisma IA: jobs de análise e templates de conversão.                */
/* ------------------------------------------------------------------ */

export const aiAnalysisJobs = pgTable(
  "ai_analysis_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id"),
    analysisType: text("analysis_type").notNull(),
    status: text("status").notNull().default("queued"),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    result: jsonb("result"),
    model: text("model"),
    errorCode: text("error_code"),
    creditsUsed: integer("credits_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "ai_analysis_jobs_video_id_fkey",
      columns: [t.videoId],
      foreignColumns: [videos.id],
    }).onDelete("cascade"),
    check(
      "ai_analysis_jobs_analysis_type_check",
      sql`${t.analysisType} in ('performance', 'retention', 'funnel', 'copy', 'experiment')`,
    ),
    check(
      "ai_analysis_jobs_status_check",
      sql`${t.status} in ('queued', 'processing', 'completed', 'failed')`,
    ),
    check("ai_analysis_jobs_credits_used_check", sql`${t.creditsUsed} >= 0`),
    index("ai_analysis_jobs_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("ai_analysis_jobs_video_id_idx").on(t.videoId),
    uniqueIndex("ai_analysis_jobs_one_active_per_user_idx")
      .on(t.userId)
      .where(sql`${t.status} in ('queued', 'processing')`),
  ],
);

export const conversionTemplates = pgTable(
  "conversion_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    config: jsonb("config").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "conversion_templates_category_check",
      sql`${t.category} in ('direct_response', 'webinar', 'lead_generation', 'product_launch')`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Monitoramento de embeds e experimentos de elemento.                 */
/* ------------------------------------------------------------------ */

export const embedMonitors = pgTable(
  "embed_monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    pageUrl: text("page_url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastStatus: text("last_status").notNull().default("pending"),
    lastHttpStatus: smallint("last_http_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("embed_monitors_video_id_page_url_key").on(t.videoId, t.pageUrl),
    foreignKey({
      name: "embed_monitors_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check("embed_monitors_page_url_check", sql`${t.pageUrl} ~ '^https://'`),
    check(
      "embed_monitors_last_status_check",
      sql`${t.lastStatus} in ('pending', 'healthy', 'missing', 'blocked', 'error')`,
    ),
    check("embed_monitors_consecutive_failures_check", sql`${t.consecutiveFailures} >= 0`),
    index("embed_monitors_due_idx")
      .on(t.enabled, t.lastCheckedAt)
      .where(sql`${t.enabled}`),
  ],
);

export const elementExperiments = pgTable(
  "element_experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    name: text("name").notNull(),
    elementType: text("element_type").notNull(),
    status: text("status").notNull().default("draft"),
    winningVariantId: uuid("winning_variant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("element_experiments_id_user_id_key").on(t.id, t.userId),
    foreignKey({
      name: "element_experiments_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check("element_experiments_name_check", sql`char_length(${t.name}) between 1 and 150`),
    check(
      "element_experiments_element_type_check",
      sql`${t.elementType} in ('headline', 'autoplay', 'cta', 'thumbnail', 'speed')`,
    ),
    check(
      "element_experiments_status_check",
      sql`${t.status} in ('draft', 'active', 'paused', 'completed')`,
    ),
    index("element_experiments_video_idx").on(t.userId, t.videoId, t.status),
  ],
);

export const elementExperimentVariants = pgTable(
  "element_experiment_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    experimentId: uuid("experiment_id").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").notNull(),
    weight: smallint("weight").notNull().default(50),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    conversions: bigint("conversions", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("element_experiment_variants_experiment_id_name_key").on(t.experimentId, t.name),
    foreignKey({
      name: "element_experiment_variants_experiment_owner_fk",
      columns: [t.experimentId, t.userId],
      foreignColumns: [elementExperiments.id, elementExperiments.userId],
    }).onDelete("cascade"),
    check("element_experiment_variants_weight_check", sql`${t.weight} between 1 and 100`),
  ],
);

/* ------------------------------------------------------------------ */
/* Testes A/B de vídeo.                                                */
/* ------------------------------------------------------------------ */

export const abTestFolders = pgTable(
  "ab_test_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ab_test_folders_user_id_name_key").on(t.userId, t.name),
    unique("ab_test_folders_id_user_id_key").on(t.id, t.userId),
    check("ab_test_folders_name_check", sql`char_length(${t.name}) between 1 and 100`),
    index("ab_test_folders_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const abTests = pgTable(
  "ab_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    folderId: uuid("folder_id"),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ab_tests_id_user_id_key").on(t.id, t.userId),
    foreignKey({
      name: "ab_tests_folder_id_fkey",
      columns: [t.folderId],
      foreignColumns: [abTestFolders.id],
    }).onDelete("set null"),
    check("ab_tests_name_check", sql`char_length(${t.name}) between 1 and 150`),
    check(
      "ab_tests_status_check",
      sql`${t.status} in ('draft', 'active', 'paused', 'completed')`,
    ),
    index("ab_tests_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("ab_tests_folder_idx").on(t.folderId),
  ],
);

export const abTestVariants = pgTable(
  "ab_test_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id").notNull(),
    userId: text("user_id").notNull(),
    videoId: uuid("video_id").notNull(),
    weight: smallint("weight").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ab_test_variants_test_id_video_id_key").on(t.testId, t.videoId),
    foreignKey({
      name: "ab_test_variants_test_owner_fk",
      columns: [t.testId, t.userId],
      foreignColumns: [abTests.id, abTests.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "ab_test_variants_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check("ab_test_variants_weight_check", sql`${t.weight} between 1 and 100`),
    index("ab_test_variants_test_idx").on(t.testId),
    index("ab_test_variants_user_idx").on(t.userId),
    index("ab_test_variants_video_id_idx").on(t.videoId),
  ],
);

export const playerEvents = pgTable(
  "player_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    testId: uuid("test_id").notNull(),
    variantId: uuid("variant_id").notNull(),
    videoId: uuid("video_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    eventType: text("event_type").notNull(),
    progressPercent: smallint("progress_percent").notNull().default(0),
    watchedSeconds: numeric("watched_seconds", { precision: 12, scale: 3 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("player_events_dedupe_key").on(
      t.testId,
      t.variantId,
      t.sessionId,
      t.eventType,
      t.progressPercent,
    ),
    foreignKey({
      name: "player_events_test_owner_fk",
      columns: [t.testId, t.userId],
      foreignColumns: [abTests.id, abTests.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "player_events_variant_id_fkey",
      columns: [t.variantId],
      foreignColumns: [abTestVariants.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "player_events_video_owner_fk",
      columns: [t.videoId, t.userId],
      foreignColumns: [videos.id, videos.userId],
    }).onDelete("cascade"),
    check(
      "player_events_event_type_check",
      sql`${t.eventType} in ('impression', 'play', 'progress', 'complete')`,
    ),
    check(
      "player_events_progress_percent_check",
      sql`${t.progressPercent} in (0, 25, 50, 75, 100)`,
    ),
    check("player_events_watched_seconds_check", sql`${t.watchedSeconds} >= 0`),
    index("player_events_owner_test_idx").on(t.userId, t.testId, t.createdAt.desc()),
    index("player_events_test_variant_idx").on(t.testId, t.variantId, t.eventType),
    index("player_events_variant_id_idx").on(t.variantId),
    index("player_events_video_id_idx").on(t.videoId),
  ],
);

/* ------------------------------------------------------------------ */
/* Controles da inteligência operacional.                              */
/* ------------------------------------------------------------------ */

export const intelligenceControls = pgTable(
  "intelligence_controls",
  {
    userId: text("user_id").primaryKey(),
    automaticReportsEnabled: boolean("automatic_reports_enabled").notNull().default(false),
    reportFrequency: text("report_frequency").notNull().default("weekly"),
    reportEmail: text("report_email"),
    // VSLs no resumo periódico — vazio = todas as VSLs prontas da conta.
    reportVideoIds: text("report_video_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    audienceSyncEnabled: boolean("audience_sync_enabled").notNull().default(false),
    audienceProvider: text("audience_provider").notNull().default("meta"),
    audienceRetentionThreshold: smallint("audience_retention_threshold").notNull().default(75),
    outgoingWebhooksEnabled: boolean("outgoing_webhooks_enabled").notNull().default(false),
    webhookUrl: text("webhook_url"),
    webhookEvents: text("webhook_events")
      .array()
      .notNull()
      .default(sql`ARRAY['play', 'cta_click', 'conversion']::text[]`),
    conversionAlertsEnabled: boolean("conversion_alerts_enabled").notNull().default(false),
    conversionDropThreshold: smallint("conversion_drop_threshold").notNull().default(20),
    alertWebhookEnabled: boolean("alert_webhook_enabled").notNull().default(false),
    alertWebhookUrl: text("alert_webhook_url"),
    // VSLs monitoradas pelo alerta de queda — vazio = todas as prontas da conta.
    alertVideoIds: text("alert_video_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    lastReportSentAt: timestamp("last_report_sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "intelligence_controls_report_frequency_check",
      sql`${t.reportFrequency} in ('daily', 'weekly', 'monthly')`,
    ),
    check(
      "intelligence_controls_audience_provider_check",
      sql`${t.audienceProvider} in ('meta', 'google', 'tiktok', 'kwai')`,
    ),
    check(
      "intelligence_controls_retention_threshold_check",
      sql`${t.audienceRetentionThreshold} in (25, 50, 75, 90, 100)`,
    ),
    check("intelligence_controls_webhook_url_check", sql`${t.webhookUrl} is null or ${t.webhookUrl} ~ '^https://'`),
    check(
      "intelligence_controls_alert_webhook_url_check",
      sql`${t.alertWebhookUrl} is null or ${t.alertWebhookUrl} ~ '^https://'`,
    ),
    check(
      "intelligence_controls_drop_threshold_check",
      sql`${t.conversionDropThreshold} between 5 and 90`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Billing — AbacatePay (PIX mensal avulso e cartão recorrente).       */
/* ------------------------------------------------------------------ */

export const billingPlans = pgTable(
  "billing_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    interval: text("interval").notNull().default("monthly"),
    includedPlays: integer("included_plays").notNull(),
    storageGb: integer("storage_gb").notNull(),
    prismaAiAnalyses: integer("prisma_ai_analyses").notNull(),
    teamSeats: integer("team_seats").notNull().default(1),
    playOverageMillicents: integer("play_overage_millicents").notNull().default(800),
    storageOverageCentsPerGb: integer("storage_overage_cents_per_gb").notNull().default(50),
    providerPixProductId: text("provider_pix_product_id").unique(),
    providerCardProductId: text("provider_card_product_id").unique(),
    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: smallint("display_order").notNull().default(0),
    automaticReports: boolean("automatic_reports").notNull().default(false),
    audienceSync: boolean("audience_sync").notNull().default(false),
    outgoingWebhooks: boolean("outgoing_webhooks").notNull().default(false),
    privateBenchmark: boolean("private_benchmark").notNull().default(false),
    portfolioComparison: boolean("portfolio_comparison").notNull().default(false),
    conversionDropAlerts: boolean("conversion_drop_alerts").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("billing_plans_amount_cents_check", sql`${t.amountCents} > 0`),
    check("billing_plans_currency_check", sql`${t.currency} = 'BRL'`),
    check("billing_plans_interval_check", sql`${t.interval} = 'monthly'`),
    check("billing_plans_included_plays_check", sql`${t.includedPlays} >= 0`),
    check("billing_plans_storage_gb_check", sql`${t.storageGb} >= 0`),
    check("billing_plans_prisma_ai_analyses_check", sql`${t.prismaAiAnalyses} >= 0`),
    check("billing_plans_team_seats_check", sql`${t.teamSeats} > 0`),
    check("billing_plans_play_overage_check", sql`${t.playOverageMillicents} >= 0`),
    check(
      "billing_plans_storage_overage_check",
      sql`${t.storageOverageCentsPerGb} >= 0`,
    ),
  ],
);

export const billingCustomers = pgTable(
  "billing_customers",
  {
    userId: text("user_id").primaryKey(),
    provider: text("provider").notNull().default("abacatepay"),
    providerCustomerId: text("provider_customer_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("billing_customers_provider_check", sql`${t.provider} = 'abacatepay'`)],
);

export const billingCheckouts = pgTable(
  "billing_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    planId: uuid("plan_id").notNull(),
    provider: text("provider").notNull().default("abacatepay"),
    checkoutType: text("checkout_type").notNull(),
    externalId: text("external_id").notNull().unique(),
    providerCheckoutId: text("provider_checkout_id").unique(),
    checkoutUrl: text("checkout_url"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    status: text("status").notNull().default("creating"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receiptUrl: text("receipt_url"),
    // Referência da assinatura anterior durante troca de plano.
    previousProviderSubscriptionId: text("previous_provider_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "billing_checkouts_plan_id_fkey",
      columns: [t.planId],
      foreignColumns: [billingPlans.id],
    }),
    check(
      "billing_checkouts_checkout_type_check",
      sql`${t.checkoutType} in ('pix', 'card_subscription')`,
    ),
    check("billing_checkouts_amount_cents_check", sql`${t.amountCents} > 0`),
    check("billing_checkouts_currency_check", sql`${t.currency} = 'BRL'`),
    check(
      "billing_checkouts_status_check",
      sql`${t.status} in ('creating', 'pending', 'paid', 'expired', 'failed', 'refunded', 'disputed', 'cancelled')`,
    ),
    index("billing_checkouts_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("billing_checkouts_status_created_idx").on(t.status, t.createdAt),
    index("billing_checkouts_plan_id_idx").on(t.planId),
    index("billing_checkouts_previous_subscription_idx")
      .on(t.previousProviderSubscriptionId)
      .where(sql`${t.previousProviderSubscriptionId} is not null`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().unique(),
    planId: uuid("plan_id").notNull(),
    sourceCheckoutId: uuid("source_checkout_id"),
    provider: text("provider").notNull().default("abacatepay"),
    billingMethod: text("billing_method").notNull(),
    providerSubscriptionId: text("provider_subscription_id").unique(),
    status: text("status").notNull().default("pending"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "subscriptions_plan_id_fkey",
      columns: [t.planId],
      foreignColumns: [billingPlans.id],
    }),
    foreignKey({
      name: "subscriptions_source_checkout_id_fkey",
      columns: [t.sourceCheckoutId],
      foreignColumns: [billingCheckouts.id],
    }).onDelete("set null"),
    check("subscriptions_billing_method_check", sql`${t.billingMethod} in ('pix', 'card')`),
    check(
      "subscriptions_status_check",
      sql`${t.status} in ('pending', 'active', 'past_due', 'suspended', 'cancelled', 'expired')`,
    ),
    index("subscriptions_status_period_idx").on(t.status, t.currentPeriodEnd),
    index("subscriptions_plan_id_idx").on(t.planId),
    index("subscriptions_source_checkout_id_idx").on(t.sourceCheckoutId),
  ],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    provider: text("provider").notNull().default("abacatepay"),
    providerEventId: text("provider_event_id").notNull().unique(),
    eventName: text("event_name").notNull(),
    providerObjectId: text("provider_object_id"),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("received"),
    processingError: text("processing_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    check("payment_webhook_events_provider_check", sql`${t.provider} in ('abacatepay', 'stripe')`),
    check(
      "payment_webhook_events_status_check",
      sql`${t.status} in ('received', 'processing', 'processed', 'ignored', 'failed')`,
    ),
    index("payment_webhook_events_status_received_idx").on(t.status, t.receivedAt),
  ],
);

/**
 * Pesquisa de churn (spec Billing Completo, item 4): motivo do cancelamento
 * coletado ANTES de o cliente abrir o portal — a pesquisa nunca bloqueia o
 * cancelamento; é registro honesto para aprendizado de churn.
 *
 * `feedback` junta o detalhe do motivo e a sugestão de melhoria (labels)
 * quando os dois vêm preenchidos: um único campo de texto legível por
 * humano (cada campo do client é limitado a 500 chars).
 */
export const billingChurnSurveys = pgTable(
  "billing_churn_surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    reason: text("reason").notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "billing_churn_surveys_reason_check",
      sql`${t.reason} in ('preco', 'nao_uso', 'problemas_tecnicos', 'migrei_ferramenta', 'outro')`,
    ),
    check("billing_churn_surveys_feedback_check", sql`${t.feedback} is null or char_length(${t.feedback}) <= 1100`),
    index("billing_churn_surveys_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/* ------------------------------------------------------------------ */
/* Acesso, onboarding e inbox.                                         */
/* ------------------------------------------------------------------ */

export const accountAccess = pgTable(
  "account_access",
  {
    userId: text("user_id").primaryKey(),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    trialStatus: text("trial_status").notNull().default("available"),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "account_access_trial_status_check",
      sql`${t.trialStatus} in ('available', 'active', 'used', 'expired')`,
    ),
    check(
      "account_access_trial_dates_check",
      sql`${t.trialStatus} <> 'active' or (${t.trialStartedAt} is not null and ${t.trialEndsAt} is not null)`,
    ),
  ],
);

export const userInbox = pgTable(
  "user_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    actionLabel: text("action_label"),
    actionUrl: text("action_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "user_inbox_kind_check",
      sql`${t.kind} in ('welcome', 'trial', 'tip', 'alert', 'billing', 'security', 'system')`,
    ),
    check("user_inbox_title_check", sql`char_length(${t.title}) between 1 and 120`),
    check("user_inbox_message_check", sql`char_length(${t.message}) between 1 and 600`),
    index("user_inbox_unread_idx")
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} is null and ${t.dismissedAt} is null`),
    uniqueIndex("user_inbox_welcome_uidx")
      .on(t.userId, t.kind)
      .where(sql`${t.kind} = 'welcome'`),
  ],
);

/* ------------------------------------------------------------------ */
/* Créditos Prisma IA.                                                 */
/* ------------------------------------------------------------------ */

export const aiCreditProducts = pgTable(
  "ai_credit_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    credits: integer("credits").notNull(),
    bonusCredits: integer("bonus_credits").notNull().default(0),
    amountCents: integer("amount_cents").notNull(),
    providerProductId: text("provider_product_id").unique(),
    isFeatured: boolean("is_featured").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: smallint("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_credit_products_credits_check", sql`${t.credits} > 0`),
    check("ai_credit_products_bonus_credits_check", sql`${t.bonusCredits} >= 0`),
    check("ai_credit_products_amount_cents_check", sql`${t.amountCents} > 0`),
  ],
);

export const aiCreditWallets = pgTable(
  "ai_credit_wallets",
  {
    userId: text("user_id").primaryKey(),
    balance: integer("balance").notNull().default(0),
    lifetimePurchased: integer("lifetime_purchased").notNull().default(0),
    lifetimeUsed: integer("lifetime_used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_credit_wallets_balance_check", sql`${t.balance} >= 0`),
    check("ai_credit_wallets_lifetime_purchased_check", sql`${t.lifetimePurchased} >= 0`),
    check("ai_credit_wallets_lifetime_used_check", sql`${t.lifetimeUsed} >= 0`),
  ],
);

export const aiCreditCheckouts = pgTable(
  "ai_credit_checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id").notNull(),
    externalId: text("external_id").notNull().unique(),
    providerCheckoutId: text("provider_checkout_id").unique(),
    checkoutUrl: text("checkout_url"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("creating"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "ai_credit_checkouts_product_id_fkey",
      columns: [t.productId],
      foreignColumns: [aiCreditProducts.id],
    }),
    check("ai_credit_checkouts_amount_cents_check", sql`${t.amountCents} > 0`),
    check(
      "ai_credit_checkouts_status_check",
      sql`${t.status} in ('creating', 'pending', 'paid', 'expired', 'failed', 'refunded', 'disputed', 'cancelled')`,
    ),
    index("ai_credit_checkouts_user_idx").on(t.userId, t.createdAt.desc()),
    index("ai_credit_checkouts_product_id_idx").on(t.productId),
  ],
);

export const aiCreditLedger = pgTable(
  "ai_credit_ledger",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference").notNull().unique(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ai_credit_ledger_amount_check", sql`${t.amount} <> 0`),
    check(
      "ai_credit_ledger_reason_check",
      sql`${t.reason} in ('purchase', 'plan_grant', 'usage', 'refund', 'adjustment', 'stripe_checkout')`,
    ),
    index("ai_credit_ledger_user_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/* ------------------------------------------------------------------ */
/* Equipes.                                                            */
/* ------------------------------------------------------------------ */

export const accountTeams = pgTable(
  "account_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().unique(),
    name: text("name").notNull().default("Minha equipe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("account_teams_name_check", sql`char_length(${t.name}) between 1 and 100`)],
);

export const accountTeamMembers = pgTable(
  "account_team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("account_team_members_team_id_user_id_key").on(t.teamId, t.userId),
    foreignKey({
      name: "account_team_members_team_id_fkey",
      columns: [t.teamId],
      foreignColumns: [accountTeams.id],
    }).onDelete("cascade"),
    check(
      "account_team_members_role_check",
      sql`${t.role} in ('owner', 'admin', 'editor', 'analyst', 'viewer')`,
    ),
    check("account_team_members_status_check", sql`${t.status} in ('active', 'suspended')`),
    index("account_team_members_user_idx").on(t.userId, t.status),
    index("account_team_members_team_idx").on(t.teamId, t.status),
  ],
);

export const accountTeamInvites = pgTable(
  "account_team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    invitedBy: text("invited_by").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    acceptedBy: text("accepted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("account_team_invites_team_id_email_key").on(t.teamId, t.email),
    foreignKey({
      name: "account_team_invites_team_id_fkey",
      columns: [t.teamId],
      foreignColumns: [accountTeams.id],
    }).onDelete("cascade"),
    check(
      "account_team_invites_email_check",
      sql`${t.email} = lower(${t.email}) and char_length(${t.email}) between 3 and 320`,
    ),
    check(
      "account_team_invites_role_check",
      sql`${t.role} in ('admin', 'editor', 'analyst', 'viewer')`,
    ),
    check(
      "account_team_invites_status_check",
      sql`${t.status} in ('pending', 'accepted', 'revoked', 'expired')`,
    ),
    index("account_team_invites_team_idx").on(t.teamId, t.status, t.createdAt.desc()),
    index("account_team_invites_email_idx").on(t.email, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Suporte.                                                            */
/* ------------------------------------------------------------------ */

export const supportCases = pgTable(
  "support_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("geral"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("aberto"),
    assigneeAdminId: text("assignee_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("support_cases_subject_check", sql`char_length(${t.subject}) between 3 and 140`),
    check(
      "support_cases_category_check",
      sql`${t.category} in ('geral', 'cobranca', 'tecnico', 'conta', 'reembolso', 'outro')`,
    ),
    check(
      "support_cases_priority_check",
      sql`${t.priority} in ('baixa', 'normal', 'alta', 'urgente')`,
    ),
    check(
      "support_cases_status_check",
      sql`${t.status} in ('aberto', 'em_andamento', 'aguardando_cliente', 'resolvido')`,
    ),
    index("support_cases_status_updated_idx").on(t.status, t.updatedAt.desc()),
    index("support_cases_user_idx").on(t.userId),
  ],
);

export const supportNotes = pgTable(
  "support_notes",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    caseId: uuid("case_id").notNull(),
    authorAdminId: text("author_admin_id"),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "support_notes_case_id_fkey",
      columns: [t.caseId],
      foreignColumns: [supportCases.id],
    }).onDelete("cascade"),
    check("support_notes_body_check", sql`char_length(${t.body}) between 1 and 2000`),
    index("support_notes_case_idx").on(t.caseId, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Operação assistida (admin) e visibilidade SEO/IA.                   */
/* ------------------------------------------------------------------ */

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: text("admin_user_id").notNull(),
    action: text("action").notNull(),
    targetUserId: text("target_user_id"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "admin_audit_log_action_check",
      sql`${t.action} in (
        'plan_change', 'subscription_suspend', 'subscription_reactivate',
        'trial_extend', 'trial_reset', 'credit_adjust',
        'support_case_opened', 'support_case_updated', 'support_note_added',
        'team_role_changed'
      )`,
    ),
    index("admin_audit_log_target_created_idx").on(t.targetUserId, t.createdAt.desc()),
    index("admin_audit_log_admin_created_idx").on(t.adminUserId, t.createdAt.desc()),
  ],
);

export const seoTargets = pgTable(
  "seo_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyword: text("keyword").notNull(),
    locale: text("locale").notNull().default("pt-BR"),
    notes: text("notes").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("seo_targets_keyword_check", sql`char_length(${t.keyword}) between 2 and 200`)],
);

export const visibilityChecks = pgTable(
  "visibility_checks",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    targetId: uuid("target_id").notNull(),
    platform: text("platform").notNull(),
    cited: boolean("cited").notNull().default(false),
    runs: smallint("runs").notNull().default(1),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "visibility_checks_target_id_fkey",
      columns: [t.targetId],
      foreignColumns: [seoTargets.id],
    }).onDelete("cascade"),
    check(
      "visibility_checks_platform_check",
      sql`${t.platform} in ('google-aio', 'chatgpt', 'perplexity', 'gemini', 'copilot')`,
    ),
    check("visibility_checks_runs_check", sql`${t.runs} between 1 and 10`),
    index("visibility_checks_target_idx").on(t.targetId, t.checkedAt.desc()),
  ],
);

/* ------------------------------------------------------------------ */
/* Operação: rate limit e rollup de retenção.                          */
/* ------------------------------------------------------------------ */

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires_at_idx").on(t.expiresAt)],
);

export const videoDailyStats = pgTable(
  "video_daily_stats",
  {
    videoId: uuid("video_id").notNull(),
    userId: text("user_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    plays: integer("plays").notNull().default(0),
    completes: integer("completes").notNull().default(0),
    conversions: integer("conversions").notNull().default(0),
    watchSeconds: numeric("watch_seconds").notNull().default("0"),
    sessions: integer("sessions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.videoId, t.day] }),
    foreignKey({
      name: "video_daily_stats_video_id_fkey",
      columns: [t.videoId],
      foreignColumns: [videos.id],
    }).onDelete("cascade"),
    check("video_daily_stats_impressions_check", sql`${t.impressions} >= 0`),
    check("video_daily_stats_plays_check", sql`${t.plays} >= 0`),
    check("video_daily_stats_completes_check", sql`${t.completes} >= 0`),
    check("video_daily_stats_conversions_check", sql`${t.conversions} >= 0`),
    check("video_daily_stats_watch_seconds_check", sql`${t.watchSeconds} >= 0`),
    check("video_daily_stats_sessions_check", sql`${t.sessions} >= 0`),
    index("video_daily_stats_user_day_idx").on(t.userId, t.day.desc()),
  ],
);

/**
 * Integrações por CONTA (App Store de integrações, /dashboard/integracoes).
 * Múltiplas instâncias por (conta, provider): cada instância tem um `instanceId`
 * e `name` (ex.: "Pixel Principal", "Pixel Secundário", "Domínio Principal").
 * O vínculo com VSLs é o array `vslIds` por instância.
 * Tokens (Access Token de CAPI, chaves de API) vivem em `config` e NUNCA saem
 * para o client: o embed resolve as integrações server-side.
 */
export const accountIntegrations = pgTable(
  "account_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountOwnerId: text("account_owner_id").notNull(),
    provider: text("provider").notNull(),
    instanceId: text("instance_id").notNull().default("default"),
    name: text("name").notNull().default("Principal"),
    config: jsonb("config").notNull().default({}),
    vslIds: jsonb("vsl_ids").notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_integrations_provider_owner_instance_uidx").on(t.accountOwnerId, t.provider, t.instanceId),
    index("account_integrations_owner_idx").on(t.accountOwnerId),
    check(
      "account_integrations_provider_check",
      sql`${t.provider} in ('meta_pixel', 'google_ads', 'tiktok', 'utmify', 'discord', 'telegram', 'outgoing_webhooks')`,
    ),
  ],
);
