export type AutoplayCoverType = "standard" | "gif" | "image";

export type AutoplayCover = { type: "standard" } | { type: "gif" | "image"; url: string };

const MAX_URL_LENGTH = 2048;

/** URL https válida para capa (evita javascript:/data: vindo do config). */
export function sanitizeCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > MAX_URL_LENGTH) return null;
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString().slice(0, MAX_URL_LENGTH);
  } catch {
    return null;
  }
}

/**
 * Resolve a capa do Smart Autoplay a partir do config do player.
 * Mesma regra no estúdio (preview), no embed e no manifest: GIF ou imagem
 * custom só valem com URL https válida; o resto cai para o padrão.
 */
export function resolveAutoplayCover(config: Record<string, unknown>): AutoplayCover {
  const type = config.autoplayCoverType === "gif" || config.autoplayCoverType === "image"
    ? config.autoplayCoverType
    : "standard";
  if (type === "gif") {
    const url = sanitizeCoverUrl(config.autoplayGifUrl);
    return url ? { type, url } : { type: "standard" };
  }
  if (type === "image") {
    const url = sanitizeCoverUrl(config.autoplayImageUrl);
    return url ? { type, url } : { type: "standard" };
  }
  return { type: "standard" };
}
