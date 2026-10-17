/** Snapshot gravado no job, parseado no teste: campos aninhados que os
 *  asserts navegam precisam de tipo estrutural (lint proíbe any). */
type SnapshotJson = {
  [key: string]: unknown;
  funnel: Array<Record<string, unknown>>;
  dimensions: Record<string, Array<Record<string, unknown>>>;
};
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { gateState, dbState, creditState, nvidiaState, afterState } = vi.hoisted(() => ({
  gateState: {
    ok: true as boolean,
    denyResponse: null as Response | null,
    plan: { quotas: { aiAnalyses: 30 } },
  },
  dbState: {
    /** Linhas devolvidas por `select`, por nome de tabela. Default: []. */
    selectRows: {} as Record<string, unknown[]>,
    /** Tabelas cujo select rejeita (simula erro do driver). */
    failingTables: {} as Record<string, boolean>,
    /** Tabelas efetivamente consultadas por select (trava: nada de video_events). */
    selectedTables: [] as string[],
    /** Resultados de `db.execute` em ordem: resumo, dimensÃµes. */
    executeResults: [] as Array<{ rows: unknown[] }>,
    /** Queries recebidas por `db.execute` (objetos SQL do drizzle). */
    executeQueries: [] as unknown[],
    /** Quando true, `db.execute` rejeita (banco fora do ar). */
    executeFails: false as boolean,
    /** Valores recebidos por update().set(). */
    updates: [] as unknown[],
    /** Valores recebidos por insert().values(). */
    insertValues: [] as unknown[],
    /** Filas de rows devolvidas por insert().returning() (uma por chamada). */
    insertReturns: [] as unknown[][],
    /** Quando definido, insert().returning() rejeita com esse erro. */
    insertError: null as null | Error | { code?: string; cause?: { code?: string } },
  },
  creditState: {
    consumeResult: { ok: true as const, remaining: 4 } as { ok: true; remaining: number } | { ok: false; reason: "insufficient_credits" | "credit_already_consumed" },
    refundResult: { ok: true as const, balance: 5 } as { ok: true; balance: number } | { ok: false; reason: "usage_not_found" },
  },
  nvidiaState: {
    /** Snapshots recebidos por analyzeWithNvidia. */
    inputs: [] as unknown[],
    error: null as Error | null,
    result: { model: "test-model", result: { headline: "Analise", executiveSummary: "Resumo", opportunities: [], experiments: [], warnings: [] } },
  },
  afterState: {
    /** Tarefas passadas ao after() do Next â€” executadas manualmente no teste. */
    tasks: [] as Array<() => unknown>,
  },
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) return { ok: false, response: gateState.denyResponse! };
    return { ok: true, userId: "user-owner", account: { accountOwnerId: "user-owner" }, plan: gateState.plan };
  }),
}));

// O `after` real exige request scope do Next (fora dele, lanÃ§a). Nos testes a
// tarefa Ã© capturada e executada na mÃ£o para travar o contrato pÃ³s-resposta.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterState.tasks.push(task);
    },
  };
});

vi.mock("@/lib/billing/ai-credits", () => ({
  consumeAiCredit: vi.fn(async () => creditState.consumeResult),
  refundAiCredit: vi.fn(async () => creditState.refundResult),
}));

vi.mock("@/lib/ai/nvidia", () => ({
  analyzeWithNvidia: vi.fn(async (input: unknown) => {
    nvidiaState.inputs.push(input);
    if (nvidiaState.error) throw nvidiaState.error;
    return nvidiaState.result;
  }),
}));

vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const schema = await vi.importActual("../drizzle/schema");

  const selectChain = () => {
    let table: string | null = null;
    const resolve = () => {
      if (table && dbState.failingTables[table]) throw new Error("store unavailable");
      return (table && dbState.selectRows[table]) || [];
    };
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
    };
    for (const method of ["from", "where", "orderBy", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) {
          table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
          dbState.selectedTables.push(table);
        }
        return chain;
      };
    }
    return chain;
  };

  const db = {
    select: () => selectChain(),
    update: () => ({
      set: (values: unknown) => {
        dbState.updates.push(values);
        return { where: () => Promise.resolve() };
      },
    }),
    insert: () => ({
      values: (values: unknown) => {
        dbState.insertValues.push(values);
        return {
          returning: () =>
            dbState.insertError
              ? Promise.reject(dbState.insertError)
              : Promise.resolve(dbState.insertReturns.shift() ?? []),
        };
      },
    }),
    execute: (query: unknown) => {
      dbState.executeQueries.push(query);
      if (dbState.executeFails) return Promise.reject(new Error("store unavailable"));
      return Promise.resolve(dbState.executeResults.shift() ?? { rows: [] });
    },
  };

  return { db, pool: {}, schema };
});

import { consumeAiCredit, refundAiCredit } from "@/lib/billing/ai-credits";
import { POST as analyze } from "@/app/api/ai/analyze/route";

const OWNER = "user-owner";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");
const DAY_MS = 86_400_000;

function analyzeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("https://prisma.test/api/ai/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId: VIDEO_ID, ...body }),
  });
}

function videoRow(): Record<string, unknown> {
  return { id: VIDEO_ID, title: "VSL Principal", durationSeconds: "3600.5" };
}

/** Resumo agregado â€” a query Ãºnica de resumo devolve sempre uma linha. */
function summaryFixture(): { rows: unknown[] } {
  return {
    rows: [
      { impressions: 20, plays: 10, completed: 4, cta_clicks: 2, conversions: 1, reached10: 9, reached25: 8, reached50: 6, reached75: 5, reached90: 4 },
    ],
  };
}

/** Grupos por dimensÃ£o â€” forma que a query de GROUPING SETS devolve. */
function dimensionsFixture(): { rows: unknown[] } {
  return {
    rows: [
      { dimension: "traffic_source", name: "facebook", impressions: 12, plays: 6, completes: 2, first_created: "2025-12-17T00:00:00.000Z" },
      { dimension: "traffic_source", name: "google", impressions: 12, plays: 3, completes: 0, first_created: "2025-12-18T00:00:00.000Z" },
      { dimension: "device_type", name: "mobile", impressions: 20, plays: 10, completes: 2, first_created: "2025-12-16T13:00:00.000Z" },
      { dimension: "country_code", name: "BR", impressions: 20, plays: 10, completes: 2, first_created: "2025-12-16T13:00:00.000Z" },
      { dimension: "campaign_id", name: "bf2026", impressions: 5, plays: 2, completes: 1, first_created: "2025-12-20T00:00:00.000Z" },
      { dimension: "creative_id", name: "criativo-a", impressions: 2, plays: 1, completes: 0, first_created: "2025-12-21T00:00:00.000Z" },
    ],
  };
}

function defaultFixtures(): Array<{ rows: unknown[] }> {
  return [summaryFixture(), dimensionsFixture()];
}

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
  gateState.ok = true;
  gateState.denyResponse = null;
  gateState.plan = { quotas: { aiAnalyses: 30 } };
  dbState.selectRows = { videos: [videoRow()], ai_credit_wallets: [{ balance: 5 }], ai_analysis_jobs: [] };
  dbState.failingTables = {};
  dbState.selectedTables = [];
  dbState.executeResults = defaultFixtures();
  dbState.executeQueries = [];
  dbState.executeFails = false;
  dbState.updates = [];
  dbState.insertValues = [];
  dbState.insertReturns = [[{ id: "job-1" }]];
  dbState.insertError = null;
  creditState.consumeResult = { ok: true, remaining: 4 };
  creditState.refundResult = { ok: true, balance: 5 };
  nvidiaState.inputs = [];
  nvidiaState.error = null;
  afterState.tasks = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* POST /api/ai/analyze â€” contrato do snapshot pÃ³s-agregaÃ§Ã£o            */
/* ------------------------------------------------------------------ */

