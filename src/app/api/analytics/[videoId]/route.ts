import { and, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { pct, type AnalyticsSummary, type DimensionRow } from "@/lib/analytics/summarize";
import { VIDEO } from "@/lib/constants";

const { videos, videoLiveSessions } = schema;

/**
 * O dashboard puxava até 50 mil linhas de video_events e agregava em
 * JavaScript: vídeo viral congelava a UI e, pior, mentia — o cap silencioso
 * truncava os números. Agora a agregação acontece no Postgres, com
 * `count(distinct ...) filter (...)` sobre o índice (video_id, created_at):
 * O(índice) em vez de O(linhas), sem cap e sem streaming de eventos.
 */

/** `db.execute` devolve `{ rows }` (pg) ou array (outros drivers) — normaliza. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/** Agregados vêm como int (cast no SQL); qualquer shape degrada para 0, nunca NaN. */
function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Marcos de retenção — exatamente os pontos do summarizeEvents original. */
const RETENTION_POINTS = [0, 10, 25, 50, 75, 90, 100] as const;

type WindowStats = {
  impressions: number;
  plays: number;
  completed: number;
  ctaClicks: number;
  conversions: number;
  reached: { 10: number; 25: number; 50: number; 75: number; 90: number };
  suspicious: number;
};

type SummarySqlRow = {
  win?: string | null;
  impressions?: unknown;
  plays?: unknown;
  completed?: unknown;
  cta_clicks?: unknown;
  conversions?: unknown;
  reached10?: unknown;
  reached25?: unknown;
  reached50?: unknown;
  reached75?: unknown;
  reached90?: unknown;
  suspicious?: unknown;
};

type TimelineSqlRow = { bucket?: unknown; impressions?: unknown; plays?: unknown; completes?: unknown; conversions?: unknown };

type DimensionSqlRow = { dimension?: string | null; name?: string | null; impressions?: unknown; plays?: unknown; completes?: unknown };

/** Janela sem eventos = a mesma coisa que summarizeEvents([]): tudo zero. */
function statsOf(rows: SummarySqlRow[], win: "current" | "previous"): WindowStats {
  const row = rows.find((candidate) => candidate.win === win);
  if (!row) {
    return { impressions: 0, plays: 0, completed: 0, ctaClicks: 0, conversions: 0, reached: { 10: 0, 25: 0, 50: 0, 75: 0, 90: 0 }, suspicious: 0 };
  }
  return {
    impressions: num(row.impressions),
    plays: num(row.plays),
    completed: num(row.completed),
    ctaClicks: num(row.cta_clicks),
    conversions: num(row.conversions),
    reached: { 10: num(row.reached10), 25: num(row.reached25), 50: num(row.reached50), 75: num(row.reached75), 90: num(row.reached90) },
    suspicious: num(row.suspicious),
  };
}

/** Mesmo objeto (e mesma ordem de chaves) do summary do summarizeEvents. */
function summaryOf(stats: WindowStats): AnalyticsSummary {
  return {
    impressions: stats.impressions,
    uniqueViews: stats.impressions,
    plays: stats.plays,
    playRate: pct(stats.plays, stats.impressions),
    reached25: stats.reached[25],
    reached50: stats.reached[50],
    reached75: stats.reached[75],
    reached90: stats.reached[90],
    completed: stats.completed,
    completionRate: pct(stats.completed, stats.plays),
    ctaClicks: stats.ctaClicks,
    conversions: stats.conversions,
  };
}

/** Retenção idêntica à original: ponto 0 = plays, ponto 100 = concluídos. */
function retentionOf(stats: WindowStats) {
  return RETENTION_POINTS.map((point) => {
    const viewers = point === 0 ? stats.plays : point === 100 ? stats.completed : stats.reached[point];
    return { point, rate: pct(viewers, stats.plays), viewers };
  });
}

/**
 * Série temporal a partir dos buckets já agregados pelo Postgres (floor da
 * distância em segundos desde `since`): mesma binning do buildTimeline
 * original — buckets de ceil(range/30) dias alinhados a `since`, índices
 * fora de [0, bucketCount) descartados.
 */
function timelineOf(rows: TimelineSqlRow[], sinceMs: number, bucketMs: number, bucketCount: number) {
  const buckets = Array.from({ length: bucketCount }, () => ({ impressions: 0, plays: 0, completes: 0, conversions: 0 }));
  for (const row of rows) {
    const index = num(row.bucket);
    if (index < 0 || index >= bucketCount) continue;
    buckets[index] = { impressions: num(row.impressions), plays: num(row.plays), completes: num(row.completes), conversions: num(row.conversions) };
  }
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return buckets.map((bucket, index) => {
    const start = sinceMs + index * bucketMs;
    return { date: new Date(start).toISOString(), label: formatter.format(new Date(start)), ...bucket };
  });
}

/** Chave do contrato -> coluna agregada no SQL (GROUPING SETS devolve as 8). */
const DIMENSION_KEYS: Array<[key: string, column: string]> = [
  ["countries", "country_code"],
  ["devices", "device_type"],
  ["operatingSystems", "os_name"],
  ["browsers", "browser_name"],
  ["traffic", "traffic_source"],
  ["campaigns", "campaign_id"],
  ["creatives", "creative_id"],
  ["ads", "ad_id"],
];

/**
 * Mesma montagem do summarizeEvents().dimension(): ordenação por impressões
 * desc (empate preservado — o SQL entrega first_created asc), limite de 30 e
 * rates com o mesmo pct().
 */
function dimensionsOf(rows: DimensionSqlRow[]): Record<string, DimensionRow[]> {
  const grouped = new Map<string, Array<{ name: string; impressions: number; plays: number; completes: number }>>();
  for (const [key] of DIMENSION_KEYS) grouped.set(key, []);
  for (const row of rows) {
    const list = grouped.get(String(row.dimension));
    if (!list) continue;
    list.push({ name: String(row.name ?? "Não informado"), impressions: num(row.impressions), plays: num(row.plays), completes: num(row.completes) });
  }
  const dimensions: Record<string, DimensionRow[]> = {};
  for (const [key] of DIMENSION_KEYS) {
    dimensions[key] = (grouped.get(key) ?? [])
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 30)
      .map((entry) => ({
        name: entry.name,
        impressions: entry.impressions,
        plays: entry.plays,
        playRate: pct(entry.plays, entry.impressions),
        completes: entry.completes,
        completionRate: pct(entry.completes, entry.plays),
      }));
  }
  return dimensions;
}

