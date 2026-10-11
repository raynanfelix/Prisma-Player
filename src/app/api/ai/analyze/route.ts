import { after, NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeWithNvidia } from "@/lib/ai/nvidia";
import { summarizeEvents, type AnalyticsEventRow } from "@/lib/analytics/summarize";
import { ANALYTICS, AI } from "@/lib/constants";

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

  const admin = createAdminClient();
  const now = Date.now();
  const staleBefore = new Date(now - ANALYTICS.ANALYSIS_ACTIVE_JOB_TIMEOUT_MS).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

  await admin.from("ai_analysis_jobs")
    .update({ status: "failed", error_code: "analysis_timeout", completed_at: new Date().toISOString() })
    .eq("user_id", usageUserId)
    .in("status", ["queued", "processing"])
    .lt("created_at", staleBefore);

  const { data: recentJobs, error: recentJobsError } = await admin.from("ai_analysis_jobs")
    .select("id,status,created_at")
    .eq("user_id", usageUserId)
    .gte("created_at", dayAgo)
    .order("created_at", { ascending: false })
    .limit(200);
  if (recentJobsError) return NextResponse.json({ error: "ai_limits_unavailable" }, { status: 503 });
  const activeJob = recentJobs?.find((job) => job.status === "queued" || job.status === "processing");
  if (activeJob) return NextResponse.json({ error: "analysis_in_progress" }, { status: 409 });
  const recentWindowCount = recentJobs?.filter((job) => String(job.created_at) >= tenMinutesAgo).length ?? 0;
  if (recentWindowCount >= ANALYTICS.ANALYSIS_10MIN_LIMIT) {
    return NextResponse.json({ error: "ai_rate_limit_10m", retryAfterSeconds: 600 }, { status: 429, headers: { "Retry-After": "600" } });
  }
  // O teto diário agora respeita o plano contratado em vez de um número fixo
  // igual para todos os assinantes.
  const dailyLimit = plan.quotas.aiAnalyses && plan.quotas.aiAnalyses > 0 ? plan.quotas.aiAnalyses : ANALYTICS.ANALYSIS_DAILY_LIMIT;
  if ((recentJobs?.length ?? 0) >= dailyLimit) {
    return NextResponse.json({ error: "ai_rate_limit_daily", retryAfterSeconds: 86400, dailyLimit }, { status: 429, headers: { "Retry-After": "86400" } });
  }

  const [{ data: video }, { data: wallet }] = await Promise.all([
    admin.from("videos").select("id,title,duration_seconds").eq("id", videoId).eq("user_id", usageUserId).maybeSingle(),
    admin.from("ai_credit_wallets").select("balance").eq("user_id", usageUserId).maybeSingle(),
  ]);
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  if (!wallet || wallet.balance < 1) return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: events, error } = await admin.from("video_events")
    .select("session_id,event_type,progress_percent,traffic_source,device_type,country_code,campaign_id,creative_id,risk_score,created_at")
    .eq("video_id", videoId).eq("user_id", usageUserId).gte("created_at", since).limit(ANALYTICS.MAX_EVENTS_PER_ANALYSIS);
  if (error) return NextResponse.json({ error: "metrics_unavailable" }, { status: 500 });

  const rows = (events ?? []) as AnalyticsEventRow[];
  const aggregate = summarizeEvents(rows);
  const snapshot = {
    video: { id: video.id, title: video.title.slice(0, 200), durationSeconds: video.duration_seconds },
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

  const { data: job, error: jobError } = await admin.from("ai_analysis_jobs")
    .insert({ user_id: usageUserId, video_id: videoId, analysis_type: type, status: "processing", input_snapshot: snapshot })
    .select("id")
    .single();
  if (jobError || !job) {
    if (jobError?.code === "23505") return NextResponse.json({ error: "analysis_in_progress" }, { status: 409 });
    return NextResponse.json({ error: "analysis_create_failed" }, { status: 500 });
  }

  // O crédito é debitado ANTES de chamar o provedor. Na ordem anterior, uma
  // falha no débito acontecia depois de a análise já ter sido paga à NVIDIA:
  // custo real, sem entrega e sem cobrança. Se a análise falhar, devolvemos.
  const reference = `ai_analysis:${job.id}`;
  const { data: remaining, error: debitError } = await admin.rpc("consume_ai_credit", { p_user_id: usageUserId, p_reference: reference, p_metadata: { analysisId: job.id, videoId, actorUserId: userId } });
  if (debitError || typeof remaining !== "number") {
    await admin.from("ai_analysis_jobs").update({ status: "failed", error_code: "credit_debit_failed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
  }

  try {
    const analysis = await analyzeWithNvidia(snapshot);
    after(async () => {
      try {
        await admin.from("ai_analysis_jobs").update({ status: "completed", result: analysis.result, model: analysis.model, credits_used: 1, completed_at: new Date().toISOString() }).eq("id", job.id);
      } catch (cause) {
        console.error("ai_analysis_job_complete_failed", { jobId: job.id, error: cause instanceof Error ? cause.message : "unknown" });
      }
    });
    return NextResponse.json({ id: job.id, result: analysis.result, balance: remaining });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.slice(0, 80) : "analysis_failed";
    // Estorna o crédito: o usuário não pode pagar por uma análise que não saiu.
    const refund = await admin.rpc("refund_ai_credit", { p_user_id: usageUserId, p_reference: reference });
    await admin.from("ai_analysis_jobs").update({ status: "failed", error_code: code, completed_at: new Date().toISOString() }).eq("id", job.id);
    if (refund.error) console.error("ai_credit_refund_failed", { jobId: job.id, reference, message: refund.error.message });
    return NextResponse.json({ error: code, refunded: !refund.error }, { status: code === "nvidia_not_configured" ? 503 : 502 });
  }
}
