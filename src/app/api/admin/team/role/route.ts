import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { audit } from "@/lib/admin/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Equipe: promove/rebaixa papel administrativo (app_metadata.role).
 * Travas: nunca a si mesmo; nunca rebaixar o último admin.
 */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-team:${gate.adminId}`, { max: 20, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ userId?: unknown; role?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const userId = String(parsed.body?.userId ?? "");
  const role = String(parsed.body?.role ?? "");
  if (!uuid.test(userId) || !["admin", "user"].includes(role)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (userId === gate.adminId) return NextResponse.json({ error: "cannot_change_self" }, { status: 400 });

  const admin = createAdminClient();
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return NextResponse.json({ error: "team_list_failed" }, { status: 500 });
  const target = listed.users.find((user) => user.id === userId);
  if (!target) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (role === "user") {
    const adminCount = listed.users.filter((user) => user.app_metadata?.role === "admin").length;
    if (adminCount <= 1) return NextResponse.json({ error: "last_admin" }, { status: 409 });
  }

  const previous = typeof target.app_metadata?.role === "string" ? target.app_metadata.role : "user";
  const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...target.app_metadata, role } });
  if (error) return NextResponse.json({ error: "team_role_failed" }, { status: 500 });

  await audit(gate.adminId, "team_role_changed", userId, { from: previous, to: role });
  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
