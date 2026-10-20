import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Suíte BOLA cross-tenant (API1) — docs/SECURITY_HARDENING_SPEC.md, item 3.
 *
 * Duas contas (A e B) com objetos de cada uma; a SESSÃO é sempre de A
 * (guard/getCurrentUserId mockados). O fake-db aqui é mais fiel que o padrão
 * de tests/helpers/fake-db: o select AVALIA a cláusula `where` compilada
 * (eq/inArray via PgDialect) e devolve só as linhas que a query real
 * devolveria — assim o teste FALHA se uma rota esquecer o filtro por
 * accountOwnerId, em vez de confiar que a query está certa. Mutações têm o
 * where capturado e conferido (escopo por dono + objeto).
 */

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const SESSION_USER = "user-a-session";

const VIDEO_A = "11111111-1111-4111-8111-111111111111";
const VIDEO_B = "22222222-2222-4222-8222-222222222222";
const PLAYER_CONFIG_ID_A = "33333333-3333-4333-8333-333333333333";
const PLAYER_CONFIG_ID_B = "44444444-4444-4444-8444-444444444444";
const MARKER_A = "player-config-da-conta-a";
const MARKER_B = "player-config-da-conta-b";

const { gateState, captured } = vi.hoisted(() => ({
  gateState: { ok: true as boolean, denyResponse: null as Response | null },
  captured: {
    mutationWheres: [] as Array<{ op: "update" | "delete"; table: string; arg: unknown }>,
    conflictSets: [] as Array<{ table: string; arg: unknown }>,
  },
}));

vi.mock("@/lib/api/guard", () => ({
  guard: vi.fn(async () => {
    if (!gateState.ok) {
      gateState.denyResponse = gateState.denyResponse ?? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return { ok: false, response: gateState.denyResponse };
    }
    return {
      ok: true,
      userId: SESSION_USER,
      account: { accountOwnerId: OWNER_A },
      plan: { access: { hasAccess: true }, capabilities: {}, quotas: { storageBytes: 5 * 1024 ** 3 } },
    };
  }),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentUserId: vi.fn(async () => SESSION_USER),
}));

vi.mock("@/lib/access/team-context", () => ({
  getTeamAccountContext: vi.fn(async (userId: string) => ({
    actorUserId: userId,
    accountOwnerId: OWNER_A,
    teamId: "team-a",
    role: "admin",
    canEditContent: true,
    canManageAccount: true,
  })),
}));

vi.mock("@/lib/access/service", () => ({
  getAccountPlan: vi.fn(async (ownerId: string) => ({
    access: { hasAccess: true, trialStatus: "active" },
    capabilities: { automatic_reports: true, audience_sync: true, outgoing_webhooks: true, conversion_drop_alerts: true },
    quotas: { storageBytes: 5 * 1024 ** 3, includedPlays: 100, aiAnalyses: 5, teamSeats: 5 },
  })),
  getStorageUsedBytes: vi.fn(async () => 0),
}));

vi.mock("@/lib/security/csrf", () => ({ csrfGuard: vi.fn(() => null) }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: vi.fn(async () => null) }));

vi.mock("@/lib/storage/r2", () => ({
  r2MaxUploadBytes: vi.fn(() => 20 * 1024 ** 3),
  signR2ReadUrl: vi.fn(async (key: string) => `https://r2.test/${key}`),
  headR2Object: vi.fn(async () => ({ ContentLength: 1 })),
  deleteR2Object: vi.fn(async () => undefined),
}));

vi.mock("@/lib/storage/faststart", () => ({ detectMp4Faststart: vi.fn(async () => null) }));

