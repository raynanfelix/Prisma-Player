import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth/server";
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
import { db, schema } from "@/lib/db";

const { aiCreditWallets, billingPlans, subscriptions, videoEvents, videos } = schema;

const watchTypes = ["play", "progress", "complete"];

function toBandwidthEvents(rows: Array<{
  videoId: string;
  sessionId: string;
  eventType: string;
  watchedSeconds: string;
  createdAt: Date;
}>): BandwidthRawEvent[] {
  return rows.flatMap((row) => {
    const watchedSeconds = Number(row.watchedSeconds);
    if (!Number.isFinite(watchedSeconds)) return [];
    return [
      {
        videoId: row.videoId,
        sessionId: row.sessionId,
        eventType: row.eventType,
        watchedSeconds,
        createdAt: row.createdAt.toISOString(),
      },
    ];
  });
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const watchEventColumns = {
    videoId: videoEvents.videoId,
    sessionId: videoEvents.sessionId,
    eventType: videoEvents.eventType,
    watchedSeconds: videoEvents.watchedSeconds,
    createdAt: videoEvents.createdAt,
  };
  const [subscriptionRows, videoRows, playRows, monthEventRows, recentEventRows, walletRows, videoCountRows, access] = await Promise.all([
    db.select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingMethod: subscriptions.billingMethod,
      provider: subscriptions.provider,
      planName: billingPlans.name,
      planIncludedPlays: billingPlans.includedPlays,
      planStorageGb: billingPlans.storageGb,
      planPrismaAiAnalyses: billingPlans.prismaAiAnalyses,
      planTeamSeats: billingPlans.teamSeats,
    })
      .from(subscriptions)
      .leftJoin(billingPlans, eq(billingPlans.id, subscriptions.planId))
      .where(eq(subscriptions.userId, userId))
      .limit(1),
    db.select({ id: videos.id, sizeBytes: videos.sizeBytes, durationSeconds: videos.durationSeconds }).from(videos).where(eq(videos.userId, userId)),
    db.select({ sessionId: videoEvents.sessionId })
      .from(videoEvents)
      .where(and(eq(videoEvents.userId, userId), eq(videoEvents.eventType, "play"), gte(videoEvents.createdAt, monthStart))),
    db.select(watchEventColumns)
      .from(videoEvents)
      .where(and(eq(videoEvents.userId, userId), inArray(videoEvents.eventType, watchTypes), gte(videoEvents.createdAt, monthStart)))
      .orderBy(desc(videoEvents.createdAt))
      .limit(BANDWIDTH.MAX_EVENTS_FOR_BANDWIDTH),
    db.select(watchEventColumns)
      .from(videoEvents)
      .where(and(eq(videoEvents.userId, userId), inArray(videoEvents.eventType, watchTypes), gte(videoEvents.createdAt, ninetyDaysAgo)))
      .orderBy(desc(videoEvents.createdAt))
      .limit(BANDWIDTH.MAX_EVENTS_FOR_BANDWIDTH),
    db.select({ balance: aiCreditWallets.balance, lifetimeUsed: aiCreditWallets.lifetimeUsed }).from(aiCreditWallets).where(eq(aiCreditWallets.userId, userId)).limit(1),
    db.select({ videoCount: sql<number>`count(*)::int` }).from(videos).where(eq(videos.userId, userId)),
    getAccountAccess(userId),
  ]);
  const subscription = subscriptionRows[0];
  const wallet = walletRows[0];
  const plan = subscription ? {
    name: subscription.planName,
    included_plays: subscription.planIncludedPlays,
    storage_gb: subscription.planStorageGb,
    prisma_ai_analyses: subscription.planPrismaAiAnalyses,
    team_seats: subscription.planTeamSeats,
  } : null;
  const videoMetaList: BandwidthVideoMeta[] = [];
  let storageBytes = 0;
  for (const item of videoRows) {
    const sizeBytes = Number(item.sizeBytes);
    const durationSeconds = Number(item.durationSeconds);
    if (Number.isFinite(sizeBytes) && sizeBytes > 0) storageBytes += sizeBytes;
    if (Number.isFinite(sizeBytes) && Number.isFinite(durationSeconds)) {
      videoMetaList.push({ id: item.id, sizeBytes, durationSeconds });
    }
  }
  const uniquePlays = new Set(playRows.map((item) => item.sessionId)).size;
  const monthSessions = aggregateWatchedBySession(toBandwidthEvents(monthEventRows));
  const recentSessions = aggregateWatchedBySession(toBandwidthEvents(recentEventRows));
  const monthEgressBytes = estimateEgressFromSessions({ sessions: monthSessions, videos: videoMetaList });
  const monthCostCents = bandwidthCostCents(monthEgressBytes, BANDWIDTH.EGRESS_CENTS_PER_GB);
  const todayDate = new Date().toISOString().slice(0, 10);
  const series30 = summarizeSessionsByDay({ sessions: monthSessions, videos: videoMetaList, fromDate: monthStartIso.slice(0, 10), toDate: todayDate });
  const series90 = summarizeSessionsByDay({ sessions: recentSessions, videos: videoMetaList, fromDate: ninetyDaysAgo.toISOString().slice(0, 10), toDate: todayDate });
  return NextResponse.json({
    access,
    subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null, billingMethod: subscription.billingMethod, provider: subscription.provider } : null,
    plan,
    usage: {
      plays: uniquePlays,
      storageBytes,
      videos: videoCountRows[0]?.videoCount ?? 0,
      aiCredits: wallet?.balance ?? 0,
      aiUsed: wallet?.lifetimeUsed ?? 0,
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
