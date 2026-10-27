import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { currentFakeDb, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const { accessState, vpnState } = vi.hoisted(() => ({
  accessState: { hasAccess: true as boolean },
  vpnState: { blocked: false as boolean },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

// P0-1: escopos públicos de embed migraram para o limitador por instância.
vi.mock("@/lib/security/rate-limit-local", () => ({
  localRateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountAccess: vi.fn(async () => ({ hasAccess: accessState.hasAccess, trialActive: true, subscriptionActive: false })),
}));

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    // URL assinada com cara real: o TTL viaja no X-Amz-Expires para o teste
    // de "assinatura curta" conferir o que a rota pediu ao assinador.
    signR2ReadUrl: vi.fn(async (key: string, expiresIn = 900) => `https://r2.signed.test/${key}?X-Amz-Expires=${expiresIn}`),
  };
});

vi.mock("@/lib/security/vpn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/vpn")>();
  return { ...actual, isVpnOrProxy: vi.fn(async () => vpnState.blocked) };
});

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { createEmbedOriginToken, mintEmbedSessionToken } from "@/lib/security/embed-origin";
import { resetAccessCacheForTests } from "@/lib/access/access-cache";
import { resetEmbedConfigCacheForTests } from "@/lib/player/embed-config";
import { localRateLimit } from "@/lib/security/rate-limit-local";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { GET as getEmbedStream } from "@/app/api/embed/[id]/stream/route";
import { POST as postEmbedCapi } from "@/app/api/embed/[id]/capi/route";

const OWNER = "user-owner";
const PLAYER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const SESSION_ID = "dddddddd-0000-4000-8000-000000000004";
const VIEWER_ID = "eeeeeeee-0000-4000-8000-000000000005";
const NONCE = "nonce-abc";
const HOST = "site.com";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const fake = (): FakeDb => currentFakeDb();

function playerConfigRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PLAYER_ID,
    videoId: VIDEO_ID,
    userId: OWNER,
    config: {},
    allowedDomains: [],
    published: true,
    ...overrides,
  };
}

function embedVideoRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VIDEO_ID,
    title: "VSL Principal",
    objectPath: `${OWNER}/vsl.mp4`,
    mimeType: "video/mp4",
    userId: OWNER,
    ...overrides,
  };
}

function mintOriginToken(): string {
  return createEmbedOriginToken({ playerId: PLAYER_ID, host: HOST, nonce: NONCE });
}

function mintSession(overrides: Partial<{ playerId: string; viewerId: string; sessionId: string; nonce: string; host: string }> = {}): string {
  return mintEmbedSessionToken({
    playerId: overrides.playerId ?? PLAYER_ID,
    viewerId: overrides.viewerId ?? VIEWER_ID,
    sessionId: overrides.sessionId ?? SESSION_ID,
    nonce: overrides.nonce ?? NONCE,
    host: overrides.host ?? HOST,
  });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function streamRequest(id: string, options: { query?: Record<string, string>; headers?: Record<string, string> } = {}): Request {
  const url = new URL(`https://prisma.test/api/embed/${id}/stream`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  return new Request(url, { headers: new Headers(options.headers) });
}

/** Request de stream com o pipeline completo válido (token, cookie, sessão, UA). */
function confirmedStreamRequest(id: string, options: { query?: Record<string, string>; headers?: Record<string, string> } = {}) {
  return streamRequest(id, {
    ...options,
    query: {
      originToken: mintOriginToken(),
      viewerId: VIEWER_ID,
      sessionId: SESSION_ID,
      sessionToken: mintSession({ playerId: id }),
      ...(options.query ?? {}),
    },
    headers: { "user-agent": BROWSER_UA, cookie: `pp_embed=${NONCE}`, ...(options.headers ?? {}) },
  });
}

function capiRequest(id: string, options: { query?: Record<string, string>; headers?: Record<string, string>; body?: Record<string, unknown> } = {}): Request {
  const url = new URL(`https://prisma.test/api/embed/${id}/capi`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  return new Request(url, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...(options.headers ?? {}) }),
    body: JSON.stringify(options.body ?? {}),
  });
}

