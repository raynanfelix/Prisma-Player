import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";

/**
 * Webhook do Stripe: assinatura HMAC-SHA256 de VERDADE (constructEvent do
 * próprio SDK) sobre payloads assinados como o Stripe assina
 * (`t=<unix>,v1=<hmac(t.payload)>`), com fake-db por tabela para travar os
 * efeitos do fulfillment (subscriptions, profiles, wallet/ledger, eventos).
 */

const { dbState, stripeState, consoleSpy } = vi.hoisted(() => ({
  dbState: {
    events: new Map<string, { status: string; processingError: string | null }>(),
    lastEventId: null as string | null,
    eventInserts: [] as Array<Record<string, unknown>>,
    eventUpdates: [] as Array<Record<string, unknown>>,
    planRows: [] as Array<Record<string, unknown>>,
    planInserts: [] as Array<Record<string, unknown>>,
    subscriptionInserts: [] as Array<{ values: Record<string, unknown>; set: Record<string, unknown> | null }>,
    subscriptionUpdates: [] as Array<Record<string, unknown>>,
    profileUpdates: [] as Array<Record<string, unknown>>,
    walletInserts: [] as Array<{ values: Record<string, unknown>; set: Record<string, unknown> | null }>,
    ledgerInserts: [] as Array<Record<string, unknown>>,
    ledgerReferences: new Set<string>(),
    profilesRows: [] as Array<Record<string, unknown>>,
    subscriptionsRows: [] as Array<Record<string, unknown>>,
  },
  stripeState: {
    subscriptionsRetrieve: null as null | ((id: string) => Promise<unknown>),
    sessionsRetrieve: null as null | ((id: string, params?: unknown) => Promise<unknown>),
    chargesRetrieve: null as null | ((id: string) => Promise<unknown>),
    paymentIntentsRetrieve: null as null | ((id: string) => Promise<unknown>),
  },
  consoleSpy: { error: null as null | ReturnType<typeof vi.spyOn> },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");

  type WalletOp = { values: Record<string, unknown>; set: Record<string, unknown> | null };
  const promiseLike = (apply: () => unknown) => ({
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve().then(apply).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(apply).catch(onRejected),
  });

  function applyInsert(table: string, values: Record<string, unknown>, mode: { conflictNothing?: boolean; set?: Record<string, unknown> | null }, tx: { wallet: WalletOp[]; ledger: Array<Record<string, unknown>> } | null): unknown {
    if (table === "payment_webhook_events") {
      const eventId = String(values.providerEventId);
      if (mode.conflictNothing && dbState.events.has(eventId)) return [];
      dbState.events.set(eventId, { status: String(values.status ?? "received"), processingError: null });
      dbState.lastEventId = eventId;
      dbState.eventInserts.push(values);
      return [{ id: dbState.events.size }];
    }
    if (table === "billing_plans") {
      dbState.planInserts.push(values);
      dbState.planRows.push({ id: `plan-${String(values.slug)}`, ...values });
      return [];
    }
    if (table === "subscriptions") {
      dbState.subscriptionInserts.push({ values, set: mode.set ?? null });
      return [];
    }
    if (table === "ai_credit_wallets" && tx) {
      tx.wallet.push({ values, set: mode.set ?? null });
      return [];
    }
    if (table === "ai_credit_ledger" && tx) {
      const reference = String(values.reference);
      if (dbState.ledgerReferences.has(reference)) throw Object.assign(new Error("ledger duplicate"), { code: "23505" });
      tx.ledger.push(values);
      return [];
    }
    return [];
  }

  const insertApi = (table: string, tx: { wallet: WalletOp[]; ledger: Array<Record<string, unknown>> } | null) => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: () => Promise.resolve(applyInsert(table, values, { conflictNothing: true }, tx)),
        ...promiseLike(() => applyInsert(table, values, { conflictNothing: true }, tx)),
      }),
      onConflictDoUpdate: (config: { set?: Record<string, unknown> }) => promiseLike(() => applyInsert(table, values, { set: config.set ?? null }, tx)),
      ...promiseLike(() => applyInsert(table, values, {}, tx)),
    }),
  });

  const updateApi = (table: string) => ({
    set: (set: Record<string, unknown>) => ({
      where: () => ({
        returning: () => {
          applyUpdate(table, set);
          return Promise.resolve([{ id: 1 }]);
        },
        ...promiseLike(() => {
          applyUpdate(table, set);
          return [{ id: 1 }];
        }),
      }),
    }),
  });

  function applyUpdate(table: string, set: Record<string, unknown>): void {
    if (table === "payment_webhook_events") {
      dbState.eventUpdates.push(set);
      const current = dbState.lastEventId ? dbState.events.get(dbState.lastEventId) : null;
      if (current) {
        if (typeof set.status === "string") current.status = set.status;
        if ("processingError" in set) current.processingError = (set.processingError as string | null) ?? null;
      }
    } else if (table === "subscriptions") {
      dbState.subscriptionUpdates.push(set);
    } else if (table === "profiles") {
      dbState.profileUpdates.push(set);
    }
  }

  const selectChain = () => {
    let table: string | null = null;
    const resolve = () => {
      if (table === "payment_webhook_events") {
        const current = dbState.lastEventId ? dbState.events.get(dbState.lastEventId) : null;
        return current ? [{ status: current.status }] : [];
      }
      if (table === "billing_plans") return dbState.planRows;
      if (table === "profiles") return dbState.profilesRows;
      if (table === "subscriptions") return dbState.subscriptionsRows;
      return [];
    };
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

  const makeDb = (tx: { wallet: WalletOp[]; ledger: Array<Record<string, unknown>> } | null) => ({
    select: () => selectChain(),
    update: (table: unknown) => updateApi(getTableName(table as Parameters<typeof getTableName>[0])),
    insert: (table: unknown) => insertApi(getTableName(table as Parameters<typeof getTableName>[0]), tx),
    transaction: async (fn: (txDb: unknown) => Promise<unknown>) => {
      const buffers = { wallet: [] as WalletOp[], ledger: [] as Array<Record<string, unknown>> };
      await fn(makeDb(buffers));
      dbState.walletInserts.push(...buffers.wallet);
      for (const ledger of buffers.ledger) {
        dbState.ledgerInserts.push(ledger);
        dbState.ledgerReferences.add(String(ledger.reference));
      }
    },
  });

  return { db: makeDb(null), pool: {}, schema };
});

