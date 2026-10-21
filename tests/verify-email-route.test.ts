import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  hashRateLimitIdentifier: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("@/lib/security/csrf", () => ({
  csrfGuard: vi.fn(() => null),
}));

const { verifyState } = vi.hoisted(() => ({
  /** Estado do getAuth() mockado - respostas de verifyEmail/sendVerificationEmail. */
  verifyState: {
    verifyEmailResult: {
      data: { status: true, session: { id: "session-1" } } as unknown,
      error: null as null | { message?: string; code?: string },
    },
    sendVerificationEmailResult: {
      data: null as unknown,
      error: null as null | { message?: string; code?: string },
    },
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getAuth: vi.fn(() => ({
    emailOtp: {
      verifyEmail: vi.fn(async () => verifyState.verifyEmailResult),
    },
    sendVerificationEmail: vi.fn(async () => verifyState.sendVerificationEmailResult),
  })),
}));

import { POST } from "@/app/api/auth/verify-email/route";

function post(body: unknown, origin = "https://prisma.test"): Promise<Response> {
  return POST(
    new Request("https://prisma.test/api/auth/verify-email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  verifyState.verifyEmailResult = { data: { status: true, session: { id: "session-1" } }, error: null };
  verifyState.sendVerificationEmailResult = { data: null, error: null };
  vi.clearAllMocks();
});

describe("POST /api/auth/verify-email - código", () => {
  it("código válido com sessão (auto-sign-in) → 200 { verified, hasSession }", async () => {
    const response = await post({ email: "novo@exemplo.com", otp: "123456" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true, hasSession: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("código válido sem sessão → 200 { verified: true } apenas", async () => {
    verifyState.verifyEmailResult = { data: { status: true }, error: null };
    const response = await post({ email: "novo@exemplo.com", otp: "123456" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: true });
  });

  it("erro do Better Auth (OTP inválido) → 400 com mensagem em pt-BR", async () => {
    verifyState.verifyEmailResult = { data: null, error: { code: "INVALID_OTP", message: "Invalid OTP" } };
    const response = await post({ email: "novo@exemplo.com", otp: "999999" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("verify_failed");
    expect(body.message).toBe("Código inválido ou expirado. Solicite um novo código.");
  });

  it("otp fora do formato (não numera/curto) → 400 sem chamar o Auth", async () => {
    const response = await post({ email: "novo@exemplo.com", otp: "12ab" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_otp_format" });
  });

  it("e-mail inválido → 400 invalid_email", async () => {
    const response = await post({ email: "não-é-e-mail", otp: "123456" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_email" });
  });

  it("rate limit usa balde por e-mail com hash (não persiste PII)", async () => {
    const { hashRateLimitIdentifier } = await import("@/lib/security/rate-limit");
    await post({ email: "novo@exemplo.com", otp: "123456" });
    expect(hashRateLimitIdentifier).toHaveBeenCalledWith("novo@exemplo.com");
  });
});

describe("POST /api/auth/verify-email - reenvio", () => {
  it("{ resend: true } → 200 genérico { ok: true }", async () => {
    const response = await post({ email: "novo@exemplo.com", resend: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("resposta é SEMPRE genérica: erro do Auth (e-mail sem conta) não vaza existência", async () => {
    verifyState.sendVerificationEmailResult = { data: null, error: { code: "USER_NOT_FOUND", message: "user not found" } };
    const response = await post({ email: "ninguem@exemplo.com", resend: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
