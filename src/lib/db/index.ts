import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

import * as schema from "../../../drizzle/schema";

/**
 * Cliente Postgres único do Prisma Player (Drizzle + node-postgres).
 *
 * Conexão: DATABASE_URL deve ser a connection string POOLED do Neon
 * (hostname com sufixo `-pooler`) - regra da skill neon-postgres para
 * Vercel/serverless. Para migrations e tarefas com estado de sessão use
 * DATABASE_URL_UNPOOLED (ver drizzle.config.ts).
 *
 * LAZY: pool e client são criados no PRIMEIRO acesso (proxies sobre as
 * instâncias reais, cacheadas em `globalThis`). Importar este módulo não
 * abre conexão nem exige DATABASE_URL - a coleta de módulos em testes e o
 * `next build` funcionam sem rede; a falha explícita acontece na primeira
 * query real. `attachDatabasePool` (Vercel Fluid) sinaliza o pool ao
 * runtime para drenagem limpa.
 */

const globalForDb = globalThis as unknown as {
  prismaPlayerPool?: Pool;
  prismaPlayerDb?: NodePgDatabase<typeof schema>;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada: use a connection string POOLED do Neon (hostname com -pooler).",
    );
  }

  const pool = new Pool({ connectionString });
  attachDatabasePool(pool);
  return pool;
}

function getPool(): Pool {
  if (!globalForDb.prismaPlayerPool) {
    globalForDb.prismaPlayerPool = createPool();
  }
  return globalForDb.prismaPlayerPool;
}

function getDb(): NodePgDatabase<typeof schema> {
  if (!globalForDb.prismaPlayerDb) {
    globalForDb.prismaPlayerDb = drizzle(getPool(), { schema });
  }
  return globalForDb.prismaPlayerDb;
}

const pool: Pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    const real = getPool() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, property, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, property, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, property, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
