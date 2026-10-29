import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sanitizeError, computeFingerprint } from "@/lib/errors/sanitize";
import { clientIpFromRequest } from "@/lib/security/rate-limit-shared";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

/**
 * Client-side error ingestion endpoint.
 * Rate-limited by IP, fail-open, sanitizes all input server-side.
 * Never trusts client-provided fingerprints — recomputes from sanitized payload.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIpFromRequest(request);
    if (!checkRateLimit(ip)) {
      return new NextResponse(null, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new NextResponse(null, { status: 400 });
    }

    const sanitized = sanitizeError({
      message: (body as Record<string, unknown>).message,
      stack: (body as Record<string, unknown>).stack,
      route: (body as Record<string, unknown>).route,
      component: (body as Record<string, unknown>).component,
      severity: (body as Record<string, unknown>).severity,
    });

    const fingerprint = computeFingerprint(sanitized);
    const version = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
    const sample = {
      message: sanitized.message,
      stack: sanitized.stack,
      route: sanitized.route,
      component: sanitized.component,
    };

    await db.execute(sql`
      INSERT INTO error_events (fingerprint, severity, status, count, first_seen, last_seen, sample, version)
      VALUES (${fingerprint}, ${sanitized.severity}, 'new', 1, now(), now(), ${JSON.stringify(sample)}::jsonb, ${version})
      ON CONFLICT (fingerprint) DO UPDATE SET
        count = error_events.count + 1,
        last_seen = now(),
        sample = EXCLUDED.sample,
        version = EXCLUDED.version
    `);

    return new NextResponse(null, { status: 204 });
  } catch {
    // Fail-open: never return 500 from the error capture endpoint
    return new NextResponse(null, { status: 204 });
  }
}