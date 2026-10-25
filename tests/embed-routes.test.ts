import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { currentFakeDb, insertedValues, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const { accessState, vpnState } = vi.hoisted(() => ({
  // Acesso pago do TITULAR do player: o embed é a entrega do produto, então
  // cancelar a assinatura precisa tirar o player do ar (402).
  accessState: { hasAccess: true as boolean },
  vpnState: { blocked: false as boolean },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountAccess: vi.fn(async () => ({ hasAccess: accessState.hasAccess, trialActive: true, subscriptionActive: false })),
}));

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    signR2ReadUrl: vi.fn(async (key: string) => `https://r2.signed.test/${key}`),
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

// O módulo de origem é o REAL (criptografia pura, sem rede): os tokens são
// mintados e verificados com o mesmo código de produção.
import { createEmbedOriginToken, mintEmbedSessionToken, verifyEmbedEventTokenContext, verifyEmbedSessionToken } from "@/lib/security/embed-origin";
import { streamKeyForIp } from "@/lib/player/stream-key";
import { resetAccessCacheForTests } from "@/lib/access/access-cache";
import { rateLimit } from "@/lib/security/rate-limit";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { GET as getEmbedConfig } from "@/app/api/embed/[id]/route";
import { GET as getEmbedManifest } from "@/app/api/embed/[id]/manifest/route";
import { POST as postEmbedSession } from "@/app/api/embed/[id]/session/route";

const OWNER = "user-owner";
const PLAYER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PLAYER_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const SESSION_ID = "dddddddd-0000-4000-8000-000000000004";
const OTHER_SESSION_ID = "dddddddd-0000-4000-8000-000000000099";
const VIEWER_ID = "eeeeeeee-0000-4000-8000-000000000005";
const NONCE = "nonce-abc";
const HOST = "site.com";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

function mint(options: { playerId?: string; host?: string; nonce?: string; maxAgeSeconds?: number } = {}): string {
  return createEmbedOriginToken({
    playerId: options.playerId ?? PLAYER_ID,
    host: options.host ?? HOST,
    nonce: options.nonce ?? NONCE,
    ...(options.maxAgeSeconds !== undefined ? { maxAgeSeconds: options.maxAgeSeconds } : {}),
  });
}

/** sessionToken do DRM mintado com o código real, amarrado a host + render. */
function mintSession(overrides: Partial<{ playerId: string; viewerId: string; sessionId: string; nonce: string; host: string }> = {}): string {
  return mintEmbedSessionToken({
    playerId: overrides.playerId ?? PLAYER_ID,
    viewerId: overrides.viewerId ?? VIEWER_ID,
    sessionId: overrides.sessionId ?? SESSION_ID,
    nonce: overrides.nonce ?? NONCE,
    host: overrides.host ?? HOST,
  });
}

function embedRequest(
  path: string,
  options: { token?: string; headers?: Record<string, string>; query?: Record<string, string> } = {},
): Request {
  const url = new URL(`https://prisma.test${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  if (options.token) url.searchParams.set("originToken", options.token);
  return new Request(url, { headers: new Headers(options.headers) });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/**
 * Request válido de render confirmado + SESSÃO assinada: a config dinâmica
 * agora exige viewerId + sessionId + sessionToken (C1) em toda entrega.
 */
function confirmedRequest(id: string, options: Parameters<typeof embedRequest>[1] = {}) {
  return embedRequest(`/api/embed/${id}`, {
    ...options,
    token: options.token ?? mint(),
    query: { viewerId: VIEWER_ID, sessionId: SESSION_ID, sessionToken: mintSession({ playerId: id }), ...(options.query ?? {}) },
    headers: { cookie: `pp_embed=${NONCE}`, ...(options.headers ?? {}) },
  });
}

/** POST para o mint de sessionToken, com body JSON e headers opcionais. */
function sessionRequest(
  id: string,
  options: { token?: string; headers?: Record<string, string>; query?: Record<string, string>; body?: Record<string, unknown> } = {},
): Request {
  const url = new URL(`https://prisma.test/api/embed/${id}/session`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  if (options.token) url.searchParams.set("originToken", options.token);
  return new Request(url, {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...(options.headers ?? {}) }),
    body: JSON.stringify(options.body ?? {}),
  });
}

