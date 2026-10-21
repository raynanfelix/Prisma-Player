import { NextResponse } from "next/server";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { getStorageUsedBytes } from "@/lib/access/service";
import { db, schema } from "@/lib/db";
import { r2MaxUploadBytes, signR2ReadUrl } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/security/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";
import { VIDEO } from "@/lib/constants";

const { playerConfigs, videoEvents, videoFolders, videos } = schema;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * O caminho do objeto passou a ser montado no servidor. Antes vinha do cliente
 * e era validado contra o id de quem chamava, mas a linha em `videos` é gravada
 * com o id do TITULAR - então um membro de equipe criava arquivos num prefixo
 * que a rotina de exclusão (que filtra pelo prefixo do titular) nunca limparia.
 *
 * No R2 quem escreve é o servidor, então o prefixo é sempre o titular e o
 * cliente não escolhe o caminho.
 */
function buildObjectPath(fileNameHint: unknown, prefixUserId: string): string {
  const safeName = String(fileNameHint ?? "video.mp4")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-150) || "video.mp4";
  return `${prefixUserId}/${crypto.randomUUID()}-${safeName}`;
}

/** Sessões de play por vídeo: contagem de linhas no Postgres (mesma métrica
 * do SDK antigo com `head: true`), agora numa única query agrupada. */
async function countPlaysByVideo(videoIds: string[]) {
  try {
    const rows = await db
      .select({ videoId: videoEvents.videoId, plays: sql<number>`count(*)::int` })
      .from(videoEvents)
      .where(and(eq(videoEvents.eventType, "play"), inArray(videoEvents.videoId, videoIds)))
      .groupBy(videoEvents.videoId);
    return rows.map((row) => [row.videoId, row.plays] as const);
  } catch {
    return [] as Array<readonly [string, number]>;
  }
}

