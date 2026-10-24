import "server-only";

import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";
import { getAccountPlan } from "@/lib/access/service";
import { getTeamAccountContext, type TeamAccountContext } from "@/lib/access/team-context";

const { accountTeamInvites, accountTeamMembers, accountTeams, profiles } = schema;

const roles = new Set(["admin", "editor", "analyst", "viewer"]);
const teamRoles = new Set(["owner", "admin", "editor", "analyst", "viewer"]);

export type TeamView = { id: string; name: string; owner_id: string };

export type MembershipView = {
  team_id: string;
  role: string;
  team: TeamView;
};

export type TeamContext = {
  membership: MembershipView | null;
  seats: number;
};

export type PendingInvitationView = { id: string; role: string; expires_at: string | null; team: { name: string } };

export type TeamMemberView = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  profile: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null;
};

export type TeamInviteView = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

export type TeamOverview = {
  membership: MembershipView | null;
  seats: number;
  invitations: PendingInvitationView[];
  members: TeamMemberView[];
  invites: TeamInviteView[];
};

export type AcceptInviteOutcome =
  | { status: "accepted" }
  | { status: "invalid_invite" }
  | { status: "invite_not_available" }
  | { status: "seat_limit_reached" }
  | { status: "member_create_failed" };

export type InviteMemberOutcome =
  | { status: "invited" }
  | { status: "invalid_invite" }
  | { status: "owner_required_for_admin_role" }
  | { status: "seat_limit_reached" }
  | { status: "invite_create_failed" };

export type UpdateMemberRoleOutcome =
  | { status: "updated" }
  | { status: "invalid_role" }
  | { status: "member_not_editable" }
  | { status: "owner_required_for_admin_role" };

export type RemoveFromTeamOutcome =
  | { status: "removed" }
  | { status: "owner_required_for_admin_role" };

const memberWithTeamColumns = {
  teamId: accountTeamMembers.teamId,
  role: accountTeamMembers.role,
  teamIdJoined: accountTeams.id,
  teamName: accountTeams.name,
  teamOwnerId: accountTeams.ownerId,
};

/**
 * Executor das queries de assentos/convite: aceita tanto o `db` quanto o `tx`
 * de `db.transaction` (mesma interface de select/insert do PgDatabase).
 */
type SeatDbRunner = Pick<typeof db, "select" | "insert">;

function toMembership(row: {
  teamId: string;
  role: string;
  teamIdJoined: string;
  teamName: string;
  teamOwnerId: string;
}): MembershipView {
  return {
    team_id: row.teamId,
    role: row.role,
    team: { id: row.teamIdJoined, name: row.teamName, owner_id: row.teamOwnerId },
  };
}

/**
 * Contexto canônico: equipe própria sempre vence (mesma regra de
 * getTeamAccountContext). A versão anterior ordenava só por joined_at, e o
 * trigger de signup cria equipe própria + adesões de convite na MESMA
 * transação (joined_at idêntico) - usuário convidado pré-cadastro podia
 * acordar operando na equipe do convidante.
 */
export async function getTeamContext(userId: string): Promise<TeamContext> {
  const canonical = await getTeamAccountContext(userId);
  if (canonical.teamId) {
    const fromCanonical = await contextFromCanonicalTeam(userId, canonical, canonical.teamId);
    if (fromCanonical) return fromCanonical;
  }
  return contextFromEarliestMembership(userId, canonical.role);
}

async function contextFromCanonicalTeam(userId: string, canonical: TeamAccountContext, teamId: string): Promise<TeamContext | null> {
  const [membershipRow] = await db
    .select(memberWithTeamColumns)
    .from(accountTeamMembers)
    .innerJoin(accountTeams, eq(accountTeams.id, accountTeamMembers.teamId))
    .where(and(
      eq(accountTeamMembers.teamId, teamId),
      eq(accountTeamMembers.userId, userId),
      eq(accountTeamMembers.status, "active"),
    ))
    .limit(1);
  const ownerId = membershipRow?.teamOwnerId ?? canonical.accountOwnerId;
  const plan = await getAccountPlan(ownerId);
  if (membershipRow) return { membership: toMembership(membershipRow), seats: plan.quotas.teamSeats };
  // Dono sem linha em members (equipe própria recém-criada): monta contexto
  // de dono para não travar a equipe.
  if (canonical.role === "owner" && canonical.accountOwnerId === userId) {
    return await contextForBareOwner(userId, teamId);
  }
  return null;
}

