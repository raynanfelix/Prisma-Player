import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { ownedAssetPaths } from "@/lib/player/assets";
import { deleteR2Object, headR2Object } from "@/lib/storage/r2";
import { detectMp4Faststart } from "@/lib/storage/faststart";
import { VIDEO } from "@/lib/constants";
import { rateLimit } from "@/lib/security/rate-limit";

const { playerConfigs, videoFolders, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `videos-update:${account.accountOwnerId}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const updates: Partial<typeof videos.$inferInsert> = { updatedAt: new Date() };
  if (typeof body?.title === "string") {
    const title = body.title.trim().slice(0, VIDEO.MAX_TITLE_LENGTH);
    if (!title) return NextResponse.json({ error: "invalid_title" }, { status: 400 });
    updates.title = title;
  }
  if (body && "folderId" in body) {
    const folderId = typeof body.folderId === "string" ? body.folderId : null;
    // O POST já validava a pasta; o PATCH não. A FK composta do banco impedia o
    // vazamento, mas devolvia um erro genérico em vez de dizer o que houve.
    if (folderId) {
      try {
        const [folder] = await db.select({ id: videoFolders.id }).from(videoFolders).where(and(eq(videoFolders.id, folderId), eq(videoFolders.userId, account.accountOwnerId))).limit(1);
        if (!folder) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
      } catch {
        return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
      }
    }
    updates.folderId = folderId;
  }

  let faststart: boolean | null | undefined;
  if (body?.status === "ready" || body?.status === "failed") {
    let current: { objectPath: string; status: string; mimeType: string | null } | null = null;
    try {
      current = (await db
        .select({ objectPath: videos.objectPath, status: videos.status, mimeType: videos.mimeType })
        .from(videos)
        .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)))
        .limit(1))[0] ?? null;
    } catch {
      current = null;
    }
    if (!current || current.status !== "processing") return NextResponse.json({ error: "invalid_status_transition" }, { status: 409 });
    if (body.status === "ready") {
      // R2 é o único storage: a confirmação é um HEAD no objeto do próprio vídeo.
      const uploaded = await headR2Object(current.objectPath).then(() => true).catch(() => false);
      if (!uploaded) return NextResponse.json({ error: "uploaded_file_not_found" }, { status: 409 });
      updates.status = "ready";
      const duration = Number(body.durationSeconds);
      if (Number.isFinite(duration) && duration > 0) updates.durationSeconds = String(duration);
      // Faststart (moov antes de mdat): diagnóstico best-effort do fim do
      // upload - só para MP4; null quando indeterminado/erro, nunca derruba
      // a transição. Campo aditivo na resposta deste PATCH.
      faststart = current.mimeType?.toLowerCase() === "video/mp4"
        ? await detectMp4Faststart(current.objectPath).catch(() => null)
        : null;
      if (faststart === false) console.warn("mp4_sem_faststart", { id, objectPath: current.objectPath });
    } else updates.status = "failed";
  }

  try {
    const [data] = await db
      .update(videos)
      .set(updates)
      .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)))
      .returning({ id: videos.id, title: videos.title, folderId: videos.folderId });
    if (!data) return NextResponse.json({ error: "video_update_failed" }, { status: 400 });
    if (body?.status === "ready") {
      // Idempotente: ignora o conflito quando o player já existe (como o
      // `ignoreDuplicates` do SDK antigo). Falha aqui não desfaz o update.
      await db
        .insert(playerConfigs)
        .values({ userId: account.accountOwnerId, videoId: id, config: {}, allowedDomains: [], published: true })
        .onConflictDoNothing({ target: playerConfigs.videoId })
        .catch(() => undefined);
    }
    // Sem transição de status não há campo novo: o contrato do PATCH
    // título/pasta permanece byte a byte igual ao anterior.
    return NextResponse.json(
      faststart === undefined
        ? { video: { id: data.id, title: data.title, folder_id: data.folderId } }
        : { video: { id: data.id, title: data.title, folder_id: data.folderId }, faststart },
    );
  } catch {
    return NextResponse.json({ error: "video_update_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `videos-delete:${account.accountOwnerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  let video: { id: string; objectPath: string } | null = null;
  try {
    video = (await db
      .select({ id: videos.id, objectPath: videos.objectPath })
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)))
      .limit(1))[0] ?? null;
  } catch {
    video = null;
  }
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const config = await db
    .select({ config: playerConfigs.config })
    .from(playerConfigs)
    .where(and(eq(playerConfigs.videoId, id), eq(playerConfigs.userId, account.accountOwnerId)))
    .limit(1)
    .then((rows) => rows[0]?.config ?? {})
    .catch(() => ({}));
  const configRecord = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const assets = Object.values(ownedAssetPaths(configRecord.assets, account.accountOwnerId));

  // Delete no R2 é idempotente; assets falhos abortam a operação para não
  // deixar órfãos pagando armazenamento.
  if (assets.length) {
    try {
      await Promise.all(assets.map((path) => deleteR2Object(path)));
    } catch {
      return NextResponse.json({ error: "player_assets_delete_failed" }, { status: 500 });
    }
  }
  try {
    await deleteR2Object(video.objectPath);
  } catch {
    return NextResponse.json({ error: "video_file_delete_failed" }, { status: 500 });
  }
  try {
    await db.delete(videos).where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "video_delete_failed" }, { status: 500 });
  }
}
