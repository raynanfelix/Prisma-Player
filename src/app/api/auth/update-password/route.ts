import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-update-password", { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  // Fluxo Neon Auth: o link do e-mail de reset chega em /reset-password?token=...
  // e a UI envia { password, token }. Sem token só há caminho quando existe
  // sessão ativa (troca de senha sem senha atual - caso raro de aba legada).
  const parsed = await readJsonBody<{ password?: unknown; token?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const password = typeof body?.password === "string" ? body.password : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  if (token) {
    const { error } = await getAuth().resetPassword({ newPassword: password, token });
    if (error) return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
    // A revogação de outras sessões no reset depende de
    // emailAndPassword.revokeSessionsOnPasswordReset no Managed (não
    // configurável pelo app) - pendência documentada em
    // docs/neon-migration/neon-auth-setup.md.
    return NextResponse.json({ ok: true });
  }

  const { data } = await getAuth().getSession();
  if (!data?.user) return NextResponse.json({ error: "reset_token_required" }, { status: 400 });
  // changePassword valida a senha atual no Managed; sem currentPassword válida
  // ele rejeita (INVALID_PASSWORD) - a UI deve seguir o fluxo do token.
  const { error } = await getAuth().changePassword({ newPassword: password, currentPassword: "", revokeOtherSessions: true });
  if (error) return NextResponse.json({ error: "password_update_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
