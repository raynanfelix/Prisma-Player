import "server-only";

import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const { videoEvents, videos } = schema;

/**
 * Neon Realtime - engine de live queries.
 * Server-side: sela queries SQL com NEON_REALTIME_SECRET e as expõe para o
 * client (o client só vê a query selada, nunca o SQL nem os parâmetros).
 */
const secret = process.env.NEON_REALTIME_SECRET;

export const realtime = secret
  ? createRealtime({ secret, db: "neondb", adapter: drizzleAdapter() })
  : null;

/**
 * Live query: contadores de stats por vídeo (plays, impressões, conclusões).
 * Autorizada na própria query: WHERE user_id = $1 - o dono só vê os seus.
 */
export function videoStatsQuery(userId: string) {
  return db
    .select({
      videoId: videos.id,
      title: videos.title,
      status: videos.status,
      plays: sql<number>`(SELECT count(DISTINCT session_id) FROM video_events WHERE video_id = ${videos.id} AND event_type = 'play')::int`,
      impressions: sql<number>`(SELECT count(DISTINCT session_id) FROM video_events WHERE video_id = ${videos.id} AND event_type = 'impression')::int`,
      conversions: sql<number>`(SELECT count(DISTINCT session_id) FROM video_events WHERE video_id = ${videos.id} AND event_type = 'conversion')::int`,
    })
    .from(videos)
    .where(eq(videos.userId, userId))
    .limit(200);
}

/**
 * Live query: contadores agregados da conta (totais de vídeos por status).
 */
export function videoCountersQuery(userId: string) {
  return db
    .select({
      total: sql<number>`count(*)::int`,
      ready: sql<number>`count(*) filter (where status = 'ready')::int`,
      published: sql<number>`count(*) filter (where status = 'ready')::int`,
      processing: sql<number>`count(*) filter (where status = 'processing')::int`,
    })
    .from(videos)
    .where(eq(videos.userId, userId));
}

/**
 * Live query: contadores de eventos recentes (últimas 24h).
 */
export function liveEventsQuery(userId: string) {
  return db
    .select({
      eventType: videoEvents.eventType,
      total: sql<number>`count(DISTINCT session_id)::int`,
    })
    .from(videoEvents)
    .where(sql`${videoEvents.userId} = ${userId} AND ${videoEvents.createdAt} >= now() - interval '24 hours'`)
    .groupBy(videoEvents.eventType);
}

/** Sela uma query e devolve o token pro client assinar. */
export async function sealQuery<T>(query: Parameters<NonNullable<typeof realtime>["seal"]>[0]["query"]): Promise<T | null> {
  const engine = realtime;
  if (!engine) return null;
  try {
    return (await engine.seal({ query })) as T;
  } catch (error) {
    console.error("realtime_seal_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}
