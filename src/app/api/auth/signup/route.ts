import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { csrfGuard } from "@/lib/security/csrf";
import { recordAuthFailure } from "@/lib/security/auth-events";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { ensureAccountBootstrap } from "@/lib/access/bootstrap";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-signup", { max: 5, windowMs: 15 * 60_000, failClosed: true });
  if (limited) return limited;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const parsed = await readJsonBody<{ name?: unknown; email?: unknown; password?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !email || !password) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const accountLimited = await rateLimit(request, "auth-signup-account", {
    max: 3, windowMs: 60 * 60_000, failClosed: true, identifier: hashRateLimitIdentifier(email),
  });
  if (accountLimited) return accountLimited;

  const { data, error } = await getAuth().signUp.email({
    email,
    password,
    name,
    callbackURL: `${siteUrl}/auth/callback?next=/welcome`,
  });
  if (error) {
    await recordAuthFailure("signup_failed", email, request);
    const message = getAuthErrorMessage(error, "Não foi possível criar a conta. Tente novamente.");
    return NextResponse.json({ error: "signup_failed", message }, { status: 400 });
  }

  // Bootstrap das linhas de produto (profiles, access/trial, wallet, inbox,
  // equipe) - equivalente aplicacional do trigger legado on_auth_user_created
  // do Supabase: o schema neon_auth é gerenciado pela Neon e não aceita
  // triggers. Best-effort: nunca derruba o signup (só o Auth era crítico no
  // contrato do trigger); leitores (guard/perfil/Nav) fazem self-heal.
  if (data?.user) {
    await ensureAccountBootstrap({ id: data.user.id, email, name }).catch((reason) => {
      console.error("signup_bootstrap_failed", {
        userId: data?.user?.id,
        reason: reason instanceof Error ? reason.message : "unknown",
      });
    });
  }
  // Não expor access_token, refresh_token ou objeto session completo no response
  // (contrato { user, hasSession } - teste tests/auth-signup-shape.test.ts).
  // `hasSession` reflete se o Managed emitiu sessão imediata (null quando a
  // verificação de e-mail está habilitada no branch).
  // `emailVerificationRequired`: "Verify at Sign-up" ligado → usuário criado
  // com emailVerified=false e sem sessão - a UI troca para o form de código.
  return NextResponse.json({
    user: data?.user
      ? { id: data.user.id, email: data.user.email, name: data.user.name, emailVerified: data.user.emailVerified }
      : null,
    hasSession: Boolean(data?.token),
    emailVerificationRequired: Boolean(data?.user && !data.user.emailVerified),
  });
}
