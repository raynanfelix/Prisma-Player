export type PixelProvider = "meta" | "google" | "tiktok";
export type PixelConsentMode = "banner" | "external";

export interface PixelIntegration {
  provider: PixelProvider;
  id: string;
  conversionDestination?: string;
}

export interface PixelConfigShape {
  pixelsEnabled?: unknown;
  pixelProvider?: unknown;
  pixelId?: unknown;
  metaPixelEnabled?: unknown;
  metaPixelId?: unknown;
  googlePixelEnabled?: unknown;
  googleTagId?: unknown;
  googleConversionDestination?: unknown;
  tiktokPixelEnabled?: unknown;
  tiktokPixelId?: unknown;
  pixelConsentMode?: unknown;
  pixelConsentTitle?: unknown;
  pixelConsentDescription?: unknown;
  pixelConsentAcceptLabel?: unknown;
  pixelConsentRejectLabel?: unknown;
  pixelPrivacyUrl?: unknown;
}

interface NormalizedPixelFields {
  pixelsEnabled: boolean;
  metaPixelEnabled: boolean;
  metaPixelId: string;
  googlePixelEnabled: boolean;
  googleTagId: string;
  googleConversionDestination: string;
  tiktokPixelEnabled: boolean;
  tiktokPixelId: string;
  pixelConsentMode: PixelConsentMode;
  pixelConsentTitle: string;
  pixelConsentDescription: string;
  pixelConsentAcceptLabel: string;
  pixelConsentRejectLabel: string;
  pixelPrivacyUrl: string;
}

const META_PIXEL_ID = /^\d{5,20}$/;
const GOOGLE_TAG_ID = /^(?:G-[A-Z0-9]{5,20}|AW-\d{5,20})$/i;
const GOOGLE_DESTINATION = /^AW-\d{5,20}\/[A-Za-z0-9_-]{2,100}$/;
const TIKTOK_PIXEL_ID = /^[A-Z0-9]{10,30}$/i;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function pixelConfigErrors(config: PixelConfigShape): string[] {
  const errors: string[] = [];
  const metaId = clean(config.metaPixelId);
  const googleId = clean(config.googleTagId).toUpperCase();
  const googleDestination = clean(config.googleConversionDestination);
  const tiktokId = clean(config.tiktokPixelId).toUpperCase();

  if (config.metaPixelEnabled === true && !META_PIXEL_ID.test(metaId)) errors.push("meta_pixel_id_invalid");
  if (config.googlePixelEnabled === true && !GOOGLE_TAG_ID.test(googleId)) errors.push("google_tag_id_invalid");
  if (config.googlePixelEnabled === true && googleDestination && !GOOGLE_DESTINATION.test(googleDestination)) errors.push("google_conversion_destination_invalid");
  if (config.tiktokPixelEnabled === true && !TIKTOK_PIXEL_ID.test(tiktokId)) errors.push("tiktok_pixel_id_invalid");
  const privacyUrl = clean(config.pixelPrivacyUrl, 500);
  if (privacyUrl && !HTTPS_URL.test(privacyUrl)) errors.push("pixel_privacy_url_invalid");
  return errors;
}

export function normalizePixelConfig<T extends Record<string, unknown>>(config: T): T & NormalizedPixelFields {
  const legacyProvider = clean(config.pixelProvider).toLowerCase();
  const legacyId = clean(config.pixelId);
  const legacyEnabled = config.pixelsEnabled === true;
  const metaPixelId = clean(config.metaPixelId) || (legacyEnabled && legacyProvider === "meta" ? legacyId : "");
  const googleTagId = (clean(config.googleTagId) || (legacyEnabled && legacyProvider === "google" ? legacyId : "")).toUpperCase();
  const tiktokPixelId = (clean(config.tiktokPixelId) || (legacyEnabled && legacyProvider === "tiktok" ? legacyId : "")).toUpperCase();
  const normalized: Record<string, unknown> = {
    ...config,
    metaPixelEnabled: config.metaPixelEnabled === true || (legacyEnabled && legacyProvider === "meta"),
    metaPixelId,
    googlePixelEnabled: config.googlePixelEnabled === true || (legacyEnabled && legacyProvider === "google"),
    googleTagId,
    googleConversionDestination: clean(config.googleConversionDestination),
    tiktokPixelEnabled: config.tiktokPixelEnabled === true || (legacyEnabled && legacyProvider === "tiktok"),
    tiktokPixelId,
    pixelConsentMode: config.pixelConsentMode === "external" ? "external" : "banner",
    pixelConsentTitle: clean(config.pixelConsentTitle, 80) || "Sua privacidade importa",
    pixelConsentDescription: clean(config.pixelConsentDescription, 240) || "Usamos tecnologias de publicidade para medir resultados e melhorar sua experiência.",
    pixelConsentAcceptLabel: clean(config.pixelConsentAcceptLabel, 32) || "Aceitar",
    pixelConsentRejectLabel: clean(config.pixelConsentRejectLabel, 32) || "Recusar",
    pixelPrivacyUrl: clean(config.pixelPrivacyUrl, 500),
  };
  normalized.pixelsEnabled = normalized.metaPixelEnabled === true || normalized.googlePixelEnabled === true || normalized.tiktokPixelEnabled === true;
  return normalized as T & NormalizedPixelFields;
}

export function pixelIntegrations(config: PixelConfigShape): PixelIntegration[] {
  const normalized = normalizePixelConfig(config as Record<string, unknown>);
  const result: PixelIntegration[] = [];
  if (normalized.metaPixelEnabled === true && META_PIXEL_ID.test(String(normalized.metaPixelId))) result.push({ provider: "meta", id: String(normalized.metaPixelId) });
  if (normalized.googlePixelEnabled === true && GOOGLE_TAG_ID.test(String(normalized.googleTagId))) result.push({ provider: "google", id: String(normalized.googleTagId), conversionDestination: clean(normalized.googleConversionDestination) || undefined });
  if (normalized.tiktokPixelEnabled === true && TIKTOK_PIXEL_ID.test(String(normalized.tiktokPixelId))) result.push({ provider: "tiktok", id: String(normalized.tiktokPixelId) });
  return result;
}
