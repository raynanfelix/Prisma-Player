import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { gateState, dbState } = vi.hoisted(() => ({
  gateState: {
    ok: true as boolean,
    denyResponse: null as Response | null,
  },
  dbState: {
    /** Linhas devolvidas por `select`, por nome de tabela. Default: []. */
    selectRows: {} as Record<string, unknown[]>,
    /** Tabelas cujo select rejeita (simula erro do driver, ex.: uuid inválido). */
    failingTables: {} as Record<string, boolean>,
    /** Resultados de `db.execute` em ordem de chamada: resumo, série, dimensões. */
    executeResults: [] as Array<{ rows: unknown[] }>,
    /** Queries recebidas por `db.execute` (objetos SQL do drizzle). */
    executeQueries: [] as unknown[],
    /** Quando true, `db.execute` rejeita (banco fora do ar). */
    executeFails: false as boolean,
  },
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) return { ok: false, response: gateState.denyResponse! };
    // Shape real do guard: rota só usa `account.accountOwnerId` aqui.
    return { ok: true, userId: "user-owner", account: { accountOwnerId: "user-owner" }, plan: {} };
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

vi.mock("@/lib/storage/r2", () => ({
  signR2ReadUrl: vi.fn(async (key: string) => `https://r2.signed.test/${key}`),
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
        }
        return chain;
      };
    }
    return chain;
  };

  const db = {
    select: () => selectChain(),
    execute: (query: unknown) => {
      dbState.executeQueries.push(query);
      if (dbState.executeFails) return Promise.reject(new Error("store unavailable"));
      return Promise.resolve(dbState.executeResults.shift() ?? { rows: [] });
    },
  };

  return { db, pool: {}, schema };
});

import { rateLimit } from "@/lib/security/rate-limit";
import { GET as getAnalytics } from "@/app/api/analytics/[videoId]/route";

const OWNER = "user-owner";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");
const DAY_MS = 86_400_000;

