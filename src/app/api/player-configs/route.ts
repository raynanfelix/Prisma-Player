import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { guard } from "@/lib/api/guard";
import { readJsonBody } from "@/lib/api/request";
import { db, schema } from "@/lib/db";
import { ownedAssetPaths } from "@/lib/player/assets";
import { purgeEmbedManifest } from "@/lib/cache/embed-purge";
import { normalizePixelConfig, pixelConfigErrors } from "@/lib/player/pixels";
import { rateLimit } from "@/lib/security/rate-limit";

const { playerConfigs, videos } = schema;

const MAX_CONFIG_BYTES = 100_000;

type PlayerConfigRow = typeof playerConfigs.$inferSelect;

/** Contrato da UI: colunas snake_case como o SDK antigo devolvia. */
function serializePlayerConfig(row: PlayerConfigRow) {
  return {
    id: row.id,
    user_id: row.userId,
    video_id: row.videoId,
    config: row.config,
    allowed_domains: row.allowedDomains,
    published: row.published,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const gate = await guard(request, { paid: true });
  if (!gate.ok) return gate.response;
  const { account } = gate;

  const videoId = new URL(request.url).searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "invalid_video_id" }, { status: 400 });

  try {
    const [row] = await db
      .select({ id: playerConfigs.id, config: playerConfigs.config, allowedDomains: playerConfigs.allowedDomains, published: playerConfigs.published, updatedAt: playerConfigs.updatedAt })
      .from(playerConfigs)
      .where(and(eq(playerConfigs.videoId, videoId), eq(playerConfigs.userId, account.accountOwnerId)))
      .limit(1);
    // Leitura pura: a normalização legada de `radius` acontece no PUT e no
    // embed em leitura. Escrever aqui transformava um GET autenticado numa
    // mutação sem CSRF e sem paywall.
    return NextResponse.json({
      playerConfig: row
        ? { id: row.id, config: row.config, allowed_domains: row.allowedDomains, published: row.published, updated_at: row.updatedAt.toISOString() }
        : null,
    });
  } catch {
    return NextResponse.json({ error: "config_load_failed" }, { status: 400 });
  }
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

  try {
    const [ownedVideo] = await db.select({ id: videos.id }).from(videos).where(and(eq(videos.id, body.videoId), eq(videos.userId, account.accountOwnerId))).limit(1);
    if (!ownedVideo) return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "video_not_found" }, { status: 404 });
  }

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

  try {
    const [row] = await db
      .insert(playerConfigs)
      .values({ userId: account.accountOwnerId, videoId: body.videoId, config, allowedDomains: domains, published: true, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: playerConfigs.videoId,
        set: { config, allowedDomains: domains, published: true, updatedAt: new Date() },
      })
      .returning();
    // Reafirma o vídeo como pronto (best effort, como antes: erro aqui não
    // invalida a config já salva).
    await db
      .update(videos)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(videos.id, body.videoId), eq(videos.userId, account.accountOwnerId)))
      .catch(() => undefined);
    void purgeEmbedManifest(row.id);
    return NextResponse.json({ playerConfig: serializePlayerConfig(row) });
  } catch {
    return NextResponse.json({ error: "config_save_failed" }, { status: 400 });
  }
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

  try {
    const [ownedVideo] = await db.select({ id: videos.id }).from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, account.accountOwnerId))).limit(1);
    if (!ownedVideo) return NextResponse.json({ error: "video_not_found" }, { status: 404 });

    const [existing] = await db
      .select({ id: playerConfigs.id, published: playerConfigs.published })
      .from(playerConfigs)
      .where(and(eq(playerConfigs.videoId, videoId), eq(playerConfigs.userId, account.accountOwnerId)))
      .limit(1);
    if (existing) {
      if (!existing.published) {
        await db
          .update(playerConfigs)
          .set({ published: true, updatedAt: new Date() })
          .where(and(eq(playerConfigs.id, existing.id), eq(playerConfigs.userId, account.accountOwnerId)))
          .catch(() => undefined);
        void purgeEmbedManifest(existing.id);
      }
      return NextResponse.json({ playerConfig: { id: existing.id, published: true } });
    }

    const [row] = await db
      .insert(playerConfigs)
      .values({ userId: account.accountOwnerId, videoId, config: {}, allowedDomains: [], published: true })
      .returning({ id: playerConfigs.id, published: playerConfigs.published });
    void purgeEmbedManifest(row.id);
    return NextResponse.json({ playerConfig: row }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "player_create_failed" }, { status: 400 });
  }
}
