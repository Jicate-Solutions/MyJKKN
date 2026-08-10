# My Attendance — Attendance Log + Calendar

Created: 2026-08-09
Target: `/hr/attendance`
Reference UI: HRAPP `employee-self-service/attendance/{attendance-log,calendar}`

## Status — 2026-08-09

| Phase | State |
|---|---|
| 0.1 Backdate shift timings | **Applied.** 196 rows `2026-08-06` → `2026-06-01`; 0 remain. |
| 0.2 Retire stale exceptions | **Applied.** 1,271 resolved; 0 open. |
| 0.3 Re-run the July import | **Blocked — needs the .xls from you.** The importer does not archive uploads, so the original Monthly Performance Report has to be re-uploaded at `/hr/attendance/import`. |
| 1 Read layer | Done — types, service, hooks. |
| 2 Page + tabs | Done, incl. `?date=` deep link into Regularize. |
| 3 HR / SA filter | Done. |
| 4 Relocate admin options | Done, incl. nav-config + reachability gate. |
| 5 Verification | Gates + typecheck + lint pass. **Browser pass not done** — no authenticated session on localhost. |

Deviation from the plan as written: the selected staff member is held in component
state, **not** synced to the URL. The URL can only carry the staff id, and a header
that renders a bare UUID while the name resolves is worse than not deep-linking.
Tab and month are URL-synced as planned.

---

## Problem

`/hr/attendance` is a static hub of three link cards (Regularize, Regularize
Approvals, Import Biometric Punches). It was built 2026-05-11 only so the
sidebar's "Attendance" entry would not 404. It shows **no attendance at all**,
for anyone.

We want it to become a real employee self-service surface: two tabs —
**Attendance Log** (one row per day of the month) and **Calendar** (a month
grid) — reading the biometric punches that were imported. Staff see their own
record; HR Head / HR Administrator / Super Admin get a filter to view any
staff member's record within their institution scope. The three admin-facing
cards move to the HR Admin hub.

---

## What already exists (verified 2026-08-09)

### One table drives both tabs

`hr_attendance_records` is day-grain, keyed `(employee_id, work_date)` with
`employee_id → staff.id`. Every legend token in the reference UI resolves from
this one table:

| Token | Source |
|---|---|
| P / AB / half | `status_type_id` → `PRESENT` / `ABSENT` / `HALF_DAY` (biometric importer) |
| WO | `WEEKLY_OFF`, from `hr_shift_timings.is_working_day` + second-Saturday rule |
| H | `HOLIDAY`, written by trigger `tr_recompute_attendance_on_holiday_change` on `institution_leaves` |
| L | `LEAVE`, written by trigger `tr_recompute_attendance_on_leave_approval` on `hr_leave_applications` |
| OD | `ON_DUTY` status type |
| `AB : AB` half-pair | `first_half_attended` / `second_half_attended` + `day_calc` |
| Effective / Gross hours | `hours_worked`, `break_minutes`, span of `in_at`→`out_at` |
| AEYP | no row for that date, or an open `hr_attendance_exceptions` row |

No client-side merge of leave + holidays + punches is needed. One query.

**CO (Comp Off) has no source.** There is no `COMP_OFF` status type and
`hr_comp_off` approvals do not write attendance rows (`types/hr-comp-off.ts`
calls this "defined but dormant"). CO is omitted from the legend.

### Access control is already correct in RLS

`hr_attendance_records_select` permits, in order:

1. `is_super_admin()`
2. `is_admin()`
3. `EXISTS (staff s WHERE s.id = employee_id AND s.profile_id = auth.uid())` — self, **no permission key required**
4. `user_has_permission('hr.attendance.view_all') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id)`
5. same for `hr.attendance.override`

The requested model is already the policy. The UI mirrors it; RLS remains the
real gate. Grants today: `view_self` true on 76 roles, `view_all` true on
exactly 2 — HR Head (2 users) and HR Administrator (0 users). Principal and
HOD have it explicitly `false`. **Decision: leave grants unchanged.**

### Self-identity lookup

`fn_my_hr_context()` (SECURITY DEFINER) maps `auth.uid()` → `staff.id`,
`institution_id`, `hr_organization_id`, name, employee code. Already wrapped by
`useCurrentEmployee()` in `hooks/hr/use-regularization.ts`.

---

## THE BLOCKER: zero attendance records

```
hr_attendance_records     0 rows
hr_attendance_exceptions  1,271 rows — 100% "No shift timing configured for this staff member on this date."
                          2026-07-01 → 2026-07-31, 41 employees, 7 institutions
```

Root cause, confirmed by re-running the resolver's lateral join:

- All 196 `hr_shift_timings` rows have `effective_from = 2026-08-06`
- `fn_resolve_shift_timings_bulk` requires `effective_from <= work_date`
- The imported report is **July 2026**

