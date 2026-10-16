import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { getStorageUsedBytes } from "@/lib/access/service";
import { db, schema } from "@/lib/db";
import { abortR2MultipartUpload, completeR2MultipartUpload, createR2MultipartUpload, describeR2Error, signR2UploadPart } from "@/lib/storage/r2";
import { detectMp4Faststart } from "@/lib/storage/faststart";
import { VIDEO } from "@/lib/constants";
import { rateLimit } from "@/lib/security/rate-limit";

const { playerConfigs, videos } = schema;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { userId, account, plan } = gate;

  const limited = await rateLimit(request, `video-upload:${account.accountOwnerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await params;
  // O corpo aqui carrega a lista de partes concluídas: teto maior que o padrão,
  // mas ainda medido em bytes reais (10k partes × ~90 bytes cabem folgados).
  const parsed = await readJsonBody<Record<string, unknown>>(request, 2 * 1024 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const action = body?.action;

  let video: { id: string; objectPath: string; mimeType: string; sizeBytes: number; status: string } | null = null;
  try {
    video = (await db
      .select({ id: videos.id, objectPath: videos.objectPath, mimeType: videos.mimeType, sizeBytes: videos.sizeBytes, status: videos.status })
      .from(videos)
      .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)))
      .limit(1))[0] ?? null;
  } catch {
    video = null;
  }
  if (!video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  try {
    if (action === "create") {
      if (video.status !== "processing") return NextResponse.json({ error: "invalid_status" }, { status: 409 });
      const uploadId = await createR2MultipartUpload(video.objectPath, video.mimeType, { owner: account.accountOwnerId, actor: userId, video: video.id });
      return NextResponse.json({ uploadId, partSize: VIDEO.MULTIPART_PART_SIZE });
    }
    const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
    if (!uploadId || uploadId.length > VIDEO.MULTIPART_UPLOAD_ID_MAX_LENGTH) return NextResponse.json({ error: "invalid_upload_id" }, { status: 422 });
    if (action === "sign") {
      const partNumber = Number(body?.partNumber);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > VIDEO.MULTIPART_MAX_PARTS) return NextResponse.json({ error: "invalid_part_number" }, { status: 422 });
      return NextResponse.json({ url: await signR2UploadPart(video.objectPath, uploadId, partNumber) });
    }
    if (action === "abort") {
      await abortR2MultipartUpload(video.objectPath, uploadId);
      await db.update(videos).set({ status: "failed" }).where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)));
      return NextResponse.json({ ok: true });
    }
    if (action === "complete") {
      const rawParts = Array.isArray(body?.parts) ? body.parts : [];
      const parts = rawParts.map((part) => ({ ETag: String((part as Record<string, unknown>).etag ?? ""), PartNumber: Number((part as Record<string, unknown>).partNumber) }));
      if (!parts.length || parts.length > VIDEO.MULTIPART_MAX_PARTS || parts.some((part) => !part.ETag || !Number.isInteger(part.PartNumber))) return NextResponse.json({ error: "invalid_parts" }, { status: 422 });
      const head = await completeR2MultipartUpload(video.objectPath, uploadId, parts.sort((a, b) => a.PartNumber - b.PartNumber));
      if (Number(head.ContentLength) !== Number(video.sizeBytes)) return NextResponse.json({ error: "uploaded_size_mismatch" }, { status: 409 });
      // Revalida a quota no momento da conclusão com o tamanho real: dois
      // uploads concorrentes passavam no POST e estouravam o plano. O trigger
      // videos_atomic_storage_quota é a barreira atômica final; aqui devolvemos
      // o 413 amigável da convenção do produto.
      const realSize = Number(head.ContentLength) || Number(video.sizeBytes) || 0;
      const usedBytes = await getStorageUsedBytes(account.accountOwnerId);
      const delta = realSize - (Number(video.sizeBytes) || 0);
      if (usedBytes + delta > plan.quotas.storageBytes) {
        await db.update(videos).set({ status: "failed" }).where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)));
        return NextResponse.json({ error: "storage_quota_exceeded", usedBytes, limitBytes: plan.quotas.storageBytes }, { status: 413 });
      }
      const durationSeconds = Number(body?.durationSeconds);
      await db
        .update(videos)
        .set({ status: "ready", durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? String(durationSeconds) : null })
        .where(and(eq(videos.id, id), eq(videos.userId, account.accountOwnerId)));
      // Idempotente (como o `ignoreDuplicates` do SDK antigo): player já
      // existente permanece intocado.
      await db
        .insert(playerConfigs)
        .values({ userId: account.accountOwnerId, videoId: id, config: {}, allowedDomains: [], published: true })
        .onConflictDoNothing({ target: playerConfigs.videoId });
      // Faststart (moov antes de mdat): diagnóstico best-effort do fim do
      // upload — só para MP4; null quando indeterminado/erro, nunca derruba
      // o complete. Campo aditivo na resposta.
      const faststart = video.mimeType?.toLowerCase() === "video/mp4"
        ? await detectMp4Faststart(video.objectPath).catch(() => null)
        : null;
      if (faststart === false) console.warn("mp4_sem_faststart", { id, objectPath: video.objectPath });
      return NextResponse.json({ ok: true, faststart });
    }
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    const diagnostic = describeR2Error(error);
    console.error("r2 multipart operation failed", {
      action,
      videoId: id,
      code: diagnostic.providerCode,
      status: diagnostic.status,
      requestId: diagnostic.requestId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: diagnostic.code, message: diagnostic.message }, { status: 502 });
  }
}
