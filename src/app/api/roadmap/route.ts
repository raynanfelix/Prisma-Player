import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { normalizeRoadmapText, validateRoadmapTask } from "@/lib/roadmap";
import { db, schema } from "@/lib/db";

const { profiles, roadmapTasks } = schema;

/** Roadmap público do produto: qualquer usuário autenticado vê e sugere. */
export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;

  const tasks = await db.select().from(roadmapTasks).orderBy(desc(roadmapTasks.updatedAt)).limit(500);
  return NextResponse.json({ tasks }, { headers: { "cache-control": "no-store" } });
}

/** Sugestão de cliente: qualquer usuário autenticado cria task (default Backlog). */
export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true });
  if (!gate.ok) return gate.response;

  const parsed = await readJsonBody<{ title?: unknown; description?: unknown; requesterName?: unknown; stage?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};

  const input = {
    title: body.title,
    description: body.description,
    requesterName: body.requesterName,
    stage: "backlog",
  };
  const invalid = validateRoadmapTask(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const title = normalizeRoadmapText(String(body.title));
  const description = body.description == null ? null : String(body.description).trim();

  let requesterName = body.requesterName == null ? null : String(body.requesterName).trim();
  if (!requesterName) {
    const [profile] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, gate.userId)).limit(1);
    requesterName = profile?.fullName ?? null;
  }

  const [created] = await db.insert(roadmapTasks).values({
    title,
    description: description || null,
    requesterName: requesterName || null,
    stage: "backlog",
  }).returning({ id: roadmapTasks.id });
  if (!created) return NextResponse.json({ error: "task_create_failed" }, { status: 400 });

  return NextResponse.json({ created: true, id: created.id }, { headers: { "cache-control": "no-store" } });
}