For a staff member on 2026-07-15: `rows_effective_in_july = 0`. On 2026-08-15:
`rows_effective_in_august = 2`. So `evaluateDay()` returned `EXCEPTION` for all
1,271 day cells; the importer wrote the exceptions and no records.

Without fixing this, a perfect page renders "no records" for every user.

---

## Phase 0 — Unblock the data

**0.1** `supabase/migrations/20260809190000_backdate_shift_timings_effective_from.sql`

```sql
UPDATE hr_shift_timings
   SET effective_from = DATE '2026-06-01', updated_at = now()
 WHERE effective_from = DATE '2026-08-06';
```

`2026-06-01` is the start of academic year 2026-27 (AY convention: Jun 1 →
Mar 31). The hours were genuinely in force from the start of the year; only
the configuration was entered late. Backdating further would assert timings for
a year they did not cover.

Guard the migration so it is idempotent and touches only the 196 rows written
on 2026-08-06 — a later, deliberately-future-dated row must not be dragged back.

**0.2** Resolve the 1,271 stale exceptions. They are provably artifacts of the
config gap, not real unresolved days. Check the `resolution_status` check
constraint first, then mark them resolved with a note in `raw_payload`; do not
delete (the audit trail is the point).

**0.3** Re-run the July import via `/hr/attendance/import`. The importer upserts
on `(employee_id, work_date)`, so re-running is safe and idempotent. Use the
dry-run preview first and read the reconciliation report. Expected: ~1,271
day-records across 41 staff / 7 institutions.

**0.4** Verify: `SELECT count(*), min(work_date), max(work_date) FROM hr_attendance_records;`

> Nothing in Phases 1–4 depends on Phase 0 landing first — the UI is built
> against the schema, not the rows. But Phase 5 browser verification does.

---

## Phase 1 — Read layer

**1.1** `types/hr-attendance.ts`

- `AttendanceStatusCode` — union of the 9 codes in `hr_attendance_status_types`
- `AttendanceDayRecord` — the row shape incl. joined `status: { code, label }`
- `AttendanceLogRow` — one calendar day, record-or-null, plus derived
  `effectiveMinutes` / `grossMinutes` / `token` / `halfPair`
- `STATUS_TOKENS: Record<AttendanceStatusCode | 'AEYP', { short, label, tone }>`
  — the single source for both the log badges and the calendar legend

**1.2** `lib/services/hr/attendance-record-service.ts`

Static class, `SupabaseClient` as first argument — the HR module convention
(no HR service extends `BaseService`; see the header note on
`shift-timing-service.ts`). Hand-enforce the two guarantees `BaseService` would
have given: filter in SQL never in JS, and destructure `{ error }` on every call
and throw.

- `listMonth(supabase, { staffId, month })` — `.gte/.lte` on `work_date`,
  left join `hr_attendance_status_types(code,label)`, order `work_date` desc.
  **Left join, never `!inner`** — an `!inner` on the status FK would silently
  drop any row whose status type were deleted.
- `listOpenExceptions(supabase, { staffId, month })` — feeds the AEYP token
- `getMonthSummary(supabase, { staffId, month })` — counts per status for the
  header strip

**1.3** `hooks/hr/use-attendance-records.ts`

Module-local `const KEY = 'hr-attendance-records'`, matching
`use-shift-timings.ts` — `lib/query/query-keys.ts` has no `hr` section and no HR
importer, so a group added there is dead code.

- `useAttendanceMonth(staffId: string | null, month: string)` — `enabled: !!staffId`
- `useAttendanceExceptions(staffId, month)`
- `useAttendanceMonthSummary(staffId, month)`

---

## Phase 2 — The page

**2.1** Rewrite `app/(routes)/hr/attendance/page.tsx`

`ContentLayout` → breadcrumb → `PageHeader title="My Attendance"` → `Tabs`
(`attendance-log` | `calendar`). Resolves the viewer via `useCurrentEmployee()`.
Empty state when no staff row is linked (mirrors the regularize page).

Tab and month both sync to the URL (`?tab=`, `?month=YYYY-MM`) so a reload or a
shared link lands in the same place.

**2.2** `_components/attendance-month-picker.tsx`

Month chip + prev/next chevrons + refresh button, top-right, on both tabs.
Refresh invalidates the month's query key.

**2.3** `_components/attendance-log-tab.tsx`

Columns: **Date** | **Attendance Visual** | **Effective hours** | **Gross hours** | **Actions**

- Renders **every day of the month, descending** — not only days with rows.
  The reference UI shows Aug 31 with an empty visual; a day with no record is a
  real state (AEYP), not a gap.
- Date cell: `Aug 30, Sun` + a `WO` / `H` badge where applicable
- Attendance Visual: a compact in→out bar with punch times for a worked day;
  the `AB : AB` / `WO : WO` half-pair in the status tone otherwise
