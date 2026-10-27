import "server-only";

/**
 * Helpers puros do rate limit (sem banco): derivação de IP do cliente e
 * construção da resposta/headers 429. Compartilhados entre o limitador de
 * banco (rate-limit.ts, rotas autenticadas) e o limitador por instância
 * (rate-limit-local.ts, escopos públicos de embed).
 */

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
export function clientIpFromRequest(request: Request): string {
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
 * Headers padrão de rate limit: o trio do draft IETF
 * (`RateLimit-Limit/Remaining/Reset`), o `RateLimit-Policy` do mesmo draft e
 * o `X-RateLimit-*` de facto que clientes legados já leem. Sem eles o cliente
 * não tem como se auto-regular e só descobre o limite quando leva 429 - o
 * que, num player embutido em site de terceiro, vira chamado de suporte.
 */
export function limitHeaders(max: number, remaining: number, resetEpochSeconds: number): Record<string, string> {
  return {
    "RateLimit-Limit": String(max),
    "RateLimit-Remaining": String(Math.max(0, remaining)),
    "RateLimit-Reset": String(resetEpochSeconds),
    "X-RateLimit-Limit": String(max),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Reset": String(resetEpochSeconds),
    "RateLimit-Policy": `${max};w=${Math.max(1, resetEpochSeconds - Math.floor(Date.now() / 1000))}`,
    "Cache-Control": "no-store",
  };
}

// Módulo de segurança não conhece o framework: `Response` nativo (Web
// standard), não `NextResponse`. Headers e corpo preservados byte a byte.
export function limitedResponse(max: number, retryAfterSeconds: number, resetEpochSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", retryAfterSeconds: Math.max(1, retryAfterSeconds) }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        ...limitHeaders(max, 0, resetEpochSeconds),
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}
