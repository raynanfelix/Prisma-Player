import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gt, gte, inArray, lt, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";
import { getAccountPlan } from "@/lib/access/service";
import { deliverWebhook } from "@/lib/webhooks/delivery";
import { sendOperationalReport } from "@/lib/email/operational-report";
import { reconcileSubscriptions } from "@/lib/billing/stripe/reconcile";

const { videoLiveSessions, subscriptions, videoEvents, intelligenceControls, videos, userInbox, accountTeamInvites, accountAccess } = schema;

/** Orçamento de tempo: o cron precisa terminar a limpeza mesmo com muitas contas. */
const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 5;
/** Teto de linhas por passada de purge e de loops — mesma curva das RPCs legadas. */
const PURGE_BATCH_SIZE = 5000;
const PURGE_MAX_LOOPS = 200;

export type CronMaintenanceResult = {
  reports: number;
  emails: number;
  alerts: number;
  webhooks: number;
  skipped: number;
  processed: number;
  /** Assinaturas conferidas pelo reconcile Stripe↔banco (spec Impecável, item 2). */
  reconcileChecked: number;
  /** Divergências NOVAS registradas no dia (idempotente por event_id diário). */
  reconcileDivergences: number;
  /** Avisos de "seu teste termina em breve" criados nesta passada (spec Billing Completo, item 5). */
  trialReminders: number;
  timedOut: boolean;
  errors: string[];
};

export type CronMaintenanceOutcome =
  | { kind: "completed"; result: CronMaintenanceResult }
  | { kind: "controls_unavailable" };

export type CronAuthorization =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "invalid_token" };

type MaintenanceContext = {
  result: CronMaintenanceResult;
  startedAt: number;
  now: Date;
  currentFrom: Date;
  previousFrom: Date;
};

type PeriodCounts = { plays: number; conversions: number; rate: number };

type ControlsRow = {
  user_id: string;
  automatic_reports_enabled: boolean;
  report_frequency: string;
  report_email: string | null;
  report_video_ids: string[] | null;
  last_report_sent_at: string | null;
  conversion_alerts_enabled: boolean;
  conversion_drop_threshold: number;
  alert_webhook_enabled: boolean;
  alert_webhook_url: string | null;
  alert_video_ids: string[] | null;
};

/** Autentica a chamada do cron pelo Bearer CRON_SECRET (comparação em tempo constante). */
export function verifyCronAuthorization(request: Request): CronAuthorization {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "missing_secret" };
  const value = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "invalid_token" };
}

