import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Item 2 do hardening pós-audit (docs/SECURITY_HARDENING_SPEC.md): o
 * GET /api/integrations nunca devolve segredo cru (token/api secret/webhook),
 * e o PUT com campo secreto vazio PRESERVA o valor salvo da instância
 * (a UI edita sem receber o token de volta). fake-db + guard/csrf/rate-limit
 * mockados no padrão de tests/pixel-verify.test.ts.
 */

const { gateState, csrfState, rateLimitState } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, ownerId: "owner-1", denyResponse: null as Response | null },
  csrfState: { blocked: null as Response | null },
  rateLimitState: { limited: null as Response | null },
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
  rateLimit: vi.fn(async () => rateLimitState.limited),
}));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { GET, PUT } from "@/app/api/integrations/route";
import { SECRET_CONFIG_KEYS, maskIntegrationConfig } from "@/lib/integrations/server";
import { PROVIDER_APPS } from "@/features/integrations/components/store-data";
import { currentFakeDb, insertedValues, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const META_TOKEN = `EAAW${"x".repeat(40)}`;
const NOVO_TOKEN = `EAAW${"y".repeat(40)}`;
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/123456789/segredo-do-canal";

const fake = (): FakeDb => currentFakeDb();

function integrationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "row-1",
    accountOwnerId: "owner-1",
    provider: "meta_pixel",
    instanceId: "default",
    name: "Principal",
    config: { pixelId: "123456789012345", accessToken: META_TOKEN },
    vslIds: [],
    enabled: true,
    updatedAt: new Date("2026-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

function request(method: string, body?: unknown): Request {
  return new Request("https://prisma.test/api/integrations", {
    method,
    headers: { origin: "https://prisma.test", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  gateState.ok = true;
  gateState.denyResponse = null;
  csrfState.blocked = null;
  rateLimitState.limited = null;
  resetFakeDb(fake());
});

describe("GET /api/integrations — segredos mascarados", () => {
  it("NUNCA contém o token cru: accessToken sai \"\" + hasToken true; não-secretos preservados", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow()];

    const response = await GET(request("GET"));
    const body = (await response.json()) as { integrations: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const item = body.integrations[0]!;
    expect((item.config as Record<string, unknown>)["accessToken"]).toBe("");
    expect(item.hasToken).toBe(true);
    expect((item.config as Record<string, unknown>)["pixelId"]).toBe("123456789012345");
    expect(JSON.stringify(body)).not.toContain(META_TOKEN);
  });

  it("webhookUrl também é segredo: sai \"\" + hasWebhookUrl true (discord)", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow({ provider: "discord", config: { webhookUrl: DISCORD_WEBHOOK } })];

    const response = await GET(request("GET"));
    const body = (await response.json()) as { integrations: Array<Record<string, unknown>> };

    const item = body.integrations[0]!;
    expect((item.config as Record<string, unknown>)["webhookUrl"]).toBe("");
    expect(item.hasWebhookUrl).toBe(true);
    expect(item.hasToken).toBe(false);
    expect(JSON.stringify(body)).not.toContain(DISCORD_WEBHOOK);
  });

  it("telegram: botToken mascarado; botName/chatId/events (não-secretos) preservados", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow({
      provider: "telegram",
      config: { botToken: "123456789:AAEbot-segredo", botName: "Bot da Prisma", chatId: "42", events: { play: true } },
    })];

    const response = await GET(request("GET"));
    const body = (await response.json()) as { integrations: Array<Record<string, unknown>> };

    const config = body.integrations[0]!.config as Record<string, unknown>;
    expect(config.botToken).toBe("");
    expect(body.integrations[0]!.hasToken).toBe(true);
    expect(config.botName).toBe("Bot da Prisma");
    expect(config.chatId).toBe("42");
    expect((config.events as Record<string, boolean>).play).toBe(true);
    expect(JSON.stringify(body)).not.toContain("AAEbot-segredo");
  });

  it("instância sem segredo preenchido → flags false e nada de valor cru", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow({ config: { pixelId: "123456789012345", accessToken: "" } })];

    const response = await GET(request("GET"));
    const body = (await response.json()) as { integrations: Array<Record<string, unknown>> };

    expect(body.integrations[0]!.hasToken).toBe(false);
    expect((body.integrations[0]!.config as Record<string, unknown>).accessToken).toBe("");
  });
});

