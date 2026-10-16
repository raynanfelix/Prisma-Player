import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { sanitizeCoverUrl } from "@/lib/player/autoplay-cover";
import { domainAllowed, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAccountAccess } from "@/lib/access/service";
import { envInt } from "@/lib/config/env";

const { playerConfigs } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_LIMIT_MAX = envInt("EMBED_MANIFEST_RATE_LIMIT_MAX", 600);
const RATE_LIMIT_WINDOW_MS = envInt("EMBED_MANIFEST_RATE_LIMIT_WINDOW_MS", 60_000);

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

/**
 * Allowlist de chaves PUBLICAS do player config que o manifest cachea na borda.
 * Regras de trafego (allowedCountries/allowedDevices/browserLanguage/trafficEnabled)
 * sao intencionalmente OMITIDAS: sao checadas por request no endpoint dinamico
 * /api/embed/:id, evitando evasao por cache da CDN e por fingerprint de pais.
 * Adicionar uma chave aqui so faze-lo apos revisao de seguranca (vazamento potencial).
 */
const MANIFEST_CONFIG_KEYS = [
  "autoplayMessage", "autoplayBackground", "autoplayTextColor", "autoplayRadius",
  "autoplayCoverType", "autoplayGifUrl", "autoplayImageUrl", "autoplayAnimation",
  "accent", "progressColor", "progressHeight", "smartProgress", "smartAutoplay",
  "smartPause", "muted", "loop", "bigPlay", "playPause", "fullscreenDesktop", "fullscreenMobile",
  "radius", "playbackRate", "thumbnailEnabled", "captionsEnabled",
  "ctaEnabled", "ctaStart", "ctaEnd", "ctaText", "ctaUrl", "ctaNewTab", "ctaBackground",
  "ctaTextColor", "ctaFontSize", "ctaRadius", "ctaPaddingX", "ctaPaddingY", "ctaShadow",
  "ctaPulse", "ctaHoverBackground", "ctaHoverTextColor", "ctaPersist", "ctaAutoScroll",
  "headline", "headlineColor", "headlineBackground", "headlineAlign",
] as const;

function sanitizeConfigForManifest(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of MANIFEST_CONFIG_KEYS) {
    if (key in raw) out[key] = raw[key];
  }
  if (Number(out.radius) === 12) out.radius = 0;
  // URLs de capa passam por sanitização https (nunca refletem javascript:/data:).
  if (typeof out.autoplayCoverType !== "string" || !["standard", "gif", "image"].includes(out.autoplayCoverType)) out.autoplayCoverType = "standard";
  out.autoplayGifUrl = sanitizeCoverUrl(out.autoplayGifUrl) ?? "";
  out.autoplayImageUrl = sanitizeCoverUrl(out.autoplayImageUrl) ?? "";
  return out;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  const limited = await rateLimit(request, `embed-manifest:${id}`, { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  let playerConfig: PlayerConfigRow | null = null;
  try {
    playerConfig = await findPublishedPlayerConfig(id);
  } catch (error) {
    console.error("embed manifest player lookup failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503 });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404 });

  // O manifest é entrega de valor igual ao endpoint dinâmico: sem esta
  // verificação, cancelar a assinatura não tirava CTAs/config do ar.
  const ownerAccess = await getAccountAccess(playerConfig.userId);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: { "cache-control": "private, no-store, max-age=0", "x-robots-tag": "noindex, nofollow, noarchive" } });
  }

  // RM-02: o manifest também não pode confiar em `Referer`/`Origin`. Sem token
  // de origem válido (assinado, não expirado, do render) a requisição é rejeitada.
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
  if (!host || originHeaderDisagrees(request.headers, host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403 });
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403 });

  // Usa a mesma normalização do endpoint dinâmico (www., https://, curinga *.).
  // A comparação exata anterior bloqueava clientes legítimos que cadastraram o
  // domínio em qualquer outro formato. O host vem do token, nunca dos headers.
  const domains = Array.isArray(playerConfig.allowedDomains) ? playerConfig.allowedDomains.map((d) => d.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(host, domains)) return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });

  const config = playerConfig.config && typeof playerConfig.config === "object"
    ? sanitizeConfigForManifest(playerConfig.config as Record<string, unknown>)
    : {};

  return NextResponse.json(
    { id: playerConfig.id, videoId: playerConfig.videoId, config, allowedDomains: domains },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // A resposta agora depende do token do render; cache público na borda
        // poderia servir o manifest validado para um host a outro host.
        "cache-control": "private, no-store, max-age=0",
        "cloudflare-cdn-cache": "private, no-store",
        "cache-tag": `player:${playerConfig.id}`,
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