function due(last: string | null, frequency: string) {
  const hours = frequency === "daily" ? 24 : frequency === "weekly" ? 168 : 720;
  return !last || Date.now() - new Date(last).getTime() >= hours * 3_600_000;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

/** Conta eventos por tipo num intervalo via agregação SQL. */
async function countEvents(videoIds: string[], eventType: string, from: Date, to?: Date) {
  const conditions = [inArray(videoEvents.videoId, videoIds), eq(videoEvents.eventType, eventType), gte(videoEvents.createdAt, from)];
  if (to) conditions.push(lt(videoEvents.createdAt, to));
  const [row] = await db
    .select({ value: count() })
    .from(videoEvents)
    .where(and(...conditions));
  return row?.value ?? 0;
}

async function counts(videoIds: string[], from: Date, to?: Date): Promise<PeriodCounts> {
  const [plays, conversions] = await Promise.all([countEvents(videoIds, "play", from, to), countEvents(videoIds, "conversion", from, to)]);
  return { plays, conversions, rate: plays ? conversions / plays * 100 : 0 };
}

/**
 * Executa a manutenção completa do cron: limpeza de sessões live, expiração
 * de assinaturas, expiração de trials + aviso de fim próximo, reconciliação
 * Stripe↔banco, rollup diário, purges de retenção (SÓ com env explícita),
 * sweep de convites e o laço de relatórios/alertas por conta.
 */
export async function runCronMaintenance(): Promise<CronMaintenanceOutcome> {
  const now = new Date();
  const ctx: MaintenanceContext = {
    result: { reports: 0, emails: 0, alerts: 0, webhooks: 0, skipped: 0, processed: 0, reconcileChecked: 0, reconcileDivergences: 0, trialReminders: 0, timedOut: false, errors: [] },
    startedAt: Date.now(),
    now,
    currentFrom: new Date(now.getTime() - 24 * 3_600_000),
    previousFrom: new Date(now.getTime() - 48 * 3_600_000),
  };
  await cleanupLiveSessions(ctx);
  await expireOutdatedSubscriptions(ctx);
  await expireOutdatedTrials(ctx);
  await notifyTrialsEndingSoon(ctx);
  await runSubscriptionReconcile(ctx);
  await runDailyStatsRollup(ctx);
  await runRetentionPurges(ctx);
  await expireTeamInvites(ctx);
  const controls = await loadReportControls();
  if (!controls) return { kind: "controls_unavailable" };
  await processAllAccounts(ctx, controls);
  return { kind: "completed", result: ctx.result };
}

async function cleanupLiveSessions(ctx: MaintenanceContext): Promise<void> {
  // A limpeza roda ANTES do laço. Antes ficava depois e, quando o laço estourava
  // o tempo limite da função, `video_live_sessions` nunca era podada.
  try {
    await db.delete(videoLiveSessions).where(lt(videoLiveSessions.lastSeenAt, new Date(Date.now() - 10 * 60_000)));
  } catch (error) {
    ctx.result.errors.push(`live_sessions_cleanup: ${errorMessageOf(error)}`);
  }
}

async function expireOutdatedSubscriptions(ctx: MaintenanceContext): Promise<void> {
  // Expira assinaturas vencidas: sem isto a linha ficava `active` para sempre
  // e o painel de billing mostrava "Plano ativo" para conta bloqueada.
  // Idempotente e auditável pelo próprio status.
  try {
    await db.update(subscriptions).set({ status: "expired", updatedAt: ctx.now }).where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, ctx.now)));
  } catch (error) {
    ctx.result.errors.push(`subscriptions_expiry: ${errorMessageOf(error)}`);
  }
}

/**
 * Trial 100% (spec Billing Completo, item 5): marca `expired` nos trials
 * vencidos. O ACESSO já cai no `accessFrom` (trialActive exige trialEndsAt
 * futuro) — este update é a verdade do STATUS: sem ele a linha ficava
 * `active` para sempre e os painéis admin (finance/growth) contavam trial
 * vencido como ativo. Idempotente: linhas já expired não casam no filtro.
 */
export async function expireOutdatedTrials(ctx: MaintenanceContext): Promise<void> {
  try {
    await db.update(accountAccess).set({ trialStatus: "expired", updatedAt: ctx.now }).where(and(eq(accountAccess.trialStatus, "active"), lt(accountAccess.trialEndsAt, ctx.now)));
  } catch (error) {
    ctx.result.errors.push(`trials_expiry: ${errorMessageOf(error)}`);
  }
}

/** Janela do aviso de fim de trial: últimos 3 dias do teste. */
const TRIAL_ENDING_SOON_DAYS = 3;

/**
 * Trial 100% (spec Billing Completo, item 5): inbox não tinha aviso de fim
 * próximo — o usuário descobria o fim só quando o acesso caía. Insere um
 * recado único por trial (idempotente: actionUrl do aviso é exclusivo dele —
 * a mensagem de ativação não tem actionUrl) com o CTA para os planos.
 */
export async function notifyTrialsEndingSoon(ctx: MaintenanceContext): Promise<void> {
  try {
    const soon = new Date(ctx.now.getTime() + TRIAL_ENDING_SOON_DAYS * 86_400_000);
    const rows = await db
      .select({ userId: accountAccess.userId, trialEndsAt: accountAccess.trialEndsAt })
      .from(accountAccess)
      .where(and(eq(accountAccess.trialStatus, "active"), gt(accountAccess.trialEndsAt, ctx.now), lt(accountAccess.trialEndsAt, soon)))
      .limit(500);
    for (const row of rows) {
      if (!row.trialEndsAt) continue;
      const existing = await db
        .select({ id: userInbox.id })
        .from(userInbox)
        .where(and(eq(userInbox.userId, row.userId), eq(userInbox.kind, "trial"), eq(userInbox.actionUrl, "/dashboard/billing")))
        .limit(1);
      if (existing.length) continue;
      const days = Math.max(1, Math.ceil((row.trialEndsAt.getTime() - ctx.now.getTime()) / 86_400_000));
      await db.insert(userInbox).values({
        userId: row.userId,
        kind: "trial",
        title: "Seu teste termina em breve",
        message: `Seu teste gratuito termina em ${days} dia${days === 1 ? "" : "s"} — nenhum cartão foi cobrado e nada é cobrado automaticamente. Para manter o acesso completo, escolha um plano quando quiser.`,
        actionLabel: "Ver planos",
        actionUrl: "/dashboard/billing",
      });
      ctx.result.trialReminders += 1;
    }
  } catch (error) {
    ctx.result.errors.push(`trial_reminders: ${errorMessageOf(error)}`);
  }
}

