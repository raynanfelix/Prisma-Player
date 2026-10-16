import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { shouldRequireHmac } from "@/lib/billing/abacatepay/webhook";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { POST } from "@/app/api/webhooks/abacatepay/route";
import { currentFakeDb, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const SECRET = "test-webhook-secret";
// RH-02: a chave HMAC é sempre distinta do secret que viaja na URL.
const SIGNING_SECRET = "test-hmac-signing-secret";

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

function futureWindow(): Date {
  return new Date(Date.now() + 60_000);
}

function setRateLimitMode(fake: FakeDb, mode: "ok" | "over" | "down"): void {
  resetFakeDb(fake);
  if (mode === "down") {
    fake.state.failingTables["rate_limits"] = true;
    return;
  }
  fake.state.insertResults["rate_limits"] = [
    { hitCount: mode === "over" ? 61 : 1, windowExpiresAt: futureWindow() },
  ];
}

function post(
  body: string,
  options: { secret?: string; signature?: string; header?: string } = {},
): Promise<Response> {
  const url = new URL("https://prisma.example/api/webhooks/abacatepay");
  if (options.secret) url.searchParams.set("webhookSecret", options.secret);
  const headers = new Headers();
  if (options.signature) headers.set(options.header ?? "x-webhook-signature", options.signature);
  return POST(new Request(url, { method: "POST", headers, body }));
}

function hmacHex(value: string): string {
  return createHmac("sha256", SIGNING_SECRET).update(Buffer.from(value, "utf8")).digest("hex");
}

// Payload cujo evento não está na allowlist: a rota responde 200 {ok,ignored}
// logo após a autenticação, antes de tocar no banco.
const UNSUPPORTED = JSON.stringify({ event: "checkout.created", data: { id: "px_test" } });

describe("shouldRequireHmac", () => {
  afterEach(() => {
    delete process.env.ABACATEPAY_REQUIRE_HMAC;
  });

  it("returns false when the env var is not set (default keeps OR)", () => {
    delete process.env.ABACATEPAY_REQUIRE_HMAC;
    expect(shouldRequireHmac()).toBe(false);
  });

  it("returns true when ABACATEPAY_REQUIRE_HMAC is exactly true", () => {
    process.env.ABACATEPAY_REQUIRE_HMAC = "true";
    expect(shouldRequireHmac()).toBe(true);
  });

  it("returns false for any value other than exactly true", () => {
    for (const value of ["false", "TRUE", "true ", "1", "yes", "on"]) {
      process.env.ABACATEPAY_REQUIRE_HMAC = value;
      expect(shouldRequireHmac()).toBe(false);
    }
  });
});

describe("consumeRateLimit fail-closed (store indisponível)", () => {
  const request = new Request("https://prisma.example/it/rate");
  const fake = () => currentFakeDb();

  beforeEach(() => {
    setRateLimitMode(fake(), "ok");
  });
  afterEach(() => {
    setRateLimitMode(fake(), "ok");
  });

  it("fecha a porta (429) com failClosed verdadeiro quando o store cai", async () => {
    setRateLimitMode(fake(), "down");
    const result = await consumeRateLimit(request, "webhook:abacatepay:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
  });

  it("abre (limit ok) quando o store cai e failClosed é falso", async () => {
    setRateLimitMode(fake(), "down");
    const result = await consumeRateLimit(request, "webhook:abacatepay:test", { max: 60, windowMs: 60_000, failClosed: false });
    expect(result.limited).toBe(false);
  });

  it("limita acima do max com X-RateLimit e Retry-After", async () => {
    setRateLimitMode(fake(), "over");
    const result = await consumeRateLimit(request, "webhook:abacatepay:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("deixa passar quando a contagem está abaixo do max", async () => {
    const result = await consumeRateLimit(request, "webhook:abacatepay:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(false);
  });
});

describe("rota do webhook AbacatePay — autenticação", () => {
  beforeEach(() => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
    // RH-02: a verificação HMAC exige uma chave de assinatura distinta do secret
    // da URL (que o provedor anexa a cada entrega e aparece em logs de acesso).
    process.env.ABACATEPAY_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;
    // O fallback legado (?webhookSecret= na URL) agora e rejeitado por padrao
    // (ABACATEPAY_ALLOW_URL_SECRET=false). Este bloco testa o fluxo legado, entao
    // opta explicitamente pelo fallback.
    process.env.ABACATEPAY_ALLOW_URL_SECRET = "true";
    delete process.env.ABACATEPAY_REQUIRE_HMAC;
    setRateLimitMode(currentFakeDb(), "ok");
  });
  afterEach(() => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    delete process.env.ABACATEPAY_ALLOW_URL_SECRET;
    delete process.env.ABACATEPAY_REQUIRE_HMAC;
    delete process.env.ABACATEPAY_WEBHOOK_SIGNING_SECRET;
    setRateLimitMode(currentFakeDb(), "ok");
  });

  it("aceita o secret da URL sozinho quando HMAC não é exigido (padrão mantém OR)", async () => {
    const response = await post(UNSUPPORTED, { secret: SECRET });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });

  it("aceita a assinatura HMAC sem secret na URL quando HMAC não é exigido", async () => {
    const response = await post(UNSUPPORTED, { signature: hmacHex(UNSUPPORTED) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });

  it("rejeita quando nem secret nem assinatura são válidos", async () => {
    const response = await post(UNSUPPORTED);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook_signature" });
  });

  it("rejeita secret errado sem assinatura", async () => {
    const response = await post(UNSUPPORTED, { secret: "wrong-secret" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook_signature" });
  });

  it("exige HMAC quando ABACATEPAY_REQUIRE_HMAC=true mesmo com secret de URL válido", async () => {
    process.env.ABACATEPAY_REQUIRE_HMAC = "true";
    const response = await post(UNSUPPORTED, { secret: SECRET });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook_signature" });
  });

  it("aceita a assinatura HMAC quando ABACATEPAY_REQUIRE_HMAC=true", async () => {
    process.env.ABACATEPAY_REQUIRE_HMAC = "true";
    const response = await post(UNSUPPORTED, { signature: hmacHex(UNSUPPORTED) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
  });

  it("rejeita assinatura adulterada mesmo com secret de URL válido quando HMAC é exigido", async () => {
    process.env.ABACATEPAY_REQUIRE_HMAC = "true";
    const response = await post(UNSUPPORTED, { secret: SECRET, signature: hmacHex("corpo diferente") });
    expect(response.status).toBe(401);
  });
});

describe("rota do webhook AbacatePay — rate limit", () => {
  beforeEach(() => {
    process.env.ABACATEPAY_WEBHOOK_SECRET = SECRET;
    setRateLimitMode(currentFakeDb(), "ok");
  });
  afterEach(() => {
    delete process.env.ABACATEPAY_WEBHOOK_SECRET;
    setRateLimitMode(currentFakeDb(), "ok");
  });

  it("retorna 429 quando a janela de rate limit é excedida", async () => {
    setRateLimitMode(currentFakeDb(), "over");
    const response = await post(UNSUPPORTED, { secret: SECRET });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
  });

  it("retorna 429 fail-closed quando o store de rate limit fica indisponível", async () => {
    setRateLimitMode(currentFakeDb(), "down");
    const response = await post(UNSUPPORTED, { secret: SECRET });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
  });
});