vi.mock("@/lib/db", async () => {
  const { installFakeDb } = await import("./helpers/fake-db");
  const { getTableColumns, getTableName: tableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const schema = await vi.importActual("../drizzle/schema");
  const fake = installFakeDb();

  // `"videos"."user_id"` (SQL compilado) → propriedade do objeto-row do drizzle.
  const columnProp = new Map<string, string>();
  for (const table of Object.values(schema as Record<string, unknown>)) {
    const name = tableName(table as Parameters<typeof tableName>[0]);
    for (const [prop, column] of Object.entries(getTableColumns(table as Parameters<typeof getTableColumns>[0]))) {
      columnProp.set(`"${name}"."${(column as { name: string }).name}"`, prop);
    }
  }

  const dialect = new PgDialect();

  function clauseMatches(clause: string, params: unknown[], row: Record<string, unknown>): boolean {
    const eq = /^("[^"]+"\."[^"]+") = \$(\d+)$/.exec(clause);
    if (eq) {
      const prop = columnProp.get(eq[1]!);
      if (!prop) throw new Error(`BOLA fake: coluna desconhecida em "${clause}"`);
      return String(row[prop]) === String(params[Number(eq[2]) - 1]);
    }
    const inList = /^("[^"]+"\."[^"]+") in \(([^)]+)\)$/.exec(clause);
    if (inList) {
      const prop = columnProp.get(inList[1]!);
      if (!prop) throw new Error(`BOLA fake: coluna desconhecida em "${clause}"`);
      const values = inList[2]!.split(",").map((part) => params[Number(part.trim().slice(1)) - 1]);
      return values.some((value) => String(row[prop]) === String(value));
    }
    throw new Error(`BOLA fake: cláusula não suportada: "${clause}"`);
  }

  function filterRows(table: string, where: unknown, rows: Record<string, unknown>[]): Record<string, unknown>[] {
    if (where === undefined) return rows;
    const { sql, params } = dialect.sqlToQuery(where as never);
    // Drizzle compila and(a, b, c) como "(a and b and c)" — UM par de
    // parênteses envolvendo tudo, condições unidas por " and " simples.
    const clean = sql.trim().replace(/^\(/, "").replace(/\)$/, "");
    return rows.filter((row) => clean.split(" and ").every((clause) => clauseMatches(clause.trim(), params, row)));
  }

  // Select com where AVALIADO (o coração da suíte: sem o filtro por dono na
  // query, as linhas de B fluem para a resposta e o teste reprova).
  fake.db.select = () => {
    let table: string | null = null;
    let where: unknown;
    const resolve = () => {
      const rows = (table && fake.state.selectRows[table]) || [];
      return table && where !== undefined ? filterRows(table, where, rows as Record<string, unknown>[]) : rows;
    };
    const chain: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve().then(resolve).then(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve().then(resolve).catch(onRejected),
    };
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "offset", "for", "groupBy", "having"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from" && args[0]) table = tableName(args[0] as Parameters<typeof tableName>[0]);
        if (method === "where") where = args[0];
        return chain;
      };
    }
    return chain;
  };

  const wrapThenable = (inner: Record<string, unknown>, methods: string[], onMethod?: (method: string, args: unknown[]) => void) => {
    const wrapped: Record<string, unknown> = {
      then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        (inner.then as (a: unknown, b: unknown) => unknown)(onFulfilled, onRejected),
      catch: (onRejected?: (reason: unknown) => unknown) =>
        (inner.catch as (a: unknown) => unknown)(onRejected),
    };
    for (const method of methods) {
      wrapped[method] = (...args: unknown[]) => {
        onMethod?.(method, args);
        (inner[method] as ((...rest: unknown[]) => unknown) | undefined)?.(...args);
        return wrapped;
      };
    }
    return wrapped;
  };

  const originalInsert = fake.db.insert.bind(fake.db);
  fake.db.insert = (table: unknown) => {
    const name = tableName(table as Parameters<typeof tableName>[0]);
    return wrapThenable(originalInsert(table) as Record<string, unknown>, ["values", "returning", "onConflictDoNothing", "onConflictDoUpdate"], (method, args) => {
      if (method === "onConflictDoUpdate") captured.conflictSets.push({ table: name, arg: args[0] });
    });
  };

  const originalUpdate = fake.db.update.bind(fake.db);
  fake.db.update = (table: unknown) => {
    const name = tableName(table as Parameters<typeof tableName>[0]);
    return wrapThenable(originalUpdate(table) as Record<string, unknown>, ["set", "where", "returning", "onConflictDoNothing", "onConflictDoUpdate"], (method, args) => {
      if (method === "where") captured.mutationWheres.push({ op: "update", table: name, arg: args[0] });
    });
  };

  const originalDelete = fake.db.delete.bind(fake.db);
  fake.db.delete = (table: unknown) => {
    const name = tableName(table as Parameters<typeof tableName>[0]);
    return wrapThenable(originalDelete(table) as Record<string, unknown>, ["where"], (method, args) => {
      if (method === "where") captured.mutationWheres.push({ op: "delete", table: name, arg: args[0] });
    });
  };

  return { db: fake.db, pool: {}, schema };
});

import { GET as listVideos } from "@/app/api/videos/route";
import { DELETE as deleteVideo } from "@/app/api/videos/[id]/route";
import { GET as getIntegrations, PUT as putIntegration, DELETE as deleteIntegration } from "@/app/api/integrations/route";
import { PATCH as patchControls } from "@/app/api/intelligence/controls/route";
import { GET as getPlayerConfig } from "@/app/api/player-configs/route";
import { GET as playerLoaderGet } from "@/app/api/player-loader/[id]/route";
import { POST as teamPost, PATCH as teamPatch } from "@/app/api/account/team/route";
import { currentFakeDb, insertedValues, resetFakeDb, type FakeDb } from "./helpers/fake-db";

