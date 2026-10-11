import "server-only";
import { NextResponse } from "next/server";
import { getCurrentAdminUser, getCurrentUserId, getAuthAssuranceLevel } from "@/lib/auth/server";
import { csrfGuard } from "@/lib/security/csrf";

export type AdminGuardResult =
  | { ok: true; adminId: string }
  | { ok: false; response: NextResponse };

function deny(error: string, status: number, message?: string): AdminGuardResult {
  return { ok: false, response: NextResponse.json(message ? { error, message } : { error }, { status, headers: { "cache-control": "no-store" } }) };
}

/**
 * Porta de entrada das rotas /api/admin/*. Exige sessão + papel `admin` no
 * app_metadata + MFA verificado na sessão atual (AAL2).
 * Rotas admin operam cross-tenant por desenho — toda mutação
 * grava trilha em admin_audit_log.
 */
export async function adminGuard(request: Request): Promise<AdminGuardResult> {
  const csrf = csrfGuard(request);
  if (csrf) return { ok: false, response: csrf };

  const userId = await getCurrentUserId();
  if (!userId) return deny("unauthorized", 401);
  const admin = await getCurrentAdminUser();
  if (!admin) return deny("admin_forbidden", 403, "Somente administradores.");

  // Exigir AAL2 (MFA verificado na sessão atual) para operações administrativas
  const aal = await getAuthAssuranceLevel();
  if (aal !== "aal2") {
    return deny("mfa_required", 403, "Autenticação em dois fatores necessária para acessar o painel administrativo.");
  }

  return { ok: true, adminId: userId };
}
