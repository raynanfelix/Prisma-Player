import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { audit } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mesma regra de getCurrentAdminUser(): papéis separados por vírgula. */
const ROLE_IS_ADMIN_SQL = sql.raw(`role ~ '(^|,)admin(,|$)'`);

/**
 * Equipe: promove/rebaixa papel administrativo. No Managed Neon Auth o papel
 * vive em `neon_auth."user".role` (plugin Admin do Better Auth) - o mesmo
 * campo lido por getCurrentAdminUser(); a promoção do primeiro admin é via SQL
 * (docs/neon-migration/neon-auth-setup.md §5), e esta rota usa o mesmo mecanismo.
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

  let target: { id: string; role: string | null } | undefined;
  try {
    const targetResult = await db.execute<{ id: string; role: string | null }>(
      sql`select id, role from neon_auth."user" where id = ${userId} limit 1`,
    );
    target = targetResult.rows[0];
  } catch {
    return NextResponse.json({ error: "team_list_failed" }, { status: 500 });
  }
  if (!target) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
  if (role === "user") {
    try {
      const adminCountResult = await db.execute<{ total: number }>(
        sql`select count(*)::int as total from neon_auth."user" where ${ROLE_IS_ADMIN_SQL}`,
      );
      if ((adminCountResult.rows[0]?.total ?? 0) <= 1) return NextResponse.json({ error: "last_admin" }, { status: 409 });
    } catch {
      return NextResponse.json({ error: "team_list_failed" }, { status: 500 });
    }
  }

  const previous = typeof target.role === "string" && target.role ? target.role : "user";
  try {
    await db.execute(sql`update neon_auth."user" set role = ${role} where id = ${userId}`);
  } catch {
    return NextResponse.json({ error: "team_role_failed" }, { status: 500 });
  }

  await audit(gate.adminId, "team_role_changed", userId, { from: previous, to: role });
  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
