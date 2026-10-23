import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const {
  accountAccess,
  accountTeamInvites,
  accountTeamMembers,
  accountTeams,
  aiCreditWallets,
  intelligenceControls,
  profiles,
  userInbox,
} = schema;

export type BootstrapUser = { id: string; email?: string | null; name?: string | null };

/** `db.execute` devolve `{ rows }` (pg) ou array (outros drivers) - normaliza. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Dados do usuário no Neon Auth (schema `neon_auth`, gerenciado pela Neon e
 * legível por SQL - mesmo acesso usado por api/admin/team/role).
 */
async function fetchAuthUser(userId: string): Promise<BootstrapUser | null> {
  const result = await db.execute(
    sql`select id, email, name from neon_auth."user" where id = ${userId} limit 1`,
  );
  const rows = rowsOf<{ id: string; email: string | null; name: string | null }>(result);
  return rows[0] ?? null;
}

/**
 * Bootstrap de nova conta - equivalente aplicacional do antigo trigger
 * `on_auth_user_created_prisma_bootstrap` (docs/archive/legacy-supabase/
 * 20260717233000_intelligence_controls_and_resilient_signup.sql).
 *
 * O schema `neon_auth` é gerenciado pela Neon e não aceita triggers, então a
 * criação das linhas de produto - profiles, account_access, wallet de IA,
 * controles de inteligência, mensagem de boas-vindas e equipe própria - agora
 * acontece aqui, no primeiro momento em que a aplicação vê o usuário:
 * signup, primeira leitura de perfil/access ou primeira navegação autenticada
 * (self-heal de contas criadas antes desta correção).
 *
 * Idempotente (upserts/no-op em conflito) e resiliente: falhas em módulos
 * auxiliares nunca propagam - o mesmo contrato do trigger original, onde só
 * a criação do usuário no Auth era crítica.
 */
export async function ensureAccountBootstrap(input: BootstrapUser): Promise<void> {
  let user = input;
  if (!user.email) {
    const authUser = await fetchAuthUser(user.id).catch(() => null);
    if (!authUser) return; // usuário não existe no auth; nada a bootstrapar
    user = { id: user.id, email: authUser.email, name: user.name ?? authUser.name };
  }

  const fullName = user.name?.trim() || null;
  // coalesce(new.email, '') do trigger legado: e-mail ausente vira string vazia.
  const email = (user.email ?? "").trim().toLowerCase();

  // Perfil: sem ele a conta não renderiza (nome na UI, /api/account/profile).
  // Única escrita que pode propagar erro - o restante é best-effort.
  await db
    .insert(profiles)
    .values({ id: user.id, email, fullName })
    .onConflictDoNothing();

  // Módulos auxiliares - best-effort, nunca bloqueiam (contrato do trigger).
  try {
    await db.insert(accountAccess).values({ userId: user.id }).onConflictDoNothing();
    await db.insert(aiCreditWallets).values({ userId: user.id }).onConflictDoNothing();
    await db
      .insert(intelligenceControls)
      .values({ userId: user.id, reportEmail: email })
      .onConflictDoNothing();
    await db
      .insert(userInbox)
      .values({
        userId: user.id,
        kind: "welcome",
        title: "Bem-vindo a Prisma Player",
        message:
          "Seu teste gratuito de 14 dias esta disponivel. Ative quando estiver pronto para publicar sua primeira VSL.",
        actionLabel: "Ativar teste gratis",
        actionUrl: "/welcome",
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error("account_bootstrap_aux_failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  // Equipe própria (owner) + auto-aceite de convite pendente por e-mail -
  // fluxo legado preservado do trigger.
  try {
    const [team] = await db
      .insert(accountTeams)
      .values({ ownerId: user.id, name: (fullName ?? "Minha equipe").slice(0, 100) })
      .onConflictDoUpdate({ target: accountTeams.ownerId, set: { updatedAt: new Date() } })
      .returning({ id: accountTeams.id });
    if (team) {
      await db
        .insert(accountTeamMembers)
        .values({ teamId: team.id, userId: user.id, role: "owner" })
        .onConflictDoNothing();
    }
    const accepted = await db
      .update(accountTeamInvites)
      .set({ status: "accepted", acceptedBy: user.id, updatedAt: new Date() })
      .where(
        and(
          eq(accountTeamInvites.email, email),
          eq(accountTeamInvites.status, "pending"),
          sql`${accountTeamInvites.expiresAt} > now()`,
        ),
      )
      .returning({ teamId: accountTeamInvites.teamId, role: accountTeamInvites.role });
    if (accepted.length > 0) {
      await db
        .insert(accountTeamMembers)
        .values(
          accepted.map((invite) => ({ teamId: invite.teamId, userId: user.id, role: invite.role })),
        )
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error("account_bootstrap_team_failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
