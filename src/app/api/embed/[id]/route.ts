import { NextResponse } from "next/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { createBoundEmbedEventTokenSafely, domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie, verifyEmbedSessionToken } from "@/lib/security/embed-origin";
import { localRateLimit } from "@/lib/security/rate-limit-local";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { getAccountAccessCached } from "@/lib/access/access-cache";
import { ownedAssetPaths } from "@/lib/player/assets";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { clientIpFromHeaders } from "@/lib/security/vpn";
import { streamKeyFromHeaders } from "@/lib/player/stream-key";
import { embedTrafficViolation } from "@/lib/player/embed-traffic";
import { findEmbedVideoCached, findPublishedPlayerConfigCached, type PlayerConfigRow } from "@/lib/player/embed-config";
import { filterConfigForEmbed } from "@/lib/player/config-keys";
import { safeLog } from "@/lib/utils/log";
import { envInt } from "@/lib/config/env";
import { VIDEO } from "@/lib/constants";

const { videoLiveSessions } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBED_CONFIG_RATE_LIMIT_MAX = envInt("EMBED_CONFIG_RATE_LIMIT_MAX", 300);
const EMBED_CONFIG_RATE_LIMIT_WINDOW_MS = envInt("EMBED_CONFIG_RATE_LIMIT_WINDOW_MS", 60_000);

function databaseErrorDetails(error: unknown) {
  const shape = error as { code?: string; message?: string };
  return { code: shape?.code ?? "database_error", message: shape?.message ?? "unknown" };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  // P0-1: escopo público de embed usa o limitador por instância (memória) -
  // o de banco aqui custava 1 write no Postgres por request de config.
  const limited = await localRateLimit(request, `embed-config:${id}`, { max: EMBED_CONFIG_RATE_LIMIT_MAX, windowMs: EMBED_CONFIG_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  // P1-4: lookup compartilhado entre as 4 portas de embed, com cache de 10s
  // (dedup D3 + mata 2 queries por request no hot path).
  let playerConfig: PlayerConfigRow | null = null;
  try {
    playerConfig = await findPublishedPlayerConfigCached(id);
  } catch (error) {
    safeLog("embed_player_lookup_failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503 });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  // Acesso do dono e linha do vídeo saem em PARALELO: precedência externa
  // preservada (o 402 do acesso vence antes das checagens de origem e do 404
  // do vídeo). O vídeo vem do cache de 10s (findEmbedVideoCached) - mesma
  // janela do lookup de config.
  const [ownerAccess, video] = await Promise.all([
    getAccountAccessCached(playerConfig.userId),
    findEmbedVideoCached(playerConfig.videoId).catch(() => null),
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

  // Fluxos simultâneos por vídeo: conta sessões vivas (heartbeat ≤75s) da
  // MESMA CHAVE server-side. Sem migration: usa video_live_sessions (a mesma
  // linha que o analytics atualiza; o cron poda o resto). Corrida de abas
  // abertas no mesmo segundo pode passar - documentado, não bloqueante.
  if (Boolean(rawConfig.limitConcurrentStreams)) {
    const maxStreams = Math.max(1, Math.min(50, Math.floor(Number(rawConfig.maxConcurrentStreams) || 1)));
    const session = rawSession;
    // M9: a chave do contador é derivada no servidor de (vídeo, IP real). O
    // viewerId declarado é rotável e zerava o teto a cada troca; o hash do IP
    // mantém o teto sob rotação de identidade (embeds legítimos atrás do mesmo
    // NAT compartilham o teto configurado pelo dono). Sem IP legível no deploy,
    // degrada para o viewer declarado.
    const streamKey = streamKeyFromHeaders(playerConfig.videoId, request.headers) || rawViewer;
    const countryHeader = (request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "").toLowerCase();
    const countryCode = countryHeader.length === 2 ? countryHeader.toUpperCase() : "XX";
    try {
      await db
        .insert(videoLiveSessions)
        .values({ videoId: playerConfig.videoId, userId: playerConfig.userId, sessionId: session, viewerId: streamKey, countryCode, lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: [videoLiveSessions.videoId, videoLiveSessions.sessionId],
          set: { viewerId: streamKey, countryCode, lastSeenAt: new Date() },
        });
    } catch (error) {
      safeLog("live_session_upsert_failed", { playerId: id, message: error instanceof Error ? error.message : "unknown" });
    }
    // Contagem na MESMA dimensão da escrita (regressão D1/M9): sessões vivas
    // com a MESMA streamKey server-side (vídeo + IP real), exceto a própria
    // sessão - o upsert acima acabou de gravá-la. A tabela só guarda sessões
    // vivas (o cron poda as frias) e o índice
    // video_live_sessions_viewer_id_idx serve a busca. O join por
    // player_configs (sessionId = config.id) da versão anterior nunca casava:
    // sessionId é UUID do cliente, não id de config - o count dava sempre 0 e
    // o teto nunca disparava.
    const freshSince = new Date(Date.now() - 75_000);
    const activeSessions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(videoLiveSessions)
      .where(and(
        eq(videoLiveSessions.videoId, playerConfig.videoId),
        eq(videoLiveSessions.viewerId, streamKey),
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
