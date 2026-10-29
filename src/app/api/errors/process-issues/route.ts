import { NextResponse } from "next/server";
import { desc, isNull, sql } from "drizzle-orm";
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
    // Basic auth: only allow from Vercel Cron (has header) or internal calls
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Allow localhost/internal calls without auth for dev convenience
      const url = new URL(request.url);
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    // Fetch candidate error events: no issue_url yet, ordered by severity then recency
    const candidates = await db
      .select()
      .from(errorEvents)
      .where(isNull(errorEvents.issueUrl))
      .orderBy(desc(errorEvents.severity), desc(errorEvents.lastSeen))
      .limit(20); // Process up to 20 per run to respect rate limits

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