/**
 * Reconciliação Stripe↔banco (spec Impecável, item 2): confere as linhas
 * locais contra o provedor e REGISTRA divergências para decisão humana —
 * nunca corrige sozinho. Roda DEPOIS da expiração: linha active com período
 * vencido já virou expired, então o reconcile compara estados estáveis e o
 * caso "renovação perdida" aparece como divergência de status clara. Sem
 * Stripe configurado a passada é skip silencioso (nada a conferir).
 */
async function runSubscriptionReconcile(ctx: MaintenanceContext): Promise<void> {
  try {
    const reconcile = await reconcileSubscriptions(ctx.now);
    if (reconcile.kind === "completed") {
      ctx.result.reconcileChecked = reconcile.checked;
      ctx.result.reconcileDivergences = reconcile.divergences;
    }
    ctx.result.errors.push(...reconcile.errors);
  } catch (error) {
    ctx.result.errors.push(`stripe_reconcile: ${errorMessageOf(error)}`);
  }
}

async function runDailyStatsRollup(ctx: MaintenanceContext): Promise<void> {
  // Rollup diário (insert-only, idempotente): alimenta video_daily_stats com
  // os últimos 7 dias. Purges destrutivos SÓ com env explícita; sem env,
  // nada é apagado.
  try {
    await rollupDailyStats(7);
  } catch (error) {
    ctx.result.errors.push(`daily_rollup: ${errorMessageOf(error)}`);
  }
}

async function expireTeamInvites(ctx: MaintenanceContext): Promise<void> {
  // Convites vencidos saem de pending: higiene idempotente, sem cron próprio.
  try {
    await db.update(accountTeamInvites).set({ status: "expired", updatedAt: ctx.now }).where(and(eq(accountTeamInvites.status, "pending"), lt(accountTeamInvites.expiresAt, ctx.now)));
  } catch (error) {
    ctx.result.errors.push(`invites_sweep: ${errorMessageOf(error)}`);
  }
}

/**
 * Rollup diário (insert-only, idempotente): alimenta video_daily_stats com os
 * últimos `daysBack` dias. Mesma SQL da RPC `rollup_video_daily_stats` —
 * purges destrutivos SÓ com env explícita; sem env, nada é apagado.
 */
async function rollupDailyStats(daysBack: number): Promise<number> {
  const boundedDays = Math.max(1, Math.min(daysBack, 31));
  const result = await db.execute(sql`
    insert into video_daily_stats
      (video_id, user_id, day, impressions, plays, completes, conversions, watch_seconds, sessions, updated_at)
    select
      video_id,
      user_id,
      (created_at at time zone 'utc')::date as day,
      count(*) filter (where event_type = 'impression'),
      count(*) filter (where event_type = 'play'),
      count(*) filter (where event_type = 'complete'),
      count(*) filter (where event_type = 'conversion'),
      coalesce(sum(watched_seconds) filter (where event_type = 'progress'), 0),
      count(distinct session_id),
      now()
    from video_events
    where created_at >= date_trunc('day', now() - make_interval(days => ${boundedDays}::int))
    group by video_id, user_id, day
    on conflict (video_id, day) do update set
      impressions = excluded.impressions,
      plays = excluded.plays,
      completes = excluded.completes,
      conversions = excluded.conversions,
      watch_seconds = excluded.watch_seconds,
      sessions = excluded.sessions,
      updated_at = now()
  `);
  return rowCountOf(result);
}

