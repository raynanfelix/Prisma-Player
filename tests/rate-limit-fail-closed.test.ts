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
