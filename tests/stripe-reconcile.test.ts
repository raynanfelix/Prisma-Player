import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reconciliação Stripe↔banco (spec Impecável, item 2): fake stripe (list por
 * status com autoPagingToArray) + fake-db que AVALIA o where compilado (eq
 * por provider_subscription_id - padrão da suíte BOLA) e respeita o conflito
 * de provider_event_id (idempotência por dia). O job NUNCA corrige: os
 * testes travam exatamente isso - só evento + alerta, nenhum update.
 */

const { dbState, stripeState, alertCalls, consoleSpy } = vi.hoisted(() => ({
  dbState: {
    subscriptionsRows: [] as Array<Record<string, unknown>>,
    eventIds: new Set<string>(),
    eventInserts: [] as Array<Record<string, unknown>>,
  },
  stripeState: {
    disabled: false,
    active: [] as Array<Record<string, unknown>>,
    canceled: [] as Array<Record<string, unknown>>,
    listParams: [] as Array<Record<string, unknown>>,
    toArrayLimits: [] as number[],
  },
  alertCalls: [] as Array<{ title?: string; detail?: string; kind?: string }>,
  consoleSpy: { error: null as null | ReturnType<typeof vi.spyOn> },
}));

vi.mock("@/lib/security/alert-webhook", () => ({
  alertOperations: vi.fn(async (input: { title?: string; detail?: string; kind?: string }) => {
    alertCalls.push(input);
  }),
}));

vi.mock("@/lib/billing/stripe/client", () => ({
  getStripe: () => {
    if (stripeState.disabled) throw new Error("Stripe não configurado");
    return {
      subscriptions: {
        list: (params: { status: string }) => {
          stripeState.listParams.push(params);
          return {
            autoPagingToArray: ({ limit }: { limit: number }) => {
              stripeState.toArrayLimits.push(limit);
              const data = params.status === "active" ? stripeState.active : stripeState.canceled;
              return Promise.resolve(data.slice(0, limit));
            },
          };
        },
      },
    };
  },
}));

vi.mock("@/lib/db", async () => {
  const { getTableColumns, getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const schema = await vi.importActual("../drizzle/schema");

  // `"subscriptions"."provider_subscription_id"` (SQL compilado) → prop do row.
  const columnProp = new Map<string, string>();
  const subscriptionsTable = (schema as Record<string, unknown>).subscriptions;
  for (const [prop, column] of Object.entries(getTableColumns(subscriptionsTable as Parameters<typeof getTableColumns>[0]))) {
    columnProp.set(`"subscriptions"."${(column as { name: string }).name}"`, prop);
  }
  const dialect = new PgDialect();

  // Select com where AVALIADO: a linha devolvida é só a que a query real
  // acharia por provider_subscription_id.
  const selectChain = () => {
    let table: string | null = null;
    let where: unknown;
    const resolve = () => {
      const rows = table === "subscriptions" ? dbState.subscriptionsRows : [];
      if (table !== "subscriptions" || where === undefined) return rows;
      const { sql, params } = dialect.sqlToQuery(where as never);
      const eqClause = /^("[^"]+"\."[^"]+") = \$(\d+)$/.exec(sql.trim());
      if (!eqClause) throw new Error(`reconcile fake: where não suportado: "${sql}"`);
      const prop = columnProp.get(eqClause[1]!);
      if (!prop) throw new Error(`reconcile fake: coluna desconhecida em "${sql}"`);
      return rows.filter((row) => String(row[prop]) === String(params[Number(eqClause[2]) - 1]));
    };
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
    };
    for (const method of ["from", "where", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
        if (method === "where") where = args[0];
        return chain;
      };
    }
    return chain;
  };

  // Insert com o conflito REAL de provider_event_id: a idempotência por dia
  // do reconcile é o ON CONFLICT DO NOTHING - o fake devolve [] no conflito.
  const insertChain = (table: string) => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: () => {
          if (table === "payment_webhook_events") {
            const eventId = String(values.providerEventId);
            if (dbState.eventIds.has(eventId)) return Promise.resolve([]);
            dbState.eventIds.add(eventId);
            dbState.eventInserts.push(values);
            return Promise.resolve([{ id: dbState.eventIds.size }]);
          }
          return Promise.resolve([{ id: 1 }]);
        },
      }),
    }),
  });

  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => insertChain(getTableName(table as Parameters<typeof getTableName>[0])),
    },
    pool: {},
    schema,
  };
});

