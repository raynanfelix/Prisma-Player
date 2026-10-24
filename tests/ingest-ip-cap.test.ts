import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M5 da auditoria de segurança (docs/reports/SECURITY_AUDIT_VALIDATION.md):
 * a ingestão de eventos (ab-events e analytics-events) limitava POR SESSÃO
 * auto-declarada no corpo, então a rotação de UUIDs de sessão ingestava sem
 * teto agregado. Duas barreiras novas:
 * - teto AGREGADO por IP (600/min) em ambas as rotas: o 601º evento da mesma
 *   origem leva 429;
 * - ab-events: o bucket por sessão passa a usar a sessão do EVENT TOKEN
 *   (HMAC-atestada, inescritível pelo corpo) quando o token a carrega - a
 *   sessão A/B do corpo é intencionalmente distinta (sorteio consistente de
 *   variante) e não pode ser comparada com a do token sem quebrar o produto.
 *
 * analytics-events já amarra o sessionId do corpo ao do token (RM-03) - o
 * teste de divergência cobre essa rota.
 */

const { rateState } = vi.hoisted(() => ({
  rateState: {
    /** Chamadas recebidas pelo rateLimit: { scope, options }. */
    calls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
    /** Contadores por bucket (janela fixa, como o rate-limit real). */
    buckets: new Map<string, number>(),
    /** Scopes cujo limite é ENFORCADO pelo mock (os demais só são gravados). */
    enforced: new Set<string>(),
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async (_request: Request, scope: string, options: { max?: number; windowMs?: number; failClosed?: boolean; identifier?: string }) => {
    rateState.calls.push({ scope, options: { ...options } as Record<string, unknown> });
    if (!rateState.enforced.has(scope)) return null;
    const key = `${scope}:${options.identifier ?? "ip"}`;
    const count = (rateState.buckets.get(key) ?? 0) + 1;
    rateState.buckets.set(key, count);
    if (count > (options.max ?? 600)) {
      return new Response(JSON.stringify({ error: "rate_limited", retryAfterSeconds: 1 }), {
        status: 429,
        headers: { "content-type": "application/json", "RateLimit-Limit": String(options.max ?? 600) },
      });
    }
    return null;
  }),
}));

vi.mock("@/lib/analytics/ingest", () => ({
  ingestAnalyticsEvents: vi.fn(async () => ({ kind: "no_content" })),
}));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { POST as postAbEvent } from "@/app/api/ab-events/route";
import { POST as postAnalyticsEvent } from "@/app/api/analytics-events/route";
import { createBoundEmbedEventToken, createEmbedEventToken } from "@/lib/security/embed-origin";
import { currentFakeDb, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const fake = (): FakeDb => currentFakeDb();

const VIDEO = "33333333-3333-4333-8333-333333333333";
const TEST = "44444444-4444-4444-8444-444444444444";
const VARIANT = "55555555-5555-4555-8555-555555555555";
/** Sessão A/B do corpo (localStorage por teste, persiste entre visitas). */
const AB_SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Sessão de analytics do viewer (por render) - é a que o token carrega. */
const TOKEN_SESSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RENDER_NONCE = "rendernonce123";

function baseHeaders(): Record<string, string> {
  return {
    origin: "https://prisma.test",
    "content-type": "application/json",
    cookie: `pp_embed=${RENDER_NONCE}`,
  };
}

function abRequest(token: string, sessionId = AB_SESSION): Request {
  return new Request("https://prisma.test/api/ab-events", {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({
      testId: TEST, variantId: VARIANT, sessionId, eventType: "impression",
      progressPercent: 0, watchedSeconds: 0, eventToken: token,
    }),
  });
}

function analyticsRequest(token: string, sessionId = TOKEN_SESSION): Request {
  return new Request("https://prisma.test/api/analytics-events", {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({
      videoId: VIDEO, sessionId, eventToken: token,
      events: [{ eventType: "impression", progressPercent: 0 }],
    }),
  });
}

beforeAll(() => {
  process.env.EMBED_ORIGIN_SECRET = "segredo-ingest-teste";
});

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
  fake().state.selectRows["ab_test_variants"] = [{ userId: "owner-1", videoId: VIDEO }];
  fake().state.selectRows["ab_tests"] = [{ status: "active" }];
  fake().state.selectRows["videos"] = [{ status: "ready" }];
  fake().state.selectRows["player_configs"] = [{ id: "pc-1" }];
  rateState.calls = [];
  rateState.buckets = new Map();
  rateState.enforced = new Set(["ab-events-ip", "analytics-events-ip"]);
});

