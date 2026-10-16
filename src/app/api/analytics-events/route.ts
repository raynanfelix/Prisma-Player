import { after, NextResponse } from "next/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/api/request";
import { validateOrigin } from "@/lib/security/csrf";
import { originHeaderDisagrees, verifyEmbedEventTokenContext, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { ANALYTICS } from "@/lib/constants";
import { normalizeAnalyticsBatch, type NormalizedAnalyticsEvent } from "@/lib/player/analytics-batch";
import { ingestAnalyticsEvents, type AnalyticsIngestCommand, type AnalyticsIngestOutcome } from "@/lib/analytics/ingest";

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
  const tokenFailure = verifyEventToken(request, { videoId, sessionId }, parsed.body);
  if (tokenFailure) return tokenFailure;
  const limited = await rateLimit(request, `analytics:${videoId}:${sessionId}`, { max: ANALYTICS.RATE_LIMIT_MAX_REQUESTS, windowMs: ANALYTICS.RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;
  const outcome = await ingestAnalyticsEvents(ingestCommandFrom(request, { firstPartyOrigin, videoId, sessionId, events, body: parsed.body }));
  return respondToIngest(request, outcome);
}

function verifyEventToken(request: Request, tokenContext: { videoId: string; sessionId: string }, body: Record<string, unknown> | undefined): NextResponse | null {
  // RM-03: o eventToken é amarrado à sessão do viewer e ao host do embed. Um
  // evento cujo sessionId do corpo não bata com o token é rejeitado.
  const eventToken = typeof body?.eventToken === "string" ? body.eventToken : null;
  const verifiedEvent = verifyEmbedEventTokenContext(eventToken, tokenContext);
  if (!verifiedEvent) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Prova de render: o nonce do token precisa existir e estar no cookie `pp_embed`
  // que o proxy setou na resposta da página. Token sem render não passa.
  if (!verifiedEvent.nonce || !verifyEmbedRenderCookie(request.headers, verifiedEvent.nonce)) return NextResponse.json({ error: "invalid_event_token" }, { status: 403 });
  // Origin presente e não-self precisa concordar com o host reivindicado pelo token.
  const requestSelfOrigin = new URL(request.url).origin;
  if (verifiedEvent.host && originHeaderDisagrees(request.headers, verifiedEvent.host, requestSelfOrigin)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  return null;
}

function ingestCommandFrom(request: Request, known: { firstPartyOrigin: boolean; videoId: string; sessionId: string; events: NormalizedAnalyticsEvent[]; body: Record<string, unknown> | undefined }): AnalyticsIngestCommand {
  return {
    videoId: known.videoId,
    sessionId: known.sessionId,
    events: known.events,
    firstPartyOrigin: known.firstPartyOrigin,
    originHeader: request.headers.get("origin") ?? "",
    userAgent: request.headers.get("user-agent") ?? "",
    countryHeader: request.headers.get("x-vercel-ip-country"),
    peerIpCandidate: request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip"),
    pageUrlValue: known.body?.pageUrl ?? known.body?.referrer,
    viewerIdValue: known.body?.viewerId,
  };
}

function respondToIngest(request: Request, outcome: AnalyticsIngestOutcome): NextResponse {
  switch (outcome.kind) {
    case "video_not_found": return NextResponse.json({ error: "video_not_found" }, { status: 404 });
    case "player_not_published": return NextResponse.json({ error: "player_not_published" }, { status: 409 });
    case "invalid_origin": return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    case "live_session_write_failed": return NextResponse.json({ error: "live_session_write_failed" }, { status: 500 });
    case "event_write_failed": return NextResponse.json({ error: "event_write_failed" }, { status: 500 });
    case "no_content": return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
    case "ingested": break;
  }
  after(async () => { await outcome.runSideEffects(); });
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, outcome.quotaHeaders) });
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
