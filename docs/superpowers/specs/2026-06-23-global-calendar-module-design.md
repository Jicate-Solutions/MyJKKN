# Global Calendar Module — Design Spec

- **Date:** 2026-06-23
- **Status:** Approved (design); implementation pending plan
- **Author:** Boobalan (with Claude Code)
- **Scope:** New top-level **Calendar** module for MyJKKN — a global, multi-institution calendar that unifies holidays/leave, events, meetings, and academic schedule across all institutions, with a super-admin global control layer.

---

## 1. Goal

Build one **global Calendar module** that lets:

- **Super-admins** manage and view the calendar across **all institutions** (and drill into one).
- **Every authenticated user** view a unified calendar **scoped to their institution(s)** plus **common (cross-institution) entries**.
- The group declare **common leaves/holidays** that apply to all institutions, while institution-specific leaves remain visible only to that institution.
- A super-admin **configure & control globally**: define common holidays/events, toggle which module feeds appear, override scope per institution, and manage categories/colors.

The module **aggregates** existing per-module calendar data (it does not duplicate it) and **owns** only the new cross-institution layer.

---

## 2. Context — the existing landscape (why this is a convergence problem)

The codebase already has 6+ disjoint "calendar/leave" systems, each hard-scoped to a single institution:

| System | Owns | Scope key | Approval | UI today |
|---|---|---|---|---|
| Academic "leaves" | `institution_leaves` = institution **holidays/closures** that block attendance | `profiles.institution_id` + dept/sem/section arrays | relational chains (`leave_approval_chains`/`leave_approvals`) | `/academic/leave-calendar`, `/academic/leaves` |
| Academic Leave/OD | per-student/faculty leave & on-duty applications | institution | yes | `/academic/leave-onduty`, `/learners/leave-onduty` |
| HR staff leave | `hr_leave_applications` (+balances, encashment, blackouts) | `hr_organization_id` (shadow tenant per institution) | JSONB `approval_chain` snapshot | `/hr/leave/*` incl. "Who's on Leave" calendar |
| HR holidays | `hr_public_holidays` | `hr_organization_id` | — | **no UI** (used only by SLA + leave day-counter) |
| Campus living | hostel leave + calendar | institution | yes | `/campus-living/calendar` |
| Events / Meetings | `events/*`, `meetings/*`, BOS, projects, council — **incl. Google Calendar sync** | mixed | — | scattered per module |

**Three facts that drive the design:**

1. "Leave" means three different things: institutional **holidays** (no person, blocks attendance), **staff leave applications** (per-person, approval workflow), and **student leave/OD**. These must stay distinct, not be flattened.
2. **Nothing owns cross-institution data today** — every table is scoped to one institution. The "common leave visible to all institutions" requirement has no home, so the global module must own at least that sliver.
3. The "All Institutions vs. one" pattern is already solved by the **Admission Group Dashboard** (an `institutionIds[]` array → RPC, with `useScopedInstitutionFilter`/`useInstitutionsWithAccess` driving the picker). And `react-big-calendar` is already installed. So this is mostly *convergence + a thin new owner*, not greenfield.

---

## 3. Decisions (decision log)

