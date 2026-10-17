import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/request";
import { getAuth } from "@/lib/auth/server";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { csrfGuard } from "@/lib/security/csrf";
import { recordAuthFailure } from "@/lib/security/auth-events";
import { hashRateLimitIdentifier, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  // O primeiro balde é por IP e existe para engrossar ataques distribuídos de
  // força bruta. Em dev/local (onde o IP real não está presente e todos caem no
  // balde "unknown") isso não deve travar o uso legítimo, então o teto é folgado;
  // a proteção real contra credential stuffing é o balde por conta abaixo.
  const limited = await rateLimit(request, "auth-login", { max: 20, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ email?: unknown; password?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  const accountLimited = await rateLimit(request, "auth-login-account", {
    max: 15, windowMs: 30 * 60_000, failClosed: true, identifier: hashRateLimitIdentifier(email),
  });
  if (accountLimited) return accountLimited;

  const { data, error } = await getAuth().signIn.email({ email, password });
  if (error || !data?.user) {
    // Observabilidade: o código/mensagem REAL do Better Auth no log da Vercel —
    // sem isso um código não mapeado vira fallback genérico e fica invisível.
    console.error("login_failed", {
      code: error?.code ?? "no_code",
      status: error?.status ?? "no_status",
      message: error?.message ?? "no_message",
    });
    await recordAuthFailure("login_failed", email, request);
    const message = getAuthErrorMessage(error, "Não foi possível entrar agora. Tente novamente.");
    return NextResponse.json({ error: "auth_failed", message }, { status: 401 });
  }
  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } });
}
