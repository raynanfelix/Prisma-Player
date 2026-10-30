import { NextResponse } from "next/server";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createGitHubIssue } from "@/lib/errors/github-issues";

const { errorEvents } = schema;

/**
 * POST /api/errors/process-issues
 * Evaluates unlinked error events against Phase 2 thresholds and creates
 * GitHub Issues for qualifying errors. Designed to be called by Vercel Cron
 * or manually via admin panel.
 *
 * Returns summary of issues created. Fail-open per event — one failure
 * does not block processing of remaining events.
 */
export async function POST(request: Request) {
  try {
    // Parse optional body for manual single-fingerprint trigger
    const body = await request.json().catch(() => null);
    const manualFingerprint =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).fingerprint === "string"
        ? ((body as Record<string, unknown>).fingerprint as string)
        : null;

    // Basic auth: only allow from Vercel Cron (has header) or internal/admin calls
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const url = new URL(request.url);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (!isCron && !isLocal && !manualFingerprint) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let candidates: Array<typeof errorEvents.$inferSelect>;

    if (manualFingerprint) {
      // Manual trigger: fetch specific fingerprint regardless of thresholds
      const row = await db
        .select()
        .from(errorEvents)
        .where(eq(errorEvents.fingerprint, manualFingerprint))
        .limit(1);
      if (!row.length) {
        return NextResponse.json({ error: "not_found", details: [] }, { status: 404 });
      }
      candidates = row;
    } else {
      // Cron mode: fetch unlinked events ordered by severity then recency
      candidates = await db
        .select()
        .from(errorEvents)
        .where(isNull(errorEvents.issueUrl))
        .orderBy(desc(errorEvents.severity), desc(errorEvents.lastSeen))
        .limit(20);
    }

    const results: Array<{
      fingerprint: string;
      action: "created" | "skipped" | "failed";
      issueUrl?: string;
      reason?: string;
    }> = [];

    for (const event of candidates) {
      try {
        const result = await createGitHubIssue(event.fingerprint);
        if (result) {
          results.push({
            fingerprint: event.fingerprint,
            action: "created",
            issueUrl: result.url,
          });
        } else {
          results.push({
            fingerprint: event.fingerprint,
            action: "skipped",
            reason: "threshold_not_met_or_dedup",
          });
        }
      } catch (err) {
        results.push({
          fingerprint: event.fingerprint,
          action: "failed",
          reason: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }

    const created = results.filter((r) => r.action === "created").length;
    const skipped = results.filter((r) => r.action === "skipped").length;
    const failed = results.filter((r) => r.action === "failed").length;

    return NextResponse.json({
      processed: candidates.length,
      created,
      skipped,
      failed,
      details: results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "processing_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}