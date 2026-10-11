import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedAssetPaths } from "@/lib/player/assets";
import { deleteR2Object, headR2Object } from "@/lib/storage/r2";
import { VIDEO } from "@/lib/constants";
import { rateLimit } from "@/lib/security/rate-limit";

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

  const supabase = createAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
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
      const folder = await supabase.from("video_folders").select("id").eq("id", folderId).eq("user_id", account.accountOwnerId).maybeSingle();
      if (!folder.data) return NextResponse.json({ error: "folder_not_found" }, { status: 404 });
    }
    updates.folder_id = folderId;
  }

  if (body?.status === "ready" || body?.status === "failed") {
    const { data: current } = await supabase.from("videos").select("object_path,status,storage_provider").eq("id", id).eq("user_id", account.accountOwnerId).maybeSingle();
    if (!current || current.status !== "processing") return NextResponse.json({ error: "invalid_status_transition" }, { status: 409 });
    if (body.status === "ready") {
      // A verificação olhava sempre o Supabase Storage, mesmo com o vídeo no R2
      // (o caminho padrão): todo finalize de vídeo em R2 falhava por aqui.
      const uploaded = current.storage_provider === "r2"
        ? await headR2Object(current.object_path).then(() => true).catch(() => false)
        : await (async () => {
            const separator = current.object_path.lastIndexOf("/");
            const folder = current.object_path.slice(0, separator);
            const fileName = current.object_path.slice(separator + 1);
            const { data: objects, error: storageError } = await supabase.storage.from("videos").list(folder, { search: fileName, limit: 2 });
            return !storageError && Boolean(objects?.some((object) => object.name === fileName));
          })();
      if (!uploaded) return NextResponse.json({ error: "uploaded_file_not_found" }, { status: 409 });
      updates.status = "ready";
      const duration = Number(body.durationSeconds);
      if (Number.isFinite(duration) && duration > 0) updates.duration_seconds = duration;
    } else updates.status = "failed";
  }

  const { data, error } = await supabase.from("videos").update(updates).eq("id", id).eq("user_id", account.accountOwnerId).select("id,title,folder_id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "video_update_failed" }, { status: 400 });
  if (body?.status === "ready") await supabase.from("player_configs").upsert({ user_id: account.accountOwnerId, video_id: id, config: {}, allowed_domains: [], published: true }, { onConflict: "video_id", ignoreDuplicates: true });
  return NextResponse.json({ video: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await guard(request, { csrf: true, role: "manage" });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `videos-delete:${account.accountOwnerId}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: video, error: videoError } = await supabase.from("videos").select("id,object_path,storage_provider").eq("id", id).eq("user_id", account.accountOwnerId).maybeSingle();
  if (videoError || !video) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const { data: playerConfig } = await supabase.from("player_configs").select("config").eq("video_id", id).eq("user_id", account.accountOwnerId).maybeSingle();
  const config = playerConfig?.config && typeof playerConfig.config === "object" ? playerConfig.config as Record<string, unknown> : {};
  const assets = Object.values(ownedAssetPaths(config.assets, account.accountOwnerId));

  if (assets.length) {
    const { error: assetError } = await supabase.storage.from("player-assets").remove(assets);
    if (assetError) return NextResponse.json({ error: "player_assets_delete_failed" }, { status: 500 });
  }
  if (video.storage_provider === "r2") {
    try { await deleteR2Object(video.object_path); } catch { return NextResponse.json({ error: "video_file_delete_failed" }, { status: 500 }); }
  } else {
    const { error: videoStorageError } = await supabase.storage.from("videos").remove([video.object_path]);
    if (videoStorageError) return NextResponse.json({ error: "video_file_delete_failed" }, { status: 500 });
  }
  const { error: deleteError } = await supabase.from("videos").delete().eq("id", id).eq("user_id", account.accountOwnerId);
  return deleteError ? NextResponse.json({ error: "video_delete_failed" }, { status: 500 }) : NextResponse.json({ ok: true });
}
