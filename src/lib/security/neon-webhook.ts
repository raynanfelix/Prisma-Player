import "server-only";
import { createPublicKey, verify as verifyEd25519, type KeyObject } from "node:crypto";

/**
 * Verificação dos webhooks do Neon Auth (Managed Better Auth) — spec oficial:
 * https://neon.com/docs/auth/guides/webhooks.md
 *
 * O Neon envia um POST com JWS detached EdDSA (Ed25519) no header
 * `X-Neon-Signature` (formato `header..signature`), amarrando o timestamp à
 * assinatura via dupla codificação base64url:
 *
 *   payloadB64          = base64url(rawBody)
 *   signaturePayload    = `${timestamp}.${payloadB64}`
 *   signaturePayloadB64 = base64url(signaturePayload)
 *   signingInput        = `${headerB64}.${signaturePayloadB64}`
 *
 * A chave pública vem do JWKS em `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`
 * (mesmo env do SDK — nenhuma variável nova). Fail-closed: qualquer falha
 * (rede, kid desconhecido, timestamp velho, assinatura inválida) devolve
 * `null` e a rota responde 401. Reentrega do mesmo event id devolve o
 * evento com `duplicate: true` (a rota responde a mesma 200, sem
 * reprocessar). A função nunca lança.
 */

export type NeonWebhookUser = {
  id: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
};

export type NeonWebhookEvent = {
  eventId: string;
  eventType: string;
  user: NeonWebhookUser;
  eventData: Record<string, unknown>;
  /** Reentrega do mesmo event id (replay legítimo) — a rota responde a mesma 200 sem reprocessar. */
  duplicate: boolean;
};

/** Assinatura de `fetch` suficiente para buscar o JWKS (default: globalThis.fetch). */
export type NeonJwksFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const JWKS_CACHE_TTL_MS = 10 * 60_000;
/** Entrada negativa (kid consultado e ausente): evita fetch-amplification com kids forjados. */
const JWKS_NEGATIVE_TTL_MS = 60_000;
const MAX_TIMESTAMP_AGE_MS = 5 * 60_000;
const SEEN_EVENTS_MAX = 1000;

type CachedJwk = { key: KeyObject | null; fetchedAt: number };

/** Cache por kid (Map preserva ordem de inserção — usado como LRU nas entradas). */
const jwksCache = new Map<string, CachedJwk>();

/** Event ids já processados (reentrega da Neon não reprocessa). */
const seenEventIds = new Map<string, number>();

/** Reset de caches de módulo — exclusivo para testes (padrão resetAccessCacheForTests). */
export function resetNeonWebhookStateForTests(): void {
  jwksCache.clear();
  seenEventIds.clear();
}

