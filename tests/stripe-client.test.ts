import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client Stripe (server-only): instância por key + cache de prices por
 * lookup_key com TTL de 10 min (miss NÃO cacheia - rodar o seed libera o
 * checkout na hora). O pacote `stripe` é mockado: nenhum teste toca a rede.
 */

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    keys: [] as string[],
    listCalls: [] as Array<Record<string, unknown>>,
    createCalls: [] as Array<Record<string, unknown>>,
    listResponses: [] as Array<string | null>,
    priceId: "price_hit" as string | null,
    createdPriceId: "price_auto_created" as string | null,
    createShouldRace: false,
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
        const queued = stripeState.listResponses.length ? stripeState.listResponses.shift()! : stripeState.priceId;
        return { data: queued ? [{ id: queued }] : [] };
      },
      create: async (params: Record<string, unknown>) => {
        stripeState.createCalls.push(params);
        if (stripeState.createShouldRace) {
          stripeState.createShouldRace = false;
          const error = new Error("Price with lookup_key already exists for this account") as Error & { statusCode?: number };
          throw error;
        }
        return { id: stripeState.createdPriceId };
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
  stripeState.createCalls = [];
  stripeState.listResponses = [];
  stripeState.priceId = "price_hit";
  stripeState.createdPriceId = "price_auto_created";
  stripeState.createShouldRace = false;
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

  it("lookup conhecido sem price → AUTO-CRIA a partir da definição local (dono não precisa seed)", async () => {
    stripeState.priceId = null;

    const created = await resolvePriceByLookupKey("plano_escala_anual");

    expect(created).toBe("price_auto_created");
    expect(stripeState.createCalls).toHaveLength(1);
    const createParams = stripeState.createCalls[0] as Record<string, unknown>;
    expect(createParams["lookup_key"]).toBe("plano_escala_anual");
    expect(createParams["unit_amount"]).toBe(275880);
    expect(createParams["currency"]).toBe("brl");
    expect((createParams["recurring"] as Record<string, unknown>)["interval"]).toBe("year");
    expect((createParams["product_data"] as Record<string, unknown>)["name"]).toBe("Prisma Escala");

    // Criação cacheia o resultado (próxima chamada não re-cria).
    await resolvePriceByLookupKey("plano_escala_anual");
    expect(stripeState.createCalls).toHaveLength(1);
  });

  it("race de criação (lookup_key duplicado) → re-lista e devolve o price do vencedor", async () => {
    // 1º list: vazio (ninguém criou ainda) → create falha com "already exists"
    // (outra lambda venceu) → 2º list: o price do vencedor aparece.
    stripeState.listResponses = [null, "price_from_winner"];
    stripeState.createShouldRace = true;

    const resolved = await resolvePriceByLookupKey("plano_pro_anual");

    expect(resolved).toBe("price_from_winner");
    expect(stripeState.listCalls).toHaveLength(2);
  });

  it("lookup DESCONHECIDO (sem definição local) → null SEM cachear o miss", async () => {
    stripeState.priceId = null;

    expect(await resolvePriceByLookupKey("lookup_que_nao_existe")).toBeNull();
    expect(stripeState.createCalls).toHaveLength(0);

    // Apareceu depois (ex.: criado no painel) → resolve na hora sem esperar TTL.
    stripeState.priceId = "price_now_there";
    expect(await resolvePriceByLookupKey("lookup_que_nao_existe")).toBe("price_now_there");
    expect(stripeState.listCalls).toHaveLength(2);
  });

  it("resetStripePriceCacheForTests limpa o cache", async () => {
    await resolvePriceByLookupKey("plano_pro_mensal");
    resetStripePriceCacheForTests();
    await resolvePriceByLookupKey("plano_pro_mensal");

    expect(stripeState.listCalls).toHaveLength(2);
  });
});
