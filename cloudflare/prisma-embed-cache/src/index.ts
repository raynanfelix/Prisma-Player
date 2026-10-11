/// <reference lib="es2022" />
/// <reference types="@cloudflare/workers-types/2023-07-01" />

/**
 * Prisma Player — Edge cache + rate limit + cache-tag purge.
 *
 * Fase 1 do System Design Scale. Roda defronte à Vercel e:
 *   1. cachea `GET /api/embed/:id/manifest` em KV (TTL 30s).
 *   2. aplica rate limit por IP+scope usando contador no KV.
 *   3. expoe `POST /__purge` para invalidar cache por tag quando
 *      um player_config e atualizado (chamado pela Vercel).
 *
 * Documento de referencia: docs/SYSTEM_DESIGN_SCALE.md (Seccao 4.1 e 6).
 */

interface Env {
  PLAYER_CACHE: KVNamespace;
  ORIGIN: string;
  ORIGIN_HOST: string;
  SHARED_PURGE_SECRET: string;
  MANIFEST_PER_MINUTE_PER_IP: string;
  EMBED_CONFIG_PER_MINUTE_PER_IP: string;
}

function cfIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function rateLimitOk(env: Env, request: Request, scope: string, limit: number): Promise<boolean> {
  const ip = cfIp(request);
  const key = `rl:${scope}:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;
  const windowStart = Math.floor(now / windowMs);
  const bucketKey = `${key}:${windowStart}`;
  const current = parseInt((await env.PLAYER_CACHE.get(bucketKey)) || "0", 10);
  if (current >= limit) return false;
  await env.PLAYER_CACHE.put(bucketKey, String(current + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 5 });
  return true;
}

async function handleManifest(env: Env, request: Request, playerId: string): Promise<Response> {
  if (!isUuid(playerId)) {
    return new Response(JSON.stringify({ error: "player_not_found" }), { status: 404, headers: { "content-type": "application/json" } });
  }
  const limit = parseInt(env.MANIFEST_PER_MINUTE_PER_IP || "600", 10);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("invalid_manifest_limit");
  if (!(await rateLimitOk(env, request, "manifest", limit))) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60", "cache-control": "no-store" },
    });
  }

  const cacheKey = `manifest:${playerId}`;
  const metaKey = `manifest-allowed:${playerId}`;
  const cached = await env.PLAYER_CACHE.getWithMetadata<{ cachedAt: number }>(cacheKey);
  if (cached?.value) {
    const allowedDomainsRaw = await env.PLAYER_CACHE.get(metaKey);
    const allowedDomains: string[] = allowedDomainsRaw ? JSON.parse(allowedDomainsRaw) as string[] : [];
    if (!domainAllowed(request, allowedDomains)) {
      return new Response(JSON.stringify({ error: "domain_not_allowed" }), {
        status: 403,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    return new Response(cached.value, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, s-maxage=30, stale-while-revalidate=300",
        "x-prisma-cache": "HIT",
      },
    });
  }

  // A01 Broken Access Control: propaga o referer/origin original do cliente
  // para que o upstream (Vercel) possa validar allowed_domains. Sem isso,
  // players com dominio restrito seriam servidos mesmo de hosts nao autorizados.
  const upstreamHeaders: Record<string, string> = { host: env.ORIGIN_HOST, "user-agent": "prisma-embed-cache-worker" };
  const referer = request.headers.get("referer");
  const origin = request.headers.get("origin");
  if (referer) upstreamHeaders["referer"] = referer;
  if (origin) upstreamHeaders["origin"] = origin;
  if (request.headers.get("x-forwarded-for")) upstreamHeaders["x-forwarded-for"] = request.headers.get("x-forwarded-for")!;
  // Identifica o proprio Worker a origem para auditoria e rate-limit diferenciado.
  upstreamHeaders["x-prisma-via"] = "embed-cache-worker";

  const upstream = await fetch(`https://${env.ORIGIN}/api/embed/${playerId}/manifest`, {
    method: "GET",
    headers: upstreamHeaders,
  });
  if (!upstream.ok) return upstream;

  const body = await upstream.text();
  // A10 fail-secure: so cacheia se o corpo for JSON valido e nao exceder 256KB.
  // A02 misconfig: impede que um upstream comprometido encha o KV com lixo.
  if (body.length > 256 * 1024 || !body.startsWith("{")) return new Response(body, { headers: upstream.headers });

  // O upstream inclui allowedDomains para o Worker poder replicar a checagem no HIT.
  // Extraimos e armazenamos em metadado separado; limpamos do body que segue ao cliente
  // para nao vazar a lista de dominios permitidos (A09 information exposure).
  let allowedDomains: string[] = [];
  let clientBody = body;
  try {
    const payload = JSON.parse(body) as { allowedDomains?: string[] };
    if (Array.isArray(payload.allowedDomains)) {
      allowedDomains = payload.allowedDomains.filter((d): d is string => typeof d === "string");
      delete payload.allowedDomains;
      clientBody = JSON.stringify(payload);
    }
  } catch {
    // corpo invalido: assertion acima ja teria retornado.
  }
  await env.PLAYER_CACHE.put(cacheKey, clientBody, { expirationTtl: 30, metadata: { cachedAt: Date.now() } as never });
  if (allowedDomains.length > 0) await env.PLAYER_CACHE.put(metaKey, JSON.stringify(allowedDomains), { expirationTtl: 35 });
  else await env.PLAYER_CACHE.delete(metaKey);

  return new Response(clientBody, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=30, stale-while-revalidate=300",
      "x-prisma-cache": "MISS",
    },
  });
}

function normalizeHost(value: string | null): string {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

function domainAllowed(request: Request, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const host = request.headers.get("referer")?.split("/")[2] || "";
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  return allowed.some((domain) => {
    const clean = domain.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "").replace(/^\*\./, "");
    return normalized === clean || (domain.startsWith("*.") && normalized.endsWith(`.${clean}`));
  });
}

async function handlePurge(env: Env, request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.SHARED_PURGE_SECRET}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (!env.SHARED_PURGE_SECRET) {
    // Secret nao provisionado: bloqueia tudo. Maior privilégio = acao mais segura.
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  const payload = (await request.json()) as { tag?: string; playerIds?: string[] };
  const rawIds: string[] = Array.isArray(payload.playerIds) ? payload.playerIds : [];
  if (payload.tag?.startsWith("player:")) rawIds.push(payload.tag.slice("player:".length));

  // Apenas UUIDs validos viram chave. A18/A05: impede path traversal no KV.
  const playerIds = rawIds.filter((id) => typeof id === "string" && isUuid(id));
  if (playerIds.length === 0) return new Response(JSON.stringify({ error: "invalid_player_ids" }), { status: 400, headers: { "content-type": "application/json" } });
  if (playerIds.length > 50) return new Response(JSON.stringify({ error: "too_many_player_ids" }), { status: 413, headers: { "content-type": "application/json" } });

  await Promise.all(playerIds.map((id) => env.PLAYER_CACHE.delete(`manifest:${id}`)));
  return new Response(JSON.stringify({ purged: playerIds.length }), { headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__purge" && request.method === "POST") return handlePurge(env, request);

    const match = url.pathname.match(/^\/api\/embed\/([0-9a-f-]{36})\/manifest$/i);
    if (match && request.method === "GET") return handleManifest(env, request, match[1]);

    // Roteia o restante para a origem (Vercel).
    const upstream = new Request(request);
    upstream.headers.set("host", env.ORIGIN_HOST);
    return fetch(`https://${env.ORIGIN}${url.pathname}${url.search}`, upstream);
  },
} satisfies ExportedHandler<Env>;
