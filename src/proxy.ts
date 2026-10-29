import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/server";
import { SECURITY } from "@/lib/constants";

const SCRIPT_SRC_EXTRA = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

function contentSecurityPolicy(frameAncestors: string, nonce: string, isLoginPage = false) {
  // Turnstile requires 'unsafe-eval' even in production for its challenge script,
  // plus data:/blob: in connect-src for Web Worker communication. These are only
  // added on /login to avoid weakening CSP globally.
  const turnstileScriptExtra = isLoginPage ? " 'unsafe-eval'" : "";
  const scriptSrc = `'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://challenges.cloudflare.com${SCRIPT_SRC_EXTRA}${turnstileScriptExtra}`;
  const connectSrc = isLoginPage
    ? "'self' blob: data: https://*.r2.cloudflarestorage.com https://challenges.cloudflare.com https://*.cloudflarecaptcha.com https://*.dnstest.challenges.cloudflare.com https://dnstest.dev"
    : "'self' blob: https://*.r2.cloudflarestorage.com https://challenges.cloudflare.com";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https://challenges.cloudflare.com https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "frame-src https://challenges.cloudflare.com",
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

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const frameAncestors = request.nextUrl.pathname.startsWith("/embed") ? "*" : "'self'";
  const isLoginPage = request.nextUrl.pathname === "/login";
  const csp = contentSecurityPolicy(frameAncestors, nonce, isLoginPage);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);

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