export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  // Painel caro + laço no navegador do próprio usuário: sem limite, o
  // refresh automático derrubava o banco.
  const limited = await rateLimit(request, `analytics:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { videoId } = await context.params;
  // id inválido (não-UUID) viria a falhar no Postgres: captura a exceção e
  // responde 404 (linha ausente).
  let video: { title: string; durationSeconds: string | null; objectPath: string; mimeType: string } | undefined;
  try {
    [video] = await db
      .select({ title: videos.title, durationSeconds: videos.durationSeconds, objectPath: videos.objectPath, mimeType: videos.mimeType })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, account.accountOwnerId)))
      .limit(1);
  } catch {
    video = undefined;
  }
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const range = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 3650);
  const now = Date.now();
  const sinceMs = now - range * 86_400_000;
  const since = new Date(sinceMs);
  const previousSince = new Date(now - range * 2 * 86_400_000);
  const bucketDays = Math.max(1, Math.ceil(range / 30));
  const bucketMs = bucketDays * 86_400_000;
  const bucketCount = Math.max(1, Math.ceil(range / bucketDays));

  // Mesma tolerância do original: falha nos eventos derruba a rota (500);
  // falha só nas sessões ao vivo zera o contador `live` e segue.
  //
  // As três agregações rodam no Postgres sobre índices (video_id, created_at):
  // resumo das duas janelas, série temporal e dimensões — nenhuma linha de
  // evento cruza a rede. A matemática é a mesma do summarizeEvents:
  // - métricas = sessões distintas por event_type;
  // - reachedX = complete OU progress >= X;
  // - suspeitas = risk_score >= 50;
  // - dimensões = todas as linhas (grupo existe mesmo sem impression), nome
  //   nulo/vazio como "Não informado".
  let summaryRows: SummarySqlRow[] = [];
  let timelineRows: TimelineSqlRow[] = [];
  let dimensionRows: DimensionSqlRow[] = [];
  try {
    const [summaryResult, timelineResult, dimensionsResult] = await Promise.all([
      db.execute(sql`
        select
          case when created_at >= ${since} then 'current' else 'previous' end as win,
          (count(distinct session_id) filter (where event_type = 'impression'))::int as impressions,
          (count(distinct session_id) filter (where event_type = 'play'))::int as plays,
          (count(distinct session_id) filter (where event_type = 'complete'))::int as completed,
          (count(distinct session_id) filter (where event_type = 'cta_click'))::int as cta_clicks,
          (count(distinct session_id) filter (where event_type = 'conversion'))::int as conversions,
          (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 10)))::int as reached10,
          (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 25)))::int as reached25,
          (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 50)))::int as reached50,
          (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 75)))::int as reached75,
          (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 90)))::int as reached90,
          (count(distinct session_id) filter (where risk_score >= 50))::int as suspicious
        from video_events
        where video_id = ${videoId} and created_at >= ${previousSince}
        group by 1
      `),
      db.execute(sql`
        select
          (floor(extract(epoch from (created_at - ${since})) / ${bucketDays * 86_400}::double precision))::int as bucket,
          (count(distinct session_id) filter (where event_type = 'impression'))::int as impressions,
          (count(distinct session_id) filter (where event_type = 'play'))::int as plays,
          (count(distinct session_id) filter (where event_type = 'complete'))::int as completes,
          (count(distinct session_id) filter (where event_type = 'conversion'))::int as conversions
        from video_events
        where video_id = ${videoId} and created_at >= ${since}
        group by 1
      `),
      db.execute(sql`
        select
          case
            when grouping(country_code) = 0 then 'country_code'
            when grouping(device_type) = 0 then 'device_type'
            when grouping(os_name) = 0 then 'os_name'
            when grouping(browser_name) = 0 then 'browser_name'
            when grouping(traffic_source) = 0 then 'traffic_source'
            when grouping(campaign_id) = 0 then 'campaign_id'
            when grouping(creative_id) = 0 then 'creative_id'
            else 'ad_id'
          end as dimension,
          case
            when grouping(country_code) = 0 then left(coalesce(nullif(country_code, ''), 'Não informado'), 120)
            when grouping(device_type) = 0 then left(coalesce(nullif(device_type, ''), 'Não informado'), 120)
            when grouping(os_name) = 0 then left(coalesce(nullif(os_name, ''), 'Não informado'), 120)
            when grouping(browser_name) = 0 then left(coalesce(nullif(browser_name, ''), 'Não informado'), 120)
            when grouping(traffic_source) = 0 then left(coalesce(nullif(traffic_source, ''), 'Não informado'), 120)
            when grouping(campaign_id) = 0 then left(coalesce(nullif(campaign_id, ''), 'Não informado'), 120)
            when grouping(creative_id) = 0 then left(coalesce(nullif(creative_id, ''), 'Não informado'), 120)
            else left(coalesce(nullif(ad_id, ''), 'Não informado'), 120)
          end as name,
          (count(distinct session_id) filter (where event_type = 'impression'))::int as impressions,
          (count(distinct session_id) filter (where event_type = 'play'))::int as plays,
          (count(distinct session_id) filter (where event_type = 'complete'))::int as completes,
          min(created_at) as first_created
        from video_events
        where video_id = ${videoId} and created_at >= ${since}
        group by grouping sets ((country_code), (device_type), (os_name), (browser_name), (traffic_source), (campaign_id), (creative_id), (ad_id))
        order by dimension asc, first_created asc
      `),
    ]);
    summaryRows = rowsOf<SummarySqlRow>(summaryResult);
    timelineRows = rowsOf<TimelineSqlRow>(timelineResult);
    dimensionRows = rowsOf<DimensionSqlRow>(dimensionsResult);
  } catch {
    return NextResponse.json({ error: "analytics_load_failed" }, { status: 500 });
  }

  let liveRows: Array<{ sessionId: string; countryCode: string; deviceType: string; progressPercent: number; lastSeenAt: Date }> = [];
  try {
    liveRows = await db
      .select({
        sessionId: videoLiveSessions.sessionId,
        countryCode: videoLiveSessions.countryCode,
        deviceType: videoLiveSessions.deviceType,
        progressPercent: videoLiveSessions.progressPercent,
        lastSeenAt: videoLiveSessions.lastSeenAt,
      })
      .from(videoLiveSessions)
      .where(and(eq(videoLiveSessions.videoId, videoId), gt(videoLiveSessions.lastSeenAt, new Date(Date.now() - 45_000))))
      .limit(500);
  } catch {
    liveRows = [];
  }

  const current = statsOf(summaryRows, "current");
  const before = statsOf(summaryRows, "previous");
  const summary = summaryOf(current);
  const previous = summaryOf(before);
  const retention = retentionOf(current);

  const delta = (value: number, base: number) => base ? Math.round(((value - base) / base) * 1000) / 10 : value ? 100 : 0;
  const comparison = {
    previous,
    delta: {
      impressions: delta(summary.impressions, previous.impressions),
      plays: delta(summary.plays, previous.plays),
      playRate: Math.round((summary.playRate - previous.playRate) * 10) / 10,
      completionRate: Math.round((summary.completionRate - previous.completionRate) * 10) / 10,
      conversions: delta(summary.conversions, previous.conversions),
    },
  };

  const funnel = [
    { name: "Visualizações", value: summary.impressions },
    { name: "Plays", value: summary.plays },
    { name: "Assistiu 25%", value: summary.reached25 },
    { name: "Assistiu 50%", value: summary.reached50 },
    { name: "Assistiu 75%", value: summary.reached75 },
    { name: "Concluiu", value: summary.completed },
  ];

  const insights: { tone: string; title: string; detail: string }[] = [];
  if (summary.impressions < 10) insights.push({ tone: "info", title: "Colete mais tráfego", detail: "Ainda há poucos acessos para tirar conclusões seguras. Compartilhe o embed e volte após pelo menos 30 visualizações." });
  else if (summary.playRate < 35) insights.push({ tone: "warning", title: "A abertura está perdendo cliques", detail: "Teste uma thumbnail, headline e Smart Autoplay mais claros. Sua Play Rate está abaixo de 35%." });
  if (summary.plays >= 10 && pct(summary.reached25, summary.plays) < 55) insights.push({ tone: "warning", title: "Queda forte no começo", detail: "Encurte a introdução e antecipe a promessa principal antes dos primeiros 25% do vídeo." });
  if (summary.plays >= 10 && pct(summary.reached75, summary.plays) < 35) insights.push({ tone: "tip", title: "Há espaço para um Mini-Gancho", detail: "A retenção cai antes da oferta. Use um gancho de curiosidade entre 50% e 75% e compare o resultado." });
  if (summary.plays >= 10 && summary.completionRate >= 40) insights.push({ tone: "success", title: "Boa retenção final", detail: "A audiência que inicia permanece até o fim. Foque agora em CTA e taxa de conversão." });

  const activeSessions = liveRows.map((row) => ({
    session_id: row.sessionId,
    country_code: row.countryCode,
    device_type: row.deviceType,
    progress_percent: row.progressPercent,
    last_seen_at: row.lastSeenAt.toISOString(),
  }));

  const live = new Set(activeSessions.map((row) => row.session_id)).size;
  const liveCountryMap = new Map<string, number>();
  for (const session of activeSessions) liveCountryMap.set(session.country_code || "XX", (liveCountryMap.get(session.country_code || "XX") ?? 0) + 1);
  const activeCountries = [...liveCountryMap.entries()].map(([name, viewers]) => ({ name, impressions: viewers, plays: viewers, playRate: 100, completes: 0, completionRate: 0 })).sort((a, b) => b.impressions - a.impressions);

  const attentionMap = retention.slice(1).map((point, index, list) => ({ ...point, drop: index ? Math.max(0, Math.round((list[index - 1].rate - point.rate) * 10) / 10) : Math.max(0, 100 - point.rate) }));
  // `storage_provider` é restrito a 'r2' no schema — R2 é o único storage.
  const previewSource = await signR2ReadUrl(video.objectPath, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null);
  const publicVideo = { title: video.title, duration_seconds: video.durationSeconds === null ? null : Number(video.durationSeconds), source: previewSource, type: video.mimeType };

  return NextResponse.json({
    video: publicVideo,
    range,
    // O cap de 50 mil eventos morreu junto com o streaming de linhas: os
    // números agora são exatos para qualquer volume. A chave permanece no
    // contrato e é sempre false (nada é mais truncado).
    truncated: false,
    summary,
    comparison,
    timeline: timelineOf(timelineRows, sinceMs, bucketMs, bucketCount),
    retention,
    attentionMap,
    funnel,
    fraud: {
      suspiciousSessions: current.suspicious,
      suspiciousRate: pct(current.suspicious, summary.impressions),
      cleanSessions: Math.max(0, summary.impressions - current.suspicious),
    },
    dimensions: dimensionsOf(dimensionRows),
    insights,
    live,
    liveCountries: activeCountries,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
