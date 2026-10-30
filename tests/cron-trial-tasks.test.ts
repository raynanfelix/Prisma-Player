import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trial 100% (spec Billing Completo, item 5): o cron agora marca trials
 * vencidos como `expired` (verdade do status para admin/telas) e cria o
 * aviso de fim próximo no inbox (idempotente por trial). O acesso em si já
 * caía no `accessFrom` (trialActive exige trialEndsAt futuro) - coberto no
 * fim deste arquivo para fechar o loop expiração→acesso.
 */

const { dbState, updateCalls, insertCalls } = vi.hoisted(() => ({
  dbState: {
    selectRows: {} as Record<string, unknown[]>,
    failOnUpdate: false,
  },
  updateCalls: [] as Array<{ table: string; values: Record<string, unknown> }>,
  insertCalls: [] as Array<Record<string, unknown>>,
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
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          if (dbState.failOnUpdate) return Promise.reject(new Error("db down"));
          updateCalls.push({ table: getTableName(table), values });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertCalls.push(values);
        return Promise.resolve();
      },
    }),
  };

  return { db, pool: {}, schema };
});

import { expireOutdatedTrials, notifyTrialsEndingSoon, cancelPastDueSubscriptions, type CronMaintenanceResult } from "@/lib/cron-tasks/tasks";
import { getAccountAccess } from "@/lib/access/service";

const { stripeState } = vi.hoisted(() => ({
  stripeState: {
    envKey: "sk_test_fake_cron_key",
    cancelCalls: [] as Array<{ id: string; params: Record<string, unknown> }>,
  },
}));

vi.mock("@/lib/billing/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: (id: string, params: Record<string, unknown>) => {
        stripeState.cancelCalls.push({ id, params });
        return Promise.resolve({ id, status: "canceled" });
      },
    },
  }),
}));

const DAY_MS = 86_400_000;

function makeCtx(now: Date) {
  const result: CronMaintenanceResult = {
    reports: 0,
    emails: 0,
    alerts: 0,
    webhooks: 0,
    skipped: 0,
    processed: 0,
    reconcileChecked: 0,
    reconcileDivergences: 0,
    trialReminders: 0,
    pastDueReminders: 0,
    pastDueCancellations: 0,
    timedOut: false,
    errors: [],
  };
  return {
    result,
    startedAt: now.getTime(),
    now,
    currentFrom: new Date(now.getTime() - DAY_MS),
    previousFrom: new Date(now.getTime() - 2 * DAY_MS),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.selectRows = {};
  dbState.failOnUpdate = false;
  updateCalls.length = 0;
  insertCalls.length = 0;
  process.env.STRIPE_SECRET_KEY = stripeState.envKey;
  stripeState.cancelCalls.length = 0;
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

describe("expireOutdatedTrials - cron marca trial vencido como expired", () => {
  it("update em account_access com trialStatus expired (idempotente pelo filtro)", async () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    await expireOutdatedTrials(makeCtx(now));

    expect(updateCalls).toEqual([{ table: "account_access", values: { trialStatus: "expired", updatedAt: now } }]);
  });

  it("falha do banco vira erro nomeado no resultado (não derruba o cron)", async () => {
    dbState.failOnUpdate = true;
    const ctx = makeCtx(new Date("2026-10-20T12:00:00.000Z"));

    await expireOutdatedTrials(ctx);

    expect(ctx.result.errors).toEqual(["trials_expiry: db down"]);
  });
});

describe("notifyTrialsEndingSoon - aviso de fim próximo no inbox", () => {
  it("trial terminando em 2 dias sem aviso prévio → insere mensagem única com dias restantes", async () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    dbState.selectRows = {
      account_access: [{ userId: "u-trial", trialEndsAt: new Date(now.getTime() + 2 * DAY_MS) }],
      user_inbox: [],
    };

    const ctx = makeCtx(now);
    await notifyTrialsEndingSoon(ctx);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      userId: "u-trial",
      kind: "trial",
      title: "Seu teste termina em breve",
      actionLabel: "Ver planos",
      actionUrl: "/dashboard/billing",
    });
    expect(String(insertCalls[0]!.message)).toContain("termina em 2 dias");
    expect(String(insertCalls[0]!.message)).toContain("nenhum cartão foi cobrado");
    expect(ctx.result.trialReminders).toBe(1);
  });

  it("aviso já existente (idempotente por trial) → não insere de novo", async () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    dbState.selectRows = {
      account_access: [{ userId: "u-trial", trialEndsAt: new Date(now.getTime() + DAY_MS) }],
      user_inbox: [{ id: "inbox-existing" }],
    };

    const ctx = makeCtx(now);
    await notifyTrialsEndingSoon(ctx);

    expect(insertCalls).toEqual([]);
    expect(ctx.result.trialReminders).toBe(0);
  });

  it("trial termina amanhã → mensagem no singular (1 dia)", async () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    dbState.selectRows = {
      account_access: [{ userId: "u-trial", trialEndsAt: new Date(now.getTime() + DAY_MS / 2) }],
      user_inbox: [],
    };

    const ctx = makeCtx(now);
    await notifyTrialsEndingSoon(ctx);

    expect(String(insertCalls[0]!.message)).toContain("termina em 1 dia");
  });
});

