import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { currentFakeDb, insertedValues, resetFakeDb, updatedSets, type FakeDb } from "./helpers/fake-db";
import { videos as videosTable } from "../drizzle/schema";

const { gateState, quotaState, updateResults, capturedWheres, failingDeletes } = vi.hoisted(() => ({
  // userId (sessão) difere do accountOwnerId (titular) de propósito: toda
  // escrita tem que usar o TITULAR da conta, nunca um id vindo do corpo.
  gateState: {
    ok: true as boolean,
    userId: "user-session",
    ownerId: "user-owner",
    hasAccess: true as boolean,
    storageBytes: 5 * 1024 ** 3,
    denyStatus: 401,
    denyResponse: null as Response | null,
  },
  quotaState: { usedBytes: 0 },
  // O fake oficial resolve `update` como `undefined`; rotas que leem
  // `.returning()` do update (PATCH /api/videos/[id]) precisam de linhas
  // configuráveis por tabela aqui.
  updateResults: {} as Record<string, unknown[]>,
  // Where de update/delete capturado para provar o escopo por accountOwnerId.
  capturedWheres: [] as Array<{ op: "update" | "delete"; table: string; arg: unknown }>,
  // Falha isolada só do delete (failingTables derrubaria o select anterior).
  failingDeletes: {} as Record<string, boolean>,
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) {
      gateState.denyResponse = new Response(JSON.stringify({ error: "unauthorized" }), { status: gateState.denyStatus });
      return { ok: false, response: gateState.denyResponse };
    }
    return {
      ok: true,
      userId: gateState.userId,
      account: { accountOwnerId: gateState.ownerId },
      plan: { access: { hasAccess: gateState.hasAccess }, quotas: { storageBytes: gateState.storageBytes } },
    };
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

vi.mock("@/lib/access/service", () => ({
  getStorageUsedBytes: vi.fn(async () => quotaState.usedBytes),
}));

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    r2MaxUploadBytes: vi.fn(() => 20 * 1024 ** 3),
    signR2ReadUrl: vi.fn(async (key: string) => `https://r2.signed.test/${key}`),
    headR2Object: vi.fn(async () => ({ ContentLength: 1 })),
    deleteR2Object: vi.fn(async () => undefined),
    copyR2Object: vi.fn(async () => undefined),
    createR2MultipartUpload: vi.fn(async () => "upload-123"),
    signR2UploadPart: vi.fn(async () => "https://r2.signed.test/part-url"),
    abortR2MultipartUpload: vi.fn(async () => undefined),
    completeR2MultipartUpload: vi.fn(async () => ({ ContentLength: 1000 })),
  };
});

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const { getTableName: tableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();

  // Select envolvido: o fake oficial não conhece `groupBy`/`having` (usados
  // pela contagem agregada de plays); esta cadeia delega tudo que existe no
  // fake e trata o resto como no-op encadeável.
  const originalSelect = fake.db.select.bind(fake.db);
  fake.db.select = (...columns: unknown[]) => {
    const inner = originalSelect(...columns) as Record<string, unknown>;
    const wrapped: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
        (inner.then as (onFulfilled: unknown, onRejected: unknown) => unknown)(onFulfilled, onRejected),
      catch: (onRejected?: (error: unknown) => unknown) =>
        (inner.catch as (onRejected: unknown) => unknown)(onRejected),
    };
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset", "for", "groupBy", "having"]) {
      wrapped[method] = (...args: unknown[]) => {
        const impl = inner[method] as ((...rest: unknown[]) => unknown) | undefined;
        impl?.(...args);
        return wrapped;
      };
    }
    return wrapped;
  };

  // Insert com promise real: o fake oficial lança SINCRONEAMENTE dentro de
  // `then`, o que bypassa o `.catch(() => [])` que a rota pendura na cadeia
  // (no Drizzle real a falha é rejeição assíncrona e o catch captura). Aqui
  // `then`/`catch` compartilham a MESMA promise, preservando o comportamento.
  const originalInsert = fake.db.insert.bind(fake.db);
  fake.db.insert = (table: unknown) => {
    const inner = originalInsert(table) as Record<string, unknown>;
    let promise: Promise<unknown> | null = null;
    const toPromise = () => {
      if (!promise) promise = Promise.resolve(inner);
      return promise;
    };
    const wrapped: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
        toPromise().then(onFulfilled, onRejected),
      catch: (onRejected?: (error: unknown) => unknown) => toPromise().catch(onRejected),
    };
    for (const method of ["values", "returning", "onConflictDoNothing", "onConflictDoUpdate"]) {
      wrapped[method] = (...args: unknown[]) => {
        (inner[method] as ((...rest: unknown[]) => unknown) | undefined)?.(...args);
        return wrapped;
      };
    }
    return wrapped;
  };

  // Update com cadeia própria: registra `set` no mesmo formato do fake oficial
  // (updatedSets continua funcionando), captura `where`, honra failingTables e
  // resolve `updateResults[table]` (default: [], como um update sem linha).
  fake.db.update = (table: unknown) => {
    const name = tableName(table as Parameters<typeof tableName>[0]) ?? "";
    const resolve = () => {
      if (name && fake.state.failingTables[name]) throw new Error("store unavailable");
      return updateResults[name] ?? [];
    };
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (error: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
      set: (arg: unknown) => {
        fake.state.calls.push({ op: "update", table: name, method: "set", arg });
        return chain;
      },
    };
    for (const method of ["where", "returning", "onConflictDoNothing", "onConflictDoUpdate", "limit", "for", "orderBy"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "where") capturedWheres.push({ op: "update", table: name, arg: args[0] });
        return chain;
      };
    }
    return chain;
  };

  // Delete envolvido: preserva a resolução do fake oficial (honra
  // failingTables), permite falha isolada via `failingDeletes` e captura o
  // `where` — a proteção IDOR do delete está no filtro da query, então ele
  // precisa ser inspecionável no teste.
  const originalDelete = fake.db.delete.bind(fake.db);
  fake.db.delete = (table: unknown) => {
    const name = tableName(table as Parameters<typeof tableName>[0]) ?? "";
    const inner = originalDelete(table) as Record<string, unknown>;
    const wrapped: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) => {
        if (failingDeletes[name]) return Promise.reject(new Error("store unavailable")).then(onFulfilled, onRejected);
        return (inner.then as (onFulfilled: unknown, onRejected: unknown) => unknown)(onFulfilled, onRejected);
      },
      catch: (onRejected?: (error: unknown) => unknown) => {
        if (failingDeletes[name]) return Promise.reject(new Error("store unavailable")).catch(onRejected);
        return (inner.catch as (onRejected: unknown) => unknown)(onRejected);
      },
      where: (...args: unknown[]) => {
        capturedWheres.push({ op: "delete", table: name, arg: args[0] });
        return wrapped;
      },
    };
    return wrapped;
  };

  return { db: fake.db, pool: {}, schema };
});

