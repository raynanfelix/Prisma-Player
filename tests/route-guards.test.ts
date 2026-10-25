import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentFakeDb, resetFakeDb, type FakeDb } from "./helpers/fake-db";

/**
 * Varredura de guardas da API (D4, docs/specs/FRONT_D_LOOP_SPEC.md): toda
 * rota sem teste proprio recebe aqui pelo menos um teste de guarda.
 *
 * Vetores cobertos por familia:
 * - Sessao ausente: guard()/adminGuard()/getCurrentUserId() respondem 401.
 * - Sessao sem papel: adminGuard 403 admin_forbidden, guard role=edit 403
 *   team_role_forbidden e checagem de admin na rota do roadmap 403.
 * - Payload invalido em rotas publicas de auth (400) antes de tocar o SDK.
 *
 * O modulo @/lib/db e o fake-db padrao; nenhum teste aqui deve chegar ao
 * banco: a guarda responde antes.
 */

const { authState, authSdk } = vi.hoisted(() => ({
  authState: { userId: null as string | null, adminUser: null as { id: string } | null },
  authSdk: {
    signIn: { email: async () => ({ data: { user: null }, error: { code: "INVALID_EMAIL_OR_PASSWORD" } }) },
    requestPasswordReset: async () => ({ error: null }),
    resetPassword: async () => ({ error: null }),
    changePassword: async () => ({ error: null }),
    getSession: async () => ({ data: { user: null } }),
    signOut: async () => undefined,
    handler: () => async () => new Response(JSON.stringify({ proxied: true }), { status: 200 }),
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => authState.userId),
  getCurrentAdminUser: vi.fn(async () => authState.adminUser),
  getAuth: vi.fn(() => authSdk),
}));

vi.mock("@/lib/access/team-context", () => ({
  getTeamAccountContext: vi.fn(async () => ({
    actorUserId: "user-x",
    accountOwnerId: "owner-x",
    teamId: "team-x",
    role: "viewer",
    canEditContent: false,
    canManageAccount: false,
  })),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountPlan: vi.fn(async () => ({
    access: { hasAccess: true, trialStatus: "active" },
    capabilities: {},
    quotas: { storageBytes: 5 * 1024 ** 3, includedPlays: 100, aiAnalyses: 5, teamSeats: 5 },
  })),
  getAccountAccess: vi.fn(async () => ({ hasAccess: true, trialActive: true, subscriptionActive: true })),
}));

vi.mock("@/lib/security/csrf", () => ({ csrfGuard: vi.fn(() => null) }));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => null),
  consumeRateLimit: vi.fn(async () => ({ limited: false, headers: {} })),
  hashRateLimitIdentifier: vi.fn((value: string) => value),
}));

vi.mock("@/lib/realtime/server", () => ({
  realtime: null,
  sealQuery: vi.fn(),
  videoCountersQuery: vi.fn(),
  videoStatsQuery: vi.fn(),
}));

