import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado compartilhado com as factories de mock (hoisted: as factories rodam
// antes dos imports do módulo sob teste).
const { authState, dbState, stripeState, rateLimitCalls, alertCalls, securityEvents } = vi.hoisted(() => ({
  authState: {
    userId: "user-session" as string | null,
    email: "titular@prisma.test",
    passwordValid: true,
    signInEmailArgs: [] as Array<Record<string, unknown>>,
  },
  dbState: {
    selectRows: {} as Record<string, unknown[]>,
    wipedTables: [] as string[],
    executeCount: 0,
  },
  stripeState: {
    envMissing: false,
    cancelCalls: [] as Array<{ id: string; params: Record<string, unknown> | undefined }>,
    cancelError: null as unknown,
  },
  rateLimitCalls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
  alertCalls: [] as Array<{ title?: string; detail?: string; kind?: string }>,
  securityEvents: [] as Array<{ eventType: string; options: Record<string, unknown> }>,
}));

vi.mock("@/lib/security/alert-webhook", () => ({
  alertOperations: vi.fn(async (input: { title?: string; detail?: string; kind?: string }) => {
    alertCalls.push(input);
  }),
}));

vi.mock("@/lib/security/auth-events", () => ({
  recordSecurityEvent: vi.fn(async (eventType: string, options: Record<string, unknown>) => {
    securityEvents.push({ eventType, options });
  }),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
  getAuth: () => ({
    signIn: {
      email: vi.fn(async (input: Record<string, unknown>) => {
        authState.signInEmailArgs.push(input);
        return authState.passwordValid ? { error: null } : { error: { message: "credenciais inválidas" } };
      }),
    },
    getSession: vi.fn(async () => ({
      data: authState.userId ? { user: { id: authState.userId, email: authState.email } } : null,
    })),
    signOut: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async (request: Request, scope: string, options: Record<string, unknown>) => {
    void request;
    rateLimitCalls.push({ scope, options });
    return null;
  }),
}));

vi.mock("@/lib/storage/r2", () => ({
  deleteR2Object: vi.fn(async () => undefined),
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

  const deleteOf = () => (table: unknown) => ({
    where: () => {
      dbState.wipedTables.push(getTableName(table as Parameters<typeof getTableName>[0]));
      return Promise.resolve();
    },
  });

  const db = {
    select: () => selectChain(),
    delete: deleteOf(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ delete: deleteOf() }),
    execute: async () => {
      dbState.executeCount += 1;
      return {};
    },
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
        subscriptions: {
          cancel: async (id: string, params?: Record<string, unknown>) => {
            stripeState.cancelCalls.push({ id, params });
            if (stripeState.cancelError) throw stripeState.cancelError;
            return { id, status: "canceled" };
          },
        },
      };
    },
  };
});

import { POST as deleteAccount } from "@/app/api/account/delete/route";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

