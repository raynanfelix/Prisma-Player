import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { reconcileAiCreditCheckout } from "@/lib/billing/ai-credit-reconcile";
import { reconcileBillingCheckout } from "@/lib/billing/reconcile";
import { abacateRequest } from "@/lib/billing/abacatepay/client";
import { shouldRequireHmac, verifyWebhookSecret, verifyWebhookSignature } from "@/lib/billing/abacatepay/webhook";
import type { AbacateCheckout } from "@/lib/billing/abacatepay/types";

// Admin client com chains update().eq().eq() awaitable (o ultimo .eq resolve) e
// registro das chamadas .rpc para provar a decisao de estorno.
const { adminCalls, makeAdmin } = vi.hoisted(() => {
  const adminCalls: Array<{ rpc: string; params?: Record<string, unknown>; table?: string }> = [];
  const makeEqChain = () => {
    const p = Promise.resolve({ data: null, error: null });
    const chain = Object.assign(p, {
      eq: vi.fn(() => chain),
    });
    return chain;
  };
  const makeAdmin = () => ({
    rpc: vi.fn(async (name: string, params?: Record<string, unknown>) => {
      adminCalls.push({ rpc: name, params });
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === "subscriptions") {
        return { upsert: vi.fn(async () => ({ data: null, error: null })) };
      }
      return {
        update: vi.fn(() => {
          adminCalls.push({ rpc: "", table, params: { op: "update" } });
          return makeEqChain();
        }),
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
  });
  return { adminCalls, makeAdmin };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => makeAdmin()),
}));

vi.mock("@/lib/billing/abacatepay/client", () => ({
  abacateRequest: vi.fn(),
}));

const mockRequest = vi.mocked(abacateRequest);

function paidProvider(overrides: Partial<AbacateCheckout> = {}): AbacateCheckout {
  return {
    id: "px_provider_1",
    externalId: "prisma_ai_abc",
    url: "https://pay.example/px_provider_1",
    amount: 1900,
    currency: "BRL",
    status: "PAID",
    devMode: false,
    ...overrides,
  };
}

const CREDIT_CHECKOUT = {
  id: "c0000000-0000-0000-0000-000000000001",
  user_id: "u0000000-0000-0000-0000-000000000002",
  external_id: "prisma_ai_abc",
  status: "pending",
  amount_cents: 1900,
};

const BILLING_CHECKOUT = {
  id: "b0000000-0000-0000-0000-000000000003",
  user_id: "u0000000-0000-0000-0000-000000000002",
  plan_id: "p0000000-0000-0000-0000-000000000004",
  checkout_type: "pix" as const,
  external_id: "prisma_zzz",
  status: "pending",
  amount_cents: 9700,
  previous_provider_subscription_id: null,
};

function calls(): Array<{ rpc: string; params?: Record<string, unknown> }> {
  return adminCalls.filter((call) => call.rpc !== "");
}

