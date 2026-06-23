# Global Calendar Module — Phase 4 (Academic Schedule → Room Reservations) Plan

> Builds on Phases 1-3 (branch `feat/global-calendar-phase-1`). Scope reduced after mapping: only room reservations is SQL-aggregatable.

**Goal:** Overlay room/resource reservations on the calendar.

## Scope (confirmed)
- **IN:** `resource_reservations` (kind='reservation', feed `reservations`). Real start/end timestamptz; institution via `resource_id → resources.institution_id` join; `status IN ('approved','completed')`.
- **DEFERRED:** Exams — no local table (external COE system over HTTP); needs a local mirror + ingestion job + COE API shape (separate effort, out of scope).
- **EXCLUDED:** Class timetables — recurring weekday+period JSONB pattern (~280K expanded sessions); belongs in the existing faculty-calendar, not the global feed.

## Global Constraints
Inherit Phases 1-3. Reservations are non-sensitive/institutional → institution-scoped only (no people-leave gate). Additive CREATE OR REPLACE preserves the 9 existing branches. Name cols `::text`.

---

## Task 1 — Resolver: add reservations branch (DB; controller-applied)
CREATE OR REPLACE `fn_calendar_items`, keep branches 1-9 verbatim, add Source 10:
- source_module `reservation`, kind `reservation`, feed `reservations`.
- `FROM resource_reservations rr JOIN resources r ON r.id = rr.resource_id JOIN institutions i9 ON i9.id = r.institution_id`.
- title = `r.name [': ' purpose]`; start=rr.start_time, end=rr.end_time, all_day=false; institution_id = r.institution_id; category 'Reservation' #6366f1; blocks_attendance=false; visibility 'public'.
- `WHERE rr.status IN ('approved','completed') AND r.institution_id = ANY(v_effective)` + kind/feed('reservations')/date/feed-enabled gates.
- Re-add REVOKE/GRANT. Verify by CALLING the function + reservation source count. Mirror deferred. Migration `20260623130000_calendar_reservations_source.sql`.

## Task 2 — UI + settings feed (implementer)
- `calendar-view.tsx`: add `{key:'reservations',label:'Reservations'}` to BASE_FEEDS (always-visible); `feedKeyFor`: `reservation → reservations`.
- `types/calendar.ts`: add `{key:'reservations',label:'Reservations'}` to CALENDAR_FEEDS (so the settings Feeds tab can toggle it).

## Task 3 — Final verification
Call resolver (no error); browser smoke (reservations appear). Whole-branch review of Phase-4 commits.
