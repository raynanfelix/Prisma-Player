import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie, verifyEmbedSessionToken } from "@/lib/security/embed-origin";
import { isRealBrowserUserAgent } from "@/lib/security/browser-ua";
import { rateLimit } from "@/lib/security/rate-limit";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { getAccountAccessCached } from "@/lib/access/access-cache";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { embedTrafficViolation } from "@/lib/player/embed-traffic";
import { envInt } from "@/lib/config/env";
import { safeLog } from "@/lib/utils/log";
import { SECURITY, VIDEO } from "@/lib/constants";

const { playerConfigs, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBED_STREAM_RATE_LIMIT_MAX = envInt("EMBED_STREAM_RATE_LIMIT_MAX", 300);
const EMBED_STREAM_RATE_LIMIT_WINDOW_MS = envInt("EMBED_STREAM_RATE_LIMIT_WINDOW_MS", 60_000);

type PlayerConfigRow = {
  id: string;
  videoId: string;
  userId: string;
  config: unknown;
  allowedDomains: string[];
  published: boolean;
};

const PLAYER_CONFIG_FIELDS = {
  id: playerConfigs.id,
  videoId: playerConfigs.videoId,
  userId: playerConfigs.userId,
  config: playerConfigs.config,
  allowedDomains: playerConfigs.allowedDomains,
  published: playerConfigs.published,
};

function databaseErrorDetails(error: unknown) {
  const shape = error as { code?: string; message?: string };
  return { code: shape?.code ?? "database_error", message: shape?.message ?? "unknown" };
}

async function findPublishedPlayerConfig(id: string): Promise<PlayerConfigRow | null> {
  const [byPlayerId, byVideoId] = await Promise.all([
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.id, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.videoId, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return byPlayerId ?? byVideoId;
}

/**
 * GET /api/embed/[id]/stream - porta da mídia (C1).
 *
 * O corpo do embed não devolve mais URLs R2: devolve este caminho. A rota
 * revalida TUDO por request: sessão assinada do servidor, paywall do dono,
 * regras de tráfego (geo/dispositivo/idioma/VPN), UA de navegador e o
 * pipeline de origem (token assinado + cookie de render + domínio
 * permitido). Só então responde 302 para uma URL R2 assinada NA HORA com
 * TTL curto; a URL assinada nunca aparece em corpo de resposta nenhum.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  const limited = await rateLimit(request, `embed-stream:${id}`, { max: EMBED_STREAM_RATE_LIMIT_MAX, windowMs: EMBED_STREAM_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  // Anti-script na porta da mídia: cliente HTTP (curl/wget/python) não passa.
  // O <video> do iframe sempre envia o UA do navegador.
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!isRealBrowserUserAgent(userAgent)) {
    safeLog("embed_stream_blocked_ua", { playerId: id, userAgent: userAgent.slice(0, 120) });
    return NextResponse.json({ error: "browser_required" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  }

  let playerConfig: PlayerConfigRow | null = null;
  try {
    playerConfig = await findPublishedPlayerConfig(id);
  } catch (error) {
    console.error("embed stream player lookup failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: { "cache-control": "private, no-store" } });

  // Paywall na porta da mídia: assinatura cancelada derruba o stream, não
  // apenas a config (o estado do dono é checado de novo aqui).
  const ownerAccess = await getAccountAccessCached(playerConfig.userId);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: { "cache-control": "private, no-store" } });
  }

  // Mesmo pipeline de origem da config dinâmica: token assinado amarrado a
  // este player (ou ao teste A/B), header coerente, prova de render e
  // domínio permitido. O stream não é uma porta mais fraca.
  const requestUrl = new URL(request.url);
  const originToken = requestUrl.searchParams.get("originToken");
  const abTestIdParam = requestUrl.searchParams.get("abTestId");
  const abTestId = abTestIdParam && uuid.test(abTestIdParam) ? abTestIdParam : "";
  const verifiedOrigin = verifyEmbedOriginToken(originToken, playerConfig.id)
    || verifyEmbedOriginToken(originToken, id)
    || (abTestId ? verifyEmbedOriginToken(originToken, abTestId, { abTestPath: abTestId }) : null);
  if (!verifiedOrigin) return NextResponse.json({ error: "invalid_origin_token" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  const host = verifiedOrigin.host;
  if (!host || originHeaderDisagrees(request.headers, host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  const domains = Array.isArray(playerConfig.allowedDomains) ? playerConfig.allowedDomains.map((domain) => domain.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(host, domains)) return NextResponse.json({ error: "domain_not_allowed" }, { status: 403, headers: { "cache-control": "private, no-store" } });

  // Sessão assinada (a mesma do DRM mintada em POST /session): amarrada a
  // player, viewer, sessão, nonce do render e host. Requisição sem sessão
  // válida não vê mídia (401).
  const rawViewer = requestUrl.searchParams.get("viewerId") ?? "";
  const rawSession = requestUrl.searchParams.get("sessionId") ?? "";
  const sessionToken = requestUrl.searchParams.get("sessionToken");
  if (!isValidViewerId(rawViewer) || !uuid.test(rawSession)
    || !sessionToken
    || !verifyEmbedSessionToken(sessionToken, { playerId: id, viewerId: rawViewer, sessionId: rawSession, nonce: verifiedOrigin.nonce, host })) {
    return NextResponse.json({ error: "session_required" }, { status: 401, headers: { "cache-control": "private, no-store" } });
  }

  // Geo e paywall na mesma porta da mídia: as regras de tráfego valem aqui
  // de novo, lidas do config do banco (nunca da cópia pública).
  const rawConfig = playerConfig.config && typeof playerConfig.config === "object" ? playerConfig.config as Record<string, unknown> : {};
  const trafficViolation = await embedTrafficViolation(rawConfig, request.headers);
  if (trafficViolation) return NextResponse.json({ error: trafficViolation }, { status: 403, headers: { "cache-control": "private, no-store" } });

  let video: { objectPath: string; mimeType: string; status: string } | null = null;
  try {
    [video] = await db
      .select({ objectPath: videos.objectPath, mimeType: videos.mimeType, status: videos.status })
      .from(videos)
      .where(and(eq(videos.id, playerConfig.videoId), eq(videos.status, "ready")))
      .limit(1);
  } catch {
    video = null;
  }
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404, headers: { "cache-control": "private, no-store" } });

  // MP4/WebM progressivo hoje (docs/videojs-integration.md): não existe
  // pipeline de transcode/segmentos no produto. HLS (m3u8) é pendência
  // documentada: o proxy serve só vídeo progressivo.
  if (!/^video\//i.test(video.mimeType)) {
    return NextResponse.json({ error: "unsupported_format" }, { status: 415, headers: { "cache-control": "private, no-store" } });
  }

  const source = await signR2ReadUrl(video.objectPath, VIDEO.R2_STREAM_URL_EXPIRY_SECONDS).catch(() => null);
  if (!source) return NextResponse.json({ error: "source_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });

  // 302 sem corpo: a URL assinada existe só no header Location e com TTL de
  // 120s. O refresh do cookie de render (mesmo nonce da sessão verificada)
  // mantém VSLs longas tocando: cada range request do <video> revalida a
  // sessão e renova a prova de render por mais 10min.
  const response = new NextResponse(null, {
    status: 302,
    headers: {
      location: source,
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(SECURITY.EMBED_RENDER_COOKIE, verifiedOrigin.nonce, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: SECURITY.EMBED_RENDER_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