describe("POST /api/ai/analyze â€” contrato do snapshot", () => {
  it("monta o snapshot exato a partir dos rows agregados e devolve id/result/balance", async () => {
    const response = await analyze(analyzeRequest({ type: "retention", question: "Onde perco audiencia?" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "job-1", result: nvidiaState.result.result, balance: 4 });

    expect(dbState.insertValues).toHaveLength(1);
    const inserted = dbState.insertValues[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({ userId: OWNER, videoId: VIDEO_ID, analysisType: "retention", status: "processing" });

    const snapshot = inserted.inputSnapshot as SnapshotJson;
    expect(Object.keys(snapshot)).toEqual(["video", "periodDays", "question", "truncated", "summary", "retention", "funnel", "dimensions"]);
    expect(snapshot.video).toEqual({ id: VIDEO_ID, title: "VSL Principal", durationSeconds: 3600.5 });
    expect(snapshot.periodDays).toBe(30);
    expect(snapshot.question).toBe("Onde perco audiencia?");
    // O cap de 50 mil eventos morreu: o snapshot nunca Ã© mais truncado.
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.summary).toEqual({
      impressions: 20, uniqueViews: 20, plays: 10, playRate: 50, reached25: 8, reached50: 6,
      reached75: 5, reached90: 4, completed: 4, completionRate: 40, ctaClicks: 2, conversions: 1,
    });
    expect(snapshot.retention).toEqual([
      { point: 0, rate: 100, viewers: 10 },
      { point: 10, rate: 90, viewers: 9 },
      { point: 25, rate: 80, viewers: 8 },
      { point: 50, rate: 60, viewers: 6 },
      { point: 75, rate: 50, viewers: 5 },
      { point: 90, rate: 40, viewers: 4 },
      { point: 100, rate: 40, viewers: 4 },
    ]);
    expect(snapshot.funnel).toEqual([
      { name: "Impressao", value: 20 },
      { name: "Play", value: 10 },
      { name: "Pitch", value: 5 },
      { name: "Conclusao", value: 4 },
    ]);
    expect(Object.keys(snapshot.dimensions)).toEqual(["traffic", "devices", "countries", "campaigns", "creatives"]);
    expect(snapshot.dimensions.traffic).toEqual([
      { name: "facebook", impressions: 12, plays: 6, playRate: 50, completes: 2, completionRate: 33.3 },
      { name: "google", impressions: 12, plays: 3, playRate: 25, completes: 0, completionRate: 0 },
    ]);
    expect(snapshot.dimensions.devices).toEqual([{ name: "mobile", impressions: 20, plays: 10, playRate: 50, completes: 2, completionRate: 20 }]);

    // A IA recebe exatamente o mesmo snapshot gravado no job.
    expect(nvidiaState.inputs).toHaveLength(1);
    expect(nvidiaState.inputs[0]).toEqual(snapshot);

    // Nenhuma linha de evento cruza a rede: o select nunca toca video_events.
    expect(dbState.selectedTables).not.toContain("video_events");
  });

  it("tarefa do after() marca o job como completed com o resultado da IA", async () => {
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(200);
    expect(afterState.tasks).toHaveLength(1);
    await afterState.tasks[0]!();
    const completed = dbState.updates.find((values) => (values as Record<string, unknown>).status === "completed") as Record<string, unknown>;
    expect(completed).toMatchObject({ status: "completed", result: nvidiaState.result.result, model: "test-model", creditsUsed: 1 });
  });

  it("expira jobs travados antes de tudo (comportamento preservado)", async () => {
    await analyze(analyzeRequest());
    expect(dbState.updates[0]).toMatchObject({ status: "failed", errorCode: "analysis_timeout" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/ai/analyze â€” agregaÃ§Ã£o no banco                            */
/* ------------------------------------------------------------------ */

describe("POST /api/ai/analyze â€” agregaÃ§Ã£o no banco", () => {
  it("executa duas queries agregadas (resumo + dimensÃµes) com SQL parametrizado e sem cap", async () => {
    await analyze(analyzeRequest({ days: 7 }));
    expect(dbState.executeQueries).toHaveLength(2);

    const dialect = new PgDialect();
    const toQuery = (query: unknown) => dialect.sqlToQuery(query as SQL);
    const [summaryQuery, dimensionsQuery] = dbState.executeQueries.map(toQuery);

    // AgregaÃ§Ã£o condicional no Postgres â€” nenhum evento cruza a rede.
    expect(summaryQuery.sql).toContain("count(distinct session_id) filter (where event_type = 'impression')");
    expect(summaryQuery.sql).toContain("count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 75))");
    expect(summaryQuery.sql).toContain("from video_events");
    expect(summaryQuery.sql).toContain("user_id =");
    expect(dimensionsQuery.sql).toContain("group by grouping sets");
    expect(dimensionsQuery.sql).toContain("'traffic_source'");
    expect(dimensionsQuery.sql).toContain("'creative_id'");

    // O cap de 50 mil morreu: nenhuma clÃ¡usula limit sobrou.
    expect(summaryQuery.sql).not.toContain("limit");
    expect(dimensionsQuery.sql).not.toContain("limit");

    // videoId/owner/janela sempre como parÃ¢metros ($n), nunca no texto.
    const since = new Date(FIXED_NOW.getTime() - 7 * DAY_MS);
    expect(summaryQuery.sql).not.toContain(VIDEO_ID);
    expect(summaryQuery.sql).not.toContain(OWNER);
    expect(summaryQuery.params).toEqual([VIDEO_ID, OWNER, since]);
    expect(dimensionsQuery.params).toEqual([VIDEO_ID, OWNER, since]);
  });

  it("falha na agregaÃ§Ã£o propaga (500 pelo Next) â€” tolerÃ¢ncia original, sem catch novo", async () => {
    dbState.executeFails = true;
    await expect(analyze(analyzeRequest())).rejects.toThrow("store unavailable");
  });

  it("janela sem eventos: snapshot zerado (0, nunca NaN) e dimensÃµes vazias", async () => {
    dbState.executeResults = [{ rows: [] }, { rows: [] }];
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(200);
    const snapshot = (dbState.insertValues[0] as Record<string, unknown>).inputSnapshot as SnapshotJson;
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.summary).toEqual({ impressions: 0, uniqueViews: 0, plays: 0, playRate: 0, reached25: 0, reached50: 0, reached75: 0, reached90: 0, completed: 0, completionRate: 0, ctaClicks: 0, conversions: 0 });
    expect(snapshot.retention).toEqual([
      { point: 0, rate: 0, viewers: 0 }, { point: 10, rate: 0, viewers: 0 }, { point: 25, rate: 0, viewers: 0 },
      { point: 50, rate: 0, viewers: 0 }, { point: 75, rate: 0, viewers: 0 }, { point: 90, rate: 0, viewers: 0 },
      { point: 100, rate: 0, viewers: 0 },
    ]);
    expect(snapshot.dimensions).toEqual({ traffic: [], devices: [], countries: [], campaigns: [], creatives: [] });
    expect(JSON.stringify(snapshot)).not.toContain("NaN");
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/ai/analyze â€” gates                                        */
/* ------------------------------------------------------------------ */

describe("POST /api/ai/analyze â€” gates", () => {
  it("guard negando devolve exatamente o gate.response, antes de qualquer IO", async () => {
    gateState.ok = false;
    gateState.denyResponse = new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
    const response = await analyze(analyzeRequest());
    expect(response).toBe(gateState.denyResponse);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("videoId nÃ£o-uuid ou type invÃ¡lido â†’ 400 sem tocar o banco", async () => {
    const response = await analyze(analyzeRequest({ videoId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    const invalidType = await analyze(analyzeRequest({ type: "nope" }));
    expect(invalidType.status).toBe(400);
    expect(dbState.updates).toHaveLength(0);
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("job ativo nas Ãºltimas 24h â†’ 409 antes de agregar", async () => {
    dbState.selectRows["ai_analysis_jobs"] = [{ id: "job-x", status: "processing", createdAt: new Date(FIXED_NOW.getTime() - 3 * 60_000) }];
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "analysis_in_progress" });
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("3 jobs nos Ãºltimos 10 min â†’ 429 ai_rate_limit_10m com Retry-After 600", async () => {
    dbState.selectRows["ai_analysis_jobs"] = [1, 2, 3].map((n) => ({ id: `job-${n}`, status: "completed", createdAt: new Date(FIXED_NOW.getTime() - n * 60_000) }));
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "ai_rate_limit_10m", retryAfterSeconds: 600 });
    expect(response.headers.get("retry-after")).toBe("600");
  });

  it("teto diÃ¡rio do plano â†’ 429 ai_rate_limit_daily com o limite no corpo", async () => {
    gateState.plan = { quotas: { aiAnalyses: 2 } };
    dbState.selectRows["ai_analysis_jobs"] = [
      { id: "job-1", status: "completed", createdAt: new Date(FIXED_NOW.getTime() - 3 * 60_000) },
      { id: "job-2", status: "completed", createdAt: new Date(FIXED_NOW.getTime() - 4 * 60_000) },
    ];
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "ai_rate_limit_daily", retryAfterSeconds: 86400, dailyLimit: 2 });
  });

  it("vÃ­deo inexistente â†’ 404; carteira sem crÃ©dito â†’ 402 (antes de agregar)", async () => {
    dbState.selectRows["videos"] = [];
    const notFound = await analyze(analyzeRequest());
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "video_not_found" });
    expect(dbState.executeQueries).toHaveLength(0);

    dbState.selectRows["videos"] = [videoRow()];
    dbState.selectRows["ai_credit_wallets"] = [{ balance: 0 }];
    const noCredits = await analyze(analyzeRequest());
    expect(noCredits.status).toBe(402);
    expect(await noCredits.json()).toEqual({ error: "insufficient_credits" });
    expect(dbState.executeQueries).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/ai/analyze â€” falhas de job e de crÃ©dito                   */
/* ------------------------------------------------------------------ */

describe("POST /api/ai/analyze â€” falhas de job e de crÃ©dito", () => {
  it("conflito de job ativo no insert (23505) â†’ 409 analysis_in_progress", async () => {
    dbState.insertError = { code: "23505" };
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "analysis_in_progress" });
  });

  it("erro genÃ©rico no insert â†’ 500 analysis_create_failed", async () => {
    dbState.insertError = new Error("boom");
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "analysis_create_failed" });
  });

  it("insert sem linha devolvida â†’ 500 analysis_create_failed", async () => {
    dbState.insertReturns = [[]];
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "analysis_create_failed" });
  });

  it("dÃ©bito falhando â†’ 402 insufficient_credits e job marcado failed", async () => {
    creditState.consumeResult = { ok: false, reason: "insufficient_credits" };
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "insufficient_credits" });
    expect(dbState.updates.some((values) => (values as Record<string, unknown>).errorCode === "credit_debit_failed")).toBe(true);
    expect(afterState.tasks).toHaveLength(0);
  });

  it("dÃ©bito acontece com a referÃªncia do job, antes de chamar o provedor", async () => {
    await analyze(analyzeRequest());
    expect(vi.mocked(consumeAiCredit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(consumeAiCredit)).toHaveBeenCalledWith(OWNER, "ai_analysis:job-1", { analysisId: "job-1", videoId: VIDEO_ID, actorUserId: "user-owner" });
  });

  it("IA falhando â†’ estorna crÃ©dito, marca job failed e devolve 502", async () => {
    nvidiaState.error = new Error("nvidia_timeout");
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "nvidia_timeout", refunded: true });
    expect(vi.mocked(refundAiCredit)).toHaveBeenCalledWith(OWNER, "ai_analysis:job-1");
    expect(dbState.updates.some((values) => (values as Record<string, unknown>).errorCode === "nvidia_timeout")).toBe(true);
  });

  it("IA sem configuraÃ§Ã£o â†’ 503", async () => {
    nvidiaState.error = new Error("nvidia_not_configured");
    const response = await analyze(analyzeRequest());
    expect(response.status).toBe(503);
  });
});
