import { NextResponse } from "next/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { createBoundEmbedEventTokenSafely, domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie, verifyEmbedSessionToken } from "@/lib/security/embed-origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { getAccountAccessCached } from "@/lib/access/access-cache";
import { ownedAssetPaths } from "@/lib/player/assets";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { clientIpFromHeaders } from "@/lib/security/vpn";
import { embedTrafficViolation } from "@/lib/player/embed-traffic";
import { filterConfigForEmbed } from "@/lib/player/config-keys";
import { envInt } from "@/lib/config/env";
import { VIDEO } from "@/lib/constants";

const { playerConfigs, videoLiveSessions, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBED_CONFIG_RATE_LIMIT_MAX = envInt("EMBED_CONFIG_RATE_LIMIT_MAX", 300);
const EMBED_CONFIG_RATE_LIMIT_WINDOW_MS = envInt("EMBED_CONFIG_RATE_LIMIT_WINDOW_MS", 60_000);

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

/** Player publicado por id de config; cai para o id de vídeo (mesma busca dupla do SDK antigo). */
async function findPublishedPlayerConfig(id: string): Promise<PlayerConfigRow | null> {
  const [byPlayerId, byVideoId] = await Promise.all([
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.id, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
    db.select(PLAYER_CONFIG_FIELDS).from(playerConfigs).where(and(eq(playerConfigs.videoId, id), eq(playerConfigs.published, true))).limit(1).then((rows) => rows[0] ?? null),
  ]);
  return byPlayerId ?? byVideoId;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  const limited = await rateLimit(request, `embed-config:${id}`, { max: EMBED_CONFIG_RATE_LIMIT_MAX, windowMs: EMBED_CONFIG_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  let playerConfig: PlayerConfigRow | null = null;
  try {
    playerConfig = await findPublishedPlayerConfig(id);
  } catch (error) {
    console.error("embed player lookup failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503 });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  // O embed é a entrega do produto. Sem esta verificação, cancelar a assinatura
  // não tirava nada do ar: a VSL continuava hospedada e servida indefinidamente.
  // Acesso do dono e linha do vídeo saem em PARALELO: antes eram dois awaits
  // seriais na cadeia (acesso → checagens → vídeo), cada um pagando um
  // roundtrip ao Neon. Precedência externa preservada: o 402 do acesso vence
  // antes das checagens de origem e do 404 do vídeo.
  const [ownerAccess, video] = await Promise.all([
    getAccountAccessCached(playerConfig.userId),
    db
      .select({ id: videos.id, title: videos.title, objectPath: videos.objectPath, mimeType: videos.mimeType, userId: videos.userId })
      .from(videos)
      .where(and(eq(videos.id, playerConfig.videoId), eq(videos.status, "ready")))
      .limit(1)
      .then((rows) => rows[0] ?? null)
      .catch(() => null),
  ]);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: { "cache-control": "private, no-store" } });
  }

  // RM-02: o header `Referer`/`Origin` nunca é autoridade aqui. Sem um token de
  // origem válido e não expirado, a requisição é rejeitada - quem não renderizou
  // a página não consegue forjar `Referer` e exfiltrar a URL assinada.
  const requestUrl = new URL(request.url);
  const originToken = requestUrl.searchParams.get("originToken");
  // RM-04: no embed A/B o token chega mintado no escopo do TESTE (playerId =
  // testId + claim `abTest`). O braço de verificação do teste usa o id de teste
  // validado como UUID no query; um token de teste não vale para consumo direto.
  const abTestIdParam = requestUrl.searchParams.get("abTestId");
  const abTestId = abTestIdParam && uuid.test(abTestIdParam) ? abTestIdParam : "";
  const verifiedOrigin = verifyEmbedOriginToken(originToken, playerConfig.id)
    || verifyEmbedOriginToken(originToken, id)
    || (abTestId ? verifyEmbedOriginToken(originToken, abTestId, { abTestPath: abTestId }) : null);
  if (!verifiedOrigin) return NextResponse.json({ error: "invalid_origin_token" }, { status: 403 });
  const host = verifiedOrigin.host;
  // O host do token é o ÚNICO host usado para domainAllowed.
  if (!host || originHeaderDisagrees(request.headers, host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403 });
  // Prova de render: o nonce assinado no token precisa existir e estar no cookie
  // `pp_embed` que o proxy setou na resposta da página. Token sem nonce (não
  // amarrado a nenhum render) ou com nonce sem o cookie é rejeitado.
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403 });
  const domains = Array.isArray(playerConfig.allowedDomains) ? playerConfig.allowedDomains.map((domain) => domain.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(host, domains)) return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });

  // Sessão assinada obrigatória (C1 + toggle DRM): a config só sai para o
  // player real (viewerId + sessionId no query) autenticado por um
  // sessionToken HMAC mintado pelo servidor (POST /session), amarrado a
  // ESTE player + viewer + sessão + nonce do render + host assinado. Com a
  // porta da mídia (stream) exigindo o mesmo token, a sessão deixou de ser
  // opcional do toggle drmSignedTokenEnabled: sem ela não existe streamUrl.
  const rawViewer = requestUrl.searchParams.get("viewerId") ?? "";
  const rawSession = requestUrl.searchParams.get("sessionId") ?? "";
  if (!isValidViewerId(rawViewer) || !uuid.test(rawSession)) {
    return NextResponse.json({ error: "session_required" }, { status: 403 });
  }
  const sessionToken = requestUrl.searchParams.get("sessionToken");
  if (!sessionToken || !verifyEmbedSessionToken(sessionToken, { playerId: id, viewerId: rawViewer, sessionId: rawSession, nonce: verifiedOrigin.nonce, host })) {
    return NextResponse.json({ error: "session_required" }, { status: 403 });
  }

  const rawConfig = playerConfig.config && typeof playerConfig.config === "object" ? playerConfig.config as Record<string, unknown> : {};

  // C2: o corpo leva SÓ as chaves públicas (mesmo modelo do manifest, com o
  // conjunto completo que o EmbedPlayer consome). metaCapiToken e as chaves
  // server-only (tráfego/DRM/restrições) ficam no banco; as regras de tráfego
  // abaixo leem o rawConfig, nunca a cópia filtrada.
  const trafficViolation = await embedTrafficViolation(rawConfig, request.headers);
  if (trafficViolation) return NextResponse.json({ error: trafficViolation }, { status: 403 });

  // Fluxos simultâneos por navegador: conta sessões vivas (heartbeat ≤75s)
  // deste viewer neste vídeo. Sem migration: usa video_live_sessions (a mesma
  // linha que o analytics atualiza; o cron poda o resto). Corrida de abas
  // abertas no mesmo segundo pode passar - documentado, não bloqueante.
  if (Boolean(rawConfig.limitConcurrentStreams)) {
    const maxStreams = Math.max(1, Math.min(50, Math.floor(Number(rawConfig.maxConcurrentStreams) || 1)));
    const viewer = rawViewer;
    const session = rawSession;
    const countryHeader = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "").toLowerCase();
    const countryCode = countryHeader.length === 2 ? countryHeader.toUpperCase() : "XX";
    try {
      await db
        .insert(videoLiveSessions)
        .values({ videoId: playerConfig.videoId, userId: playerConfig.userId, sessionId: session, viewerId: viewer, countryCode, lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: [videoLiveSessions.videoId, videoLiveSessions.sessionId],
          set: { viewerId: viewer, countryCode, lastSeenAt: new Date() },
        });
    } catch (error) {
      console.error("live session upsert failed", error instanceof Error ? error.message : String(error));
    }
    const freshSince = new Date(Date.now() - 75_000);
    const activeSessions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(videoLiveSessions)
      .where(and(
        eq(videoLiveSessions.videoId, playerConfig.videoId),
        eq(videoLiveSessions.viewerId, viewer),
        ne(videoLiveSessions.sessionId, session),
        gt(videoLiveSessions.lastSeenAt, freshSince),
      ))
      .then((rows) => rows[0]?.count ?? 0)
      .catch(() => 0);
    if (activeSessions >= maxStreams) return NextResponse.json({ error: "stream_limit" }, { status: 409 });
  }

  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  // C1 (stream proxy): a URL do vídeo NÃO sai mais no corpo. O player recebe
  // a porta da mídia relativa, que valida sessão/paywall/geo/UA e responde
  // 302 para uma URL R2 assinada na hora com TTL curto.
  const streamParams = new URLSearchParams({
    originToken: originToken ?? "",
    viewerId: rawViewer,
    sessionId: rawSession,
    sessionToken,
  });
  if (abTestId) streamParams.set("abTestId", abTestId);
  const streamUrl = `/api/embed/${encodeURIComponent(id)}/stream?${streamParams.toString()}`;

  const config = filterConfigForEmbed(rawConfig);
  if (Number(config.radius) === 12) config.radius = 0;
  // Só assina assets do próprio dono do player: `config` é jsonb livre gravado
  // pelo usuário e antes qualquer caminho colocado ali era assinado.
  const assets = ownedAssetPaths(rawConfig.assets, video.userId);
  const assetUrls: Record<string, string> = {};
  await Promise.all(Object.entries(assets).map(async ([kind, path]) => {
    const signedUrl = await signR2ReadUrl(path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null);
    if (signedUrl) assetUrls[kind] = signedUrl;
  }));
  config.assets = assets;
  config.assetUrls = assetUrls;

  // RM-03: o eventToken é amarrado ao host do embed e à sessão do viewer (que
  // o player envia no query do próprio request de config). O endpoint de
  // analytics rejeita evento cuja sessionId do corpo não bata com o token.
  const eventToken = createBoundEmbedEventTokenSafely({ videoId: video.id, host, sessionId: rawSession, nonce: verifiedOrigin.nonce });
  // IP real do espectador para a marca d'água "Endereço IP". Review de
  // segurança (LOW-2): o campo só sai na resposta quando o dono ativou a
  // exibição de IP na marca d'água - sem isso era PII incondicional legível
  // por qualquer script da página hospedeira. Vazio quando o deploy não
  // repassa x-forwarded-for/x-real-ip.
  const viewerIp = Boolean(rawConfig.watermarkShowIp) ? clientIpFromHeaders(request.headers) : "";

  return NextResponse.json({ id: playerConfig.id, videoId: playerConfig.videoId, title: video.title, streamUrl, type: video.mimeType, config, eventToken, viewerIp }, { headers: { "cache-control": "private, no-store, max-age=0", "x-robots-tag": "noindex, nofollow, noarchive", "cloudflare-cdn-cache": "no-store" } });
}
