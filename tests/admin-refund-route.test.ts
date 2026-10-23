import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/admin/users/refund (spec Pagamentos, item 4): reembolso manual
 * do último pagamento com janela de REFUND_WINDOW_DAYS. Guard admin real
 * (csrf + sessão + papel), rate limit e alert-webhook mockados; Stripe e db
 * falsos por tabela - mesmos preceitos dos testes do webhook.
 */

const { authState, dbState, stripeState, alertCalls } = vi.hoisted(() => ({
  authState: { userId: "admin-1" as string | null, isAdmin: true },
  dbState: { profilesRows: [] as Array<Record<string, unknown>> },
  stripeState: {
    chargesList: null as null | ((params: Record<string, unknown>) => Promise<{ data: Array<Record<string, unknown>> }>),
    refundsCreate: null as null | ((params: Record<string, unknown>) => Promise<Record<string, unknown>>),
  },
  alertCalls: [] as Array<{ title?: string; detail?: string; kind?: string }>,
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
  getCurrentAdminUser: vi.fn(async () =>
    authState.userId && authState.isAdmin ? { id: authState.userId, email: "admin@prisma.test", role: "admin" } : null,
  ),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/security/alert-webhook", () => ({
  alertOperations: vi.fn(async (input: { title?: string; detail?: string; kind?: string }) => {
    alertCalls.push(input);
  }),
}));

vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");
  const selectChain = () => {
    let table: string | null = null;
    const resolve = () => (table && dbState.profilesRows) || [];
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
    };
    for (const method of ["from", "where", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
        return chain;
      };
    }
    return chain;
  };
  return { db: { select: () => selectChain() }, pool: {}, schema };
});

vi.mock("@/lib/billing/stripe/client", () => ({
  getStripe: () => ({
    charges: {
      list: (params: Record<string, unknown>) => {
        if (!stripeState.chargesList) throw new Error("charges.list não stubado");
        return stripeState.chargesList(params);
      },
    },
    refunds: {
      create: (params: Record<string, unknown>) => {
        if (!stripeState.refundsCreate) throw new Error("refunds.create não stubado");
        return stripeState.refundsCreate(params);
      },
    },
  }),
}));

import { POST } from "@/app/api/admin/users/refund/route";
import { REFUND_WINDOW_DAYS } from "@/lib/billing/catalog";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const DAY_MS = 86_400_000;

function post(body: unknown) {
  return POST(
    new Request("https://prisma.test/api/admin/users/refund", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://prisma.test" },
      body: JSON.stringify(body),
    }),
  );
}

function paidCharge(overrides: Record<string, unknown> = {}) {
  return { id: "ch_ok", status: "succeeded", created: Math.floor((Date.now() - DAY_MS) / 1000), amount: 14_790, ...overrides };
}

function chargeWindowExpired() {
  return paidCharge({ id: "ch_old", created: Math.floor((Date.now() - (REFUND_WINDOW_DAYS + 1) * DAY_MS) / 1000) });
}

beforeEach(() => {
  authState.userId = "admin-1";
  authState.isAdmin = true;
  dbState.profilesRows = [{ id: USER_ID, stripeCustomerId: "cus_001" }];
  alertCalls.length = 0;
  stripeState.chargesList = async () => ({ data: [paidCharge()] });
  stripeState.refundsCreate = async () => ({ id: "re_001", amount: 14_790 });
  // A rota distingue 503 (sem env) de 502 (env presente, chamada falhou):
  // com a env falsa, o teste da falha exercita o 502 de verdade.
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_refund_route";
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

describe("POST /api/admin/users/refund (spec Pagamentos, item 4)", () => {
  it("admin autenticado: reembolsa o último charge pago e emite alerta refund_issued", async () => {
    const refundsCreate = vi.fn(stripeState.refundsCreate!);
    stripeState.refundsCreate = refundsCreate as unknown as typeof stripeState.refundsCreate;

    const response = await post({ userId: USER_ID, reason: "cliente pediu reembolso no suporte" });
    const body = (await response.json()) as { refunded?: boolean; charge_id?: string; amount_cents?: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ refunded: true, charge_id: "ch_ok", refund_id: "re_001", amount_cents: 14_790 });
    expect(refundsCreate).toHaveBeenCalledWith({ charge: "ch_ok" });
    expect(alertCalls[0]).toMatchObject({ kind: "refund_issued" });
    expect(alertCalls[0]!.detail).toContain(USER_ID);
    expect(alertCalls[0]!.detail).toContain("reembolso no suporte");
  });

  it("charge pago há mais de 7 dias → 400 refund_window_expired (sem refund)", async () => {
    const refundsCreate = vi.fn(stripeState.refundsCreate!);
    stripeState.refundsCreate = refundsCreate as unknown as typeof stripeState.refundsCreate;
    stripeState.chargesList = async () => ({ data: [chargeWindowExpired()] });

    const response = await post({ userId: USER_ID, reason: "fora da janela" });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("refund_window_expired");
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("sem charge pago recente → 404 paid_charge_not_found", async () => {
    stripeState.chargesList = async () => ({ data: [{ id: "ch_fail", status: "failed", created: Math.floor(Date.now() / 1000), amount: 100 }] });

    const response = await post({ userId: USER_ID });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("paid_charge_not_found");
  });

  it("conta sem customer do Stripe → 404 stripe_customer_not_found", async () => {
    dbState.profilesRows = [{ id: USER_ID, stripeCustomerId: null }];

    const response = await post({ userId: USER_ID });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("stripe_customer_not_found");
  });

  it("conta inexistente → 404 account_not_found", async () => {
    dbState.profilesRows = [];

    const response = await post({ userId: USER_ID });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe("account_not_found");
  });

  it("userId inválido → 400 invalid_payload", async () => {
    const response = await post({ userId: "nao-eu-um-uuid" });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_payload");
  });

  it("sem sessão → 401", async () => {
    authState.userId = null;

    const response = await post({ userId: USER_ID });

    expect(response.status).toBe(401);
  });

  it("usuário comum (não admin) → 403", async () => {
    authState.isAdmin = false;

    const response = await post({ userId: USER_ID });

    expect(response.status).toBe(403);
  });

  it("falha no Stripe → 502 + alerta refund_failed (nunca silenciosa)", async () => {
    stripeState.refundsCreate = async () => {
      throw new Error("stripe api down");
    };

    const response = await post({ userId: USER_ID, reason: "teste" });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("stripe_unavailable");
    expect(alertCalls[0]).toMatchObject({ kind: "refund_failed" });
  });
});
