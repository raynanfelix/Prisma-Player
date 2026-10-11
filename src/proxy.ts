import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { SECURITY } from "@/lib/constants";

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
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const frameAncestors = request.nextUrl.pathname.startsWith("/embed") ? "*" : "'self'";
  const csp = contentSecurityPolicy(frameAncestors, nonce);

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