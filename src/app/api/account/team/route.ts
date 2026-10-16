import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { getAccountPlan } from "@/lib/access/service";
import { getTeamAccountContext } from "@/lib/access/team-context";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoOrNull } from "@/lib/datetime";

const { accountTeamInvites, accountTeamMembers, accountTeams, profiles } = schema;

const roles = new Set(["admin", "editor", "analyst", "viewer"]);

type TeamView = { id: string; name: string; owner_id: string };

type MembershipView = {
  team_id: string;
  role: string;
  team: TeamView;
};

type TeamContext = {
  membership: MembershipView | null;
  seats: number;
};

const memberWithTeamColumns = {
  teamId: accountTeamMembers.teamId,
  role: accountTeamMembers.role,
  teamIdJoined: accountTeams.id,
  teamName: accountTeams.name,
  teamOwnerId: accountTeams.ownerId,
};

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

async function countRows(query: Promise<Array<{ total: number }>>): Promise<number> {
  const [row] = await query;
  return row?.total ?? 0;
}

async function context(userId: string): Promise<TeamContext> {
  // Contexto canônico: equipe própria sempre vence (mesma regra de
  // getTeamAccountContext). A versão anterior ordenava só por joined_at, e o
  // trigger de signup cria equipe própria + adesões de convite na MESMA
  // transação (joined_at idêntico) — usuário convidado pré-cadastro podia
  // acordar operando na equipe do convidante.
  const canonical = await getTeamAccountContext(userId);
  if (canonical.teamId) {
    const [membershipRow] = await db
      .select(memberWithTeamColumns)
      .from(accountTeamMembers)
      .innerJoin(accountTeams, eq(accountTeams.id, accountTeamMembers.teamId))
      .where(and(
        eq(accountTeamMembers.teamId, canonical.teamId),
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
      const [own] = await db
        .select({ id: accountTeams.id, name: accountTeams.name, ownerId: accountTeams.ownerId })
        .from(accountTeams)
        .where(eq(accountTeams.id, canonical.teamId))
        .limit(1);
      if (own) {
        const planOwn = await getAccountPlan(userId);
        return {
          membership: { team_id: own.id, role: "owner", team: { id: own.id, name: own.name, owner_id: own.ownerId } },
          seats: planOwn.quotas.teamSeats,
        };
      }
    }
  }
  const [membershipRow] = await db
    .select(memberWithTeamColumns)
    .from(accountTeamMembers)
    .innerJoin(accountTeams, eq(accountTeams.id, accountTeamMembers.teamId))
    .where(and(eq(accountTeamMembers.userId, userId), eq(accountTeamMembers.status, "active")))
    .orderBy(asc(accountTeamMembers.joinedAt), asc(accountTeamMembers.teamId))
    .limit(1);
  if (!membershipRow) return { membership: null, seats: 1 };
  const plan = await getAccountPlan(membershipRow.teamOwnerId);
  return { membership: toMembership(membershipRow), seats: plan.quotas.teamSeats };
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { membership, seats } = await context(userId);

  // Convites pendentes endereçados a este usuário: como a adesão agora exige
  // aceite, ele precisa de um lugar para vê-los e decidir.
  const [profileRow] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  const pendingForMe = profileRow?.email
    ? await db.select({
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
        ))
    : [];

  if (!membership) {
    return NextResponse.json({
      error: "team_not_found",
      invitations: pendingForMe.map((invite) => ({ id: invite.id, role: invite.role, expires_at: isoOrNull(invite.expiresAt), team: { name: invite.teamName } })),
    }, { status: 404 });
  }
  const [members, invites] = await Promise.all([
    db.select({ id: accountTeamMembers.id, userId: accountTeamMembers.userId, role: accountTeamMembers.role, status: accountTeamMembers.status, joinedAt: accountTeamMembers.joinedAt })
      .from(accountTeamMembers)
      .where(eq(accountTeamMembers.teamId, membership.team_id))
      .orderBy(asc(accountTeamMembers.joinedAt))
      .limit(200),
    db.select({ id: accountTeamInvites.id, email: accountTeamInvites.email, role: accountTeamInvites.role, status: accountTeamInvites.status, expiresAt: accountTeamInvites.expiresAt, createdAt: accountTeamInvites.createdAt })
      .from(accountTeamInvites)
      .where(and(eq(accountTeamInvites.teamId, membership.team_id), eq(accountTeamInvites.status, "pending")))
      .orderBy(desc(accountTeamInvites.createdAt))
      .limit(200),
  ]);
  const userIds = members.map((member) => member.userId);
  const memberProfiles = userIds.length
    ? await db.select({ id: profiles.id, email: profiles.email, fullName: profiles.fullName, avatarUrl: profiles.avatarUrl }).from(profiles).where(inArray(profiles.id, userIds))
    : [];
  const byId = new Map(memberProfiles.map((profile) => [profile.id, profile]));
  return NextResponse.json({
    team: membership.team,
    currentRole: membership.role,
    seats,
    members: members.map((member) => ({
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
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expires_at: isoOrNull(invite.expiresAt),
      created_at: invite.createdAt.toISOString(),
    })),
    invitations: pendingForMe.map((invite) => ({ id: invite.id, role: invite.role, expires_at: isoOrNull(invite.expiresAt), team: { name: invite.teamName } })),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Throttle antes de qualquer lookup: o caminho de aceite não pode servir
  // de oráculo/força-bruta de inviteId sem custo.
  const acceptLimit = await rateLimit(request, `account-team-accept:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (acceptLimit) return acceptLimit;

  const parsed = await readJsonBody<{ email?: unknown; role?: unknown; action?: unknown; inviteId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const { membership, seats } = await context(userId);

  // Aceite de convite pelo próprio convidado.
  if (body?.action === "accept") {
    const inviteId = String(body.inviteId ?? "");
    if (!inviteId) return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    const [profileRow] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!profileRow?.email) return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    const [invite] = await db.select({
      id: accountTeamInvites.id,
      teamId: accountTeamInvites.teamId,
      role: accountTeamInvites.role,
      email: accountTeamInvites.email,
      expiresAt: accountTeamInvites.expiresAt,
      status: accountTeamInvites.status,
    }).from(accountTeamInvites).where(eq(accountTeamInvites.id, inviteId)).limit(1);
    if (!invite || invite.status !== "pending" || invite.email !== profileRow.email.toLowerCase() || (invite.expiresAt?.getTime() ?? 0) <= Date.now()) {
      return NextResponse.json({ error: "invite_not_available" }, { status: 404 });
    }
    // Quota de assentos vale no aceite, não só no convite: sem isto, N aceites
    // concorrentes estouravam o plano. Aqui devolvemos o 409 amigável da
    // convenção do produto.
    const [teamRow] = await db.select({ ownerId: accountTeams.ownerId }).from(accountTeams).where(eq(accountTeams.id, invite.teamId)).limit(1);
    if (!teamRow) return NextResponse.json({ error: "invite_not_available" }, { status: 404 });
    const memberCount = await countRows(
      db.select({ total: sql<number>`count(*)::int` }).from(accountTeamMembers)
        .where(and(eq(accountTeamMembers.teamId, invite.teamId), eq(accountTeamMembers.status, "active"))),
    );
    const [alreadyMember] = await db.select({ id: accountTeamMembers.id }).from(accountTeamMembers)
      .where(and(eq(accountTeamMembers.teamId, invite.teamId), eq(accountTeamMembers.userId, userId), eq(accountTeamMembers.status, "active")))
      .limit(1);
    if (!alreadyMember) {
      const ownerPlan = await getAccountPlan(teamRow.ownerId);
      if (memberCount >= ownerPlan.quotas.teamSeats) {
        return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
      }
    }
    try {
      await db.insert(accountTeamMembers)
        .values({ teamId: invite.teamId, userId, role: invite.role, status: "active" })
        .onConflictDoUpdate({
          target: [accountTeamMembers.teamId, accountTeamMembers.userId],
          set: { role: invite.role, status: "active" },
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("team_seat_limit_reached")) return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
      return NextResponse.json({ error: "member_create_failed" }, { status: 500 });
    }
    await db.update(accountTeamInvites).set({ status: "accepted", acceptedBy: userId, updatedAt: new Date() }).where(eq(accountTeamInvites.id, invite.id));
    return NextResponse.json({ accepted: true });
  }

  const limited = await rateLimit(request, `account-team-invite:${userId}`, { max: 10, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (seats <= 1) return NextResponse.json({ error: "team_not_in_plan" }, { status: 403 });
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = String(body?.role ?? "viewer");
  if (!/^\S+@\S+\.\S+$/.test(email) || !roles.has(role)) return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
  const [memberCount, inviteCount] = await Promise.all([
    countRows(db.select({ total: sql<number>`count(*)::int` }).from(accountTeamMembers)
      .where(and(eq(accountTeamMembers.teamId, membership.team_id), eq(accountTeamMembers.status, "active")))),
    countRows(db.select({ total: sql<number>`count(*)::int` }).from(accountTeamInvites)
      .where(and(eq(accountTeamInvites.teamId, membership.team_id), eq(accountTeamInvites.status, "pending"), gt(accountTeamInvites.expiresAt, new Date())))),
  ]);
  if (memberCount + inviteCount >= seats) return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });

  // Convite SEMPRE pendente, mesmo para quem já tem conta.
  //
  // Antes, um e-mail já cadastrado era adicionado à equipe na hora, sem aceite:
  // (a) o convidado entrava numa equipe que não escolheu; (b) a resposta
  // distinguia "entrou" de "convidado" e virava um oráculo de quais e-mails têm
  // conta na plataforma; (c) o GET seguinte expunha nome e avatar dessa pessoa
  // a quem apenas digitou o e-mail dela.
  const [inviteRow] = await db.insert(accountTeamInvites)
    .values({
      teamId: membership.team_id,
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
  if (!inviteRow) return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });

  const [existingProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (!existingProfile) {
    // PENDÊNCIA (Neon Auth): o convite por e-mail não tem equivalente exposto
    // no Managed Neon Auth.
    // O convite fica pendente e aparece no GET deste endpoint para quem
    // cadstrar o e-mail; notificação por e-mail entra quando a camada de
    // auth ganhar envio (ou via provedor de e-mail transacional).
    console.warn("Team invite created without e-mail delivery: Neon Auth invite API unavailable", { inviteId: inviteRow.id });
  }
  // Resposta idêntica nos dois caminhos: nada revela se o e-mail já existe.
  return NextResponse.json({ invited: true });
}

export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-team-role:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const { membership } = await context(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ role?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const role = String(parsed.body?.role ?? "");
  if (!roles.has(role)) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  const [target] = await db.select({ id: accountTeamMembers.id, role: accountTeamMembers.role })
    .from(accountTeamMembers)
    .where(and(eq(accountTeamMembers.id, String(parsed.body?.memberId ?? "")), eq(accountTeamMembers.teamId, membership.team_id)))
    .limit(1);
  if (!target || target.role === "owner") return NextResponse.json({ error: "member_not_editable" }, { status: 400 });
  if (membership.role !== "owner" && (target.role === "admin" || role === "admin")) return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
  await db.update(accountTeamMembers).set({ role }).where(eq(accountTeamMembers.id, target.id));
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-team-remove:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const { membership } = await context(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ inviteId?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (body?.inviteId) {
    await db.update(accountTeamInvites).set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(accountTeamInvites.id, String(body.inviteId)), eq(accountTeamInvites.teamId, membership.team_id)));
  }
  if (body?.memberId) {
    const [target] = await db.select({ role: accountTeamMembers.role })
      .from(accountTeamMembers)
      .where(and(eq(accountTeamMembers.id, String(body.memberId)), eq(accountTeamMembers.teamId, membership.team_id)))
      .limit(1);
    if (target?.role === "admin" && membership.role !== "owner") return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
    await db.delete(accountTeamMembers)
      .where(and(eq(accountTeamMembers.id, String(body.memberId)), eq(accountTeamMembers.teamId, membership.team_id), ne(accountTeamMembers.role, "owner")));
  }
  return NextResponse.json({ removed: true });
}
