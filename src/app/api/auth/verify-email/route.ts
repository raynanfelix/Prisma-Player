import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { GENERIC_ERROR_MESSAGES } from "@/lib/errors";
import { csrfGuard } from "@/lib/security/csrf";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { isValidEmail } from "@/features/auth/lib/validation";

/**
 * Verificação de e-mail por CÓDIGO no signup (Neon Auth "Verify at Sign-up",
 * método códigos - funciona no SMTP compartilhado). Rota pré-sessão: sem
 * `guard()` (que exige sessão), mas com o mesmo `csrfGuard` de signup/login.
 *
 * Dois modos no mesmo POST:
 *  - { email, otp }         → getAuth().emailOtp.verifyEmail (auto-sign-in:
 *                             devolve sessão e o SDK grava os cookies)
 *  - { email, resend: true } → getAuth().sendVerificationEmail (reenvio do
 *                             código; resposta SEMPRE genérica { ok: true })
 */
const OTP_PATTERN = /^\d{6}$/;
const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const parsed = await readJsonBody<{ email?: unknown; otp?: unknown; resend?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400, headers: NO_STORE });

  // Balde por conta (hash - nunca persistir e-mail cru no store de rate limit):
  // 10 tentativas por 10 minutos, fail-closed. Cobre verify + resend.
  const limited = await rateLimit(request, "verify-email", {
    max: 10,
    windowMs: 10 * 60_000,
    failClosed: true,
    identifier: `e:${hashRateLimitIdentifier(email)}`,
  });
  if (limited) return limited;

  if (body?.resend === true) {
    const origin = new URL(request.url).origin;
    const { error } = await getAuth().sendVerificationEmail({ email, callbackURL: origin });
    if (error) {
      // Log interno, resposta genérica: não vaza existência de conta (o
      // Managed responde erro para e-mail sem cadastro).
      console.warn("verify_email_resend_failed", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (!OTP_PATTERN.test(otp)) {
    return NextResponse.json({ error: "invalid_otp_format", message: "Digite os 6 dígitos do código." }, { status: 400, headers: NO_STORE });
  }

  const { data, error } = await getAuth().emailOtp.verifyEmail({ email, otp });
  if (error) {
    const message = getAuthErrorMessage(error, GENERIC_ERROR_MESSAGES.otpInvalidOrExpired);
    return NextResponse.json({ error: "verify_failed", message }, { status: 400, headers: NO_STORE });
  }

  // Auto-sign-in (default do plugin): devolve session/token e o SDK já gravou
  // os cookies de sessão na resposta - mesmo mecanismo do /api/auth/login.
  const session = (data ?? null) as { session?: unknown; token?: unknown } | null;
  const hasSession = Boolean(session?.session ?? session?.token);
  return NextResponse.json(
    hasSession ? { verified: true, hasSession: true } : { verified: true },
    { headers: NO_STORE },
  );
}
