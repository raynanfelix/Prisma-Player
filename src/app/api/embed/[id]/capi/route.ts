import { NextResponse } from "next/server";

import { domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie, verifyEmbedSessionToken } from "@/lib/security/embed-origin";
import { localRateLimit } from "@/lib/security/rate-limit-local";
import { readJsonBody } from "@/lib/api/request";
import { getAccountAccessCached } from "@/lib/access/access-cache";
import { findPublishedPlayerConfigCached, type PlayerConfigRow } from "@/lib/player/embed-config";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { pixelIntegrations } from "@/lib/player/pixels";
import { deliverServerMetaEvent } from "@/services/ads/server-events";
import { safeLog } from "@/lib/utils/log";
import { envInt } from "@/lib/config/env";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Rate limit por IP (30/min): um evento legitimo por marco de progresso -
// impression, play, 10/25/50/75/90, complete, cta_click - cabe com folga.
const EMBED_CAPI_RATE_LIMIT_MAX = envInt("EMBED_CAPI_RATE_LIMIT_MAX", 30);
const EMBED_CAPI_RATE_LIMIT_WINDOW_MS = envInt("EMBED_CAPI_RATE_LIMIT_WINDOW_MS", 60_000);

/** Nomes de evento Meta aceitos (os mesmos que o browser pixel dispara). */
const CAPI_EVENT_NAMES = new Set(["ViewContent", "PrismaVideoPlay", "PrismaVideoProgress", "PrismaVideoComplete", "Lead", "Purchase"]);

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

function databaseErrorDetails(error: unknown) {
  const shape = error as { code?: string; message?: string };
  return { code: shape?.code ?? "database_error", message: shape?.message ?? "unknown" };
}

/**
 * POST /api/embed/[id]/capi - CAPI server-side (C2).
 *
 * O metaCapiToken NUNCA sai do servidor: o embed filtrado não o entrega e o
 * postMessage não o carrega. O player chama este endpoint nos marcos de
 * evento (ViewContent etc.); o token da Meta é lido do CONFIG NO BANCO (nunca
 * do request) e o disparo sai daqui, no padrão de services/ads/server-events.
 *
 * Mesma autoridade da config dinâmica: originToken assinado + cookie de
 * render + domínio permitido + sessionToken do mint. Purchase continua pelo
 * caminho antigo (analytics side effects, com gate de consentimento).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  // Escopo público de embed: limitador por instância (P0-1).
  const limited = await localRateLimit(request, `embed-capi:${id}`, { max: EMBED_CAPI_RATE_LIMIT_MAX, windowMs: EMBED_CAPI_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  let playerConfig: PlayerConfigRow | null = null;
  try {
    // P1-4: lookup compartilhado com cache de 10s (dedup D3).
    playerConfig = await findPublishedPlayerConfigCached(id);
  } catch (error) {
    safeLog("embed_capi_player_lookup_failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503, headers: NO_STORE });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  const ownerAccess = await getAccountAccessCached(playerConfig.userId);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: NO_STORE });
  }

  const requestUrl = new URL(request.url);
  const originToken = requestUrl.searchParams.get("originToken");
  const abTestIdParam = requestUrl.searchParams.get("abTestId");
  const abTestId = abTestIdParam && uuid.test(abTestIdParam) ? abTestIdParam : "";
  const verifiedOrigin = verifyEmbedOriginToken(originToken, playerConfig.id)
    || verifyEmbedOriginToken(originToken, id)
    || (abTestId ? verifyEmbedOriginToken(originToken, abTestId, { abTestPath: abTestId }) : null);
  if (!verifiedOrigin) return NextResponse.json({ error: "invalid_origin_token" }, { status: 403, headers: NO_STORE });
  const host = verifiedOrigin.host;
  if (!host || originHeaderDisagrees(request.headers, host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403, headers: NO_STORE });
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403, headers: NO_STORE });
  const domains = Array.isArray(playerConfig.allowedDomains) ? playerConfig.allowedDomains.map((domain) => domain.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(host, domains)) return NextResponse.json({ error: "domain_not_allowed" }, { status: 403, headers: NO_STORE });

  const rawViewer = requestUrl.searchParams.get("viewerId") ?? "";
  const rawSession = requestUrl.searchParams.get("sessionId") ?? "";
  const sessionToken = requestUrl.searchParams.get("sessionToken");
  if (!isValidViewerId(rawViewer) || !uuid.test(rawSession)
    || !sessionToken
    || !verifyEmbedSessionToken(sessionToken, { playerId: id, viewerId: rawViewer, sessionId: rawSession, nonce: verifiedOrigin.nonce, host })) {
    return NextResponse.json({ error: "session_required" }, { status: 401, headers: NO_STORE });
  }

  const parsed = await readJsonBody<{ eventName?: unknown; eventId?: unknown; eventSourceUrl?: unknown }>(request, 2048);
  if (!parsed.ok) return parsed.response;
  const eventName = typeof parsed.body.eventName === "string" ? parsed.body.eventName : "";
  if (!CAPI_EVENT_NAMES.has(eventName)) return NextResponse.json({ error: "invalid_event_name" }, { status: 400, headers: NO_STORE });
  const eventId = typeof parsed.body.eventId === "string" ? parsed.body.eventId.trim().slice(0, 120) : "";
  const eventSourceUrl = typeof parsed.body.eventSourceUrl === "string" && /^https:\/\//i.test(parsed.body.eventSourceUrl) ? parsed.body.eventSourceUrl.slice(0, 1000) : "";

  // Token SEMPRE do banco: o config cru (não filtrado) tem metaCapiToken.
  const rawConfig = playerConfig.config && typeof playerConfig.config === "object" ? playerConfig.config as Record<string, unknown> : {};
  const metaIntegration = pixelIntegrations(rawConfig).find((integration) => integration.provider === "meta");
  if (!metaIntegration) return NextResponse.json({ delivered: false, reason: "not_configured" }, { headers: NO_STORE });

  const peerIp = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-real-ip") || "";
  const result = await deliverServerMetaEvent({
    integration: metaIntegration,
    eventName,
    eventId: eventId || undefined,
    eventSourceUrl: eventSourceUrl || undefined,
    clientUserAgent: request.headers.get("user-agent") ?? "",
    clientIp: peerIp,
  });
  return NextResponse.json({ delivered: result.delivered, ...(result.status !== undefined ? { status: result.status } : {}), ...(result.reason ? { reason: result.reason } : {}) }, { headers: { ...NO_STORE, "x-robots-tag": "noindex, nofollow, noarchive" } });
}
