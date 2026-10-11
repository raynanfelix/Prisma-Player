import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import { ANALYTICS } from "@/lib/constants";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const segments = new Set(["all", "buyers", "completers", "engagers_75", "cta_clickers"]);
type Session = { country: string; device: string; os: string; browser: string; source: string; campaign: string; maxProgress: number; conversion: boolean; complete: boolean; cta: boolean };

function distribution(rows: Session[], key: "country" | "device" | "os" | "browser" | "source" | "campaign") {
  const counts = new Map<string, number>();
  for (const row of rows) { const value = row[key] || "Não informado"; counts.set(value, (counts.get(value) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => `${name}: ${count} (${(count / Math.max(rows.length, 1) * 100).toFixed(1)}%)`).join("\n");
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "read", paid: true });
  if (!gate.ok) return gate.response;
  const ownerId = gate.account.accountOwnerId;
  // Exportar público exige `audience_sync`, um recurso de plano superior.
  if (!gate.plan.capabilities.audience_sync) {
    return NextResponse.json({ error: "plan_upgrade_required", capability: "audience_sync", message: "A exportação de público faz parte de um plano superior." }, { status: 402 });
  }
  const limited = await rateLimit(request, `audience-export:${ownerId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ videoId?: string; segment?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const videoId = parsed.body?.videoId ?? "", segment = parsed.body?.segment ?? "engagers_75";
  if (!uuid.test(videoId) || !segments.has(segment)) return NextResponse.json({ error: "invalid_export_request" }, { status: 400 });
  const admin = createAdminClient();
  const { data: video } = await admin.from("videos").select("id,title").eq("id", videoId).eq("user_id", ownerId).eq("status", "ready").maybeSingle();
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  const { data: events, error } = await admin.from("video_events").select("session_id,event_type,progress_percent,country_code,device_type,os_name,browser_name,traffic_source,campaign_id,utm_campaign,risk_score").eq("video_id", videoId).eq("user_id", ownerId).lt("risk_score", 70).order("created_at", { ascending: false }).limit(ANALYTICS.MAX_EVENTS_PER_ANALYSIS);
  if (error) return NextResponse.json({ error: "audience_unavailable" }, { status: 503 });
  const map = new Map<string, Session>();
  for (const event of events ?? []) {
    const row = map.get(event.session_id) ?? { country: event.country_code ?? "XX", device: event.device_type ?? "other", os: event.os_name ?? "Other", browser: event.browser_name ?? "Other", source: event.traffic_source ?? "Direto", campaign: event.utm_campaign ?? event.campaign_id ?? "Não informado", maxProgress: 0, conversion: false, complete: false, cta: false };
    row.maxProgress = Math.max(row.maxProgress, event.progress_percent ?? 0); row.conversion ||= event.event_type === "conversion"; row.complete ||= event.event_type === "complete"; row.cta ||= event.event_type === "cta_click"; map.set(event.session_id, row);
  }
  const all = [...map.values()];
  const selected = all.filter((row) => segment === "all" || (segment === "buyers" && row.conversion) || (segment === "completers" && row.complete) || (segment === "engagers_75" && row.maxProgress >= 75) || (segment === "cta_clickers" && row.cta));
  if (!selected.length) return NextResponse.json({ error: "segment_without_data", message: "Esta VSL ainda não possui pessoas no segmento escolhido." }, { status: 422 });
  const buyers = selected.filter((row) => row.conversion).length;
  const content = `PRISMA PLAYER — PERFIL REAL DE PÚBLICO\nVSL: ${video.title}\nSegmento: ${segment}\nGerado em: ${new Date().toLocaleString("pt-BR")}\n\nAMOSTRA E SINAIS\nSessões no segmento: ${selected.length}\nCompradores/conversões identificadas: ${buyers}\nTaxa de conversão do segmento: ${(buyers / selected.length * 100).toFixed(1)}%\n\nPAÍSES\n${distribution(selected, "country")}\n\nDISPOSITIVOS\n${distribution(selected, "device")}\n\nSISTEMAS OPERACIONAIS\n${distribution(selected, "os")}\n\nNAVEGADORES\n${distribution(selected, "browser")}\n\nORIGENS DE TRÁFEGO\n${distribution(selected, "source")}\n\nCAMPANHAS\n${distribution(selected, "campaign")}\n\nCOMO USAR EM ADS\n1. Priorize os países, dispositivos e origens com maior presença entre compradores e espectadores qualificados.\n2. Cruze este perfil com os relatórios do seu checkout antes de alterar orçamento.\n3. Use UTMs consistentes para separar campanha, conjunto e criativo.\n4. Não trate amostra pequena como conclusão estatística.\n\nLIMITAÇÕES IMPORTANTES\nIdade e gênero não são coletados pelo player e não foram inferidos ou inventados. Esses atributos exigem dados consentidos do checkout, CRM ou relatórios agregados da plataforma de anúncios. O arquivo não contém e-mail, telefone, IP nem identificadores pessoais; ele serve como orientação real de segmentação, não como lista de Customer Match.\n`;
  const filename = video.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vsl";
  return new NextResponse(`\uFEFF${content}`, { headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="audiencia-${filename}.txt"`, "cache-control": "no-store" } });
}
