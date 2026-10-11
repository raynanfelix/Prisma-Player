import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountPlan } from "@/lib/access/service";
import { getTeamAccountContext } from "@/lib/access/team-context";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";

const roles = new Set(["admin", "editor", "analyst", "viewer"]);

async function context(userId: string) {
  const admin = createAdminClient();
  // Contexto canônico: equipe própria sempre vence (mesma regra de
  // getTeamAccountContext). A versão anterior ordenava só por joined_at, e o
  // trigger de signup cria equipe própria + adesões de convite na MESMA
  // transação (joined_at idêntico) — usuário convidado pré-cadastro podia
  // acordar operando na equipe do convidante.
  const canonical = await getTeamAccountContext(userId);
  if (canonical.teamId) {
    const membership = await admin.from("account_team_members").select("team_id,role,team:account_teams(id,name,owner_id)").eq("team_id", canonical.teamId).eq("user_id", userId).eq("status", "active").maybeSingle();
    const team = membership.data
      ? (Array.isArray(membership.data.team) ? membership.data.team[0] : membership.data.team)
      : null;
    const ownerId = team?.owner_id ?? canonical.accountOwnerId;
    const plan = await getAccountPlan(ownerId);
    if (membership.data) return { admin, membership: { ...membership.data, team }, seats: plan.quotas.teamSeats };
    // Dono sem linha em members (equipe própria recém-criada): monta contexto
    // de dono para não travar a equipe.
    if (canonical.role === "owner" && canonical.accountOwnerId === userId) {
      const own = await admin.from("account_teams").select("id,name,owner_id").eq("id", canonical.teamId).maybeSingle();
      if (own.data) {
        const planOwn = await getAccountPlan(userId);
        return { admin, membership: { team_id: own.data.id, role: "owner" as const, team: own.data }, seats: planOwn.quotas.teamSeats };
      }
    }
  }
  const membership = await admin.from("account_team_members").select("team_id,role,team:account_teams(id,name,owner_id)").eq("user_id", userId).eq("status", "active").order("joined_at").order("team_id").limit(1).maybeSingle();
  if (!membership.data) return { admin, membership: null, seats: 1 };
  const team = Array.isArray(membership.data.team) ? membership.data.team[0] : membership.data.team;
  const plan = await getAccountPlan(team.owner_id);
  return { admin, membership: { ...membership.data, team }, seats: plan.quotas.teamSeats };
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { admin, membership, seats } = await context(userId);

  // Convites pendentes endereçados a este usuário: como a adesão agora exige
  // aceite, ele precisa de um lugar para vê-los e decidir.
  const { data: userRow } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  const pendingForMe = userRow?.email
    ? (await admin.from("account_team_invites").select("id,role,expires_at,team:account_teams(name)").eq("email", userRow.email.toLowerCase()).eq("status", "pending").gt("expires_at", new Date().toISOString())).data ?? []
    : [];

  if (!membership) return NextResponse.json({ error: "team_not_found", invitations: pendingForMe }, { status: 404 });
  const [members, invites] = await Promise.all([
    admin.from("account_team_members").select("id,user_id,role,status,joined_at").eq("team_id", membership.team_id).order("joined_at").limit(200),
    admin.from("account_team_invites").select("id,email,role,status,expires_at,created_at").eq("team_id", membership.team_id).eq("status", "pending").order("created_at", { ascending: false }).limit(200),
  ]);
  const userIds = (members.data ?? []).map((member) => member.user_id);
  const profiles = userIds.length ? await admin.from("profiles").select("id,email,full_name,avatar_url").in("id", userIds) : { data: [] };
  const byId = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  return NextResponse.json({
    team: membership.team,
    currentRole: membership.role,
    seats,
    members: (members.data ?? []).map((member) => ({ ...member, profile: byId.get(member.user_id) ?? null })),
    invites: invites.data ?? [],
    invitations: pendingForMe,
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

  const { admin, membership, seats } = await context(userId);

  // Aceite de convite pelo próprio convidado.
  if (body?.action === "accept") {
    const inviteId = String(body.inviteId ?? "");
    if (!inviteId) return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (!profile?.email) return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    const { data: invite } = await admin.from("account_team_invites").select("id,team_id,role,email,expires_at,status").eq("id", inviteId).maybeSingle();
    if (!invite || invite.status !== "pending" || invite.email !== profile.email.toLowerCase() || new Date(invite.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "invite_not_available" }, { status: 404 });
    }
    // Quota de assentos vale no aceite, não só no convite: sem isto, N aceites
    // concorrentes estouravam o plano. O trigger
    // account_team_members_atomic_quota é a barreira atômica final; aqui
    // devolvemos o 409 amigável da convenção do produto.
    const [teamRow, memberCount] = await Promise.all([
      admin.from("account_teams").select("owner_id").eq("id", invite.team_id).maybeSingle(),
      admin.from("account_team_members").select("id", { count: "exact", head: true }).eq("team_id", invite.team_id).eq("status", "active"),
    ]);
    if (!teamRow.data) return NextResponse.json({ error: "invite_not_available" }, { status: 404 });
    const alreadyMember = await admin.from("account_team_members").select("id").eq("team_id", invite.team_id).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (!alreadyMember.data) {
      const ownerPlan = await getAccountPlan(teamRow.data.owner_id);
      if ((memberCount.count ?? 0) >= ownerPlan.quotas.teamSeats) {
        return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
      }
    }
    const joined = await admin.from("account_team_members").upsert({ team_id: invite.team_id, user_id: userId, role: invite.role, status: "active" }, { onConflict: "team_id,user_id" });
    if (joined.error) {
      const message = `${joined.error.message ?? ""} ${joined.error.code ?? ""}`;
      if (message.includes("team_seat_limit_reached")) return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
      return NextResponse.json({ error: "member_create_failed" }, { status: 500 });
    }
    await admin.from("account_team_invites").update({ status: "accepted", accepted_by: userId, updated_at: new Date().toISOString() }).eq("id", invite.id);
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
    admin.from("account_team_members").select("id", { count: "exact", head: true }).eq("team_id", membership.team_id).eq("status", "active"),
    admin.from("account_team_invites").select("id", { count: "exact", head: true }).eq("team_id", membership.team_id).eq("status", "pending").gt("expires_at", new Date().toISOString()),
  ]);
  if ((memberCount.count ?? 0) + (inviteCount.count ?? 0) >= seats) return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });

  // Convite SEMPRE pendente, mesmo para quem já tem conta.
  //
  // Antes, um e-mail já cadastrado era adicionado à equipe na hora, sem aceite:
  // (a) o convidado entrava numa equipe que não escolheu; (b) a resposta
  // distinguia "entrou" de "convidado" e virava um oráculo de quais e-mails têm
  // conta na plataforma; (c) o GET seguinte expunha nome e avatar dessa pessoa
  // a quem apenas digitou o e-mail dela.
  const invite = await admin.from("account_team_invites").upsert({ team_id: membership.team_id, email, role, invited_by: userId, status: "pending", expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, { onConflict: "team_id,email" }).select("id").single();
  if (invite.error) return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });

  const origin = new URL(request.url).origin;
  const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!existingProfile) {
    const sent = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback?next=/dashboard/settings` });
    if (sent.error) {
      await admin.from("account_team_invites").update({ status: "revoked" }).eq("id", invite.data.id);
      return NextResponse.json({ error: "invite_email_failed" }, { status: 502 });
    }
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
  const { admin, membership } = await context(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ role?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const role = String(parsed.body?.role ?? "");
  if (!roles.has(role)) return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  const target = await admin.from("account_team_members").select("id,role").eq("id", String(parsed.body?.memberId ?? "")).eq("team_id", membership.team_id).maybeSingle();
  if (!target.data || target.data.role === "owner") return NextResponse.json({ error: "member_not_editable" }, { status: 400 });
  if (membership.role !== "owner" && (target.data.role === "admin" || role === "admin")) return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
  await admin.from("account_team_members").update({ role }).eq("id", target.data.id);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-team-remove:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const { admin, membership } = await context(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ inviteId?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (body?.inviteId) await admin.from("account_team_invites").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", String(body.inviteId)).eq("team_id", membership.team_id);
  if (body?.memberId) {
    const target = await admin.from("account_team_members").select("id,role").eq("id", String(body.memberId)).eq("team_id", membership.team_id).maybeSingle();
    if (target.data?.role === "admin" && membership.role !== "owner") return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
    await admin.from("account_team_members").delete().eq("id", String(body.memberId)).eq("team_id", membership.team_id).neq("role", "owner");
  }
  return NextResponse.json({ removed: true });
}
