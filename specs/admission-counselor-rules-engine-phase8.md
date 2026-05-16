# Phase 8 Spec: admission_counselor_duty_log + precise off-duty tracking

**Status:** DRAFT — awaiting Omm's sign-off
**Author:** Claude
**Last updated:** 2026-04-28
**Parent spec:** [`specs/admission-counselor-rules-engine-spec.md`](./admission-counselor-rules-engine-spec.md) (PR #537)

---

## Why

PR #549 shipped `fn_cascade_off_duty_counselors` with an explicit simplification flag:

> "Off-duty since" is approximated as: counselor is CURRENTLY off-duty AND the lead was last assigned/updated more than threshold minutes ago AND the lead has had no admission_call_logs activity since assignment. True "off-duty start time" tracking requires a duty-log table (deferred).

This approximation produces **false positives** in two cases:
1. A counselor who was on-duty for the full lead lifetime, then flips off-duty 1 minute before the cron tick — the cron sees idle-time > threshold + currently off-duty and cascades a lead that should have been left alone (counselor's threshold timer just started).
2. A lead that was untouched for unrelated reasons (parked while waiting on parent confirmation) gets cascaded the moment its counselor takes a half-day.

Precise tracking unlocks: (a) correct cascade timing — only fires after counselor has been off-duty for `threshold_min`, not after lead has been idle for `threshold_min`; (b) audit trail for "why was this lead reassigned"; (c) future analytics on counselor availability patterns; (d) basis for SLA dashboards.

## What changes

1. **NEW table** `admission_counselor_duty_log` with columns:
   - `id` uuid PK default `gen_random_uuid()`
   - `counselor_id` uuid NOT NULL FK → `admission_counselors(id)` ON DELETE CASCADE
   - `event_type` text NOT NULL CHECK IN (`'on_duty'`, `'off_duty'`)
   - `event_at` timestamptz NOT NULL DEFAULT `now()`
   - `reason` text NOT NULL CHECK IN (`'schedule_change'`, `'emergency_off'`, `'hr_leave'`, `'is_active_flip'`, `'backfill_init'`)
   - `source_user_id` uuid NULL FK → `auth.users(id)` (NULL for system-driven events)
   - `metadata` jsonb NULL (e.g. `{"leave_application_id": "...", "schedule_id": "..."}`)
   - `created_at` timestamptz NOT NULL DEFAULT `now()`
   - Index on `(counselor_id, event_at DESC)` for `fn_get_off_duty_since` lookup speed
   - RLS: super_admin + admin + `user_has_permission('admission.counselors.view')` per existing pattern

2. **NEW trigger** on `admission_counselors` AFTER UPDATE — when `is_active` flips OR `emergency_off_today` flips, INSERT a duty_log row with `reason='is_active_flip'` or `'emergency_off'` accordingly.

3. **NEW trigger** on `admission_counselor_schedules` AFTER INSERT/UPDATE — when `is_working` for the **current effective row** changes for today's `day_of_week`, INSERT a duty_log row with `reason='schedule_change'`.

4. **NEW trigger** on `hr_leave_applications` AFTER INSERT/UPDATE — when `status` changes to `'approved'` AND `employee_id` matches a `admission_counselors.user_id`, INSERT an `off_duty` row with `reason='hr_leave'` and `metadata={leave_application_id, start_date, end_date}`. On status change away from `'approved'` (rejected after approval, cancelled), INSERT matching `on_duty` row.

5. **NEW helper** `fn_get_off_duty_since(p_counselor_id uuid) RETURNS timestamptz` — returns `event_at` of the most recent `off_duty` row for the counselor, OR NULL if the most recent row is `on_duty` (i.e., currently on-duty). SECURITY DEFINER, search_path locked.

6. **REFACTOR** `fn_cascade_off_duty_counselors` — replace idle-time approximation with: `WHERE fn_get_off_duty_since(counselor_id) IS NOT NULL AND fn_get_off_duty_since(counselor_id) < (now() - (threshold_min || ' minutes')::interval)`. Drop the `admission_call_logs`-since-assignment check. Keep the existing `fn_is_counselor_on_duty` guard as belt-and-suspenders.

## Migration plan

Single migration file at `supabase/migrations/<timestamp>_phase8_duty_log_and_cascade_refinement.sql`. Idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`). Reversible: down-migration drops the 3 triggers + refactored function + helper + table in reverse order; previous `fn_cascade_off_duty_counselors` body restored from `supabase/setup/02_functions.sql`.

## Backfill strategy

On migration apply, INSERT a synthetic `on_duty` row (`event_at = now()`, `reason = 'backfill_init'`) for **every counselor where `is_active = true`** AND every counselor whose schedule says they're working today. Cascade then has a starting point — first cascade tick after migration uses these synthetic rows as the "since" anchor. No historic backfill of past schedule changes / leave events (no source data, and cascade only looks at most-recent event so historical noise is irrelevant).

## Discovery test

Mirrors PR #549's verification matrix:

1. Pick a test counselor with 1+ open lead. Set `emergency_off_today = TRUE` → assert duty_log row inserted with `reason='emergency_off'`, `event_type='off_duty'`.
2. Wait `threshold_min + 1` minute (or fast-forward via `event_at` direct UPDATE in test fixture) → call `fn_cascade_off_duty_counselors()` → assert lead `counselor_id` reassigned to a different on-duty counselor.
3. Reset `emergency_off_today = FALSE` → assert duty_log row inserted with `reason='emergency_off'`, `event_type='on_duty'`.
4. Run cascade again immediately → assert no further reassignment for that counselor (`fn_get_off_duty_since` returns NULL).
5. Repeat (1)–(4) for `hr_leave_applications.status='approved'` path.

## Out of scope

- Backfill of historical schedule changes / past leave events (no source data, and the freshness model only cares about the most-recent event).
- UI surface to view a counselor's duty-log history — defer to Phase 9.
- Notification / digest entry when off-duty event fires — defer to Phase 9.
- Analytics views (mean time-to-cascade, off-duty-hours-per-week per counselor) — separate sprint.
- Replacing `fn_is_counselor_on_duty`'s 4-condition check with duty-log lookup (the boolean check is fast and right; only the timing window benefits from duty_log).

## Risks

- **HR module write overhead** — adding an AFTER trigger on `hr_leave_applications` adds a per-row write to duty_log on every approved leave. Mitigation: trigger guards on `employee_id IN (SELECT user_id FROM admission_counselors)` so non-counselor leaves are no-ops at the trigger entry. Measure on staging before prod deploy.
- **Unbounded growth** — duty_log will accumulate indefinitely. Mitigation: ship a 90-day retention cron in the same PR (delete rows where `event_at < now() - interval '90 days'`), with carve-out to keep the most-recent row per counselor regardless of age (so `fn_get_off_duty_since` always finds an anchor).
- **Trigger recursion on `admission_counselors`** — toggling `is_active` from inside another trigger could recurse. Mitigation: guard with `pg_trigger_depth() = 1`.
- **Race vs cron** — cascade cron and a duty-log INSERT could race. Mitigation: cascade reads `fn_get_off_duty_since` once per lead candidate inside its query; PG MVCC handles the rest.

## Sign-off

- [ ] All 6 changes locked
- [ ] Backfill strategy acceptable (no historic events)
- [ ] 90-day retention with most-recent-per-counselor carve-out approved
- [ ] Discovery test plan covers all 4 reasons (`emergency_off`, `schedule_change`, `hr_leave`, `is_active_flip`)
- [ ] Out-of-scope list correct (UI + notifications deferred to Phase 9)

When checked → comment `LGTM`. Phase 8 PR opens within 24h of LGTM.
