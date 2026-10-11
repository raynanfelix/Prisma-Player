import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { audit, CASE_CATEGORIES, CASE_PRIORITIES, CASE_STATUSES, validateCaseInput } from "@/lib/admin/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";

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
  const admin = createAdminClient();

  if (body.caseId === undefined) {
    const input = { userId: body.userId == null ? null : String(body.userId), subject: String(body.subject ?? ""), category: String(body.category ?? "geral"), priority: String(body.priority ?? "normal") };
    const invalid = validateCaseInput(input);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (input.userId) {
      const { data: profile } = await admin.from("profiles").select("id").eq("id", input.userId).maybeSingle();
      if (!profile) return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }
    const { data, error } = await admin.from("support_cases").insert({
      user_id: input.userId || null, subject: input.subject.trim().replace(/\s+/g, " "),
      category: input.category, priority: input.priority, assignee_admin_id: gate.adminId,
    }).select("id").single();
    if (error || !data) return NextResponse.json({ error: "case_create_failed" }, { status: 400 });
    await audit(gate.adminId, "support_case_opened", input.userId || null, { case_id: data.id });
    return NextResponse.json({ created: true, id: data.id }, { headers: { "cache-control": "no-store" } });
  }

  const caseId = String(body.caseId);
  if (!uuid.test(caseId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!CASE_STATUSES.includes(body.status as (typeof CASE_STATUSES)[number])) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    update.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!CASE_PRIORITIES.includes(body.priority as (typeof CASE_PRIORITIES)[number])) return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
    update.priority = body.priority;
  }
  if (body.assignee !== undefined) {
    const assignee = String(body.assignee);
    if (assignee !== "" && !uuid.test(assignee)) return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });
    update.assignee_admin_id = assignee || null;
  }
  const { error } = await admin.from("support_cases").update(update).eq("id", caseId);
  if (error) return NextResponse.json({ error: "case_update_failed" }, { status: 400 });
  const { data: target } = await admin.from("support_cases").select("user_id").eq("id", caseId).maybeSingle();
  await audit(gate.adminId, "support_case_updated", target?.user_id ?? null, { case_id: caseId, ...update });
  return NextResponse.json({ updated: true }, { headers: { "cache-control": "no-store" } });
}
