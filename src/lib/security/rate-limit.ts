import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { SECURITY } from "@/lib/constants";
import { clientIpFromRequest, limitHeaders, limitedResponse } from "@/lib/security/rate-limit-shared";

const { rateLimits } = schema;

let lastCleanup = 0;

async function cleanupExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < SECURITY.RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  try {
    await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date()));
  } catch {
  }
}

export type RateLimitOptions = { max: number; windowMs: number; failClosed?: boolean; identifier?: string };

/** Evita persistir e-mail, IP alternativo ou outro identificador sensivel. */
export function hashRateLimitIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type RateLimitResult =
  | { limited: true; response: Response }
  | { limited: false; headers: Record<string, string> };

/**
 * Incremento atômico em janela fixa (equivalente ao upsert da migration
 * `20260721120000_atomic_rate_limit.sql`): INSERT ... ON CONFLICT (key) DO
 * UPDATE ... RETURNING executa leitura e escrita numa única statement, então
 * requisições concorrentes com a mesma chave nunca leem a mesma contagem -
 * o padrão read-then-update antigo deixava a rajada passar do limite.
 *
 * A janela é fixa: o primeiro hit define `expires_at` e os hits seguintes
 * apenas incrementam até a janela expirar. Janela deslizante prendia o
 * cliente em bloqueio permanente enquanto ele continuasse tentando.
 */
export async function consumeRateLimit(request: Request, scope: string, options: RateLimitOptions): Promise<RateLimitResult> {
  await cleanupExpired();

  // A janela chegava como NaN quando a variável de ambiente usava "60_000";
  // o valor virava `null` na janela e ela caía para 1 segundo.
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ? Math.round(options.windowMs) : 60_000;
  const windowSeconds = Math.max(windowMs, 1000) / 1000;
  const key = `${scope}:${options.identifier ?? clientIpFromRequest(request)}`;

  try {
    const [hit] = await db
      .insert(rateLimits)
      .values({ key, count: 1, expiresAt: new Date(Date.now() + windowMs) })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.expiresAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
          expiresAt: sql`case when ${rateLimits.expiresAt} <= now() then now() + make_interval(secs => ${windowSeconds}) else ${rateLimits.expiresAt} end`,
        },
      })
      .returning({ hitCount: rateLimits.count, windowExpiresAt: rateLimits.expiresAt });

    if (!hit) throw new Error("rate_limit_unavailable");
    const resetEpochSeconds = Math.ceil(hit.windowExpiresAt.getTime() / 1000);
    if (hit.hitCount <= options.max) {
      return { limited: false, headers: limitHeaders(options.max, options.max - hit.hitCount, resetEpochSeconds) };
    }
    const retryAfter = Math.ceil((hit.windowExpiresAt.getTime() - Date.now()) / 1000);
    return { limited: true, response: limitedResponse(options.max, retryAfter, resetEpochSeconds) };
  } catch {
    const resetEpochSeconds = Math.ceil((Date.now() + windowMs) / 1000);
    if (!options.failClosed) return { limited: false, headers: limitHeaders(options.max, options.max, resetEpochSeconds) };
    return { limited: true, response: limitedResponse(options.max, Math.ceil(windowMs / 1000), resetEpochSeconds) };
  }
}

export async function rateLimit(request: Request, scope: string, options: RateLimitOptions): Promise<Response | null> {
  const result = await consumeRateLimit(request, scope, options);
  return result.limited ? result.response : null;
}
