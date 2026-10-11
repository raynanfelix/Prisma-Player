import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;
  const { videoId } = await context.params;
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase() ?? "";
  const limited = await rateLimit(request, `analytics-live:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;
  const supabase = createAdminClient();
  const { data: video } = await supabase.from("videos").select("id").eq("id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const filterCountry = country && country !== "DESCONHECIDO" && country !== "XX";
  let activeQuery = supabase.from("video_live_sessions").select("session_id,country_code,device_type,progress_percent,last_seen_at").eq("video_id", videoId).gt("last_seen_at", new Date(Date.now() - 45_000).toISOString());
  let eventsQuery = supabase.from("video_events").select("session_id,event_type,progress_percent,device_type,created_at").eq("video_id", videoId).gt("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
  if (filterCountry) { activeQuery = activeQuery.eq("country_code", country); eventsQuery = eventsQuery.eq("country_code", country); }
  const [{ data: activeViewers, error: activeError }, { data: events, error }] = await Promise.all([
    activeQuery.order("last_seen_at", { ascending: false }).limit(500),
    eventsQuery.order("created_at", { ascending: false }).limit(50),
  ]);
  if (error || activeError) return NextResponse.json({ error: "failed_to_load_live_logs" }, { status: 500 });

  const labels: Record<string, string> = { impression: "Acessou a página", play: "Iniciou a reprodução", complete: "Concluiu o vídeo", cta_click: "Clicou no CTA", conversion: "Conversão aprovada" };
  const logs = (events ?? []).map((row) => ({
    id: `${row.session_id}-${row.event_type}-${row.progress_percent}-${row.created_at}`,
    time: new Date(row.created_at).toLocaleTimeString("pt-BR"),
    event: row.event_type === "progress" ? `Chegou a ${row.progress_percent}% do vídeo` : labels[row.event_type] ?? row.event_type,
    device: row.device_type === "mobile" ? "Mobile" : row.device_type === "tablet" ? "Tablet" : row.device_type === "desktop" ? "Desktop" : "Outro",
  }));
  return NextResponse.json({
    activeCount: activeViewers?.length ?? 0,
    activeViewers: (activeViewers ?? []).map((viewer) => ({ country: viewer.country_code, device: viewer.device_type, progress: viewer.progress_percent, lastSeenAt: viewer.last_seen_at })),
    logs,
  }, { headers: { "cache-control": "no-store" } });
}
