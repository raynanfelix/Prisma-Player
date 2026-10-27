import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";
import { csrfGuard } from "@/lib/security/csrf";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const limited = await rateLimit(request, "auth-reset", { max: 3, windowMs: 15 * 60_000, failClosed: true });
  if (limited) return limited;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const parsed = await readJsonBody<{ email?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const accountLimited = await rateLimit(request, "auth-reset-account", {
    max: 3, windowMs: 60 * 60_000, failClosed: true, identifier: hashRateLimitIdentifier(email),
  });
  if (accountLimited) return accountLimited;

  // O Managed Better Auth envia o e-mail de reset (SMTP compartilhado no dev).
  // O link aponta para /reset-password?token=... - não há troca de código por
  // sessão; o token é entregue a /api/auth/update-password.
  const { error } = await getAuth().requestPasswordReset({
    email,
    redirectTo: `${siteUrl}/reset-password`,
  });
  if (error) {
    const message = getAuthErrorMessage(error, GENERIC_ERROR_MESSAGES.sendEmail);
    return NextResponse.json({ error: "reset_failed", message }, { status: 400 });
  }
  // Anti-enumeracao: para e-mail inexistente o Managed responde sucesso;
  // a resposta ao cliente é sempre { ok: true }.
  return NextResponse.json({ ok: true });
}
