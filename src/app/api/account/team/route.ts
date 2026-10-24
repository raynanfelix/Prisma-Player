import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/api/request";
import { csrfGuard } from "@/lib/security/csrf";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  acceptTeamInvite,
  buildTeamOverview,
  getTeamContext,
  inviteTeamMember,
  removeFromTeam,
  updateMemberRole,
  type AcceptInviteOutcome,
  type InviteMemberOutcome,
  type UpdateMemberRoleOutcome,
} from "@/lib/account/team";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const overview = await buildTeamOverview(userId);
  if (!overview.membership) {
    return NextResponse.json({ error: "team_not_found", invitations: overview.invitations }, { status: 404 });
  }
  return NextResponse.json({
    team: overview.membership.team,
    currentRole: overview.membership.role,
    seats: overview.seats,
    members: overview.members,
    invites: overview.invites,
    invitations: overview.invitations,
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

  const { membership, seats } = await getTeamContext(userId);

  // Aceite de convite pelo próprio convidado.
  if (body?.action === "accept") {
    return respondToAcceptOutcome(await acceptTeamInvite(userId, String(body.inviteId ?? "")));
  }

  const limited = await rateLimit(request, `account-team-invite:${userId}`, { max: 10, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (seats <= 1) return NextResponse.json({ error: "team_not_in_plan" }, { status: 403 });
  // M1: o papel do INVITADOR viaja junto - só o owner cria admin por convite.
  return respondToInviteOutcome(await inviteTeamMember(membership.role, userId, membership.team_id, seats, body?.email, body?.role));
}

export async function PATCH(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-team-role:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const { membership } = await getTeamContext(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ role?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  return respondToRoleOutcome(await updateMemberRole(membership.role, membership.team_id, parsed.body?.memberId, parsed.body?.role));
}

export async function DELETE(request: Request) {
  const csrf = csrfGuard(request);
  if (csrf) return csrf;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, `account-team-remove:${userId}`, { max: 15, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;
  const { membership } = await getTeamContext(userId);
  if (!membership || !["owner", "admin"].includes(membership.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = await readJsonBody<{ inviteId?: unknown; memberId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const outcome = await removeFromTeam(membership.role, membership.team_id, parsed.body?.inviteId, parsed.body?.memberId);
  return outcome.status === "removed"
    ? NextResponse.json({ removed: true })
    : NextResponse.json({ error: outcome.status }, { status: 403 });
}

function respondToAcceptOutcome(outcome: AcceptInviteOutcome): NextResponse {
  switch (outcome.status) {
    case "accepted": return NextResponse.json({ accepted: true });
    case "invalid_invite": return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    case "invite_not_available": return NextResponse.json({ error: "invite_not_available" }, { status: 404 });
    case "seat_limit_reached": return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
    case "member_create_failed": return NextResponse.json({ error: "member_create_failed" }, { status: 500 });
  }
}

function respondToInviteOutcome(outcome: InviteMemberOutcome): NextResponse {
  switch (outcome.status) {
    case "invited": return NextResponse.json({ invited: true });
    case "invalid_invite": return NextResponse.json({ error: "invalid_invite" }, { status: 400 });
    case "owner_required_for_admin_role": return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
    case "seat_limit_reached": return NextResponse.json({ error: "seat_limit_reached" }, { status: 409 });
    case "invite_create_failed": return NextResponse.json({ error: "invite_create_failed" }, { status: 500 });
  }
}

function respondToRoleOutcome(outcome: UpdateMemberRoleOutcome): NextResponse {
  switch (outcome.status) {
    case "updated": return NextResponse.json({ updated: true });
    case "invalid_role": return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    case "member_not_editable": return NextResponse.json({ error: "member_not_editable" }, { status: 400 });
    case "owner_required_for_admin_role": return NextResponse.json({ error: "owner_required_for_admin_role" }, { status: 403 });
  }
}