import { reconcileSubscriptions } from "@/lib/billing/stripe/reconcile";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const DAY = NOW.toISOString().slice(0, 10);
const PERIOD_END = new Date("2026-11-19T12:00:00.000Z");
const PERIOD_END_SECS = Math.floor(PERIOD_END.getTime() / 1000);

function stripeSub(id: string, status: string, periodEndSecs: number | null = PERIOD_END_SECS) {
  return { id, status, items: { data: periodEndSecs === null ? [] : [{ current_period_end: periodEndSecs }] } };
}

function localRow(providerSubscriptionId: string, status: string, periodEnd: Date | null) {
  return { id: `local-${providerSubscriptionId}`, userId: `owner-${providerSubscriptionId}`, providerSubscriptionId, status, currentPeriodEnd: periodEnd };
}

function resetState(): void {
  dbState.subscriptionsRows.length = 0;
  dbState.eventIds.clear();
  dbState.eventInserts.length = 0;
  stripeState.disabled = false;
  stripeState.active.length = 0;
  stripeState.canceled.length = 0;
  stripeState.listParams.length = 0;
  stripeState.toArrayLimits.length = 0;
  alertCalls.length = 0;
}

beforeEach(() => {
  resetState();
  consoleSpy.error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.error?.mockRestore();
});

