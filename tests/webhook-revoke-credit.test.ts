import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { reconcileAiCreditCheckout } from "@/lib/billing/ai-credit-reconcile";
import { reconcileBillingCheckout } from "@/lib/billing/reconcile";
import { abacateRequest } from "@/lib/billing/abacatepay/client";
import { shouldRequireHmac, verifyWebhookSecret, verifyWebhookSignature } from "@/lib/billing/abacatepay/webhook";
import type { AbacateCheckout } from "@/lib/billing/abacatepay/types";
import { currentFakeDb, insertedValues, resetFakeDb, updatedSets } from "./helpers/fake-db";

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

vi.mock("@/lib/billing/abacatepay/client", () => ({
  abacateRequest: vi.fn(),
}));

const mockRequest = vi.mocked(abacateRequest);

const fake = () => currentFakeDb();

/**
 * Linha devolvida pelos selects em `ai_credit_checkouts` (apply e revoke
 * leem da mesma tabela): userId + status para o revoke e creditTotal
 * (credits + bonus) para o apply.
 */
function setCreditCheckoutRow(row: Record<string, unknown> | null): void {
  fake().state.selectRows["ai_credit_checkouts"] = row ? [row] : [];
}

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

// Total creditado simulado (credits + bonus_cents do produto).
const CREDIT_TOTAL = 190;

function ledgerInserts(): Array<Record<string, unknown>> {
  return insertedValues(fake(), "ai_credit_ledger") as Array<Record<string, unknown>>;
}

describe("reconcileAiCreditCheckout (RM-05 / RH-01)", () => {
  beforeEach(() => {
    resetFakeDb(fake());
    mockRequest.mockReset();
  });

  it("nao ativa quando o provedor esta em devMode", async () => {
    mockRequest.mockResolvedValue([paidProvider({ devMode: true })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(ledgerInserts()).toHaveLength(0);
  });

  it("nao ativa quando o amount diverge do amount_cents local", async () => {
    mockRequest.mockResolvedValue([paidProvider({ amount: 2000 })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(ledgerInserts()).toHaveLength(0);
  });

  it("nao ativa quando a currency nao e BRL", async () => {
    mockRequest.mockResolvedValue([paidProvider({ currency: "USD" })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(ledgerInserts()).toHaveLength(0);
  });

  it("ativa quando PAID e coerente (amount + currency + nao devMode)", async () => {
    mockRequest.mockResolvedValue([paidProvider()]);
    setCreditCheckoutRow({ userId: CREDIT_CHECKOUT.user_id, status: "pending", creditTotal: CREDIT_TOTAL });
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(true);
    // Idempotência de ledger: o lançamento de compra usa a referência única
    // `ai-credit:<checkout_id>` — a segunda entrega não creditaria de novo.
    const purchases = ledgerInserts().filter((row) => row.reason === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toEqual({
      userId: CREDIT_CHECKOUT.user_id,
      amount: CREDIT_TOTAL,
      reason: "purchase",
      reference: `ai-credit:${CREDIT_CHECKOUT.id}`,
      metadata: { checkoutId: CREDIT_CHECKOUT.id },
    });
    // A carteira só é incrementada junto com o lançamento inédito.
    expect(insertedValues(fake(), "ai_credit_wallets")).toHaveLength(1);
  });

  it("nao credita duas vezes: lancamento repetido nao toca a carteira", async () => {
    mockRequest.mockResolvedValue([paidProvider()]);
    setCreditCheckoutRow({ userId: CREDIT_CHECKOUT.user_id, status: "pending", creditTotal: CREDIT_TOTAL });
    // ON CONFLICT (reference) DO NOTHING devolve vazio = entrega já aplicada.
    fake().state.insertResults["ai_credit_ledger"] = [];
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(true);
    expect(ledgerInserts()).toHaveLength(1);
    expect(insertedValues(fake(), "ai_credit_wallets")).toHaveLength(0);
  });

  it("REFUNDED reverte via ledger na mesma referencia da compra (idempotente)", async () => {
    mockRequest.mockResolvedValue([paidProvider({ status: "REFUNDED" })]);
    // Só há o que estornar se o checkout está 'paid' e existe o lançamento de compra.
    setCreditCheckoutRow({ userId: CREDIT_CHECKOUT.user_id, status: "paid", creditTotal: CREDIT_TOTAL });
    fake().state.selectRows["ai_credit_ledger"] = [{ amount: CREDIT_TOTAL }];
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    const refunds = ledgerInserts().filter((row) => row.reason === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      userId: CREDIT_CHECKOUT.user_id,
      amount: -CREDIT_TOTAL,
      reference: `ai-credit:${CREDIT_CHECKOUT.id}`,
    });
    // A carteira é decrementada (com piso 0) e o checkout marcado como refunded.
    expect(updatedSets(fake(), "ai_credit_wallets")).toHaveLength(1);
    expect(updatedSets(fake(), "ai_credit_checkouts").some((set) => (set as { status?: string }).status === "refunded")).toBe(true);
  });

  it("refund de compra nunca paga e no-op: nenhum lancamento de estorno", async () => {
    mockRequest.mockResolvedValue([paidProvider({ status: "REFUNDED" })]);
    setCreditCheckoutRow({ userId: CREDIT_CHECKOUT.user_id, status: "pending", creditTotal: CREDIT_TOTAL });
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(ledgerInserts().filter((row) => row.reason === "refund")).toHaveLength(0);
  });

  it("EXPIRED apenas marca o checkout local, sem estorno", async () => {
    mockRequest.mockResolvedValue([paidProvider({ status: "EXPIRED" })]);
    expect(await reconcileAiCreditCheckout(CREDIT_CHECKOUT)).toBe(false);
    expect(ledgerInserts()).toHaveLength(0);
  });

  it("nao consulta o provedor quando o checkout local ja esta terminal", async () => {
    expect(await reconcileAiCreditCheckout({ ...CREDIT_CHECKOUT, status: "paid" })).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("reconcileBillingCheckout (RM-05)", () => {
  beforeEach(() => {
    resetFakeDb(fake());
    mockRequest.mockReset();
  });

  it("nao ativa em devMode", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", devMode: true })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(false);
    expect(insertedValues(fake(), "subscriptions")).toHaveLength(0);
  });

  it("nao ativa quando o amount diverge", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", amount: 12345 })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(false);
    expect(insertedValues(fake(), "subscriptions")).toHaveLength(0);
  });

  it("ativa quando PAID e coerente", async () => {
    mockRequest.mockResolvedValue([paidProvider({ externalId: "prisma_zzz", amount: 9700 })]);
    expect(await reconcileBillingCheckout(BILLING_CHECKOUT)).toBe(true);
    // Checkout marcado como pago e assinatura do titular criada (upsert por user_id).
    const paidSets = updatedSets(fake(), "billing_checkouts") as Array<Record<string, unknown>>;
    expect(paidSets.some((set) => set.status === "paid")).toBe(true);
    const subscriptionUpserts = insertedValues(fake(), "subscriptions") as Array<Record<string, unknown>>;
    expect(subscriptionUpserts).toHaveLength(1);
    expect(subscriptionUpserts[0]).toMatchObject({
      userId: BILLING_CHECKOUT.user_id,
      planId: BILLING_CHECKOUT.plan_id,
      billingMethod: "pix",
      status: "active",
    });
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
