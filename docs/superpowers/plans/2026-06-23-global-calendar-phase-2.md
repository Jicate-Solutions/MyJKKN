# Global Calendar Module — Phase 2 (Person-Level Leave Overlay) Plan

> Builds on Phase 1 (branch `feat/global-calendar-phase-1`). Same verification model: SQL checks + subagent reviews + browser smoke (no test runner).

**Goal:** Overlay approved person-level leave (HR staff + academic students) on the calendar, showing **name + "On Leave" only** (type/reason hidden), visible **only to `calendar.people_leave.view` holders**.

**Architecture:** Extend the existing `fn_calendar_items` resolver with two new `UNION ALL` branches, gated *inside* the SECURITY DEFINER function by a single `v_can_people_leave` boolean (closes the Phase-1 I-2 tripwire). UI adds two feed chips shown only to permitted users.

## Global Constraints
Inherit Phase 1's. Plus: person-level rows MUST hide leave type/reason (mirror HR `getCalendar` "decision 23"); the two leave branches MUST be AND-gated by `user_has_permission('calendar.people_leave.view')`; name columns cast `::text`; additive CREATE OR REPLACE preserves the 3 Phase-1 holiday branches verbatim.

---

## Verified inputs
- HR: `hr_leave_applications` (employee_id→`staff.first_name/last_name`; hr_organization_id→`hr_organizations.institution_id`; status='approved'; superseded_by IS NULL).
- Academic: `leave_onduty_applications` (learner_id→`learners_profiles.first_name/last_name`; institution_id direct; status='approved'; **category='leave'** only — always individual, no team handling).
- Gate: `user_has_permission('calendar.people_leave.view')` (single-arg, reads auth.uid()); granted to 7 roles in Phase 1.
- New feed keys: `staff_leave`, `student_leave`. New source_module values: `hr_leave`, `academic_leave`. kind=`leave`. blocks_attendance=false (leave is informational, not a closure).

---

## Task 1 — Resolver extension (DB; controller-applied)
CREATE OR REPLACE `fn_calendar_items`: keep the 3 holiday branches byte-for-byte; add `v_can_people_leave boolean := user_has_permission('calendar.people_leave.view')`; add two `UNION ALL` branches:

- **Source 4 (hr_leave):** join staff + hr_organizations + institutions; `WHERE v_can_people_leave AND status='approved' AND superseded_by IS NULL AND ho.institution_id = ANY(v_effective)` + kind/feed('staff_leave')/date gates + `fn_calendar_feed_enabled('staff_leave', ho.institution_id)`. Emit title='On Leave', description=NULL, person_name=staff name, category='Staff Leave', color '#ef4444', blocks_attendance=false, visibility='restricted'.
- **Source 5 (academic_leave):** join learners_profiles + institutions; `WHERE v_can_people_leave AND status='approved' AND category='leave' AND institution_id = ANY(v_effective)` + kind/feed('student_leave')/date gates. Emit title='On Leave', person_name=learner name, category='Student Leave', color '#ec4899', blocks_attendance=false, visibility='restricted'.

Re-add REVOKE-from-anon/GRANT-authenticated (idempotent). Verify: function executes (no 42804/42702); under service role (no auth.uid) → still 0 person rows (permission false). Mirror to setup/02_functions.sql DEFERRED (concurrent dirty). Commit migration `20260623110000_calendar_people_leave_sources.sql`.

## Task 2 — UI feed chips (implementer subagent)
`app/(routes)/calendar/_components/calendar-view.tsx`:
- Compute `canViewPeopleLeave = usePermissions().canAccess('calendar.people_leave','view') || isSuperAdmin`.
- Append `{key:'staff_leave',label:'Staff Leave'}` and `{key:'student_leave',label:'Student Leave'}` to FEEDS **only when canViewPeopleLeave** (don't show chips the user can't use).
- `feedKeyFor`: add `hr_leave→staff_leave`, `academic_leave→student_leave`.
- Event title: for `kind==='leave'`, show `${person_name} · On Leave` (fall back to title). Keep holiday titles unchanged.

## Task 3 — Final verification
Browser smoke as a people_leave holder (leave appears, name shown, no type) and as a plain `calendar.view` user (no leave rows, no chips). Re-run gen:routes/check:menus (no route changes expected). Whole-branch review of the Phase-2 commits.
