import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const { accountTeamMembers, accountTeams } = schema;

export type TeamRole = "owner" | "admin" | "editor" | "analyst" | "viewer";

export type TeamAccountContext = {
  actorUserId: string;
  accountOwnerId: string;
  teamId: string | null;
  role: TeamRole;
  canEditContent: boolean;
  canManageAccount: boolean;
};

export async function getTeamAccountContext(userId: string): Promise<TeamAccountContext> {
  // A equipe própria sempre vence. O trigger de signup cria a equipe do usuário
  // e as adesões vindas de convite na MESMA transação, então `joined_at` é
  // idêntico e ordenar só por ele não tem desempate: um usuário convidado antes
  // de se cadastrar podia acordar dentro da conta de quem o convidou.
  const [ownTeam] = await db
    .select({ id: accountTeams.id })
    .from(accountTeams)
    .where(eq(accountTeams.ownerId, userId))
    .limit(1);
  if (ownTeam) {
    return { actorUserId: userId, accountOwnerId: userId, teamId: ownTeam.id, role: "owner", canEditContent: true, canManageAccount: true };
  }

  const [membership] = await db
    .select({ teamId: accountTeamMembers.teamId, role: accountTeamMembers.role })
    .from(accountTeamMembers)
    .where(and(eq(accountTeamMembers.userId, userId), eq(accountTeamMembers.status, "active")))
    .orderBy(asc(accountTeamMembers.joinedAt), asc(accountTeamMembers.teamId))
    .limit(1);

  if (!membership) return { actorUserId: userId, accountOwnerId: userId, teamId: null, role: "owner", canEditContent: true, canManageAccount: true };
  const [team] = await db
    .select({ ownerId: accountTeams.ownerId })
    .from(accountTeams)
    .where(eq(accountTeams.id, membership.teamId))
    .limit(1);
  const role = (["owner", "admin", "editor", "analyst", "viewer"].includes(membership.role) ? membership.role : "viewer") as TeamRole;
  return {
    actorUserId: userId,
    accountOwnerId: team?.ownerId ?? userId,
    teamId: membership.teamId,
    role,
    canEditContent: ["owner", "admin", "editor"].includes(role),
    canManageAccount: ["owner", "admin"].includes(role),
  };
}
