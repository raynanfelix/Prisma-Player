import { after, NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { consumeAiCredit, refundAiCredit } from "@/lib/billing/ai-credits";
import { analyzeWithNvidia } from "@/lib/ai/nvidia";
import { pct, type AnalyticsSummary, type DimensionRow } from "@/lib/analytics/summarize";
import { ANALYTICS, AI } from "@/lib/constants";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { aiAnalysisJobs, aiCreditWallets, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedTypes = new Set(["performance", "retention", "funnel", "copy", "experiment"]);
const MAX_REQUEST_BYTES = 4096;

/* ------------------------------------------------------------------ */
/* Agregação no Postgres - mesmo padrão vencedor do dashboard           */
/* ------------------------------------------------------------------ */

/**
 * Esta rota puxava até ANALYTICS.MAX_EVENTS_PER_ANALYSIS (50 mil) linhas de
 * video_events e agregava em JavaScript com summarizeEvents. Em vídeo viral o
 * cap truncava os números em silêncio - o snapshot entregava dados mentirosos
 * para a IA (e `truncated: true` no melhor dos casos). Agora o Postgres
 * agrega com `count(distinct ...) filter (...)` sobre o índice (video_id,
 * created_at): sem cap e sem streaming - só agregados cruzam a rede, exatos
 * em qualquer volume. A matemática é a mesma do summarizeEvents:
 * - métricas = sessões distintas por event_type;
 * - reachedX = complete OU progress >= X;
 * - dimensões = todos os grupos (mesmo sem impression), nome nulo/vazio
 *   como "Não informado".
 */

/** `db.execute` devolve `{ rows }` (pg) ou array (outros drivers) - normaliza. */
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

/** Marcos de retenção - exatamente os pontos do summarizeEvents original. */
const RETENTION_POINTS = [0, 10, 25, 50, 75, 90, 100] as const;

type Stats = {
  impressions: number;
  plays: number;
  completed: number;
  ctaClicks: number;
  conversions: number;
  reached: { 10: number; 25: number; 50: number; 75: number; 90: number };
};

type SummarySqlRow = {
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
};

type DimensionSqlRow = { dimension?: string | null; name?: string | null; impressions?: unknown; plays?: unknown; completes?: unknown };

/** Janela sem eventos = a mesma coisa que summarizeEvents([]): tudo zero. */
function statsOf(row: SummarySqlRow | undefined): Stats {
  if (!row) {
    return { impressions: 0, plays: 0, completed: 0, ctaClicks: 0, conversions: 0, reached: { 10: 0, 25: 0, 50: 0, 75: 0, 90: 0 } };
  }
  return {
    impressions: num(row.impressions),
    plays: num(row.plays),
    completed: num(row.completed),
    ctaClicks: num(row.cta_clicks),
    conversions: num(row.conversions),
    reached: { 10: num(row.reached10), 25: num(row.reached25), 50: num(row.reached50), 75: num(row.reached75), 90: num(row.reached90) },
  };
}

/** Mesmo objeto (e mesma ordem de chaves) do summary do summarizeEvents. */
function summaryOf(stats: Stats): AnalyticsSummary {
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
function retentionOf(stats: Stats) {
  return RETENTION_POINTS.map((point) => {
    const viewers = point === 0 ? stats.plays : point === 100 ? stats.completed : stats.reached[point];
    return { point, rate: pct(viewers, stats.plays), viewers };
  });
}

/** Chave do snapshot -> coluna agregada no SQL (GROUPING SETS devolve as 5). */
const DIMENSION_KEYS: Array<[key: string, column: string]> = [
  ["traffic", "traffic_source"],
  ["devices", "device_type"],
  ["countries", "country_code"],
  ["campaigns", "campaign_id"],
  ["creatives", "creative_id"],
];

/**
 * Mesma montagem do summarizeEvents().dimension(): ordenação por impressões
 * desc (empate preservado - o SQL entrega first_created asc; antes a ordem
 * de empate era a ordem arbitrária de retorno do banco, agora é
 * determinística), limite de 30 e rates com o mesmo pct().
 */
function dimensionsOf(rows: DimensionSqlRow[]): Record<string, DimensionRow[]> {
  const grouped = new Map<string, Array<{ name: string; impressions: number; plays: number; completes: number }>>();
  // O SQL devolve uma linha por grupo com o nome da COLUNA agregada
  // ('traffic_source', ...); o mapa é indexado por ela.
  for (const [, column] of DIMENSION_KEYS) grouped.set(column, []);
  for (const row of rows) {
    const list = grouped.get(String(row.dimension));
    if (!list) continue;
    list.push({ name: String(row.name ?? "Não informado"), impressions: num(row.impressions), plays: num(row.plays), completes: num(row.completes) });
  }
  const dimensions: Record<string, DimensionRow[]> = {};
  for (const [key, column] of DIMENSION_KEYS) {
    dimensions[key] = (grouped.get(column) ?? [])
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

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { userId, account, plan } = gate;
  const usageUserId = account.accountOwnerId;

  const parsed = await readJsonBody<{ videoId?: string; type?: string; days?: number; question?: string }>(request, MAX_REQUEST_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const videoId = String(body?.videoId ?? "");
  const type = String(body?.type ?? "performance");
  const days = Math.min(Math.max(Number(body?.days ?? 30), 1), 365);
  const question = String(body?.question ?? "").replace(/[<>]/g, "").trim().slice(0, AI.MAX_USER_QUESTION_LENGTH);
  if (!uuid.test(videoId) || !allowedTypes.has(type)) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const now = Date.now();
  const staleBefore = new Date(now - ANALYTICS.ANALYSIS_ACTIVE_JOB_TIMEOUT_MS);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000);

  // Expira jobs travados em queued/processing além do timeout da análise.
  await db.update(aiAnalysisJobs)
    .set({ status: "failed", errorCode: "analysis_timeout", completedAt: new Date() })
    .where(and(
      eq(aiAnalysisJobs.userId, usageUserId),
      inArray(aiAnalysisJobs.status, ["queued", "processing"]),
      lt(aiAnalysisJobs.createdAt, staleBefore),
    ));

  const recentJobs = await db
    .select({ id: aiAnalysisJobs.id, status: aiAnalysisJobs.status, createdAt: aiAnalysisJobs.createdAt })
    .from(aiAnalysisJobs)
    .where(and(eq(aiAnalysisJobs.userId, usageUserId), gte(aiAnalysisJobs.createdAt, dayAgo)))
    .orderBy(desc(aiAnalysisJobs.createdAt))
    .limit(200);
  const activeJob = recentJobs.find((job) => job.status === "queued" || job.status === "processing");
  if (activeJob) return NextResponse.json({ error: "analysis_in_progress" }, { status: 409 });
  const recentWindowCount = recentJobs.filter((job) => job.createdAt >= tenMinutesAgo).length;
  if (recentWindowCount >= ANALYTICS.ANALYSIS_10MIN_LIMIT) {
    return NextResponse.json({ error: "ai_rate_limit_10m", retryAfterSeconds: 600 }, { status: 429, headers: { "Retry-After": "600" } });
  }
  // O teto diário agora respeita o plano contratado em vez de um número fixo
  // igual para todos os assinantes.
  const dailyLimit = plan.quotas.aiAnalyses && plan.quotas.aiAnalyses > 0 ? plan.quotas.aiAnalyses : ANALYTICS.ANALYSIS_DAILY_LIMIT;
  if (recentJobs.length >= dailyLimit) {
    return NextResponse.json({ error: "ai_rate_limit_daily", retryAfterSeconds: 86400, dailyLimit }, { status: 429, headers: { "Retry-After": "86400" } });
  }

  const [videoRows, walletRows] = await Promise.all([
    db.select({ id: videos.id, title: videos.title, durationSeconds: videos.durationSeconds })
      .from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, usageUserId))).limit(1),
    db.select({ balance: aiCreditWallets.balance }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, usageUserId)).limit(1),
  ]);
  const video = videoRows[0];
  const wallet = walletRows[0];
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  if (!wallet || wallet.balance < 1) return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });

  const since = new Date(Date.now() - days * 86400000);

  // Mesma tolerância do original: erro na leitura dos eventos propagava (500
  // pelo Next) - nenhum try/catch foi adicionado. As duas agregações correm
  // no Postgres sobre o índice (video_id, created_at) e nenhum evento cruza
  // a rede. Sem GROUP BY no resumo, o banco devolve uma única linha (zeros
  // quando a janela está vazia).
  const [summaryResult, dimensionsResult] = await Promise.all([
    db.execute(sql`
      select
        (count(distinct session_id) filter (where event_type = 'impression'))::int as impressions,
        (count(distinct session_id) filter (where event_type = 'play'))::int as plays,
        (count(distinct session_id) filter (where event_type = 'complete'))::int as completed,
        (count(distinct session_id) filter (where event_type = 'cta_click'))::int as cta_clicks,
        (count(distinct session_id) filter (where event_type = 'conversion'))::int as conversions,
        (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 10)))::int as reached10,
        (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 25)))::int as reached25,
        (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 50)))::int as reached50,
        (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 75)))::int as reached75,
        (count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 90)))::int as reached90
      from video_events
      where video_id = ${videoId} and user_id = ${usageUserId} and created_at >= ${since}
    `),
    db.execute(sql`
      select
        case
          when grouping(traffic_source) = 0 then 'traffic_source'
          when grouping(device_type) = 0 then 'device_type'
          when grouping(country_code) = 0 then 'country_code'
          when grouping(campaign_id) = 0 then 'campaign_id'
          else 'creative_id'
        end as dimension,
        case
          when grouping(traffic_source) = 0 then left(coalesce(nullif(traffic_source, ''), 'Não informado'), 120)
          when grouping(device_type) = 0 then left(coalesce(nullif(device_type, ''), 'Não informado'), 120)
          when grouping(country_code) = 0 then left(coalesce(nullif(country_code, ''), 'Não informado'), 120)
          when grouping(campaign_id) = 0 then left(coalesce(nullif(campaign_id, ''), 'Não informado'), 120)
          else left(coalesce(nullif(creative_id, ''), 'Não informado'), 120)
        end as name,
        (count(distinct session_id) filter (where event_type = 'impression'))::int as impressions,
        (count(distinct session_id) filter (where event_type = 'play'))::int as plays,
        (count(distinct session_id) filter (where event_type = 'complete'))::int as completes,
        min(created_at) as first_created
      from video_events
      where video_id = ${videoId} and user_id = ${usageUserId} and created_at >= ${since}
      group by grouping sets ((traffic_source), (device_type), (country_code), (campaign_id), (creative_id))
      order by dimension asc, first_created asc
    `),
  ]);

  const stats = statsOf(rowsOf<SummarySqlRow>(summaryResult)[0]);
  const summary = summaryOf(stats);
  const durationSeconds = video.durationSeconds != null && Number.isFinite(Number(video.durationSeconds))
    ? Number(video.durationSeconds)
    : null;
  const snapshot = {
    video: { id: video.id, title: video.title.slice(0, 200), durationSeconds },
    periodDays: days,
    question,
    // O cap de 50 mil eventos morreu junto com o streaming de linhas: o
    // snapshot é exato em qualquer volume e a chave permanece no contrato
    // sempre como false - mesma decisão já aplicada no dashboard.
    truncated: false,
    summary,
    retention: retentionOf(stats),
    funnel: [
      { name: "Impressao", value: summary.impressions },
      { name: "Play", value: summary.plays },
      { name: "Pitch", value: summary.reached75 },
      { name: "Conclusao", value: summary.completed },
    ],
    dimensions: dimensionsOf(rowsOf<DimensionSqlRow>(dimensionsResult)),
  };

  let job: { id: string };
  try {
    const [created] = await db
      .insert(aiAnalysisJobs)
      .values({ userId: usageUserId, videoId, analysisType: type, status: "processing", inputSnapshot: snapshot })
      .returning({ id: aiAnalysisJobs.id });
    if (!created) return NextResponse.json({ error: "analysis_create_failed" }, { status: 500 });
    job = created;
  } catch (error) {
    // Índice único "um job ativo por usuário" (queued/processing).
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return NextResponse.json({ error: "analysis_in_progress" }, { status: 409 });
    return NextResponse.json({ error: "analysis_create_failed" }, { status: 500 });
  }

  // O crédito é debitado ANTES de chamar o provedor. Na ordem anterior, uma
  // falha no débito acontecia depois de a análise já ter sido paga à NVIDIA:
  // custo real, sem entrega e sem cobrança. Se a análise falhar, devolvemos.
  const reference = `ai_analysis:${job.id}`;
  const debit = await consumeAiCredit(usageUserId, reference, { analysisId: job.id, videoId, actorUserId: userId });
  if (!debit.ok) {
    await db.update(aiAnalysisJobs).set({ status: "failed", errorCode: "credit_debit_failed", completedAt: new Date() }).where(eq(aiAnalysisJobs.id, job.id));
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  try {
    const analysis = await analyzeWithNvidia(snapshot);
    after(async () => {
      try {
        await db.update(aiAnalysisJobs).set({ status: "completed", result: analysis.result, model: analysis.model, creditsUsed: 1, completedAt: new Date() }).where(eq(aiAnalysisJobs.id, job.id));
      } catch (cause) {
        console.error("ai_analysis_job_complete_failed", { jobId: job.id, error: cause instanceof Error ? cause.message : "unknown" });
      }
    });
    return NextResponse.json({ id: job.id, result: analysis.result, balance: debit.remaining });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.slice(0, 80) : "analysis_failed";
    // Estorna o crédito: o usuário não pode pagar por uma análise que não saiu.
    const refund = await refundAiCredit(usageUserId, reference);
    await db.update(aiAnalysisJobs).set({ status: "failed", errorCode: code, completedAt: new Date() }).where(eq(aiAnalysisJobs.id, job.id));
    if (!refund.ok) console.error("ai_credit_refund_failed", { jobId: job.id, reference, message: refund.reason });
    return NextResponse.json({ error: code, refunded: refund.ok }, { status: code === "nvidia_not_configured" ? 503 : 502 });
  }
}