async function contextForBareOwner(userId: string, teamId: string): Promise<TeamContext | null> {
  const [own] = await db
    .select({ id: accountTeams.id, name: accountTeams.name, ownerId: accountTeams.ownerId })
    .from(accountTeams)
    .where(eq(accountTeams.id, teamId))
    .limit(1);
  if (!own) return null;
  const planOwn = await getAccountPlan(userId);
  return {
    membership: { team_id: own.id, role: "owner", team: { id: own.id, name: own.name, owner_id: own.ownerId } },
    seats: planOwn.quotas.teamSeats,
  };
}

async function contextFromEarliestMembership(userId: string, canonicalRole: TeamAccountContext["role"]): Promise<TeamContext> {
  const [membershipRow] = await db
    .select(memberWithTeamColumns)
    .from(accountTeamMembers)
    .innerJoin(accountTeams, eq(accountTeams.id, accountTeamMembers.teamId))
    .where(and(eq(accountTeamMembers.userId, userId), eq(accountTeamMembers.status, "active")))
    .orderBy(asc(accountTeamMembers.joinedAt), asc(accountTeamMembers.teamId))
    .limit(1);
  if (!membershipRow) return { membership: null, seats: 1 };
  const membership = toMembership(membershipRow);
  // Papel do convidador: a linha de membership REFINA o contexto canônico
  // (getTeamAccountContext, fonte de segurança já normalizada). Uma projeção
  // sem papel válido não vira papel desconhecido: cai para o papel canônico.
  const role = teamRoles.has(membership.role) ? membership.role : canonicalRole;
  const plan = await getAccountPlan(membershipRow.teamOwnerId);
  return { membership: { ...membership, role }, seats: plan.quotas.teamSeats };
}

/**
 * Monta a visão completa da equipe do usuário: contexto, convites pendentes
 * endereçados a ele e, quando há equipe, membros e convites da equipe.
 */
export async function buildTeamOverview(userId: string): Promise<TeamOverview> {
  const { membership, seats } = await getTeamContext(userId);
  // Convites pendentes endereçados a este usuário: como a adesão agora exige
  // aceite, ele precisa de um lugar para vê-los e decidir.
  const invitations = await listPendingInvitationsForUser(userId);
  if (!membership) return { membership: null, seats, invitations, members: [], invites: [] };
  const [memberRows, inviteRows] = await Promise.all([
    listTeamMembers(membership.team_id),
    listTeamInvites(membership.team_id),
  ]);
  const members = await withMemberProfiles(memberRows);
  return { membership, seats, invitations, members, invites: inviteRows.map(toInviteView) };
}

async function listPendingInvitationsForUser(userId: string): Promise<PendingInvitationView[]> {
  const [profileRow] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profileRow?.email) return [];
  const rows = await db.select({
    id: accountTeamInvites.id,
    role: accountTeamInvites.role,
    expiresAt: accountTeamInvites.expiresAt,
    teamName: accountTeams.name,
  })
    .from(accountTeamInvites)
    .innerJoin(accountTeams, eq(accountTeams.id, accountTeamInvites.teamId))
    .where(and(
      eq(accountTeamInvites.email, profileRow.email.toLowerCase()),
      eq(accountTeamInvites.status, "pending"),
      gt(accountTeamInvites.expiresAt, new Date()),
    ));
  return rows.map((invite) => ({ id: invite.id, role: invite.role, expires_at: isoOrNull(invite.expiresAt), team: { name: invite.teamName } }));
}

async function listTeamMembers(teamId: string) {
  return db.select({ id: accountTeamMembers.id, userId: accountTeamMembers.userId, role: accountTeamMembers.role, status: accountTeamMembers.status, joinedAt: accountTeamMembers.joinedAt })
    .from(accountTeamMembers)
    .where(eq(accountTeamMembers.teamId, teamId))
    .orderBy(asc(accountTeamMembers.joinedAt))
    .limit(200);
}

async function listTeamInvites(teamId: string) {
  return db.select({ id: accountTeamInvites.id, email: accountTeamInvites.email, role: accountTeamInvites.role, status: accountTeamInvites.status, expiresAt: accountTeamInvites.expiresAt, createdAt: accountTeamInvites.createdAt })
    .from(accountTeamInvites)
    .where(and(eq(accountTeamInvites.teamId, teamId), eq(accountTeamInvites.status, "pending")))
    .orderBy(desc(accountTeamInvites.createdAt))
    .limit(200);
}

