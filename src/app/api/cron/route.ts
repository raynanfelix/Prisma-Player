import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, count, eq, gte, inArray, lt, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";
import { getAccountPlan } from "@/lib/access/service";
import { deliverWebhook } from "@/lib/webhooks/delivery";
import { sendOperationalReport } from "@/lib/email/operational-report";

const { videoLiveSessions, subscriptions, videoEvents, intelligenceControls, videos, userInbox, accountTeamInvites } = schema;

export const maxDuration = 300;

/** Orçamento de tempo: o cron precisa terminar a limpeza mesmo com muitas contas. */
const TIME_BUDGET_MS = 240_000;
const CONCURRENCY = 5;
/** Teto de linhas por passada de purge e de loops — mesma curva das RPCs legadas. */
const PURGE_BATCH_SIZE = 5000;
const PURGE_MAX_LOOPS = 200;

function authorized(request: Request, secret: string) {
  const value = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function due(last: string | null, frequency: string) {
  const hours = frequency === "daily" ? 24 : frequency === "weekly" ? 168 : 720;
  return !last || Date.now() - new Date(last).getTime() >= hours * 3_600_000;
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

async function counts(videoIds: string[], from: Date, to?: Date) {
  const [plays, conversions] = await Promise.all([countEvents(videoIds, "play", from, to), countEvents(videoIds, "conversion", from, to)]);
  return { plays, conversions, rate: plays ? conversions / plays * 100 : 0 };
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

type ControlsRow = {
  user_id: string;
  automatic_reports_enabled: boolean;
  report_frequency: string;
  report_email: string | null;
  last_report_sent_at: string | null;
  conversion_alerts_enabled: boolean;
  conversion_drop_threshold: number;
  alert_webhook_enabled: boolean;
  alert_webhook_url: string | null;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_secret_not_configured" }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const result = { reports: 0, emails: 0, alerts: 0, webhooks: 0, skipped: 0, processed: 0, timedOut: false, errors: [] as string[] };
  const now = new Date();
  const currentFrom = new Date(now.getTime() - 24 * 3_600_000);
  const previousFrom = new Date(now.getTime() - 48 * 3_600_000);

  // A limpeza roda ANTES do laço. Antes ficava depois e, quando o laço estourava
  // o tempo limite da função, `video_live_sessions` nunca era podada.
  try {
    await db.delete(videoLiveSessions).where(lt(videoLiveSessions.lastSeenAt, new Date(Date.now() - 10 * 60_000)));
  } catch (error) {
    result.errors.push(`live_sessions_cleanup: ${error instanceof Error ? error.message : "unknown"}`);
  }

  // Expira assinaturas vencidas: sem isto a linha ficava `active` para sempre
  // e o painel de billing mostrava "Plano ativo" para conta bloqueada.
  // Idempotente e auditável pelo próprio status.
  try {
    await db.update(subscriptions).set({ status: "expired", updatedAt: now }).where(and(eq(subscriptions.status, "active"), lt(subscriptions.currentPeriodEnd, now)));
  } catch (error) {
    result.errors.push(`subscriptions_expiry: ${error instanceof Error ? error.message : "unknown"}`);
  }

  // Rollup diário (insert-only, idempotente): alimenta video_daily_stats com
  // os últimos 7 dias. Purges destrutivos SÓ com env explícita; sem env,
  // nada é apagado.
  try {
    await rollupDailyStats(7);
  } catch (error) {
    result.errors.push(`daily_rollup: ${error instanceof Error ? error.message : "unknown"}`);
  }
  const retentionEnv = (name: string) => {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value > 0 ? value : 0;
  };
  const retentionJobs: Array<[string, number, (days: number) => Promise<number>]> = [
    ["video_events", retentionEnv("VIDEO_EVENTS_RETENTION_DAYS"), purgeOldVideoEvents],
    ["player_events", retentionEnv("PLAYER_EVENTS_RETENTION_DAYS"), purgeOldPlayerEvents],
    ["security_events", retentionEnv("SECURITY_EVENTS_RETENTION_DAYS"), purgeOldSecurityEvents],
    ["webhook_payloads", retentionEnv("WEBHOOK_PAYLOAD_RETENTION_DAYS"), scrubOldWebhookPayloads],
  ];
  for (const [label, days, purge] of retentionJobs) {
    if (!days) continue;
    try {
      await purge(days);
    } catch (error) {
      result.errors.push(`${label}_retention: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  // Convites vencidos saem de pending: higiene idempotente, sem cron próprio.
  try {
    await db.update(accountTeamInvites).set({ status: "expired", updatedAt: now }).where(and(eq(accountTeamInvites.status, "pending"), lt(accountTeamInvites.expiresAt, now)));
  } catch (error) {
    result.errors.push(`invites_sweep: ${error instanceof Error ? error.message : "unknown"}`);
  }

  let configs: ControlsRow[] = [];
  try {
    const rows = await db
      .select({
        userId: intelligenceControls.userId,
        automaticReportsEnabled: intelligenceControls.automaticReportsEnabled,
        reportFrequency: intelligenceControls.reportFrequency,
        reportEmail: intelligenceControls.reportEmail,
        lastReportSentAt: intelligenceControls.lastReportSentAt,
        conversionAlertsEnabled: intelligenceControls.conversionAlertsEnabled,
        conversionDropThreshold: intelligenceControls.conversionDropThreshold,
        alertWebhookEnabled: intelligenceControls.alertWebhookEnabled,
        alertWebhookUrl: intelligenceControls.alertWebhookUrl,
      })
      .from(intelligenceControls)
      .where(or(eq(intelligenceControls.automaticReportsEnabled, true), eq(intelligenceControls.conversionAlertsEnabled, true)));
    configs = rows.map((row) => ({
      user_id: row.userId,
      automatic_reports_enabled: row.automaticReportsEnabled,
      report_frequency: row.reportFrequency,
      report_email: row.reportEmail,
      last_report_sent_at: isoOrNull(row.lastReportSentAt),
      conversion_alerts_enabled: row.conversionAlertsEnabled,
      conversion_drop_threshold: row.conversionDropThreshold,
      alert_webhook_enabled: row.alertWebhookEnabled,
      alert_webhook_url: row.alertWebhookUrl,
    }));
  } catch {
    return NextResponse.json({ error: "controls_unavailable" }, { status: 503 });
  }

  const processAccount = async (config: ControlsRow) => {
    // O cron entregava relatórios e alertas sem olhar o plano: recurso pago
    // sendo executado (e custando e-mail e fetch externo) para conta sem direito.
    const plan = await getAccountPlan(config.user_id);
    if (!plan.access.hasAccess) { result.skipped += 1; return; }

    const accountVideos = await db.select({ id: videos.id, title: videos.title }).from(videos).where(and(eq(videos.userId, config.user_id), eq(videos.status, "ready"))).limit(500);
    if (!accountVideos.length) return;
    const ids = accountVideos.map((video) => video.id);

    if (config.automatic_reports_enabled && plan.capabilities.automatic_reports && config.report_email && due(config.last_report_sent_at, config.report_frequency)) {
      const days = config.report_frequency === "daily" ? 1 : config.report_frequency === "weekly" ? 7 : 30;
      const stats = await counts(ids, new Date(now.getTime() - days * 86_400_000));
      const mail = await sendOperationalReport({ to: config.report_email, frequency: config.report_frequency, days, plays: stats.plays, conversions: stats.conversions, conversionRate: stats.rate });
      await db.insert(userInbox).values({ userId: config.user_id, kind: "system", title: "Seu relatório está pronto", message: `${stats.plays} plays e ${stats.conversions} conversões, com taxa de ${stats.rate.toFixed(1)}% nos últimos ${days} dias.${mail.sent ? " Uma cópia também foi enviada ao seu e-mail." : " Você pode consultar o relatório completo por aqui."}`, actionLabel: "Abrir relatório", actionUrl: "/dashboard/intelligence" });
      await db.update(intelligenceControls).set({ lastReportSentAt: now, updatedAt: now }).where(eq(intelligenceControls.userId, config.user_id));
      result.reports += 1; if (mail.sent) result.emails += 1;
    }

    if (config.conversion_alerts_enabled && plan.capabilities.conversion_drop_alerts) {
      for (const video of accountVideos) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) { result.timedOut = true; return; }
        const [current, previous] = await Promise.all([counts([video.id], currentFrom), counts([video.id], previousFrom, currentFrom)]);
        if (current.plays < 10 || previous.plays < 10 || previous.rate <= 0) continue;
        const dropPercent = (previous.rate - current.rate) / previous.rate * 100;
        if (dropPercent < config.conversion_drop_threshold) continue;
        const actionUrl = `/dashboard/analytics/${video.id}`;
        const existing = await db.select({ id: userInbox.id }).from(userInbox).where(and(eq(userInbox.userId, config.user_id), eq(userInbox.actionUrl, actionUrl), eq(userInbox.kind, "alert"), gte(userInbox.createdAt, currentFrom))).limit(1);
        if (existing.length) continue;
        await db.insert(userInbox).values({ userId: config.user_id, kind: "alert", title: `Queda de conversão: ${video.title}`, message: `A taxa caiu ${dropPercent.toFixed(1)}%: de ${previous.rate.toFixed(1)}% no período anterior para ${current.rate.toFixed(1)}% nas últimas 24h.`, actionLabel: "Analisar métricas", actionUrl });
        result.alerts += 1;
        if (config.alert_webhook_enabled && config.alert_webhook_url) {
          await deliverWebhook(config.alert_webhook_url, { id: randomUUID(), event: "conversion_drop", timestamp: now.toISOString(), data: { video_id: video.id, video_title: video.title, previous_rate: Number(previous.rate.toFixed(2)), current_rate: Number(current.rate.toFixed(2)), drop_percent: Number(dropPercent.toFixed(2)), previous_plays: previous.plays, current_plays: current.plays } }).catch((reason) => {
            result.errors.push(`webhook:${config.user_id}: ${reason instanceof Error ? reason.message : "unknown"}`);
          });
          result.webhooks += 1;
        }
      }
    }
  };

  // Laço serial por conta virava timeout com poucos milhares de usuários.
  // Processa em lotes paralelos, respeitando um orçamento de tempo.
  const queue = [...configs];
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { result.timedOut = true; return; }
      const config = queue.shift();
      if (!config) return;
      try {
        await processAccount(config);
        result.processed += 1;
      } catch (reason) {
        result.errors.push(`${config.user_id}: ${reason instanceof Error ? reason.message : "unknown_error"}`);
      }
    }
  });
  await Promise.all(workers);

  if (result.timedOut) console.warn("cron_time_budget_exhausted", { processed: result.processed, remaining: queue.length });
  return NextResponse.json({ success: result.errors.length === 0 && !result.timedOut, result });
}
