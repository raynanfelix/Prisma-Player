import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { getStorageUsedBytes } from "@/lib/access/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { r2MaxUploadBytes, signR2ReadUrl } from "@/lib/storage/r2";
import { rateLimit } from "@/lib/security/rate-limit";
import { getPostHogClient } from "@/lib/posthog-server";
import { VIDEO } from "@/lib/constants";

/**
 * O caminho do objeto passou a ser montado no servidor. Antes vinha do cliente
 * e era validado contra o id de quem chamava, mas a linha em `videos` é gravada
 * com o id do TITULAR — então um membro de equipe criava arquivos num prefixo
 * que a rotina de exclusão (que filtra pelo prefixo do titular) nunca limparia.
 *
 * O prefixo difere por backend de propósito: no R2 quem escreve é o servidor,
 * então usamos o titular; no Supabase Storage o upload é feito pelo navegador e
 * a policy exige `(storage.foldername(name))[1] = auth.uid()`, então usamos o
 * id de quem envia. Em ambos os casos o cliente não escolhe mais o caminho.
 */
function buildObjectPath(fileNameHint: unknown, prefixUserId: string): string {
  const safeName = String(fileNameHint ?? "video.mp4")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(-150) || "video.mp4";
  return `${prefixUserId}/${crypto.randomUUID()}-${safeName}`;
}

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `videos-list:${account.accountOwnerId}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const cursor = params.get("cursor");
  const folderId = params.get("folderId");
  const status = params.get("status");
  const supabase = createAdminClient();
  let query = supabase.from("videos").select("id,title,folder_id,object_path,mime_type,size_bytes,status,duration_seconds,created_at,storage_provider").eq("user_id", account.accountOwnerId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(VIDEO.LIST_PAGE_SIZE);
  if (cursor) query = query.lt("created_at", cursor);
  if (folderId) query = query.eq("folder_id", folderId);
  if (status && ["draft", "processing", "ready"].includes(status)) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "videos_load_failed" }, { status: 500 });

  const ids = (data ?? []).map((video) => video.id);
  // Antes: SELECT sem limite em `video_events` trazendo todos os plays da conta
  // para contar sessões únicas em JavaScript. Como o upsert de eventos já é
  // único por (video_id, session_id, event_type, progress_percent), contar as
  // linhas no Postgres com `head: true` dá o mesmo número sem trafegar nada.
  const [playCounts, configs] = ids.length
    ? await Promise.all([
        Promise.all(ids.map(async (videoId) => {
          const { count } = await supabase.from("video_events").select("session_id", { count: "exact", head: true }).eq("video_id", videoId).eq("event_type", "play");
          return [videoId, count ?? 0] as const;
        })),
        supabase.from("player_configs").select("id,video_id,published").in("video_id", ids).then((result) => result.data ?? []),
      ])
    : [[] as Array<readonly [string, number]>, [] as Array<{ id: string; video_id: string; published: boolean }>];

  const playsByVideo = new Map(playCounts);
  const configByVideo = new Map(configs.map((config) => [config.video_id, config]));
  const videos = await Promise.all((data ?? []).map(async (video) => {
    const signedUrl = video.status === "ready"
      ? video.storage_provider === "r2"
        ? await signR2ReadUrl(video.object_path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS).catch(() => null)
        : (await supabase.storage.from("videos").createSignedUrl(video.object_path, VIDEO.R2_SIGNED_URL_EXPIRY_SECONDS)).data?.signedUrl ?? null
      : null;
    const player = configByVideo.get(video.id);
    return { ...video, signed_url: signedUrl, plays: playsByVideo.get(video.id) ?? 0, player_id: player?.id ?? null, published: Boolean(player?.published) };
  }));
  return NextResponse.json({ videos, nextCursor: data?.at(-1)?.created_at ?? null }, { headers: { "cache-control": "private, no-store" } });
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
  const supabase = createAdminClient();
  const sizeBytes = Number(body.sizeBytes);
  const storageProvider = "r2";
  const objectPath = buildObjectPath(body.fileName ?? body.title, account.accountOwnerId);
  const maxBytes = r2MaxUploadBytes();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) return NextResponse.json({ error: "invalid_file_size", maxBytes }, { status: 422 });

  // Quota do plano. Sem isto o armazenamento — e o custo de R2 — não tinha teto.
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
    const folder = await supabase.from("video_folders").select("id").eq("id", folderId).eq("user_id", account.accountOwnerId).maybeSingle();
    if (!folder.data) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
  }
  const { data, error } = await supabase.from("videos").insert({ user_id: account.accountOwnerId, folder_id: folderId, title, object_path: objectPath, mime_type: mimeType, size_bytes: sizeBytes, status: requestedStatus, storage_provider: storageProvider }).select().single();
  if (error || !data) return NextResponse.json({ error: "video_create_failed" }, { status: 400 });
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId,
    event: "video_created",
    properties: { storage_provider: storageProvider, mime_type: mimeType, size_bytes: sizeBytes, status: requestedStatus },
  });
  await posthog.flush();
  if (requestedStatus === "processing") return NextResponse.json({ video: data }, { status: 201, headers: { Location: `/api/videos/${data.id}` } });
  const { data: player, error: playerError } = await supabase.from("player_configs").insert({ user_id: account.accountOwnerId, video_id: data.id, config: {}, allowed_domains: [], published: true }).select("id").single();
  if (playerError) return NextResponse.json({ video: data, warning: "player_create_failed" }, { status: 201 });
  return NextResponse.json({ video: { ...data, player_id: player.id, published: true } }, { status: 201, headers: { Location: `/api/videos/${data.id}` } });
}