function toInviteView(invite: { id: string; email: string; role: string; status: string; expiresAt: Date; createdAt: Date }): TeamInviteView {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expires_at: isoOrNull(invite.expiresAt),
    created_at: invite.createdAt.toISOString(),
  };
}

async function withMemberProfiles(members: Array<{ id: string; userId: string; role: string; status: string; joinedAt: Date }>): Promise<TeamMemberView[]> {
  const userIds = members.map((member) => member.userId);
  const memberProfiles = userIds.length
    ? await db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName, avatarUrl: profiles.avatarUrl }).from(profiles).where(inArray(profiles.id, userIds))
    : [];
  const byId = new Map(memberProfiles.map((profile) => [profile.id, profile]));
  return members.map(toMemberView(byId));
}

function toMemberView(byId: Map<string, { id: string; email: string; fullName: string | null; avatarUrl: string | null }>) {
  return (member: { id: string; userId: string; role: string; status: string; joinedAt: Date }): TeamMemberView => ({
    id: member.id,
    user_id: member.userId,
    role: member.role,
    status: member.status,
    joined_at: member.joinedAt.toISOString(),
    profile: byId.get(member.userId)
      ? {
          id: byId.get(member.userId)!.id,
          email: byId.get(member.userId)!.email,
          full_name: byId.get(member.userId)!.fullName,
          avatar_url: byId.get(member.userId)!.avatarUrl,
        }
      : null,
  });
}

async function countActiveMembers(runner: SeatDbRunner, teamId: string): Promise<number> {
  const [row] = await runner.select({ total: sql<number>`count(*)::int` }).from(accountTeamMembers)
    .where(and(eq(accountTeamMembers.teamId, teamId), eq(accountTeamMembers.status, "active")));
  return row?.total ?? 0;
}

async function countPendingInvites(runner: SeatDbRunner, teamId: string): Promise<number> {
  const [row] = await runner.select({ total: sql<number>`count(*)::int` }).from(accountTeamInvites)
    .where(and(eq(accountTeamInvites.teamId, teamId), eq(accountTeamInvites.status, "pending"), gt(accountTeamInvites.expiresAt, new Date())));
  return row?.total ?? 0;
}

async function primaryEmailOf(userId: string): Promise<string | null> {
  const [profileRow] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  return profileRow?.email ?? null;
}

async function findTeamOwner(teamId: string): Promise<{ ownerId: string } | null> {
  const [teamRow] = await db.select({ ownerId: accountTeams.ownerId }).from(accountTeams).where(eq(accountTeams.id, teamId)).limit(1);
  return teamRow ?? null;
}

/** Aceite de convite pelo próprio convidado, com quota de assentos no aceite. */
export async function acceptTeamInvite(userId: string, inviteId: string): Promise<AcceptInviteOutcome> {
  if (!inviteId) return { status: "invalid_invite" };
  const email = await primaryEmailOf(userId);
  if (!email) return { status: "invalid_invite" };
  const invite = await findAcceptableInvite(inviteId, email);
  if (!invite) return { status: "invite_not_available" };
  const teamRow = await findTeamOwner(invite.teamId);
  if (!teamRow) return { status: "invite_not_available" };
  const ownerPlan = await getAccountPlan(teamRow.ownerId);
  const seats = ownerPlan.quotas.teamSeats;
  // M4 (auditoria): quota de assentos vale no aceite, e o check + insert
  // agora acontecem DENTRO de uma transação com lock da linha da equipe
  // (FOR UPDATE). N aceites concorrentes do mesmo time se serializam no
  // lock: cada um vê os membros commitados pelos anteriores e o que estourar
  // o plano devolve o 409 amigável da convenção do produto.
  let joined: AcceptInviteOutcome;
  try {
    joined = await db.transaction(async (tx) => {
      await lockTeamRow(tx, invite.teamId);
      const memberCount = await countActiveMembers(tx, invite.teamId);
      const [alreadyMember] = await tx.select({ id: accountTeamMembers.id }).from(accountTeamMembers)
        .where(and(eq(accountTeamMembers.teamId, invite.teamId), eq(accountTeamMembers.userId, userId), eq(accountTeamMembers.status, "active")))
        .limit(1);
      if (alreadyMember) return await insertTeamMember(tx, invite, userId);
      if (memberCount >= seats) return { status: "seat_limit_reached" } as const;
      return await insertTeamMember(tx, invite, userId);
    });
  } catch {
    return { status: "member_create_failed" };
  }
  if (joined.status !== "accepted") return joined;
  await db.update(accountTeamInvites).set({ status: "accepted", acceptedBy: userId, updatedAt: new Date() }).where(eq(accountTeamInvites.id, invite.id));
  return { status: "accepted" };
}

