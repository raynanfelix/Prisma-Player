import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { gateState, rateState, dbState } = vi.hoisted(() => ({
  gateState: {
    ok: true as boolean,
    denyResponse: null as Response | null,
    plan: { capabilities: { audience_sync: true } },
  },
  rateState: {
    /** Quando definido, rateLimit devolve essa Response (limitado). */
    response: null as Response | null,
  },
  dbState: {
    /** Linhas devolvidas por `select`, por nome de tabela. Default: []. */
    selectRows: {} as Record<string, unknown[]>,
    /** Tabelas cujo select rejeita (simula erro do driver). */
    failingTables: {} as Record<string, boolean>,
    /** Tabelas efetivamente consultadas por select (trava: nada de video_events). */
    selectedTables: [] as string[],
    /** Resultado de `db.execute` (uma única query agregada por request). */
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
    return { ok: true, userId: "user-owner", account: { accountOwnerId: "user-owner" }, plan: gateState.plan };
  }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => rateState.response),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
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
    execute: (query: unknown) => {
      dbState.executeQueries.push(query);
      if (dbState.executeFails) return Promise.reject(new Error("store unavailable"));
      return Promise.resolve(dbState.executeResults.shift() ?? { rows: [] });
    },
  };

  return { db, pool: {}, schema };
});

import { rateLimit } from "@/lib/security/rate-limit";
import { POST as exportAudience } from "@/app/api/intelligence/audience-exports/route";

const OWNER = "user-owner";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

function exportRequest(body: Record<string, unknown> = {}): Request {
  return new Request("https://prisma.test/api/intelligence/audience-exports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId: VIDEO_ID, ...body }),
  });
}

function videoRow(title = "VSL Acentuação Test!"): Record<string, unknown> {
  return { id: VIDEO_ID, title };
}

/**
 * Forma que a query agregada devolve: uma linha de total (GROUPING SETS com
 * conjunto vazio) + uma linha por valor de cada dimensão, já ordenada pelo
 * SQL (session_count desc, last_seen desc).
 */