import { GET as listVideos, POST as createVideo } from "@/app/api/videos/route";
import { DELETE as deleteVideo, PATCH as patchVideo } from "@/app/api/videos/[id]/route";
import { POST as multipartPost } from "@/app/api/videos/[id]/multipart/route";
import { POST as duplicatePost } from "@/app/api/videos/[id]/duplicate/route";
import {
  completeR2MultipartUpload,
  copyR2Object,
  createR2MultipartUpload,
  deleteR2Object,
  headR2Object,
  r2MaxUploadBytes,
  signR2ReadUrl,
} from "@/lib/storage/r2";

const OWNER = "user-owner";
const VIDEO_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_VIDEO_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const COPY_ID = "44444444-4444-4444-8444-444444444444";
const PLAYER_ID = "55555555-5555-4555-8555-555555555555";

const fake = (): FakeDb => currentFakeDb();

function videoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VIDEO_ID,
    userId: OWNER,
    folderId: null,
    title: "VSL Principal",
    objectPath: `${OWNER}/abc-video.mp4`,
    mimeType: "video/mp4",
    sizeBytes: 1000,
    status: "ready",
    durationSeconds: "12.500",
    storageProvider: "r2",
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function capturedWhere(op: "update" | "delete", table: string): unknown {
  const hit = [...capturedWheres].reverse().find((entry) => entry.op === op && entry.table === table);
  if (!hit) throw new Error(`where não capturado: ${op} em ${table}`);
  return hit.arg;
}

/** Compila a condição capturada e prova que a query filtra por id + owner. */
function assertOwnerScoped(
  op: "update" | "delete",
  table: PgTable,
  expected: { id: string; owner: string },
): void {
  const cond = capturedWhere(op, getTableName(table));
  const compiled = new PgDialect().sqlToQuery(cond as never);
  expect(compiled.sql).toContain('"user_id"');
  expect(compiled.params).toContain(expected.owner);
  expect(compiled.params).toContain(expected.id);
}

