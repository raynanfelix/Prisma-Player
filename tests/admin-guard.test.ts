import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: { userId: "admin-1" as string | null, isAdmin: true, aal: "aal2" as string | null },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
  getCurrentAdminUser: vi.fn(async () => (authState.userId && authState.isAdmin ? { id: authState.userId } : null)),
  getAuthAssuranceLevel: vi.fn(async () => authState.aal),
}));

import { adminGuard } from "@/lib/api/admin-guard";

function post(origin = "https://prisma.test") {
  return new Request("https://prisma.test/api/admin/x", { method: "POST", headers: { origin } });
}

describe("adminGuard (/api/admin/*)", () => {
  beforeEach(() => {
    authState.userId = "admin-1";
    authState.isAdmin = true;
    authState.aal = "aal2";
  });

  it("admin autenticado: permite", async () => {
    const result = await adminGuard(post());
    expect(result.ok).toBe(true);
  });

  it("admin com sessão aal1 (fator não desafiado): nega 403 mfa_required", async () => {
    authState.aal = "aal1";
    const result = await adminGuard(post());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toMatchObject({ error: "mfa_required" });
    }
  });

  it("sem sessão: nega 401", async () => {
    authState.userId = null;
    const result = await adminGuard(post());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("usuário comum: nega 403", async () => {
    authState.isAdmin = false;
    const result = await adminGuard(post());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("origem estranha: nega 403 (CSRF)", async () => {
    const result = await adminGuard(post("https://atacante.com"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