function rowCountOf(result: unknown): number {
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows.length;
  }
  if (Array.isArray(result)) return result.length;
  return 0;
}

/** Lê a env de retenção: inteiro positivo habilita o purge; qualquer outra coisa desliga. */
function retentionDaysFromEnv(name: string): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

async function runRetentionPurges(ctx: MaintenanceContext): Promise<void> {
  const retentionJobs: Array<[string, number, (days: number) => Promise<number>]> = [
    ["video_events", retentionDaysFromEnv("VIDEO_EVENTS_RETENTION_DAYS"), purgeOldVideoEvents],
    ["player_events", retentionDaysFromEnv("PLAYER_EVENTS_RETENTION_DAYS"), purgeOldPlayerEvents],
    ["security_events", retentionDaysFromEnv("SECURITY_EVENTS_RETENTION_DAYS"), purgeOldSecurityEvents],
    ["webhook_payloads", retentionDaysFromEnv("WEBHOOK_PAYLOAD_RETENTION_DAYS"), scrubOldWebhookPayloads],
  ];
  for (const [label, days, purge] of retentionJobs) {
    if (!days) continue;
    try {
      await purge(days);
    } catch (error) {
      ctx.result.errors.push(`${label}_retention: ${errorMessageOf(error)}`);
    }
  }
}

/**
 * Purge em lote com teto (equivalente a `purge_old_video_events`): nunca roda
 * sem a env de retenção; piso de 30 dias gravado na RPC é mantido.
 */
async function purgeOldVideoEvents(days: number): Promise<number> {
  const floorDays = Math.max(30, days);
  let total = 0;
  for (let loop = 0; loop < PURGE_MAX_LOOPS; loop += 1) {
    const result = await db.execute(sql`
      delete from video_events where ctid in (
        select ctid from video_events
        where created_at < now() - make_interval(days => ${floorDays}::int)
        limit ${PURGE_BATCH_SIZE}
      )
      returning 1
    `);
    const batch = rowCountOf(result);
    total += batch;
    if (batch < PURGE_BATCH_SIZE) break;
  }
  return total;
}

/** Equivalente a `purge_old_player_events` (mesmo piso de 30 dias). */
async function purgeOldPlayerEvents(days: number): Promise<number> {
  const floorDays = Math.max(30, days);
  let total = 0;
  for (let loop = 0; loop < PURGE_MAX_LOOPS; loop += 1) {
    const result = await db.execute(sql`
      delete from player_events where ctid in (
        select ctid from player_events
        where created_at < now() - make_interval(days => ${floorDays}::int)
        limit ${PURGE_BATCH_SIZE}
      )
      returning 1
    `);
    const batch = rowCountOf(result);
    total += batch;
    if (batch < PURGE_BATCH_SIZE) break;
  }
  return total;
}

/**
 * Webhook payload: após o período operacional (piso de 7 dias), mantém
 * metadados e apaga o blob — equivalente a `scrub_old_webhook_payloads`.
 */
async function scrubOldWebhookPayloads(days: number): Promise<number> {
  const floorDays = Math.max(7, days);
  const result = await db.execute(sql`
    update payment_webhook_events
    set payload = '{}'::jsonb
    where received_at < now() - make_interval(days => ${floorDays}::int)
      and status in ('processed', 'ignored')
      and payload <> '{}'::jsonb
    returning 1
  `);
  return rowCountOf(result);
}

/** Retenção de security_events (LGPD; padrão desligado no app). */
async function purgeOldSecurityEvents(days: number): Promise<number> {
  const floorDays = Math.max(30, days);
  const result = await db.execute(sql`
    delete from security_events
    where created_at < now() - make_interval(days => ${floorDays}::int)
    returning 1
  `);
  return rowCountOf(result);
}