/** POST de CAPI com o pipeline completo válido. */
function confirmedCapiRequest(id: string, options: { body?: Record<string, unknown>; query?: Record<string, string>; headers?: Record<string, string> } = {}) {
  return capiRequest(id, {
    ...options,
    query: {
      originToken: mintOriginToken(),
      viewerId: VIEWER_ID,
      sessionId: SESSION_ID,
      sessionToken: mintSession({ playerId: id }),
      ...(options.query ?? {}),
    },
    headers: { cookie: `pp_embed=${NONCE}`, ...(options.headers ?? {}) },
  });
}

beforeAll(() => {
  process.env.EMBED_ORIGIN_SECRET = "test-embed-origin-secret";
});

afterAll(() => {
  delete process.env.EMBED_ORIGIN_SECRET;
  delete process.env.META_CAPI_TOKENS_JSON;
});

beforeEach(() => {
  accessState.hasAccess = true;
  vpnState.blocked = false;
  resetAccessCacheForTests();
  // Cache de config/vídeo de embed (P1-4): cada caso define a própria
  // config e não pode herdar a do caso anterior.
  resetEmbedConfigCacheForTests();
  resetFakeDb(fake());
  fake().state.selectRows["player_configs"] = [playerConfigRow()];
  fake().state.selectRows["videos"] = [embedVideoRow()];
  delete process.env.META_CAPI_TOKENS_JSON;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetFakeDb(fake());
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id]/stream - porta da mídia (C1)                    */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id]/stream - 302 assinado de curta duração", () => {
  it("pipeline válido devolve 302 com Location assinado e TTL de 120s", async () => {
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain(`https://r2.signed.test/${OWNER}/vsl.mp4`);
    // A assinatura é NA HORA e curta: TTL de 120s, não o TTL longo (900s)
    // das URLs que antes viajavam no corpo.
    expect(vi.mocked(signR2ReadUrl)).toHaveBeenCalledWith(`${OWNER}/vsl.mp4`, 120);
    expect(location).toContain("X-Amz-Expires=120");
    // Corpo vazio: a URL assinada só existe no header Location.
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("renova o cookie de render no 302 (mesmo nonce da sessão): VSL longa segue tocando", async () => {
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(302);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`pp_embed=${NONCE}`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("sem sessão válida devolve 401 session_required", async () => {
    const response = await getEmbedStream(
      streamRequest(PLAYER_ID, {
        query: { originToken: mintOriginToken(), viewerId: VIEWER_ID, sessionId: SESSION_ID },
        headers: { "user-agent": BROWSER_UA, cookie: `pp_embed=${NONCE}` },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("sessionToken assinado para outro host não vale na porta da mídia: 401", async () => {
    const response = await getEmbedStream(
      confirmedStreamRequest(PLAYER_ID, { query: { sessionToken: mintSession({ host: "evil.com" }) } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("Origin divergente do host assinado devolve 403 origin_mismatch", async () => {
    const response = await getEmbedStream(
      confirmedStreamRequest(PLAYER_ID, { headers: { origin: "https://evil.com" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_mismatch" });
  });

  it("cookie de render ausente devolve 403 render_not_confirmed", async () => {
    const response = await getEmbedStream(
      streamRequest(PLAYER_ID, {
        query: { originToken: mintOriginToken(), viewerId: VIEWER_ID, sessionId: SESSION_ID, sessionToken: mintSession() },
        headers: { "user-agent": BROWSER_UA },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "render_not_confirmed" });
  });

  it("UA curl devolve 403 browser_required (anti-script na porta da mídia)", async () => {
    const response = await getEmbedStream(
      confirmedStreamRequest(PLAYER_ID, { headers: { "user-agent": "curl/8.5.0" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "browser_required" });
  });

  it("paywall do titular bloqueado devolve 402 player_unavailable (mesma porta da mídia)", async () => {
    accessState.hasAccess = false;
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "player_unavailable" });
  });

  it("geo fora da allowlist bloqueia no stream: 403 country_not_allowed", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ config: { trafficEnabled: true, allowedCountries: "br" } })];
    const response = await getEmbedStream(
      confirmedStreamRequest(PLAYER_ID, { headers: { "x-vercel-ip-country": "us" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "country_not_allowed" });
  });

  it("HLS/m3u8 é pendência documentada: 415 unsupported_format (proxy é MP4-only)", async () => {
    fake().state.selectRows["videos"] = [embedVideoRow({ mimeType: "application/vnd.apple.mpegurl" })];
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_format" });
  });

  it("player inexistente devolve 404 player_not_found", async () => {
    fake().state.selectRows["player_configs"] = [];
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("vídeo não-ready devolve 404 video_not_found", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });

  it("falha ao assinar devolve 503 source_unavailable sem Location", async () => {
    vi.mocked(signR2ReadUrl).mockRejectedValueOnce(new Error("r2 down"));
    const response = await getEmbedStream(confirmedStreamRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "source_unavailable" });
    expect(response.headers.get("location")).toBe(null);
  });

  it("id não-UUID devolve 404 antes de qualquer IO", async () => {
    const response = await getEmbedStream(streamRequest("not-a-uuid"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/embed/[id]/capi - CAPI server-side com token do banco (C2)  */
/* ------------------------------------------------------------------ */

describe("POST /api/embed/[id]/capi - eventos Meta pelo servidor", () => {
  it("dispara ViewContent na API da Meta com o capiToken lido do banco (nunca do request)", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { metaPixelEnabled: true, metaPixelId: "1234567890123456789", metaCapiToken: "EAAW-segredo-do-dono-987654321" },
    })];
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    }));
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent", eventId: "sessao-1:impression:0", eventSourceUrl: "https://site.com/vsl" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).toMatch(/"delivered":true/);
    // O segredo nunca vaza na resposta da rota.
    expect(raw).not.toContain("EAAW-segredo");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("graph.facebook.com/");
    expect(calls[0].url).toContain("/1234567890123456789/events");
    const payload = calls[0].body as { access_token: string; data: Array<Record<string, unknown>> };
    expect(payload.access_token).toBe("EAAW-segredo-do-dono-987654321");
    expect(payload.data[0].event_name).toBe("ViewContent");
    expect(payload.data[0].event_id).toBe("sessao-1:impression:0");
    expect(payload.data[0].event_source_url).toBe("https://site.com/vsl");
  });

  it("usa o token do env como fallback quando o config não tem token por player", async () => {
    process.env.META_CAPI_TOKENS_JSON = JSON.stringify({ "1234567890123456789": "env-global-token-987654321" });
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { metaPixelEnabled: true, metaPixelId: "1234567890123456789" },
    })];
    const calls: Array<{ body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response("{}", { status: 200 });
    }));
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "Lead", eventId: "sessao-1:cta_click:0" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect((calls[0].body as { access_token: string }).access_token).toBe("env-global-token-987654321");
  });

  it("sem pixel Meta configurado devolve 200 not_configured sem chamar a plataforma", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ delivered: false, reason: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("nome de evento fora da allowlist devolve 400 invalid_event_name", async () => {
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "EventoInventado" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_event_name" });
  });

  it("sem sessão válida devolve 401 session_required", async () => {
    const response = await postEmbedCapi(
      capiRequest(PLAYER_ID, {
        query: { originToken: mintOriginToken(), viewerId: VIEWER_ID, sessionId: SESSION_ID },
        headers: { cookie: `pp_embed=${NONCE}` },
        body: { eventName: "ViewContent" },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("paywall do titular bloqueado devolve 402 (CAPI é entrega do produto)", async () => {
    accessState.hasAccess = false;
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "player_unavailable" });
  });

  it("rate limit por IP de 30/min respeitado na chamada (por instância, P0-1)", async () => {
    await postEmbedCapi(confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent" } }), ctx(PLAYER_ID));
    expect(vi.mocked(localRateLimit)).toHaveBeenCalledWith(
      expect.any(Request),
      `embed-capi:${PLAYER_ID}`,
      { max: 30, windowMs: 60_000 },
    );
  });

  it("limite estourado devolve o 429 do rate limit", async () => {
    vi.mocked(localRateLimit).mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json", "retry-after": "1" } }));
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
  });

  it("player inexistente devolve 404 player_not_found", async () => {
    fake().state.selectRows["player_configs"] = [];
    const response = await postEmbedCapi(
      confirmedCapiRequest(PLAYER_ID, { body: { eventName: "ViewContent" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });
});