describe("M5: teto agregado por IP na ingestão de eventos", () => {
  it("ab-events: 601º evento do mesmo IP leva 429 (teto 600/min/IP)", async () => {
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", sessionId: TOKEN_SESSION, nonce: RENDER_NONCE });

    const ipCalls = rateState.calls.filter((call) => call.scope === "ab-events-ip");
    for (let i = 0; i < 600; i += 1) {
      const response = await postAbEvent(abRequest(token));
      if (response.status !== 202) {
        expect(`evento ${i + 1} deveria passar, veio ${response.status}`).toBe("");
      }
    }
    expect(ipCallsAtLeast(600)).toBe(true);

    const burst = await postAbEvent(abRequest(token));
    expect(burst.status).toBe(429);
    expect(await burst.json()).toMatchObject({ error: "rate_limited" });
    expect(burst.headers.get("RateLimit-Limit")).toBe("600");
  });

  it("analytics-events: 601º evento do mesmo IP leva 429 (teto 600/min/IP)", async () => {
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", sessionId: TOKEN_SESSION, nonce: RENDER_NONCE });

    for (let i = 0; i < 600; i += 1) {
      const response = await postAnalyticsEvent(analyticsRequest(token));
      if (response.status !== 204) {
        expect(`evento ${i + 1} deveria passar, veio ${response.status}`).toBe("");
      }
    }

    const burst = await postAnalyticsEvent(analyticsRequest(token));
    expect(burst.status).toBe(429);
    expect(await burst.json()).toMatchObject({ error: "rate_limited" });
    expect(burst.headers.get("RateLimit-Limit")).toBe("600");
  });
});

describe("M5: bucket de sessão do ab-events amarrado ao token (não ao corpo)", () => {
  it("token com sessão: o bucket usa a sessão ATTESTADA do token, não a A/B do corpo", async () => {
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", sessionId: TOKEN_SESSION, nonce: RENDER_NONCE });

    const response = await postAbEvent(abRequest(token, AB_SESSION));

    expect(response.status).toBe(202);
    const identity = rateState.calls.find((call) => call.scope === `ab:${TEST}:${VARIANT}`);
    expect(identity?.options.identifier).toBe(`t:${TOKEN_SESSION}`);
    // Rotacionar o sessionId do corpo não muda o bucket: mesma chave de token.
    const rotated = await postAbEvent(abRequest(token, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    expect(rotated.status).toBe(202);
    const identityCalls = rateState.calls.filter((call) => call.scope === `ab:${TEST}:${VARIANT}`);
    expect(identityCalls.every((call) => call.options.identifier === `t:${TOKEN_SESSION}`)).toBe(true);
  });

  it("token legado sem claim de sessão: cai no sessionId do corpo (validado como UUID)", async () => {
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", nonce: RENDER_NONCE });

    const response = await postAbEvent(abRequest(token, AB_SESSION));

    expect(response.status).toBe(202);
    const identity = rateState.calls.find((call) => call.scope === `ab:${TEST}:${VARIANT}`);
    expect(identity?.options.identifier).toBe(`s:${AB_SESSION}`);
  });

  it("o bucket por identidade também trava: 121º evento da mesma sessão de token leva 429", async () => {
    rateState.enforced.add(`ab:${TEST}:${VARIANT}`);
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", sessionId: TOKEN_SESSION, nonce: RENDER_NONCE });
    rateState.buckets = new Map();

    for (let i = 0; i < 120; i += 1) {
      const response = await postAbEvent(abRequest(token));
      if (response.status !== 202) {
        expect(`evento ${i + 1} deveria passar, veio ${response.status}`).toBe("");
      }
    }
    const burst = await postAbEvent(abRequest(token));
    expect(burst.status).toBe(429);
  });
});

describe("RM-03 preservado: analytics-events amarra o sessionId do corpo ao do token", () => {
  it("sessionId divergente do que o token carrega → 403 invalid_event_token", async () => {
    const token = createBoundEmbedEventToken({ videoId: VIDEO, host: "prisma.test", sessionId: TOKEN_SESSION, nonce: RENDER_NONCE });

    const response = await postAnalyticsEvent(analyticsRequest(token, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_event_token" });
  });

  it("token legado (sem sessão nem nonce) não passa na prova de render: 403", async () => {
    const legacy = createEmbedEventToken(VIDEO);

    const response = await postAnalyticsEvent(analyticsRequest(legacy));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_event_token" });
  });
});

function ipCallsAtLeast(min: number): boolean {
  return rateState.calls.filter((call) => call.scope === "ab-events-ip").length >= min;
}