/**
 * Lock serializador da quota: prende a linha da equipe até o fim da
 * transação, para que check de assentos e insert do convite/membro vejam o
 * mesmo estado que os concorrentes commitaram (mata o TOCTOU do M4).
 */
async function lockTeamRow(runner: SeatDbRunner, teamId: string): Promise<void> {
  await runner.select({ id: accountTeams.id }).from(accountTeams).where(eq(accountTeams.id, teamId)).for("update").limit(1);
}

async function findAcceptableInvite(inviteId: string, email: string): Promise<{ id: string; teamId: string; role: string } | null> {
  const [invite] = await db.select({
    id: accountTeamInvites.id,
    teamId: accountTeamInvites.teamId,
    role: accountTeamInvites.role,
    email: accountTeamInvites.email,
    expiresAt: accountTeamInvites.expiresAt,
    status: accountTeamInvites.status,
  }).from(accountTeamInvites).where(eq(accountTeamInvites.id, inviteId)).limit(1);
  if (!invite || invite.status !== "pending" || invite.email !== email.toLowerCase() || (invite.expiresAt?.getTime() ?? 0) <= Date.now()) {
    return null;
  }
  return { id: invite.id, teamId: invite.teamId, role: invite.role };
}

async function insertTeamMember(runner: SeatDbRunner, invite: { teamId: string; role: string }, userId: string): Promise<AcceptInviteOutcome> {
  try {
    await runner.insert(accountTeamMembers)
      .values({ teamId: invite.teamId, userId, role: invite.role, status: "active" })
      .onConflictDoUpdate({
        target: [accountTeamMembers.teamId, accountTeamMembers.userId],
        set: { role: invite.role, status: "active" },
      });
  } catch {
    // M4 (auditoria): o catch antigo procurava "team_seat_limit_reached", a
    // mensagem do trigger atômico do legacy Supabase que não existe no schema
    // Neon - código morto desde a migração. A quota agora é checada dentro da
    // transação (acceptTeamInvite); qualquer erro aqui é real e vira
    // member_create_failed (o upsert de re-entrada é idempotente).
    return { status: "member_create_failed" };
  }
  return { status: "accepted" };
}

/**
 * Convite SEMPRE pendente, mesmo para quem já tem conta.
 *
 * Antes, um e-mail já cadastrado era adicionado à equipe na hora, sem aceite:
 * (a) o convidado entrava numa equipe que não escolheu; (b) a resposta
 * distinguia "entrou" de "convidado" e virava um oráculo de quais e-mails têm
 * conta na plataforma; (c) o GET seguinte expunha nome e avatar dessa pessoa
 * a quem apenas digitou o e-mail dela.
 *
 * M1 (auditoria): convite com papel admin exige que o INVITADOR seja o owner -
 * mesma regra do updateMemberRole. Sem isto, um admin escalava um cúmplice a
 * admin sem passar pelo dono da conta.
 *
 * M4 (auditoria): o check de assentos e o insert do convite correm numa ÚNICA
 * transação com lock da linha da equipe (FOR UPDATE): convites concorrentes do
 * mesmo time se serializam e o segundo que estourar o plano falha limpo com
 * seat_limit_reached (o catch antigo esperava o trigger do legacy Supabase,
 * que não existe no schema Neon - código morto).
 */
export async function inviteTeamMember(actorRole: string, userId: string, teamId: string, seats: number, emailInput: unknown, roleInput: unknown): Promise<InviteMemberOutcome> {
  const email = String(emailInput ?? "").trim().toLowerCase();
  const role = String(roleInput ?? "viewer");
  if (!/^\S+@\S+\.\S+$/.test(email) || !roles.has(role)) return { status: "invalid_invite" };
  if (role === "admin" && actorRole !== "owner") return { status: "owner_required_for_admin_role" };
  let outcome: Awaited<ReturnType<typeof inviteInsideTransaction>>;
  try {
    outcome = await db.transaction((tx) => inviteInsideTransaction(tx, userId, teamId, seats, email, role));
  } catch {
    return { status: "invite_create_failed" };
  }
  if (outcome.status !== "invited") return outcome;
  await warnIfInviteUndeliverable(outcome.inviteId, email);
  // Resposta idêntica nos dois caminhos: nada revela se o e-mail já existe.
  return { status: "invited" };
}

