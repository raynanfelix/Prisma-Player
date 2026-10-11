import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();

  // A equipe própria sempre vence. O trigger de signup cria a equipe do usuário
  // e as adesões vindas de convite na MESMA transação, então `joined_at` é
  // idêntico e ordenar só por ele não tem desempate: um usuário convidado antes
  // de se cadastrar podia acordar dentro da conta de quem o convidou.
  const ownTeam = await admin.from("account_teams").select("id").eq("owner_id", userId).maybeSingle();
  if (ownTeam.data) {
    return { actorUserId: userId, accountOwnerId: userId, teamId: ownTeam.data.id, role: "owner", canEditContent: true, canManageAccount: true };
  }

  const membership = await admin.from("account_team_members")
    .select("team_id,role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at")
    .order("team_id")
    .limit(1)
    .maybeSingle();

  if (!membership.data) return { actorUserId: userId, accountOwnerId: userId, teamId: null, role: "owner", canEditContent: true, canManageAccount: true };
  const team = await admin.from("account_teams").select("owner_id").eq("id", membership.data.team_id).maybeSingle();
  const role = (["owner", "admin", "editor", "analyst", "viewer"].includes(String(membership.data.role)) ? membership.data.role : "viewer") as TeamRole;
  return {
    actorUserId: userId,
    accountOwnerId: team.data?.owner_id ?? userId,
    teamId: membership.data.team_id,
    role,
    canEditContent: ["owner", "admin", "editor"].includes(role),
    canManageAccount: ["owner", "admin"].includes(role),
  };
}

export function forbiddenForRole() {
  return Response.json({ error: "team_role_forbidden", message: "Seu cargo permite visualizar, mas não alterar este recurso." }, { status: 403 });
}