describe("reconcileSubscriptions", () => {
  it("divergência stripe active × local cancelled → evento reconcile (received + diff no processing_error) e alerta", async () => {
    stripeState.active = [stripeSub("sub_div", "active")];
    dbState.subscriptionsRows = [localRow("sub_div", "cancelled", PERIOD_END)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.kind).toBe("completed");
    expect(result.checked).toBe(1);
    expect(result.divergences).toBe(1);
    expect(result.errors).toEqual([]);
    expect(dbState.eventInserts[0]).toMatchObject({
      provider: "stripe",
      providerEventId: `reconcile:${DAY}:sub_div`,
      eventName: "reconcile.divergence",
      providerObjectId: "sub_div",
      status: "received",
    });
    expect(String(dbState.eventInserts[0]!.processingError)).toContain("stripe=active");
    expect(String(dbState.eventInserts[0]!.processingError)).toContain("local=cancelled");
    expect(alertCalls[0]).toMatchObject({ kind: "reconcile", title: "Assinatura divergente" });
    expect(alertCalls[0]!.detail).toContain("sub_div");
    expect(alertCalls[0]!.detail).toContain("stripe=active local=cancelled");
  });

  it("estados iguais (active×active, mesmo período) → NENHUM evento, NENHUM alerta", async () => {
    stripeState.active = [stripeSub("sub_ok", "active")];
    dbState.subscriptionsRows = [localRow("sub_ok", "active", PERIOD_END)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.kind).toBe("completed");
    expect(result.divergences).toBe(0);
    expect(dbState.eventInserts).toEqual([]);
    expect(alertCalls).toEqual([]);
  });

  it("idempotente por event_id: reexecução no MESMO dia não duplica evento nem alerta", async () => {
    stripeState.active = [stripeSub("sub_div", "active")];
    dbState.subscriptionsRows = [localRow("sub_div", "cancelled", PERIOD_END)];

    const first = await reconcileSubscriptions(NOW);
    const second = await reconcileSubscriptions(NOW);

    expect(first.divergences).toBe(1);
    expect(second.divergences).toBe(0); // conflitou no provider_event_id do dia
    expect(dbState.eventInserts).toHaveLength(1);
    expect(alertCalls).toHaveLength(1);
  });

  it("period_end dessincronizado >2 dias (active×active) → alerta com o drift", async () => {
    const driftedSecs = Math.floor((PERIOD_END.getTime() + 5 * 86_400_000) / 1000);
    stripeState.active = [stripeSub("sub_drift", "active", driftedSecs)];
    dbState.subscriptionsRows = [localRow("sub_drift", "active", PERIOD_END)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.divergences).toBe(1);
    expect(String(dbState.eventInserts[0]!.processingError)).toContain("drift 5 dias");
    expect(alertCalls[0]!.detail).toContain("sub_drift");
    expect(alertCalls[0]!.detail).toContain("drift 5 dias");
  });

  it("period_end dentro da tolerância (≤2 dias) → sem alerta", async () => {
    const syncedSecs = Math.floor((PERIOD_END.getTime() + 1 * 86_400_000) / 1000);
    stripeState.active = [stripeSub("sub_sync", "active", syncedSecs)];
    dbState.subscriptionsRows = [localRow("sub_sync", "active", PERIOD_END)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.divergences).toBe(0);
    expect(alertCalls).toEqual([]);
    expect(dbState.eventInserts).toEqual([]);
  });

  it("local active SEM período + stripe active COM período → divergência (lado sem período)", async () => {
    stripeState.active = [stripeSub("sub_noperiod", "active")];
    dbState.subscriptionsRows = [localRow("sub_noperiod", "active", null)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.divergences).toBe(1);
    expect(String(dbState.eventInserts[0]!.processingError)).toContain("lado sem período");
  });

  it("stripe canceled × local active → alerta (acesso sem cobrança - caso inverso)", async () => {
    stripeState.canceled = [stripeSub("sub_inv", "canceled")];
    dbState.subscriptionsRows = [localRow("sub_inv", "active", new Date("2026-12-01T12:00:00.000Z"))];

    const result = await reconcileSubscriptions(NOW);

    expect(result.divergences).toBe(1);
    expect(dbState.eventInserts[0]!.providerEventId).toBe(`reconcile:${DAY}:sub_inv`);
    expect(alertCalls[0]!.detail).toContain("stripe=canceled local=active");
  });

  it("stripe canceled × local cancelled → convergiu, sem alerta", async () => {
    stripeState.canceled = [stripeSub("sub_conv", "canceled")];
    dbState.subscriptionsRows = [localRow("sub_conv", "cancelled", PERIOD_END)];

    const result = await reconcileSubscriptions(NOW);

    expect(result.divergences).toBe(0);
    expect(alertCalls).toEqual([]);
  });

  it("subscription sem linha local → só log estruturado, sem evento e sem alerta", async () => {
    stripeState.active = [stripeSub("sub_orphan", "active")];

    const result = await reconcileSubscriptions(NOW);

    expect(result.checked).toBe(1);
    expect(result.divergences).toBe(0);
    expect(dbState.eventInserts).toEqual([]);
    expect(alertCalls).toEqual([]);
    expect(consoleSpy.error).toHaveBeenCalledWith("reconcile_subscription_sem_linha_local", expect.stringContaining("sub_orphan"));
  });

  it("teto de 200 assinaturas por listagem (auto-paginação com cap)", async () => {
    stripeState.active = Array.from({ length: 250 }, (_, index) => stripeSub(`sub_cap_${index}`, "active"));
    stripeState.canceled = [stripeSub("sub_cap_canceled", "canceled")];

    const result = await reconcileSubscriptions(NOW);

    expect(result.checked).toBe(201); // 200 (cap da listagem ativa) + 1 (cancelada)
    expect(stripeState.toArrayLimits).toEqual([200, 200]);
    expect(stripeState.listParams.map((params) => params.status)).toEqual(["active", "canceled"]);
  });

  it("sem STRIPE_SECRET_KEY → skipped_no_stripe sem nenhuma listagem", async () => {
    stripeState.disabled = true;

    const result = await reconcileSubscriptions(NOW);

    expect(result.kind).toBe("skipped_no_stripe");
    expect(stripeState.listParams).toEqual([]);
    expect(alertCalls).toEqual([]);
    expect(dbState.eventInserts).toEqual([]);
  });
});
