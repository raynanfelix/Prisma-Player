import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { csrfGuard } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/auth-events";

/**
 * Troca de senha com OTP (step-up por e-mail) no Managed Neon Auth.
 *
 * Dois estágios no mesmo recurso:
 *  - POST  { stage: "request" }          → envia o código:
 *      emailOtp.sendVerificationOtp({ email, type: "email-verification" })
 *    (o e-mail vem da sessão; balde apertado porque dispara e-mail real)
 *
 *  - PATCH { currentPassword, password, otp } → valida o OTP com
 *      signIn.emailOtp({ email, otp }) - a identidade fica confirmada - e só
 *    então chama changePassword, que valida a senha atual atomicamente com a
 *    troca (revokeOtherSessions preserva a sessão atual).
 *
 * Nota de projeto: NÃO usamos emailOtp.verifyEmail (marcaria emailVerified=
 * true, semântica errada para challenge de senha). O Managed não expõe um
 * endpoint somente-leitura de verificação de senha, então a ordem efetiva é
 * [OTP → changePassword]: a troca só acontece com os DOIS fatores válidos, e
 * senha atual errada aborta (403) sem alterar nada.
 */
const OTP_PATTERN = /^\d{6}$/;
const NO_STORE = { "cache-control": "no-store" } as const;

/** Sessão atual com id + e-mail (o e-mail do usuário autenticado é o alvo do OTP). */
async function getSessionContext(): Promise<{ userId: string; email: string } | null> {
  const { data } = await getAuth().getSession();
  const user = (data?.user ?? null) as { id?: string; email?: string | null } | null;
  if (!user?.id) return null;
  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email) return null;
  return { userId: user.id, email };
}

/** Estágio 1: envia o código de verificação para o e-mail da sessão. */
export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limited = await rateLimit(request, `account-password-otp:${session.userId}`, {
    max: 3,
    windowMs: 10 * 60_000,
    failClosed: true,
  });
  if (limited) return limited;
  // Corpo tolerante: { stage: "request" } ou vazio - o e-mail vem da sessão.

  const { error } = await getAuth().emailOtp.sendVerificationOtp({
    email: session.email,
    type: "email-verification",
  });
  if (error) {
    await recordSecurityEvent("password_change_otp_send_failed", { userId: session.userId });
    return NextResponse.json(
      {
        error: "otp_send_failed",
        message: getAuthErrorMessage(error, "Não foi possível enviar o código. Tente novamente em alguns minutos."),
      },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

/** Estágio 2: troca a senha exigindo [senha atual + OTP]. */
export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const limited = await rateLimit(request, `account-password:${session.userId}`, { max: 5, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const parsed = await readJsonBody<{ password?: unknown; currentPassword?: unknown; otp?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const password = typeof body?.password === "string" ? body.password : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return NextResponse.json({ error: "weak_password" }, { status: 400, headers: NO_STORE });
  if (!currentPassword) return NextResponse.json({ error: "current_password_required" }, { status: 400, headers: NO_STORE });
  if (!OTP_PATTERN.test(otp)) return NextResponse.json({ error: "invalid_otp_format", message: "Digite os 6 dígitos do código." }, { status: 400, headers: NO_STORE });

  // Fator 1 - OTP confirma a identidade pelo e-mail (Managed: signIn.emailOtp).
  const otpResult = await getAuth().signIn.emailOtp({ email: session.email, otp });
  if (otpResult.error) {
    await recordSecurityEvent("password_change_otp_denied", { userId: session.userId });
    return NextResponse.json(
      {
        error: "invalid_otp",
        message: getAuthErrorMessage(otpResult.error, "Código inválido ou expirado. Solicite um novo código."),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  // Fator 2 - changePassword valida a senha atual e efetua a troca, com
  // revokeOtherSessions trocando para uma nova sessão preservando a atual.
  const { error } = await getAuth().changePassword({ currentPassword, newPassword: password, revokeOtherSessions: true });
  if (error) {
    // V7 (auditoria de segurança): o signIn.emailOtp acima fez AUTO SIGN-IN
    // e o SDK já gravou os cookies de uma sessão NOVA. Se a troca falha, essa
    // sessão não pode sobreviver: seria um resíduo repetível a cada tentativa
    // (o usuário errou a senha atual e ganha uma sessão extra ativa). O
    // signOut revoga a sessão corrente - a criada pelo OTP - e limpa o
    // cookie. Melhor esforço: se o signOut também falhar, o erro original
    // da troca continua sendo a resposta.
    await getAuth().signOut().catch(() => undefined);
    if (String(error.code ?? "").toUpperCase() === "INVALID_PASSWORD") {
      await recordSecurityEvent("password_change_denied", { userId: session.userId });
      return NextResponse.json({ error: "invalid_current_password", message: "A senha atual não confere." }, { status: 403, headers: NO_STORE });
    }
    return NextResponse.json({ error: "password_update_failed", message: getAuthErrorMessage(error, "Não foi possível trocar a senha. Tente novamente.") }, { status: 400, headers: NO_STORE });
  }
  await recordSecurityEvent("password_changed", { userId: session.userId });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
