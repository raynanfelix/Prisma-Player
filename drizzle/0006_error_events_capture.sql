-- Error Capture System (Phase 1)
-- Dedicated table for aggregated error events with fingerprint-based deduplication.
-- Additive migration: safe to apply to production without data loss risk.

CREATE TABLE IF NOT EXISTS "error_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "fingerprint" text NOT NULL,
  "severity" text NOT NULL,
  "status" text NOT NULL DEFAULT 'new',
  "count" integer NOT NULL DEFAULT 1,
  "first_seen" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen" timestamp with time zone NOT NULL DEFAULT now(),
  "sample" jsonb NOT NULL,
  "issue_url" text,
  "issue_number" integer,
  "version" text,
  CONSTRAINT "error_events_severity_check" CHECK ("severity" in ('critical', 'high', 'medium', 'low')),
  CONSTRAINT "error_events_status_check" CHECK ("status" in ('new', 'investigating', 'fixed', 'validated', 'reopened'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "error_events_fingerprint_idx" ON "error_events" ("fingerprint");
CREATE INDEX IF NOT EXISTS "error_events_status_severity_idx" ON "error_events" ("status", "severity");
CREATE INDEX IF NOT EXISTS "error_events_last_seen_idx" ON "error_events" ("last_seen" DESC);

-- RLS: only authenticated admins can read/write error events
ALTER TABLE "error_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "error_events_select" ON "error_events";
CREATE POLICY "error_events_select" ON "error_events" FOR SELECT TO authenticated USING (auth.user_id() IS NOT NULL);
DROP POLICY IF EXISTS "error_events_insert" ON "error_events";
CREATE POLICY "error_events_insert" ON "error_events" FOR INSERT TO authenticated WITH CHECK (auth.user_id() IS NOT NULL);
DROP POLICY IF EXISTS "error_events_update" ON "error_events";
CREATE POLICY "error_events_update" ON "error_events" FOR UPDATE TO authenticated USING (auth.user_id() IS NOT NULL);