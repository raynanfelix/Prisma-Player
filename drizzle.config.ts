import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit — Prisma Player (Lakebase Postgres / Neon).
 *
 * - `npx drizzle-kit generate` gera SQL a partir de drizzle/schema.ts
 *   (não conecta no banco).
 * - `npx drizzle-kit push|migrate` precisa da connection string DIRETA
 *   (DATABASE_URL_UNPOOLED, sem o sufixo `-pooler`): o PgBouncer em modo
 *   transação não suporta operações de sessão usadas por migrations.
 */
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgresql://localhost:5432/prisma_player",
  },
  strict: false,
  verbose: true,
});
