import { afterEach, describe, expect, it, vi } from "vitest";
import { envInt } from "@/lib/config/env";

describe("envInt", () => {
  afterEach(() => {
    delete process.env.TEST_WINDOW_MS;
    vi.restoreAllMocks();
  });

  it("usa o padrão quando a variável não está definida", () => {
    expect(envInt("TEST_WINDOW_MS", 60_000)).toBe(60_000);
  });

  it("lê um valor numérico normal", () => {
    process.env.TEST_WINDOW_MS = "30000";
    expect(envInt("TEST_WINDOW_MS", 60_000)).toBe(30_000);
  });

  // Regressão do bug que reduzia a janela do rate limit dos embeds de 60s para
  // 1s: `Number("60_000")` é NaN, e o NaN chegava até o Postgres como null.
  it("aceita o separador de milhar que o .env.example antigo sugeria", () => {
    process.env.TEST_WINDOW_MS = "60_000";
    expect(envInt("TEST_WINDOW_MS", 1000)).toBe(60_000);
  });

  it("cai no padrão quando o valor não é um número utilizável", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const value of ["abc", "0", "-5", "NaN"]) {
      process.env.TEST_WINDOW_MS = value;
      expect(envInt("TEST_WINDOW_MS", 60_000)).toBe(60_000);
    }
  });

  it("nunca devolve NaN", () => {
    process.env.TEST_WINDOW_MS = "not-a-number";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(Number.isFinite(envInt("TEST_WINDOW_MS", 60_000))).toBe(true);
  });
});
