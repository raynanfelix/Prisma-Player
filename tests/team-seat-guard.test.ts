import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

/**
 * M1 + M4 da auditoria de segurança (docs/reports/SECURITY_AUDIT_VALIDATION.md):
 * - M1: convite com papel admin exige INVITADOR owner (regra já usada na
 *   promoção via updateMemberRole).
 * - M4: check de assentos + insert dentro de UMA transação com lock da linha
 *   da equipe (FOR UPDATE); o catch do trigger "team_seat_limit_reached" do
 *   legacy Supabase era código morto e foi removido.
 *
 * fake-db padrão (tests/helpers/fake-db) com wrappers que registram o lock
 * (select ... for update) e os inserts executados DENTRO da transação.
 */

const { planState } = vi.hoisted(() => ({
  planState: { teamSeats: 5 as number },
}));

vi.mock("@/lib/access/team-context", () => ({
  getTeamAccountContext: vi.fn(async (userId: string) => ({
    actorUserId: userId,
    accountOwnerId: "owner-1",
    teamId: null as string | null,
    role: "owner",
    canEditContent: true,
    canManageAccount: true,
  })),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountPlan: vi.fn(async () => ({
    access: { hasAccess: true, trialStatus: "active" },
    capabilities: {},
    quotas: { teamSeats: planState.teamSeats },
  })),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/security/csrf", () => ({ csrfGuard: vi.fn(() => null) }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();
  return { db: fake.db, pool: {}, schema };
});

import { inviteTeamMember, acceptTeamInvite } from "@/lib/account/team";
import { POST as teamPost } from "@/app/api/account/team/route";
import { currentFakeDb, insertedValues, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const fake = (): FakeDb => currentFakeDb();

/** Locks emitidos (select ... for update) e inserts dentro de transação. */
const captured = { lockTables: [] as string[], insertsInTx: [] as string[], txDepth: 0 };

/** Instalado UMA vez por arquivo: reinstalar acumularia camadas no db.select e
 * cada camada registraria o MESMO lock. O beforeEach já zera `captured`, e os
 * wrappers leem `captured.*` na hora da chamada, então uma instalação única
 * serve todos os testes. */
let wrappersInstalled = false;

function installWrappers(): void {
  if (wrappersInstalled) return;
  wrappersInstalled = true;
  const db = fake().db as unknown as Record<string, unknown>;

  const originalSelect = (db.select as () => unknown).bind(db);
  db.select = () => {
    let table: string | null = null;
    const inner = originalSelect() as Record<string, unknown>;
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        (inner.then as (a?: unknown, b?: unknown) => unknown)(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        (inner.catch as (a?: unknown) => unknown)(onRejected),
    };
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit", "for"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = getTableName(args[0] as Parameters<typeof getTableName>[0]);
        if (method === "for" && args[0] === "update" && table) captured.lockTables.push(table);
        (inner[method] as ((...rest: unknown[]) => unknown) | undefined)?.(...args);
        return chain;
      };
    }
    return chain;
  };

  const originalInsert = (db.insert as (table: unknown) => unknown).bind(db);
  db.insert = (table: unknown) => {
    if (captured.txDepth > 0) captured.insertsInTx.push(getTableName(table as Parameters<typeof getTableName>[0]));
    return originalInsert(table);
  };

  const originalTransaction = (db.transaction as (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>).bind(db);
  db.transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    captured.txDepth += 1;
    try {
      return await originalTransaction(callback);
    } finally {
      captured.txDepth -= 1;
    }
  };
}

/** Contagens por tabela: o count(*)::int do código lê `total` da 1ª linha. */
function counts(members: number, invites: number): void {
  fake().state.selectRows["account_team_members"] = [{ total: members }];
  fake().state.selectRows["account_team_invites"] = [{ total: invites }];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeDb(fake());
  planState.teamSeats = 5;
  captured.lockTables = [];
  captured.insertsInTx = [];
  captured.txDepth = 0;
  counts(1, 0);
  fake().state.insertResults["account_team_invites"] = [{ id: "invite-novo" }];
  installWrappers();
});

