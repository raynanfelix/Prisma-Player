import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { NEON_AUTH_SESSION_COOKIE_NAME } from "@neondatabase/auth/server";
import { getAuth } from "./server";

/**
 * Refresh/proteção de sessão no proxy (Next 16).
 *
 * Decisões de projeto:
 *
 * - A proteção é aplicada explicitamente aos prefixes privados. O middleware
 *   do Neon Auth protege TODA rota fora do seu skip-list, então delegar com
 *   matcher global redirecionaria visitantes de páginas públicas (preços,
 *   embeds, marketing) para o login. Aqui o matcher continua global (o proxy
 *   também faz CSP/nonce/cookie de embed) e a decisão fica nesta função.
 * - O refresh do token acontece dentro do `auth.middleware` do Neon (valida
 *   via cache de cookie assinado ou upstream) nas rotas protegidas - exatamente
 *   onde a sessão é necessária. Rotas públicas validam na hora do uso via
 *   `auth.getSession()` (RSC/route handlers).
 * - O redirecionamento de login recebe `?next=` de volta (deep-link), o que o
 *   middleware padrão do SDK não faz.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/studio", "/admin"] as const;
const AUTH_ROUTES = ["/login", "/signup"] as const;
const LOGGED_IN_REDIRECT = "/dashboard/videos";
const LOGIN_PATH = "/login";

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Adiciona `?next=` ao redirecionamento de login mantendo os cookies do SDK. */
function withNextParam(response: NextResponse, request: NextRequest): NextResponse {
  const location = response.headers.get("location");
  if (!location) return response;
  try {
    const url = new URL(location, request.nextUrl.origin);
    if (url.origin !== request.nextUrl.origin || url.pathname !== LOGIN_PATH) return response;
    if (url.searchParams.has("next")) return response;
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    const headers = new Headers(response.headers);
    headers.set("location", url.toString());
    return new NextResponse(null, { status: response.status, headers });
  } catch {
    return response;
  }
}

export async function updateSession(request: NextRequest, requestHeaders?: Headers): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isProtectedRoute(pathname)) {
    // M10 (auditoria de segurança): o middleware do SDK reconstrói os headers
    // a partir do request que recebe (`new Headers(request.headers)` no adapter
    // Next do SDK) e devolve `NextResponse.next({ request: { headers } })` com
    // o que reconstruiu. Chamado com a request ORIGINAL, ele descarta o
    // `x-nonce` e o CSP que o proxy já tinha setado na cópia `requestHeaders`,
    // e o ThemeScript (dark mode) nasce sem nonce em /dashboard, /studio e
    // /admin - bloqueado pelo CSP da resposta.
    //
    // Repassamos um clone SEM body carregando os headers já preparados pelo
    // proxy: o SDK só lê url/headers/cookies (processAuthMiddleware), então o
    // clone é equivalente para a decisão de sessão e a resposta "allow" volta
    // a propagar o nonce adiante. Redirecionamentos continuam saindo da
    // request original (withNextParam usa a URL real).
    const headers = requestHeaders ?? request.headers;
    const requestForSdk = new NextRequest(request.url, { headers });
    const response = await getAuth().middleware({ loginUrl: LOGIN_PATH })(requestForSdk);
    if (response.status >= 300 && response.status < 400) return withNextParam(response, request);
    return response;
  }

  // Usuário autenticado em página de auth sai para o app. Presença do cookie de
  // sessão (cookie assinado pelo proxy); a validação real acontece na rota
  // protegida - um token expirado converge em no máximo um redirecionamento.
  if ((AUTH_ROUTES as readonly string[]).includes(pathname) && request.cookies.get(NEON_AUTH_SESSION_COOKIE_NAME)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = LOGGED_IN_REDIRECT;
    url.search = "";
    return NextResponse.redirect(url);
  }

  const nextInit = requestHeaders === undefined ? { request } : { request: { headers: requestHeaders } };
  return NextResponse.next(nextInit);
}