vi.mock("@/lib/billing/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/stripe/client")>();
  const { default: Stripe } = await import("stripe");
  const sdk = new Stripe("sk_test_fake_key_for_local_webhook_tests");
  const notStubbed = (name: string) => async () => {
    throw new Error(`${name} não stubado`);
  };
  return {
    ...actual,
    getStripe: () => ({
      webhooks: {
        constructEvent: (payload: string, header: string, secret: string) => sdk.webhooks.constructEvent(payload, header, secret),
      },
      subscriptions: { retrieve: (id: string) => (stripeState.subscriptionsRetrieve ?? notStubbed("subscriptions.retrieve"))(id) },
      checkout: { sessions: { retrieve: (id: string, params?: unknown) => (stripeState.sessionsRetrieve ?? notStubbed("sessions.retrieve"))(id, params) } },
      charges: { retrieve: (id: string) => (stripeState.chargesRetrieve ?? notStubbed("charges.retrieve"))(id) },
      paymentIntents: { retrieve: (id: string) => (stripeState.paymentIntentsRetrieve ?? notStubbed("paymentIntents.retrieve"))(id) },
    }),
  };
});

import { POST } from "@/app/api/webhooks/stripe/route";

const SECRET = "whsec_test_local_secret";

function signPayload(payload: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", SECRET).update(`${timestampSeconds}.${payload}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

function webhookEvent(type: string, object: Record<string, unknown>, eventId = `evt_${randomUUID()}`): { payload: string; headers: Headers; eventId: string } {
  const payload = JSON.stringify({ id: eventId, object: "event", type, data: { object }, livemode: false });
  return { payload, headers: new Headers({ "content-type": "application/json", "stripe-signature": signPayload(payload) }), eventId };
}

function postWebhook(event: { payload: string; headers: Headers }): Promise<Response> {
  return POST(new Request("https://prisma.test/api/webhooks/stripe", { method: "POST", headers: event.headers, body: event.payload }));
}

function resetDbState(): void {
  dbState.events.clear();
  dbState.lastEventId = null;
  dbState.eventInserts = [];
  dbState.eventUpdates = [];
  dbState.planRows = [];
  dbState.planInserts = [];
  dbState.subscriptionInserts = [];
  dbState.subscriptionUpdates = [];
  dbState.profileUpdates = [];
  dbState.walletInserts = [];
  dbState.ledgerInserts = [];
  dbState.ledgerReferences.clear();
  dbState.profilesRows = [];
  dbState.subscriptionsRows = [];
  stripeState.subscriptionsRetrieve = null;
  stripeState.sessionsRetrieve = null;
  stripeState.chargesRetrieve = null;
  stripeState.paymentIntentsRetrieve = null;
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  resetDbState();
  consoleSpy.error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.error?.mockRestore();
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/stripe", () => {
  it("assinatura inválida → 400 invalid_signature e NADA gravado", async () => {
    const payload = JSON.stringify({ id: "evt_bad", type: "checkout.session.completed", data: { object: {} } });
    const response = await POST(
      new Request("https://prisma.test/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": "t=123,v1=deadbeef" },
        body: payload,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(dbState.eventInserts).toEqual([]);
  });

  it("checkout.session.completed de plano → grava subscription active + customer no profile + plano do catálogo", async () => {
    const event = webhookEvent("checkout.session.completed", {
      id: "cs_plan_001", mode: "subscription", payment_status: "paid",
      client_reference_id: "owner-1", subscription: "sub_001", customer: "cus_001",
    });
    stripeState.subscriptionsRetrieve = async () => ({
      id: "sub_001", status: "active",
      items: { data: [{ price: { lookup_key: "plano_pro_mensal" }, current_period_start: 1_750_000_000, current_period_end: 1_850_000_000 }] },
    });

    const response = await postWebhook(event);
    const body = (await response.json()) as { received: boolean };

    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
    expect(dbState.events.get(event.eventId)?.status).toBe("processed");

    const insert = dbState.subscriptionInserts[0]!;
    expect(insert.values).toMatchObject({
      userId: "owner-1", planId: "plan-pro", provider: "stripe", billingMethod: "card",
      providerSubscriptionId: "sub_001", status: "active",
      currentPeriodStart: new Date(1_750_000_000_000), currentPeriodEnd: new Date(1_850_000_000_000),
    });
    expect(dbState.profileUpdates[0]).toMatchObject({ stripeCustomerId: "cus_001" });
    expect(dbState.planInserts[0]).toMatchObject({ slug: "pro", amountCents: 14_790 });
  });

  it("evento repetido (mesmo event id) → 200 no-op sem reprocessar", async () => {
    const event = webhookEvent("checkout.session.completed", {
      id: "cs_plan_002", mode: "subscription", payment_status: "paid",
      client_reference_id: "owner-1", subscription: "sub_002", customer: "cus_002",
    });
    let calls = 0;
    stripeState.subscriptionsRetrieve = async () => {
      calls += 1;
      return { id: "sub_002", status: "active", items: { data: [{ price: { lookup_key: "plano_pro_mensal" } }] } };
    };

    const first = await postWebhook(event);
    const second = await postWebhook(event);
    const body = (await second.json()) as { received: boolean; duplicate: boolean };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(body).toEqual({ received: true, duplicate: true });
    expect(calls).toBe(1);
    expect(dbState.subscriptionInserts).toHaveLength(1);
  });

  it("checkout.session.completed de créditos → credita wallet (600) + ledger stripe_checkout com ref da session", async () => {
    const event = webhookEvent("checkout.session.completed", {
      id: "cs_credits_001", mode: "payment", payment_status: "paid",
      client_reference_id: "owner-1", customer: "cus_009",
    });
    stripeState.sessionsRetrieve = async () => ({ id: "cs_credits_001", line_items: { data: [{ price: { lookup_key: "creditos_ia_pro" } }] } });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.walletInserts[0]!.values).toMatchObject({ userId: "owner-1", balance: 600, lifetimePurchased: 600 });
    expect(dbState.ledgerInserts[0]).toMatchObject({ userId: "owner-1", amount: 600, reason: "stripe_checkout", reference: "cs_credits_001" });
  });

  it("a MESMA session creditada por evento diferente (async_payment_succeeded) NÃO credita 2x (ledger unique)", async () => {
    const session = { id: "cs_credits_002", mode: "payment", payment_status: "paid", client_reference_id: "owner-1", customer: "cus_009" };
    stripeState.sessionsRetrieve = async () => ({ id: "cs_credits_002", line_items: { data: [{ price: { lookup_key: "creditos_ia_start" } }] } });

    await postWebhook(webhookEvent("checkout.session.completed", session, "evt_first"));
    const second = await postWebhook(webhookEvent("checkout.session.async_payment_succeeded", session, "evt_second"));

    expect(second.status).toBe(200);
    expect(dbState.walletInserts).toHaveLength(1);
    expect(dbState.ledgerInserts).toHaveLength(1);
  });

  it("payment_status unpaid → NÃO fulfil (aguarda async events) e evento fica ignored", async () => {
    const event = webhookEvent("checkout.session.completed", {
      id: "cs_unpaid_001", mode: "subscription", payment_status: "unpaid",
      client_reference_id: "owner-1", subscription: "sub_003", customer: "cus_003",
    });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.events.get(event.eventId)?.status).toBe("ignored");
    expect(dbState.subscriptionInserts).toEqual([]);
    expect(dbState.walletInserts).toEqual([]);
    expect(dbState.profileUpdates).toEqual([]);
  });

  it("invoice.payment_failed → status past_due (não cancela — dunning é do Stripe)", async () => {
    const event = webhookEvent("invoice.payment_failed", {
      id: "in_failed_001",
      parent: { type: "subscription", subscription_details: { subscription: "sub_001", metadata: null } },
    });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.subscriptionUpdates[0]).toMatchObject({ status: "past_due" });
    expect(dbState.events.get(event.eventId)?.status).toBe("processed");
  });

  it("customer.subscription.deleted → status cancelled com cancelledAt", async () => {
    const event = webhookEvent("customer.subscription.deleted", {
      id: "sub_001", status: "canceled",
      items: { data: [{ current_period_end: 1_850_000_000, price: { lookup_key: "plano_pro_mensal" } }] },
    });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.subscriptionUpdates[0]).toMatchObject({ status: "cancelled" });
    expect(dbState.subscriptionUpdates[0]!["cancelledAt"]).toBeInstanceOf(Date);
  });

  it("charge.dispute.created → log estruturado + evento processed, sem suspender a assinatura (fase 1)", async () => {
    dbState.profilesRows = [{ id: "owner-1" }];
    dbState.subscriptionsRows = [{ id: "sub_001" }];
    stripeState.chargesRetrieve = async () => ({ id: "ch_001", customer: "cus_001", payment_intent: null });
    const event = webhookEvent("charge.dispute.created", { id: "dp_001", charge: "ch_001", reason: "fraudulent", amount: 14_790 });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.events.get(event.eventId)?.status).toBe("processed");
    expect(consoleSpy.error).toHaveBeenCalledWith("stripe_risk_event", expect.stringContaining("ch_001"));
    expect(dbState.subscriptionUpdates).toEqual([]);
  });

  it("evento desconhecido → 200 ignored", async () => {
    const event = webhookEvent("product.created", { id: "prod_x" });

    const response = await postWebhook(event);

    expect(response.status).toBe(200);
    expect(dbState.events.get(event.eventId)?.status).toBe("ignored");
  });

  it("falha de processamento → evento failed + 500 (Stripe reentrega) e a reentrega REPROCESSA", async () => {
    const event = webhookEvent("checkout.session.completed", {
      id: "cs_retry_001", mode: "subscription", payment_status: "paid",
      client_reference_id: "owner-1", subscription: "sub_retry", customer: "cus_r",
    });
    const failing = async () => {
      throw new Error("stripe api down");
    };
    stripeState.subscriptionsRetrieve = failing as unknown as (id: string) => Promise<unknown>;

    const first = await postWebhook(event);
    expect(first.status).toBe(500);
    expect(dbState.events.get(event.eventId)?.status).toBe("failed");

    // Stripe reentrega o MESMO evento: a linha failed permite reprocessar.
    stripeState.subscriptionsRetrieve = async () => ({
      id: "sub_retry", status: "active",
      items: { data: [{ price: { lookup_key: "plano_pro_mensal" }, current_period_start: 1_750_000_000, current_period_end: 1_850_000_000 }] },
    });
    const second = await postWebhook(event);
    const body = (await second.json()) as { received: boolean; duplicate?: boolean };

    expect(second.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(dbState.events.get(event.eventId)?.status).toBe("processed");
    expect(dbState.subscriptionInserts).toHaveLength(1);
  });
});
