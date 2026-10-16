import "server-only";
import { redirect } from "next/navigation";
import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth (Managed Better Auth) — instância única do SDK server-side.
 *
 * A instância é criada sob demanda (lazy) em vez de no escopo do módulo:
 * `createNeonAuth` valida as variáveis de ambiente na criação, e o import de
 * rota acontece no `next build`. Com a criação lazy o build não exige
 * NEON_AUTH_* configurados — a falha acontece na primeira requisição, com
 * mensagem explícita.
 */
let cachedAuth: NeonAuth | null = null;

export function getAuth(): NeonAuth {
  if (!cachedAuth) {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
    if (!baseUrl || !cookieSecret) {
      throw new Error(
        "Neon Auth não configurado: defina NEON_AUTH_BASE_URL (painel Neon → Auth) e NEON_AUTH_COOKIE_SECRET (openssl rand -base64 32).",
      );
    }
    cachedAuth = createNeonAuth({ baseUrl, cookies: { secret: cookieSecret } });
  }
  return cachedAuth;
}

/** Usuário da sessão. O id é o id do usuário no Neon Auth (TEXT/UUID). */
export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

/**
 * Papel admin no Managed Better Auth vive no campo `role` do usuário
 * (plugin Admin; padrão "user"). O primeiro admin precisa ser promovido via
 * SQL no schema neon_auth — procedimento em docs/neon-migration/neon-auth-setup.md.
 */
function hasAdminRole(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return String(user.role ?? "")
    .split(",")
    .map((role) => role.trim())
    .includes("admin");
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getAuth().getSession();
  return data?.user?.id ?? null;
}

export async function requireUser(next = "/dashboard/videos") {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(next)}`);
  return userId;
}

export async function getCurrentAdminUser(): Promise<AuthUser | null> {
  const { data } = await getAuth().getSession();
  const user = (data?.user ?? null) as AuthUser | null;
  return hasAdminRole(user) ? user : null;
}

export async function requireAdmin() {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent("/admin")}`);
  const user = await getCurrentAdminUser();
  if (!user) redirect("/dashboard/videos");
  // MFA/AAL2: indisponível no Managed Neon Auth (decisão do usuário: sem 2FA
  // por enquanto). Reavaliar quando o recurso existir no Managed ou migrar
  // para Better Auth self-managed.
  return user;
}
