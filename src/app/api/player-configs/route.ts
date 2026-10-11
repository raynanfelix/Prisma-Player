import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedAssetPaths } from "@/lib/player/assets";
import { purgeEmbedManifest } from "@/lib/cache/embed-purge";
import { normalizePixelConfig, pixelConfigErrors } from "@/lib/player/pixels";
import { rateLimit } from "@/lib/security/rate-limit";

const MAX_CONFIG_BYTES = 100_000;

export async function GET(request: Request) {
  const gate = await guard(request);
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const videoId = new URL(request.url).searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("player_configs").select("id, config, allowed_domains, published, updated_at").eq("video_id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (error) return NextResponse.json({ error: "config_load_failed" }, { status: 400 });
  if (data && data.config && typeof data.config === "object" && Number((data.config as Record<string, unknown>).radius) === 12) {
    const config = { ...(data.config as Record<string, unknown>), radius: 0 };
    if (account.canEditContent) {
      await supabase.from("player_configs").update({ config, updated_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", account.accountOwnerId);
      void purgeEmbedManifest(data.id);
    }
    return NextResponse.json({ playerConfig: { ...data, config } });
  }
  return NextResponse.json({ playerConfig: data });
}

export async function PUT(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `player-configs:${account.accountOwnerId}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ videoId?: unknown; config?: unknown; domains?: unknown }>(request, MAX_CONFIG_BYTES + 8192);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body?.videoId !== "string" || !body.config || typeof body.config !== "object") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (JSON.stringify(body.config).length > MAX_CONFIG_BYTES) return NextResponse.json({ error: "config_too_large" }, { status: 413 });

  const supabase = createAdminClient();
  const { data: ownedVideo } = await supabase.from("videos").select("id").eq("id", body.videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!ownedVideo) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

  const domains = Array.isArray(body.domains) ? body.domains.filter((item): item is string => typeof item === "string").slice(0, 100) : [];
  const pixelErrors = pixelConfigErrors(body.config as Record<string, unknown>);
  if (pixelErrors.length > 0) return NextResponse.json({ error: "invalid_pixel_config", fields: pixelErrors }, { status: 400 });
  const config = normalizePixelConfig({ ...(body.config as Record<string, unknown>) });
  config.radius = Math.max(0, Math.min(28, Number(config.radius) || 0));
  config.progressHeight = Math.max(4, Math.min(12, Number(config.progressHeight) || 6));
  config.playbackRate = Math.max(0.75, Math.min(2, Number(config.playbackRate) || 1));
  config.ctaStart = Math.max(0, Number(config.ctaStart) || 0);
  config.ctaEnd = Math.max(0, Number(config.ctaEnd) || 0);
  // `assets` guarda caminhos de arquivos no bucket privado: só entram os que
  // pertencem a esta conta, para que nenhum embed consiga assinar arquivo alheio.
  config.assets = ownedAssetPaths(config.assets, account.accountOwnerId);

  const { data, error } = await supabase.from("player_configs").upsert({ user_id: account.accountOwnerId, video_id: body.videoId, config, allowed_domains: domains, published: true, updated_at: new Date().toISOString() }, { onConflict: "video_id" }).select().single();
  if (error) return NextResponse.json({ error: "config_save_failed" }, { status: 400 });
  await supabase.from("videos").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", body.videoId).eq("user_id", account.accountOwnerId);
  void purgeEmbedManifest(data.id);
  return NextResponse.json({ playerConfig: data });
}

export async function POST(request: Request) {
  const gate = await guard(request, { csrf: true, role: "edit", paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const limited = await rateLimit(request, `player-configs:${account.accountOwnerId}`, { max: 120, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonBody<{ videoId?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const videoId = parsed.body?.videoId;
  if (typeof videoId !== "string") return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: ownedVideo } = await supabase.from("videos").select("id").eq("id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (!ownedVideo) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  const { data: existing } = await supabase.from("player_configs").select("id,published").eq("video_id", videoId).eq("user_id", account.accountOwnerId).maybeSingle();
  if (existing) {
    if (!existing.published) {
      await supabase.from("player_configs").update({ published: true, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", account.accountOwnerId);
      void purgeEmbedManifest(existing.id);
    }
    return NextResponse.json({ playerConfig: { ...existing, published: true } });
  }
  const { data, error } = await supabase.from("player_configs").insert({ user_id: account.accountOwnerId, video_id: videoId, config: {}, allowed_domains: [], published: true }).select("id,published").single();
  if (data) void purgeEmbedManifest(data.id);
  return error ? NextResponse.json({ error: "player_create_failed" }, { status: 400 }) : NextResponse.json({ playerConfig: data }, { status: 201 });
}