- Effective = `hours_worked`; Gross = span(`in_at`, `out_at`); em-dash when null
- Actions: a **Regularize** button on ABSENT / HALF_DAY / no-record days,
  deep-linking `/hr/attendance/regularize?date=YYYY-MM-DD`. Gated on
  `hr.attendance.regularize_self` via `usePermissions()`. Hidden entirely when
  an HR user is viewing someone else's record.

**2.4** `_components/attendance-calendar-tab.tsx`

Legend row, then a Monday→Sunday month grid. Plain CSS grid + `date-fns`
(`startOfWeek(d, { weekStartsOn: 1 })`) — `react-big-calendar` is a dependency
but is an event-scheduling component; a static month grid does not need it and
the dark-mode override work it requires is documented pain.

- Leading/trailing days greyed
- Cell shows the `firstHalf : secondHalf` token pair
- WO cells tinted; H cells tinted differently; AB in the destructive tone
- Today ringed

**2.5** `_components/attendance-legend.tsx` — reads `STATUS_TOKENS`, shared by both tabs.

**2.6** Deep-link support in `regularize/page.tsx` — read `?date=` and prefill
`RegularizeForm`. Small change; the form already takes a date.

---

## Phase 3 — The HR / Super Admin filter

**3.1** `_components/attendance-staff-filter.tsx`

Renders only when `isSuperAdmin || can('hr.attendance.view_all')`
(`usePermissions()`, not `useAuth()` — see the repo convention). Composition:

- `HrInstitutionSelect` (`components/hr/hr-institution-select.tsx`) — already
  handles accessible-institution scoping and defaults to the viewer's own
- a single-select staff type-ahead reusing `useStaffSearch(institutionId, term)`
  from `hooks/hr/use-leave-assignments.ts`
- a "Me" reset chip

**3.2** The selected staff id flows into the same Phase 1 hooks — one code path
for self and for HR. Synced to the URL as `?staff=<uuid>`.

**3.3** Do **not** branch scope on `isSuperAdmin`. Pass the accessible-institution
ids through and let RLS gate the rows; branching on `isSuperAdmin` silently
strips access from `scope='all'` secondary roles. A user who somehow requests a
staff id outside scope gets an empty result set, not a leak.

**3.4** Header shows whose record is displayed when it is not the viewer's own.

---

## Phase 4 — Relocate the admin options

**4.1** Remove all three ActionCards from `/hr/attendance`.

**4.2** `app/(routes)/hr/admin/page.tsx` — add an **Attendance** section holding
three cards: `Shift Timings` (moved out of "Policies & Configuration", where it
currently sits), `Regularize Approvals`, `Import Biometric Punches`.

**4.3** `app/(routes)/hr/nav-config.ts` — the Attendance group's children become
`Attendance Log` (`/hr/attendance`) and `Regularize` (`/hr/attendance/regularize`).
Move `/hr/attendance/regularize/approvals` and `/hr/attendance/import` into the
**HR Admin** group's `matchPaths` array.

> This is load-bearing. `scripts/check-nav-reachability.ts` uses nav-config
> children hrefs and `matchPaths` as its orphan-coverage manifest. Deleting the
> two entries without re-homing them makes both routes count as unreachable
> against the `--max-unreachable 60` budget.

**4.4** `lib/sidebarMenuLink.ts` — `/hr/attendance` → `hr.attendance.view_self`
is already correct for the new page; no change. `/hr/attendance/import` stays
`hr.dashboard.view`. Note for the record: `/hr/attendance/regularize/approvals`
has no entry and inherits `/hr/attendance/regularize` →
`hr.attendance.regularize_self` by longest-prefix match; the page self-gates.
Unchanged by this work, not fixed here.

---

## Phase 5 — Verification

There is no test runner in this repo. "Done" means:

1. `mcp__ide__getDiagnostics` clean on every touched file
2. `npm run check:menus` and `npm run check:reachability` pass
3. SQL: `hr_attendance_records` non-zero after the Phase 0 re-import
4. Browser, three roles:
   - **Super Admin** — filter visible, can select another institution's staff, data renders
   - **A staff member with a biometric code** (one of the 41) — own July data renders in both tabs, no filter visible
   - **A staff member without a code** (403 of 864 staff) — every day shows AEYP, empty state is legible, no error
5. Confirm a non-super-admin actually sees rows — the common failure mode here
   is a silent empty table from an RLS denial, not a thrown error

---

## Known limitations to state in the UI

- **CO (Comp Off)** is absent from the legend — no status type, no writer.
- **403 of 864 staff have no `biometric_id`.** Their log is all-AEYP by design.
  The empty state should say so and point at the import, not read as a bug.
- **Only July 2026 has data** until the August report is uploaded.
- Three institutions have no biometric sheet at all.
