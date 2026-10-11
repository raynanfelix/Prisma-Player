import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { SECURITY } from "@/lib/constants";

let lastCleanup = 0;

async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < SECURITY.RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  try {
    const admin = createAdminClient();
    await admin.rpc("cleanup_rate_limits");
  } catch {
  }
}

/**
 * Only headers the hosting platform itself sets can be trusted here. Anything a
 * client can forge would let an attacker reset its own bucket on every request
 * and walk straight through the login and password limits.
 *
 * Vercel strips inbound `x-vercel-*` headers and rewrites them with the real
 * peer address, so `x-vercel-forwarded-for` is authoritative in production.
 * `cf-connecting-ip` is only meaningful when Cloudflare actually fronts the
 * deployment, so it stays behind an explicit opt-in.
 */
function clientIp(request: Request): string {
  const candidates = [
    process.env.TRUST_CLOUDFLARE_IP_HEADER === "true" ? request.headers.get("cf-connecting-ip") : null,
    request.headers.get("x-vercel-forwarded-for"),
    request.headers.get("x-real-ip"),
    // Last resort for self-hosted deployments; never reached on Vercel.
    request.headers.get("x-forwarded-for"),
  ];

  for (const candidate of candidates) {
    const value = candidate?.split(",")[0]?.trim();
    if (value && value !== "unknown" && value !== "::1" && value !== "127.0.0.1") return value;
  }
  return "unknown";
}

/**
 * Headers padrão de rate limit (`X-RateLimit-*` de facto + `RateLimit-Policy`
 * do draft IETF). Sem eles o cliente não tem como se auto-regular e só descobre
 * o limite quando leva 429 — o que, num player embutido em site de terceiro,
 * vira chamado de suporte.
 */
function limitHeaders(max: number, remaining: number, resetEpochSeconds: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(max),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(resetEpochSeconds),
    "RateLimit-Policy": `${max};w=${Math.max(1, resetEpochSeconds - Math.floor(Date.now() / 1000))}`,
    "Cache-Control": "no-store",
  };
}

function limitedResponse(max: number, retryAfterSeconds: number, resetEpochSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfterSeconds: Math.max(1, retryAfterSeconds) },
    {
      status: 429,
      headers: {
        ...limitHeaders(max, 0, resetEpochSeconds),
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}

export type RateLimitOptions = { max: number; windowMs: number; failClosed?: boolean; identifier?: string };

/** Evita persistir e-mail, IP alternativo ou outro identificador sensivel. */
export function hashRateLimitIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type RateLimitResult =
  | { limited: true; response: NextResponse }
  | { limited: false; headers: Record<string, string> };

/**
 * `failClosed` decides what happens when the counter store is unreachable.
 * Authentication-adjacent endpoints pass `true` so an outage cannot silently
 * disable brute-force protection; telemetry endpoints stay open so a database
 * hiccup does not drop customer analytics.
 */
export async function consumeRateLimit(request: Request, scope: string, options: RateLimitOptions): Promise<RateLimitResult> {
  await cleanupExpired();

  // A janela chegava como NaN quando a variável de ambiente usava "60_000";
  // o valor virava `null` no RPC e a janela caía para 1 segundo.
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ? Math.round(options.windowMs) : 60_000;
  const key = `${scope}:${options.identifier ?? clientIp(request)}`;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .rpc("consume_rate_limit", { p_key: key, p_window_ms: windowMs })
      .maybeSingle<{ hit_count: number; window_expires_at: string }>();

    if (error || !data) throw error ?? new Error("rate_limit_unavailable");
    const resetEpochSeconds = Math.ceil(new Date(data.window_expires_at).getTime() / 1000);
    if (data.hit_count <= options.max) {
      return { limited: false, headers: limitHeaders(options.max, options.max - data.hit_count, resetEpochSeconds) };
    }
    const retryAfter = Math.ceil((new Date(data.window_expires_at).getTime() - Date.now()) / 1000);
    return { limited: true, response: limitedResponse(options.max, retryAfter, resetEpochSeconds) };
  } catch {
    const resetEpochSeconds = Math.ceil((Date.now() + windowMs) / 1000);
    if (!options.failClosed) return { limited: false, headers: limitHeaders(options.max, options.max, resetEpochSeconds) };
    return { limited: true, response: limitedResponse(options.max, Math.ceil(windowMs / 1000), resetEpochSeconds) };
  }
}

export async function rateLimit(request: Request, scope: string, options: RateLimitOptions): Promise<NextResponse | null> {
  const result = await consumeRateLimit(request, scope, options);
  return result.limited ? result.response : null;
}
