import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const { videoFolders } = schema;

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;

  try {
    const rows = await db
      .select({ id: videoFolders.id, name: videoFolders.name, createdAt: videoFolders.createdAt })
      .from(videoFolders)
      .where(eq(videoFolders.userId, gate.account.accountOwnerId))
      .orderBy(desc(videoFolders.createdAt))
      .limit(200);
    const folders = rows.map((folder) => ({ id: folder.id, name: folder.name, created_at: folder.createdAt.toISOString() }));
    return NextResponse.json({ folders });
  } catch {
    return NextResponse.json({ error: "folders_load_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `folders-create:${gate.account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ name?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const name = typeof parsed.body?.name === "string" ? parsed.body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  try {
    const [row] = await db.insert(videoFolders).values({ userId: gate.account.accountOwnerId, name }).returning();
    return NextResponse.json(
      { folder: { id: row.id, user_id: row.userId, name: row.name, created_at: row.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "folder_create_failed" }, { status: 400 });
  }
}
