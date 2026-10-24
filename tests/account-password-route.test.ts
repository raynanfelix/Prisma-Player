import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/security/csrf", () => ({
  csrfGuard: vi.fn(() => null),
}));

vi.mock("@/lib/security/auth-events", () => ({
  recordSecurityEvent: vi.fn(async () => undefined),
}));

const { authState, authMocks } = vi.hoisted(() => {
  /** Estado do getAuth() mockado - sessão e respostas dos métodos de OTP/senha. */
  const authState = {
    sessionResult: {
      data: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "user@exemplo.com" },
      } as unknown,
    },
    sendVerificationOtpResult: {
      data: { status: true } as unknown,
      error: null as null | { message?: string; code?: string },
    },
    signInEmailOtpResult: {
      data: { session: { id: "session-2" } } as unknown,
      error: null as null | { message?: string; code?: string },
    },
    changePasswordResult: {
      data: { status: true } as unknown,
      error: null as null | { message?: string; code?: string },
    },
  };
  /** Spies estáveis compartilhados entre a rota e os testes. */
  const authMocks = {
    getSession: vi.fn(async () => authState.sessionResult),
    sendVerificationOtp: vi.fn(async () => authState.sendVerificationOtpResult),
    signInEmailOtp: vi.fn(async () => authState.signInEmailOtpResult),
    changePassword: vi.fn(async () => authState.changePasswordResult),
    signOut: vi.fn(async () => ({ data: true, error: null })),
  };
  return { authState, authMocks };
});

vi.mock("@/lib/auth/server", () => ({
  getAuth: vi.fn(() => ({
    getSession: authMocks.getSession,
    emailOtp: { sendVerificationOtp: authMocks.sendVerificationOtp },
    signIn: { emailOtp: authMocks.signInEmailOtp },
    changePassword: authMocks.changePassword,
    signOut: authMocks.signOut,
  })),
}));

import { POST, PATCH } from "@/app/api/account/password/route";
import { recordSecurityEvent } from "@/lib/security/auth-events";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://prisma.test/api/account/password", {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request("https://prisma.test/api/account/password", {
      method: "PATCH",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const CURRENT = "SenhaAtual1";
const NEW = "NovaSenha1234";
const OTP = "123456";

beforeEach(() => {
  authState.sessionResult = {
    data: {
      session: { id: "session-1" },
      user: { id: "user-1", email: "user@exemplo.com" },
    },
  };
  authState.sendVerificationOtpResult = { data: { status: true }, error: null };
  authState.signInEmailOtpResult = { data: { session: { id: "session-2" } }, error: null };
  authState.changePasswordResult = { data: { status: true }, error: null };
  vi.clearAllMocks();
});

describe("POST /api/account/password - pedido de código (estágio 1)", () => {
  it("{ stage: 'request' } → 200 { ok: true } e envia OTP com type 'email-verification'", async () => {
    const response = await post({ stage: "request" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authMocks.sendVerificationOtp).toHaveBeenCalledWith({
      email: "user@exemplo.com",
      type: "email-verification",
    });
  });

  it("sem sessão → 401 sem chamar o Auth", async () => {
    authState.sessionResult = { data: { session: null, user: null } };
    const response = await post({ stage: "request" });
    expect(response.status).toBe(401);
    expect(authMocks.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("erro do Better Auth no envio → 400 otp_send_failed com mensagem", async () => {
    authState.sendVerificationOtpResult = { data: null, error: { code: "RATE_LIMITED", message: "rate limited" } };
    const response = await post({ stage: "request" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("otp_send_failed");
    expect(body.message).toContain("Muitas tentativas");
  });
});

describe("PATCH /api/account/password - troca de senha (estágio 2)", () => {
  const validBody = { currentPassword: CURRENT, password: NEW, otp: OTP };

  it("[senha atual + otp] válidos → 200 { ok: true }; OTP antes, changePassword depois", async () => {
    const response = await patch(validBody);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(authMocks.signInEmailOtp).toHaveBeenCalledWith({ email: "user@exemplo.com", otp: OTP });
    expect(authMocks.changePassword).toHaveBeenCalledWith({
      currentPassword: CURRENT,
      newPassword: NEW,
      revokeOtherSessions: true,
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith("password_changed", { userId: "user-1" });
  });

  it("OTP inválido → 400 invalid_otp e changePassword NÃO é chamado", async () => {
    authState.signInEmailOtpResult = { data: null, error: { code: "INVALID_OTP", message: "Invalid OTP" } };
    const response = await patch(validBody);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_otp");
    expect(body.message).toBe("Código inválido ou expirado. Solicite um novo código.");
    expect(authMocks.changePassword).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith("password_change_otp_denied", { userId: "user-1" });
  });

  it("otp fora do formato → 400 invalid_otp_format sem chamar o Auth", async () => {
    const response = await patch({ ...validBody, otp: "12ab" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_otp_format" });
    expect(authMocks.signInEmailOtp).not.toHaveBeenCalled();
    expect(authMocks.changePassword).not.toHaveBeenCalled();
  });

  it("senha atual errada (após OTP válido) → 403 invalid_current_password", async () => {
    authState.changePasswordResult = { data: null, error: { code: "INVALID_PASSWORD", message: "Invalid password" } };
    const response = await patch(validBody);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "invalid_current_password" });
    expect(recordSecurityEvent).toHaveBeenCalledWith("password_change_denied", { userId: "user-1" });
  });

  it("V7: troca que falha após o OTP destrói a sessão criada pelo OTP (signOut no caminho de erro)", async () => {
    authState.changePasswordResult = { data: null, error: { code: "INVALID_PASSWORD", message: "Invalid password" } };
    const response = await patch(validBody);
    expect(response.status).toBe(403);
    // signIn.emailOtp fez auto sign-in (sessão nova): ela não pode sobreviver
    // como resíduo quando a troca falha.
    expect(authMocks.signInEmailOtp).toHaveBeenCalledTimes(1);
    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("V7: falha genérica do changePassword também destrói a sessão do OTP", async () => {
    authState.changePasswordResult = { data: null, error: { code: "RATE_LIMITED", message: "rate limited" } };
    const response = await patch(validBody);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "password_update_failed" });
    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("V7: troca bem sucedida NÃO chama signOut (a sessão do OTP vira a sessão atual)", async () => {
    const response = await patch(validBody);
    expect(response.status).toBe(200);
    expect(authMocks.signOut).not.toHaveBeenCalled();
  });

  it("V7: OTP inválido NÃO cria sessão e NÃO chama signOut", async () => {
    authState.signInEmailOtpResult = { data: null, error: { code: "INVALID_OTP", message: "Invalid OTP" } };
    const response = await patch(validBody);
    expect(response.status).toBe(400);
    expect(authMocks.changePassword).not.toHaveBeenCalled();
    expect(authMocks.signOut).not.toHaveBeenCalled();
  });

  it("senha nova fraca → 400 weak_password sem chamar o Auth", async () => {
    const response = await patch({ ...validBody, password: "curta1" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "weak_password" });
    expect(authMocks.signInEmailOtp).not.toHaveBeenCalled();
    expect(authMocks.changePassword).not.toHaveBeenCalled();
  });

  it("sem senha atual → 400 current_password_required", async () => {
    const response = await patch({ password: NEW, otp: OTP });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "current_password_required" });
  });

  it("sem sessão → 401", async () => {
    authState.sessionResult = { data: { session: null, user: null } };
    const response = await patch(validBody);
    expect(response.status).toBe(401);
  });
});
