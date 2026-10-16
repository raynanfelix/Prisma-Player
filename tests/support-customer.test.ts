import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentFakeDb, insertedValues, resetFakeDb } from "./helpers/fake-db";

const { gateState } = vi.hoisted(() => ({
  // Neon Auth id em formato UUID: a rota valida o formato (validateCaseInput).
  gateState: { ok: true as boolean, owner: "a0000000-0000-4000-8000-00000000000a" },
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => (gateState.ok
    ? { ok: true, userId: gateState.owner, account: { accountOwnerId: gateState.owner } }
    : { ok: false, response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { POST as postCase } from "@/app/api/support/cases/route";
import { POST as postNote } from "@/app/api/support/notes/route";

const fake = () => currentFakeDb();

function req(body: unknown) {
  return new Request("https://prisma.test/api/support/x", { method: "POST", headers: { origin: "https://prisma.test" }, body: JSON.stringify(body) });
}

describe("tickets do cliente", () => {
  beforeEach(() => {
    gateState.ok = true;
    gateState.owner = "a0000000-0000-4000-8000-00000000000a";
    resetFakeDb(fake());
  });

  afterEach(() => {
    // Higiene de isolamento: limpa mocks de guard/rate-limit entre testes.
    vi.clearAllMocks();
    resetFakeDb(fake());
  });

  it("cria caso sempre com o user_id da sessão (ignora body)", async () => {
    const response = await postCase(req({ userId: "user-b", subject: "Ajuda", category: "geral", priority: "normal" }));
    expect(response.status).toBe(200);
    const inserted = insertedValues(fake(), "support_cases") as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.userId).toBe("a0000000-0000-4000-8000-00000000000a");
    // O user_id do body nunca chega ao banco.
    expect(JSON.stringify(inserted[0])).not.toContain("user-b");
  });

  it("nega mensagem em caso de outro usuário com 404", async () => {
    // Select do dono do caso não devolve linha: caso inexistente ou de outro usuário.
    fake().state.selectRows["support_cases"] = [];
    const response = await postNote(req({ caseId: "11111111-1111-4111-8111-111111111111", body: "oi" }));
    expect(response.status).toBe(404);
    // Nada foi escrito em support_notes sem posse do caso.
    expect(insertedValues(fake(), "support_notes")).toHaveLength(0);
  });

  it("mensagem no próprio caso grava nota não-interna e bumpa o caso", async () => {
    fake().state.selectRows["support_cases"] = [{ id: "11111111-1111-4111-8111-111111111111" }];
    const response = await postNote(req({ caseId: "11111111-1111-4111-8111-111111111111", body: "oi" }));
    expect(response.status).toBe(200);
    const notes = insertedValues(fake(), "support_notes") as Array<Record<string, unknown>>;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ caseId: "11111111-1111-4111-8111-111111111111", body: "oi", isInternal: false });
    expect(updatedCount(fake(), "support_cases")).toBe(1);
  });

  it("sem sessão: nega", async () => {
    gateState.ok = false;
    const response = await postCase(req({ subject: "Ajuda" }));
    expect(response.status).toBe(401);
    expect(insertedValues(fake(), "support_cases")).toHaveLength(0);
  });
});

function updatedCount(fake: ReturnType<typeof currentFakeDb>, table: string): number {
  return fake.state.calls.filter((call) => call.op === "update" && call.table === table && call.method === "set").length;
}
