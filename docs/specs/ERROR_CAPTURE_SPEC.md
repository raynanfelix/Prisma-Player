# Error Capture System Specification (Phase 1)

## Overview
A self-hosted error capture, deduplication, and triage system for Prisma Player. Captures both client-side and server-side errors, stores them in a dedicated Postgres table with fingerprint-based aggregation, and exposes an admin panel for monitoring. No external services (Sentry, etc.) — fully integrated into the existing Neon + Drizzle + Next.js stack.

## Architecture Decisions (Grilled & Confirmed)

1. **Scope**: Client + Server capture. Production + Preview environments. Dev disabled by default.
2. **Storage**: Dedicated `error_events` table. One row per fingerprint (SHA-256-derived hash). Aggregated count, not raw event log.
3. **Sanitization**: Reuses regex patterns from `alert-webhook.ts`. Stack ≤ 2KB, context ≤ 4KB. Never captures request bodies.
4. **Deduplication**: Fingerprint = severity + message + top app stack frame + route. Client-side session cap of 10 distinct fingerprints. Server-side upsert via `ON CONFLICT`.
5. **Rate Limiting**: Ingest endpoint limited to 30 requests/min/IP via in-memory map. Fail-open (returns 204 on failure).
6. **Server Capture**: Next.js `instrumentation.ts` with `onRequestError` hook for unhandled route errors. Explicit `captureServerError()` helper available for critical catch blocks.
7. **Client Capture**: Global `window.onerror` + `unhandledrejection` listeners. React `AppErrorBoundary` for render errors. Mounted in `AppShell` via `ClientErrorCapture` wrapper.
8. **Admin Panel**: `/admin/errors` — server component listing last 100 error groups sorted by `last_seen DESC`. Status editable via `PATCH /api/admin/errors`.
9. **Security**: RLS on `error_events` (authenticated only). Admin guard on all admin routes. Secrets redacted before storage.
10. **Fail-Open Principle**: Error capture must never break the application. All capture functions swallow their own errors silently.

## Schema

```sql
CREATE TABLE error_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint   TEXT NOT NULL UNIQUE,
  severity      TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','investigating','fixed','validated','reopened')),
  count         INTEGER NOT NULL DEFAULT 1,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample        JSONB NOT NULL,
  issue_url     TEXT,
  issue_number  INTEGER,
  version       TEXT
);
```

## File Manifest (Phase 1)

| File | Purpose |
|------|---------|
| `drizzle/schema.ts` | Added `errorEvents` table definition |
| `drizzle/0006_error_events_capture.sql` | Migration SQL with RLS policies |
| `src/lib/errors/sanitize.ts` | Shared sanitization + fingerprint computation |
| `src/lib/errors/capture-server.ts` | Server-side capture helper (server-only) |
| `src/lib/errors/capture-client.ts` | Client-side global listeners + session dedup |
| `src/components/errors/AppErrorBoundary.tsx` | React Error Boundary with capture |
| `src/components/errors/ClientErrorCapture.tsx` | Init wrapper mounted in AppShell |
| `src/app/api/errors/ingest/route.ts` | Client error ingestion endpoint |
| `src/app/api/admin/errors/route.ts` | Admin status update endpoint |
| `src/app/admin/errors/page.tsx` | Admin error monitor UI |
| `src/instrumentation.ts` | Next.js server error hook |
| `src/components/app-shell.tsx` | Modified to wrap children with ClientErrorCapture |
| `tests/server-boundary.test.ts` | Registered `lib/errors/capture-server.ts` |

## Future Phases (Not Implemented)

- **Phase 2**: GitHub Issue auto-creation with thresholds (HIGH or ≥3 occurrences, 24h dedup, 5/day cap)
- **Phase 3**: Agent fix flow (`docs/AGENT_FIX_FLOW.md`), PR draft creation
- **Phase 4**: AI analysis abstraction (`ErrorAnalyzer` interface), Telegram notifications via `alertOperations`
- **Animations**: Apply Account Menu motion patterns to dashboard pages (between Phase 1 and 2)

## Limitations

- No mutation testing (documented trade-off)
- No cross-tab/cross-origin error capture
- AI analysis requires external credential (not yet configured)
- GitHub Issues require `GITHUB_ISSUE_TOKEN` env var (not yet configured)
- Client capture disabled in development mode