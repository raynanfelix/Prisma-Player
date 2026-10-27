import { NextResponse } from "next/server";

import { domainAllowed, mintEmbedSessionToken, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { isRealBrowserUserAgent } from "@/lib/security/browser-ua";
import { localRateLimit } from "@/lib/security/rate-limit-local";
import { findPublishedPlayerConfigCached } from "@/lib/player/embed-config";
import { readJsonBody } from "@/lib/api/request";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { safeLog } from "@/lib/utils/log";
import { envInt } from "@/lib/config/env";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// C1: mint por IP apertado de 60 para 10/min - um script com um render
// válido não gera pares viewer/sessão assinados em rajada.
const EMBED_SESSION_RATE_LIMIT_MAX = envInt("EMBED_SESSION_RATE_LIMIT_MAX", 10);
const EMBED_SESSION_RATE_LIMIT_WINDOW_MS = envInt("EMBED_SESSION_RATE_LIMIT_WINDOW_MS", 60_000);

// O token é material de sessão assinado: nunca cacheia em camada nenhuma.
const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * POST /api/embed/[id]/session - mint do token de sessão.
 *
 * Mesmo pipeline de origem do endpoint dinâmico (RM-02): originToken assinado
 * amarrado a este id (ou ao escopo do teste A/B via `abTestId`), header
 * Origin/Referer coerente e prova de render pelo cookie `pp_embed`.
 *
 * Endurecimento C1 (o sessionToken virou a porta da mídia):
 * - UA de navegador real é obrigatório (curl/wget/python não mintam);
 * - header Origin/Referer PRESENTE é obrigatório (cliente HTTP puro não minta);
 * - quando o player restringe domínios, o host do token precisa estar na
 *   allowlist ANTES do mint (o lookup lê o banco; falha de lookup não trava
 *   o mint, que continua sem conceder nada sozinho);
 * - o host é assinado DENTRO do token (claim `h`): config e stream re-verify.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  // P0-1: escopo público de embed usa o limitador por instância (memória).
  const limited = await localRateLimit(request, `embed-session:${id}`, { max: EMBED_SESSION_RATE_LIMIT_MAX, windowMs: EMBED_SESSION_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

  // Anti-script na porta: sem UA de navegador não há mint.
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!isRealBrowserUserAgent(userAgent)) {
    safeLog("embed_session_blocked_ua", { playerId: id, userAgent: userAgent.slice(0, 120) });
    return NextResponse.json({ error: "browser_required" }, { status: 403, headers: NO_STORE });
  }

  const requestUrl = new URL(request.url);
  const originToken = requestUrl.searchParams.get("originToken");
  // RM-04: no embed A/B o token chega mintado no escopo do TESTE (playerId =
  // testId + claim `abTest`), nunca pelo id da variante.
  const abTestIdParam = requestUrl.searchParams.get("abTestId");
  const abTestId = abTestIdParam && uuid.test(abTestIdParam) ? abTestIdParam : "";
  const verifiedOrigin = verifyEmbedOriginToken(originToken, id)
    || (abTestId ? verifyEmbedOriginToken(originToken, abTestId, { abTestPath: abTestId }) : null);
  if (!verifiedOrigin) return NextResponse.json({ error: "invalid_origin_token" }, { status: 403, headers: NO_STORE });
  if (originHeaderDisagrees(request.headers, verifiedOrigin.host, requestUrl.origin)) return NextResponse.json({ error: "origin_mismatch" }, { status: 403, headers: NO_STORE });
  // Origin binding real: o mint exige header Origin/Referer PRESENTE (o
  // iframe same-origin sempre envia Origin em POST; curl puro não envia).
  if (!request.headers.get("origin") && !request.headers.get("referer")) {
    return NextResponse.json({ error: "origin_required" }, { status: 403, headers: NO_STORE });
  }
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403, headers: NO_STORE });

  // allowedDomains do config publicado (quando o vídeo restringe domínios,
  // o host do token precisa estar na allowlist já no mint). Fail-open
  // documentado: falha de lookup não trava o mint (o sessionToken não
  // concede nada por si só; config e stream revalidam domínio com o MESMO
  // originToken). P1-4: lookup compartilhado com cache de 10s (dedup D3).
  let row: { allowedDomains: string[] } | null = null;
  try {
    row = await findPublishedPlayerConfigCached(id);
  } catch {
    row = null;
  }
  const domains = Array.isArray(row?.allowedDomains) ? row!.allowedDomains.map((domain: string) => domain.trim()).filter(Boolean) : [];
  if (domains.length > 0 && !domainAllowed(verifiedOrigin.host, domains)) {
    return NextResponse.json({ error: "domain_not_allowed" }, { status: 403, headers: NO_STORE });
  }

  const parsed = await readJsonBody<{ viewerId?: unknown; sessionId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const rawViewer = typeof parsed.body.viewerId === "string" ? parsed.body.viewerId : "";
  const rawSession = typeof parsed.body.sessionId === "string" ? parsed.body.sessionId : "";
  if (!isValidViewerId(rawViewer) || !uuid.test(rawSession)) return NextResponse.json({ error: "session_required" }, { status: 403, headers: NO_STORE });

  let sessionToken: string;
  try {
    sessionToken = mintEmbedSessionToken({ playerId: id, viewerId: rawViewer, sessionId: rawSession, nonce: verifiedOrigin.nonce, host: verifiedOrigin.host });
  } catch {
    // Secret ausente: sem token mintado não há o que entregar. Nunca deixa a
    // rota "funcionar" sem assinatura.
    return NextResponse.json({ error: "session_token_unavailable" }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ sessionToken }, { headers: { ...NO_STORE, "x-robots-tag": "noindex, nofollow, noarchive" } });
}