/** POST de sessão com origem confirmada (mesmo pipeline da config) + UA de navegador. */
function confirmedSessionRequest(id: string, options: Parameters<typeof sessionRequest>[1] = {}) {
  return sessionRequest(id, {
    ...options,
    token: options.token ?? mint(),
    headers: { "user-agent": BROWSER_UA, origin: `https://${HOST}`, cookie: `pp_embed=${NONCE}`, ...(options.headers ?? {}) },
  });
}

/** Token de sessão "v1.<payload>.<hmac>" forjado com a MESMA secret do beforeAll. */
function forgedSessionToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", "test-embed-origin-secret").update(payload).digest("base64url");
  return `v1.${payload}.${signature}`;
}

beforeAll(() => {
  process.env.EMBED_ORIGIN_SECRET = "test-embed-origin-secret";
});

afterAll(() => {
  delete process.env.EMBED_ORIGIN_SECRET;
});

beforeEach(() => {
  accessState.hasAccess = true;
  vpnState.blocked = false;
  // O micro-cache de acesso (30s) sobrevive entre casos no mesmo worker:
  // sem reset, o 402 de um caso vaza hasAccess=false para os demais.
  resetAccessCacheForTests();
  resetFakeDb(fake());
  // Caminho feliz padrão: player publicado + vídeo ready do titular.
  fake().state.selectRows["player_configs"] = [playerConfigRow()];
  fake().state.selectRows["videos"] = [embedVideoRow()];
});

afterEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - acesso e publicação                            */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - acesso e publicação", () => {
  it("id não-UUID devolve 404 player_not_found (não 500), antes de qualquer IO", async () => {
    const response = await getEmbedConfig(embedRequest("/api/embed/not-a-uuid"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("player inexistente ou não publicado devolve 404 (a query filtra published=true)", async () => {
    fake().state.selectRows["player_configs"] = [];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("titular sem acesso pago devolve 402 player_unavailable (paywall na entrega)", async () => {
    accessState.hasAccess = false;
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "player_unavailable" });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("falha no lookup devolve 503 player_lookup_failed", async () => {
    fake().state.failingTables["player_configs"] = true;
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "player_lookup_failed" });
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - token de origem e prova de render (RM-02)      */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - token de origem e prova de render (RM-02)", () => {
  it("sem originToken devolve 403 invalid_origin_token", async () => {
    const response = await getEmbedConfig(embedRequest(`/api/embed/${PLAYER_ID}`), ctx(PLAYER_ID));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin_token" });
  });

  it("token mintado para outro player não vale: 403 (sem curinga)", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { token: mint({ playerId: OTHER_PLAYER_ID }) }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin_token" });
  });

  it("token expirado devolve 403 invalid_origin_token", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { token: mint({ maxAgeSeconds: -60 }) }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin_token" });
  });

  it("Origin header divergente do host do token devolve 403 origin_mismatch", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { headers: { origin: "https://evil.com" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_mismatch" });
  });

  it("token sem nonce (não amarrado a render) devolve 403 render_not_confirmed", async () => {
    const token = createEmbedOriginToken({ playerId: PLAYER_ID, host: HOST });
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID, { token }), ctx(PLAYER_ID));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "render_not_confirmed" });
  });

  it("cookie de render errado devolve 403 render_not_confirmed", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { headers: { cookie: "pp_embed=outra-coisa" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "render_not_confirmed" });
  });

  it("domínio do host não permitido devolve 403 domain_not_allowed", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ allowedDomains: ["permitido.com"] })];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "domain_not_allowed" });
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - sessão assinada obrigatória (C1)               */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - sessão assinada obrigatória (C1)", () => {
  it("sem viewerId/sessionId no query devolve 403 session_required", async () => {
    const response = await getEmbedConfig(
      embedRequest(`/api/embed/${PLAYER_ID}`, { token: mint(), headers: { cookie: `pp_embed=${NONCE}` } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("ids válidos mas SEM sessionToken é 403 (o bypass de UUIDs forjados morre)", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionToken: "" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("sessionToken mintado para OUTRA sessão não vale para este request: 403", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionToken: mintSession({ sessionId: OTHER_SESSION_ID }) } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("sessionToken assinado para outro HOST não vale (origin binding): 403", async () => {
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionToken: mintSession({ host: "evil.com" }) } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("fluxo ponta a ponta: sessionToken mintado pela rota /session libera a config", async () => {
    const sessionResponse = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(sessionResponse.status).toBe(200);
    const { sessionToken } = (await sessionResponse.json()) as { sessionToken: string };
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionToken } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - entrega                                       */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - entrega", () => {
  it("devolve streamUrl relativa (sem URL R2 no corpo) e eventToken amarrado ao render", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ config: { radius: 12 } })];
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");

    const raw = await response.text();
    // C1: nenhuma URL do storage no corpo - só a porta da mídia relativa.
    expect(raw).not.toContain("r2.signed.test");
    expect(raw).not.toContain("https://");
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["config", "eventToken", "id", "streamUrl", "title", "type", "videoId", "viewerIp"]);
    expect(body.viewerIp).toBe("");
    expect(body.id).toBe(PLAYER_ID);
    expect(body.videoId).toBe(VIDEO_ID);
    expect(body.title).toBe("VSL Principal");
    expect(body.type).toBe("video/mp4");
    expect(String(body.streamUrl)).toContain(`/api/embed/${PLAYER_ID}/stream?`);
    expect(String(body.streamUrl)).toContain("originToken=");
    expect(String(body.streamUrl)).toContain(`viewerId=${VIEWER_ID}`);
    expect(String(body.streamUrl)).toContain(`sessionId=${SESSION_ID}`);
    expect(String(body.streamUrl)).toContain("sessionToken=");
    // radius 12 é o valor "sem borda" do legado: chega como 0.
    expect((body.config as Record<string, unknown>).radius).toBe(0);

    // RM-03: eventToken amarrado a vídeo, host, sessão e nonce do render.
    const context = verifyEmbedEventTokenContext(String(body.eventToken), {
      videoId: VIDEO_ID,
      sessionId: SESSION_ID,
      host: HOST,
      nonce: NONCE,
    });
    expect(context).not.toBeNull();
    expect(context?.host).toBe(HOST);
    expect(context?.sessionId).toBe(SESSION_ID);
    expect(context?.nonce).toBe(NONCE);
  });

  it("nunca devolve metaCapiToken: config filtrado com a MESMA allowlist pública (C2)", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: {
        metaCapiToken: "EAAW-segredo-do-dono-987654321",
        metaPixelEnabled: true,
        metaPixelId: "1234567890123456789",
        googlePixelEnabled: true,
        googleTagId: "AW-123456789",
        trafficEnabled: true,
        allowedCountries: "br",
        drmSignedTokenEnabled: true,
        limitConcurrentStreams: true,
        maxConcurrentStreams: 5,
      },
    })];
    // A config do teste liga o muro de tráfego com allowlist "br": o header de
    // geo é injetado pela plataforma (Vercel/CF) em produção e a regra
    // (pré-existente, fail-closed) bloqueia request sem ele. O que se prova
    // aqui é a FILTRAGEM das chaves, então o request leva o geo real.
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { headers: { "x-vercel-ip-country": "br" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("capiToken");
    expect(raw).not.toContain("EAAW-segredo");
    const body = JSON.parse(raw) as { config: Record<string, unknown> };
    // IDs públicos continuam (o pixel de browser precisa deles).
    expect(body.config.metaPixelId).toBe("1234567890123456789");
    expect(body.config.googleTagId).toBe("AW-123456789");
    // Segredo e chaves server-only ficam no banco.
    expect(body.config).not.toHaveProperty("metaCapiToken");
    expect(body.config).not.toHaveProperty("trafficEnabled");
    expect(body.config).not.toHaveProperty("allowedCountries");
    expect(body.config).not.toHaveProperty("drmSignedTokenEnabled");
    expect(body.config).not.toHaveProperty("limitConcurrentStreams");
  });

  it("devolve o IP real do espectador quando o deploy repassa os headers (e só com exibição de IP ativa na marca d'água)", async () => {
    // Review LOW-2: viewerIp é PII condicional - sai da rota apenas quando o
    // dono ativou "Endereço IP" na marca d'água (watermarkShowIp: true).
    fake().state.selectRows["player_configs"] = [playerConfigRow({ config: { watermarkShowIp: true } })];
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { viewerIp: string };
    expect(body.viewerIp).toBe("203.0.113.9");
  });

  it("só assina assets do próprio dono: alheio é descartado antes de assinar", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { assets: { thumbnailStart: `${OWNER}/thumb.png`, thumbnailPause: "user-outro/x.png" } },
    })];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { config: { assets: Record<string, string>; assetUrls: Record<string, string> } };
    expect(body.config.assets).toEqual({ thumbnailStart: `${OWNER}/thumb.png` });
    expect(body.config.assetUrls).toEqual({ thumbnailStart: `https://r2.signed.test/${OWNER}/thumb.png` });
  });

  it("vídeo não-ready (ou inexistente) devolve 404 video_not_found", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - regras de tráfego do config                   */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - regras de tráfego do config", () => {
  const trafficRow = (config: Record<string, unknown>, headers: Record<string, string> = {}, query: Record<string, string> = {}) => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ config })];
    return getEmbedConfig(confirmedRequest(PLAYER_ID, { headers, query }), ctx(PLAYER_ID));
  };

  it("país fora da allowlist devolve 403 country_not_allowed", async () => {
    const blocked = await trafficRow({ trafficEnabled: true, allowedCountries: "br" }, { "x-vercel-ip-country": "us" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "country_not_allowed" });
  });

  it("país na allowlist passa", async () => {
    const ok = await trafficRow({ trafficEnabled: true, allowedCountries: "br" }, { "x-vercel-ip-country": "br" });
    expect(ok.status).toBe(200);
  });

  it("allowedCountries 'nenhum' bloqueia todo mundo", async () => {
    const blocked = await trafficRow({ trafficEnabled: true, allowedCountries: "nenhum" }, { "x-vercel-ip-country": "br" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "country_not_allowed" });
  });

  it("device fora da allowlist devolve 403 device_not_allowed", async () => {
    const blocked = await trafficRow(
      { trafficEnabled: true, allowedDevices: ["mobile"] },
      { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    );
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "device_not_allowed" });
  });

  it("idioma fora da política devolve 403 language_not_allowed", async () => {
    const blocked = await trafficRow(
      { trafficEnabled: true, browserLanguage: "português" },
      { "accept-language": "en-US,en;q=0.9" },
    );
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "language_not_allowed" });
  });

  it("VPN bloqueada devolve 403 vpn_not_allowed", async () => {
    vpnState.blocked = true;
    const blocked = await trafficRow({ trafficEnabled: true, blockVpn: true }, { "x-real-ip": "203.0.113.10" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "vpn_not_allowed" });
  });

  it("sem trafficEnabled nenhuma regra de tráfego é aplicada", async () => {
    const ok = await trafficRow({ allowedCountries: "br" }, { "x-vercel-ip-country": "us" });
    expect(ok.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id] - limite de fluxos simultâneos                  */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] - limite de fluxos simultâneos", () => {
  const streamRow = (headers: Record<string, string>, query: Record<string, string>) => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { limitConcurrentStreams: true, maxConcurrentStreams: 1 },
    })];
    return getEmbedConfig(confirmedRequest(PLAYER_ID, { headers, query }), ctx(PLAYER_ID));
  };

  it("segunda sessão viva do mesmo viewer devolve 409 stream_limit", async () => {
    fake().state.selectRows["video_live_sessions"] = [{ count: 1 }];
    const response = await streamRow(
      { "x-vercel-ip-country": "br" },
      { viewerId: VIEWER_ID, sessionId: SESSION_ID },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stream_limit" });

    // O heartbeat da sessão atual foi gravado (upsert) antes de contar.
    const sessions = insertedValues(fake(), "video_live_sessions") as Array<Record<string, unknown>>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ videoId: VIDEO_ID, userId: OWNER, sessionId: SESSION_ID, viewerId: VIEWER_ID, countryCode: "BR" });
  });

  it("sem outras sessões vivas o play passa", async () => {
    fake().state.selectRows["video_live_sessions"] = [{ count: 0 }];
    const response = await streamRow(
      { "x-vercel-ip-country": "br" },
      { viewerId: VIEWER_ID, sessionId: SESSION_ID },
    );
    expect(response.status).toBe(200);
  });

  it("M9: rotação de viewerId não zera o teto: mesmo IP com outro viewer soma no contador (409)", async () => {
    const rotatedViewer = "ffffffff-0000-4000-8000-00000000000a";
    fake().state.selectRows["video_live_sessions"] = [{ count: 1 }];
    const response = await streamRow(
      { "x-vercel-forwarded-for": "203.0.113.9" },
      {
        viewerId: rotatedViewer,
        sessionId: OTHER_SESSION_ID,
        sessionToken: mintSession({ viewerId: rotatedViewer, sessionId: OTHER_SESSION_ID }),
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stream_limit" });
    // A linha gravada leva a chave derivada no servidor (hash de vídeo + IP),
    // nunca o viewerId declarado: trocar a identidade não cria contador novo.
    const sessions = insertedValues(fake(), "video_live_sessions") as Array<Record<string, unknown>>;
    expect(sessions[0].viewerId).toBe(streamKeyForIp(VIDEO_ID, "203.0.113.9"));
    expect(sessions[0].viewerId).not.toBe(rotatedViewer);
  });

  it("M9: a chave é por (vídeo, IP): IPs diferentes geram chaves diferentes", async () => {
    fake().state.selectRows["video_live_sessions"] = [{ count: 0 }];
    await streamRow({ "x-vercel-forwarded-for": "203.0.113.9" }, { viewerId: VIEWER_ID, sessionId: SESSION_ID });
    await streamRow(
      { "x-vercel-forwarded-for": "203.0.113.10" },
      { viewerId: VIEWER_ID, sessionId: OTHER_SESSION_ID, sessionToken: mintSession({ sessionId: OTHER_SESSION_ID }) },
    );
    const sessions = insertedValues(fake(), "video_live_sessions") as Array<Record<string, unknown>>;
    expect(sessions[0].viewerId).toBe(streamKeyForIp(VIDEO_ID, "203.0.113.9"));
    expect(sessions[1].viewerId).toBe(streamKeyForIp(VIDEO_ID, "203.0.113.10"));
    expect(sessions[0].viewerId).not.toBe(sessions[1].viewerId);
  });

  it("viewerId inválido agora é rejeitado antes: 403 session_required (a porta não abre sem sessão)", async () => {
    fake().state.selectRows["video_live_sessions"] = [{ count: 5 }];
    const response = await streamRow(
      { "x-vercel-ip-country": "br" },
      { viewerId: "não-uuid", sessionId: SESSION_ID, sessionToken: mintSession({ viewerId: VIEWER_ID }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
    expect(insertedValues(fake(), "video_live_sessions")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/embed/[id]/session - mint do sessionToken                 */
/* ------------------------------------------------------------------ */

describe("POST /api/embed/[id]/session - mint do sessionToken", () => {
  it("id não-UUID devolve 404 player_not_found (não 500)", async () => {
    const response = await postEmbedSession(
      confirmedSessionRequest("not-a-uuid", { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx("not-a-uuid"),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("sem originToken válido devolve 403 invalid_origin_token", async () => {
    const response = await postEmbedSession(
      sessionRequest(PLAYER_ID, { headers: { "user-agent": BROWSER_UA, cookie: `pp_embed=${NONCE}` }, body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin_token" });
  });

  it("originToken de outro player não vale: 403 invalid_origin_token", async () => {
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { token: mint({ playerId: OTHER_PLAYER_ID }), body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_origin_token" });
  });

  it("cookie de render ausente devolve 403 render_not_confirmed", async () => {
    const response = await postEmbedSession(
      sessionRequest(PLAYER_ID, { token: mint(), headers: { "user-agent": BROWSER_UA, origin: `https://${HOST}` }, body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "render_not_confirmed" });
  });

  it("Origin header divergente do host do token devolve 403 origin_mismatch", async () => {
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { headers: { origin: "https://evil.com" }, body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_mismatch" });
  });

  it("UA não-navegador (curl) devolve 403 browser_required, sem mint", async () => {
    const response = await postEmbedSession(
      sessionRequest(PLAYER_ID, {
        token: mint(),
        headers: { "user-agent": "curl/8.5.0", cookie: `pp_embed=${NONCE}` },
        body: { viewerId: VIEWER_ID, sessionId: SESSION_ID },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "browser_required" });
  });

  it("UA vazio devolve 403 browser_required", async () => {
    const response = await postEmbedSession(
      sessionRequest(PLAYER_ID, {
        token: mint(),
        headers: { cookie: `pp_embed=${NONCE}`, origin: `https://${HOST}` },
        body: { viewerId: VIEWER_ID, sessionId: SESSION_ID },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "browser_required" });
  });

  it("sem header Origin/Referer devolve 403 origin_required (cliente HTTP puro)", async () => {
    const response = await postEmbedSession(
      sessionRequest(PLAYER_ID, {
        token: mint(),
        headers: { "user-agent": BROWSER_UA, cookie: `pp_embed=${NONCE}` },
        body: { viewerId: VIEWER_ID, sessionId: SESSION_ID },
      }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_required" });
  });

  it("host fora da allowlist de domínios do player não minta: 403 domain_not_allowed", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ allowedDomains: ["permitido.com"] })];
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "domain_not_allowed" });
  });

  it("host dentro da allowlist de domínios minta normalmente", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ allowedDomains: [HOST] })];
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
  });

  it("viewerId/sessionId fora do formato UUID devolve 403 session_required (sem mint)", async () => {
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: "forjado-no-cliente", sessionId: "tambem-forjado" } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "session_required" });
  });

  it("origem confirmada minta sessionToken verificável (formato v1 + round-trip dos claims com host)", async () => {
    const response = await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    // Token de sessão é material assinado: nunca cacheia.
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");

    const body = (await response.json()) as { sessionToken: string };
    // Formato: v1.<base64url payload>.<hmac>.
    const parts = body.sessionToken.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");

    const claims = { playerId: PLAYER_ID, viewerId: VIEWER_ID, sessionId: SESSION_ID, nonce: NONCE, host: HOST };
    expect(verifyEmbedSessionToken(body.sessionToken, claims)).toBe(true);
    // Qualquer claim divergente rejeita: o token é intransferível entre
    // players, viewers, sessões, renders (nonce) e HOSTS (origin binding).
    expect(verifyEmbedSessionToken(body.sessionToken, { ...claims, playerId: OTHER_PLAYER_ID })).toBe(false);
    expect(verifyEmbedSessionToken(body.sessionToken, { ...claims, sessionId: OTHER_SESSION_ID })).toBe(false);
    expect(verifyEmbedSessionToken(body.sessionToken, { ...claims, viewerId: OTHER_SESSION_ID })).toBe(false);
    expect(verifyEmbedSessionToken(body.sessionToken, { ...claims, nonce: "nonce-OUTRO" })).toBe(false);
    expect(verifyEmbedSessionToken(body.sessionToken, { ...claims, host: "evil.com" })).toBe(false);
    expect(verifyEmbedSessionToken("", claims)).toBe(false);
    expect(verifyEmbedSessionToken("v1.lixo.assinatura", claims)).toBe(false);
  });

  it("mint usa rate limit de 10/min por IP (C1: apertado de 60)", async () => {
    await postEmbedSession(
      confirmedSessionRequest(PLAYER_ID, { body: { viewerId: VIEWER_ID, sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(vi.mocked(rateLimit)).toHaveBeenCalledWith(
      expect.any(Request),
      `embed-session:${PLAYER_ID}`,
      { max: 10, windowMs: 60_000 },
    );
  });

  it("sessionToken assinado mas EXPIRADO não verifica (exp é checado)", async () => {
    // Forjado com a MESMA secret (beforeAll) e TTL vencido: assinatura
    // válida, expiração vencida - a verificação precisa recusar.
    const expired = forgedSessionToken({ pid: PLAYER_ID, vid: VIEWER_ID, sid: SESSION_ID, n: NONCE, h: HOST, exp: Date.now() - 1000 });
    const claims = { playerId: PLAYER_ID, viewerId: VIEWER_ID, sessionId: SESSION_ID, nonce: NONCE, host: HOST };
    expect(verifyEmbedSessionToken(expired, claims)).toBe(false);
    // Contraste: o mint real (exp = agora + 6h) verifica.
    expect(verifyEmbedSessionToken(mintEmbedSessionToken(claims), claims)).toBe(true);
  });

  it("sessionToken sem assinatura válida não verifica (HMAC da família)", async () => {
    const claims = { playerId: PLAYER_ID, viewerId: VIEWER_ID, sessionId: SESSION_ID, nonce: NONCE, host: HOST };
    const payload = Buffer.from(JSON.stringify({ pid: PLAYER_ID, vid: VIEWER_ID, sid: SESSION_ID, n: NONCE, h: HOST, exp: Date.now() + 900_000 }), "utf8").toString("base64url");
    const wrongKey = createHmac("sha256", "secret-ERRADA").update(payload).digest("base64url");
    expect(verifyEmbedSessionToken(`v1.${payload}.${wrongKey}`, claims)).toBe(false);
    expect(verifyEmbedSessionToken(`${payload}.${wrongKey}`, claims)).toBe(false);
  });

  it("sessionToken antigo (sem claim de host) não verifica mais", async () => {
    // Compat: tokens mintados antes do origin binding não têm o claim `h` -
    // a verificação exige o host assinado, então não valem mais.
    const claims = { playerId: PLAYER_ID, viewerId: VIEWER_ID, sessionId: SESSION_ID, nonce: NONCE, host: HOST };
    const legacy = forgedSessionToken({ pid: PLAYER_ID, vid: VIEWER_ID, sid: SESSION_ID, n: NONCE, exp: Date.now() + 900_000 });
    expect(verifyEmbedSessionToken(legacy, claims)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id]/manifest - config pública cacheável              */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id]/manifest", () => {
  // O manifest é PÚBLICO por player-id: nenhum originToken/cookie é preciso -
  // a requisição abaixo é a mínima que qualquer visitante faria.
  const manifestRequest = (options: Parameters<typeof embedRequest>[1] = {}) =>
    getEmbedManifest(embedRequest(`/api/embed/${PLAYER_ID}/manifest`, options), ctx(PLAYER_ID));

  it("id não-UUID devolve 404 player_not_found (não 500)", async () => {
    const response = await getEmbedManifest(embedRequest("/api/embed/not-a-uuid/manifest"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("player não publicado devolve 404 (published=false é invisível)", async () => {
    fake().state.selectRows["player_configs"] = [];
    const response = await manifestRequest();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("titular sem acesso pago devolve 402 player_unavailable (e sem cache)", async () => {
    accessState.hasAccess = false;
    const response = await manifestRequest();
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "player_unavailable" });
    // O 402 nunca pode ser cacheado pela borda: assinatura cancelada derruba o player.
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("sem originToken nenhum devolve 200: manifest público cacheável na borda", async () => {
    const response = await manifestRequest();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["allowedDomains", "config", "id", "videoId"]);
    expect(body.id).toBe(PLAYER_ID);
    expect(body.videoId).toBe(VIDEO_ID);
    expect(typeof body.config).toBe("object");
    expect(body.allowedDomains).toEqual([]);

    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=60");
    expect(cacheControl).toContain("stale-while-revalidate=300");
    expect(response.headers.get("cache-tag")).toBe(`player:${PLAYER_ID}`);
    // O header que forçava bypass da CDN não existe mais.
    expect(response.headers.get("cloudflare-cdn-cache")).toBe(null);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("falha no lookup devolve 503 player_lookup_failed", async () => {
    fake().state.failingTables["player_configs"] = true;
    const response = await manifestRequest();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "player_lookup_failed" });
  });

  it("devolve só chaves públicas sanitizadas, sem vazar regras de tráfego", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      allowedDomains: ["site.com"],
      config: {
        ctaText: "Compre agora",
        metaPixelId: "12345",
        trafficEnabled: true,
        allowedCountries: "br",
        radius: 12,
        autoplayCoverType: "hacker",
        autoplayGifUrl: "javascript:alert(1)",
        autoplayImageUrl: "https://cdn.site/capa.png",
      },
    })];

    const response = await manifestRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    expect(response.headers.get("cache-tag")).toBe(`player:${PLAYER_ID}`);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.id).toBe(PLAYER_ID);
    expect(body.videoId).toBe(VIDEO_ID);
    expect(body.allowedDomains).toEqual(["site.com"]);

    const config = body.config as Record<string, unknown>;
    expect(config.ctaText).toBe("Compre agora");
    expect(config.radius).toBe(0);
    // Capa só https; javascript: nunca reflete no manifest.
    expect(config.autoplayCoverType).toBe("standard");
    expect(config.autoplayGifUrl).toBe("");
    expect(config.autoplayImageUrl).toBe("https://cdn.site/capa.png");
    // Chaves privadas/por-request são intencionalmente omitidas.
    expect(config).not.toHaveProperty("metaPixelId");
    expect(config).not.toHaveProperty("trafficEnabled");
    expect(config).not.toHaveProperty("allowedCountries");
  });

  it("thumbnailStart do titular vira posterUrl assinada no manifest", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { assets: { thumbnailStart: `${OWNER}/thumb.png` } },
    })];
    const response = await manifestRequest();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.posterUrl).toBe(`https://r2.signed.test/${OWNER}/thumb.png`);
    // "assets" não vaza no config sanitizado: o poster sai como campo próprio.
    expect(body.config).not.toHaveProperty("assets");
    // O manifest assina SÓ o poster - a fonte do vídeo continua exclusiva
    // do endpoint dinâmico.
    const signedKeys = vi.mocked(signR2ReadUrl).mock.calls.map(([key]) => key);
    expect(signedKeys).toEqual([`${OWNER}/thumb.png`]);
  });

  it("sem thumbnailStart o manifest não tem posterUrl (campo ausente, não vazio)", async () => {
    const response = await manifestRequest();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("posterUrl");
    expect(vi.mocked(signR2ReadUrl).mock.calls).toHaveLength(0);
  });

  it("thumbnail de outro titular não é assinado: posterUrl ausente", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { assets: { thumbnailStart: "user-outro/thumb.png" } },
    })];
    const response = await manifestRequest();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("posterUrl");
    const signedKeys = vi.mocked(signR2ReadUrl).mock.calls.map(([key]) => key);
    expect(signedKeys).not.toContain("user-outro/thumb.png");
  });

  it("falha ao assinar o poster não derruba o manifest: 200 sem posterUrl", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { assets: { thumbnailStart: `${OWNER}/thumb.png` } },
    })];
    vi.mocked(signR2ReadUrl).mockRejectedValueOnce(new Error("r2 down"));
    const response = await manifestRequest();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("posterUrl");
  });
});
