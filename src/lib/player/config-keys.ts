import "server-only";

/**
 * Allowlist de chaves do player config (C2 do audit de seguranca).
 *
 * O config do player e um jsonb gravado pelo studio via PUT /api/player-configs.
 * Antes desta lista o PUT aceitava QUALQUER chave (ate 100KB) e o embed
 * devolvia o jsonb INTEIRO no corpo da resposta, vazando qualquer segredo que
 * acabasse gravado ali (o caso real: metaCapiToken, segredo da API de
 * Conversoes da Meta).
 *
 * Contrato desta unica fonte de verdade:
 * - PLAYER_CONFIG_KEYS: tudo que o studio pode gravar (PUT rejeita o resto).
 * - PLAYER_CONFIG_SERVER_ONLY_KEYS: subset que so as rotas de servidor leem
 *   (regras de trafego, DRM, restricoes, rascunhos do studio e segredos).
 * - EMBED_CONFIG_KEYS: o que sai no corpo de GET /api/embed/:id. Derivado por
 *   subtracao, para nunca haver drift entre o PUT e o embed.
 *
 * Adicionar uma chave exige revisao de seguranca: ela vira publicamente
 * visivel (embed) ou gravavel (PUT) conforme a secao em que entrar.
 */

const STYLE_KEYS = [
  "accent", "background", "gradientEnd", "colorStyle", "radius", "bigPlay", "playPause",
  "disablePause", "progressBar", "time", "seekBackward", "seekForward", "volume",
  "fullscreen", "pictureInPicture", "speedControl",
] as const;

const PROGRESS_KEYS = ["smartProgress", "progressColor", "progressHeight"] as const;

const AUTOPLAY_KEYS = [
  "smartAutoplay", "autoplayMessage", "autoplayTextColor", "autoplayBackground", "autoplayRadius",
  "autoplayCoverType", "autoplayGifUrl", "autoplayImageUrl", "autoplayTagBadge", "autoplayAnimation",
  "autoplayOverlayOpacity",
] as const;

const TURBO_KEYS = ["turboEnabled", "turboMode", "turboMin", "turboMax", "playbackRate"] as const;

const HEADLINE_KEYS = [
  "headlineEnabled", "headline", "headlineVariants", "headlineFormat", "headlineDesktopName",
  "headlineMobileName", "headlineColor", "headlineBackground", "headlineSize", "headlineAlign",
  "headlineTagBadge", "headlineStart", "headlineDuration",
] as const;

const TRAFFIC_KEYS = [
  "trafficEnabled", "domains", "browserLanguage", "allowedCountries", "allowedDevices",
  "blockVpn", "urlKeyEnabled", "accessToken",
] as const;

const HOOKS_KEYS = [
  "miniHooksEnabled", "miniHookText", "miniHookStart", "miniHookDuration", "miniHookTextColor",
  "miniHookBackground", "miniHookCounterColor", "miniHookSize", "miniHookRadius", "miniHookAlign",
  "miniHookType",
] as const;

const CTA_KEYS = [
  "ctaEnabled", "ctaText", "ctaSubtitle", "ctaBadges", "ctaUrl", "ctaStart", "ctaEnd", "ctaNewTab",
  "ctaPersist", "ctaAutoScroll", "ctaTextColor", "ctaHoverTextColor", "ctaBackground",
  "ctaHoverBackground", "ctaFontSize", "ctaRadius", "ctaPaddingY", "ctaPaddingX", "ctaPulse",
  "ctaShadow", "ctaPosition",
] as const;

const THUMBNAIL_KEYS = [
  "thumbnailEnabled", "resumeEnabled", "resumeMessage", "thumbnailStartName",
  "thumbnailPauseName", "thumbnailEndName",
] as const;

const PIXEL_KEYS = [
  "pixelsEnabled", "pixelProvider", "pixelName", "pixelId", "metaPixelEnabled", "metaPixelId",
  "metaCapiToken", "googlePixelEnabled", "googleTagId", "googleConversionDestination",
  "tiktokPixelEnabled", "tiktokPixelId", "pixelConsentMode", "pixelConsentTitle",
  "pixelConsentDescription", "pixelConsentAcceptLabel", "pixelConsentRejectLabel",
  "pixelPrivacyUrl",
] as const;

