import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { pixelIntegrations } from "@/lib/player/pixels";
import { serverConnectionAvailable } from "@/services/ads/server-events";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  if (!uuid.test(videoId)) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  const supabase = createAdminClient();
  const [{ data: player }, { data: events, error }] = await Promise.all([
    supabase.from("player_configs").select("config").eq("video_id", videoId).eq("user_id", gate.account.accountOwnerId).maybeSingle(),
    supabase.from("video_events").select("event_type,created_at").eq("video_id", videoId).eq("user_id", gate.account.accountOwnerId).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(2_000),
  ]);
  if (!player) return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  if (error) return NextResponse.json({ error: "diagnostic_load_failed" }, { status: 500 });

  const integrations = pixelIntegrations((player.config && typeof player.config === "object" ? player.config : {}) as Record<string, unknown>);
  const counts: Record<string, number> = {};
  for (const event of events ?? []) counts[event.event_type] = (counts[event.event_type] ?? 0) + 1;
  return NextResponse.json({
    eventCount: events?.length ?? 0,
    lastEventAt: events?.[0]?.created_at ?? null,
    events: counts,
    providers: integrations.map((item) => ({ provider: item.provider, id: item.id, browser: true, server: serverConnectionAvailable(item.provider, item.id) })),
  }, { headers: { "cache-control": "no-store" } });
}
