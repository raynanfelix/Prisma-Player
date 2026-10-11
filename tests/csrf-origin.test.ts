import { describe, expect, it } from "vitest";
import { csrfGuard, validateOrigin } from "@/lib/security/csrf";

function req(method: string, headers: Record<string, string> = {}) {
  return new Request("https://prisma.test/api/x", { method, headers });
}

describe("csrf: política de origem", () => {
  it("aceita Origin própria", () => {
    expect(validateOrigin(req("POST", { origin: "https://prisma.test" }))).toBe(true);
  });

  it("aceita Referer próprio sem Origin (fallback documentado)", () => {
    expect(validateOrigin(req("POST", { referer: "https://prisma.test/dashboard" }))).toBe(true);
  });

  it("rejeita origem estranha", () => {
    expect(validateOrigin(req("POST", { origin: "https://atacante.com" }))).toBe(false);
    expect(validateOrigin(req("POST", { referer: "https://atacante.com/x" }))).toBe(false);
  });

  it("rejeita sem Origin e sem Referer em mutação", () => {
    const blocked = csrfGuard(req("POST"));
    expect(blocked?.status).toBe(403);
  });

  it("isenta GET/HEAD/OPTIONS", () => {
    expect(csrfGuard(req("GET"))).toBeNull();
    expect(csrfGuard(req("HEAD"))).toBeNull();
    expect(csrfGuard(req("OPTIONS"))).toBeNull();
  });
});
