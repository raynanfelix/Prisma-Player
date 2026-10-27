import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rotas da tela Faturamento + pesquisa de churn (spec Billing Completo,
 * itens 3 e 4): GET /api/billing/invoices, GET /api/billing/payment-method
 * e POST /api/billing/churn-survey - guard manage, rate limit, Stripe e
 * banco mockados (nenhum teste toca a rede).
 */

const { gateState, dbState, stripeState, rateLimitCalls, alertCalls, insertCalls } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, denyResponse: null as Response | null },
  dbState: { selectRows: {} as Record<string, unknown[]> },
  stripeState: {
    invoicesPage: { data: [] as Array<Record<string, unknown>> },
    invoicesListArgs: [] as Array<Record<string, unknown>>,
    retrieveArgs: [] as Array<Record<string, unknown>>,
    customer: null as Record<string, unknown> | null,
    envMissing: false,
  },
  rateLimitCalls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
  alertCalls: [] as Array<{ title?: string; detail?: string; kind?: string }>,
  insertCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/security/alert-webhook", () => ({
  alertOperations: vi.fn(async (input: { title?: string; detail?: string; kind?: string }) => {
    alertCalls.push(input);
  }),
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) {
      gateState.denyResponse = gateState.denyResponse ?? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return { ok: false, response: gateState.denyResponse };
    }
    return { ok: true, userId: "user-session", account: { accountOwnerId: "owner-1" }, plan: { access: { hasAccess: true } } };
  }),
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
    for (const method of ["from", "where", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
        return chain;
      };
    }
    return chain;
  };

  const db = {
    select: () => selectChain(),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertCalls.push(values);
        return Promise.resolve();
      },
    }),
  };

  return { db, pool: {}, schema };
});

vi.mock("@/lib/billing/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/stripe/client")>();
  return {
    ...actual,
    getStripe: () => {
      if (stripeState.envMissing) throw new Error("Stripe não configurado: defina STRIPE_SECRET_KEY no ambiente.");
      return {
        invoices: {
          list: async (args: Record<string, unknown>) => {
            stripeState.invoicesListArgs.push(args);
            return stripeState.invoicesPage;
          },
        },
        customers: {
          retrieve: async (id: string, args: Record<string, unknown>) => {
            stripeState.retrieveArgs.push({ id, ...args });
            if (!stripeState.customer) throw new Error(`No such customer: ${id}`);
            return stripeState.customer;
          },
        },
      };
    },
  };
});

import { GET as listInvoices } from "@/app/api/billing/invoices/route";
import { GET as getPaymentMethod } from "@/app/api/billing/payment-method/route";
import { POST as churnSurvey } from "@/app/api/billing/churn-survey/route";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

function get(path: string): Promise<Response> {
  const handler = path === "/api/billing/invoices" ? listInvoices : getPaymentMethod;
  return handler(new Request(`https://prisma.test${path}`, { headers: { origin: "https://prisma.test" } }));
}

function post(path: string, body: unknown): Promise<Response> {
  return churnSurvey(
    new Request(`https://prisma.test${path}`, {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gateState.ok = true;
  gateState.denyResponse = null;
  dbState.selectRows = {};
  stripeState.invoicesPage = { data: [] };
  stripeState.invoicesListArgs = [];
  stripeState.retrieveArgs = [];
  stripeState.customer = null;
  stripeState.envMissing = false;
  rateLimitCalls.length = 0;
  alertCalls.length = 0;
  insertCalls.length = 0;
  process.env.STRIPE_SECRET_KEY = "rk_test_fake_key";
});

afterEach(() => {
  if (ORIGINAL_KEY) process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  else delete process.env.STRIPE_SECRET_KEY;
});

describe("GET /api/billing/invoices (item 3)", () => {
  it("sem stripe_customer_id → { invoices: [] } sem chamar o Stripe", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: null }] };

    const response = await get("/api/billing/invoices");
    const body = (await response.json()) as { invoices: unknown[] };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.invoices).toEqual([]);
    expect(stripeState.invoicesListArgs).toEqual([]);
    expect(rateLimitCalls).toEqual([
      { scope: "billing-invoices:owner-1", options: { max: 20, windowMs: 60_000, failClosed: true } },
    ]);
  });

  it("com customer → lista as últimas 12 mapeadas (data, valor, status, link)", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_inv_1" }] };
    stripeState.invoicesPage = {
      data: [
        {
          id: "in_123",
          number: "2026-001",
          created: 1760000000,
          total: 14790,
          currency: "brl",
          status: "paid",
          hosted_invoice_url: "https://invoice.stripe.com/i/in_123",
        },
        { id: "in_456", number: null, created: 1760100000, total: 6790, currency: "brl", status: "void", hosted_invoice_url: null },
      ],
    };

    const response = await get("/api/billing/invoices");
    const body = (await response.json()) as { invoices: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(stripeState.invoicesListArgs).toEqual([{ customer: "cus_inv_1", limit: 12 }]);
    expect(body.invoices).toHaveLength(2);
    expect(body.invoices[0]).toMatchObject({
      id: "in_123",
      number: "2026-001",
      total_cents: 14790,
      currency: "brl",
      status: "paid",
      hosted_invoice_url: "https://invoice.stripe.com/i/in_123",
    });
    expect(String(body.invoices[0]!.created_at)).toBe(new Date(1760000000 * 1000).toISOString());
    expect(body.invoices[1]).toMatchObject({ id: "in_456", number: null, status: "void", hosted_invoice_url: null });
  });

  it("sem sessão (guard nega) → repassa 401", async () => {
    gateState.ok = false;

    const response = await get("/api/billing/invoices");

    expect(response.status).toBe(401);
  });

  it("Stripe fora → 503 com mensagem GENÉRICA + alerta operacional (Bug A: infra nunca no corpo)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_inv_1" }] };

    const response = await get("/api/billing/invoices");
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("stripe_unavailable");
    // Instrução de infra não vai ao cliente final - o dono recebe o motivo
    // pelo alertOperations.
    expect(body.message).not.toContain("STRIPE_SECRET_KEY");
    expect(body.message).toContain("Não foi possível conectar ao serviço de cobrança");
    expect(alertCalls[0]).toMatchObject({ kind: "billing_invoices_failed" });
  });
});