describe("cancelPastDueSubscriptions - grace de 7 dias com dunning (spec Pagamentos, itens 2 e 3)", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  function pastDueRow(overrides: Record<string, unknown> = {}) {
    return {
      userId: "u-owner",
      provider: "stripe",
      status: "past_due",
      providerSubscriptionId: "sub_past_due",
      updatedAt: new Date(now.getTime() - 3 * DAY_MS),
      ...overrides,
    };
  }

  it("past_due há 7d+1 (stripe) → cancela no provedor com prorate false e sem lembrete", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow({ updatedAt: new Date(now.getTime() - (7 * DAY_MS + 3_600_000)) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(stripeState.cancelCalls).toEqual([{ id: "sub_past_due", params: { prorate: false } }]);
    expect(ctx.result.pastDueCancellations).toBe(1);
    expect(insertCalls).toEqual([]);
    expect(ctx.result.errors).toEqual([]);
  });

  it("past_due há 6d → NÃO cancela (ainda dentro da tolerância)", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow({ updatedAt: new Date(now.getTime() - 6 * DAY_MS) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(stripeState.cancelCalls).toEqual([]);
    expect(ctx.result.pastDueCancellations).toBe(0);
  });

  it("sem STRIPE_SECRET_KEY → skip silencioso (nenhum cancel, nenhum erro)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    dbState.selectRows = { subscriptions: [pastDueRow({ updatedAt: new Date(now.getTime() - 30 * DAY_MS) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(stripeState.cancelCalls).toEqual([]);
    expect(insertCalls).toEqual([]);
    expect(ctx.result.errors).toEqual([]);
    expect(ctx.result.pastDueCancellations).toBe(0);
    expect(ctx.result.pastDueReminders).toBe(0);
  });

  it("assinatura AbacatePay legada → ignorada (nunca cancelada aqui)", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow({ provider: "abacatepay", updatedAt: new Date(now.getTime() - 30 * DAY_MS) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(stripeState.cancelCalls).toEqual([]);
    expect(insertCalls).toEqual([]);
    expect(ctx.result.pastDueCancellations).toBe(0);
    expect(ctx.result.pastDueReminders).toBe(0);
  });

  it("dia 3 do grace → cria lembrete de dunning (idempotente por actionUrl do dia)", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow()], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(stripeState.cancelCalls).toEqual([]);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      userId: "u-owner",
      kind: "billing",
      title: "Pagamento pendente há 3 dias",
      actionLabel: "Atualizar cartão",
    });
    expect(String(insertCalls[0]!.message)).toContain("3 dias");
    expect(String(insertCalls[0]!.actionUrl)).toContain("dunning=3");
    expect(ctx.result.pastDueReminders).toBe(1);
  });

  it("dia 2 do grace → nenhum lembrete", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow({ updatedAt: new Date(now.getTime() - 2 * DAY_MS) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(insertCalls).toEqual([]);
    expect(ctx.result.pastDueReminders).toBe(0);
  });

  it("dia 6 do grace → cria o último lembrete (título de urgência)", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow({ updatedAt: new Date(now.getTime() - 6 * DAY_MS) })], user_inbox: [] };

    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ kind: "billing", title: "Último lembrete: pagamento pendente" });
    expect(String(insertCalls[0]!.actionUrl)).toContain("dunning=6");
    expect(ctx.result.pastDueReminders).toBe(1);
  });

  it("lembrete repetido no mesmo dia → não duplica (idempotente por dia)", async () => {
    dbState.selectRows = { subscriptions: [pastDueRow()], user_inbox: [] };
    const ctx = makeCtx(now);
    await cancelPastDueSubscriptions(ctx);
    expect(insertCalls).toHaveLength(1);

    // Segunda passada no MESMO dia: o inbox já tem o lembrete (actionUrl igual).
    dbState.selectRows.user_inbox = [{ id: "inbox-existing" }];
    await cancelPastDueSubscriptions(ctx);

    expect(insertCalls).toHaveLength(1);
    expect(ctx.result.pastDueReminders).toBe(1);
  });
});

describe("getAccountAccess - expiração do trial derruba o acesso (lazy, entre crons)", () => {
  it("trialStatus active com trialEndsAt no passado → sem acesso (cron ainda não marcou)", async () => {
    dbState.selectRows = {
      account_access: [{ onboardingCompleted: true, trialStatus: "active", trialEndsAt: new Date("2026-10-01T00:00:00.000Z") }],
      subscriptions: [],
    };

    const access = await getAccountAccess("u-trial");

    expect(access.trialActive).toBe(false);
    expect(access.hasAccess).toBe(false);
    // O status cru permanece até o cron marcar - a verdade vigente é a data.
    expect(access.trialStatus).toBe("active");
  });

  it("trial vigente (termina no futuro) → acesso completo", async () => {
    // Data RELATIVA: data fixa vira bomba-relógio (o teste quebrava quando o
    // "futuro" hardcoded virava passado em 2026-10-30T00:00Z).
    dbState.selectRows = {
      account_access: [{ onboardingCompleted: true, trialStatus: "active", trialEndsAt: new Date(Date.now() + 7 * 86_400_000) }],
      subscriptions: [],
    };

    const access = await getAccountAccess("u-trial");

    expect(access.trialActive).toBe(true);
    expect(access.hasAccess).toBe(true);
  });
});
