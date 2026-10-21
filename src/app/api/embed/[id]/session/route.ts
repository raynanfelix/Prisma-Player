import { NextResponse } from "next/server";

import { mintEmbedSessionToken, originHeaderDisagrees, verifyEmbedOriginToken, verifyEmbedRenderCookie } from "@/lib/security/embed-origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/api/request";
import { isValidViewerId } from "@/lib/player/viewer-id";
import { envInt } from "@/lib/config/env";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMBED_SESSION_RATE_LIMIT_MAX = envInt("EMBED_SESSION_RATE_LIMIT_MAX", 60);
const EMBED_SESSION_RATE_LIMIT_WINDOW_MS = envInt("EMBED_SESSION_RATE_LIMIT_WINDOW_MS", 60_000);

// O token é material de sessão assinado: nunca cacheia em camada nenhuma.
const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

/**
 * POST /api/embed/[id]/session - mint do token de sessão do DRM "Exigir Token
 * Assinado por Sessão".
 *
 * Mesmo pipeline de origem do endpoint dinâmico (RM-02): originToken assinado
 * amarrado a este id (ou ao escopo do teste A/B via `abTestId`), header
 * Origin/Referer coerente e prova de render pelo cookie `pp_embed`. O
 * sessionToken é camada ADICIONAL do toggle DRM - nunca substitui estas
 * checagens, que continuam obrigatórias aqui e na config.
 *
 * Rota de CRYPTO PURO, sem lookup de player/vídeo/acesso: um mint deve ser
 * barato e cold-start-proof. O `domainAllowed` fica de fora deliberadamente -
 * os domínios vivem no banco e o sessionToken não concede nada por si só: para
 * valer algo ele precisa passar de novo pela config dinâmica, que aplica
 * `domainAllowed` com o MESMO originToken desta requisição. Mintar aqui sem
 * checar domínio não abre bypass - só antecipa um token que será recusado lá.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "player_not_found" }, { status: 404, headers: NO_STORE });

  // Rate limit PRÓPRIO do mint: sem ele, um script com um render válido
  // geraria pares viewer/sessão assinados em rajada. 60/min por IP.
  const limited = await rateLimit(request, `embed-session:${id}`, { max: EMBED_SESSION_RATE_LIMIT_MAX, windowMs: EMBED_SESSION_RATE_LIMIT_WINDOW_MS });
  if (limited) return limited;

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
  if (!verifiedOrigin.nonce || !verifyEmbedRenderCookie(request.headers, verifiedOrigin.nonce)) return NextResponse.json({ error: "render_not_confirmed" }, { status: 403, headers: NO_STORE });

  const parsed = await readJsonBody<{ viewerId?: unknown; sessionId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const rawViewer = typeof parsed.body.viewerId === "string" ? parsed.body.viewerId : "";
  const rawSession = typeof parsed.body.sessionId === "string" ? parsed.body.sessionId : "";
  if (!isValidViewerId(rawViewer) || !uuid.test(rawSession)) return NextResponse.json({ error: "session_required" }, { status: 403, headers: NO_STORE });

  let sessionToken: string;
  try {
    sessionToken = mintEmbedSessionToken({ playerId: id, viewerId: rawViewer, sessionId: rawSession, nonce: verifiedOrigin.nonce });
  } catch {
    // Secret ausente: sem token mintado não há o que entregar. Nunca deixa a
    // rota "funcionar" sem assinatura.
    return NextResponse.json({ error: "session_token_unavailable" }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ sessionToken }, { headers: { ...NO_STORE, "x-robots-tag": "noindex, nofollow, noarchive" } });
}
