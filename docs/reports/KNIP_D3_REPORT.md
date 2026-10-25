# D3 — Knip / Dedup Report

**Date**: 2026-10-25
**Executor**: Lead (direct execution after teammate timeout)
**Command**: `NODE_OPTIONS='--max-old-space-size=8192' npx knip`
**Status**: ✅ COMPLETE

## Summary

| Category | Count |
|---|---|
| Unused files | 10 |
| Unused dependencies | 2 |
| Unused exports | 45 |
| Unused exported types | 1 |
| Configuration hints | 3 |

## Unused Files (10)

1. `src/app/dashboard/conversions/performance-charts.tsx`
2. `src/components/ui/avatar.tsx`
3. `src/components/ui/input-group.tsx`
4. `src/components/ui/table.tsx`
5. `src/components/ui/textarea.tsx`
6. `src/features/intelligence/components/IntelligenceControls.tsx`
7. `src/features/marketing/components/Footer.tsx`
8. `src/features/marketing/components/Nav.tsx`
9. `src/lib/billing/service.ts`
10. `src/lib/realtime/client.ts`

## Unused Dependencies (2)

| Package | Location |
|---|---|
| `@dnd-kit/sortable` | `package.json:20:6` |
| `@neon/realtime-react` | `package.json:24:6` |

## Unused Exports (45)

### kibo-ui (Kanban) — DO NOT TOUCH (parallel front owns these)
- `KanbanOverlay` — `src/components/kibo-ui/kanban/index.tsx:212:17`

### UI Components
- `BubbleGroup`, `BubbleReactions` — `src/components/ui/bubble.tsx:127`
- `CalendarDayButton` — `src/components/ui/calendar.tsx:221:20`
- `Line` (×2), `LegendItem` (×2), `LegendMarker` (×2), `LegendLabel` (×2), `LegendValue` (×2), `LegendProgress` (×2) — charts
- `DatePicker` — `src/components/ui/date-picker.tsx:76:17`
- `FieldGroup`, `FieldLegend`, `FieldSeparator`, `FieldSet`, `FieldContent`, `FieldTitle` — `src/components/ui/field.tsx`
- `MarkerIcon`, `markerVariants` — `src/components/ui/marker.tsx:70`
- `useMessageScroller`, `useMessageScrollerScrollable`, `useMessageScrollerVisibility` — `src/components/ui/message-scroller.tsx`
- `MessageFooter`, `MessageHeader` — `src/components/ui/message.tsx`
- `PopoverDescription`, `PopoverHeader` — `src/components/ui/popover.tsx`

### Features
- `pixelVerifyReady` — `src/features/integrations/components/PixelVerifyPanel.tsx:85:17`
- `FEATURE_APPS` — `src/features/integrations/components/store-data.ts:310:14`

### Lib / Services
- `formatStorageOverage` — `src/lib/billing/catalog.ts:161:17`
- `BILLING` — `src/lib/constants.ts:63:14`
- `daysAgoIso` — `src/lib/datetime.ts:20:17`
- `listProviderInstances`, `getIntegration`, `resolveIntegrationsForVideo` — `src/lib/integrations/server.ts`
- `PLAYER_CONFIG_SERVER_ONLY_KEYS`, `EMBED_CONFIG_KEYS` — `src/lib/player/config-keys.ts`
- `streamIpFromHeaders` — `src/lib/player/stream-key.ts:19:17`
- `liveEventsQuery` — `src/lib/realtime/server.ts:59:17`
- `authClient` — `src/services/auth/social-client.ts:19:14`

## Unused Exported Types (1)

- `RoadmapTaskInput` — `src/lib/roadmap.ts:17:13` ⚠️ **DO NOT TOUCH** (Kanban front owns `src/lib/roadmap.ts`)

## Configuration Hints (3)

1. `instrumentation-client.ts` — refine entry pattern (no matches)
2. `instrumentation-client.ts` — refine project pattern (no matches)
3. `src/proxy.ts` — remove redundant entry pattern

## Action Items

### Safe to Remove Now (not in Kanban exclusion zone)
- [ ] Delete 9 unused files (all except kibo-ui)
- [ ] Remove `@dnd-kit/sortable` and `@neon/realtime-react` from `package.json`
- [ ] Clean up unused lib/services exports
- [ ] Address configuration hints in `knip.json`

### Deferred (Kanban Front Exclusion Zone)
- `KanbanOverlay` export in `kibo-ui/kanban/`
- `RoadmapTaskInput` type in `src/lib/roadmap.ts`

### Review Before Removal
- UI component exports (may be used by shadcn CLI or future features)
- `authClient` in social-client (may be needed for OAuth flows)

## Notes

- Knip ran successfully with `--max-old-space-size=8192`; no OOM crash.
- Exit code 1 is expected when knip finds unused items.
- Raw output preserved at `docs/reports/KNIP_D3_RAW_OUTPUT.txt`.