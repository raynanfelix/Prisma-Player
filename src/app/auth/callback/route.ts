import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const token = url.searchParams.get("token");
  const requestedNext = url.searchParams.get("next") ?? "/dashboard/videos";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard/videos";

  // Neon Auth (Managed Better Auth): links de verificação/reset de e-mail não
  // passam por aqui - o reset chega direto em /reset-password?token=... e o
  // callback de OAuth é proxyado pelo catch-all /api/auth/callback/*.
  // Esta rota permanece para compatibilidade de links antigos: repassa o token
  // (quando presente) e mantém o destino saneado.
  if (token) {
    const target = new URL(next, url.origin);
    target.searchParams.set("token", token);
    return NextResponse.redirect(target);
  }
  if (code) {
    // ?code= não tem exchange associado neste fluxo: o OAuth é tratado pelo
    // catch-all /api/auth/callback/* e links com ?code= órfão voltam ao login.
    return NextResponse.redirect(new URL("/login?error=auth_callback", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
