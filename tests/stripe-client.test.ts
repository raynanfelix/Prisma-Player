import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client Stripe (server-only): instância por key + cache de prices por
 * lookup_key com TTL de 10 min (miss NÃO cacheia — rodar o seed libera o
 * checkout na hora). O pacote `stripe` é mockado: nenhum teste toca a rede.
 */

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    keys: [] as string[],
    listCalls: [] as Array<Record<string, unknown>>,
    priceId: "price_hit" as string | null,
  },
}));

vi.mock("stripe", () => {
  class FakeStripe {
    constructor(key: string) {
      stripeState.keys.push(key);
    }
    prices = {
      list: async (params: Record<string, unknown>) => {
        stripeState.listCalls.push(params);
        return { data: stripeState.priceId ? [{ id: stripeState.priceId }] : [] };
      },
    };
  }
  return { default: FakeStripe };
});

import { getStripe, resetStripePriceCacheForTests, resolvePriceByLookupKey } from "@/lib/billing/stripe/client";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  process.env.STRIPE_SECRET_KEY = "rk_test_cache_key";
  resetStripePriceCacheForTests();
  stripeState.keys = [];
  stripeState.listCalls = [];
  stripeState.priceId = "price_hit";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.STRIPE_SECRET_KEY;
});

describe("getStripe", () => {
  it("sem env → erro claro (não instancie nada)", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/);
    expect(stripeState.keys).toEqual([]);
  });

  it("instância por key: mesma key reutiliza, key nova cria outra (rotação)", () => {
    const first = getStripe();
    const same = getStripe();
    expect(same).toBe(first);

    process.env.STRIPE_SECRET_KEY = "rk_test_rotated_key";
    const rotated = getStripe();
    expect(rotated).not.toBe(first);
    expect(stripeState.keys).toEqual(["rk_test_cache_key", "rk_test_rotated_key"]);
  });
});

describe("resolvePriceByLookupKey", () => {
  it("miss consulta prices.list com lookup_keys e cacheia por 10 min", async () => {
    const first = await resolvePriceByLookupKey("plano_pro_mensal");
    const second = await resolvePriceByLookupKey("plano_pro_mensal");

    expect(first).toBe("price_hit");
    expect(second).toBe("price_hit");
    expect(stripeState.listCalls).toEqual([{ lookup_keys: ["plano_pro_mensal"], active: true, limit: 1 }]);
  });

  it("TTL de 10 min: expirado consulta de novo", async () => {
    await resolvePriceByLookupKey("plano_pro_mensal");
    vi.setSystemTime(new Date(Date.now() + 10 * 60_001));
    await resolvePriceByLookupKey("plano_pro_mensal");

    expect(stripeState.listCalls).toHaveLength(2);
  });

  it("lookup inexistente → null SEM cachear o miss (seed posterior libera na hora)", async () => {
    stripeState.priceId = null;

    expect(await resolvePriceByLookupKey("plano_escala_anual")).toBeNull();

    stripeState.priceId = "price_now_there";
    expect(await resolvePriceByLookupKey("plano_escala_anual")).toBe("price_now_there");
    expect(stripeState.listCalls).toHaveLength(2);
  });

  it("resetStripePriceCacheForTests limpa o cache", async () => {
    await resolvePriceByLookupKey("plano_pro_mensal");
    resetStripePriceCacheForTests();
    await resolvePriceByLookupKey("plano_pro_mensal");

    expect(stripeState.listCalls).toHaveLength(2);
  });
});
