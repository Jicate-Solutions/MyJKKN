# Global Calendar Module — Phase 3 (Events/Meetings Aggregation + Settings UI) Plan

> Builds on Phases 1-2 (branch `feat/global-calendar-phase-1`). Same verification model.

**Goal:** (A) Aggregate institutional events + board meetings onto the calendar; (B) build the super-admin settings/control-panel UI (`/calendar/settings`: feed toggles, per-institution overrides, categories CRUD).

## Scope (confirmed)
- **Events** (`kind='event'`, feed `events`): `events` + `lc_events` + `startup_events`. Public/institutional → no permission gate, only institution scope. NULL institution (lc_events, startup_events) = all-JKKN (shown to everyone, like `scope IS NULL`).
- **Meetings** (`kind='meeting'`, feed `meetings`): `bos_meetings` only (institutional). **Excluded:** personal `meeting_bookings` (privacy), `project_meeting_links` (no institution/end/status).
- **Settings UI:** full — Feeds tab + Categories tab + Per-institution overrides tab.

## Global Constraints
Inherit Phases 1-2. Events/meetings are non-sensitive (no people-leave gate). Name cols cast `::text`. Additive CREATE OR REPLACE preserves the 5 existing branches verbatim. Settings writes gated by `calendar.config.manage` (RLS already enforces; UI gates buttons via `canAccess('calendar.config','manage')`).

---

## Task 1 — Resolver: add 4 event/meeting branches (DB; controller-applied)
CREATE OR REPLACE `fn_calendar_items`, keeping branches 1-5 (Phase 1 holidays + Phase 2 leave) byte-for-byte, adding:

- **Source 6 `events`:** JOIN institutions; `start=COALESCE(start_date,event_date::timestamptz)`, `end=COALESCE(end_date,start_date,event_date::timestamptz)`, all_day=false; `WHERE COALESCE(is_active,true) AND status NOT IN ('draft','cancelled') AND institution_id = ANY(v_effective) AND start IS NOT NULL` + kind/feed('events')/date/feed-enabled. category 'Event' #22c55e, visibility=COALESCE(visibility,'public').
- **Source 7 `lc_events`** (source_module `lc_event`): LEFT JOIN institutions; start=starts_at end=ends_at; `WHERE status IN ('pending_review','approved','published','in_progress','completed') AND (institution_id IS NULL OR institution_id = ANY(v_effective))` + gates. category 'Council Event' #14b8a6.
- **Source 8 `startup_events`** (source_module `startup_event`): LEFT JOIN institutions on host_institution_id; start=start_date end=COALESCE(end_date,start_date); `WHERE status <> 'draft' AND start_date IS NOT NULL AND (host_institution_id IS NULL OR host_institution_id = ANY(v_effective))` + gates. category 'Startup Event' #f97316.
- **Source 9 `bos_meetings`** (source_module `bos_meeting`, kind='meeting'): JOIN institutions; all_day=true, start=scheduled_date::timestamptz, end=scheduled_date::timestamptz + 1day - 1s; title=COALESCE(meeting_title, meeting_type||' Meeting'); `WHERE status <> 'draft' AND scheduled_date IS NOT NULL AND institution_id = ANY(v_effective)` + kind('meeting')/feed('meetings')/date/feed-enabled. category 'Board Meeting' #8b5cf6. meta={scheduled_time,meeting_number,status}.

All blocks_attendance=false, person_name=NULL. Re-add REVOKE/GRANT. Verify executes (no 42804/42702) + counts of source rows. Mirror deferred. Migration `20260623120000_calendar_events_meetings_sources.sql`.

## Task 2 — Settings service + hooks (implementer)
Extend `CalendarService` (or new methods): `listFeedSettings()` (all rows), `upsertFeedSetting(feed_key, institution_id|null, is_enabled)` (insert or update by the partial-unique key), `createCategory/updateCategory/deleteCategory`. Hooks in `hooks/calendar/use-calendar.ts`: `useFeedSettings`, `useUpsertFeedSetting`, `useCreateCategory/useUpdateCategory/useDeleteCategory` (invalidate `queryKeys.calendar.all`). Known feed keys constant: `['global_entries','academic_holidays','hr_public_holidays','staff_leave','student_leave','events','meetings']` with labels.

## Task 3 — `/calendar/settings` page (implementer)
Server shell + client component, gated by route layout (`calendar.config.manage`). Three tabs (shadcn Tabs):
- **Feeds:** list known feeds with a global on/off Switch each (resolves current state from feed settings where institution_id IS NULL; default ON). Toggling calls upsertFeedSetting(key, null, value).
- **Categories:** table of calendar_categories + create/edit dialog (name, slug, color_code, sort_order) + delete; gated by `canAccess('calendar.config','manage')`.
- **Per-institution overrides:** institution picker (useInstitutionsWithAccess) + per-feed Switch that upserts (key, institutionId, value); shows which feeds are overridden for that institution.

## Task 4 — UI feed chips (implementer)
`calendar-view.tsx`: add `{key:'events',label:'Events'}` and `{key:'meetings',label:'Meetings'}` to BASE_FEEDS (always visible — not permission-gated). `feedKeyFor`: map `events`/`lc_event`/`startup_event` → `events`; `bos_meeting` → `meetings`. (Leave items unchanged.)

## Task 5 — Final verification
gen:routes (picks up /calendar/settings page) + check:menus (settings key already declared). Browser smoke: events + board meetings render; settings toggles hide/show feeds; categories CRUD. Whole-branch review of Phase-3 commits.