describe("M1: papel admin por convite exige INVITADOR owner", () => {
  it("admin convidando admin → owner_required_for_admin_role e NENHUM convite criado", async () => {
    const outcome = await inviteTeamMember("admin", "user-1", "team-1", 5, "cumplice@prisma.test", "admin");

    expect(outcome).toEqual({ status: "owner_required_for_admin_role" });
    expect(insertedValues(fake(), "account_team_invites")).toEqual([]);
  });

  it("owner convidando admin → convite criado dentro da transação com lock da equipe", async () => {
    const outcome = await inviteTeamMember("owner", "user-1", "team-1", 5, "novo-admin@prisma.test", "admin");

    expect(outcome).toEqual({ status: "invited" });
    expect(captured.lockTables).toContain("account_teams");
    expect(captured.insertsInTx).toContain("account_team_invites");
  });

  it("admin convidando editor → permitido (admin convida só não-admin)", async () => {
    const outcome = await inviteTeamMember("admin", "user-1", "team-1", 5, "editor@prisma.test", "editor");

    expect(outcome).toEqual({ status: "invited" });
  });

  it("rota: admin (membership admin) convidando admin → 403 owner_required_for_admin_role", async () => {
    fake().state.selectRows["account_team_members"] = [{
      teamId: "team-1", role: "admin", teamIdJoined: "team-1", teamName: "Operação", teamOwnerId: "owner-1",
    }];
    const response = await teamPost(new Request("https://prisma.test/api/account/team", {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify({ email: "cumplice@prisma.test", role: "admin" }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "owner_required_for_admin_role" });
    expect(insertedValues(fake(), "account_team_invites")).toEqual([]);
  });

  it("rota: owner convidando admin → 200 invited", async () => {
    fake().state.selectRows["account_team_members"] = [{
      teamId: "team-1", role: "owner", teamIdJoined: "team-1", teamName: "Operação", teamOwnerId: "user-1",
    }];
    counts(1, 0);
    const response = await teamPost(new Request("https://prisma.test/api/account/team", {
      method: "POST",
      headers: { origin: "https://prisma.test", "content-type": "application/json" },
      body: JSON.stringify({ email: "novo-admin@prisma.test", role: "admin" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invited: true });
  });
});

describe("M4: assentos com check + insert transacionais (fim do TOCTOU)", () => {
  it("convite locka a linha da equipe ANTES de contar (FOR UPDATE serializa concorrentes)", async () => {
    await inviteTeamMember("owner", "user-1", "team-1", 5, "novo@prisma.test", "viewer");

    expect(captured.lockTables).toEqual(["account_teams"]);
  });

  it("assentos estourados → seat_limit_reached SEM criar convite", async () => {
    counts(3, 0);
    const outcome = await inviteTeamMember("owner", "user-1", "team-1", 3, "novo@prisma.test", "viewer");

    expect(outcome).toEqual({ status: "seat_limit_reached" });
    expect(insertedValues(fake(), "account_team_invites")).toEqual([]);
  });

  it("dois convites sequenciais na mesma janela: o segundo VÊ o convite do primeiro e falha limpo", async () => {
    counts(1, 0);
    const first = await inviteTeamMember("owner", "user-1", "team-1", 2, "primeiro@prisma.test", "viewer");
    expect(first).toEqual({ status: "invited" });

    // O primeiro convite agora está pendente: o re-check DENTRO da transação
    // do segundo convite o conta (é o que o lock + count garantem no banco).
    counts(1, 1);
    const second = await inviteTeamMember("owner", "user-1", "team-1", 2, "segundo@prisma.test", "viewer");

    expect(second).toEqual({ status: "seat_limit_reached" });
    expect(insertedValues(fake(), "account_team_invites")).toHaveLength(1);
  });

  it("aceite com vaga → membro inserido DENTRO da transação, com lock da equipe", async () => {
    fake().state.selectRows["profiles"] = [{ id: "user-2", email: "convidado@prisma.test" }];
    fake().state.selectRows["account_team_invites"] = [{
      id: "invite-1", teamId: "team-1", role: "viewer", email: "convidado@prisma.test",
      status: "pending", expiresAt: new Date(Date.now() + 86_400_000),
    }];
    fake().state.selectRows["account_teams"] = [{ ownerId: "owner-1" }];
    fake().state.selectRows["account_team_members"] = [];
    planState.teamSeats = 2;

    const outcome = await acceptTeamInvite("user-2", "invite-1");

    expect(outcome).toEqual({ status: "accepted" });
    expect(captured.lockTables).toContain("account_teams");
    expect(captured.insertsInTx).toContain("account_team_members");
  });

  it("aceite com assentos esgotados → seat_limit_reached SEM inserir membro", async () => {
    fake().state.selectRows["profiles"] = [{ id: "user-2", email: "convidado@prisma.test" }];
    fake().state.selectRows["account_team_invites"] = [{
      id: "invite-1", teamId: "team-1", role: "viewer", email: "convidado@prisma.test",
      status: "pending", expiresAt: new Date(Date.now() + 86_400_000),
    }];
    fake().state.selectRows["account_teams"] = [{ ownerId: "owner-1" }];
    fake().state.selectRows["account_team_members"] = [];
    planState.teamSeats = 0;

    const outcome = await acceptTeamInvite("user-2", "invite-1");

    expect(outcome).toEqual({ status: "seat_limit_reached" });
    expect(insertedValues(fake(), "account_team_members")).toEqual([]);
  });
});
