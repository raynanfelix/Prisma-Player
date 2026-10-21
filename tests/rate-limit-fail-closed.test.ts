import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { currentFakeDb, resetFakeDb, type FakeDb } from "./helpers/fake-db";

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
    const result = await consumeRateLimit(request, "rate-limit-fail-closed:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited", retryAfterSeconds: expect.any(Number) });
  });

  it("abre (limit ok) quando o store cai e failClosed é falso", async () => {
    setRateLimitMode(fake(), "down");
    const result = await consumeRateLimit(request, "rate-limit-fail-closed:test", { max: 60, windowMs: 60_000, failClosed: false });
    expect(result.limited).toBe(false);
  });

  it("limita acima do max com X-RateLimit e Retry-After", async () => {
    setRateLimitMode(fake(), "over");
    const result = await consumeRateLimit(request, "rate-limit-fail-closed:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("deixa passar quando a contagem está abaixo do max", async () => {
    const result = await consumeRateLimit(request, "rate-limit-fail-closed:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(false);
  });
});

describe("429 com headers RFC de rate limit (spec Agentic v2, item 2)", () => {
  const request = new Request("https://prisma.example/it/rate");
  const fake = () => currentFakeDb();

  beforeEach(() => {
    setRateLimitMode(fake(), "ok");
  });
  afterEach(() => {
    setRateLimitMode(fake(), "ok");
  });

  it("429 carrega RateLimit-Limit, Remaining 0, Reset e Retry-After coerentes", async () => {
    setRateLimitMode(fake(), "over");
    const before = Date.now();
    const result = await consumeRateLimit(request, "rate-limit-headers:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.status).toBe(429);

    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");

    const reset = Number(response.headers.get("RateLimit-Reset"));
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(Number.isFinite(reset)).toBe(true);
    expect(reset).toBeGreaterThanOrEqual(Math.floor(before / 1000) + 59);
    expect(reset).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 61);
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(response.headers.get("RateLimit-Policy")).toContain("60;w=");
  });

  it("429 preserva os headers X-RateLimit legados junto dos RFC", async () => {
    setRateLimitMode(fake(), "over");
    const result = await consumeRateLimit(request, "rate-limit-headers:test", { max: 60, windowMs: 60_000, failClosed: true });
    const response = (result as { response: Response }).response;
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe(response.headers.get("RateLimit-Reset"));
  });

  it("429 do fail-closed quando o store cai também traz o conjunto completo", async () => {
    setRateLimitMode(fake(), "down");
    const result = await consumeRateLimit(request, "rate-limit-headers:test", { max: 60, windowMs: 60_000, failClosed: true });
    expect(result.limited).toBe(true);
    const response = (result as { response: Response }).response;
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("RateLimit-Reset")).toBeTruthy();
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