| # | Decision | Choice |
|---|---|---|
| D1 | Module role | **Aggregator + thin global owner.** Read existing module data; own only the new cross-institution layer + config. Existing per-module calendars stay. |
| D2 | v1 entity scope | All four: **holidays & closures**, **staff & student leave**, **events & meetings**, **academic schedule** (delivered across phases — see §11). |
| D3 | Common-leave storage | A global table where **`scope_institution_ids IS NULL` = common (all institutions)**; a populated UUID[] = subset. Generalizes the chosen "`institution_id` NULL = common" and supports per-institution subset overrides in one column. Mirrors the `institution_leaves` `department_ids[]` idiom and the Razorpay `institution_id NULL = GLOBAL` routing pattern. |
| D4 | Capability model | **View-all + super-admin global config.** Everyone can view (scoped). Super-admin manages common holidays/events, feed toggles, per-institution overrides, categories/colors. Content writes for institution-specific data stay in their home modules. |
| D5 | Common-holiday attendance | **Per-holiday `blocks_attendance` toggle, default `true`** for `kind='holiday'`. When true, integrates into existing attendance-blocking + HR leave-day counter across all in-scope institutions. |
| D6 | Person-level leave privacy | **Admins & approvers only.** Regular users see holidays + events only. The resolver includes person-level leave rows only when the viewer holds `calendar.people_leave.view`; leave **type/reason is hidden** (name + "On Leave" only), mirroring current HR behavior. |
| D7 | Admin control surface | All four: common holidays/events CRUD, source/feed toggles, per-institution scope overrides, categories/colors/legend. |
| D8 | Google Calendar integration | **Deferred to a future phase (Phase 5).** Agreed parameters when built: **one-way MyJKKN → Google**, sync **everything the user can see**. Method (ICS subscription feed vs OAuth push) TBD; ICS feed recommended (the unified resolver already supports it with no extra coupling). |
| D9 | First implementation slice | **Phase 1 = holidays** (global + academic + HR), the common-holiday owner, the resolver, and attendance integration. Person-level leave is Phase 2. |

---

## 4. Architecture (follows the standard page → hook → service → RLS/RPC request path)

```
app/(routes)/calendar/                          ← new top-level module
  ├─ page.tsx            unified grid (month/week/day/agenda)
  ├─ layout.tsx          RoutePermissionGuard (mirrors app/(routes)/hr/layout.tsx)
  ├─ holidays/           super-admin: common holidays/events CRUD (DataTable + dialog)
  └─ settings/           super-admin: feed toggles, per-institution overrides, categories/colors
        │
   hooks/calendar/use-calendar-*.ts             ← React Query; keys in lib/query/query-keys.ts
        │
   lib/services/calendar/calendar-service.ts    ← reads via fn_calendar_items; writes to the 3 new tables
        │
   fn_calendar_items(...)  RPC                  ← convergence point: unions all sources, permission-aware
        │
   existing source tables (read)  +  3 new global tables (owned)
```

The module never duplicates per-institution data — it reads through one resolver and owns only what no module owns today.

---

## 5. Data model — 3 new tables (the "thin global owner")

### 5.1 `calendar_entries` — global-owned holidays, events & meetings (the only content write target)

| column | type | notes |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `kind` | text NOT NULL | `'holiday' \| 'event' \| 'meeting'` (CHECK) |
| `title` | text NOT NULL | |
| `description` | text | |
| `category_id` | uuid FK → `calendar_categories` | drives color/legend |
| `start_at` | timestamptz NOT NULL | all-day holidays use date boundaries |
| `end_at` | timestamptz NOT NULL | CHECK `end_at >= start_at` |
| `all_day` | boolean NOT NULL default true | |
| `blocks_attendance` | boolean NOT NULL default true | **per-holiday toggle** (D5); only meaningful for `kind='holiday'` |
| `scope_institution_ids` | uuid[] | **NULL = common (all institutions)**; populated = subset (D3). GIN-indexed |
| `visibility` | text NOT NULL default 'public' | `'public' \| 'restricted'` |
| `location` | text | events/meetings |
| `meeting_url` | text | meetings (nullable) |
| `is_recurring` | boolean NOT NULL default false | |
| `recurrence_pattern` | jsonb | reuse academic shape `{type:'yearly',month,day}` |
| `color_code` | text | optional override of category color |
| `is_active` | boolean NOT NULL default true | |
| `created_by` | uuid | |
| `created_at`/`updated_at` | timestamptz | `updated_at` trigger |

Indexes: GIN on `scope_institution_ids`; btree on `(kind, start_at)`, `(is_active, start_at)`.

### 5.2 `calendar_categories` — global color/legend vocabulary

`id`, `name`, `slug` (unique), `color_code` (hex), `applies_to_kinds text[]` (which kinds use it), `icon`, `sort_order`, `is_active`, timestamps. Super-admin managed; gives all institutions a consistent visual language.

