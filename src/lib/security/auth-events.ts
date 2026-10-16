import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getPostHogClient } from "@/lib/posthog-server";

/**
 * Eventos de segurança (tabela security_events) — Drizzle + Lakebase Postgres.
 *
 * O id do usuário é o id do usuário do Neon Auth (TEXT). Escrita via `db`
 * (client Drizzle) em SQL parametrizado.
 *
 * Schema (drizzle/schema.ts `securityEvents`, compatível com o uso abaixo):
 * id bigint identity PK · user_id text NOT NULL · event_type text NOT NULL ·
 * metadata jsonb NOT NULL default {} · created_at timestamptz NOT NULL ·
 * índice (user_id, created_at DESC).
 *
 * Não há RLS no Lakebase para este app — a filtragem por usuário acontece
 * SEMPRE em SQL (WHERE user_id = sessão).
 */

export type SecurityEventRow = { id: string; event_type: string; metadata: unknown; created_at: string };

/**
 * `db.execute` do Drizzle pode devolver `{ rows }` (drivers pg/neon-http) ou
 * o array direto (driver neon-serverless). Normaliza sem duplicar a query.
 */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const result = await db.execute(sql`SELECT id::text AS id FROM profiles WHERE lower(email) = ${email} LIMIT 1`);
  const rows = rowsOf<{ id: string }>(result);
  return rows[0]?.id ?? null;
}

/** Registra um evento de segurança para um usuário já identificado. */
export async function recordSecurityEvent(
  eventType: string,
  options: { userId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const metadata = options.metadata ?? {};
  await db.execute(sql`
    INSERT INTO security_events (user_id, event_type, metadata)
    VALUES (${options.userId}, ${eventType}, ${JSON.stringify(metadata)}::jsonb)
  `);
}

export async function recordAuthFailure(eventType: "login_failed" | "signup_failed", email: string, request: Request) {
  // x-forwarded-for pode vir como "client, proxy1, proxy2"; pegamos o primeiro (cliente)
  const xff = request.headers.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0].trim() : "") || request.headers.get("x-real-ip") || "";
  try {
    const userId = await findUserIdByEmail(email);
    if (userId) {
      await recordSecurityEvent(eventType, { userId, metadata: { email, ip } });
    }
  } catch {
    // Falha de telemetria nunca bloqueia o fluxo de auth.
  }
  getPostHogClient().capture({
    distinctId: email,
    event: eventType,
    properties: { email, ip },
  });
}

/** Lista os eventos mais recentes do usuário (GET /api/account/security). */
export async function listRecentSecurityEvents(userId: string, limit = 20): Promise<SecurityEventRow[]> {
  const result = await db.execute(sql`
    SELECT id::text AS id, event_type, metadata, created_at
    FROM security_events
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rowsOf<{
    id: string;
    event_type: string;
    metadata: unknown;
    created_at: Date | string;
  }>(result).map((row) => ({
    id: String(row.id),
    event_type: String(row.event_type),
    metadata: row.metadata ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}