/** Cast para o tipo de retorno do head (o mock devolve objeto parcial). */
function asHead(value: { ContentLength: number }) {
  return value as unknown as Awaited<ReturnType<typeof completeR2MultipartUpload>>;
}

beforeEach(() => {
  gateState.ok = true;
  gateState.userId = "user-session";
  gateState.ownerId = OWNER;
  gateState.hasAccess = true;
  gateState.storageBytes = 5 * 1024 ** 3;
  gateState.denyStatus = 401;
  quotaState.usedBytes = 0;
  for (const key of Object.keys(updateResults)) delete updateResults[key];
  for (const key of Object.keys(failingDeletes)) delete failingDeletes[key];
  capturedWheres.length = 0;
  resetFakeDb(fake());
});

afterEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
});

/* ------------------------------------------------------------------ */
/* GET /api/videos — lista com contrato snake_case e paywall           */
/* ------------------------------------------------------------------ */

describe("GET /api/videos", () => {
  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    gateState.denyStatus = 403;
    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    expect(response).toBe(gateState.denyResponse);
    expect(response.status).toBe(403);
  });

  it("devolve vídeos com contrato snake_case, plays, player e cursor", async () => {
    fake().state.selectRows["videos"] = [
      videoRow(),
      videoRow({ id: OTHER_VIDEO_ID, createdAt: new Date("2026-01-02T10:00:00.000Z") }),
    ];
    fake().state.selectRows["video_events"] = [{ videoId: VIDEO_ID, plays: 7 }];
    fake().state.selectRows["player_configs"] = [{ id: PLAYER_ID, videoId: VIDEO_ID, published: true }];

    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const body = (await response.json()) as { videos: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(body.videos).toHaveLength(2);
    expect(body.videos[0]).toEqual({
      id: VIDEO_ID,
      title: "VSL Principal",
      folder_id: null,
      object_path: `${OWNER}/abc-video.mp4`,
      mime_type: "video/mp4",
      size_bytes: 1000,
      status: "ready",
      duration_seconds: "12.500",
      created_at: "2026-01-01T10:00:00.000Z",
      storage_provider: "r2",
      signed_url: `https://r2.signed.test/${OWNER}/abc-video.mp4`,
      plays: 7,
      player_id: PLAYER_ID,
      published: true,
    });
    expect(body.nextCursor).toBe("2026-01-02T10:00:00.000Z");
  });

  it("sem acesso pago a lista continua visível, mas sem URL assinada e sem plays", async () => {
    gateState.hasAccess = false;
    fake().state.selectRows["videos"] = [videoRow()];
    fake().state.selectRows["player_configs"] = [{ id: PLAYER_ID, videoId: VIDEO_ID, published: true }];

    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { videos: Array<Record<string, unknown>> };
    expect(body.videos[0]?.signed_url).toBeNull();
    expect(body.videos[0]?.plays).toBe(0);
    expect(body.videos[0]?.player_id).toBeNull();
    expect(body.videos[0]?.published).toBe(false);
    expect(vi.mocked(signR2ReadUrl)).not.toHaveBeenCalled();
  });

  it("vídeo fora de status ready não recebe URL assinada", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    const body = (await response.json()) as { videos: Array<Record<string, unknown>> };
    expect(body.videos[0]?.signed_url).toBeNull();
  });

  it("lista vazia devolve videos: [] e nextCursor: null", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ videos: [], nextCursor: null });
  });

  it("falha no banco devolve 500 videos_load_failed", async () => {
    fake().state.failingTables["videos"] = true;
    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "videos_load_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/videos — criação, quota, título e mime                    */
/* ------------------------------------------------------------------ */

describe("POST /api/videos", () => {
  const create = (body: unknown) => createVideo(jsonRequest("https://prisma.test/api/videos", "POST", body));

  it("gate fechado devolve exatamente a response do guard e nada grava", async () => {
    gateState.ok = false;
    const response = await create({ title: "x", sizeBytes: 1 });
    expect(response).toBe(gateState.denyResponse);
    expect(insertedValues(fake(), "videos")).toHaveLength(0);
  });

  it("cria vídeo ready com player, contrato snake_case e Location", async () => {
    fake().state.insertResults["videos"] = [videoRow({ title: "Meu Vídeo" })];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_ID }];

    const response = await create({ title: "  Meu   Vídeo  ", sizeBytes: 1000, mimeType: "video/mp4", fileName: "file.mp4" });
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/api/videos/${VIDEO_ID}`);

    const body = (await response.json()) as { video: Record<string, unknown> };
    expect(Object.keys(body.video).sort()).toEqual([
      "created_at", "duration_seconds", "folder_id", "id", "mime_type", "object_path",
      "player_id", "published", "size_bytes", "status", "storage_provider", "title",
      "updated_at", "user_id",
    ]);
    expect(body.video).toMatchObject({ id: VIDEO_ID, user_id: OWNER, title: "Meu Vídeo", status: "ready", player_id: PLAYER_ID, published: true });

    const inserted = insertedValues(fake(), "videos") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ userId: OWNER, status: "ready", mimeType: "video/mp4", sizeBytes: 1000, folderId: null });
    // O caminho do objeto é montado no servidor, sempre no prefixo do titular.
    expect(String(inserted[0]?.objectPath)).toMatch(new RegExp(`^${OWNER}/[0-9a-f-]{36}-file\\.mp4$`));
    // Player nasce publicado para o titular (nunca para o userId da sessão).
    const players = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, config: {}, allowedDomains: [], published: true });
  });

  it("status processing cria sem player e devolve 201 com Location", async () => {
    fake().state.insertResults["videos"] = [videoRow({ status: "processing" })];
    const response = await create({ title: "Upload direto", sizeBytes: 10, mimeType: "video/mp4", status: "processing" });
    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/api/videos/${VIDEO_ID}`);

    const body = (await response.json()) as { video: Record<string, unknown> };
    expect(body.video.status).toBe("processing");
    expect(body.video).not.toHaveProperty("player_id");
    expect(body.video).not.toHaveProperty("published");
    expect(insertedValues(fake(), "player_configs")).toHaveLength(0);
  });

  it("quota de storage excedida devolve 413 com usedBytes/limitBytes e nada grava", async () => {
    quotaState.usedBytes = 5 * 1024 ** 3;
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "video/mp4" });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("storage_quota_exceeded");
    expect(body.usedBytes).toBe(5 * 1024 ** 3);
    expect(body.limitBytes).toBe(5 * 1024 ** 3);
    expect(insertedValues(fake(), "videos")).toHaveLength(0);
  });

  it("no limite exato da quota a criação ainda passa", async () => {
    quotaState.usedBytes = 4 * 1024 ** 3;
    fake().state.insertResults["videos"] = [videoRow({ sizeBytes: 1024 ** 3 })];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_ID }];
    const response = await create({ title: "Vídeo", sizeBytes: 1024 ** 3, mimeType: "video/mp4" });
    expect(response.status).toBe(201);
  });

  it("sizeBytes inválido devolve 422 invalid_file_size", async () => {
    for (const sizeBytes of [0, -5, "abc", 2 ** 53, undefined]) {
      const response = await create({ title: "Vídeo", sizeBytes, mimeType: "video/mp4" });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: "invalid_file_size" });
    }
  });

  it("sizeBytes acima do teto do R2 devolve 422 com maxBytes do servidor", async () => {
    vi.mocked(r2MaxUploadBytes).mockReturnValueOnce(1000);
    const response = await create({ title: "Vídeo", sizeBytes: 2000, mimeType: "video/mp4" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_file_size", maxBytes: 1000 });
  });

  it("título vazio devolve 422 invalid_title", async () => {
    const response = await create({ title: "   ", sizeBytes: 1, mimeType: "video/mp4" });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_title" });
  });

  it("título longo é truncado para 200 caracteres", async () => {
    fake().state.insertResults["videos"] = [videoRow({ title: "T".repeat(200) })];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_ID }];
    const response = await create({ title: "T".repeat(300), sizeBytes: 1, mimeType: "video/mp4" });
    expect(response.status).toBe(201);
    const inserted = insertedValues(fake(), "videos") as Array<Record<string, unknown>>;
    expect(String(inserted[0]?.title)).toHaveLength(200);
  });

  it("mime sem suporte devolve 415 invalid_mime_type", async () => {
    for (const mimeType of ["application/pdf", "text/plain", "video/" + "a".repeat(101)]) {
      const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType });
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "invalid_mime_type" });
    }
  });

  it("HLS (application/vnd.apple.mpegurl) é aceito", async () => {
    fake().state.insertResults["videos"] = [videoRow({ mimeType: "application/vnd.apple.mpegurl" })];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_ID }];
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "application/vnd.apple.mpegurl" });
    expect(response.status).toBe(201);
    const inserted = insertedValues(fake(), "videos") as Array<Record<string, unknown>>;
    expect(inserted[0]?.mimeType).toBe("application/vnd.apple.mpegurl");
  });

  it("folderId de outro owner devolve 404 folder_not_found e nada grava (IDOR)", async () => {
    // A query filtra por (id, userId do titular): pasta alheia não volta.
    fake().state.selectRows["video_folders"] = [];
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "video/mp4", folderId: FOLDER_ID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "folder_not_found" });
    expect(insertedValues(fake(), "videos")).toHaveLength(0);
  });

  it("folderId próprio grava o vídeo dentro da pasta", async () => {
    fake().state.selectRows["video_folders"] = [{ id: FOLDER_ID }];
    fake().state.insertResults["videos"] = [videoRow({ folderId: FOLDER_ID })];
    fake().state.insertResults["player_configs"] = [{ id: PLAYER_ID }];
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "video/mp4", folderId: FOLDER_ID });
    expect(response.status).toBe(201);
    const inserted = insertedValues(fake(), "videos") as Array<Record<string, unknown>>;
    expect(inserted[0]?.folderId).toBe(FOLDER_ID);
  });

  it("body null devolve 400 invalid_payload", async () => {
    const response = await create(null);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_payload" });
  });

  it("JSON inválido devolve 400 invalid_json", async () => {
    const response = await create("{not-json");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("falha ao inserir devolve 400 video_create_failed", async () => {
    fake().state.failingTables["videos"] = true;
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "video/mp4" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "video_create_failed" });
  });

  it("falha ao criar o player não derruba a criação: 201 com warning", async () => {
    fake().state.insertResults["videos"] = [videoRow()];
    fake().state.failingTables["player_configs"] = true;
    const response = await create({ title: "Vídeo", sizeBytes: 1, mimeType: "video/mp4" });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.warning).toBe("player_create_failed");
    expect(body.video).toMatchObject({ id: VIDEO_ID });
  });
});

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* PATCH /api/videos/[id] — título, pasta e transição de status         */
/* ------------------------------------------------------------------ */