### 5.3 `calendar_feed_settings` — which source feeds are on/off

`id`, `feed_key text` (e.g. `'global_entries' | 'academic_holidays' | 'hr_public_holidays' | 'staff_leave' | 'student_leave' | 'events' | 'meetings' | 'exams' | 'timetable' | 'reservations'`), `institution_id uuid` (**NULL = global default**; non-null = per-institution override), `is_enabled boolean NOT NULL default true`, timestamps. **UNIQUE `(feed_key, institution_id)`** with a partial unique index handling the NULL case. Resolution: per-institution row overrides the global-default row.

> **types/supabase.ts:** all three tables MUST be registered there or `.from('calendar_entries')` etc. fail typecheck (TS2769 cascade).

---

## 6. Unified read model — `fn_calendar_items(...)` RPC (the heart)

One `SECURITY DEFINER` set-returning function returns a **normalized calendar item** from every enabled source:

```
fn_calendar_items(
  p_institution_ids uuid[],          -- requested scope (NULL/empty ⇒ all the viewer can access)
  p_start date,
  p_end date,
  p_feeds text[] DEFAULT NULL,       -- optional feed filter
  p_kinds text[] DEFAULT NULL        -- optional kind filter
) RETURNS TABLE (
  item_id text,            -- composite: source_module || ':' || source_id
  source_module text,      -- 'global' | 'academic' | 'hr' | 'events' | 'meetings' | 'campus_living' | ...
  source_id uuid,
  kind text,               -- 'holiday' | 'leave' | 'event' | 'meeting' | 'exam' | ...
  title text,
  description text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean,
  institution_id uuid,     -- NULL for common entries
  institution_name text,
  category text,
  color_code text,
  blocks_attendance boolean,
  visibility text,
  person_name text,        -- leave items only (privacy-gated)
  meta jsonb
)
```

**Logic:**

- `UNION ALL` across feed sources, each gated by `calendar_feed_settings` (skip disabled feeds; per-institution overrides apply):
  - `calendar_entries` (common/subset holidays + events + meetings)
  - `institution_leaves` where `status='approved'` (academic holidays)
  - `hr_public_holidays` (mapped `hr_organization_id` → institution)
  - `hr_leave_applications` (approved) + academic leave/OD (approved) — **person-level; included ONLY if the viewer holds `calendar.people_leave.view`**; `person_name` set, leave type/reason hidden
  - events / meetings tables (respecting each row's `visibility`)
  - exams / timetable / room reservations (Phase 4)
- **Scoping (hard requirement):** because the function is `SECURITY DEFINER`, RLS will not auto-scope it. It MUST explicitly compute the viewer's accessible institutions server-side and **intersect** with `p_institution_ids` — never trust the client, never branch on `isSuperAdmin`. Use the existing accessible-institutions helper (verify exact name at implementation: `get_user_accessible_institutions(auth.uid())` and/or `_user_accessible_institutions()` both appear in the codebase). This avoids the reservations-style leak (OR'd "view-all" with no institution scope — fixed by AND-ing `role_has_institution_access`, mig `20260623120000`).
- **Visibility rules** enforced inside the function (so they cannot be bypassed by the client):

  | Data | Who sees it |
  |---|---|
  | Common entries (`scope_institution_ids IS NULL`) | everyone with `calendar.view` |
  | Subset entries | viewers whose accessible institutions intersect the subset |
  | Institution-specific aggregated data | only the viewer's accessible institutions |
  | Person-level leave | only `calendar.people_leave.view` holders |

- **Postgres gotchas to honor in the RPC:**
  - Qualify every `institution_id` reference (RETURNS TABLE name collision → `42702`; seen in billing analytics RPC).
  - Cast varchar source name columns to `::text` to match the declared `text` return type (`42804`; seen in transport collectables RPC).
  - `REVOKE EXECUTE ... FROM anon, PUBLIC; GRANT EXECUTE ... TO authenticated;` (Supabase grants to `anon` directly — `REVOKE ... FROM PUBLIC` alone is a no-op).