function deleteRequest(body: unknown): Promise<Response> {
  return deleteAccount(
    new Request("https://prisma.test/api/account/delete", {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = "user-session";
  authState.email = "titular@prisma.test";
  authState.passwordValid = true;
  authState.signInEmailArgs = [];
  dbState.selectRows = {};
  dbState.wipedTables = [];
  dbState.executeCount = 0;
  stripeState.envMissing = false;
  stripeState.cancelCalls = [];
  stripeState.cancelError = null;
  rateLimitCalls.length = 0;
  alertCalls.length = 0;
  securityEvents.length = 0;
  process.env.STRIPE_SECRET_KEY = "rk_test_fake_key";
});

afterEach(() => {
  if (ORIGINAL_KEY) process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  else delete process.env.STRIPE_SECRET_KEY;
});

describe("POST /api/account/delete - cancelamento de assinatura Stripe antes do wipe (LGPD art. 18, VI)", () => {
  it("com assinatura Stripe ativa: cancela no provedor ANTES do wipe e completa a exclusão", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_live_1", status: "active" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });
    const body = (await response.json()) as { deleted: boolean };

    expect(response.status).toBe(200);
    expect(body.deleted).toBe(true);
    // Cancelamento imediato (não cancel_at_period_end), sem prorrogação de fatura.
    expect(stripeState.cancelCalls).toEqual([{ id: "sub_live_1", params: { prorate: false } }]);
    // O wipe aconteceu: transação de deletes + usuário da auth.
    expect(dbState.wipedTables).toContain("subscriptions");
    expect(dbState.wipedTables).toContain("profiles");
    expect(dbState.executeCount).toBe(1);
    expect(securityEvents).toEqual([]);
    expect(alertCalls).toEqual([]);
  });

  it("assinatura em past_due também é cancelada (dunning continua cobrando)", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_pastdue", status: "past_due" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(200);
    expect(stripeState.cancelCalls).toEqual([{ id: "sub_pastdue", params: { prorate: false } }]);
  });

  it("assinatura cancelada/expirada localmente NÃO chama o Stripe e o wipe segue", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_dead", status: "cancelled" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(200);
    expect(stripeState.cancelCalls).toEqual([]);
    expect(dbState.wipedTables).toContain("profiles");
  });

  it("assinatura de outro provedor (abacatepay) NÃO dispara cancelamento na Stripe", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "abacatepay", providerSubscriptionId: "abc_live_1", status: "active" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(200);
    expect(stripeState.cancelCalls).toEqual([]);
  });

  it("falha no cancelamento: 503 stripe_cancel_failed, NENHUM dado apagado, ops alertada e evento registrado", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_live_2", status: "active" }],
      videos: [],
    };
    stripeState.cancelError = new Error("Stripe fora do ar");

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("stripe_cancel_failed");
    expect(body.message).toContain("Nenhum dado foi apagado");
    // Fail-closed: o wipe NÃO aconteceu.
    expect(dbState.wipedTables).toEqual([]);
    expect(dbState.executeCount).toBe(0);
    expect(alertCalls[0]).toMatchObject({ kind: "account_delete_stripe_cancel_failed" });
    expect(alertCalls[0]!.detail).toContain("sub_live_2");
    expect(securityEvents[0]).toMatchObject({ eventType: "account_delete_stripe_cancel_failed" });
  });

  it("sem STRIPE_SECRET_KEY: mesmo comportamento fail-closed (503, sem wipe)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    stripeState.envMissing = true;
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_live_3", status: "active" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("stripe_cancel_failed");
    expect(dbState.wipedTables).toEqual([]);
  });

  it("assinatura já inexistente na Stripe (resource_missing): o wipe segue", async () => {
    dbState.selectRows = {
      account_teams: [],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_ghost", status: "active" }],
      videos: [],
    };
    stripeState.cancelError = Object.assign(new Error("No such subscription: sub_ghost"), { code: "resource_missing" });

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(200);
    expect(dbState.wipedTables).toContain("profiles");
    expect(alertCalls).toEqual([]);
  });

  it("senha errada: 403 invalid_password, evento de segurança, sem Stripe e sem wipe", async () => {
    authState.passwordValid = false;

    const response = await deleteRequest({ password: "senha-errada", confirm: "EXCLUIR" });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("invalid_password");
    expect(stripeState.cancelCalls).toEqual([]);
    expect(dbState.wipedTables).toEqual([]);
    expect(securityEvents[0]).toMatchObject({ eventType: "account_delete_denied" });
  });

  it("equipe com outros membros ativos: 409 team_not_empty antes de qualquer Stripe/wipe", async () => {
    dbState.selectRows = {
      account_teams: [{ id: "team-1" }],
      account_team_members: [{ id: "member-1" }],
      subscriptions: [{ provider: "stripe", providerSubscriptionId: "sub_live_4", status: "active" }],
      videos: [],
    };

    const response = await deleteRequest({ password: "senha-correta", confirm: "EXCLUIR" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("team_not_empty");
    expect(stripeState.cancelCalls).toEqual([]);
    expect(dbState.wipedTables).toEqual([]);
  });

  it("sem confirmação EXCLUIR: 400 confirmation_required sem tocar no banco de dados", async () => {
    const response = await deleteRequest({ password: "senha-correta", confirm: "excluir" });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("confirmation_required");
    expect(stripeState.cancelCalls).toEqual([]);
    expect(dbState.wipedTables).toEqual([]);
  });
});