async function loadReportControls(): Promise<ControlsRow[] | null> {
  try {
    const rows = await db
      .select({
        userId: intelligenceControls.userId,
        automaticReportsEnabled: intelligenceControls.automaticReportsEnabled,
        reportFrequency: intelligenceControls.reportFrequency,
        reportEmail: intelligenceControls.reportEmail,
        reportVideoIds: intelligenceControls.reportVideoIds,
        lastReportSentAt: intelligenceControls.lastReportSentAt,
        conversionAlertsEnabled: intelligenceControls.conversionAlertsEnabled,
        conversionDropThreshold: intelligenceControls.conversionDropThreshold,
        alertWebhookEnabled: intelligenceControls.alertWebhookEnabled,
        alertWebhookUrl: intelligenceControls.alertWebhookUrl,
        alertVideoIds: intelligenceControls.alertVideoIds,
      })
      .from(intelligenceControls)
      .where(or(eq(intelligenceControls.automaticReportsEnabled, true), eq(intelligenceControls.conversionAlertsEnabled, true)));
    return rows.map(toControlsRow);
  } catch {
    return null;
  }
}

function toControlsRow(row: {
  userId: string;
  automaticReportsEnabled: boolean;
  reportFrequency: string;
  reportEmail: string | null;
  reportVideoIds: string[] | null;
  lastReportSentAt: Date | null;
  conversionAlertsEnabled: boolean;
  conversionDropThreshold: number;
  alertWebhookEnabled: boolean;
  alertWebhookUrl: string | null;
  alertVideoIds: string[] | null;
}): ControlsRow {
  return {
    user_id: row.userId,
    automatic_reports_enabled: row.automaticReportsEnabled,
    report_frequency: row.reportFrequency,
    report_email: row.reportEmail,
    report_video_ids: row.reportVideoIds,
    last_report_sent_at: isoOrNull(row.lastReportSentAt),
    conversion_alerts_enabled: row.conversionAlertsEnabled,
    conversion_drop_threshold: row.conversionDropThreshold,
    alert_webhook_enabled: row.alertWebhookEnabled,
    alert_webhook_url: row.alertWebhookUrl,
    alert_video_ids: row.alertVideoIds,
  };
}

/** Escopo por VSL escolhido no Marketplace: lista vazia/nula = toda a conta. */
function scopeVideos<T extends { id: string }>(accountVideos: T[], scope: string[] | null): T[] {
  if (!scope?.length) return accountVideos;
  const selected = new Set(scope);
  return accountVideos.filter((video) => selected.has(video.id));
}

async function processAllAccounts(ctx: MaintenanceContext, configs: ControlsRow[]): Promise<void> {
  // Laço serial por conta virava timeout com poucos milhares de usuários.
  // Processa em lotes paralelos, respeitando um orçamento de tempo.
  const queue = [...configs];
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      if (Date.now() - ctx.startedAt > TIME_BUDGET_MS) { ctx.result.timedOut = true; return; }
      const config = queue.shift();
      if (!config) return;
      try {
        await processAccountReports(ctx, config);
        ctx.result.processed += 1;
      } catch (reason) {
        ctx.result.errors.push(`${config.user_id}: ${reason instanceof Error ? reason.message : "unknown_error"}`);
      }
    }
  });
  await Promise.all(workers);
  if (ctx.result.timedOut) console.warn("cron_time_budget_exhausted", { processed: ctx.result.processed, remaining: queue.length });
}

async function processAccountReports(ctx: MaintenanceContext, config: ControlsRow): Promise<void> {
  // O cron entregava relatórios e alertas sem olhar o plano: recurso pago
  // sendo executado (e custando e-mail e fetch externo) para conta sem direito.
  const plan = await getAccountPlan(config.user_id);
  if (!plan.access.hasAccess) { ctx.result.skipped += 1; return; }
  const accountVideos = await db.select({ id: videos.id, title: videos.title }).from(videos).where(and(eq(videos.userId, config.user_id), eq(videos.status, "ready"))).limit(500);
  if (!accountVideos.length) return;
  // Relatório e alertas respeitam o escopo de VSLs salvo nos controls; sem
  // seleção, o comportamento continua sendo toda a conta.
  const reportVideos = scopeVideos(accountVideos, config.report_video_ids);
  if (config.automatic_reports_enabled && plan.capabilities.automatic_reports && config.report_email && reportVideos.length && due(config.last_report_sent_at, config.report_frequency)) {
    await sendPeriodicReport(ctx, config, reportVideos.map((video) => video.id), config.report_email);
  }
  if (config.conversion_alerts_enabled && plan.capabilities.conversion_drop_alerts) {
    await scanConversionDrops(ctx, config, scopeVideos(accountVideos, config.alert_video_ids));
  }
}

