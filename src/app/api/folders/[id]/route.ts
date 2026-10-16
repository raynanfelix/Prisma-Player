import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { db, schema } from "@/lib/db";
import { rateLimit } from "@/lib/security/rate-limit";

const { videoFolders } = schema;

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;

  const limited = await rateLimit(request, `folders-delete:${gate.account.accountOwnerId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  try {
    await db.delete(videoFolders).where(and(eq(videoFolders.id, id), eq(videoFolders.userId, gate.account.accountOwnerId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "folder_delete_failed" }, { status: 400 });
  }
}