describe("GET /api/billing/payment-method (item 3)", () => {
  it("sem stripe_customer_id → { card: null } (estado 'Nenhum método salvo')", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: null }] };

    const response = await get("/api/billing/payment-method");
    const body = (await response.json()) as { card: unknown };

    expect(response.status).toBe(200);
    expect(body.card).toBeNull();
    expect(stripeState.retrieveArgs).toEqual([]);
    expect(rateLimitCalls).toEqual([
      { scope: "billing-payment-method:owner-1", options: { max: 20, windowMs: 60_000, failClosed: true } },
    ]);
  });

  it("com customer → expande invoice_settings.default_payment_method e devolve o cartão", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_card_1" }] };
    stripeState.customer = {
      object: "customer",
      deleted: false,
      invoice_settings: {
        default_payment_method: { object: "payment_method", card: { brand: "visa", last4: "4242", exp_month: 8, exp_year: 2028 } },
      },
    };

    const response = await get("/api/billing/payment-method");
    const body = (await response.json()) as { card: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(stripeState.retrieveArgs).toEqual([
      { id: "cus_card_1", expand: ["invoice_settings.default_payment_method"] },
    ]);
    expect(body.card).toEqual({ brand: "visa", last4: "4242", exp_month: 8, exp_year: 2028 });
  });

  it("customer deletado no Stripe → { card: null }", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_dead" }] };
    stripeState.customer = { object: "customer", deleted: true };

    const response = await get("/api/billing/payment-method");

    expect(response.status).toBe(200);
    expect(((await response.json()) as { card: unknown }).card).toBeNull();
  });

  it("payment method sem expand (só id pm_…) → { card: null }", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_pm_id" }] };
    stripeState.customer = { object: "customer", deleted: false, invoice_settings: { default_payment_method: "pm_123" } };

    const response = await get("/api/billing/payment-method");

    expect(response.status).toBe(200);
    expect(((await response.json()) as { card: unknown }).card).toBeNull();
  });

  it("Stripe fora → 503 + alerta operacional", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_card_1" }] };

    const response = await get("/api/billing/payment-method");

    expect(response.status).toBe(503);
    expect(alertCalls[0]).toMatchObject({ kind: "billing_payment_method_failed" });
  });
});

describe("POST /api/billing/churn-survey (item 4)", () => {
  it("reason válido com detalhe + melhoria → insere no banco com userId da sessão e feedback combinado", async () => {
    const response = await post("/api/billing/churn-survey", {
      reason: "preco",
      feedback: "Muito caro para meu volume",
      improvement: "Plano intermediário",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rateLimitCalls).toEqual([
      { scope: "billing-churn-survey:owner-1", options: { max: 10, windowMs: 60_000, failClosed: true } },
    ]);
    expect(insertCalls).toEqual([
      { userId: "owner-1", reason: "preco", feedback: "Muito caro para meu volume\n\nMelhoria: Plano intermediário" },
    ]);
  });

  it("só a melhoria preenchida → feedback com o label, sem separador solto", async () => {
    await post("/api/billing/churn-survey", { reason: "nao_uso", improvement: "Onboarding mais rápido" });

    expect(insertCalls).toEqual([{ userId: "owner-1", reason: "nao_uso", feedback: "Melhoria: Onboarding mais rápido" }]);
  });

  it("nenhum texto → insere sem feedback (campo nullable)", async () => {
    await post("/api/billing/churn-survey", { reason: "migrei_ferramenta" });

    expect(insertCalls).toEqual([{ userId: "owner-1", reason: "migrei_ferramenta" }]);
  });

  it("reason fora da lista → 400 invalid_reason sem tocar o banco", async () => {
    const response = await post("/api/billing/churn-survey", { reason: "qualquer" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_reason" });
    expect(insertCalls).toEqual([]);
    expect(rateLimitCalls).toEqual([
      { scope: "billing-churn-survey:owner-1", options: { max: 10, windowMs: 60_000, failClosed: true } },
    ]);
  });

  it("sem sessão (guard nega) → repassa 401", async () => {
    gateState.ok = false;

    const response = await post("/api/billing/churn-survey", { reason: "outro" });

    expect(response.status).toBe(401);
    expect(insertCalls).toEqual([]);
  });
});
