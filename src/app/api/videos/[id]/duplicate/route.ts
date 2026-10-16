import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { getStorageUsedBytes } from "@/lib/access/service";
import { db, schema } from "@/lib/db";
import { copyR2Object, deleteR2Object } from "@/lib/storage/r2";
import { VIDEO } from "@/lib/constants";
import { rateLimit } from "@/lib/security/rate-limit";

const { playerConfigs, videos } = schema;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account, plan } = gate;

  const limited = await rateLimit(request, `videos-duplicate:${account.accountOwnerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  let original: typeof videos.$inferSelect | null = null;
  try {
    original = (await db
      .select()
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId), eq(videos.status, "ready")))
      .limit(1))[0] ?? null;
  } catch {
    original = null;
  }
  if (!original) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  // Duplicar consome exatamente o mesmo espaço do original: a quota vale aqui
  // igual ao upload, senão o limite de armazenamento é contornável com um clique.
  const usedBytes = await getStorageUsedBytes(account.accountOwnerId);
  if (usedBytes + Number(original.sizeBytes || 0) > plan.quotas.storageBytes) {
    return NextResponse.json({
      error: "storage_quota_exceeded",
      message: "Seu plano atingiu o limite de armazenamento. Exclua vídeos ou faça upgrade para continuar.",
      usedBytes,
      limitBytes: plan.quotas.storageBytes,
    }, { status: 413 });
  }

  const extension = original.objectPath.includes(".") ? `.${original.objectPath.split(".").pop()}` : "";
  // Mesmo prefixo do titular usado na criação, para que a exclusão encontre o arquivo.
  const objectPath = `${account.accountOwnerId}/${crypto.randomUUID()}-copy${extension}`;
  const cleanup = () => deleteR2Object(objectPath).catch(() => undefined);

  try {
    await copyR2Object(original.objectPath, objectPath, original.mimeType);
  } catch {
    return NextResponse.json({ error: "video_copy_failed" }, { status: 500 });
  }

  try {
    const [row] = await db
      .insert(videos)
      .values({
        userId: account.accountOwnerId,
        title: `${original.title} (cópia)`.slice(0, VIDEO.MAX_TITLE_LENGTH),
        folderId: original.folderId,
        objectPath,
        mimeType: original.mimeType,
        sizeBytes: original.sizeBytes,
        durationSeconds: original.durationSeconds,
        status: "ready",
        storageProvider: "r2",
      })
      .returning({ id: videos.id });
    try {
      await db.insert(playerConfigs).values({ userId: account.accountOwnerId, videoId: row.id, config: {}, allowedDomains: [], published: true });
    } catch {
      await db.delete(videos).where(and(eq(videos.id, row.id), eq(videos.userId, account.accountOwnerId))).catch(() => undefined);
      await cleanup();
      return NextResponse.json({ error: "player_duplicate_failed" }, { status: 500 });
    }
    return NextResponse.json({ video: { id: row.id } }, { status: 201 });
  } catch {
    await cleanup();
    return NextResponse.json({ error: "video_duplicate_failed" }, { status: 500 });
  }
}