- Mirror the function into `supabase/setup/02_functions.sql`.

---

## 7. RBAC & permissions (4-layer rollout)

New `calendar.*` keys catalogued in `lib/constants/permissions.ts` and granted via migration JSONB to `custom_roles.permissions`:

| Key | Meaning | Granted to |
|---|---|---|
| `calendar.view` | view the unified calendar (scoped) | **broadly** — most/all roles ("all role users can view") |
| `calendar.people_leave.view` | see person-level staff/student leave overlay | admins & approvers only |
| `calendar.holidays.manage` | CRUD common holidays/events | super-admin / designated admins |
| `calendar.config.manage` | control panel: feed toggles, per-institution overrides, categories/colors | super-admin |
| `calendar.export` (optional) | export calendar data | as needed |

**4-layer rollout (all must move together):** (1) catalog in `permissions.ts`; (2) DB JSONB grants + RLS on the 3 new tables; (3) UI `<PermissionGuard>` + `app/(routes)/calendar/layout.tsx` via `RoutePermissionGuard`; (4) sidebar `MENU_PERMISSIONS` + `GetPages` entry in `lib/sidebarMenuLink.ts`. A front-end-only change yields a silent empty state.

**RLS on the 3 new tables:** SELECT for `authenticated` AND-scoped to accessible institutions (`scope_institution_ids IS NULL OR scope && accessible` for `calendar_entries`); writes gated on `user_has_permission('calendar.holidays.manage'|'calendar.config.manage')` AND, for subset entries, `role_has_institution_access(...)`. Gate on **permission keys, never role names**.

> **Client permission checks:** use `usePermissions().can()` / `isSuperAdmin` (per project memory, `useAuth()` exposes only `{profile,isLoading,error}` here — do not rely on `useAuth().hasPermission`).

---

## 8. Multi-tenancy / scope resolution

- Institution picker uses `useScopedInstitutionFilter` / `useInstitutionsWithAccess`: super-admin & multi-institution users get **"All Institutions"** + per-institution; single-institution users are locked to theirs (picker hidden).
- The client passes the selected `institutionIds[]` to the service → RPC. **Do not branch on `isSuperAdmin` to decide scope** (strips `scope='all'` secondary roles); the RPC re-derives accessible institutions server-side and intersects.

---

## 9. UI/UX

### 9.1 Main calendar — `/calendar` (`calendar.view`)

```
Calendar                                              [ Search ]
[ All Institutions ▼ ]   [ ‹  June 2026  Today  › ]   [Month|Week|Day|List]
Feeds: [✓ Holidays] [✓ Leave*] [✓ Events] [✓ Meetings] [ Schedule ]
┌── month grid (react-big-calendar) ───────────────┬── LEGEND ─────────┐
│ items colored by calendar_categories;            │ ● Public Holiday  │
│ common holidays badged "All institutions";       │ ● Institution Lv. │
│ Leave* rows only if calendar.people_leave.view   │ ● Staff Leave*    │
│ click item → detail popover                       │ ● Event / Meeting │
└──────────────────────────────────────────────────┴───────────────────┘
```

- Renderer: `react-big-calendar` (installed). Date pickers: `components/ui/calendar.tsx` (react-day-picker).
- Feed chips filter client-side over resolver output; `Leave*` chip hidden without permission.
- Optional in-page tabs via `nav-config.ts` (`Calendar / Agenda / Holidays / Settings`).

### 9.2 Holidays admin — `/calendar/holidays` (`calendar.holidays.manage`)

`DataTable` over `calendar_entries` (columns: Title, Kind, Dates, Scope `All / N institutions`, Blocks attendance, Category, Active). Create/edit dialog:

```
Kind: (•) Holiday ( ) Event ( ) Meeting
Title / Dates / [✓] All day
Scope: (•) All institutions (common)   ( ) Specific: [+ inst] [+ inst]   ← sets scope_institution_ids
Blocks attendance: [✓]   Category: [▼]   Recurring: [Yearly ▼]
```