vi.mock("@/lib/cron-tasks/tasks", () => ({
  verifyCronAuthorization: vi.fn(() => ({ ok: false, reason: "mismatch" })),
  runCronMaintenance: vi.fn(async () => { throw new Error("nao deve rodar sem autorizacao"); }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: vi.fn(() => undefined), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { GET as abTestsGet, POST as abTestsPost } from "@/app/api/ab-tests/route";
import { GET as abTestGet } from "@/app/api/ab-tests/[id]/route";
import { GET as accessGet } from "@/app/api/account/access/route";
import { GET as inboxGet } from "@/app/api/account/inbox/route";
import { GET as overviewGet } from "@/app/api/account/overview/route";
import { GET as profileGet } from "@/app/api/account/profile/route";
import { GET as securityGet } from "@/app/api/account/security/route";
import { POST as trialPost } from "@/app/api/account/trial/route";
import { POST as creditsAdjustPost } from "@/app/api/admin/credits/adjust/route";
import { POST as plansTogglePost } from "@/app/api/admin/plans/toggle/route";
import { GET as adminSearchGet } from "@/app/api/admin/search/route";
import { POST as seoTargetsPost } from "@/app/api/admin/seo/targets/route";
import { POST as adminCasesPost } from "@/app/api/admin/support/cases/route";
import { POST as adminNotesPost } from "@/app/api/admin/support/notes/route";
import { POST as teamRolePost } from "@/app/api/admin/team/role/route";
import { POST as usersPlanPost } from "@/app/api/admin/users/plan/route";
import { POST as usersStatusPost } from "@/app/api/admin/users/status/route";
import { GET as liveLogsGet } from "@/app/api/analytics/[videoId]/live-logs/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as resetPost } from "@/app/api/auth/reset/route";
import { POST as revokeAllPost } from "@/app/api/auth/revoke-all-sessions/route";
import { POST as updatePasswordPost } from "@/app/api/auth/update-password/route";
import { GET as authProxyGet } from "@/app/api/auth/[...path]/route";
import { GET as cronGet } from "@/app/api/cron/route";
import { GET as dashboardSecurityGet } from "@/app/api/dashboard-security/route";
import { POST as telegramVerifyPost } from "@/app/api/integrations/telegram-verify/route";
import { GET as pixelsDiagnosticsGet } from "@/app/api/player-pixels/diagnostics/route";
import { GET as realtimeGet } from "@/app/api/realtime/route";
import { GET as roadmapGet } from "@/app/api/roadmap/route";
import { PATCH as roadmapPatch } from "@/app/api/roadmap/[id]/route";
import { POST as assetSignPost } from "@/app/api/studio/asset-sign/route";
import { POST as assetUploadPost } from "@/app/api/studio/asset-upload/route";

const fake = (): FakeDb => currentFakeDb();
const UUID = "aaaaaaaa-0000-4000-8000-000000000001";

function get(url = "https://prisma.test/api/x"): Request {
  return new Request(url);
}

function post(body: unknown, url = "https://prisma.test/api/x"): Request {
  return new Request(url, {
    method: "POST",
    headers: { origin: "https://prisma.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authState.userId = null;
  authState.adminUser = null;
  resetFakeDb(fake());
});

/** [nome da rota, chamada do handler, status esperado, corpo esperado opcional] */
const unauthorizedCases: Array<[string, () => Promise<Response>]> = [
  ["GET /api/ab-tests", () => abTestsGet(get())],
  ["POST /api/ab-tests", () => abTestsPost(post({ videoId: UUID, name: "A" }))],
  ["GET /api/ab-tests/[id]", () => abTestGet(get(), { params: Promise.resolve({ id: UUID }) })],
  ["GET /api/account/access", () => accessGet()],
  ["GET /api/account/inbox", () => inboxGet()],
  ["GET /api/account/overview", () => overviewGet()],
  ["GET /api/account/profile", () => profileGet()],
  ["GET /api/account/security", () => securityGet()],
  ["POST /api/account/trial", () => trialPost(post({}))],
  ["POST /api/admin/credits/adjust", () => creditsAdjustPost(post({ userId: UUID, delta: 1, reason: "x" }))],
  ["POST /api/admin/plans/toggle", () => plansTogglePost(post({ planSlug: "pro", isActive: true }))],
  ["GET /api/admin/search", () => adminSearchGet(get("https://prisma.test/api/admin/search?q=a"))],
  ["POST /api/admin/seo/targets", () => seoTargetsPost(post({}))],
  ["POST /api/admin/support/cases", () => adminCasesPost(post({}))],
  ["POST /api/admin/support/notes", () => adminNotesPost(post({}))],
  ["POST /api/admin/team/role", () => teamRolePost(post({}))],
  ["POST /api/admin/users/plan", () => usersPlanPost(post({}))],
  ["POST /api/admin/users/status", () => usersStatusPost(post({}))],
  ["GET /api/analytics/[videoId]/live-logs", () => liveLogsGet(get(), { params: Promise.resolve({ videoId: UUID }) })],
  ["POST /api/auth/revoke-all-sessions", () => revokeAllPost(post({}))],
  ["GET /api/cron", () => cronGet(get())],
  ["GET /api/dashboard-security", () => dashboardSecurityGet(get())],
  ["POST /api/integrations/telegram-verify", () => telegramVerifyPost(post({ token: "123456:abcdef" }))],
  ["GET /api/player-pixels/diagnostics", () => pixelsDiagnosticsGet(get("https://prisma.test/api/player-pixels/diagnostics?videoId=x"))],
  ["GET /api/realtime", () => realtimeGet(get())],
  ["GET /api/roadmap", () => roadmapGet(get())],
  ["PATCH /api/roadmap/[id]", () => roadmapPatch(post({ stage: "done" }), { params: Promise.resolve({ id: UUID }) })],
  ["POST /api/studio/asset-sign", () => assetSignPost(post({}))],
  ["POST /api/studio/asset-upload", () => assetUploadPost(post({}))],
];

describe("guarda 401: sessao ausente", () => {
  it.each(unauthorizedCases)("%s responde 401 unauthorized", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});

describe("guarda 403: sessao presente sem papel", () => {
  it("adminGuard sem admin responde 403 admin_forbidden (amostra: POST /api/admin/users/plan)", async () => {
    authState.userId = "user-x";
    const response = await usersPlanPost(post({ userId: UUID, planSlug: "pro", reason: "x" }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("admin_forbidden");
  });

  it("guard role=edit com viewer responde 403 team_role_forbidden (POST /api/studio/asset-sign)", async () => {
    authState.userId = "user-x";
    const response = await assetSignPost(post({ videoId: UUID, kind: "thumbnail", path: "a/b.png", sizeBytes: 10 }));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("team_role_forbidden");
  });

  it("roadmap PATCH com sessao comum responde 403 admin_required (checagem da propria rota)", async () => {
    authState.userId = "user-x";
    const response = await roadmapPatch(post({ stage: "done" }), { params: Promise.resolve({ id: UUID }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "admin_required" });
  });
});

describe("guarda 400: rotas publicas de auth validam payload antes do SDK", () => {
  it("POST /api/auth/login sem credenciais responde 400 invalid_credentials", async () => {
    const response = await loginPost(post({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
  });

  it("POST /api/auth/reset sem e-mail responde 400 email_required", async () => {
    const response = await resetPost(post({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "email_required" });
  });

  it("POST /api/auth/update-password com senha fraca responde 400 weak_password", async () => {
    const response = await updatePasswordPost(post({ password: "curta1" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "weak_password" });
  });

  it("POST /api/auth/update-password sem token e sem sessao responde 400 reset_token_required", async () => {
    const response = await updatePasswordPost(post({ password: "senha-forte-123" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "reset_token_required" });
  });
});

describe("proxy do catch-all do Neon Auth", () => {
  it("GET /api/auth/[...path] delega ao handler do SDK com o context intacto", async () => {
    const response = await authProxyGet(get("https://prisma.test/api/auth/get-session"), {
      params: Promise.resolve({ path: ["get-session"] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ proxied: true });
  });

  it("POST /api/auth/logout encerra sem sessao e responde ok (fail-open da saida)", async () => {
    const response = await logoutPost(post({}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
