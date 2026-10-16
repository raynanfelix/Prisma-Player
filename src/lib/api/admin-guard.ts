import "server-only";
import { NextResponse } from "next/server";
import { getCurrentAdminUser, getCurrentUserId } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";

export type AdminGuardResult =
  | { ok: true; adminId: string }
  | { ok: false; response: NextResponse };

function deny(error: string, status: number, message?: string): AdminGuardResult {
  return { ok: false, response: NextResponse.json(message ? { error, message } : { error }, { status, headers: { "cache-control": "no-store" } }) };
}

/**
 * Porta de entrada das rotas /api/admin/*. Exige sessão + papel `admin` no
 * campo `role` do usuário do Neon Auth (Managed Better Auth). Rotas admin
 * operam cross-tenant por desenho — toda mutação grava trilha em admin_audit_log.
 *
 * MFA/AAL2: exigência removida — o Managed Neon Auth não expõe MFA (roadmap
 * Neon); decisão do usuário foi aceitar o 2FA desligado por ora. Se o MFA
 * voltar (Managed ou Better Auth self-managed), reavaliar aqui.
 */
export async function adminGuard(request: Request): Promise<AdminGuardResult> {
  const csrf = csrfGuard(request);
  if (csrf) return { ok: false, response: csrf };

  const userId = await getCurrentUserId();
  if (!userId) return deny("unauthorized", 401);
  const admin = await getCurrentAdminUser();
  if (!admin) return deny("admin_forbidden", 403, "Somente administradores.");

  return { ok: true, adminId: userId };
}