describe("PATCH /api/videos/[id]", () => {
  const patch = (body: unknown, id: string = VIDEO_ID) =>
    patchVideo(jsonRequest(`https://prisma.test/api/videos/${id}`, "PATCH", body), ctx(id));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    gateState.denyStatus = 402;
    const response = await patch({ title: "Novo" });
    expect(response).toBe(gateState.denyResponse);
    expect(response.status).toBe(402);
  });

  it("atualiza título com contrato snake_case e update escopado pelo titular", async () => {
    updateResults["videos"] = [{ id: VIDEO_ID, title: "Novo Título", folderId: FOLDER_ID }];
    const response = await patch({ title: "  Novo Título  " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ video: { id: VIDEO_ID, title: "Novo Título", folder_id: FOLDER_ID } });

    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets).toHaveLength(1);
    expect(sets[0]?.title).toBe("Novo Título");
    expect(sets[0]?.updatedAt).toBeInstanceOf(Date);
    // O update filtra por id + accountOwnerId da sessão (nunca id do body).
    assertOwnerScoped("update", videosTable, { id: VIDEO_ID, owner: OWNER });
  });

  it("título vazio devolve 400 invalid_title", async () => {
    const response = await patch({ title: "   " });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_title" });
  });

  it("folderId de outro owner devolve 404 folder_not_found (IDOR)", async () => {
    fake().state.selectRows["video_folders"] = [];
    const response = await patch({ folderId: FOLDER_ID });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "folder_not_found" });
    expect(updatedSets(fake(), "videos")).toHaveLength(0);
  });

  it("folderId null remove o vídeo da pasta sem tocar no banco de pastas", async () => {
    updateResults["videos"] = [{ id: VIDEO_ID, title: "VSL Principal", folderId: null }];
    const response = await patch({ folderId: null });
    expect(response.status).toBe(200);
    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]?.folderId).toBeNull();
  });

  it("transição de status inválida devolve 409 invalid_status_transition", async () => {
    fake().state.selectRows["videos"] = [{ objectPath: `${OWNER}/v.mp4`, status: "draft" }];
    const response = await patch({ status: "ready" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "invalid_status_transition" });
    expect(updatedSets(fake(), "videos")).toHaveLength(0);
  });

  it("vídeo de outro owner (select vazio) não transiciona: 409, não 500", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await patch({ status: "ready" });
    expect(response.status).toBe(409);
    expect(updatedSets(fake(), "videos")).toHaveLength(0);
  });

  it("id não-UUID não explode: falha igual a vídeo inexistente (409/400, nunca 500)", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await patch({ status: "ready" }, "not-a-uuid");
    expect(response.status).toBe(409);
  });

  it("promover a ready exige o arquivo no R2: sem head, 409 uploaded_file_not_found", async () => {
    fake().state.selectRows["videos"] = [{ objectPath: `${OWNER}/v.mp4`, status: "processing" }];
    vi.mocked(headR2Object).mockRejectedValueOnce(new Error("NotFound"));
    const response = await patch({ status: "ready" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "uploaded_file_not_found" });
    expect(updatedSets(fake(), "videos")).toHaveLength(0);
  });

  it("promover a ready grava status/duração e reafirma o player (idempotente)", async () => {
    fake().state.selectRows["videos"] = [{ objectPath: `${OWNER}/v.mp4`, status: "processing" }];
    updateResults["videos"] = [{ id: VIDEO_ID, title: "VSL Principal", folderId: null }];
    const response = await patch({ status: "ready", durationSeconds: 42.5 });
    expect(response.status).toBe(200);

    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]).toMatchObject({ status: "ready", durationSeconds: "42.5" });
    const players = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, published: true });
  });

  it("status failed marca o vídeo sem tocar no R2", async () => {
    fake().state.selectRows["videos"] = [{ objectPath: `${OWNER}/v.mp4`, status: "processing" }];
    updateResults["videos"] = [{ id: VIDEO_ID, title: "VSL Principal", folderId: null }];
    const response = await patch({ status: "failed" });
    expect(response.status).toBe(200);
    expect(vi.mocked(headR2Object)).not.toHaveBeenCalled();
    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]?.status).toBe("failed");
  });

  it("update sem linha correspondente devolve 400 video_update_failed", async () => {
    updateResults["videos"] = [];
    const response = await patch({ title: "Novo" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "video_update_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/videos/[id] — posse, assets e limpeza no R2              */
/* ------------------------------------------------------------------ */

describe("DELETE /api/videos/[id]", () => {
  const del = (id: string = VIDEO_ID) => deleteVideo(new Request(`https://prisma.test/api/videos/${id}`, { method: "DELETE" }), ctx(id));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await del();
    expect(response).toBe(gateState.denyResponse);
    expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled();
  });

  it("vídeo de outro owner devolve 404 e nada é apagado (IDOR)", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await del();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled();
    expect(capturedWheres).toHaveLength(0);
  });

  it("id não-UUID devolve 404 (não 500): select escopado não acha nada", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await del("not-a-uuid");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });

  it("exclui assets do player, arquivo principal e linha escopada pelo owner", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID, objectPath: `${OWNER}/abc-video.mp4` }];
    fake().state.selectRows["player_configs"] = [{ config: { assets: { thumbnailStart: `${OWNER}/thumb.png` } } }];

    const response = await del();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(vi.mocked(deleteR2Object).mock.calls[0]?.[0]).toBe(`${OWNER}/thumb.png`);
    expect(vi.mocked(deleteR2Object).mock.calls[1]?.[0]).toBe(`${OWNER}/abc-video.mp4`);
    // A linha só é apagada com id + accountOwnerId da sessão na query.
    assertOwnerScoped("delete", videosTable, { id: VIDEO_ID, owner: OWNER });
  });

  it("asset alheio no config nunca é assinado nem apagado: só o que é do titular", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID, objectPath: `${OWNER}/abc-video.mp4` }];
    fake().state.selectRows["player_configs"] = [{ config: { assets: { thumbnailStart: "user-outro/thumb.png" } } }];

    const response = await del();
    expect(response.status).toBe(200);
    const deletedKeys = vi.mocked(deleteR2Object).mock.calls.map(([key]) => key);
    expect(deletedKeys).toEqual([`${OWNER}/abc-video.mp4`]);
    expect(deletedKeys).not.toContain("user-outro/thumb.png");
  });

  it("falha ao apagar asset aborta com 500 e a linha do vídeo permanece", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID, objectPath: `${OWNER}/abc-video.mp4` }];
    fake().state.selectRows["player_configs"] = [{ config: { assets: { thumbnailStart: `${OWNER}/thumb.png` } } }];
    vi.mocked(deleteR2Object).mockRejectedValueOnce(new Error("r2 down"));

    const response = await del();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "player_assets_delete_failed" });
    expect(capturedWheres.filter((entry) => entry.op === "delete")).toHaveLength(0);
  });

  it("falha ao apagar o arquivo principal devolve 500 video_file_delete_failed", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID, objectPath: `${OWNER}/abc-video.mp4` }];
    vi.mocked(deleteR2Object).mockRejectedValueOnce(new Error("r2 down"));

    const response = await del();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "video_file_delete_failed" });
  });

  it("falha ao apagar a linha devolve 500 video_delete_failed", async () => {
    fake().state.selectRows["videos"] = [{ id: VIDEO_ID, objectPath: `${OWNER}/abc-video.mp4` }];
    failingDeletes["videos"] = true;

    const response = await del();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "video_delete_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/videos/[id]/multipart — upload em partes                  */
/* ------------------------------------------------------------------ */

describe("POST /api/videos/[id]/multipart", () => {
  const multipart = (body: unknown, id: string = VIDEO_ID) =>
    multipartPost(jsonRequest(`https://prisma.test/api/videos/${id}/multipart`, "POST", body), ctx(id));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await multipart({ action: "create" });
    expect(response).toBe(gateState.denyResponse);
  });

  it("vídeo de outro owner devolve 404 video_not_found (IDOR)", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await multipart({ action: "create" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });

  it("create fora de status processing devolve 409 invalid_status", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "ready" })];
    const response = await multipart({ action: "create" });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "invalid_status" });
  });

  it("create devolve uploadId e partSize com metadados do titular", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const response = await multipart({ action: "create" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uploadId: "upload-123", partSize: 25 * 1024 * 1024 });
    expect(vi.mocked(createR2MultipartUpload).mock.calls[0]).toEqual([
      `${OWNER}/abc-video.mp4`,
      "video/mp4",
      { owner: OWNER, actor: "user-session", video: VIDEO_ID },
    ]);
  });

  it("erro do R2 no create vira 502 com código mapeado do describeR2Error", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    vi.mocked(createR2MultipartUpload).mockRejectedValueOnce(new Error("invalid_cloudflare_r2_access_key_id"));
    const response = await multipart({ action: "create" });
    expect(response.status).toBe(502);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("r2_invalid_configuration");
  });

  it("sign exige uploadId válido", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const noId = await multipart({ action: "sign", partNumber: 1 });
    expect(noId.status).toBe(422);
    expect(await noId.json()).toEqual({ error: "invalid_upload_id" });

    const longId = await multipart({ action: "sign", uploadId: "u".repeat(1025), partNumber: 1 });
    expect(longId.status).toBe(422);
    expect(await longId.json()).toEqual({ error: "invalid_upload_id" });
  });

  it("sign valida partNumber entre 1 e 10000", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    for (const partNumber of [0, -1, 10001, 1.5]) {
      const response = await multipart({ action: "sign", uploadId: "upload-123", partNumber });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "invalid_part_number" });
    }
    const ok = await multipart({ action: "sign", uploadId: "upload-123", partNumber: 1 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ url: "https://r2.signed.test/part-url" });
  });

  it("abort marca o vídeo como failed e devolve ok", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const response = await multipart({ action: "abort", uploadId: "upload-123" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]).toMatchObject({ status: "failed" });
  });

  it("complete com parts inválidas devolve 422 invalid_parts", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const empty = await multipart({ action: "complete", uploadId: "upload-123", parts: [] });
    expect(empty.status).toBe(422);
    const noEtag = await multipart({ action: "complete", uploadId: "upload-123", parts: [{ partNumber: 1 }] });
    expect(noEtag.status).toBe(422);
    expect(await noEtag.json()).toEqual({ error: "invalid_parts" });
  });

  it("complete com tamanho divergente devolve 409 uploaded_size_mismatch", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    vi.mocked(completeR2MultipartUpload).mockResolvedValueOnce(asHead({ ContentLength: 999 }));
    const response = await multipart({
      action: "complete", uploadId: "upload-123",
      parts: [{ etag: "abc", partNumber: 1 }],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "uploaded_size_mismatch" });
  });

  it("complete revalida a quota com o tamanho real: 413 e status failed", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing", sizeBytes: 5000 })];
    vi.mocked(completeR2MultipartUpload).mockResolvedValueOnce(asHead({ ContentLength: 5000 }));
    // Cenário do comentário da rota: outro upload concorrente já estourou o
    // plano entre o POST e o complete.
    quotaState.usedBytes = 5 * 1024 ** 3 + 1;

    const response = await multipart({
      action: "complete", uploadId: "upload-123",
      parts: [{ etag: "abc", partNumber: 1 }],
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("storage_quota_exceeded");
    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]).toMatchObject({ status: "failed" });
  });

  it("complete ok promove a ready com duração e player idempotente", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const response = await multipart({
      action: "complete", uploadId: "upload-123", durationSeconds: 60,
      parts: [{ etag: "abc", partNumber: 1 }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const sets = updatedSets(fake(), "videos") as Array<Record<string, unknown>>;
    expect(sets[0]).toMatchObject({ status: "ready", durationSeconds: "60" });
    const players = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, published: true });
  });

  it("ação desconhecida com uploadId válido devolve 400 invalid_action", async () => {
    fake().state.selectRows["videos"] = [videoRow({ status: "processing" })];
    const response = await multipart({ action: "nonsense", uploadId: "upload-123" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_action" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/videos/[id]/duplicate — duplicação com quota               */
/* ------------------------------------------------------------------ */

describe("POST /api/videos/[id]/duplicate", () => {
  const duplicate = (id: string = VIDEO_ID) =>
    duplicatePost(new Request(`https://prisma.test/api/videos/${id}/duplicate`, { method: "POST" }), ctx(id));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await duplicate();
    expect(response).toBe(gateState.denyResponse);
  });

  it("original de outro owner (ou não-ready) devolve 404 (IDOR)", async () => {
    // A query exige (id, userId do titular, status=ready): nada volta.
    fake().state.selectRows["videos"] = [];
    const response = await duplicate();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled();
  });

  it("quota excedida devolve 413 sem copiar nada no R2", async () => {
    fake().state.selectRows["videos"] = [videoRow({ sizeBytes: 2 * 1024 ** 3 })];
    quotaState.usedBytes = 4 * 1024 ** 3;
    const response = await duplicate();
    expect(response.status).toBe(413);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe("storage_quota_exceeded");
    expect(body.usedBytes).toBe(4 * 1024 ** 3);
  });

  it("falha na cópia devolve 500 video_copy_failed", async () => {
    fake().state.selectRows["videos"] = [videoRow()];
    vi.mocked(copyR2Object).mockRejectedValueOnce(new Error("r2 down"));
    const response = await duplicate();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "video_copy_failed" });
    expect(insertedValues(fake(), "videos")).toHaveLength(0);
  });

  it("duplica com título sufixado, player novo e delete escopado nunca acionado", async () => {
    fake().state.selectRows["videos"] = [videoRow({ folderId: FOLDER_ID })];
    fake().state.insertResults["videos"] = [{ id: COPY_ID }];

    const response = await duplicate();
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ video: { id: COPY_ID } });

    expect(vi.mocked(deleteR2Object)).not.toHaveBeenCalled();
    const inserted = insertedValues(fake(), "videos") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: OWNER,
      title: "VSL Principal (cópia)",
      folderId: FOLDER_ID,
      mimeType: "video/mp4",
      sizeBytes: 1000,
      durationSeconds: "12.500",
      status: "ready",
      storageProvider: "r2",
    });
    // A cópia vive no prefixo do titular para a rotina de exclusão achar.
    expect(String(inserted[0]?.objectPath)).toMatch(new RegExp(`^${OWNER}/[0-9a-f-]{36}-copy\\.mp4$`));
    const players = insertedValues(fake(), "player_configs") as Array<Record<string, unknown>>;
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ userId: OWNER, videoId: COPY_ID, published: true });
  });

  it("falha ao criar o player desfaz tudo: apaga cópia no R2 e a linha (500)", async () => {
    fake().state.selectRows["videos"] = [videoRow()];
    fake().state.insertResults["videos"] = [{ id: COPY_ID }];
    fake().state.failingTables["player_configs"] = true;

    const response = await duplicate();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "player_duplicate_failed" });

    // Cleanup remove o objeto da cópia (prefixo do titular).
    const cleaned = vi.mocked(deleteR2Object).mock.calls.map(([key]) => key).find((key) => key.includes("-copy"));
    expect(cleaned).toMatch(new RegExp(`^${OWNER}/[0-9a-f-]{36}-copy\\.mp4$`));
    // E remove a linha recém-criada, escopada por id + titular.
    assertOwnerScoped("delete", videosTable, { id: COPY_ID, owner: OWNER });
  });
});
