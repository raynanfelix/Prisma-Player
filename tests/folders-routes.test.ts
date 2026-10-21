import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { currentFakeDb, insertedValues, resetFakeDb, type FakeDb } from "./helpers/fake-db";
import { videoFolders as videoFoldersTable } from "../drizzle/schema";

const { gateState, capturedWheres, failingDeletes } = vi.hoisted(() => ({
  gateState: {
    ok: true as boolean,
    userId: "user-session",
    ownerId: "user-owner",
    denyStatus: 401,
    denyResponse: null as Response | null,
  },
  // Where do delete capturado: a proteção IDOR do DELETE /api/folders/[id]
  // está no filtro da query (não há select antes), então ele precisa ser
  // inspecionável no teste.
  capturedWheres: [] as Array<{ op: "delete"; table: string; arg: unknown }>,
  failingDeletes: {} as Record<string, boolean>,
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

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const { getTableName: tableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();

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

import { GET as listFolders, POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";

const OWNER = "user-owner";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_FOLDER_ID = "99999999-9999-4999-8999-999999999999";

const fake = (): FakeDb => currentFakeDb();

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

function folderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: FOLDER_ID,
    userId: OWNER,
    name: "VSLs",
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

/** Compila o where capturado do delete e prova o filtro por id + owner. */
function assertDeleteScoped(table: PgTable, expected: { id: string; owner: string }): void {
  const hit = capturedWheres.find((entry) => entry.op === "delete" && entry.table === getTableName(table));
  expect(hit, "delete sem where capturado").toBeDefined();
  const compiled = new PgDialect().sqlToQuery(hit?.arg as never);
  expect(compiled.sql).toContain('"user_id"');
  expect(compiled.params).toContain(expected.owner);
  expect(compiled.params).toContain(expected.id);
}

beforeEach(() => {
  gateState.ok = true;
  gateState.userId = "user-session";
  gateState.ownerId = OWNER;
  gateState.denyStatus = 401;
  for (const key of Object.keys(failingDeletes)) delete failingDeletes[key];
  capturedWheres.length = 0;
  resetFakeDb(fake());
});

afterEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
});

/* ------------------------------------------------------------------ */
/* GET /api/folders                                                     */
/* ------------------------------------------------------------------ */

describe("GET /api/folders", () => {
  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    gateState.denyStatus = 401;
    const response = await listFolders(new Request("https://prisma.test/api/folders"));
    expect(response).toBe(gateState.denyResponse);
    expect(response.status).toBe(401);
  });

  it("lista pastas com contrato snake_case", async () => {
    fake().state.selectRows["video_folders"] = [
      folderRow(),
      folderRow({ id: OTHER_FOLDER_ID, name: "Webinars", createdAt: new Date("2026-02-01T10:00:00.000Z") }),
    ];
    const response = await listFolders(new Request("https://prisma.test/api/folders"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { folders: Array<Record<string, unknown>> };
    expect(body.folders).toEqual([
      { id: FOLDER_ID, name: "VSLs", created_at: "2026-01-01T10:00:00.000Z" },
      { id: OTHER_FOLDER_ID, name: "Webinars", created_at: "2026-02-01T10:00:00.000Z" },
    ]);
  });

  it("lista vazia devolve folders: []", async () => {
    const response = await listFolders(new Request("https://prisma.test/api/folders"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ folders: [] });
  });

  it("falha no banco devolve 500 folders_load_failed", async () => {
    fake().state.failingTables["video_folders"] = true;
    const response = await listFolders(new Request("https://prisma.test/api/folders"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "folders_load_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/folders                                                    */
/* ------------------------------------------------------------------ */

describe("POST /api/folders", () => {
  const create = (body: unknown) => createFolder(jsonRequest("https://prisma.test/api/folders", "POST", body));

  it("gate fechado devolve exatamente a response do guard e nada grava", async () => {
    gateState.ok = false;
    gateState.denyStatus = 403;
    const response = await create({ name: "Pasta" });
    expect(response).toBe(gateState.denyResponse);
    expect(insertedValues(fake(), "video_folders")).toHaveLength(0);
  });

  it("cria pasta com user_id do titular da sessão e contrato snake_case", async () => {
    fake().state.insertResults["video_folders"] = [folderRow({ name: "Pasta Nova" })];
    const response = await create({ name: "  Pasta Nova  " });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      folder: { id: FOLDER_ID, user_id: OWNER, name: "Pasta Nova", created_at: "2026-01-01T10:00:00.000Z" },
    });

    const inserted = insertedValues(fake(), "video_folders") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    // Sempre o accountOwnerId da sessão - nome nunca cria pasta para outro.
    expect(inserted[0]).toMatchObject({ userId: OWNER, name: "Pasta Nova" });
  });

  it("nome vazio, só espaços ou não-string devolve 400 invalid_name", async () => {
    for (const name of ["", "   ", 42, null]) {
      const response = await create({ name });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_name" });
    }
    expect(insertedValues(fake(), "video_folders")).toHaveLength(0);
  });

  it("nome é truncado em 100 caracteres", async () => {
    fake().state.insertResults["video_folders"] = [folderRow({ name: "N".repeat(100) })];
    const response = await create({ name: "N".repeat(150) });
    expect(response.status).toBe(201);
    const inserted = insertedValues(fake(), "video_folders") as Array<Record<string, unknown>>;
    expect(String(inserted[0]?.name)).toHaveLength(100);
  });

  it("falha ao inserir devolve 400 folder_create_failed", async () => {
    fake().state.failingTables["video_folders"] = true;
    const response = await create({ name: "Pasta" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "folder_create_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/folders/[id]                                             */
/* ------------------------------------------------------------------ */

describe("DELETE /api/folders/[id]", () => {
  const del = (id: string = FOLDER_ID) =>
    deleteFolder(new Request(`https://prisma.test/api/folders/${id}`, { method: "DELETE" }), ctx(id));

  it("gate fechado devolve exatamente a response do guard", async () => {
    gateState.ok = false;
    const response = await del();
    expect(response).toBe(gateState.denyResponse);
    expect(capturedWheres).toHaveLength(0);
  });

  it("exclusão é sempre escopada por id + accountOwnerId da sessão", async () => {
    const response = await del(OTHER_FOLDER_ID);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // A única proteção IDOR desta rota é o filtro da query: ele precisa
    // carregar o user_id do titular e o id do path.
    assertDeleteScoped(videoFoldersTable, { id: OTHER_FOLDER_ID, owner: OWNER });
  });

  it("falha no banco devolve 400 folder_delete_failed", async () => {
    failingDeletes["video_folders"] = true;
    const response = await del();
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "folder_delete_failed" });
  });
});
