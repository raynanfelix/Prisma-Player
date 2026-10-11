import { beforeEach, describe, expect, it, vi } from "vitest";

const { gateState, dbState, lastInsert } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, owner: "user-a" },
  dbState: { caseOwner: "user-a" as string | null },
  lastInsert: { body: null as Record<string, unknown> | null },
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

function queryResult(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  chain.insert = vi.fn((body: Record<string, unknown>) => {
    lastInsert.body = body;
    return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "case-1" }, error: null })) })) };
  });
  chain.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "support_cases") return queryResult(dbState.caseOwner ? { id: "case-1" } : null);
      return queryResult(null);
    }),
  })),
}));

import { POST as postCase } from "@/app/api/support/cases/route";
import { POST as postNote } from "@/app/api/support/notes/route";

function req(body: unknown) {
  return new Request("https://prisma.test/api/support/x", { method: "POST", headers: { origin: "https://prisma.test" }, body: JSON.stringify(body) });
}

describe("tickets do cliente", () => {
  beforeEach(() => {
    gateState.ok = true;
    gateState.owner = "user-a";
    dbState.caseOwner = "user-a";
    lastInsert.body = null;
  });

  it("cria caso sempre com o user_id da sessão (ignora body)", async () => {
    const response = await postCase(req({ userId: "user-b", subject: "Ajuda", category: "geral", priority: "normal" }));
    expect(response.status).toBe(200);
    expect(lastInsert.body?.user_id).toBe("user-a");
  });

  it("nega mensagem em caso de outro usuário com 404", async () => {
    dbState.caseOwner = null;
    const response = await postNote(req({ caseId: "11111111-1111-4111-8111-111111111111", body: "oi" }));
    expect(response.status).toBe(404);
  });

  it("sem sessão: nega", async () => {
    gateState.ok = false;
    const response = await postCase(req({ subject: "Ajuda" }));
    expect(response.status).toBe(401);
  });
});
