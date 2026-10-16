import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { db, schema } from "@/lib/db";
import { pixelIntegrations } from "@/lib/player/pixels";
import { serverConnectionAvailable } from "@/services/ads/server-events";

const { playerConfigs, videoEvents } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  if (!uuid.test(videoId)) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  const since = new Date(Date.now() - 86_400_000);
  // Falha no player → 404 (o SDK antigo devolvia data nula); falha nos
  // eventos → 500. Mesma precedência do diagnóstico original.
  const [playerRow, eventRows] = await Promise.all([
    db
      .select({ config: playerConfigs.config })
      .from(playerConfigs)
      .where(and(eq(playerConfigs.videoId, videoId), eq(playerConfigs.userId, gate.account.accountOwnerId)))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
    db
      .select({ eventType: videoEvents.eventType, createdAt: videoEvents.createdAt })
      .from(videoEvents)
      .where(and(eq(videoEvents.videoId, videoId), eq(videoEvents.userId, gate.account.accountOwnerId), gte(videoEvents.createdAt, since)))
      .orderBy(desc(videoEvents.createdAt))
      .limit(2_000)
      .then((rows) => rows)
      .catch(() => null),
  ]);
  if (!playerRow) return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  if (!eventRows) return NextResponse.json({ error: "diagnostic_load_failed" }, { status: 500 });

  const integrations = pixelIntegrations((playerRow.config && typeof playerRow.config === "object" ? playerRow.config : {}) as Record<string, unknown>);
  const counts: Record<string, number> = {};
  for (const event of eventRows) counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
  return NextResponse.json({
    eventCount: eventRows.length,
    lastEventAt: eventRows[0] ? eventRows[0].createdAt.toISOString() : null,
    events: counts,
    providers: integrations.map((item) => ({ provider: item.provider, id: item.id, browser: true, server: serverConnectionAvailable(item.provider, item.id) })),
  }, { headers: { "cache-control": "no-store" } });
}
