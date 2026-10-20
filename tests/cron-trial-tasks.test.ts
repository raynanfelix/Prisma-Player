import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trial 100% (spec Billing Completo, item 5): o cron agora marca trials
 * vencidos como `expired` (verdade do status para admin/telas) e cria o
 * aviso de fim próximo no inbox (idempotente por trial). O acesso em si já
 * caía no `accessFrom` (trialActive exige trialEndsAt futuro) — coberto no
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

import { expireOutdatedTrials, notifyTrialsEndingSoon, type CronMaintenanceResult } from "@/lib/cron-tasks/tasks";
import { getAccountAccess } from "@/lib/access/service";

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
});

describe("expireOutdatedTrials — cron marca trial vencido como expired", () => {
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

describe("notifyTrialsEndingSoon — aviso de fim próximo no inbox", () => {
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

describe("getAccountAccess — expiração do trial derruba o acesso (lazy, entre crons)", () => {
  it("trialStatus active com trialEndsAt no passado → sem acesso (cron ainda não marcou)", async () => {
    dbState.selectRows = {
      account_access: [{ onboardingCompleted: true, trialStatus: "active", trialEndsAt: new Date("2026-10-01T00:00:00.000Z") }],
      subscriptions: [],
    };

    const access = await getAccountAccess("u-trial");

    expect(access.trialActive).toBe(false);
    expect(access.hasAccess).toBe(false);
    // O status cru permanece até o cron marcar — a verdade vigente é a data.
    expect(access.trialStatus).toBe("active");
  });

  it("trial vigente (termina no futuro) → acesso completo", async () => {
    dbState.selectRows = {
      account_access: [{ onboardingCompleted: true, trialStatus: "active", trialEndsAt: new Date("2026-10-30T00:00:00.000Z") }],
      subscriptions: [],
    };

    const access = await getAccountAccess("u-trial");

    expect(access.trialActive).toBe(true);
    expect(access.hasAccess).toBe(true);
  });
});