async function sendPeriodicReport(ctx: MaintenanceContext, config: ControlsRow, videoIds: string[], reportEmail: string): Promise<void> {
  const days = config.report_frequency === "daily" ? 1 : config.report_frequency === "weekly" ? 7 : 30;
  const stats = await counts(videoIds, new Date(ctx.now.getTime() - days * 86_400_000));
  const mail = await sendOperationalReport({ to: reportEmail, frequency: config.report_frequency, days, plays: stats.plays, conversions: stats.conversions, conversionRate: stats.rate });
  await db.insert(userInbox).values({ userId: config.user_id, kind: "system", title: "Seu relatório está pronto", message: `${stats.plays} plays e ${stats.conversions} conversões, com taxa de ${stats.rate.toFixed(1)}% nos últimos ${days} dias.${mail.sent ? " Uma cópia também foi enviada ao seu e-mail." : " Você pode consultar o relatório completo por aqui."}`, actionLabel: "Abrir relatório", actionUrl: "/dashboard/intelligence" });
  await db.update(intelligenceControls).set({ lastReportSentAt: ctx.now, updatedAt: ctx.now }).where(eq(intelligenceControls.userId, config.user_id));
  ctx.result.reports += 1;
  if (mail.sent) ctx.result.emails += 1;
}

async function scanConversionDrops(ctx: MaintenanceContext, config: ControlsRow, accountVideos: Array<{ id: string; title: string }>): Promise<void> {
  for (const video of accountVideos) {
    if (Date.now() - ctx.startedAt > TIME_BUDGET_MS) { ctx.result.timedOut = true; return; }
    const [current, previous] = await Promise.all([counts([video.id], ctx.currentFrom), counts([video.id], ctx.previousFrom, ctx.currentFrom)]);
    if (current.plays < 10 || previous.plays < 10 || previous.rate <= 0) continue;
    const dropPercent = (previous.rate - current.rate) / previous.rate * 100;
    if (dropPercent < config.conversion_drop_threshold) continue;
    await recordConversionDrop(ctx, config, video, { current, previous, dropPercent });
  }
}

async function recordConversionDrop(ctx: MaintenanceContext, config: ControlsRow, video: { id: string; title: string }, metrics: { current: PeriodCounts; previous: PeriodCounts; dropPercent: number }): Promise<void> {
  const actionUrl = `/dashboard/analytics/${video.id}`;
  const existing = await db.select({ id: userInbox.id }).from(userInbox).where(and(eq(userInbox.userId, config.user_id), eq(userInbox.actionUrl, actionUrl), eq(userInbox.kind, "alert"), gte(userInbox.createdAt, ctx.currentFrom))).limit(1);
  if (existing.length) return;
  await db.insert(userInbox).values({ userId: config.user_id, kind: "alert", title: `Queda de conversão: ${video.title}`, message: `A taxa caiu ${metrics.dropPercent.toFixed(1)}%: de ${metrics.previous.rate.toFixed(1)}% no período anterior para ${metrics.current.rate.toFixed(1)}% nas últimas 24h.`, actionLabel: "Analisar métricas", actionUrl });
  ctx.result.alerts += 1;
  await deliverConversionDropWebhook(ctx, config, video, metrics);
}

async function deliverConversionDropWebhook(ctx: MaintenanceContext, config: ControlsRow, video: { id: string; title: string }, metrics: { current: PeriodCounts; previous: PeriodCounts; dropPercent: number }): Promise<void> {
  if (!config.alert_webhook_enabled || !config.alert_webhook_url) return;
  await deliverWebhook(config.alert_webhook_url, { id: randomUUID(), event: "conversion_drop", timestamp: ctx.now.toISOString(), data: { video_id: video.id, video_title: video.title, previous_rate: Number(metrics.previous.rate.toFixed(2)), current_rate: Number(metrics.current.rate.toFixed(2)), drop_percent: Number(metrics.dropPercent.toFixed(2)), previous_plays: metrics.previous.plays, current_plays: metrics.current.plays } }).catch((reason) => {
    ctx.result.errors.push(`webhook:${config.user_id}: ${reason instanceof Error ? reason.message : "unknown"}`);
  });
  ctx.result.webhooks += 1;
}
