import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountAccess } from "@/lib/access/service";
import { BANDWIDTH } from "@/lib/constants";
import {
  aggregateWatchedBySession,
  bandwidthCostCents,
  estimateEgressFromSessions,
  summarizeSessionsByDay,
  trendPercentage,
  type BandwidthRawEvent,
  type BandwidthVideoMeta,
} from "@/lib/analytics/bandwidth";

type RawEventRow = Record<string, unknown>;

function toBandwidthRawEvents(rows: unknown): BandwidthRawEvent[] {
  const entries = Array.isArray(rows) ? (rows as RawEventRow[]) : [];
  return entries.flatMap((row) => {
    if (row === null || typeof row !== "object") return [];
    const videoId = row.video_id;
    const sessionId = row.session_id;
    const watched = row.watched_seconds;
    if (typeof videoId !== "string" || typeof sessionId !== "string") return [];
    if (typeof watched !== "number" && typeof watched !== "string") return [];
    const watchedSeconds = Number(watched);
    if (!Number.isFinite(watchedSeconds)) return [];
    return [
      {
        videoId,
        sessionId,
        eventType: typeof row.event_type === "string" ? row.event_type : "",
        watchedSeconds,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      },
    ];
  });
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const watchEvents = "video_id,session_id,event_type,watched_seconds,created_at";
  const watchTypes = ["play", "progress", "complete"];
  const [subscription, storage, plays, monthEvents, recentEvents, wallet, videos, access] = await Promise.all([
    admin.from("subscriptions").select("status,current_period_end,billing_method,plan:billing_plans(name,included_plays,storage_gb,prisma_ai_analyses,team_seats)").eq("user_id", userId).maybeSingle(),
    admin.from("videos").select("id,size_bytes,duration_seconds").eq("user_id", userId),
    admin.from("video_events").select("session_id").eq("user_id", userId).eq("event_type", "play").gte("created_at", monthStartIso),
    admin.from("video_events").select(watchEvents).eq("user_id", userId).in("event_type", watchTypes).gte("created_at", monthStartIso).order("created_at", { ascending: false }).limit(BANDWIDTH.MAX_EVENTS_FOR_BANDWIDTH),
    admin.from("video_events").select(watchEvents).eq("user_id", userId).in("event_type", watchTypes).gte("created_at", ninetyDaysAgo).order("created_at", { ascending: false }).limit(BANDWIDTH.MAX_EVENTS_FOR_BANDWIDTH),
    admin.from("ai_credit_wallets").select("balance,lifetime_used").eq("user_id", userId).maybeSingle(),
    admin.from("videos").select("id", { count: "exact", head: true }).eq("user_id", userId),
    getAccountAccess(userId),
  ]);
  const plan = Array.isArray(subscription.data?.plan) ? subscription.data.plan[0] : subscription.data?.plan;
  const videoMetaList: BandwidthVideoMeta[] = [];
  let storageBytes = 0;
  for (const item of storage.data ?? []) {
    const sizeBytes = Number(item.size_bytes);
    const durationSeconds = Number(item.duration_seconds);
    if (Number.isFinite(sizeBytes) && sizeBytes > 0) storageBytes += sizeBytes;
    if (typeof item.id === "string" && item.id && Number.isFinite(sizeBytes) && Number.isFinite(durationSeconds)) {
      videoMetaList.push({ id: item.id, sizeBytes, durationSeconds });
    }
  }
  const uniquePlays = new Set((plays.data ?? []).map((item) => item.session_id)).size;
  const monthSessions = aggregateWatchedBySession(toBandwidthRawEvents(monthEvents.data));
  const recentSessions = aggregateWatchedBySession(toBandwidthRawEvents(recentEvents.data));
  const monthEgressBytes = estimateEgressFromSessions({ sessions: monthSessions, videos: videoMetaList });
  const monthCostCents = bandwidthCostCents(monthEgressBytes, BANDWIDTH.EGRESS_CENTS_PER_GB);
  const todayDate = new Date().toISOString().slice(0, 10);
  const series30 = summarizeSessionsByDay({ sessions: monthSessions, videos: videoMetaList, fromDate: monthStartIso.slice(0, 10), toDate: todayDate });
  const series90 = summarizeSessionsByDay({ sessions: recentSessions, videos: videoMetaList, fromDate: ninetyDaysAgo.slice(0, 10), toDate: todayDate });
  return NextResponse.json({
    access,
    subscription: subscription.data ? { status: subscription.data.status, currentPeriodEnd: subscription.data.current_period_end, billingMethod: subscription.data.billing_method } : null,
    plan: plan ?? null,
    usage: {
      plays: uniquePlays,
      storageBytes,
      videos: videos.count ?? 0,
      aiCredits: wallet.data?.balance ?? 0,
      aiUsed: wallet.data?.lifetime_used ?? 0,
      bandwidth: {
        monthEgressBytes,
        monthCostCents,
        gb: monthEgressBytes / BANDWIDTH.BYTES_PER_GB,
        centsPerGb: BANDWIDTH.EGRESS_CENTS_PER_GB,
        series30,
        series90,
        trendPct: trendPercentage(series90),
      },
    },
  });
}