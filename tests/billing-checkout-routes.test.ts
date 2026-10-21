import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado compartilhado com as factories de mock (hoisted: as factories rodam
// antes dos imports do módulo sob teste).
const { gateState, dbState, stripeState, rateLimitCalls, alertCalls } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, denyResponse: null as Response | null },
  dbState: { selectRows: {} as Record<string, unknown[]> },
  stripeState: {
    priceId: "price_lookup_hit" as string | null,
    sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    sessionCreateArgs: [] as Array<Record<string, unknown>>,
    portalCreateArgs: [] as Array<Record<string, unknown>>,
    envMissing: false,
  },
  rateLimitCalls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
  alertCalls: [] as Array<{ title?: string; detail?: string; kind?: string }>,
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
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({}), onConflictDoUpdate: () => ({}) }) }),
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
        checkout: {
          sessions: {
            create: async (args: Record<string, unknown>) => {
              stripeState.sessionCreateArgs.push(args);
              return { id: "cs_test_123", url: stripeState.sessionUrl };
            },
          },
        },
        billingPortal: {
          sessions: {
            create: async (args: Record<string, unknown>) => {
              stripeState.portalCreateArgs.push(args);
              return { id: "bps_test_123", url: `${stripeState.sessionUrl}/portal` };
            },
          },
        },
      };
    },
    resolvePriceByLookupKey: async (lookupKey: string) => {
      if (stripeState.envMissing) throw new Error("Stripe não configurado");
      return stripeState.priceId;
    },
  };
});

import { POST as checkoutPlan } from "@/app/api/billing/checkout/route";
import { POST as checkoutCredits } from "@/app/api/billing/ai-credits/checkout/route";
import { POST as billingPortal } from "@/app/api/billing/portal/route";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  "/api/billing/checkout": checkoutPlan,
  "/api/billing/ai-credits/checkout": checkoutCredits,
  "/api/billing/portal": billingPortal,
};

function post(path: string, body: unknown): Promise<Response> {
  const handler = ROUTES[path];
  if (!handler) throw new Error(`rota desconhecida no teste: ${path}`);
  return handler(
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
  stripeState.priceId = "price_lookup_hit";
  stripeState.sessionCreateArgs = [];
  stripeState.portalCreateArgs = [];
  stripeState.envMissing = false;
  rateLimitCalls.length = 0;
  alertCalls.length = 0;
  process.env.STRIPE_SECRET_KEY = "rk_test_fake_key";
});

afterEach(() => {
  if (ORIGINAL_KEY) process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  else delete process.env.STRIPE_SECRET_KEY;
});

