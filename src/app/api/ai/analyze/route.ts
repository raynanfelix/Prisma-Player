import { after, NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { consumeAiCredit, refundAiCredit } from "@/lib/billing/ai-credits";
import { analyzeWithNvidia } from "@/lib/ai/nvidia";
import { summarizeEvents, type AnalyticsEventRow } from "@/lib/analytics/summarize";
import { ANALYTICS, AI } from "@/lib/constants";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { aiAnalysisJobs, aiCreditWallets, videoEvents, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedTypes = new Set(["performance", "retention", "funnel", "copy", "experiment"]);
const MAX_REQUEST_BYTES = 4096;

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
  const eventRows = await db
    .select({
      sessionId: videoEvents.sessionId,
      eventType: videoEvents.eventType,
      progressPercent: videoEvents.progressPercent,
      trafficSource: videoEvents.trafficSource,
      deviceType: videoEvents.deviceType,
      countryCode: videoEvents.countryCode,
      campaignId: videoEvents.campaignId,
      creativeId: videoEvents.creativeId,
      riskScore: videoEvents.riskScore,
      createdAt: videoEvents.createdAt,
    })
    .from(videoEvents)
    .where(and(eq(videoEvents.videoId, videoId), eq(videoEvents.userId, usageUserId), gte(videoEvents.createdAt, since)))
    .limit(ANALYTICS.MAX_EVENTS_PER_ANALYSIS);

  const rows: AnalyticsEventRow[] = eventRows.map((row) => ({
    session_id: row.sessionId,
    event_type: row.eventType,
    progress_percent: row.progressPercent,
    traffic_source: row.trafficSource,
    device_type: row.deviceType,
    country_code: row.countryCode,
    campaign_id: row.campaignId,
    creative_id: row.creativeId,
    risk_score: row.riskScore,
    created_at: row.createdAt.toISOString(),
  }));
  const aggregate = summarizeEvents(rows);
  const durationSeconds = video.durationSeconds != null && Number.isFinite(Number(video.durationSeconds))
    ? Number(video.durationSeconds)
    : null;
  const snapshot = {
    video: { id: video.id, title: video.title.slice(0, 200), durationSeconds },
    periodDays: days,
    question,
    truncated: rows.length >= ANALYTICS.MAX_EVENTS_PER_ANALYSIS,
    summary: aggregate.summary,
    retention: aggregate.retention,
    funnel: [
      { name: "Impressao", value: aggregate.summary.impressions },
      { name: "Play", value: aggregate.summary.plays },
      { name: "Pitch", value: aggregate.summary.reached75 },
      { name: "Conclusao", value: aggregate.summary.completed },
    ],
    dimensions: {
      traffic: aggregate.dimension("traffic_source"),
      devices: aggregate.dimension("device_type"),
      countries: aggregate.dimension("country_code"),
      campaigns: aggregate.dimension("campaign_id"),
      creatives: aggregate.dimension("creative_id"),
    },
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
