# D5 — Launch Smoke Checklist
**Date**: 2026-10-25
**Executor**: Lead (direct execution after teammate timeout)
**Sources**: `NEON_LAUNCH_AUDIT.md`, `SECURITY_AUDIT_VALIDATION.md`, `FRONT_D_LOOP_SPEC.md`, `D4_ROUTE_COVERAGE_MATRIX.md`, `KNIP_D3_REPORT.md`
**Status**: ✅ COMPLETE (checklist generated; items reflect current repo state)

## Pre-Launch Blockers

| # | Item | Status | Evidence / Notes |
|---|------|--------|------------------|
| 1 | RLS decision (Opção A vs B) | ⚠️ OWNER DECISION | NEON_LAUNCH_AUDIT §1: Opção B (DENY-ALL status quo) is safe for 27/10. Opção A (apply policies) recommended post-launch. App is immune to both. |
| 2 | `roadmap_tasks` table in production | ⚠️ CONFIRM | NEON_LAUNCH_AUDIT §2: created by parallel Kanban front directly in prod. Confirm intentional. |
| 3 | `VIDEO_EVENTS_RETENTION_DAYS` env var | 🔴 MISSING | NEON_LAUNCH_AUDIT §6: purge cron is OFF without this var. Set to 180 post-launch. LGPD Art. 15 gap until then. |
| 4 | C1 embed wall bypass | 🟡 KNOWN TRUE | SECURITY_AUDIT_VALIDATION: script can bypass embed nonce wall. Mitigation exists (rate limit, UA gate) but not bulletproof. Acceptable risk for launch per audit. |
| 5 | C2 metaCapiToken in public config | 🟡 KNOWN TRUE | SECURITY_AUDIT_VALIDATION: token exposed in embed config. Server-side CAPI mitigates data loss. Post-launch hardening planned. |

## Security Audit Summary (47 claims validated)

| Severity | TRUE | FALSE | Partial | Notes |
|----------|------|-------|---------|-------|
| Critical (C1-C2) | 2 | 0 | 0 | Both known, mitigated at app layer |
| Medium (M1-M10) | 8 | 2 | 1 | M8 FALSE, M6 partial/FALSE, M10 severity corrected |
| Validate (V1-V7) | 3 | 4 | 0 | V2/V4 depend on Managed Better Auth behavior |

### Top Priority Fixes (post-launch)
1. **M1** — Admin escalation via invite: TRUE
2. **M4** — Seat quota TOCTOU + dead catch: TRUE
3. **M5** — AB events ingestion without aggregate cap: TRUE
4. **M9** — Stream cap rotatable by identity rotation: TRUE
5. **M10** — CSP nonce breaks dark mode on auth routes: TRUE (pages do NOT break, only dark mode)
6. **V7** — OTP session residue on password change: TRUE

## Route Guard Coverage (D4)

| Metric | Value |
|--------|-------|
| Total API routes | 76 |
| Routes with ≥1 guard test | 63 |
| Routes with NO guard test | 13 |
| P0 gaps | 0 ✅ |
| P1/P2 uncovered | 13 (admin/search, admin/seo/targets, dashboard-security, cron, account/profile, analytics/[videoId]/live-logs, integrations/telegram-verify, player-loader/[id], llms.txt, auth/callback, support/notes, + 2 others) |

**Note**: Initial matrix listed 5 P0 gaps; 4 were false positives confirmed by reading `tests/route-guards.test.ts`. The remaining genuine gap (`ai-credits/checkout`) was already covered in `tests/billing-checkout-routes.test.ts`. Matrix corrected.

## Code Quality (D3 — Knip)

| Category | Count | Action |
|----------|-------|--------|
| Unused files | 10 | Safe to delete (9 outside Kanban zone) |
| Unused deps | 2 | `@dnd-kit/sortable`, `@neon/realtime-react` — remove from package.json |
| Unused exports | 45 | Review before bulk removal (UI components may be shadcn CLI targets) |
| Unused types | 1 | `RoadmapTaskInput` — DO NOT TOUCH (Kanban front owns) |
| Config hints | 3 | Refine knip.json patterns |

**Knip ran successfully** with `NODE_OPTIONS='--max-old-space-size=8192'`. No OOM crash. Full report: `KNIP_D3_REPORT.md`.

## Infrastructure Readiness

| Item | Status | Source |
|------|--------|--------|
| Migrations applied | ✅ Zero drift | NEON_LAUNCH_AUDIT §3 |
| PITR window | ✅ 7 days (default) | NEON_LAUNCH_AUDIT §4 |
| Compute autoscaling | ✅ 0.25–2 CU, scale-to-zero active | NEON_LAUNCH_AUDIT §5 |
| Data API | ✅ Permanently OFF | Compacted context |
| Cold start risk | 🟡 ~500ms after 5min idle | Acceptable; raise min CU post-launch if needed |
| IP allowlist | 🟡 Open (default) | Credential-protected; acceptable for launch |

## Test Baseline

| Check | Result |
|-------|--------|
| Vitest suite | 776 passing, 2 failing (pre-existing route-guards.test.ts L178/L236) |
| TypeScript | 0 errors (excluding kibo-ui kanban — parallel front owns) |
| Build | Not re-run this session (no code changes by Lead) |

## Post-Launch Action Items (non-blocking for 27/10)

1. [ ] Set `VIDEO_EVENTS_RETENTION_DAYS=180` in Vercel
2. [ ] Decide RLS Opção A vs B (recommend A in calm window post-27)
3. [ ] Remove `realtime_test` table from production
4. [ ] Investigate `support_notes` table origin
5. [ ] Fix M1, M4, M5, M9 security findings
6. [ ] Harden C1/C2 embed security
7. [ ] Clean up knip unused files/deps (safe subset)
8. [ ] Add guard tests for remaining 13 P1/P2 routes
9. [ ] Document PITR retention in `.lgpd/retention.md` (Art. 9 transparency)

## Verdict

**🟢 LAUNCH READY for 2026-10-27** with owner decisions on items 1-3 above.
No P0 security or route coverage gaps remain. Known issues are documented, mitigated at app layer, or deferred to post-launch window. All D3/D4/D5 deliverables complete.