const fake = (): FakeDb => currentFakeDb();

function request(method: string, body?: unknown, url = "https://prisma.test/api/x"): Request {
  return new Request(url, {
    method,
    headers: { origin: "https://prisma.test", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function videoRow(owner: string, id: string, title: string): Record<string, unknown> {
  return {
    id,
    userId: owner,
    folderId: null,
    title,
    objectPath: `${owner}/video-${id}.mp4`,
    mimeType: "video/mp4",
    sizeBytes: 1000,
    status: "ready",
    durationSeconds: "12.500",
    storageProvider: "r2",
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-01T10:00:00.000Z"),
  };
}

/** Compila o where capturado de uma mutação (escopo deve ser o dono da sessão). */
function compiledMutationWhere(op: "update" | "delete", table: string) {
  const hit = captured.mutationWheres.find((entry) => entry.op === op && entry.table === table);
  expect(hit, `where não capturado: ${op} em ${table}`).toBeDefined();
  return new PgDialect().sqlToQuery(hit!.arg as never);
}

beforeEach(() => {
  gateState.ok = true;
  gateState.denyResponse = null;
  captured.mutationWheres.length = 0;
  captured.conflictSets.length = 0;
  resetFakeDb(fake());

  fake().state.selectRows["videos"] = [videoRow(OWNER_A, VIDEO_A, "VSL da conta A"), videoRow(OWNER_B, VIDEO_B, "VSL da conta B")];
  fake().state.selectRows["player_configs"] = [
    { id: PLAYER_CONFIG_ID_A, userId: OWNER_A, videoId: VIDEO_A, config: { marker: MARKER_A }, allowedDomains: [], published: true, createdAt: new Date("2026-01-01T10:00:00.000Z"), updatedAt: new Date("2026-01-01T10:00:00.000Z") },
    { id: PLAYER_CONFIG_ID_B, userId: OWNER_B, videoId: VIDEO_B, config: { marker: MARKER_B }, allowedDomains: [], published: true, createdAt: new Date("2026-01-01T10:00:00.000Z"), updatedAt: new Date("2026-01-01T10:00:00.000Z") },
  ];
  fake().state.selectRows["profiles"] = [
    { id: SESSION_USER, email: "a@prisma.test" },
    { id: "user-b-session", email: "b@prisma.test" },
  ];
  fake().state.selectRows["account_teams"] = [
    { id: "team-a", name: "Equipe A", ownerId: OWNER_A },
    { id: "team-b", name: "Equipe B", ownerId: OWNER_B },
  ];
  fake().state.selectRows["account_team_members"] = [
    { id: "member-a", userId: SESSION_USER, teamId: "team-a", role: "admin", status: "active", joinedAt: new Date("2026-01-01T10:00:00.000Z"), teamIdJoined: "team-a", teamName: "Equipe A", teamOwnerId: OWNER_A },
    { id: "member-b", userId: "user-b-session", teamId: "team-b", role: "viewer", status: "active", joinedAt: new Date("2026-01-01T10:00:00.000Z"), teamIdJoined: "team-b", teamName: "Equipe B", teamOwnerId: OWNER_B },
  ];
  fake().state.selectRows["account_team_invites"] = [
    { id: "invite-a", teamId: "team-a", email: "a@prisma.test", role: "viewer", status: "pending", expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date("2026-01-01T10:00:00.000Z") },
    { id: "invite-b", teamId: "team-b", email: "b@prisma.test", role: "viewer", status: "pending", expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date("2026-01-01T10:00:00.000Z") },
  ];
});

describe("BOLA: sessão de A tentando objeto de B — GET/DELETE /api/videos", () => {
  it("GET lista SÓ os vídeos de A — nenhum dado de B na resposta", async () => {
    const response = await listVideos(new Request("https://prisma.test/api/videos"));
    const body = (await response.json()) as { videos: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0]!.id).toBe(VIDEO_A);
    expect(JSON.stringify(body)).not.toContain(VIDEO_B);
    expect(JSON.stringify(body)).not.toContain("VSL da conta B");
  });

  it("DELETE do id de B → 404 video_not_found, NENHUMA mutação executada", async () => {
    const response = await deleteVideo(request("DELETE"), { params: Promise.resolve({ id: VIDEO_B }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "video_not_found" });
    expect(captured.mutationWheres.filter((entry) => entry.table === "videos")).toEqual([]);
  });

  it("controle positivo: DELETE do próprio id de A passa e o where é escopado por dono", async () => {
    const response = await deleteVideo(request("DELETE"), { params: Promise.resolve({ id: VIDEO_A }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const compiled = compiledMutationWhere("delete", "videos");
    expect(compiled.params).toContain(OWNER_A);
    expect(compiled.params).not.toContain(OWNER_B);
    expect(compiled.params).toContain(VIDEO_A);
  });
});

describe("BOLA: sessão de A tentando objeto de B — PUT/DELETE /api/integrations", () => {
  it("PUT com vslIds de B → 403 vsl_not_owned, nada gravado", async () => {
    const response = await putIntegration(
      request("PUT", { provider: "discord", instanceId: "inst-b", config: { webhookUrl: "https://discord.com/api/webhooks/1/x" }, vslIds: [VIDEO_B] }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "vsl_not_owned" });
    expect(insertedValues(fake(), "account_integrations")).toEqual([]);
  });

  it("DELETE da instância de B → 200 no-op, mas o delete é escopado ao dono A (nada de B é apagado)", async () => {
    const response = await deleteIntegration(request("DELETE", { provider: "discord", instanceId: "inst-b" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    const compiled = compiledMutationWhere("delete", "account_integrations");
    expect(compiled.sql).toContain('"account_owner_id"');
    expect(compiled.params).toContain(OWNER_A);
    expect(compiled.params).not.toContain(OWNER_B);
    expect(JSON.stringify(body)).not.toContain(OWNER_B);
  });
});

describe("BOLA: sessão de A tentando objeto de B — PATCH /api/intelligence/controls", () => {
  it("reportVideoIds de B são DESCARTADOS pelo filtro de posse; só os de A são salvos", async () => {
    const response = await patchControls(request("PATCH", { reportVideoIds: [VIDEO_A, VIDEO_B] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });

    const conflict = captured.conflictSets.find((entry) => entry.table === "intelligence_controls");
    expect(conflict, "upsert de intelligence_controls não aconteceu").toBeDefined();
    const set = (conflict!.arg as { set: Record<string, unknown> }).set;
    expect(set.reportVideoIds).toEqual([VIDEO_A]);
    // A linha é garantida na chave da SESSÃO (userId = dono A), nunca B.
    expect(insertedValues(fake(), "intelligence_controls")[0]).toMatchObject({ userId: OWNER_A });
  });
});

describe("BOLA: sessão de A tentando objeto de B — GET /api/player-configs e player-loader", () => {
  it("config do player do vídeo de B → playerConfig null, nenhum marker de B na resposta", async () => {
    const response = await getPlayerConfig(new Request(`https://prisma.test/api/player-configs?videoId=${VIDEO_B}`));
    const body = (await response.json()) as { playerConfig: Record<string, unknown> | null };

    expect(response.status).toBe(200);
    expect(body.playerConfig).toBeNull();
    expect(JSON.stringify(body)).not.toContain(MARKER_B);
  });

  it("controle positivo: a config do vídeo de A vem completa", async () => {
    const response = await getPlayerConfig(new Request(`https://prisma.test/api/player-configs?videoId=${VIDEO_A}`));
    const body = (await response.json()) as { playerConfig: Record<string, unknown> | null };

    expect(response.status).toBe(200);
    expect((body.playerConfig as Record<string, unknown>).id).toBe(PLAYER_CONFIG_ID_A);
  });

  it("player-loader do player de B entrega só o script estático — nada da config de B vaza", async () => {
    const response = await playerLoaderGet(new Request("https://site-de-terceiro.test/"), { params: Promise.resolve({ id: PLAYER_CONFIG_ID_B }) });
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(script).toContain(PLAYER_CONFIG_ID_B); // o id do player é público por design (embed)
    expect(script).not.toContain(MARKER_B);
    expect(script).not.toContain("VSL da conta B");
  });
});

describe("BOLA: sessão de A tentando objeto de B — POST/PATCH /api/account/team", () => {
  it("aceitar convite de B → 404 invite_not_available (convite é amarrado ao e-mail do convidado)", async () => {
    const response = await teamPost(request("POST", { action: "accept", inviteId: "invite-b" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "invite_not_available" });
    expect(insertedValues(fake(), "account_team_members")).toEqual([]);
  });

  it("controle positivo: aceitar o convite de A funciona (404 de B é posse, não rota quebrada)", async () => {
    const response = await teamPost(request("POST", { action: "accept", inviteId: "invite-a" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
  });

  it("PATCH mudando papel do membro de B → 400 member_not_editable, nenhuma update executada", async () => {
    const response = await teamPatch(request("PATCH", { memberId: "member-b", role: "viewer" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "member_not_editable" });
    expect(captured.mutationWheres.filter((entry) => entry.table === "account_team_members")).toEqual([]);
  });
});
