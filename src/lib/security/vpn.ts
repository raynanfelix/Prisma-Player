/**
 * Detecção de VPN/proxy por IP via provedor externo (proxycheck.io).
 *
 * Sem chave (`VPN_DETECTION_KEY`): inerte, sempre fail-open - nunca bloqueia
 * reprodução por falta de configuração. Com chave: veredito com cache curto
 * em memória e timeout agressivo para não atrasar o carregamento do player.
 * Erro/timeout de rede também é fail-open (não quebrar playback legítimo).
 */

const CACHE = new Map<string, { at: number; vpn: boolean }>();
const CACHE_TTL_MS = 120_000;
const FETCH_TIMEOUT_MS = 2_500;
const MAX_CACHE_ENTRIES = 2_000;

function isUnroutable(ip: string): boolean {
  if (!ip) return true;
  const lower = ip.toLowerCase();
  if (lower === "127.0.0.1" || lower === "::1" || lower === "::ffff:127.0.0.1") return true;
  if (lower.startsWith("10.") || lower.startsWith("192.168.") || lower.startsWith("fd") || lower === "::") return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true;
  if (/^169\.254\./.test(lower)) return true;
  return false;
}

function pruneCache() {
  if (CACHE.size <= MAX_CACHE_ENTRIES) return;
  const oldest = [...CACHE.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 500);
  for (const [key] of oldest) CACHE.delete(key);
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  if (first) return first;
  return headers.get("x-real-ip")?.trim() ?? "";
}

export async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (isUnroutable(ip)) return false;
  const key = (process.env.VPN_DETECTION_KEY ?? "").trim();
  if (!key) return false;

  const now = Date.now();
  const hit = CACHE.get(ip);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.vpn;

  let vpn = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&vpn=1&asn=1`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (response.ok) {
      const data = (await response.json().catch(() => null)) as Record<string, { proxy?: string }> | null;
      vpn = data?.[ip]?.proxy === "yes";
    }
  } catch {
    vpn = false;
  }
  CACHE.set(ip, { at: now, vpn });
  pruneCache();
  return vpn;
}
