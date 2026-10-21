import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/server";
import { SECURITY } from "@/lib/constants";
import { markdownRouteUrl, negotiateMarkdown, shouldAppendVaryAccept } from "@/lib/markdown/negotiate";

const SCRIPT_SRC_EXTRA = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

function contentSecurityPolicy(frameAncestors: string, nonce: string) {
  const scriptSrc = `'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${SCRIPT_SRC_EXTRA}`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://*.posthog.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https://*.posthog.com",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: https://*.r2.cloudflarestorage.com https://*.i.posthog.com https://*.posthog.com",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Login social em 1 clique: o fluxo OAuth da Neon devolve o app com
  // ?neon_auth_session_verifier=... e a TROCA por cookies de sessão acontece
  // no middleware do SDK (exchangeOAuthToken -> redirect com Set-Cookie).
  // Sem isso o 1º clique caía na raiz anônimo (o challenge cookie só
  // resolvia na 2ª tentativa). Invocamos o middleware da Neon SÓ quando o
  // verifier está na URL - o resto do proxy (CSP/nonce/embed) segue igual,
  // e o redirect_login dela nunca dispara fora desse caso.
  if (new URL(request.url).searchParams.has("neon_auth_session_verifier")) {
    try {
      return await getAuth().middleware({ loginUrl: "/login" })(request);
    } catch {
      // Neon Auth não configurado (build/dev sem env): segue o fluxo normal.
    }
  }

  // Item 1 "Is Agentic" (Ora): negociação de conteúdo Markdown para agentes
  // de IA. ADITIVO: sem `Accept: text/markdown` nada acontece além de um
  // lookup puro (string) - o fluxo HTML/RSC anterior segue byte a byte. A
  // decisão vive em src/lib/markdown/negotiate.ts (puro e testável) e o
  // rewrite sai ANTES do CSP/nonce de propósito: a resposta Markdown vem do
  // route handler /api/markdown (text/markdown sem script), que não consome
  // nonce nem sessão, e agentes não carregam cookies de sessão.
  const markdownDecision = negotiateMarkdown({
    method: request.method,
    accept: request.headers.get("accept"),
    pathname: request.nextUrl.pathname,
  });
  if (markdownDecision.kind === "markdown-page" || markdownDecision.kind === "markdown-404") {
    return NextResponse.rewrite(
      new URL(markdownRouteUrl(markdownDecision.kind, markdownDecision.path), request.url),
    );
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const frameAncestors = request.nextUrl.pathname.startsWith("/embed") ? "*" : "'self'";
  const csp = contentSecurityPolicy(frameAncestors, nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);

  // Item 1 "Is Agentic" (Ora): toda resposta de navegação de página declara
  // `Vary: Accept` APPENDADO ao valor existente (nunca sobrescrever o Vary do
  // Next: "rsc, next-router-state-tree, next-router-prefetch, ..."), para que
  // caches não sirvam HTML a um agente que pediu text/markdown - e
  // vice-versa. Assets (caminhos com extensão) e respostas de route handlers
  // (/api, /auth, /ingest, /player-loader, /opengraph-image) ficam de fora.
  if (shouldAppendVaryAccept({ method: request.method, pathname: request.nextUrl.pathname })) {
    response.headers.append("vary", "Accept");
  }

  // RM-02: o token de origem do embed só é útil para quem realmente carregou a
  // página no navegador. Este cookie (HttpOnly, curto) guarda o nonce desta
  // renderização única; o consumo (/api/embed, analytics) exige que o nonce do
  // token bata com o valor do cookie. Um cliente que apenas lê o RSC payload
  // não leva o cookie junto e não consegue usar o token.
  if (request.nextUrl.pathname.startsWith("/embed")) {
    const isProduction = process.env.NODE_ENV === "production";
    response.cookies.set(SECURITY.EMBED_RENDER_COOKIE, nonce, {
      httpOnly: true,
      secure: isProduction,
      // Cross-site (iframe embutido no domínio do cliente) exige SameSite=None.
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: SECURITY.EMBED_RENDER_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};