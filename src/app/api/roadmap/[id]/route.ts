import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { guard } from "@/lib/api/guard";
import { getCurrentAdminUser } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/api/request";
import { normalizeRoadmapText, validateRoadmapPatch, type RoadmapStage, ROADMAP_STAGES } from "@/lib/roadmap";
import { audit } from "@/lib/admin/support";
import { db, schema } from "@/lib/db";

const { roadmapTasks } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Roadmap: move (stage) e/ou edita uma task. Só admin avança as etapas
 * (clientes criam sugestões; a triagem é da equipe).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const gate = await guard(request, { csrf: true });
  if (!gate.ok) return gate.response;

  const admin = await getCurrentAdminUser();
  if (!admin) return NextResponse.json({ error: "admin_required" }, { status: 403 });

  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const parsed = await readJsonBody<{ stage?: unknown; title?: unknown; description?: unknown; requesterName?: unknown }>(request);
  if (!parsed.ok) {
    console.error("[roadmap PATCH] JSON parse error:", parsed.response);
    return parsed.response;
  }
  const body = parsed.body ?? {};
  console.log("[roadmap PATCH] received body:", JSON.stringify(body));

  const check = validateRoadmapPatch(body);
  if (check.error) {
    console.error("[roadmap PATCH] validation error:", check.error, "hasChanges:", check.hasChanges, "body:", JSON.stringify(body), "validStages:", ROADMAP_STAGES);
    return NextResponse.json({ error: check.error, details: check, validStages: ROADMAP_STAGES, receivedStage: body.stage, receivedBody: body }, { status: 400 });
  }

  const patch: Partial<typeof roadmapTasks.$inferInsert> = { updatedAt: new Date() };
  const auditDetails: Record<string, unknown> = { task_id: id };
  if (body.stage !== undefined) {
    const stage = body.stage as RoadmapStage;
    patch.stage = stage;
    auditDetails.stage = stage;
  }
  if (body.title !== undefined) {
    const title = normalizeRoadmapText(String(body.title));
    patch.title = title;
    auditDetails.title = title.slice(0, 80);
  }
  if (body.description !== undefined) {
    const description = body.description == null ? null : String(body.description).trim();
    patch.description = description || null;
  }
  if (body.requesterName !== undefined) {
    const requesterName = body.requesterName == null ? null : String(body.requesterName).trim();
    patch.requesterName = requesterName || null;
  }

  try {
    const [updated] = await db.update(roadmapTasks).set(patch).where(eq(roadmapTasks.id, id)).returning({ id: roadmapTasks.id, stage: roadmapTasks.stage });
    if (!updated) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    const action = body.stage !== undefined && Object.keys(body).length === 1 ? "roadmap_task_moved" : "roadmap_task_updated";
    await audit(admin.id, action, null, auditDetails);
    return NextResponse.json({ updated: true, stage: updated.stage }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "task_update_failed" }, { status: 400 });
  }
}

/** Roadmap: remove uma task. Só admin. */
export async function DELETE(request: Request, context: RouteContext) {
  const gate = await guard(request, { csrf: true });
  if (!gate.ok) return gate.response;

  const admin = await getCurrentAdminUser();
  if (!admin) return NextResponse.json({ error: "admin_required" }, { status: 403 });

  const { id } = await context.params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const [deleted] = await db.delete(roadmapTasks).where(eq(roadmapTasks.id, id)).returning({ id: roadmapTasks.id });
  if (!deleted) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

  await audit(admin.id, "roadmap_task_deleted", null, { task_id: id });
  return NextResponse.json({ deleted: true }, { headers: { "cache-control": "no-store" } });
}