describe("reconcileAiCreditCheckout (RM-05 / RH-01)", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    mockRequest.mockReset();
  });

  it("nao ativa quando o provedor esta em devMode", async () => {
    mockRequest.mockResolvedValue([paidProvider({ devMode: true })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(calls().filter((call) => call.rpc === "apply_ai_credit_purchase")).toHaveLength(0);
  });

  it("nao ativa quando o amount diverge do amount_cents local", async () => {
    mockRequest.mockResolvedValue([paidProvider({ amount: 2000 })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(calls().filter((call) => call.rpc === "apply_ai_credit_purchase")).toHaveLength(0);
  });

  it("nao ativa quando a currency nao e BRL", async () => {
    mockRequest.mockResolvedValue([paidProvider({ currency: "USD" })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(calls().filter((call) => call.rpc === "apply_ai_credit_purchase")).toHaveLength(0);
  });

  it("ativa quando PAID e coerente (amount + currency + nao devMode)", async () => {
    mockRequest.mockResolvedValue([paidProvider()]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(true);
    const applyCalls = calls().filter((call) => call.rpc === "apply_ai_credit_purchase");
    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0].params).toEqual({
      p_checkout_id: CREDIT_CHECKOUT.id,
      p_provider_event_id: `ai-credit:${CREDIT_CHECKOUT.id}`,
    });
  });

  it("REFUNDED chama o RPC de revoke e marca refunded", async () => {
    mockRequest.mockResolvedValue([paidProvider({ status: "REFUNDED" })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    const revokeCalls = calls().filter((call) => call.rpc === "revoke_ai_credit_purchase");
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0].params).toEqual({ p_checkout_id: CREDIT_CHECKOUT.id });
  });

  it("EXPIRED apenas marca o checkout local, sem chamar revoke", async () => {
    mockRequest.mockResolvedValue([paidProvider({ status: "EXPIRED" })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(calls().filter((call) => call.rpc === "revoke_ai_credit_purchase")).toHaveLength(0);
  });

  it("nao consulta o provedor quando o checkout local ja esta terminal", async () => {
    expect(await reconcileAiCreditCheckout({ ...CREDIT_CHECKOUT, status: "paid" })).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("reconcileBillingCheckout (RM-05)", () => {
  beforeEach(() => {
    adminCalls.length = 0;
    mockRequest.mockReset();
  });

  it("nao ativa em devMode", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", devMode: true })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(false);
  });

  it("nao ativa quando o amount diverge", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", amount: 12345 })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(false);
  });

  it("ativa quando PAID e coerente", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", amount: 9700 })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(true);
  });
});

describe("webhook auth (RM-01)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    delete process.env.ABACATEPAY_WEBHOOK_SIGNING_SECRET;
    delete process.env.ABACATEPAY_REQUIRE_HMAC;
    delete process.env.ABACATEPAY_ALLOW_URL_SECRET;
  });

  describe("shouldRequireHmac", () => {
    it("exige assinatura por padrao em producao", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(shouldRequireHmac()).toBe(true);
    });

    it("aceita URL secret em producao apenas quando ABACATEPAY_ALLOW_URL_SECRET=true", () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.ABACATEPAY_ALLOW_URL_SECRET = "true";
      expect(shouldRequireHmac()).toBe(false);
    });

    it("fora de producao mantem o OR por padrao", () => {
      vi.stubEnv("NODE_ENV", "test");
      expect(shouldRequireHmac()).toBe(false);
    });
  });

  describe("verifyWebhookSecret", () => {
    it("rejeita o ?webhookSecret= por padrao (ALLOW_URL_SECRET ausente)", () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = "legacy-secret";
      expect(verifyWebhookSecret("legacy-secret")).toBe(false);
    });

    it("aceita o ?webhookSecret= apenas com ALLOW_URL_SECRET=true explicito", () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = "legacy-secret";
      process.env.ABACATEPAY_ALLOW_URL_SECRET = "true";
      expect(verifyWebhookSecret("legacy-secret")).toBe(true);
      expect(verifyWebhookSecret("wrong-secret")).toBe(false);
    });
  });

  describe("verifyWebhookSignature", () => {
    const body = JSON.stringify({ event: "checkout.completed", data: { id: "px_test" } });

    it("usa apenas o signing secret dedicado; o secret da URL nunca e chave HMAC (RH-02)", () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = "legacy-secret";
      process.env.ABACATEPAY_WEBHOOK_SIGNING_SECRET = "signing-secret";
      const good = createHmac("sha256", "signing-secret").update(body).digest("hex");
      const legacy = createHmac("sha256", "legacy-secret").update(body).digest("hex");
      expect(verifyWebhookSignature(body, good)).toBe(true);
      expect(verifyWebhookSignature(body, legacy)).toBe(false);
    });

    it("sem signing secret dedicado, a verificacao HMAC fica indisponivel (fail-closed, RH-02)", () => {
      process.env.ABACATEPAY_WEBHOOK_SECRET = "legacy-secret";
      const legacy = createHmac("sha256", "legacy-secret").update(body).digest("hex");
      expect(verifyWebhookSignature(body, legacy)).toBe(false);
      expect(verifyWebhookSignature(body, null)).toBe(false);
    });
  });
});