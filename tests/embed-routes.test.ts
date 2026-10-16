import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createEmbedOriginToken, verifyEmbedEventTokenContext } from "@/lib/security/embed-origin";
import { resetAccessCacheForTests } from "@/lib/access/access-cache";
import { signR2ReadUrl } from "@/lib/storage/r2";
import { GET as getEmbedConfig } from "@/app/api/embed/[id]/route";
import { GET as getEmbedManifest } from "@/app/api/embed/[id]/manifest/route";

const OWNER = "user-owner";
const PLAYER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PLAYER_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const VIDEO_ID = "cccccccc-0000-4000-8000-000000000003";
const SESSION_ID = "dddddddd-0000-4000-8000-000000000004";
const VIEWER_ID = "eeeeeeee-0000-4000-8000-000000000005";
const NONCE = "nonce-abc";
const HOST = "site.com";

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

/** Request válido de render confirmado (token + cookie do nonce). */
function confirmedRequest(id: string, options: Parameters<typeof embedRequest>[1] = {}) {
  return embedRequest(`/api/embed/${id}`, {
    ...options,
    token: options.token ?? mint(),
    headers: { cookie: `pp_embed=${NONCE}`, ...(options.headers ?? {}) },
  });
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
/* GET /api/embed/[id] — entrega da config do player                    */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id] — acesso e publicação", () => {
  it("id não-UUID devolve 404 player_not_found (não 500), antes de qualquer IO", async () => {
    const response = await getEmbedConfig(embedRequest("/api/embed/not-a-uuid"), ctx("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "player_not_found" });
  });

  it("player inexistente ou não publicado devolve 404 (a query filtra published=true)", async () => {
    // published=false: o banco (com o filtro da rota) não devolve linha —
    // não publicado e inexistente são indistinguíveis de fora (404).
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

describe("GET /api/embed/[id] — token de origem e prova de render (RM-02)", () => {
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

describe("GET /api/embed/[id] — entrega", () => {
  it("devolve o contrato completo com URL assinada e eventToken amarrado ao render", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({ config: { radius: 12 } })];
    const response = await getEmbedConfig(
      confirmedRequest(PLAYER_ID, { query: { sessionId: SESSION_ID } }),
      ctx(PLAYER_ID),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["config", "eventToken", "id", "source", "title", "type", "videoId"]);
    expect(body.id).toBe(PLAYER_ID);
    expect(body.videoId).toBe(VIDEO_ID);
    expect(body.title).toBe("VSL Principal");
    expect(body.source).toBe(`https://r2.signed.test/${OWNER}/vsl.mp4`);
    expect(body.type).toBe("video/mp4");
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

  it("só assina assets do próprio dono: alheio é descartado antes de assinar", async () => {
    fake().state.selectRows["player_configs"] = [playerConfigRow({
      config: { assets: { thumbnailStart: `${OWNER}/thumb.png`, thumbnailPause: "user-outro/x.png" } },
    })];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { config: { assets: Record<string, string>; assetUrls: Record<string, string> } };
    expect(body.config.assets).toEqual({ thumbnailStart: `${OWNER}/thumb.png` });
    expect(body.config.assetUrls).toEqual({ thumbnailStart: `https://r2.signed.test/${OWNER}/thumb.png` });
    const signedKeys = vi.mocked(signR2ReadUrl).mock.calls.map(([key]) => key);
    expect(signedKeys).not.toContain("user-outro/x.png");
  });

  it("vídeo não-ready (ou inexistente) devolve 404 video_not_found", async () => {
    fake().state.selectRows["videos"] = [];
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
  });

  it("falha ao assinar a fonte devolve 503 source_unavailable", async () => {
    vi.mocked(signR2ReadUrl).mockRejectedValueOnce(new Error("r2 down"));
    const response = await getEmbedConfig(confirmedRequest(PLAYER_ID), ctx(PLAYER_ID));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "source_unavailable" });
  });
});

describe("GET /api/embed/[id] — regras de tráfego do config", () => {
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

describe("GET /api/embed/[id] — limite de fluxos simultâneos", () => {
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

  it("viewerId inválido não conta fluxos (limite desativado na prática)", async () => {
    fake().state.selectRows["video_live_sessions"] = [{ count: 5 }];
    const response = await streamRow(
      { "x-vercel-ip-country": "br" },
      { viewerId: "não-uuid", sessionId: SESSION_ID },
    );
    expect(response.status).toBe(200);
    expect(insertedValues(fake(), "video_live_sessions")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/embed/[id]/manifest — config pública cacheável              */
/* ------------------------------------------------------------------ */

describe("GET /api/embed/[id]/manifest", () => {
  // O manifest é PÚBLICO por player-id: nenhum originToken/cookie é preciso —
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
});
