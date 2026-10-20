import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { getTeamAccountContext, type TeamAccountContext } from "@/lib/access/team-context";
import { getAccountPlan, type AccountPlan } from "@/lib/access/service";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

export type GuardOptions = {
  /** Valida Origin/Referer. Obrigatório em qualquer método que escreve. */
  csrf?: boolean;
  /**
   * Papel mínimo na equipe:
   * - "read": qualquer membro ativo;
   * - "edit": owner/admin/editor;
   * - "manage": owner/admin.
   */
  role?: "read" | "edit" | "manage";
  /**
   * Exige trial ativo ou assinatura ativa do titular da conta.
   *
   * Sem isto, o bloqueio de acesso existia apenas no componente `AccessGate`,
   * que roda no navegador — ou seja, não existia. Toda rota que cria, altera ou
   * entrega valor precisa passar por aqui.
   */
  paid?: boolean;
};

// O contrato com as rotas é framework-neutral: `Response` (Web standard).
// csrfGuard/rateLimit devolvem Response nativo; `deny` constrói NextResponse
// internamente (adaptador), que é atribuível a Response.
export type GuardResult =
  | { ok: true; userId: string; account: TeamAccountContext; plan: AccountPlan }
  | { ok: false; response: Response };

function deny(error: string, status: number, message?: string): { ok: false; response: Response } {
  return { ok: false, response: NextResponse.json(message ? { error, message } : { error }, { status, headers: { "cache-control": "no-store" } }) };
}

/**
 * Porta única de entrada das rotas autenticadas: CSRF, sessão, papel na
 * equipe, acesso pago e o teto de rate limit default (60/min por dono,
 * fail-open). Centralizar evita a classe de bug mais cara deste código —
 * uma rota nova que esquece uma das cinco verificações.
 *
 * Neon Auth (Managed Better Auth): `userId`/`accountOwnerId` são o id do
 * usuário do Neon Auth (TEXT) — nenhuma query pode presumir UUID. A resolução
 * de equipe/plano acontece via getTeamAccountContext/getAccountPlan.
 */
export async function guard(request: Request, options: GuardOptions = {}): Promise<GuardResult> {
  if (options.csrf) {
    const blocked = csrfGuard(request);
    if (blocked) return { ok: false, response: blocked };
  }

  const userId = await getCurrentUserId();
  if (!userId) return deny("unauthorized", 401);

  const account = await getTeamAccountContext(userId);
  if (options.role === "edit" && !account.canEditContent) {
    return deny("team_role_forbidden", 403, "Seu cargo permite visualizar, mas não alterar este recurso.");
  }
  if (options.role === "manage" && !account.canManageAccount) {
    return deny("team_role_forbidden", 403, "Somente o titular ou um administrador da conta pode fazer isto.");
  }

  const plan = await getAccountPlan(account.accountOwnerId);
  if (options.paid && !plan.access.hasAccess) {
    return deny(
      "subscription_required",
      402,
      plan.access.trialStatus === "available"
        ? "Ative seu teste gratuito para usar este recurso."
        : "Seu acesso expirou. Escolha um plano para continuar.",
    );
  }

  // Teto default de TODA rota autenticada (hardening item 4): 60/min por
  // DONO — nenhuma rota nova nasce sem limite. Fail-OPEN de propósito: uma
  // falha do store de rate limit não pode travar usuário legítimo em pico;
  // rotas críticas (login, checkout, webhooks, verify) mantêm seus próprios
  // limites fail-closed por cima. Rotas públicas não passam pelo guard.
  const limited = await rateLimit(request, `guard:${account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return { ok: false, response: limited };

  return { ok: true, userId, account, plan };
}
