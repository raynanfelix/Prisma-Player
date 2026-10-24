import "server-only";

import { clientIpFromHeaders, isVpnOrProxy } from "@/lib/security/vpn";

/**
 * Regras de tráfego do config aplicadas POR REQUEST em duas portas: a config
 * dinâmica (/api/embed/:id) e a porta da mídia (/api/embed/:id/stream). Antes
 * viviam inline só na config; a porta da mídia precisa das MESMAS regras
 * (C1: geo e paywall na mesma porta da mídia), então o código sai da rota
 * para esta unidade e nunca diverge entre as portas.
 *
 * Fail-open só no VPN (sem chave configurada a checagem é inerte, como antes).
 */

function requestDevice(userAgent: string) {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/android|iphone|mobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

function csvValues(value: unknown) {
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export type TrafficViolationCode =
  | "country_not_allowed"
  | "device_not_allowed"
  | "language_not_allowed"
  | "vpn_not_allowed";

/**
 * Avalia trafficEnabled + país + dispositivo + idioma + VPN do config contra
 * os headers da requisição. Devolve o código da primeira violação, ou null
 * quando o request passa (ou quando trafficEnabled está desligado).
 */
export async function embedTrafficViolation(config: Record<string, unknown>, headers: Headers): Promise<TrafficViolationCode | null> {
  if (!Boolean(config.trafficEnabled)) return null;

  const countryPolicy = String(config.allowedCountries || "Todos").trim().toLowerCase();
  if (countryPolicy === "nenhum") return "country_not_allowed";
  const allowedCountries = csvValues(config.allowedCountries).filter((item) => item !== "todos");
  const country = (headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "").toLowerCase();
  if (allowedCountries.length > 0 && (!country || !allowedCountries.includes(country))) return "country_not_allowed";

  const allowedDevices = Array.isArray(config.allowedDevices)
    ? (config.allowedDevices as unknown[]).filter((item): item is string => typeof item === "string")
    : [];
  if (allowedDevices.length > 0 && !allowedDevices.includes(requestDevice(headers.get("user-agent") || ""))) return "device_not_allowed";

  const requestedLanguage = String(config.browserLanguage || "Todos").toLowerCase();
  const acceptedLanguage = (headers.get("accept-language") || "").toLowerCase();
  const languagePrefix = requestedLanguage === "português" ? "pt" : requestedLanguage === "inglês" ? "en" : requestedLanguage === "espanhol" ? "es" : "";
  if (languagePrefix && !acceptedLanguage.includes(languagePrefix)) return "language_not_allowed";

  if (Boolean(config.blockVpn)) {
    const ip = clientIpFromHeaders(headers);
    if (await isVpnOrProxy(ip)) return "vpn_not_allowed";
  }
  return null;
}
