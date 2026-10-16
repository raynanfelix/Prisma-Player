import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  hashRateLimitIdentifier: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("@/lib/security/auth-events", () => ({
  recordAuthFailure: vi.fn(async () => undefined),
}));

const { signUpResult } = vi.hoisted(() => ({
  signUpResult: {
    data: {
      user: { id: "user-1", email: "a@b.c", name: "A", emailVerified: false },
      // Token só existe quando o Managed emite sessão imediata (sem
      // verificação de e-mail obrigatória no branch).
      token: "SECRET-SESSION-TOKEN" as string | null,
    },
    error: null as null | { code?: string; message?: string },
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getAuth: vi.fn(() => ({
    signUp: {
      email: vi.fn(async () => signUpResult),
    },
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
    signUpResult.error = null;
    signUpResult.data.token = "SECRET-SESSION-TOKEN";
  });

  it("responde só { user, hasSession }, sem tokens", async () => {
    const response = await POST(post({ name: "A", email: "a@b.c", password: "segredo123" }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("SECRET-SESSION-TOKEN");
    expect(JSON.parse(text)).toMatchObject({ user: { id: "user-1" }, hasSession: true });
  });

  it("sem sessão imediata (e-mail pendente de verificação): hasSession false", async () => {
    signUpResult.data.token = null;
    const response = await POST(post({ name: "A", email: "a@b.c", password: "segredo123" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toMatchObject({ user: { id: "user-1" }, hasSession: false });
  });
});
