import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, teamState, planState } = vi.hoisted(() => ({
  authState: { userId: "user-a" as string | null },
  teamState: { accountOwnerId: "user-a", role: "owner", canEditContent: true, canManageAccount: true },
  planState: { hasAccess: true, trialStatus: "active" },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
}));

vi.mock("@/lib/access/team-context", () => ({
  getTeamAccountContext: vi.fn(async () => ({
    actorUserId: authState.userId,
    accountOwnerId: teamState.accountOwnerId,
    teamId: "team-1",
    role: teamState.role,
    canEditContent: teamState.canEditContent,
    canManageAccount: teamState.canManageAccount,
  })),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountPlan: vi.fn(async () => ({
    access: { hasAccess: planState.hasAccess, trialStatus: planState.trialStatus },
    capabilities: {},
    quotas: { storageBytes: 1, includedPlays: 10, aiAnalyses: 5, teamSeats: 3 },
  })),
}));

import { guard } from "@/lib/api/guard";

function req(method = "GET", origin = "https://prisma.test") {
  return new Request("https://prisma.test/api/x", { method, headers: { origin } });
}

describe("matriz IDOR/paywall (guard canônico)", () => {
  beforeEach(() => {
    authState.userId = "user-a";
    teamState.accountOwnerId = "user-a";
    teamState.role = "owner";
    teamState.canEditContent = true;
    teamState.canManageAccount = true;
    planState.hasAccess = true;
    planState.trialStatus = "active";
  });

  it("A lê próprio recurso: permite", async () => {
    const r = await guard(req(), { paid: true });
    expect(r.ok).toBe(true);
  });

  it("não autenticado: nega 401", async () => {
    authState.userId = null;
    const r = await guard(req(), { paid: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("sem acesso pago: nega 402 (SEC-03/04)", async () => {
    planState.hasAccess = false;
    planState.trialStatus = "expired";
    const r = await guard(req(), { paid: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(402);
  });

  it("viewer não edita (RBAC): nega 403", async () => {
    teamState.role = "viewer";
    teamState.canEditContent = false;
    const r = await guard(req("POST", "https://prisma.test"), { csrf: true, role: "edit", paid: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("CSRF origem estranha: nega 403", async () => {
    const bad = new Request("https://prisma.test/api/x", { method: "POST", headers: { origin: "https://atacante.com" } });
    const r = await guard(bad, { csrf: true, role: "edit", paid: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("ownerId do cliente nunca substitui contexto: accountOwnerId vem da sessão", async () => {
    teamState.accountOwnerId = "user-a";
    const r = await guard(req(), {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.accountOwnerId).toBe("user-a");
  });
});