const CAPTIONS_KEYS = ["captionsEnabled", "captionName"] as const;

const PLAYBACK_KEYS = [
  "loop", "muted", "smartPause", "fullscreenDesktop", "fullscreenMobile", "antiDownload",
  "videoDuration", "aspectRatio",
] as const;

const WATERMARK_KEYS = [
  "watermarkEnabled", "watermarkShowEmail", "watermarkShowPhone", "watermarkShowIp",
  "watermarkShowUsername", "watermarkShowDate", "watermarkShowCustomText", "watermarkCustomText",
  "watermarkEmailText", "watermarkPhoneText", "watermarkType", "watermarkPosition",
  "watermarkIntervalValue", "watermarkIntervalUnit", "watermarkOpacity",
] as const;

const RESTRICTION_KEYS = [
  "limitConcurrentStreams", "maxConcurrentStreams", "domainWhitelistEnabled", "domainWhitelist",
] as const;

const DRM_KEYS = ["drmHlsEnabled", "drmSignedTokenEnabled", "disableContextMenu", "blockDevTools"] as const;

const ASSET_KEYS = ["assets"] as const;

/** Chaves gravaveis no PUT /api/player-configs (union de todas as secoes). */
export const PLAYER_CONFIG_KEYS = [
  ...STYLE_KEYS, ...PROGRESS_KEYS, ...AUTOPLAY_KEYS, ...TURBO_KEYS, ...HEADLINE_KEYS,
  ...TRAFFIC_KEYS, ...HOOKS_KEYS, ...CTA_KEYS, ...THUMBNAIL_KEYS, ...PIXEL_KEYS,
  ...CAPTIONS_KEYS, ...PLAYBACK_KEYS, ...WATERMARK_KEYS, ...RESTRICTION_KEYS, ...DRM_KEYS,
  ...ASSET_KEYS,
] as const;

export type PlayerConfigKey = (typeof PLAYER_CONFIG_KEYS)[number];

/**
 * Chaves que NUNCA saem no corpo do embed: segredos (metaCapiToken), regras
 * aplicadas por request no servidor (trafego/DRM/restricoes) e rascunhos que
 * so o studio consome. O embed le tudo isso do banco no servidor.
 */
export const PLAYER_CONFIG_SERVER_ONLY_KEYS = [
  ...TRAFFIC_KEYS,
  ...RESTRICTION_KEYS,
  "drmHlsEnabled",
  "drmSignedTokenEnabled",
  "metaCapiToken",
  "videoDuration",
  "thumbnailStartName",
  "thumbnailPauseName",
  "thumbnailEndName",
  "headlineDesktopName",
  "headlineMobileName",
  "turboEnabled",
] as const;

const SERVER_ONLY = new Set<string>(PLAYER_CONFIG_SERVER_ONLY_KEYS);

/** Chaves publicas do player que o embed entrega no corpo (modelo do manifest). */
export const EMBED_CONFIG_KEYS: readonly PlayerConfigKey[] = PLAYER_CONFIG_KEYS.filter((key) => !SERVER_ONLY.has(key));

const WRITABLE = new Set<string>(PLAYER_CONFIG_KEYS);

/** Chaves fora da allowlist (PUT responde 400 invalid_config_key com elas). */
export function unknownConfigKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).filter((key) => !WRITABLE.has(key));
}

/**
 * Copia so as chaves publicas do config para o corpo do embed. O mesmo modelo
 * do manifest (MANIFEST_CONFIG_KEYS), porem com o conjunto completo que o
 * EmbedPlayer consome: segredos e chaves server-only ficam de fora.
 */
export function filterConfigForEmbed(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EMBED_CONFIG_KEYS) {
    if (key in raw) out[key] = raw[key];
  }
  return out;
}