describe("POST /api/billing/checkout (plano)", () => {
  it("cria session subscription e devolve { url } - sem payment_method_types (dynamic methods)", async () => {
    const response = await post("/api/billing/checkout", { planSlug: "pro", billing: "monthly" });
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.url).toBe(stripeState.sessionUrl);
    expect(rateLimitCalls).toEqual([
      { scope: "billing-checkout:owner-1", options: { max: 10, windowMs: 60_000, failClosed: true } },
    ]);

    const args = stripeState.sessionCreateArgs[0]!;
    expect(args["mode"]).toBe("subscription");
    expect(args["line_items"]).toEqual([{ price: "price_lookup_hit", quantity: 1 }]);
    expect(args["client_reference_id"]).toBe("owner-1");
    expect((args["subscription_data"] as Record<string, unknown>)["metadata"]).toEqual({ accountOwnerId: "owner-1" });
    expect(args["integration_identifier"]).toBe("prisma-player-xbiachdw");
    expect(String(args["success_url"])).toContain("/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect(String(args["cancel_url"])).toContain("/dashboard/billing?checkout=cancelled");
    // Regra da skill: NUNCA payment_method_types (nem automatic_tax).
    expect("payment_method_types" in args).toBe(false);
    expect("automatic_tax" in args).toBe(false);
  });

  it("reusa o customer do Stripe do profile quando existe", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_existing_1" }] };

    await post("/api/billing/checkout", { planSlug: "pro", billing: "monthly" });

    expect(stripeState.sessionCreateArgs[0]!["customer"]).toBe("cus_existing_1");
  });

  it("slug inválido → 400 invalid_plan sem chamar o Stripe", async () => {
    const response = await post("/api/billing/checkout", { planSlug: "enterprise", billing: "monthly" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_plan" });
    expect(stripeState.sessionCreateArgs).toEqual([]);
  });

  it("billing inválido → 400 invalid_plan", async () => {
    const response = await post("/api/billing/checkout", { planSlug: "pro", billing: "weekly" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_plan" });
  });

  it("lookup não existe (seed não rodado) → 502 price_not_found com mensagem honesta", async () => {
    stripeState.priceId = null;

    const response = await post("/api/billing/checkout", { planSlug: "pro", billing: "monthly" });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe("price_not_found");
    expect(body.message).toContain("stripe-seed");
    expect(stripeState.sessionCreateArgs).toEqual([]);
  });

  it("sem STRIPE_SECRET_KEY → 503 com clear_error + alerta operacional (item 5)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;

    const response = await post("/api/billing/checkout", { planSlug: "pro", billing: "monthly" });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("stripe_unavailable");
    expect(body.message).toContain("STRIPE_SECRET_KEY");
    expect(alertCalls[0]).toMatchObject({ kind: "billing_checkout_failed" });
    expect(alertCalls[0]!.detail).toContain("owner-1");
  });

  it("sem sessão (guard nega) → repassa 401", async () => {
    gateState.ok = false;

    const response = await post("/api/billing/checkout", { planSlug: "pro", billing: "monthly" });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/billing/ai-credits/checkout (créditos)", () => {
  it("cria session payment (one-time) com payment_intent_data.metadata e devolve { url }", async () => {
    const response = await post("/api/billing/ai-credits/checkout", { packageSlug: "credits-start" });
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(body.url).toBe(stripeState.sessionUrl);
    expect(rateLimitCalls).toEqual([
      { scope: "billing-credits-checkout:owner-1", options: { max: 10, windowMs: 60_000, failClosed: true } },
    ]);

    const args = stripeState.sessionCreateArgs[0]!;
    expect(args["mode"]).toBe("payment");
    expect(args["client_reference_id"]).toBe("owner-1");
    expect((args["payment_intent_data"] as Record<string, unknown>)["metadata"]).toEqual({ accountOwnerId: "owner-1" });
    expect(args["integration_identifier"]).toBe("prisma-player-xbiachdw");
    expect("payment_method_types" in args).toBe(false);
  });

  it("packageSlug inválido → 400 invalid_package", async () => {
    const response = await post("/api/billing/ai-credits/checkout", { packageSlug: "mega-pack" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_package" });
    expect(stripeState.sessionCreateArgs).toEqual([]);
    expect(alertCalls).toEqual([]);
  });

  it("rate limit excedido → 429 repassado e sem criar session", async () => {
    const { rateLimit } = await import("@/lib/security/rate-limit");
    vi.mocked(rateLimit).mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429));

    const response = await post("/api/billing/ai-credits/checkout", { packageSlug: "credits-pro" });

    expect(response.status).toBe(429);
    expect(stripeState.sessionCreateArgs).toEqual([]);
  });

  it("Stripe fora do ar nos créditos → 503 + alerta operacional (item 5)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;

    const response = await post("/api/billing/ai-credits/checkout", { packageSlug: "credits-start" });

    expect(response.status).toBe(503);
    expect(alertCalls[0]).toMatchObject({ kind: "billing_credits_checkout_failed" });
  });
});

describe("POST /api/billing/portal", () => {
  it("sem stripe_customer_id no profile → 409 sem_stripe_customer", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: null }] };

    const response = await post("/api/billing/portal", {});
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("sem_stripe_customer");
    expect(stripeState.portalCreateArgs).toEqual([]);
  });

  it("com customer → cria sessão do portal e devolve { url }", async () => {
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_portal_1" }] };

    const response = await post("/api/billing/portal", {});
    const body = (await response.json()) as { url: string };

    expect(response.status).toBe(200);
    expect(body.url).toContain("/portal");
    expect(stripeState.portalCreateArgs).toEqual([
      { customer: "cus_portal_1", return_url: "https://prisma.test/dashboard/billing" },
    ]);
    expect(alertCalls).toEqual([]);
  });

  it("Stripe fora do ar no portal → 503 + alerta operacional (item 5)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;
    dbState.selectRows = { profiles: [{ stripeCustomerId: "cus_portal_1" }] };

    const response = await post("/api/billing/portal", {});

    expect(response.status).toBe(503);
    expect(alertCalls[0]).toMatchObject({ kind: "billing_portal_failed" });
  });
});
