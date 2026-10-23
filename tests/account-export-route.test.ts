import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado compartilhado com as factories de mock (hoisted: as factories rodam
// antes dos imports do módulo sob teste).
const { authState, dbState, rateLimitCalls } = vi.hoisted(() => ({
  authState: { userId: "user-session" as string | null },
  dbState: { selectRows: {} as Record<string, unknown[]> },
  rateLimitCalls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async (request: Request, scope: string, options: Record<string, unknown>) => {
    void request;
    rateLimitCalls.push({ scope, options });
    return null;
  }),
}));

vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");

  const selectChain = () => {
    let table: string | null = null;
    const resolve = () => (table && dbState.selectRows[table]) || [];
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
    };
    for (const method of ["from", "where", "orderBy", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
        return chain;
      };
    }
    return chain;
  };

  const db = { select: () => selectChain() };

  return { db, pool: {}, schema };
});

import { GET as exportAccount } from "@/app/api/account/export/route";

function exportRequest(): Promise<Response> {
  return exportAccount(new Request("https://prisma.test/api/account/export"));
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = "user-session";
  dbState.selectRows = {};
  rateLimitCalls.length = 0;
});

afterEach(() => {
  // Sem env a restaurar aqui; o reset de estado vive no beforeEach, no padrão
  // do tests/billing-checkout-routes.test.ts (clearAllMocks mantém as
  // implementações das factories e limpa chamadas/once-queue).
  vi.clearAllMocks();
});

describe("GET /api/account/export - DSAR completo (LGPD art. 18, II e V)", () => {
  it("inclui equipes, convites, checkouts, pesquisas de churn e nota sobre operadores", async () => {
    dbState.selectRows = {
      profiles: [{ id: "user-session", email: "titular@prisma.test", fullName: "Titular", phone: null, avatarUrl: null, stripeCustomerId: "cus_1", locale: "pt-BR", emailNotifications: true, securityNotifications: true, createdAt: new Date("2026-01-15T10:00:00Z"), updatedAt: new Date("2026-02-20T10:00:00Z") }],
      account_team_members: [{ teamId: "team-1", role: "admin", status: "active", joinedAt: new Date("2026-03-01T08:00:00Z") }],
      account_team_invites: [{ id: "invite-1", email: "convidado@prisma.test", role: "viewer", status: "pending", invitedBy: "user-session", expiresAt: new Date("2026-03-08T08:00:00Z"), createdAt: new Date("2026-03-01T08:00:00Z") }],
      billing_checkouts: [{ id: "checkout-1", checkoutType: "card_subscription", amountCents: 14790, currency: "BRL", status: "paid", paidAt: new Date("2026-02-01T12:00:00Z"), receiptUrl: "https://receipt.test/1", createdAt: new Date("2026-02-01T12:00:00Z") }],
      billing_churn_surveys: [{ reason: "preco", feedback: "Caro para meu momento.", createdAt: new Date("2026-04-10T09:30:00Z") }],
    };

    const response = await exportRequest();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("attachment");

    // Perfil continua vindo (snake_case + datas ISO).
    expect(body["profile"]).toMatchObject({ id: "user-session", full_name: "Titular", stripe_customer_id: "cus_1" });

    // Participação em equipes: dado do titular (relação dele com workspaces).
    expect(body["teamMemberships"]).toEqual([
      { team_id: "team-1", role: "admin", status: "active", joined_at: "2026-03-01T08:00:00.000Z" },
    ]);

    // Convites enviados pelo titular (o e-mail do convidado é registro da conta).
    expect(body["teamInvites"]).toEqual([
      expect.objectContaining({ id: "invite-1", email: "convidado@prisma.test", role: "viewer", status: "pending", invited_by: "user-session" }),
    ]);

    // Checkouts: histórico de pagamento do titular.
    expect(body["billingCheckouts"]).toEqual([
      expect.objectContaining({ id: "checkout-1", checkout_type: "card_subscription", amount_cents: 14790, status: "paid" }),
    ]);

    // Churn feedback é dado do titular (Art. 18, II).
    expect(body["churnSurveys"]).toEqual([
      { reason: "preco", feedback: "Caro para meu momento.", created_at: "2026-04-10T09:30:00.000Z" },
    ]);

    // Nota sobre dados em operadores: PostHog/Stripe + canal para o titular.
    const thirdParty = body["thirdPartyData"] as Record<string, unknown>;
    expect(thirdParty["providers"]).toEqual(["Stripe", "PostHog"]);
    expect(String(thirdParty["privacyPolicyUrl"])).toBe("/privacy");
    expect(String(thirdParty["privacyContactEmail"])).toBe("privacidade@prismaplayer.com.br");
    expect(String(thirdParty["note"])).toContain("PostHog");
  });

  it("sem equipes/checkouts/churn: seções vazias, não ausentes (formato estável para o titular)", async () => {
    dbState.selectRows = { profiles: [] };

    const response = await exportRequest();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body["teamMemberships"]).toEqual([]);
    expect(body["teamInvites"]).toEqual([]);
    expect(body["billingCheckouts"]).toEqual([]);
    expect(body["churnSurveys"]).toEqual([]);
    expect(body["thirdPartyData"]).toBeTypeOf("object");
  });

  it("sem sessão: 401 sem tocar o banco", async () => {
    authState.userId = null;

    const response = await exportRequest();

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  it("rate limit: repassa a resposta 429 do limitador", async () => {
    const { rateLimit } = await import("@/lib/security/rate-limit");
    vi.mocked(rateLimit).mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }));

    const response = await exportRequest();

    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe("rate_limited");
  });
});
