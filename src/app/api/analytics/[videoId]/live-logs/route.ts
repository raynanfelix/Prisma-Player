import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const { videos, videoEvents, videoLiveSessions } = schema;

export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;
  const { videoId } = await context.params;
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase() ?? "";
  const limited = await rateLimit(request, `analytics-live:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  let videoExists = false;
  try {
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, account.accountOwnerId)))
      .limit(1);
    videoExists = rows.length > 0;
  } catch {
    videoExists = false;
  }
  if (!videoExists) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const filterCountry = country && country !== "DESCONHECIDO" && country !== "XX";
  const liveWindow = new Date(Date.now() - 45_000);
  const eventsWindow = new Date(Date.now() - 15 * 60_000);
  const activeConditions = [eq(videoLiveSessions.videoId, videoId), gt(videoLiveSessions.lastSeenAt, liveWindow)];
  const eventConditions = [eq(videoEvents.videoId, videoId), gt(videoEvents.createdAt, eventsWindow)];
  if (filterCountry) {
    activeConditions.push(eq(videoLiveSessions.countryCode, country));
    eventConditions.push(eq(videoEvents.countryCode, country));
  }

  let activeViewers: Array<{ session_id: string; country_code: string; device_type: string; progress_percent: number; last_seen_at: string }> = [];
  let events: Array<{ session_id: string; event_type: string; progress_percent: number; device_type: string; created_at: string }> = [];
  try {
    const [activeRows, eventRows] = await Promise.all([
      db
        .select({
          sessionId: videoLiveSessions.sessionId,
          countryCode: videoLiveSessions.countryCode,
          deviceType: videoLiveSessions.deviceType,
          progressPercent: videoLiveSessions.progressPercent,
          lastSeenAt: videoLiveSessions.lastSeenAt,
        })
        .from(videoLiveSessions)
        .where(and(...activeConditions))
        .orderBy(desc(videoLiveSessions.lastSeenAt))
        .limit(500),
      db
        .select({
          sessionId: videoEvents.sessionId,
          eventType: videoEvents.eventType,
          progressPercent: videoEvents.progressPercent,
          deviceType: videoEvents.deviceType,
          createdAt: videoEvents.createdAt,
        })
        .from(videoEvents)
        .where(and(...eventConditions))
        .orderBy(desc(videoEvents.createdAt), desc(videoEvents.id))
        .limit(50),
    ]);
    // created_at em ISO mantém o id do log e o horário exibidos idênticos ao
    // contrato anterior (o driver devolve Date para timestamptz).
    activeViewers = activeRows.map((row) => ({
      session_id: row.sessionId,
      country_code: row.countryCode,
      device_type: row.deviceType,
      progress_percent: row.progressPercent,
      last_seen_at: row.lastSeenAt.toISOString(),
    }));
    events = eventRows.map((row) => ({
      session_id: row.sessionId,
      event_type: row.eventType,
      progress_percent: row.progressPercent,
      device_type: row.deviceType,
      created_at: row.createdAt.toISOString(),
    }));
  } catch {
    return NextResponse.json({ error: "failed_to_load_live_logs" }, { status: 500 });
  }

  const labels: Record<string, string> = { impression: "Acessou a página", play: "Iniciou a reprodução", complete: "Concluiu o vídeo", cta_click: "Clicou no CTA", conversion: "Conversão aprovada" };
  const logs = events.map((row) => ({
    id: `${row.session_id}-${row.event_type}-${row.progress_percent}-${row.created_at}`,
    time: new Date(row.created_at).toLocaleTimeString("pt-BR"),
    event: row.event_type === "progress" ? `Chegou a ${row.progress_percent}% do vídeo` : labels[row.event_type] ?? row.event_type,
    device: row.device_type === "mobile" ? "Mobile" : row.device_type === "tablet" ? "Tablet" : row.device_type === "desktop" ? "Desktop" : "Outro",
  }));
  return NextResponse.json({
    activeCount: activeViewers.length,
    activeViewers: activeViewers.map((viewer) => ({ country: viewer.country_code, device: viewer.device_type, progress: viewer.progress_percent, lastSeenAt: viewer.last_seen_at })),
    logs,
  }, { headers: { "cache-control": "no-store" } });
}
