import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { safeLog } from "@/lib/utils/log";
import { SECURITY } from "@/lib/constants";
import { buildConfiguredSelfOrigins } from "@/lib/security/self-origins";

const TOKEN_VERSION = "v1";
const DEFAULT_MAX_AGE_SECONDS = 10 * 60;

export function normalizeHost(value: string | null | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

export function trustedEmbedHostFromHeaders(headers: Pick<Headers, "get">): string {
  return normalizeHost(headers.get("referer") || headers.get("origin") || "");
}

export function domainAllowed(host: string, domains: string[]): boolean {
  if (domains.length === 0) return true;
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;

  return domains.some((domain) => {
    const normalizedDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    const clean = normalizedDomain.replace(/^\*\./, "");
    return normalizedHost === clean || (normalizedDomain.startsWith("*.") && normalizedHost.endsWith(`.${clean}`));
  });
}

function embedSecret(): string {
  const value = process.env.EMBED_ORIGIN_SECRET?.trim();
  if (!value) {
    throw new Error("EMBED_ORIGIN_SECRET is not configured. Set this environment variable to a random secret string, independent of the auth cookies secret.");
  }
  return value;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  const key = embedSecret();
  return createHmac("sha256", key).update(value).digest("base64url");
}

/**
 * Origens próprias da plataforma (mesmo critério do `csrf.ts`, fonte única em
 * self-origins.ts). Usadas apenas para ISENTAR o header de Origin/Referer self
 * quando conferimos o host reivindicado por um token — nunca como autoridade
 * de domínio para embeds.
 */
const SELF_ORIGINS = buildConfiguredSelfOrigins();

export function isSelfOrigin(value: string): boolean {
  if (!value) return false;
  try {
    return SELF_ORIGINS.has(new URL(value).origin);
  } catch {
    return false;
  }
}

/**
 * Controle no consumo de tokens (RM-02). Quando um header `Origin`/`Referer`
 * ESTÁ presente e não é uma origem própria da plataforma, ele precisa
 * concordar com o host reivindicado pelo token. Um cliente que obteve um token
 * mintado para o host A e depois bate na API com Origin de B é rejeitado.
 */
export function originHeaderDisagrees(
  headers: Pick<Headers, "get">,
  tokenHost: string,
  requestSelfOrigin = "",
): boolean {
  const claimed = headers.get("origin") || headers.get("referer");
  if (!claimed) return false;
  const claimedHost = normalizeHost(claimed);
  if (!claimedHost) return false;
  if (isSelfOrigin(claimed) || (requestSelfOrigin && normalizeHost(requestSelfOrigin) === claimedHost)) return false;
  return claimedHost !== normalizeHost(tokenHost);
}

export function createEmbedOriginToken(input: { playerId: string; host: string; maxAgeSeconds?: number; nonce?: string; abTestId?: string }): string {
  const host = normalizeHost(input.host);
  if (!host) return "";

  const payload = base64url(JSON.stringify({
    v: TOKEN_VERSION,
    playerId: input.playerId,
    host,
    ...(input.nonce ? { nonce: input.nonce } : {}),
    // Embed A/B: o token é mintado no escopo do TESTE (playerId = testId) e
    // carrega o claim redundante que autoriza o consumo via caminho de teste.
    ...(input.abTestId ? { abTest: input.abTestId } : {}),
    exp: Math.floor(Date.now() / 1000) + (input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS),
  }));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Creates the short-lived origin token used by the embed without allowing a
 * missing production secret to crash the whole iframe during server render.
 *
 * Returning an empty token does not bypass domain protection: the embed API
 * rejects protected players when the token cannot be verified.
 */
export function createEmbedOriginTokenSafely(input: { playerId: string; host: string; maxAgeSeconds?: number; nonce?: string; abTestId?: string }): string {
  try {
    return createEmbedOriginToken(input);
  } catch (error) {
    safeLog("embed_origin_token_unavailable", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return "";
  }
}

const EVENT_TOKEN_KIND = "evt";
const EVENT_TOKEN_MAX_AGE_SECONDS = 6 * 60 * 60;

/**
 * Binds telemetry to a real embed load. Without it, anyone who knows the public
 * video UUID can forge plays and conversions — including for players whose
 * allowed_domains they were never able to satisfy.
 *
 * The TTL covers a long VSL session; the token carries no secret of its own and
 * is scoped to a single video.
 *
 * Mantido apenas para compatibilidade com chamadores existentes (e testes).
 * Toda emissão nova deve usar createBoundEmbedEventToken, que amarra o token
 * ao contexto de emissão (host + sessão + nonce do render).
 */
export function createEmbedEventToken(videoId: string, maxAgeSeconds = EVENT_TOKEN_MAX_AGE_SECONDS): string {
  const payload = base64url(JSON.stringify({
    v: TOKEN_VERSION,
    k: EVENT_TOKEN_KIND,
    videoId,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }));
  return `${payload}.${sign(payload)}`;
}

export function createEmbedEventTokenSafely(videoId: string): string {
  try {
    return createEmbedEventToken(videoId);
  } catch (error) {
    safeLog("embed_event_token_unavailable", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return "";
  }
}

export interface BoundEmbedEventTokenInput {
  videoId: string;
  host: string;
  sessionId?: string;
  nonce?: string;
  maxAgeSeconds?: number;
}

/**
 * Event token amarrado ao contexto de emissão (RM-03): carrega o host do embed
 * autorizado e, quando conhecido, a sessão do viewer e o nonce do render. O
 * endpoint que consome o token passa o que ele espera ver; qualquer divergência
 * (sessão trocada, host forjado, token usado fora do render) rejeita a chamada.
 */
export function createBoundEmbedEventToken(input: BoundEmbedEventTokenInput, maxAgeSeconds = EVENT_TOKEN_MAX_AGE_SECONDS): string {
  const payload = base64url(JSON.stringify({
    v: TOKEN_VERSION,
    k: EVENT_TOKEN_KIND,
    videoId: input.videoId,
    host: normalizeHost(input.host),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.nonce ? { nonce: input.nonce } : {}),
    exp: Math.floor(Date.now() / 1000) + (input.maxAgeSeconds ?? maxAgeSeconds),
  }));
  return `${payload}.${sign(payload)}`;
}

export function createBoundEmbedEventTokenSafely(input: Omit<BoundEmbedEventTokenInput, "maxAgeSeconds">): string {
  try {
    return createBoundEmbedEventToken(input);
  } catch (error) {
    safeLog("embed_event_token_unavailable", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return "";
  }
}

export function verifyEmbedEventToken(token: string | null | undefined, videoId: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = Buffer.from(signature, "base64url");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return false;

  try {
    const parsed = JSON.parse(fromBase64url(payload)) as { v?: string; k?: string; videoId?: string; exp?: number };
    if (parsed.v !== TOKEN_VERSION || parsed.k !== EVENT_TOKEN_KIND || parsed.videoId !== videoId) return false;
    return Boolean(parsed.exp && parsed.exp >= Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

export type VerifiedEmbedEventContext = {
  host: string;
  sessionId?: string;
  nonce?: string;
};

/**
 * Verifica a assinatura, a expiração e as reivindicações obrigatórias do token
 * de evento. `expected` informa o que o chamador exige:
 * - `videoId`: sempre exigido (o token é escopado a um vídeo).
 * - `sessionId`: quando informado, o token precisa carregar EXATAMENTE esta
 *   sessão (evento com sessionId trocado é rejeitado).
 * - `host` / `nonce`: options claims — quando informados, precisam casar.
 * Devolve o contexto decodificado (host/sessionId/nonce) para o chamador usar
 * nas checagens de origem e de render.
 */
export function verifyEmbedEventTokenContext(
  token: string | null | undefined,
  expected: { videoId: string; sessionId?: string; host?: string; nonce?: string },
): VerifiedEmbedEventContext | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return null;
  }
  if (!expectedSignature) return null;

  const expectedBuffer = Buffer.from(expectedSignature, "base64url");
  const actualBuffer = Buffer.from(signature, "base64url");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const parsed = JSON.parse(fromBase64url(payload)) as { v?: string; k?: string; videoId?: string; host?: string; sessionId?: string; nonce?: string; exp?: number };
    if (parsed.v !== TOKEN_VERSION || parsed.k !== EVENT_TOKEN_KIND || parsed.videoId !== expected.videoId) return null;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    const host = parsed.host ? normalizeHost(parsed.host) : "";
    if (!host) return null;
    if (expected.host !== undefined && host !== normalizeHost(expected.host)) return null;
    if (expected.sessionId !== undefined && parsed.sessionId !== expected.sessionId) return null;
    if (expected.nonce !== undefined && parsed.nonce !== expected.nonce) return null;

    const context: VerifiedEmbedEventContext = { host };
    if (parsed.sessionId) context.sessionId = parsed.sessionId;
    if (parsed.nonce) context.nonce = parsed.nonce;
    return context;
  } catch {
    return null;
  }
}

export function verifyEmbedOriginToken(token: string | null | undefined, playerId: string, options?: { abTestPath?: string }): { host: string; nonce?: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (!expected) return null;

  const expectedBuffer = Buffer.from(expected, "base64url");
  const actualBuffer = Buffer.from(signature, "base64url");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const parsed = JSON.parse(fromBase64url(payload)) as { v?: string; playerId?: string; host?: string; nonce?: string; abTest?: string; exp?: number };
    // Sem curinga: um token só vale para o player (ou escopo) em que foi
    // mintado. O `*` antigo deixava o token do embed A/B verificar contra
    // QUALQUER playerId da plataforma.
    if (parsed.v !== TOKEN_VERSION || parsed.playerId !== playerId || !parsed.host) return null;
    // Claim de teste é simétrico: token de teste só passa pelo caminho de teste
    // (`abTestPath` igual ao claim) e o caminho de teste nunca aceita token de
    // player puro. Sem as duas partes, token de teste volta a valer como player.
    if ((parsed.abTest ?? "") !== (options?.abTestPath ?? "")) return null;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    const result: { host: string; nonce?: string } = { host: normalizeHost(parsed.host) };
    if (parsed.nonce) result.nonce = parsed.nonce;
    return result;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* DRM "Exigir Token Assinado por Sessão" — token de sessão assinado    */
/* ------------------------------------------------------------------ */

// Versão do formato do token (segmento literal na frente do payload).
const EMBED_SESSION_TOKEN_VERSION = "v1";
// TTL curto: o token de sessão cobre o boot do player, não a visita inteira.
const EMBED_SESSION_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export interface EmbedSessionTokenClaims {
  playerId: string;
  viewerId: string;
  sessionId: string;
  nonce: string;
}

/**
 * Mint do token de sessão do DRM "Exigir Token Assinado por Sessão".
 *
 * Formato: `v1.<base64url payload>.<hmac>` com payload `{pid, vid, sid, n, exp}`
 * (exp em epoch millis, Date.now()+15min). A assinatura é o mesmo HMAC-SHA256
 * da família (EMBED_ORIGIN_SECRET), então quem tem o token tem uma declaração
 * do SERVIDOR de que aquela tríade player/viewer/sessão passou pelo pipeline
 * de origem+render num render específico (nonce). UUIDs inventados no cliente
 * nunca reproduzem a assinatura — é isso que mata o bypass do review MEDIUM.
 */
export function mintEmbedSessionToken(input: EmbedSessionTokenClaims): string {
  const payload = base64url(JSON.stringify({
    pid: input.playerId,
    vid: input.viewerId,
    sid: input.sessionId,
    n: input.nonce,
    exp: Date.now() + EMBED_SESSION_TOKEN_MAX_AGE_MS,
  }));
  return `${EMBED_SESSION_TOKEN_VERSION}.${payload}.${sign(payload)}`;
}

/**
 * Verifica o token de sessão contra os claims exigidos pelo chamador: TODOS
 * precisam bater (playerId, viewerId, sessionId, nonce do render) e o token
 * não pode estar expirado. Assinatura em comparação timing-safe (mesmo
 * padrão de verifyEmbedOriginToken); claims são valores que o próprio
 * chamador conhece e fornece — nada a vazar por timing.
 */
export function verifyEmbedSessionToken(token: string | null | undefined, expected: EmbedSessionTokenClaims): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== EMBED_SESSION_TOKEN_VERSION) return false;
  const [, payload, signature] = parts;
  if (!payload || !signature) return false;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payload);
  } catch {
    return false;
  }
  if (!expectedSignature) return false;

  const expectedBuffer = Buffer.from(expectedSignature, "base64url");
  const actualBuffer = Buffer.from(signature, "base64url");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return false;

  try {
    const parsed = JSON.parse(fromBase64url(payload)) as { pid?: string; vid?: string; sid?: string; n?: string; exp?: number };
    if (!parsed.exp || parsed.exp < Date.now()) return false;
    return parsed.pid === expected.playerId
      && parsed.vid === expected.viewerId
      && parsed.sid === expected.sessionId
      && parsed.n === expected.nonce;
  } catch {
    return false;
  }
}

/**
 * Lê o cookie de render do embed (`pp_embed`) enviado na requisição.
 * O cookie é setado pelo proxy no response da página /embed e só quem de fato
 * carregou a página no navegador o possui.
 */
export function readEmbedRenderCookie(headers: Pick<Headers, "get">): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    if (name === SECURITY.EMBED_RENDER_COOKIE) return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * Confirma que a requisição veio de um render real: o nonce vinculado ao token
 * precisa ser igual ao valor do cookie `pp_embed`. Comparação timing-safe.
 */
export function verifyEmbedRenderCookie(headers: Pick<Headers, "get">, nonce: string): boolean {
  const value = readEmbedRenderCookie(headers);
  if (!value || !nonce) return false;
  const expectedBuffer = Buffer.from(value);
  const actualBuffer = Buffer.from(nonce);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}