> **DataTable gotchas (project memory):** if using the `permissions` prop, the `module` must map to a real `<module>.view` key (a mismatch silently renders a null body); the DataTable must mirror any `PermissionGuard` bypasses.

### 9.3 Settings — `/calendar/settings` (`calendar.config.manage`)

Tabs: **Feeds** (toggle each source globally + per-institution override grid → `calendar_feed_settings`), **Categories** (color/legend CRUD), **Per-institution overrides**.

---

## 10. Attendance integration (the one change to existing behavior)

When `blocks_attendance = true`, a common/subset holiday must behave like a real closure for in-scope institutions. **Additive composition, not rewrite** (these functions are load-bearing):

- **Extend** `is_date_blocked_by_leave(institution_id, date, …)` with an extra `OR EXISTS (...)` branch matching `calendar_entries` where `kind='holiday' AND blocks_attendance AND (scope_institution_ids IS NULL OR institution_id = ANY(scope_institution_ids))` and the date is in range (incl. recurrence).
- **Extend** HR's `hr_calc_leave_days` (already skips `institution_leaves` holidays) to also skip these.
- Mirror both into `supabase/setup/02_functions.sql`.

Everything else in the module is pure read aggregation and cannot regress existing flows.

---

## 11. Delivery phases

| Phase | Delivers | Touches |
|---|---|---|
| **1 — Foundation** | 3 tables + `fn_calendar_items` (holiday feeds: global + academic + HR), permissions/sidebar/layout, month+agenda grid, institution picker, legend, **common-holiday CRUD + per-holiday `blocks_attendance` + attendance integration** | new module + 2 existing functions |
| **2 — People leave** | staff + student leave overlays, gated by `calendar.people_leave.view` | read-only |
| **3 — Events & meetings** | aggregate events/meetings + global-event/meeting CRUD + categories/legend admin | read-only + uses `calendar_entries` |
| **4 — Academic schedule** | exams, timetables, room reservations overlays + per-institution feed-override UI | read-only |
| **5 — Google Calendar (future)** | one-way MyJKKN → Google, syncs everything the user can see; ICS feed recommended (`/api/calendar/feed/<token>.ics` → `fn_calendar_items` scoped to the user) | new endpoint only |

Phase 1 is the first implementation slice (D9).

---

## 12. Risks & repo-specific gotchas (carried into the plan)

1. **`SECURITY DEFINER` scoping correctness** — resolver must AND-scope to accessible institutions; never OR a permission without institution scope (reservations leak `20260623120000`). `REVOKE` from `anon`.
2. **Attendance integration is load-bearing** — additive only; mirror into `supabase/setup/`.
3. **`hr_organization_id` ↔ `institution_id` mapping** for HR holidays/leave; **two HR employee identities** (`staff` vs `hr_employees`) when resolving `person_name`.
4. **Register the 3 new tables in `types/supabase.ts`** or `.from()` fails typecheck.
5. **RPC column hygiene** — qualify `institution_id` (`42702`); cast varchar name cols `::text` (`42804`).
6. **CI gates** after adding the module: `gen:routes`, `check:sidebar`, `check:reachability`, `check:menus` (+ permissions-catalog / menu-coverage). Verify a non-super-admin role actually renders data (silent empty-state risk).
7. **`institutionId || ''` antipattern / `eq(col, undefined)`** — use `??`, normalize empty → null.
8. **Performance** — cross-institution union over a date window; index source tables on `(institution_id, start/date)`; bound to the visible window.

---

## 13. Out of scope (YAGNI for now)

- Outbound Google push / two-way Google sync (Phase 5 / future).
- Migrating/consolidating existing academic/HR/hostel leave systems (explicitly rejected — D1 keeps them as-is).
- New approval workflow for common holidays (super-admin declares them directly; institution-specific leaves keep their existing module approvals).
- Per-user calendar item reminders/notifications (could be a later enhancement).
