import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildTimeline, pct, summarizeEvents, type AnalyticsEventRow } from "@/lib/analytics/summarize";
import { ANALYTICS, VIDEO } from "@/lib/constants";

export async function GET(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  // A rota mais cara do sistema (até 50 mil linhas + agregação) não tinha
  // nenhum limite: um laço no navegador do próprio usuário derrubava o banco.
  const limited = await rateLimit(request, `analytics:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { videoId } = await context.params;
  const admin = createAdminClient();
  const { data: video } = await admin.from("videos").select("id,title,duration_seconds,created_at,object_path,mime_type,storage_provider").eq("id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const range = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30), 1), 3650);
  const now = Date.now(), since = new Date(now - range * 86400000).toISOString(), previousSince = new Date(now - range * 2 * 86400000).toISOString();
  const [{ data, error }, { data: activeSessions, error: liveError }] = await Promise.all([
    admin.from("video_events").select("session_id,event_type,progress_percent,watched_seconds,country_code,device_type,os_name,browser_name,traffic_source,campaign_id,creative_id,ad_id,risk_score,created_at").eq("video_id", videoId).gte("created_at", previousSince).order("created_at", { ascending: true }).limit(ANALYTICS.MAX_EVENTS_PER_ANALYSIS),
    admin.from("video_live_sessions").select("session_id,country_code,device_type,progress_percent,last_seen_at").eq("video_id", videoId).gt("last_seen_at", new Date(Date.now() - 45_000).toISOString()).limit(500),
  ]);
  if (error) return NextResponse.json({ error: "analytics_load_failed" }, { status: 500 });

  const allRows = (data ?? []) as AnalyticsEventRow[];
  // O corte em 50 mil linhas era silencioso: o painel mostrava números truncados
  // como se fossem completos. Agora o cliente recebe o aviso junto com os dados.
  const truncated = allRows.length >= ANALYTICS.MAX_EVENTS_PER_ANALYSIS;
  const rows = allRows.filter((row) => (row.created_at ?? "") >= since);
  const previousRows = allRows.filter((row) => (row.created_at ?? "") < since);

  const current = summarizeEvents(rows);
  const before = summarizeEvents(previousRows);
  const summary = current.summary;
  const previous = before.summary;

  const delta = (value: number, base: number) => base ? Math.round(((value - base) / base) * 1000) / 10 : value ? 100 : 0;
  const comparison = {
    previous,
    delta: {
      impressions: delta(summary.impressions, previous.impressions),
      plays: delta(summary.plays, previous.plays),
      playRate: Math.round((summary.playRate - previous.playRate) * 10) / 10,
      completionRate: Math.round((summary.completionRate - previous.completionRate) * 10) / 10,
      conversions: delta(summary.conversions, previous.conversions),
    },
  };

  const funnel = [
    { name: "Visualizações", value: summary.impressions },
    { name: "Plays", value: summary.plays },
    { name: "Assistiu 25%", value: summary.reached25 },
    { name: "Assistiu 50%", value: summary.reached50 },
    { name: "Assistiu 75%", value: summary.reached75 },
    { name: "Concluiu", value: summary.completed },
  ];
  const retention = current.retention;

  const insights: { tone: string; title: string; detail: string }[] = [];
  if (summary.impressions < 10) insights.push({ tone: "info", title: "Colete mais tráfego", detail: "Ainda há poucos acessos para tirar conclusões seguras. Compartilhe o embed e volte após pelo menos 30 visualizações." });
  else if (summary.playRate < 35) insights.push({ tone: "warning", title: "A abertura está perdendo cliques", detail: "Teste uma thumbnail, headline e Smart Autoplay mais claros. Sua Play Rate está abaixo de 35%." });
  if (summary.plays >= 10 && pct(summary.reached25, summary.plays) < 55) insights.push({ tone: "warning", title: "Queda forte no começo", detail: "Encurte a introdução e antecipe a promessa principal antes dos primeiros 25% do vídeo." });
  if (summary.plays >= 10 && pct(summary.reached75, summary.plays) < 35) insights.push({ tone: "tip", title: "Há espaço para um Mini-Gancho", detail: "A retenção cai antes da oferta. Use um gancho de curiosidade entre 50% e 75% e compare o resultado." });
  if (summary.plays >= 10 && summary.completionRate >= 40) insights.push({ tone: "success", title: "Boa retenção final", detail: "A audiência que inicia permanece até o fim. Foque agora em CTA e taxa de conversão." });
  if (truncated) insights.push({ tone: "info", title: "Período muito grande para exibir por inteiro", detail: `Os números consideram os ${ANALYTICS.MAX_EVENTS_PER_ANALYSIS.toLocaleString("pt-BR")} eventos mais recentes deste intervalo. Reduza o período para ver o total exato.` });

  const live = liveError ? 0 : new Set((activeSessions ?? []).map((row) => row.session_id)).size;
  const liveCountryMap = new Map<string, number>();
  for (const session of activeSessions ?? []) liveCountryMap.set(session.country_code || "XX", (liveCountryMap.get(session.country_code || "XX") ?? 0) + 1);
  const activeCountries = [...liveCountryMap.entries()].map(([name, viewers]) => ({ name, impressions: viewers, plays: viewers, playRate: 100, completes: 0, completionRate: 0 })).sort((a, b) => b.impressions - a.impressions);

  const attentionMap = retention.slice(1).map((point, index, list) => ({ ...point, drop: index ? Math.max(0, Math.round((list[index - 1].rate - point.rate) * 10) / 10) : Math.max(0, 100 - point.rate) }));
  const previewSource = video.storage_provider === "r2"
    ? await signR2ReadUrl(video.object_path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null)
    : (await admin.storage.from("videos").createSignedUrl(video.object_path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS)).data?.signedUrl ?? null;
  const publicVideo = { title: video.title, duration_seconds: video.duration_seconds, source: previewSource, type: video.mime_type };

  return NextResponse.json({
    video: publicVideo,
    range,
    truncated,
    summary,
    comparison,
    timeline: buildTimeline(rows, new Date(since).getTime(), range),
    retention,
    attentionMap,
    funnel,
    fraud: {
      suspiciousSessions: current.suspiciousSessions,
      suspiciousRate: pct(current.suspiciousSessions, summary.impressions),
      cleanSessions: Math.max(0, summary.impressions - current.suspiciousSessions),
    },
    dimensions: {
      countries: current.dimension("country_code"),
      devices: current.dimension("device_type"),
      operatingSystems: current.dimension("os_name"),
      browsers: current.dimension("browser_name"),
      traffic: current.dimension("traffic_source"),
      campaigns: current.dimension("campaign_id"),
      creatives: current.dimension("creative_id"),
      ads: current.dimension("ad_id"),
    },
    insights,
    live,
    liveCountries: activeCountries,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