function sessionsFixture(extra: unknown[] = []): { rows: unknown[] } {
  return {
    rows: [
      { dimension: "total", name: null, session_count: 120, buyers: 12, last_seen: "2026-01-15T10:00:00.000Z" },
      { dimension: "country", name: "BR", session_count: 80, buyers: 10, last_seen: "2026-01-15T09:00:00.000Z" },
      { dimension: "country", name: "US", session_count: 30, buyers: 2, last_seen: "2026-01-14T09:00:00.000Z" },
      { dimension: "country", name: "PT", session_count: 10, buyers: 0, last_seen: "2026-01-13T09:00:00.000Z" },
      { dimension: "device", name: "mobile", session_count: 70, buyers: 8, last_seen: "2026-01-15T09:00:00.000Z" },
      { dimension: "device", name: "desktop", session_count: 50, buyers: 4, last_seen: "2026-01-14T09:00:00.000Z" },
      { dimension: "os", name: "Android", session_count: 60, buyers: 6, last_seen: "2026-01-15T08:00:00.000Z" },
      { dimension: "os", name: "Windows", session_count: 60, buyers: 6, last_seen: "2026-01-15T07:00:00.000Z" },
      { dimension: "browser", name: "Chrome", session_count: 100, buyers: 10, last_seen: "2026-01-15T09:00:00.000Z" },
      { dimension: "browser", name: "Safari", session_count: 20, buyers: 2, last_seen: "2026-01-14T09:00:00.000Z" },
      { dimension: "source", name: "facebook", session_count: 90, buyers: 9, last_seen: "2026-01-15T09:00:00.000Z" },
      { dimension: "source", name: "google", session_count: 30, buyers: 3, last_seen: "2026-01-14T09:00:00.000Z" },
      { dimension: "campaign", name: "black-friday", session_count: 120, buyers: 12, last_seen: "2026-01-15T09:00:00.000Z" },
      ...extra,
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
  gateState.ok = true;
  gateState.denyResponse = null;
  gateState.plan = { capabilities: { audience_sync: true } };
  rateState.response = null;
  dbState.selectRows = { videos: [videoRow()] };
  dbState.failingTables = {};
  dbState.selectedTables = [];
  dbState.executeResults = [sessionsFixture()];
  dbState.executeQueries = [];
  dbState.executeFails = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* POST /api/intelligence/audience-exports — contrato do arquivo        */
/* ------------------------------------------------------------------ */

describe("POST /api/intelligence/audience-exports — contrato do arquivo", () => {
  it("devolve text/plain com BOM, filename derivado do título e o perfil agregado completo", async () => {
    const response = await exportAudience(exportRequest({ segment: "engagers_75" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="audiencia-vsl-acentuacao-test.txt"');
    expect(response.headers.get("cache-control")).toBe("no-store");

    // O BOM é byte, não texto: response.text() o descarta na decodificação
    // UTF-8, então o contrato é travado nos bytes brutos do corpo.
    const raw = Buffer.from(await response.arrayBuffer());
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const content = raw.subarray(3).toString("utf8");
    expect(content.startsWith("PRISMA PLAYER — PERFIL REAL DE PÚBLICO\n")).toBe(true);
    expect(content).toContain("VSL: VSL Acentuação Test!");
    expect(content).toContain("Segmento: engagers_75");
    expect(content).toContain("Sessões no segmento: 120");
    expect(content).toContain("Compradores/conversões identificadas: 12");
    expect(content).toContain("Taxa de conversão do segmento: 10.0%");
    expect(content).toContain("PAÍSES\nBR: 80 (66.7%)\nUS: 30 (25.0%)\nPT: 10 (8.3%)");
    expect(content).toContain("DISPOSITIVOS\nmobile: 70 (58.3%)\ndesktop: 50 (41.7%)");
    expect(content).toContain("SISTEMAS OPERACIONAIS\nAndroid: 60 (50.0%)\nWindows: 60 (50.0%)");
    expect(content).toContain("NAVEGADORES\nChrome: 100 (83.3%)\nSafari: 20 (16.7%)");
    expect(content).toContain("ORIGENS DE TRÁFEGO\nfacebook: 90 (75.0%)\ngoogle: 30 (25.0%)");
    expect(content).toContain("CAMPANHAS\nblack-friday: 120 (100.0%)");
    expect(content).toContain("Idade e gênero não são coletados pelo player");
  });

  it("mantém o top-12 por dimensão: a 13ª linha não entra no arquivo", async () => {
    const extra = Array.from({ length: 13 }, (_, i) => ({
      dimension: "country",
      name: `pais-${String.fromCharCode(97 + i)}`,
      session_count: 1,
      buyers: 0,
      last_seen: "2026-01-01T00:00:00.000Z",
    }));
    dbState.executeResults = [sessionsFixture(extra)];
    const response = await exportAudience(exportRequest({ segment: "all" }));
    expect(response.status).toBe(200);
    const content = await response.text();
    const paises = content.split("PAÍSES\n")[1]!.split("\n\n")[0]!.split("\n");
    expect(paises).toHaveLength(12);
    expect(paises[0]).toBe("BR: 80 (66.7%)");
    // BR(80), US(30), PT(10) e só 9 dos pais-* de 1 sessão cabem no top-12.
    expect(paises.filter((line) => line.startsWith("pais-"))).toHaveLength(9);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/intelligence/audience-exports — agregação no banco         */
/* ------------------------------------------------------------------ */

describe("POST /api/intelligence/audience-exports — agregação no banco", () => {
  it("uma única query agrega por sessão no Postgres, com SQL parametrizado e sem cap", async () => {
    const response = await exportAudience(exportRequest({ segment: "engagers_75" }));
    expect(response.status).toBe(200);
    expect(dbState.executeQueries).toHaveLength(1);
    // Os eventos saem só via execute: o select toca apenas a tabela videos.
    expect(dbState.selectedTables).toEqual(["videos"]);

    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(dbState.executeQueries[0] as SQL);

    // Fold por sessão dentro do banco: atributos do evento mais recente
    // (created_at desc, id desc — mesma regra do fold JS original), max de
    // progresso e flags OR. Nada de 50 mil linhas para o JS.
    expect(query.sql).toContain("group by session_id");
    expect(query.sql).toContain("order by created_at desc, id desc");
    expect(query.sql).toContain("bool_or(event_type = 'conversion')");
    expect(query.sql).toContain("bool_or(event_type = 'complete')");
    expect(query.sql).toContain("bool_or(event_type = 'cta_click')");
    expect(query.sql).toContain("max(progress_percent) as max_progress");
    expect(query.sql).toContain("risk_score < 70");
    expect(query.sql).toContain("coalesce(utm_campaign, campaign_id)");
    expect(query.sql).toContain("group by grouping sets");
    expect(query.sql).toContain("count(*) filter (where conversion)");
    // O cap de 50 mil morreu: nenhuma cláusula limit sobrou.
    expect(query.sql).not.toContain("limit");
    // videoId/owner sempre como parâmetros ($n), nunca no texto.
    expect(query.sql).not.toContain(VIDEO_ID);
    expect(query.sql).not.toContain(OWNER);
    expect(query.params).toEqual([VIDEO_ID, OWNER]);
  });

  it("cada segmento vira uma condição SQL estática sobre a CTE de sessões", async () => {
    const expected: Record<string, string> = {
      all: "where true",
      buyers: "where conversion",
      completers: "where complete",
      engagers_75: "where max_progress >= 75",
      cta_clickers: "where cta",
    };
    const dialect = new PgDialect();
    for (const [segment, fragment] of Object.entries(expected)) {
      dbState.executeResults = [sessionsFixture()];
      const response = await exportAudience(exportRequest({ segment }));
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).toContain(`Segmento: ${segment}`);
      const query = dialect.sqlToQuery(dbState.executeQueries.at(-1) as SQL);
      expect(query.sql).toContain(fragment);
    }
  });

  it("segmento sem sessões → 422 segment_without_data", async () => {
    dbState.executeResults = [{ rows: [{ dimension: "total", name: null, session_count: 0, buyers: 0, last_seen: null }] }];
    const response = await exportAudience(exportRequest());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "segment_without_data", message: "Esta VSL ainda não possui pessoas no segmento escolhido." });
  });

  it("total ausente também vira 422 — num() degrada para 0, nunca NaN", async () => {
    dbState.executeResults = [{ rows: [] }];
    const response = await exportAudience(exportRequest());
    expect(response.status).toBe(422);
  });

  it("falha no banco → 503 audience_unavailable (tolerância original)", async () => {
    dbState.executeFails = true;
    const response = await exportAudience(exportRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "audience_unavailable" });

    dbState.executeFails = false;
    dbState.failingTables["videos"] = true;
    const selectFails = await exportAudience(exportRequest());
    expect(selectFails.status).toBe(503);
    expect(await selectFails.json()).toEqual({ error: "audience_unavailable" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/intelligence/audience-exports — gates                      */
/* ------------------------------------------------------------------ */

describe("POST /api/intelligence/audience-exports — gates", () => {
  it("guard negando devolve exatamente o gate.response, antes de qualquer IO", async () => {
    gateState.ok = false;
    gateState.denyResponse = new Response(JSON.stringify({ error: "subscription_required" }), { status: 402 });
    const response = await exportAudience(exportRequest());
    expect(response).toBe(gateState.denyResponse);
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("sem capability audience_sync → 402 plan_upgrade_required", async () => {
    gateState.plan = { capabilities: { audience_sync: false } };
    const response = await exportAudience(exportRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "plan_upgrade_required", capability: "audience_sync", message: "A exportação de público faz parte de um plano superior." });
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("rate limit: 10 por 10 min por titular da conta", async () => {
    rateState.response = new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
    const response = await exportAudience(exportRequest());
    expect(response).toBe(rateState.response);
    const [request, scope, options] = vi.mocked(rateLimit).mock.calls[0];
    expect(scope).toBe(`audience-export:${OWNER}`);
    expect(options).toEqual({ max: 10, windowMs: 10 * 60_000 });
    expect(request.url).toContain("/api/intelligence/audience-exports");
  });

  it("videoId não-uuid ou segmento inválido → 400 invalid_export_request", async () => {
    const response = await exportAudience(exportRequest({ videoId: "nope" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_export_request" });
    const invalidSegment = await exportAudience(exportRequest({ segment: "whales" }));
    expect(invalidSegment.status).toBe(400);
    expect(dbState.executeQueries).toHaveLength(0);
  });

  it("vídeo inexistente (ou não-ready) → 404 antes de agregar", async () => {
    dbState.selectRows["videos"] = [];
    const response = await exportAudience(exportRequest());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(dbState.executeQueries).toHaveLength(0);
  });
});