function analyticsRequestFor(videoId: string, query: Record<string, string> = {}): Request {
  const url = new URL(`https://prisma.test/api/analytics/${videoId}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new Request(url);
}

function analyticsRequest(query: Record<string, string> = {}): Request {
  return analyticsRequestFor(VIDEO_ID, query);
}

function ctx(videoId: string): { params: Promise<{ videoId: string }> } {
  return { params: Promise.resolve({ videoId }) };
}

function videoRow(): Record<string, unknown> {
  return { title: "VSL Principal", durationSeconds: "3600.5", objectPath: `${OWNER}/vsl.mp4`, mimeType: "video/mp4" };
}

/** Agregado das duas janelas (current/previous) — forma que a query de resumo devolve. */
function summaryFixture(): { rows: unknown[] } {
  return {
    rows: [
      { win: "current", impressions: 20, plays: 10, completed: 4, cta_clicks: 2, conversions: 1, reached10: 9, reached25: 8, reached50: 6, reached75: 5, reached90: 4, suspicious: 3 },
      { win: "previous", impressions: 10, plays: 5, completed: 2, cta_clicks: 1, conversions: 0, reached10: 4, reached25: 3, reached50: 2, reached75: 2, reached90: 2, suspicious: 1 },
    ],
  };
}

/** Buckets da série temporal — forma que a query de timeline devolve. */
function timelineFixture(): { rows: unknown[] } {
  return {
    rows: [
      { bucket: 0, impressions: 5, plays: 3, completes: 1, conversions: 1 },
      { bucket: 2, impressions: 2, plays: 1, completes: 0, conversions: 0 },
    ],
  };
}

/** Grupos por dimensão — forma que a query de GROUPING SETS devolve. */
function dimensionsFixture(): { rows: unknown[] } {
  return {
    rows: [
      { dimension: "country_code", name: "US", impressions: 12, plays: 2, completes: 0, first_created: "2025-12-17T00:00:00.000Z" },
      { dimension: "country_code", name: "BR", impressions: 12, plays: 6, completes: 2, first_created: "2025-12-18T00:00:00.000Z" },
      { dimension: "device_type", name: "mobile", impressions: 20, plays: 10, completes: 2, first_created: "2025-12-16T13:00:00.000Z" },
      { dimension: "device_type", name: "desktop", impressions: 0, plays: 0, completes: 0, first_created: "2025-12-19T00:00:00.000Z" },
    ],
  };
}

function defaultFixtures(): Array<{ rows: unknown[] }> {
  return [summaryFixture(), timelineFixture(), dimensionsFixture()];
}

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
  gateState.ok = true;
  gateState.denyResponse = null;
  dbState.selectRows = { videos: [videoRow()] };
  dbState.failingTables = {};
  dbState.executeResults = [];
  dbState.executeQueries = [];
  dbState.executeFails = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* GET /api/analytics/[videoId] — contrato preservado                    */
/* ------------------------------------------------------------------ */

describe("GET /api/analytics/[videoId] — contrato", () => {
  it("devolve o contrato completo (chaves, ordem e valores) a partir dos rows agregados", async () => {
    dbState.executeResults = defaultFixtures();
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const body = (await response.json()) as Record<string, any>;

    // Mesmas chaves, na mesma ordem, do contrato anterior à migração para SQL.
    expect(Object.keys(body)).toEqual([
      "video", "range", "truncated", "summary", "comparison", "timeline", "retention",
      "attentionMap", "funnel", "fraud", "dimensions", "insights", "live", "liveCountries",
    ]);
    expect(Object.keys(body.summary)).toEqual([
      "impressions", "uniqueViews", "plays", "playRate", "reached25", "reached50",
      "reached75", "reached90", "completed", "completionRate", "ctaClicks", "conversions",
    ]);
    expect(Object.keys(body.comparison)).toEqual(["previous", "delta"]);
    expect(Object.keys(body.comparison.delta)).toEqual(["impressions", "plays", "playRate", "completionRate", "conversions"]);
    expect(Object.keys(body.dimensions)).toEqual(["countries", "devices", "operatingSystems", "browsers", "traffic", "campaigns", "creatives", "ads"]);

    expect(body.video).toEqual({ title: "VSL Principal", duration_seconds: 3600.5, source: `https://r2.signed.test/${OWNER}/vsl.mp4`, type: "video/mp4" });
    expect(body.range).toBe(30);
    // O cap de 50 mil eventos morreu: nada é truncado, os números são exatos.
    expect(body.truncated).toBe(false);

    expect(body.summary).toEqual({
      impressions: 20, uniqueViews: 20, plays: 10, playRate: 50, reached25: 8, reached50: 6,
      reached75: 5, reached90: 4, completed: 4, completionRate: 40, ctaClicks: 2, conversions: 1,
    });
    expect(body.comparison.previous).toEqual({
      impressions: 10, uniqueViews: 10, plays: 5, playRate: 50, reached25: 3, reached50: 2,
      reached75: 2, reached90: 2, completed: 2, completionRate: 40, ctaClicks: 1, conversions: 0,
    });
    expect(body.comparison.delta).toEqual({ impressions: 100, plays: 100, playRate: 0, completionRate: 0, conversions: 100 });

    // Série temporal: 30 buckets de 1 dia (days=30), alinhados a `since`;
    // buckets 0 e 2 preenchidos, o resto zerado.
    expect(body.timeline).toHaveLength(30);
    const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
    const sinceMs = FIXED_NOW.getTime() - 30 * DAY_MS;
    expect(body.timeline[0]).toEqual({ date: new Date(sinceMs).toISOString(), label: formatter.format(new Date(sinceMs)), impressions: 5, plays: 3, completes: 1, conversions: 1 });
    expect(body.timeline[1]).toEqual({ date: new Date(sinceMs + DAY_MS).toISOString(), label: formatter.format(new Date(sinceMs + DAY_MS)), impressions: 0, plays: 0, completes: 0, conversions: 0 });
    expect(body.timeline[2]).toEqual({ date: new Date(sinceMs + 2 * DAY_MS).toISOString(), label: formatter.format(new Date(sinceMs + 2 * DAY_MS)), impressions: 2, plays: 1, completes: 0, conversions: 0 });

    expect(body.retention).toEqual([
      { point: 0, rate: 100, viewers: 10 },
      { point: 10, rate: 90, viewers: 9 },
      { point: 25, rate: 80, viewers: 8 },
      { point: 50, rate: 60, viewers: 6 },
      { point: 75, rate: 50, viewers: 5 },
      { point: 90, rate: 40, viewers: 4 },
      { point: 100, rate: 40, viewers: 4 },
    ]);
    expect(body.attentionMap).toEqual([
      { point: 10, rate: 90, viewers: 9, drop: 10 },
      { point: 25, rate: 80, viewers: 8, drop: 10 },
      { point: 50, rate: 60, viewers: 6, drop: 20 },
      { point: 75, rate: 50, viewers: 5, drop: 10 },
      { point: 90, rate: 40, viewers: 4, drop: 10 },
      { point: 100, rate: 40, viewers: 4, drop: 0 },
    ]);
    expect(body.funnel).toEqual([
      { name: "Visualizações", value: 20 },
      { name: "Plays", value: 10 },
      { name: "Assistiu 25%", value: 8 },
      { name: "Assistiu 50%", value: 6 },
      { name: "Assistiu 75%", value: 5 },
      { name: "Concluiu", value: 4 },
    ]);
    expect(body.fraud).toEqual({ suspiciousSessions: 3, suspiciousRate: 15, cleanSessions: 17 });

    // Empate de impressões preserva a ordem vinda do SQL (first_created asc);
    // grupo sem impressão continua listado, como no summarizeEvents original.
    expect(body.dimensions.countries).toEqual([
      { name: "US", impressions: 12, plays: 2, playRate: 16.7, completes: 0, completionRate: 0 },
      { name: "BR", impressions: 12, plays: 6, playRate: 50, completes: 2, completionRate: 33.3 },
    ]);
    expect(body.dimensions.devices).toEqual([
      { name: "mobile", impressions: 20, plays: 10, playRate: 50, completes: 2, completionRate: 20 },
      { name: "desktop", impressions: 0, plays: 0, playRate: 0, completes: 0, completionRate: 0 },
    ]);
    for (const key of ["operatingSystems", "browsers", "traffic", "campaigns", "creatives", "ads"]) {
      expect(body.dimensions[key]).toEqual([]);
    }

    // playRate 50 (>=35), plays 10 com queda controlada e completionRate 40:
    // só o insight de boa retenção final dispara.
    expect(body.insights).toEqual([
      { tone: "success", title: "Boa retenção final", detail: "A audiência que inicia permanece até o fim. Foque agora em CTA e taxa de conversão." },
    ]);
    expect(body.live).toBe(0);
    expect(body.liveCountries).toEqual([]);
  });

  it("sessões ao vivo: contador por sessão única e países agregados", async () => {
    dbState.executeResults = defaultFixtures();
    dbState.selectRows["video_live_sessions"] = [
      { sessionId: "s1", countryCode: "BR", deviceType: "mobile", progressPercent: 40, lastSeenAt: new Date(FIXED_NOW) },
      { sessionId: "s2", countryCode: "BR", deviceType: "desktop", progressPercent: 10, lastSeenAt: new Date(FIXED_NOW) },
    ];
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.live).toBe(2);
    expect(body.liveCountries).toEqual([{ name: "BR", impressions: 2, plays: 2, playRate: 100, completes: 0, completionRate: 0 }]);
  });

  it("rate limit permanece intacto: 60/min por titular da conta", async () => {
    dbState.executeResults = defaultFixtures();
    await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(vi.mocked(rateLimit)).toHaveBeenCalledTimes(1);
    const [request, scope, options] = vi.mocked(rateLimit).mock.calls[0];
    expect(scope).toBe(`analytics:${OWNER}`);
    expect(options).toEqual({ max: 60, windowMs: 60_000 });
    expect(request.url).toContain(`/api/analytics/${VIDEO_ID}`);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/analytics/[videoId] — agregação no Postgres                 */
/* ------------------------------------------------------------------ */

describe("GET /api/analytics/[videoId] — agregação no banco", () => {
  it("executa três queries agregadas com FILTER/GROUPING SETS e SQL parametrizado", async () => {
    dbState.executeResults = defaultFixtures();
    await getAnalytics(analyticsRequest({ days: "30" }), ctx(VIDEO_ID));

    expect(dbState.executeQueries).toHaveLength(3);
    const dialect = new PgDialect();
    const toQuery = (query: unknown) => dialect.sqlToQuery(query as SQL);
    const [summaryQuery, timelineQuery, dimensionsQuery] = dbState.executeQueries.map(toQuery);

    // Agregação condicional no Postgres — nenhum evento cruza a rede.
    expect(summaryQuery.sql).toContain("count(distinct session_id) filter (where event_type = 'impression')");
    expect(summaryQuery.sql).toContain("count(distinct session_id) filter (where event_type = 'complete' or (event_type = 'progress' and progress_percent >= 25))");
    expect(summaryQuery.sql).toContain("count(distinct session_id) filter (where risk_score >= 50)");
    expect(summaryQuery.sql).toContain("from video_events");
    expect(timelineQuery.sql).toContain("floor(extract(epoch from");
    expect(timelineQuery.sql).toContain("group by 1");
    expect(dimensionsQuery.sql).toContain("group by grouping sets");

    // Valores sempre como parâmetros ($n): uuid e janelas de tempo nunca são
    // concatenados no texto do SQL.
    const since = new Date(FIXED_NOW.getTime() - 30 * DAY_MS);
    const previousSince = new Date(FIXED_NOW.getTime() - 60 * DAY_MS);
    expect(summaryQuery.sql).not.toContain(VIDEO_ID);
    expect(summaryQuery.params).toEqual([since, VIDEO_ID, previousSince]);
    expect(timelineQuery.params).toEqual([since, 86_400, VIDEO_ID, since]);
    expect(dimensionsQuery.params).toEqual([VIDEO_ID, since]);
  });

  it("falha na agregação devolve 500 analytics_load_failed (tolerância original)", async () => {
    dbState.executeFails = true;
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "analytics_load_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/analytics/[videoId] — gates                                 */
/* ------------------------------------------------------------------ */

describe("GET /api/analytics/[videoId] — gates", () => {
  it("guard negando devolve exatamente o gate.response, antes de qualquer IO", async () => {
    gateState.ok = false;
    gateState.denyResponse = new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(response).toBe(gateState.denyResponse);
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("uuid inválido (erro do Postgres capturado) devolve 404 video_not_found", async () => {
    // O driver rejeita id não-UUID na consulta: a rota captura e responde 404.
    dbState.failingTables["videos"] = true;
    const response = await getAnalytics(analyticsRequestFor("not-a-uuid"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("uuid válido sem vídeo (ou de outro dono) devolve 404 sem agregar nada", async () => {
    dbState.selectRows["videos"] = [];
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(dbState.executeQueries).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/analytics/[videoId] — períodos sem eventos                  */
/* ------------------------------------------------------------------ */

describe("GET /api/analytics/[videoId] — períodos sem eventos", () => {
  it("zero eventos devolve números zerados (0, nunca NaN/null) e a série completa", async () => {
    dbState.executeResults = [{ rows: [] }, { rows: [] }, { rows: [] }];
    const response = await getAnalytics(analyticsRequest({ days: "7" }), ctx(VIDEO_ID));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;

    expect(body.range).toBe(7);
    expect(body.truncated).toBe(false);

    const zeros = { impressions: 0, uniqueViews: 0, plays: 0, playRate: 0, reached25: 0, reached50: 0, reached75: 0, reached90: 0, completed: 0, completionRate: 0, ctaClicks: 0, conversions: 0 };
    expect(body.summary).toEqual(zeros);
    expect(body.comparison.previous).toEqual(zeros);
    expect(body.comparison.delta).toEqual({ impressions: 0, plays: 0, playRate: 0, completionRate: 0, conversions: 0 });

    // days=7 -> 7 buckets de 1 dia, todos zerados, começando em `since`.
    expect(body.timeline).toHaveLength(7);
    const sinceMs = FIXED_NOW.getTime() - 7 * DAY_MS;
    expect(body.timeline[0].date).toBe(new Date(sinceMs).toISOString());
    expect(body.timeline.every((point: any) => point.impressions === 0 && point.plays === 0 && point.completes === 0 && point.conversions === 0)).toBe(true);

    expect(body.retention).toEqual([
      { point: 0, rate: 0, viewers: 0 },
      { point: 10, rate: 0, viewers: 0 },
      { point: 25, rate: 0, viewers: 0 },
      { point: 50, rate: 0, viewers: 0 },
      { point: 75, rate: 0, viewers: 0 },
      { point: 90, rate: 0, viewers: 0 },
      { point: 100, rate: 0, viewers: 0 },
    ]);
    // Mesma fórmula do original com rates em 0: primeira queda = 100 - 0.
    expect(body.attentionMap).toEqual([
      { point: 10, rate: 0, viewers: 0, drop: 100 },
      { point: 25, rate: 0, viewers: 0, drop: 0 },
      { point: 50, rate: 0, viewers: 0, drop: 0 },
      { point: 75, rate: 0, viewers: 0, drop: 0 },
      { point: 90, rate: 0, viewers: 0, drop: 0 },
      { point: 100, rate: 0, viewers: 0, drop: 0 },
    ]);
    expect(body.funnel).toEqual([
      { name: "Visualizações", value: 0 },
      { name: "Plays", value: 0 },
      { name: "Assistiu 25%", value: 0 },
      { name: "Assistiu 50%", value: 0 },
      { name: "Assistiu 75%", value: 0 },
      { name: "Concluiu", value: 0 },
    ]);
    expect(body.fraud).toEqual({ suspiciousSessions: 0, suspiciousRate: 0, cleanSessions: 0 });
    for (const key of ["countries", "devices", "operatingSystems", "browsers", "traffic", "campaigns", "creatives", "ads"]) {
      expect(body.dimensions[key]).toEqual([]);
    }
    expect(body.insights).toEqual([
      { tone: "info", title: "Colete mais tráfego", detail: "Ainda há poucos acessos para tirar conclusões seguras. Compartilhe o embed e volte após pelo menos 30 visualizações." },
    ]);
    expect(body.live).toBe(0);
    expect(body.liveCountries).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("NaN");
  });

  it("janela atual vazia com janela anterior populada: delta negativo, sem NaN", async () => {
    dbState.executeResults = [
      {
        rows: [
          { win: "previous", impressions: 10, plays: 5, completed: 2, cta_clicks: 0, conversions: 0, reached10: 5, reached25: 4, reached50: 3, reached75: 2, reached90: 2, suspicious: 0 },
        ],
      },
      { rows: [] },
      { rows: [] },
    ];
    const response = await getAnalytics(analyticsRequest(), ctx(VIDEO_ID));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.summary.impressions).toBe(0);
    expect(body.summary.playRate).toBe(0);
    expect(body.comparison.previous.impressions).toBe(10);
    expect(body.comparison.previous.playRate).toBe(50);
    expect(body.comparison.delta).toEqual({ impressions: -100, plays: -100, playRate: -50, completionRate: -40, conversions: 0 });
    expect(JSON.stringify(body)).not.toContain("NaN");
  });
});