describe("PUT /api/integrations — merge preserva segredo vazio", () => {
  it("accessToken vazio no input MANTÉM o token salvo da instância", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow()];

    const response = await PUT(request("PUT", { provider: "meta_pixel", instanceId: "default", config: { pixelId: "123456789012345", accessToken: "" }, vslIds: [] }));

    expect(response.status).toBe(200);
    const insert = insertedValues(fake(), "account_integrations").at(-1) as Record<string, unknown>;
    expect((insert.config as Record<string, unknown>).accessToken).toBe(META_TOKEN);
  });

  it("accessToken preenchido SUBSTITUI o token salvo", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow()];

    const response = await PUT(request("PUT", { provider: "meta_pixel", instanceId: "default", config: { pixelId: "123456789012345", accessToken: NOVO_TOKEN }, vslIds: [] }));

    expect(response.status).toBe(200);
    const insert = insertedValues(fake(), "account_integrations").at(-1) as Record<string, unknown>;
    expect((insert.config as Record<string, unknown>).accessToken).toBe(NOVO_TOKEN);
  });

  it("sem instância existente não há o que preservar: token vazio fica vazio", async () => {
    fake().state.selectRows["account_integrations"] = [];

    const response = await PUT(request("PUT", { provider: "meta_pixel", config: { pixelId: "123456789012345", accessToken: "" }, vslIds: [] }));

    expect(response.status).toBe(200);
    const insert = insertedValues(fake(), "account_integrations").at(-1) as Record<string, unknown>;
    expect((insert.config as Record<string, unknown>).accessToken).toBe("");
  });

  it("webhookUrl vazio no input preserva a URL salva (discord)", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow({ provider: "discord", config: { webhookUrl: DISCORD_WEBHOOK } })];

    const response = await PUT(request("PUT", { provider: "discord", instanceId: "default", config: { webhookUrl: "" }, vslIds: [] }));

    expect(response.status).toBe(200);
    const insert = insertedValues(fake(), "account_integrations").at(-1) as Record<string, unknown>;
    expect((insert.config as Record<string, unknown>).webhookUrl).toBe(DISCORD_WEBHOOK);
  });

  it("metadados de verificação (reenviados pela UI, não-secretos) passam junto ao merge de segredos", async () => {
    fake().state.selectRows["account_integrations"] = [integrationRow({
      config: { pixelId: "123456789012345", accessToken: META_TOKEN, lastVerifiedAt: "2026-10-01T10:00:00Z", lastVerifyOk: true },
    })];

    // O que a UI manda: config mascarada (token "") + verifyMeta que ela
    // guardou do GET (lastVerifiedAt/lastVerifyOk não são secretos).
    await PUT(request("PUT", {
      provider: "meta_pixel",
      instanceId: "default",
      config: { pixelId: "123456789012345", accessToken: "", lastVerifiedAt: "2026-10-01T10:00:00Z", lastVerifyOk: true },
      vslIds: [],
    }));

    const insert = insertedValues(fake(), "account_integrations").at(-1) as Record<string, unknown>;
    const config = insert.config as Record<string, unknown>;
    expect(config.lastVerifiedAt).toBe("2026-10-01T10:00:00Z");
    expect(config.lastVerifyOk).toBe(true);
    expect(config.accessToken).toBe(META_TOKEN);
  });
});

describe("consistência SECRET_CONFIG_KEYS (servidor) ↔ store-data (UI)", () => {
  it("campo marcado secret na UI está na lista de segredos do provider no servidor", () => {
    for (const app of PROVIDER_APPS) {
      if (app.kind !== "provider") continue;
      const serverSecrets = new Set(SECRET_CONFIG_KEYS[app.provider]);
      for (const field of app.fields) {
        if (field.secret) expect(serverSecrets.has(field.key), `${app.provider}.${field.key}`).toBe(true);
      }
    }
  });

  it("segredo do servidor que aparece como campo na UI está marcado secret na UI", () => {
    for (const app of PROVIDER_APPS) {
      if (app.kind !== "provider") continue;
      const uiSecrets = new Map(app.fields.map((field) => [field.key, field.secret === true]));
      for (const key of SECRET_CONFIG_KEYS[app.provider]) {
        if (uiSecrets.has(key)) expect(uiSecrets.get(key), `${app.provider}.${key}`).toBe(true);
      }
    }
  });

  it("máscara unitária: valor cru vira \"\" e flags nascem só quando preenchido", () => {
    const masked = maskIntegrationConfig("telegram", { botToken: "123456789:AAEx", webhookUrl: "", botName: "N" });
    expect(masked.config.botToken).toBe("");
    expect(masked.hasToken).toBe(true);
    expect(masked.hasWebhookUrl).toBe(false);
  });
});
