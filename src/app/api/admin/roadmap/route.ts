import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { adminGuard } from "@/lib/api/admin-guard";
import { readJsonBody } from "@/lib/api/request";
import { normalizeRoadmapText, validateRoadmapTask, type RoadmapStage } from "@/lib/admin/roadmap";
import { audit } from "@/lib/admin/support";
import { rateLimit } from "@/lib/security/rate-limit";
import { db, schema } from "@/lib/db";

const { roadmapTasks } = schema;

/** Roadmap admin: lista o kanban inteiro (ordenado por mais recentes primeiro). */
export async function GET(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-roadmap:${gate.adminId}`, { max: 60, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const tasks = await db.select().from(roadmapTasks).orderBy(desc(roadmapTasks.updatedAt)).limit(500);
  return NextResponse.json({ tasks }, { headers: { "cache-control": "no-store" } });
}

/** Roadmap admin: cria task (default coluna Backlog). */
export async function POST(request: Request) {
  const gate = await adminGuard(request);
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `admin-roadmap:${gate.adminId}`, { max: 60, windowMs: 60_000, failClosed: true });
  if (limited) return limited;

  const parsed = await readJsonBody<{ title?: unknown; description?: unknown; requesterName?: unknown; stage?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  const input = {
    title: body.title,
    description: body.description,
    requesterName: body.requesterName,
    stage: body.stage ?? "backlog",
  };
  const invalid = validateRoadmapTask(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const title = normalizeRoadmapText(String(body.title));
  const description = body.description == null ? null : String(body.description).trim();
  const requesterName = body.requesterName == null ? null : String(body.requesterName).trim();
  const stage = input.stage as RoadmapStage;

  const [created] = await db.insert(roadmapTasks).values({
    title,
    description: description || null,
    requesterName: requesterName || null,
    stage,
  }).returning({ id: roadmapTasks.id });
  if (!created) return NextResponse.json({ error: "task_create_failed" }, { status: 400 });

  await audit(gate.adminId, "roadmap_task_created", null, { task_id: created.id, stage, title: title.slice(0, 80) });
  return NextResponse.json({ created: true, id: created.id }, { headers: { "cache-control": "no-store" } });
}