async function listPlayerConfigRefs(videoIds: string[]) {
  try {
    return await db
      .select({ id: playerConfigs.id, videoId: playerConfigs.videoId, published: playerConfigs.published })
      .from(playerConfigs)
      .where(inArray(playerConfigs.videoId, videoIds));
  } catch {
    return [] as Array<{ id: string; videoId: string; published: boolean }>;
  }
}

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const { account, plan } = gate;
  const canView = plan.access.hasAccess;

  const limited = await rateLimit(request, `videos-list:${account.accountOwnerId}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor");
  const folderId = params.get("folderId");
  const status = params.get("status");
  const cursorDate = cursor ? new Date(cursor) : null;

  const conditions = [eq(videos.userId, account.accountOwnerId)];
  if (cursorDate && !Number.isNaN(cursorDate.getTime())) conditions.push(lt(videos.createdAt, cursorDate));
  if (folderId) conditions.push(eq(videos.folderId, folderId));
  if (status && ["draft", "processing", "ready"].includes(status)) conditions.push(eq(videos.status, status));

  let rows: Array<typeof videos.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(videos)
      .where(and(...conditions))
      .orderBy(desc(videos.createdAt), desc(videos.id))
      .limit(VIDEO.LIST_PAGE_SIZE);
  } catch {
    return NextResponse.json({ error: "videos_load_failed" }, { status: 500 });
  }

  const ids = rows.map((video) => video.id);
  // Antes: SELECT sem limite em `video_events` trazendo todos os plays da conta
  // para contar sessões únicas em JavaScript. Como o upsert de eventos já é
  // único por (video_id, session_id, event_type, progress_percent), contar as
  // linhas no Postgres dá o mesmo número sem trafegar nada.
  const [playCounts, configs] = ids.length && canView
    ? await Promise.all([countPlaysByVideo(ids), listPlayerConfigRefs(ids)])
    : [[] as Array<readonly [string, number]>, [] as Array<{ id: string; videoId: string; published: boolean }>];

  const playsByVideo = new Map(playCounts);
  const configByVideo = new Map(configs.map((config) => [config.videoId, config]));
  // Sem acesso pago, a lista continua visível (exportar/excluir/LGPD), mas
  // nada de valor é entregue: sem URL assinada e sem plays. Antes, um trial
  // expirado renovava a entrega do vídeo com um re-poll a cada 15 minutos,
  // contornando o 402 do embed.
  const videosResponse = await Promise.all(rows.map(async (video) => {
    const signedUrl = video.status === "ready" && canView
      ? await signR2ReadUrl(video.objectPath, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null)
      : null;
    const player = configByVideo.get(video.id);
    return {
      id: video.id,
      title: video.title,
      folder_id: video.folderId,
      object_path: video.objectPath,
      mime_type: video.mimeType,
      size_bytes: video.sizeBytes,
      status: video.status,
      duration_seconds: video.durationSeconds,
      created_at: video.createdAt.toISOString(),
      storage_provider: video.storageProvider,
      signed_url: signedUrl,
      plays: canView ? (playsByVideo.get(video.id) ?? 0) : 0,
      player_id: player?.id ?? null,
      published: Boolean(player?.published),
    };
  }));
  const lastRow = rows.at(-1);
  return NextResponse.json(
    { videos: videosResponse, nextCursor: lastRow ? lastRow.createdAt.toISOString() : null },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { userId, account, plan } = gate;

  const limited = await rateLimit(request, `videos-create:${gate.account.accountOwnerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  const sizeBytes = Number(body.sizeBytes);
  const storageProvider = "r2" as const;
  const objectPath = buildObjectPath(body.fileName ?? body.title, account.accountOwnerId);
  const maxBytes = r2MaxUploadBytes();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) return NextResponse.json({ error: "invalid_file_size", maxBytes }, { status: 422 });

  // Quota do plano. Sem isto o armazenamento - e o custo de R2 - não tinha teto.
  const usedBytes = await getStorageUsedBytes(account.accountOwnerId);
  if (usedBytes + sizeBytes > plan.quotas.storageBytes) {
    return NextResponse.json({
      error: "storage_quota_exceeded",
      message: "Seu plano atingiu o limite de armazenamento. Exclua vídeos ou faça upgrade para continuar.",
      usedBytes,
      limitBytes: plan.quotas.storageBytes,
    }, { status: 413 });
  }

  const title = String(body.title ?? "Vídeo").trim().replace(/\s+/g, " ").slice(0, VIDEO.MAX_TITLE_LENGTH);
  const mimeType = String(body.mimeType || "video/mp4").trim().toLowerCase();
  const supportedMime = mimeType.startsWith("video/") || mimeType === "application/vnd.apple.mpegurl";
  if (!title) return NextResponse.json({ error: "invalid_title" }, { status: 422 });
  if (!supportedMime || mimeType.length > 100) return NextResponse.json({ error: "invalid_mime_type" }, { status: 415 });
  const requestedStatus = body.status === "processing" ? "processing" : "ready";
  const folderId = typeof body.folderId === "string" ? body.folderId : null;
  if (folderId) {
    try {
      const [folder] = await db.select({ id: videoFolders.id }).from(videoFolders).where(and(eq(videoFolders.id, folderId), eq(videoFolders.userId, account.accountOwnerId))).limit(1);
      if (!folder) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    } catch {
      return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    }
  }

  try {
    const [row] = await db
      .insert(videos)
      .values({
        userId: account.accountOwnerId,
        folderId,
        title,
        objectPath,
        mimeType,
        sizeBytes,
        status: requestedStatus,
        storageProvider,
      })
      .returning();
    const video = {
      id: row.id,
      user_id: row.userId,
      folder_id: row.folderId,
      title: row.title,
      object_path: row.objectPath,
      mime_type: row.mimeType,
      size_bytes: row.sizeBytes,
      status: row.status,
      duration_seconds: row.durationSeconds,
      storage_provider: row.storageProvider,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: userId,
      event: "video_created",
      properties: { storage_provider: storageProvider, mime_type: mimeType, size_bytes: sizeBytes, status: requestedStatus },
    });
    await posthog.flush();
    if (requestedStatus === "processing") return NextResponse.json({ video }, { status: 201, headers: { Location: `/api/videos/${row.id}` } });
    const [player] = await db
      .insert(playerConfigs)
      .values({ userId: account.accountOwnerId, videoId: row.id, config: {}, allowedDomains: [], published: true })
      .returning({ id: playerConfigs.id })
      .catch(() => []);
    if (!player) return NextResponse.json({ video, warning: "player_create_failed" }, { status: 201 });
    return NextResponse.json({ video: { ...video, player_id: player.id, published: true } }, { status: 201, headers: { Location: `/api/videos/${row.id}` } });
  } catch {
    return NextResponse.json({ error: "video_create_failed" }, { status: 400 });
  }
}
