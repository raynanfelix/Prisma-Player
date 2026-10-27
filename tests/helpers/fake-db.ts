import { getTableName } from "drizzle-orm";

/**
 * Fake do client Drizzle (`@/lib/db`) para testes unitários das rotas e
 * serviços convertidos. As cadeias do query builder são thenables que
 * registram inserts/updates (com os valores recebidos) e devolvem resultados
 * configuráveis por tabela - suficiente para provar as regras de negócio
 * (user_id da sessão, gates fail-closed, idempotência de ledger) sem banco.
 *
 * Uso:
 *   vi.mock("@/lib/db", async () => {
 *     const { installFakeDb } = await import("./helpers/fake-db");
 *     const schema = await vi.importActual("../drizzle/schema");
 *     const fake = installFakeDb();
 *     return { db: fake.db, pool: {}, schema };
 *   });
 *   const fake = currentFakeDb(); // dentro dos testes
 */

export type DbCall = {
  op: "select" | "insert" | "update" | "delete";
  table: string | null;
  method: string;
  arg: unknown;
};

export type FakeDbState = {
  calls: DbCall[];
  /** Linhas devolvidas por `select`, por nome de tabela. Default: []. */
  selectRows: Record<string, unknown[]>;
  /** Resultado de `insert(...).returning()` por nome de tabela. Default: [{ id: 1 }]. */
  insertResults: Record<string, unknown[]>;
  /** Tabelas cuja cadeia rejeita ao ser aguardada (store indisponível). */
  failingTables: Record<string, boolean>;
};

export function createFakeDbState(): FakeDbState {
  return { calls: [], selectRows: {}, insertResults: {}, failingTables: {} };
}

export type FakeDb = {
  db: {
    select: (...columns: unknown[]) => unknown;
    insert: (table: unknown) => unknown;
    update: (table: unknown) => unknown;
    delete: (table: unknown) => unknown;
    execute: (query: unknown) => Promise<{ rows: unknown[] }>;
    transaction: (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  state: FakeDbState;
};

const CHAIN_METHODS = [
  "select",
  "from",
  "innerJoin",
  "leftJoin",
  "where",
  "orderBy",
  "limit",
  "offset",
  "for",
  "values",
  "set",
  "returning",
  "onConflictDoNothing",
  "onConflictDoUpdate",
] as const;

function tableName(table: unknown): string | null {
  return table ? getTableName(table as Parameters<typeof getTableName>[0]) : null;
}

function resolveChain(state: FakeDbState, op: DbCall["op"], table: string | null): unknown {
  if (table && state.failingTables[table]) throw new Error("store unavailable");
  if (op === "select") return (table && state.selectRows[table]) || [];
  if (op === "insert") return (table && state.insertResults[table]) || [{ id: 1 }];
  return undefined;
}

export function createFakeDb(): FakeDb {
  const state = createFakeDbState();

  function makeChain(op: DbCall["op"], ref: { get: () => string | null; set: (value: unknown) => void }): unknown {
    const chain: Record<string, unknown> = {
      then: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) => Promise.resolve(resolveChain(state, op, ref.get())).then(onFulfilled, onRejected),
      catch: (onRejected?: (error: unknown) => unknown) =>
        Promise.resolve(resolveChain(state, op, ref.get())).catch(onRejected),
    };
    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        if (method === "from") ref.set(args[0]);
        // `where`/`innerJoin` alimentam testes de regressão de query: a
        // cláusula WHERE recebida é um SQL do drizzle serializável com
        // `new PgDialect().sqlToQuery(...)` (ver embed-routes.test.ts, teste
        // M9 da contagem de streams).
        if (method === "values" || method === "set" || method === "where" || method === "innerJoin") {
          state.calls.push({ op, table: ref.get(), method, arg: args[0] });
        }
        return chain;
      };
    }
    return chain;
  }

  const db = {
    select: () => {
      const ref = { get: () => null as string | null, set: () => {} };
      return makeChain("select", {
        get: () => ref.get(),
        set: (value: unknown) => {
          ref.get = () => tableName(value);
        },
      });
    },
    insert: (table: unknown) => makeChain("insert", { get: () => tableName(table), set: () => {} }),
    update: (table: unknown) => makeChain("update", { get: () => tableName(table), set: () => {} }),
    delete: (table: unknown) => makeChain("delete", { get: () => tableName(table), set: () => {} }),
    execute: async () => ({ rows: [] as unknown[] }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };

  return { db: db as FakeDb["db"], state };
}

const singleton: { fake: FakeDb | null } = { fake: null };

/** Instala (uma vez por arquivo de teste) e devolve o fake usado no vi.mock. */
export function installFakeDb(): FakeDb {
  if (!singleton.fake) singleton.fake = createFakeDb();
  return singleton.fake;
}

/** Fake já instalado pelo vi.mock - chamar dentro dos testes. */
export function currentFakeDb(): FakeDb {
  if (!singleton.fake) throw new Error("Fake db não instalado: o módulo @/lib/db ainda não foi importado.");
  return singleton.fake;
}

/** Inserts registrados numa tabela (valores de `.values(...)`). */
export function insertedValues(fake: FakeDb, table: string): unknown[] {
  return fake.state.calls
    .filter((call) => call.op === "insert" && call.table === table && call.method === "values")
    .map((call) => call.arg);
}

/** Updates registrados numa tabela (patch de `.set(...)`). */
export function updatedSets(fake: FakeDb, table: string): unknown[] {
  return fake.state.calls
    .filter((call) => call.op === "update" && call.table === table && call.method === "set")
    .map((call) => call.arg);
}

export function resetFakeDb(fake: FakeDb): void {
  fake.state.calls = [];
  fake.state.selectRows = {};
  fake.state.insertResults = {};
  fake.state.failingTables = {};
}
