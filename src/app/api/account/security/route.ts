import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";
import { readJsonBody } from "@/lib/api/request";
import { rateLimit } from "@/lib/security/rate-limit";
import { listRecentSecurityEvents } from "@/lib/security/auth-events";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Contrato preservado para a UI (SecurityPanel): { factors, events }.
  // O Managed Better Auth não expõe MFA (roadmap Neon) - factors é sempre
  // vazio e as mutations abaixo respondem 503 { error: "mfa_unavailable" }.
  const events = await listRecentSecurityEvents(userId, 20).catch(() => []);
  return NextResponse.json({ factors: [], events });
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await rateLimit(request, `account-security:${userId}`, { max: 10, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  // Pendência: MFA/2FA não existe no Managed Neon Auth. Erro estável para a
  // UI; o painel de segurança permanece montado para o dia em que o recurso
  // for lançado (ou migração para Better Auth self-managed).
  return NextResponse.json(
    { error: "mfa_unavailable", message: "Autenticação em dois fatores indisponível nesta infraestrutura." },
    { status: 503 },
  );
}