/** Check de assentos + upsert do convite DENTRO da transação (M4). */
async function inviteInsideTransaction(tx: SeatDbRunner, userId: string, teamId: string, seats: number, email: string, role: string): Promise<{ status: "invited"; inviteId: string } | { status: "seat_limit_reached" } | { status: "invite_create_failed" }> {
  await lockTeamRow(tx, teamId);
  const memberCount = await countActiveMembers(tx, teamId);
  const inviteCount = await countPendingInvites(tx, teamId);
  if (memberCount + inviteCount >= seats) return { status: "seat_limit_reached" };
  const inviteRow = await upsertTeamInvite(tx, userId, teamId, email, role);
  return inviteRow ? { status: "invited", inviteId: inviteRow.id } : { status: "invite_create_failed" };
}

async function upsertTeamInvite(runner: SeatDbRunner, userId: string, teamId: string, email: string, role: string): Promise<{ id: string } | null> {
  const [inviteRow] = await runner.insert(accountTeamInvites)
    .values({
      teamId,
      email,
      role,
      invitedBy: userId,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 86400000),
    })
    .onConflictDoUpdate({
      target: [accountTeamInvites.teamId, accountTeamInvites.email],
      set: { role, invitedBy: userId, status: "pending", expiresAt: new Date(Date.now() + 7 * 86400000) },
    })
    .returning({ id: accountTeamInvites.id });
  return inviteRow ?? null;
}

async function warnIfInviteUndeliverable(inviteId: string, email: string): Promise<void> {
  const [existingProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (!existingProfile) {
    // PENDÊNCIA (Neon Auth): o convite por e-mail não tem equivalente exposto
    // no Managed Neon Auth.
    // O convite fica pendente e aparece no GET deste endpoint para quem
    // cadstrar o e-mail; notificação por e-mail entra quando a camada de
    // auth ganhar envio (ou via provedor de e-mail transacional).
    console.warn("Team invite created without e-mail delivery: Neon Auth invite API unavailable", { inviteId });
  }
}

/** Atualiza o papel de um membro; só o dono promove/demote admins. */
export async function updateMemberRole(actorRole: string, teamId: string, memberIdInput: unknown, roleInput: unknown): Promise<UpdateMemberRoleOutcome> {
  const role = String(roleInput ?? "");
  if (!roles.has(role)) return { status: "invalid_role" };
  const [target] = await db.select({ id: accountTeamMembers.id, role: accountTeamMembers.role })
    .from(accountTeamMembers)
    .where(and(eq(accountTeamMembers.id, String(memberIdInput ?? "")), eq(accountTeamMembers.teamId, teamId)))
    .limit(1);
  if (!target || target.role === "owner") return { status: "member_not_editable" };
  if (actorRole !== "owner" && (target.role === "admin" || role === "admin")) return { status: "owner_required_for_admin_role" };
  await db.update(accountTeamMembers).set({ role }).where(eq(accountTeamMembers.id, target.id));
  return { status: "updated" };
}

/** Revoga convite e/ou remove membro, sempre no escopo da equipe do ator. */
export async function removeFromTeam(actorRole: string, teamId: string, inviteIdInput: unknown, memberIdInput: unknown): Promise<RemoveFromTeamOutcome> {
  if (inviteIdInput) {
    await db.update(accountTeamInvites).set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(accountTeamInvites.id, String(inviteIdInput)), eq(accountTeamInvites.teamId, teamId)));
  }
  if (memberIdInput) {
    const blocked = await removeMemberGuarded(actorRole, teamId, String(memberIdInput));
    if (blocked) return blocked;
  }
  return { status: "removed" };
}

async function removeMemberGuarded(actorRole: string, teamId: string, memberId: string): Promise<RemoveFromTeamOutcome | null> {
  const [target] = await db.select({ role: accountTeamMembers.role })
    .from(accountTeamMembers)
    .where(and(eq(accountTeamMembers.id, memberId), eq(accountTeamMembers.teamId, teamId)))
    .limit(1);
  if (target?.role === "admin" && actorRole !== "owner") return { status: "owner_required_for_admin_role" };
  await db.delete(accountTeamMembers)
    .where(and(eq(accountTeamMembers.id, memberId), eq(accountTeamMembers.teamId, teamId), ne(accountTeamMembers.role, "owner")));
  return null;
}
