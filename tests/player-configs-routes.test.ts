import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentFakeDb, insertedValues, resetFakeDb, updatedSets, type FakeDb } from "./helpers/fake-db";

const { gateState } = vi.hoisted(() => ({
  gateState: {
    ok: true as boolean,
    userId: "user-session",
    ownerId: "user-owner",
    denyStatus: 401,
    denyResponse: null as Response | null,
  },
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) {
      gateState.denyResponse = new Response(JSON.stringify({ error: "unauthorized" }), { status: gateState.denyStatus });
      return { ok: false, response: gateState.denyResponse };
    }
    return { ok: true, userId: gateState.userId, account: { accountOwnerId: gateState.ownerId } };
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

vi.mock("@/lib/cache/embed-purge", () => ({
  purgeEmbedManifest: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { GET as getPlayerConfig, POST as ensurePlayerConfig, PUT as putPlayerConfig } from "@/app/api/player-configs/route";
import { purgeEmbedManifest } from "@/lib/cache/embed-purge";

const OWNER = "user-owner";
const VIDEO_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_CONFIG_ID = "55555555-5555-4555-8555-555555555555";

const fake = (): FakeDb => currentFakeDb();

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function fullConfigRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PLAYER_CONFIG_ID,
    userId: OWNER,
    videoId: VIDEO_ID,
    config: { radius: 8 },
    allowedDomains: ["site.com"],
    published: true,
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  gateState.ok = true;
  gateState.userId = "user-session";
  gateState.ownerId = OWNER;
  gateState.denyStatus = 401;
  resetFakeDb(fake());
});

afterEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
});

/* ------------------------------------------------------------------ */
/* GET /api/player-configs?videoId=                                     */
/* ------------------------------------------------------------------ */

describe("GET /api/player-configs", () => {
  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    gateState.denyStatus = 402;
    const response = await getPlayerConfig(new Request("https://prisma.test/api/player-configs?videoId=x"));
    expect(response).toBe(gateState.denyResponse);
    expect(response.status).toBe(402);
  });

  it("sem videoId devolve 400 invalid_video_id", async () => {
    const response = await getPlayerConfig(new Request("https://prisma.test/api/player-configs"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_video_id" });
  });

  it("devolve a config do vídeo com contrato snake_case", async () => {
    fake().state.selectRows["player_configs"] = [fullConfigRow()];
    const response = await getPlayerConfig(new Request(`https://prisma.test/api/player-configs?videoId=${VIDEO_ID}`));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { playerConfig: Record<string, unknown> };
    expect(Object.keys(body.playerConfig).sort()).toEqual(["allowed_domains", "config", "id", "published", "updated_at"]);
    expect(body.playerConfig).toEqual({
      id: PLAYER_CONFIG_ID,
      config: { radius: 8 },
      allowed_domains: ["site.com"],
      published: true,
      updated_at: "2026-01-01T10:00:00.000Z",
    });
  });

  it("sem config salva devolve playerConfig: null (não é erro)", async () => {
    const response = await getPlayerConfig(new Request(`https://prisma.test/api/player-configs?videoId=${VIDEO_ID}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playerConfig: null });
  });

  it("falha no banco devolve 400 config_load_failed", async () => {
    fake().state.failingTables["player_configs"] = true;
    const response = await getPlayerConfig(new Request(`https://prisma.test/api/player-configs?videoId=${VIDEO_ID}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "config_load_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* PUT /api/player-configs                                              */
/* ------------------------------------------------------------------ */

describe("PUT /api/player-configs", () => {
  const put = (body: unknown) => putPlayerConfig(jsonRequest("https://prisma.test/api/player-configs", "PUT", body));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await put({ videoId: VIDEO_ID, config: {} });
    expect(response).toBe(gateState.denyResponse);
    expect(insertedValues(fake(), "player_configs")).toHaveLength(0);
  });

  it("payload sem videoId ou com config que não é objeto devolve 400 invalid_payload", async () => {
    const noVideo = await put({ config: {} });
    expect(noVideo.status).toBe(400);
    expect(await noVideo.json()).toEqual({ error: "invalid_payload" });

    const badConfig = await put({ videoId: VIDEO_ID, config: "não-objeto" });
    expect(badConfig.status).toBe(400);
    expect(await badConfig.json()).toEqual({ error: "invalid_payload" });
  });

  it("config acima de 100KB devolve 413 config_too_large", async () => {
    const response = await put({ videoId: VIDEO_ID, config: { headline: "x".repeat(100_001) } });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "config_too_large" });
  });

  it("vídeo de outro owner devolve 404 video_not_found (IDOR)", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await put({ videoId: VIDEO_ID, config: { radius: 8 } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(insertedValues(fake(), "player_configs")).toHaveLength(0);
  });

  it("pixel inválido devolve 400 invalid_pixel_config com os campos", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    const response = await put({ videoId: VIDEO_ID, config: { metaPixelEnabled: true, metaPixelId: "abc" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_pixel_config", fields: ["meta_pixel_id_invalid"] });
  });

  it("salva com upsert, normaliza os limites e devolve contrato snake_case", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.insertResults["player_configs"] = [fullConfigRow()];

    const response = await put({
      videoId: VIDEO_ID,
      config: { radius: 999, progressHeight: 99, playbackRate: 0.1, ctaStart: -5, ctaEnd: -1 },
      domains: ["site.com", 42, "blog.com"],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { playerConfig: Record<string, unknown> };
    expect(Object.keys(body.playerConfig).sort()).toEqual([
      "allowed_domains", "config", "created_at", "id", "published", "updated_at", "user_id", "video_id",
    ]);
    expect(body.playerConfig.published).toBe(true);

    const inserted = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, published: true });
    expect((inserted[0]?.config as Record<string, unknown>)).toMatchObject({
      radius: 28, progressHeight: 12, playbackRate: 0.75, ctaStart: 0, ctaEnd: 0,
    });
    // Domains: só strings, no máximo 100.
    expect(inserted[0]?.allowedDomains).toEqual(["site.com", "blog.com"]);
    // Reafirma o vídeo como ready (best effort).
    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ status: "ready" });
    // Manifest purgado na borda com o id do player.
    expect(vi.mocked(purgeEmbedManifest)).toHaveBeenCalledWith(PLAYER_CONFIG_ID);
  });

  it("assets de outro dono são descartados antes de salvar o config", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.insertResults["player_configs"] = [fullConfigRow()];
    const response = await put({
      videoId: VIDEO_ID,
      config: { assets: { thumbnailStart: `${OWNER}/t.png`, thumbnailPause: "user-outro/x.png" } },
    });
    expect(response.status).toBe(200);
    const inserted = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    const config = inserted[0]?.config as Record<string, unknown>;
    expect(config.assets).toEqual({ thumbnailStart: `${OWNER}/t.png` });
  });

  it("falha ao salvar devolve 400 config_save_failed", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.failingTables["player_configs"] = true;
    const response = await put({ videoId: VIDEO_ID, config: { radius: 8 } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "config_save_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/player-configs                                             */
/* ------------------------------------------------------------------ */

describe("POST /api/player-configs", () => {
  const post = (body: unknown) => ensurePlayerConfig(jsonRequest("https://prisma.test/api/player-configs", "POST", body));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await post({ videoId: VIDEO_ID });
    expect(response).toBe(gateState.denyResponse);
    expect(insertedValues(fake(), "player_configs")).toHaveLength(0);
  });

  it("videoId não-string devolve 400 invalid_video_id", async () => {
    const response = await post({ videoId: 42 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_video_id" });
  });

  it("vídeo de outro owner devolve 404 video_not_found (IDOR)", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await post({ videoId: VIDEO_ID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });

  it("config já publicada é retornada sem gravar nada", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.selectRows["player_configs"] = [{ id: PLAYER_CONFIG_ID, published: true }];
    const response = await post({ videoId: VIDEO_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playerConfig: { id: PLAYER_CONFIG_ID, published: true } });
    expect(insertedValues(fake(), "player_configs")).toHaveLength(0);
    expect(updatedSets(fake(), "player_configs")).toHaveLength(0);
  });

  it("config despublicada é republicada: update gravado e manifest purgado", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.selectRows["player_configs"] = [{ id: PLAYER_CONFIG_ID, published: false }];
    const response = await post({ videoId: VIDEO_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playerConfig: { id: PLAYER_CONFIG_ID, published: true } });

    const sets = updatedSets(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ published: true });
    expect(vi.mocked(purgeEmbedManifest)).toHaveBeenCalledWith(PLAYER_CONFIG_ID);
  });

  it("sem config existente cria player publicado (201) e purga o manifest", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.selectRows["player_configs"] = [];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_CONFIG_ID, published: true }];

    const response = await post({ videoId: VIDEO_ID });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ playerConfig: { id: PLAYER_CONFIG_ID, published: true } });

    const inserted = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, config: {}, allowedDomains: [], published: true });
    expect(vi.mocked(purgeEmbedManifest)).toHaveBeenCalledWith(PLAYER_CONFIG_ID);
  });

  it("falha devolve 400 player_create_failed", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID }];
    fake().state.failingTables["player_configs"] = true;
    const response = await post({ videoId: VIDEO_ID });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "player_create_failed" });
  });
});
