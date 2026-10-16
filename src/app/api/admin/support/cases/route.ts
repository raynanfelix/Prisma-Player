import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { audit, CASE_CATEGORIES, CASE_PRIORITIES, CASE_STATUSES, validateCaseInput } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const { profiles, supportCases } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Suporte: abre caso, atualiza status/prioridade/responsável. */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-support:${gate.adminId}`, { max: 60, windowMs: 10 * 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ caseId?: unknown; userId?: unknown; subject?: unknown; category?: unknown; priority?: unknown; status?: unknown; assignee?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  if (body.caseId === undefined) {
    const input = { userId: body.userId == null ? null : String(body.userId), subject: String(body.subject ?? ""), category: String(body.category ?? "geral"), priority: String(body.priority ?? "normal") };
    const invalid = validateCaseInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (input.userId) {
      const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, input.userId)).limit(1);
      if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }
    const [created] = await db.insert(supportCases).values({
      userId: input.userId || null,
      subject: input.subject.trim().replace(/\s+/g, " "),
      category: input.category,
      priority: input.priority,
      assigneeAdminId: gate.adminId,
    }).returning({ id: supportCases.id });
    if (!created) return NextResponse.json({ error: "case_create_failed" }, { status: 400 });
    await audit(gate.adminId, "support_case_opened", input.userId || null, { case_id: created.id });
    return NextResponse.json({ created: true, id: created.id }, { headers: { "cache-control": "no-store" } });
  }

  const caseId = String(body.caseId);
  if (!uuid.test(caseId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const updatedAt = new Date();
  const patch: Partial<typeof supportCases.$inferInsert> = { updatedAt };
  const auditDetails: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!CASE_STATUSES.includes(body.status as (typeof CASE_STATUSES)[number])) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    patch.status = String(body.status);
    auditDetails.status = String(body.status);
  }
  if (body.priority !== undefined) {
    if (!CASE_PRIORITIES.includes(body.priority as (typeof CASE_PRIORITIES)[number])) return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
    patch.priority = String(body.priority);
    auditDetails.priority = String(body.priority);
  }
  if (body.assignee !== undefined) {
    const assignee = String(body.assignee);
    if (assignee !== "" && !uuid.test(assignee)) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });
    patch.assigneeAdminId = assignee || null;
    auditDetails.assignee_admin_id = assignee || null;
  }
  try {
    await db.update(supportCases).set(patch).where(eq(supportCases.id, caseId));
  } catch {
    return NextResponse.json({ error: "case_update_failed" }, { status: 400 });
  }
  const [target] = await db.select({ userId: supportCases.userId }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
  await audit(gate.adminId, "support_case_updated", target?.userId ?? null, { case_id: caseId, ...auditDetails, updated_at: updatedAt.toISOString() });
  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
