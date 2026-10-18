import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Estado compartilhado com as factories de mock (hoisted: as factories rodam
// antes dos imports do módulo sob teste).
const { gateState, csrfState, rateLimitState, rateLimitCalls } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, ownerId: "owner-1", denyResponse: null as Response | null },
  csrfState: { blocked: null as Response | null },
  rateLimitState: { limited: null as Response | null },
  rateLimitCalls: [] as Array<{ scope: string; options: Record<string, unknown> }>,
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) {
      gateState.denyResponse = gateState.denyResponse ?? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return { ok: false, response: gateState.denyResponse };
    }
    return { ok: true, userId: "user-session", account: { accountOwnerId: gateState.ownerId } };
  }),
}));

vi.mock("@/lib/security/csrf", () => ({
  csrfGuard: vi.fn(() => csrfState.blocked),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async (request: Request, scope: string, options: Record<string, unknown>) => {
    void request;
    rateLimitCalls.push({ scope, options });
    return rateLimitState.limited;
  }),
}));

import { guard } from "@/lib/api/guard";
import { POST } from "@/app/api/integrations/verify/route";
import { verifyGoogle, verifyMeta, verifyTikTok } from "@/lib/integrations/verify-pixels";

const META_TOKEN = `EAAW${"x".repeat(40)}`;
const TIKTOK_TOKEN = `${"t".repeat(52)}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://prisma.test/api/integrations/verify", {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Chamada capturada do fetch: [url, init] — init existe em runtime mesmo em mocks sem parâmetros. */
function callOf(mock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  return mock.mock.calls[index] as [string, RequestInit];
}

beforeEach(() => {
  vi.clearAllMocks();
  gateState.ok = true;
  gateState.denyResponse = null;
  csrfState.blocked = null;
  rateLimitState.limited = null;
  rateLimitCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// verifyMeta — GET /{pixel_id} + POST /events
// ---------------------------------------------------------------------------

describe("verifyMeta", () => {
  it("confirma o pixel e o evento de teste recebido (events_received)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/events") ? jsonResponse({ events_received: 1, messages: [] }) : jsonResponse({ id: "123456789012345", name: "Pixel Principal" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyMeta({ pixelId: "123456789012345", accessToken: META_TOKEN, testEventCode: "TEST123" });

    expect(result.ok).toBe(true);
    expect(result.platform).toBe("meta");
    expect(result.message).toContain("recebeu 1 evento");
    expect(result.detail).toBe("events_received: 1");
    expect(Number.isNaN(Date.parse(result.receivedAt))).toBe(false);

    // GET de existência antes do POST, com o pixel na URL e sem cache.
    expect(callOf(fetchMock, 0)[0]).toContain("graph.facebook.com/");
    expect(callOf(fetchMock, 0)[0]).toContain("123456789012345");
    expect(callOf(fetchMock, 0)[1].cache).toBe("no-store");

    const eventBody = JSON.parse(callOf(fetchMock, 1)[1].body as string) as Record<string, unknown>;
    expect(eventBody["test_event_code"]).toBe("TEST123");
    expect((eventBody["data"] as Array<Record<string, unknown>>)[0]["event_name"]).toBe("PrismaVerifyTest");
    expect(callOf(fetchMock, 1)[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("pixel inexistente → falha honesta com o motivo real no detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "Unsupported get request. Object with ID '999' does not exist" } }, 400)));

    const result = await verifyMeta({ pixelId: "999", accessToken: META_TOKEN });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Pixel não encontrado");
    expect(result.detail).toContain("does not exist");
  });

  it("token inválido → mensagem honesta e token NUNCA vaza no detail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: `Error validating access token. Session expired (${META_TOKEN})` } }, 400)));

    const result = await verifyMeta({ pixelId: "123456789012345", accessToken: META_TOKEN });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Access Token inválido");
    expect(result.detail).toContain("***");
    expect(result.detail).not.toContain(META_TOKEN);
  });

  it("timeout/rede → mensagem honesta de 8s", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("aborted");
    }));

    const result = await verifyMeta({ pixelId: "123456789012345", accessToken: META_TOKEN });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("8s");
  });

  it("sem campos mínimos → orientação em vez de chamada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyMeta({ pixelId: "123456789012345" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Preencha");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// verifyGoogle — debug/mp/collect + resposta honesta para AW-
// ---------------------------------------------------------------------------

describe("verifyGoogle", () => {
  it("AW- (sem G-) → resposta honesta de formato, sem chamar a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogle({ tagId: "AW-123456789" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("até 3h");
    expect(result.detail).toContain("AW-123456789");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("G- sem API Secret → orientação honesta de onde pegar o secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogle({ tagId: "G-ABC123DEF" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("API Secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("G- + secret válido → payload validado pelo endpoint debug", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ validationResponse: { validationMessages: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogle({ tagId: "G-ABC123DEF", apiSecret: "rJKGyefLdFSasdfgQ123456" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("validado");
    const [url, init] = callOf(fetchMock, 0);
    expect(url).toContain("google-analytics.com/debug/mp/collect");
    expect(url).toContain("measurement_id=G-ABC123DEF");
    expect(url).toContain("api_secret=rJKGyefLdFSasdfgQ123456");
    expect(init.cache).toBe("no-store");
  });

  it("G- com credenciais erradas (validação vazia) → falha honesta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));

    const result = await verifyGoogle({ tagId: "G-ABC123DEF", apiSecret: "wrong-secret-1234567890ab" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("confira o ID G- e o API Secret");
  });

  it("G- com mensagens de validação → mostra o motivo REAL do GA4", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ validationResponse: { validationMessages: [{ description: "Param value is out of range for value" }] } })));

    const result = await verifyGoogle({ tagId: "G-ABC123DEF", apiSecret: "rJKGyefLdFSasdfgQ123456" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Param value is out of range");
  });

  it("formato inválido → rejeita sem chamar a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogle({ tagId: "XX-nada" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("inválido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// verifyTikTok — open_api/v1.3/event/track
// ---------------------------------------------------------------------------

describe("verifyTikTok", () => {
  it("code 0 → evento de teste recebido, com Access-Token no header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: 0, message: "success" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTikTok({ pixelId: "CXXXXXXXXXXXXXXXXX", accessToken: TIKTOK_TOKEN, testEventCode: "TEST123" });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("recebido");
    const [url, init] = callOf(fetchMock, 0);
    expect(url).toContain("business-api.tiktok.com/open_api/v1.3/event/track/");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe(TIKTOK_TOKEN);
    expect(init.cache).toBe("no-store");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["event_source"]).toBe("web");
    expect((body["data"] as Array<Record<string, unknown>>)[0]["test_event_code"]).toBe("TEST123");
  });

  it("code != 0 → mostra o motivo REAL da plataforma", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ code: 40105, message: "certification not approved" })));

    const result = await verifyTikTok({ pixelId: "CXXXXXXXXXXXXXXXXX", accessToken: TIKTOK_TOKEN });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("TikTok recusou: certification not approved");
    expect(result.detail).not.toContain(TIKTOK_TOKEN);
  });

  it("sem campos mínimos → orientação de onde pegar o token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTikTok({ pixelId: "CXXXXXXXXXXXXXXXXX" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Manage API access");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/integrations/verify — rota
// ---------------------------------------------------------------------------

describe("POST /api/integrations/verify", () => {
  it("fluxo completo: resposta padronizada, no-store e rate limit 10/min fail-closed por dono", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/events") ? jsonResponse({ events_received: 1, messages: [] }) : jsonResponse({ id: "123456789012345", name: "Pixel" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ provider: "meta_pixel", instanceId: "i-abc", config: { pixelId: "123456789012345", accessToken: META_TOKEN } });
    const body = (await response.json()) as { ok: boolean; platform: string; message: string; detail: string; receivedAt: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.ok).toBe(true);
    expect(body.platform).toBe("meta");
    expect(body.message).toContain("recebeu 1 evento");
    expect(body.detail).toBe("events_received: 1");
    expect(Number.isNaN(Date.parse(body.receivedAt))).toBe(false);
    expect(rateLimitCalls).toEqual([
      { scope: "integrations-verify:owner-1", options: { max: 10, windowMs: 60_000, failClosed: true } },
    ]);
  });

  it("provider fora de meta_pixel/google_ads/tiktok → 400 sem chamar a plataforma", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ provider: "discord", config: { webhookUrl: "https://discord.com/api/webhooks/x" } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_provider" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("config ausente/inválida → 400 invalid_config", async () => {
    const response = await post({ provider: "meta_pixel", config: "não-objeto" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_config" });
  });

  it("rate limit excedido → 429 repassado (fail-closed)", async () => {
    rateLimitState.limited = jsonResponse({ error: "rate_limited", retryAfterSeconds: 42 }, 429);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await post({ provider: "google_ads", config: { tagId: "AW-123456789" } });

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CSRF bloqueado → repassa a resposta sem tocar no guard", async () => {
    csrfState.blocked = jsonResponse({ error: "csrf_blocked" }, 403);

    const response = await post({ provider: "meta_pixel", config: {} });

    expect(response.status).toBe(403);
    expect(vi.mocked(guard)).not.toHaveBeenCalled();
  });

  it("sem sessão → 401 do guard", async () => {
    gateState.ok = false;

    const response = await post({ provider: "meta_pixel", config: {} });

    expect(response.status).toBe(401);
  });
});
