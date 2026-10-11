import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  hashRateLimitIdentifier: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("@/lib/security/auth-events", () => ({
  recordAuthFailure: vi.fn(async () => undefined),
}));

const { signupResult } = vi.hoisted(() => ({
  signupResult: {
    data: {
      user: { id: "user-1", email: "a@b.c" },
      session: { access_token: "SECRET-ACCESS", refresh_token: "SECRET-REFRESH", user: { id: "user-1" } },
    },
    error: null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp: vi.fn(async () => signupResult) },
  })),
}));

import { POST } from "@/app/api/auth/signup/route";

function post(body: unknown, origin = "https://prisma.test") {
  return new Request("https://prisma.test/api/auth/signup", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("signup não expõe sessão (AUTH-02/A11)", () => {
  beforeEach(() => {
    signupResult.error = null;
  });

  it("responde só { user, hasSession }, sem tokens", async () => {
    const response = await POST(post({ name: "A", email: "a@b.c", password: "segredo123" }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("SECRET-ACCESS");
    expect(text).not.toContain("SECRET-REFRESH");
    expect(JSON.parse(text)).toMatchObject({ user: { id: "user-1" }, hasSession: true });
  });
});