function jwksUrl(): string | null {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/.well-known/jwks.json` : null;
}

function cacheTtlMs(entry: CachedJwk): number {
  return entry.key ? JWKS_CACHE_TTL_MS : JWKS_NEGATIVE_TTL_MS;
}

/**
 * Busca o JWKS e indexa TODAS as chaves retornadas (um refresh serve todos os
 * kids). Falha de rede/HTTP/JSON → lança para o caller, que devolve null
 * (fail-closed) sem cachear nada — um kid válido nunca é negado por um glitch.
 */
async function refreshJwks(fetcher: NeonJwksFetcher): Promise<void> {
  const url = jwksUrl();
  if (!url) throw new Error("NEON_AUTH_BASE_URL ausente");
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`jwks_http_${response.status}`);
  const jwks = (await response.json()) as { keys?: unknown } | null;
  if (!jwks || !Array.isArray(jwks.keys)) throw new Error("jwks_invalid_payload");

  const fetchedAt = Date.now();
  for (const entry of jwks.keys) {
    if (!entry || typeof entry !== "object") continue;
    const jwk = entry as Record<string, unknown>;
    if (typeof jwk.kid !== "string" || !jwk.kid) continue;
    try {
      jwksCache.set(jwk.kid, { key: createPublicKey({ key: jwk, format: "jwk" }), fetchedAt });
    } catch {
      // JWK malformado para este kid — entrada negativa; outros kids seguem.
      jwksCache.set(jwk.kid, { key: null, fetchedAt });
    }
  }
}

async function getVerificationKey(kid: string, fetcher: NeonJwksFetcher): Promise<KeyObject | null> {
  const cached = jwksCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < cacheTtlMs(cached)) return cached.key;

  // kid desconhecido (rotação de chave da Neon) ou cache expirado → refresh.
  try {
    await refreshJwks(fetcher);
  } catch {
    return null;
  }
  return jwksCache.get(kid)?.key ?? null;
}

/**
 * Idempotência por event id (LRU em memória, 1000 entradas). Retorna true na
 * primeira vista, false nas seguintes (replay → a rota não reprocessa).
 * Memória por instância é best-effort: o bootstrap downstream é idempotente.
 */
function markEventSeen(eventId: string): boolean {
  if (seenEventIds.has(eventId)) {
    seenEventIds.delete(eventId);
    seenEventIds.set(eventId, Date.now());
    return false;
  }
  seenEventIds.set(eventId, Date.now());
  if (seenEventIds.size > SEEN_EVENTS_MAX) {
    const oldest = seenEventIds.keys().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }
  return true;
}

/** O envelope oficial usa snake_case (`email_verified`); aceita os dois. */
function extractUser(parsed: unknown): NeonWebhookUser | null {
  if (!parsed || typeof parsed !== "object") return null;
  const source = (parsed as Record<string, unknown>).user;
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  const email = typeof record.email === "string" ? record.email : undefined;
  const name = typeof record.name === "string" ? record.name : undefined;
  const emailVerifiedValue = record.email_verified ?? record.emailVerified;
  const emailVerified = typeof emailVerifiedValue === "boolean" ? emailVerifiedValue : undefined;
  return { id: record.id, ...(email !== undefined && { email }), ...(name !== undefined && { name }), ...(emailVerified !== undefined && { emailVerified }) };
}

function extractEventData(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object") return {};
  const eventData = (parsed as Record<string, unknown>).event_data;
  return eventData && typeof eventData === "object" && !Array.isArray(eventData)
    ? (eventData as Record<string, unknown>)
    : {};
}

/**
 * Verifica um webhook do Neon Auth. Retorna o evento parseado (com o flag
 * `duplicate` para reentregas) ou `null` (inválido). Nunca lança — falhas
 * são logadas e viram null.
 *
 * O `fetcher` é injetável para os testes fornecerem um JWKS de chave de teste;
 * em produção usa o `fetch` global.
 */
export async function verifyNeonAuthWebhook(
  rawBody: string,
  headers: Headers,
  fetcher: NeonJwksFetcher = globalThis.fetch,
): Promise<NeonWebhookEvent | null> {
  try {
    const signature = headers.get("x-neon-signature");
    const kid = headers.get("x-neon-signature-kid");
    const timestampHeader = headers.get("x-neon-timestamp");
    const eventType = headers.get("x-neon-event-type");
    const eventId = headers.get("x-neon-event-id");
    if (!signature || !kid || !timestampHeader || !eventType || !eventId) return null;

    // Frescor antes de qualquer trabalho cripto (replay de captura antiga).
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_TIMESTAMP_AGE_MS) return null;

    // JWS detached: `headerB64..signatureB64` (segmento do meio vazio).
    const parts = signature.split(".");
    if (parts.length !== 3 || parts[1] !== "") return null;
    const [headerB64, , signatureB64] = parts;

    const publicKey = await getVerificationKey(kid, fetcher);
    if (!publicKey) return null;

    const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
    const signaturePayload = `${timestampHeader}.${payloadB64}`;
    const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString("base64url");
    const signingInput = `${headerB64}.${signaturePayloadB64}`;

    const valid = verifyEd25519(null, Buffer.from(signingInput, "utf8"), publicKey, Buffer.from(signatureB64, "base64url"));
    if (!valid) return null;

    // Parse só depois da assinatura válida (não marcar replay de corpo inválido).
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const user = extractUser(parsed);
    if (!user) return null;

    // Idempotência por fim: só eventos íntegros e assinados entram no LRU —
    // um atacante sem a chave não consegue "queimar" um event id legítimo.
    // Reentrega (duplicate=true) continua sendo um evento VÁLIDO: a spec da
    // Neon manda devolver a MESMA resposta para duplicados, então `null`
    // fica reservado aos inválidos — a rota responde 200 sem reprocessar.
    const duplicate = !markEventSeen(eventId);

    return { eventId, eventType, user, eventData: extractEventData(parsed), duplicate };
  } catch (error) {
    console.error("neon_webhook_verify_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
