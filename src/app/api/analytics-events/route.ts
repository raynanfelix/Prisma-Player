import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateOrigin } from "@/lib/security/csrf";
import { domainAllowed, normalizeHost, originHeaderDisagrees, verifyEmbedEventTokenContext, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { deliverWebhook } from "@/lib/webhooks/delivery";
import { readJsonBody } from "@/lib/api/request";
import { getAccountPlan, getMonthPlaysUsed } from "@/lib/access/service";
import { ANALYTICS } from "@/lib/constants";
import { pixelIntegrations } from "@/lib/player/pixels";
import { deliverServerPurchase } from "@/services/ads/server-events";
import { normalizeAnalyticsBatch, type NormalizedAnalyticsEvent } from "@/lib/player/analytics-batch";
import { isValidViewerId } from "@/lib/player/viewer-id";

function clientContext(request: Request) {
  const ua = request.headers.get("user-agent") ?? "";
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobi|iphone|android/i.test(ua) ? "mobile" : ua ? "desktop" : "other";
  const os = /windows/i.test(ua) ? "Windows" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /mac os|macintosh/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const browser = /edg\//i.test(ua) ? "Edge" : /firefox\//i.test(ua) ? "Firefox" : /chrome\//i.test(ua) ? "Chrome" : /safari\//i.test(ua) ? "Safari" : "Other";
  return { device, os, browser, ua };
}

function pageContext(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return { pageUrl: null, params: new URLSearchParams(), source: "Direto" };
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    url.hash = "";
    return { pageUrl: url.toString().slice(0, 1000), params: url.searchParams, source: url.hostname.replace(/^www\./, "").slice(0, 120) || "Direto" };
  } catch { return { pageUrl: null, params: new URLSearchParams(), source: "Direto" }; }
}

function first(params: URLSearchParams, names: string[]) {
  for (const name of names) { const value = params.get(name)?.trim(); if (value) return value.slice(0, 160); }
  return null;
}

function riskReasonsFor(ua: string, event: NormalizedAnalyticsEvent): string[] {
  const reasons: string[] = [];
  if (!ua) reasons.push("missing_user_agent");
  if (/bot|crawler|spider|headless|curl|wget|python|scrapy|phantom/i.test(ua)) reasons.push("automation_user_agent");
  if (event.eventType === "complete" && event.watchedSeconds < 3) reasons.push("impossible_completion");
  return reasons;
}

/**
 * RM-03: nada de refletir o Origin arbitrariamente no `access-control-allow-origin`.
 * O único fluxo legítimo é o iframe do embed (mesma origem) postando analytics;
 * a header de CORS só é devolvida quando a origem é uma origem própria da
 * plataforma. Credenciais continuam de fora (nenhum `Access-Control-Allow-Credentials`).
 */
function corsHeaders(request: Request, extra: Record<string, string> = {}) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && validateOrigin(request) ? origin : null;
  return { "cache-control": "no-store", ...extra, ...(allowedOrigin ? { "access-control-allow-origin": allowedOrigin, vary: "Origin" } : {}) };
}

/**
 * IP de peer da plataforma para o CAPI. `x-forwarded-for` é controlável pelo
 * cliente (RM-03 item 2): não o repassamos para o payload do Meta/TikTok.
 * Preferimos os headers que a própria plataforma sobrescreve (Vercel/real-ip) e
 * omitimos o campo quando não há um valor confiável.
 */
function platformPeerIp(request: Request): string {
  const candidate = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip");
  const first = candidate?.split(",")[0]?.trim();
  return first && first !== "unknown" && first !== "::1" ? first : "";
}

/**
 * Apenas o evento realmente persistido dispara efeitos laterais. Com lotes,
 * `.select("id")` do upsert devolve as linhas novas; comparamos os índices com
 * os eventos da requisição para nunca reenviar um webhook duplicado.
 */
function persistedEventKeys(writtenRows: Array<{ id?: unknown; event_type?: string; progress_percent?: number }> | null) {
  return new Set((writtenRows ?? []).map((row) => `${row.event_type}:${row.progress_percent}`));
}

