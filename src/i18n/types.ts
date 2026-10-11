export type AppLocale = "pt-BR" | "en-US" | "es-ES";

export const DEFAULT_LOCALE: AppLocale = "pt-BR";

export function normalizeLocale(value?: string | null): AppLocale {
  const locale = (value ?? "").toLowerCase();
  if (locale.startsWith("en")) return "en-US";
  if (locale.startsWith("es")) return "es-ES";
  return DEFAULT_LOCALE;
}

export const localeMeta: Record<AppLocale, { label: string; shortLabel: string; currency: "BRL" | "USD" | "EUR" }> = {
  "pt-BR": { label: "Português", shortLabel: "Brasil", currency: "BRL" },
  "en-US": { label: "English", shortLabel: "United States", currency: "USD" },
  "es-ES": { label: "Español", shortLabel: "España", currency: "EUR" },
};
