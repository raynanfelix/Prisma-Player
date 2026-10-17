import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { sanitizeCoverUrl } from "@/lib/player/autoplay-cover";
import { ownedAssetPaths } from "@/lib/player/assets";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/security/rate-limit";
import { getAccountAccessCached } from "@/lib/access/access-cache";
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
  "headline", "headlineColor", "headlineBackground", "headlineAlign", "headlineEnabled",
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
  // Erros NUNCA cacheiam na borda (sem no-store explícito, uma CDN agressiva
  // poderia servir o 404/503 para o player reativado).
  const NO_STORE = { "cache-control": "private, no-store, max-age=0" };
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  // O rate limit só roda em cache miss: com o manifest público cacheado na
  // borda (s-maxage=60), a CDN absorve o tráfego repetido e a origem só vê a
  // primeira requisição de cada janela por player.
  const limited = await rateLimit(request, `embed-manifest:${id}`, { max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  let playerConfig: PlayerConfigRow | null = null;
  try {
    playerConfig = await findPublishedPlayerConfig(id);
  } catch (error) {
    console.error("embed manifest player lookup failed", databaseErrorDetails(error));
    return NextResponse.json({ error: "player_lookup_failed" }, { status: 503, headers: NO_STORE });
  }
  if (!playerConfig) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  // O manifest é entrega de valor igual ao endpoint dinâmico: sem esta
  // verificação, cancelar a assinatura não tirava CTAs/config do ar.
  const ownerAccess = await getAccountAccessCached(playerConfig.userId);
  if (!ownerAccess.hasAccess) {
    return NextResponse.json({ error: "player_unavailable" }, { status: 402, headers: { "cache-control": "private, no-store, max-age=0", "x-robots-tag": "noindex, nofollow, noarchive" } });
  }

  // MANIFEST PÚBLICO (Plano A de escala): entrega só cosmetics sanitizadas
  // (allowlist acima) por player-id — sem originToken, cookie de render ou
  // checagem de domínio. Trade-off aceito pelo dono: as cosmetics são obtíveis
  // por UUID sem render, mas um UUID v4 é incalculável por enumeração e o
  // conteúdo é exatamente o que qualquer visitante da página do cliente já vê
  // renderizado no player. Token de origem, cookie de render, eventToken e a
  // URL assinada do vídeo continuam EXCLUSIVOS do endpoint dinâmico
  // /api/embed/:id (no-store, intocado) — inclusive a aplicação de
  // allowedDomains, que só lá decide se o player roda naquele host.
  const domains = Array.isArray(playerConfig.allowedDomains) ? playerConfig.allowedDomains.map((d) => d.trim()).filter(Boolean) : [];

  const rawConfig = playerConfig.config && typeof playerConfig.config === "object"
    ? playerConfig.config as Record<string, unknown>
    : {};
  const config = sanitizeConfigForManifest(rawConfig);

  // POSTER instantâneo do shell (borrow do padrão Vturb): URL assinada do
  // thumbnailStart para o EmbedPlayer pintar o poster antes de a config
  // dinâmica chegar. A assinatura É a proteção — mesma política dos assets do
  // endpoint dinâmico (ownedAssetPaths só aceita caminhos do próprio
  // titular) — e o campo é public-cacheável porque o poster é exatamente o
  // que qualquer espectador já vê renderizado no player. Como todo o
  // handler, a assinatura roda só em cache miss: a borda revalida em ≤60s
  // (+300s de stale-while-revalidate), dentro do TTL de 900s da URL. Sem
  // thumbnail do titular (ou falha ao assinar) o campo fica ausente — o
  // shell cai no box preto de hoje. "assets" não integra a allowlist de
  // config, então o poster sai como campo próprio, extraído do config raw.
  const posterPath = ownedAssetPaths(rawConfig.assets, playerConfig.userId).thumbnailStart;
  const posterUrl = posterPath ? await signR2ReadUrl(posterPath).catch(() => null) : null;

  return NextResponse.json(
    { id: playerConfig.id, videoId: playerConfig.videoId, config, allowedDomains: domains, ...(posterUrl ? { posterUrl } : {}) },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Cache público na borda por player-id (a resposta não varia mais por
        // host/render). Config alterada no editor propaga em ≤60s (s-maxage);
        // o purge por cache-tag `player:{id}` já existe no worker Cloudflare;
        // stale-while-revalidate=300 segura o tráfego durante a revalidação.
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        "cache-tag": `player:${playerConfig.id}`,
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
