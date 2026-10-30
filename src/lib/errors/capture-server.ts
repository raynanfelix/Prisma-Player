import "server-only";

import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { sanitizeError, computeFingerprint } from "./sanitize";
import { notifyCriticalError } from "./analyzer";

const { errorEvents } = schema;

/**
 * Captures a server-side error into the error_events table.
 * Fail-open: never throws, never blocks the calling route.
 * Deduplicates by fingerprint — increments count and updates last_seen
 * for existing rows, inserts new row for first occurrence.
 */
export async function captureServerError(input: {
  error: unknown;
  route?: string;
  component?: string;
  severity?: "critical" | "high" | "medium" | "low";
}): Promise<void> {
  try {
    const err = input.error instanceof Error ? input.error : new Error(String(input.error));
    const sanitized = sanitizeError({
      message: err.message,
      stack: err.stack,
      route: input.route,
      component: input.component,
      severity: input.severity,
    });
    const fingerprint = computeFingerprint(sanitized);
    const version = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

    const sample = {
      message: sanitized.message,
      stack: sanitized.stack,
      route: sanitized.route,
      component: sanitized.component,
    };

    // Upsert: increment count + update last_seen if exists, otherwise insert.
    // Using raw SQL for atomic upsert since Drizzle's onConflictDoUpdate
    // doesn't support conditional default values cleanly.
    await db.execute(sql`
      INSERT INTO error_events (fingerprint, severity, status, count, first_seen, last_seen, sample, version)
      VALUES (${fingerprint}, ${sanitized.severity}, 'new', 1, now(), now(), ${JSON.stringify(sample)}::jsonb, ${version})
      ON CONFLICT (fingerprint) DO UPDATE SET
        count = error_events.count + 1,
        last_seen = now(),
        sample = EXCLUDED.sample,
        version = EXCLUDED.version
    `);

    // Notify via Telegram for critical/high severity errors (fail-open).
    // Runs after DB write so notification failure never blocks capture.
    void notifyCriticalError(sanitized, fingerprint);
  } catch {
    // Fail-open: error capture must never break the app.
  }
}