export async function POST(request: Request) {
  const firstPartyOrigin = validateOrigin(request);
  // Mede os bytes reais: só o header `content-length` deixava passar qualquer
  // cliente que usasse `Transfer-Encoding: chunked`.
  const parsed = await readJsonBody<Record<string, unknown>>(request, ANALYTICS.MAX_EVENT_PAYLOAD_BYTES);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeAnalyticsBatch(parsed.body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.code }, { status: normalized.status });
  const { videoId, sessionId, events } = normalized.batch;
  // Conversão é o único fluxo que chega sem origem de embed (mensagem do pai);
  // manter a regra antiga: sem first-party, só conversões seguem.
  if (!firstPartyOrigin && events.some((event) => event.eventType !== "conversion")) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  // RM-03: o eventToken é amarrado à sessão do viewer e ao host do embed. Um
  // evento cujo sessionId do corpo não bata com o token é rejeitado.
  const eventToken = typeof parsed.body?.eventToken === "string" ? parsed.body.eventToken : null;
  const verifiedEvent = verifyEmbedEventTokenContext(eventToken, { videoId, sessionId });
  if (!verifiedEvent) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Prova de render: o nonce do token precisa existir e estar no cookie `pp_embed`
  // que o proxy setou na resposta da página. Token sem render não passa.
  if (!verifiedEvent.nonce || !verifyEmbedRenderCookie(request.headers, verifiedEvent.nonce)) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Origin presente e não-self precisa concordar com o host reivindicado pelo token.
  const requestSelfOrigin = new URL(request.url).origin;
  if (verifiedEvent.host && originHeaderDisagrees(request.headers, verifiedEvent.host, requestSelfOrigin)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  const limited = await rateLimit(request, `analytics:${videoId}:${sessionId}`, { max: ANALYTICS.RATE_LIMIT_MAX_REQUESTS, windowMs: ANALYTICS.RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  const supabase = createAdminClient();
  const [{ data: video }, { data: player }] = await Promise.all([
    supabase.from("videos").select("id,user_id,status,title").eq("id", videoId).maybeSingle(),
    supabase.from("player_configs").select("id,allowed_domains,config").eq("video_id", videoId).eq("published", true).maybeSingle(),
  ]);
  if (!video || video.status !== "ready") return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  if (!player) return NextResponse.json({ error: "player_not_published" }, { status: 409 });
  const requestOrigin = request.headers.get("origin") ?? "";
  if (!firstPartyOrigin) {
    const originHost = normalizeHost(requestOrigin);
    const allowedDomains = Array.isArray(player.allowed_domains) ? player.allowed_domains.filter((item): item is string => typeof item === "string") : [];
    if (!originHost || !domainAllowed(originHost, allowedDomains)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  const context = clientContext(request);
  const country = (request.headers.get("x-vercel-ip-country") ?? "XX").toUpperCase().slice(0, 2);
  const page = pageContext(parsed.body?.pageUrl ?? parsed.body?.referrer);
  // Viewer ID persistente entre visitas. Nunca persistimos um valor invalido:
  // sem viewerId valido o campo fica de fora (undefined => default/null na tabela).
  const rawViewerId = typeof parsed.body?.viewerId === "string" ? parsed.body.viewerId : null;
  const viewerId = rawViewerId && rawViewerId.length <= 64 && isValidViewerId(rawViewerId) ? rawViewerId : undefined;

  const lastEvent = events[events.length - 1];
  const { error: liveError } = await supabase.from("video_live_sessions").upsert({ video_id: video.id, user_id: video.user_id, session_id: sessionId, country_code: country.length === 2 ? country : "XX", device_type: context.device, progress_percent: lastEvent.progressPercent, last_seen_at: new Date().toISOString(), ...(viewerId ? { viewer_id: viewerId } : {}) }, { onConflict: "video_id,session_id" });
  if (liveError) return NextResponse.json({ error: "live_session_write_failed" }, { status: 500 });

  const actionable = events.filter((event) => event.eventType !== "heartbeat");
  if (actionable.length === 0) return new NextResponse(null, { status: 204, headers: corsHeaders(request) });

  // Medição de plays do mês para observabilidade de overage. included_plays é
  // cota com cobrança por excedente, não bloqueio — eventos legítimos nunca são
  // negados aqui. O consumo real é exposto em /api/account/overview.
  let quotaHeaders: Record<string, string> = {};
  try {
    const [plan, monthPlays] = await Promise.all([getAccountPlan(video.user_id), getMonthPlaysUsed(video.user_id)]);
    const limit = plan.quotas.includedPlays;
    if (limit !== null && limit !== undefined) {
      quotaHeaders = {
        "x-plays-used": String(monthPlays),
        "x-plays-limit": String(limit),
        ...(monthPlays > limit ? { "x-plays-overage": String(monthPlays - limit) } : {}),
      };
    }
  } catch {
    quotaHeaders = {};
  }

  const persisting = actionable.map((event) => {
    const riskReasons = riskReasonsFor(context.ua, event);
    const riskScore = Math.min(100, riskReasons.reduce((score, reason) => score + (reason === "missing_user_agent" ? 25 : 50), 0));
    return {
      user_id: video.user_id, video_id: video.id, session_id: sessionId, event_type: event.eventType, progress_percent: event.progressPercent, watched_seconds: event.watchedSeconds,
      country_code: country.length === 2 ? country : "XX", device_type: context.device, os_name: context.os, browser_name: context.browser, traffic_source: page.source,
      page_url: page.pageUrl, campaign_id: first(page.params, ["campaign_id", "fb_campaign_id", "utm_campaign"]), creative_id: first(page.params, ["creative_id", "adset_id", "utm_content"]),
      ad_id: first(page.params, ["ad_id", "fb_ad_id"]), utm_source: first(page.params, ["utm_source"]), utm_medium: first(page.params, ["utm_medium"]), utm_campaign: first(page.params, ["utm_campaign"]), risk_score: riskScore, risk_reasons: riskReasons,
      transaction_id: event.transactionId, conversion_value: event.value, currency: event.currency, advertising_consent: event.advertisingConsent,
      ...(viewerId ? { viewer_id: viewerId } : {}),
    };
  });

  const { data: writtenRows, error } = await supabase.from("video_events")
    .upsert(persisting, { onConflict: "video_id,session_id,event_type,progress_percent", ignoreDuplicates: true })
    .select("id,event_type,progress_percent");
  if (error && error.code !== "23505") return NextResponse.json({ error: "event_write_failed" }, { status: 500 });

  const persistedKeys = persistedEventKeys(writtenRows);
  const playerConfig = (player.config && typeof player.config === "object" ? player.config : {}) as Record<string, unknown>;
  const videoInfo = { id: video.id, user_id: video.user_id, title: video.title };
  // RM-03 item 2: IP confiável da plataforma, nunca o `x-forwarded-for` do cliente.
  const peerIp = platformPeerIp(request);
  after(async () => {
    const supabaseInner = createAdminClient();
    for (const event of actionable) {
      if (!persistedKeys.has(`${event.eventType}:${event.progressPercent}`)) continue;
      // RM-03 item 2: requisição não-first-party (só pode ser conversões) não
      // dispara efeitos laterais pagos (webhook + CAPI). O atacante que forja
      // Origin batendo com o host do token ainda falha aqui.
      if (!firstPartyOrigin) continue;
      const [{ data: controls }, plan] = await Promise.all([
        supabaseInner.from("intelligence_controls").select("outgoing_webhooks_enabled,webhook_url,webhook_events").eq("user_id", videoInfo.user_id).maybeSingle(),
        getAccountPlan(videoInfo.user_id),
      ]);
      if (event.eventType === "conversion" && event.advertisingConsent) {
        await deliverServerPurchase({
          integrations: pixelIntegrations(playerConfig),
          eventId: event.transactionId ?? "",
          eventName: "Purchase",
          eventSourceUrl: page.pageUrl,
          value: event.value ?? 0,
          currency: event.currency ?? "",
          clientUserAgent: context.ua,
          clientIp: peerIp || undefined,
        }).catch(() => undefined);
      }
      // Webhook de saída é recurso de plano superior: a checagem existia apenas na
      // tela, então quem tivesse ativado a chave uma vez continuava recebendo.
      if (!plan.capabilities.outgoing_webhooks) continue;
      if (controls?.outgoing_webhooks_enabled && controls.webhook_url && Array.isArray(controls.webhook_events) && controls.webhook_events.includes(event.eventType)) {
        await deliverWebhook(controls.webhook_url, { id: randomUUID(), event: `vsl.${event.eventType}`, timestamp: new Date().toISOString(), data: { video_id: videoInfo.id, video_title: videoInfo.title, session_id: sessionId, progress_percent: event.progressPercent, watched_seconds: event.watchedSeconds, country_code: country, device_type: context.device } }).catch(() => undefined);
      }
    }
  });

  return new NextResponse(null, { status: 204, headers: corsHeaders(request, quotaHeaders) });
}

export async function OPTIONS(request: Request) {
  // RM-03 item 3: sem reflexão arbitrária de Origin. Só responde CORS para
  // origens próprias da plataforma; qualquer outra origem não recebe ACAO.
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && validateOrigin(request) ? origin : null;
  return new NextResponse(null, { status: 204, headers: {
    ...(allowedOrigin ? { "access-control-allow-origin": allowedOrigin, vary: "Origin" } : {}),
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
  } });
}