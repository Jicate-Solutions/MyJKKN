-- ============================================================================
-- Auto-accountability-meeting engine — PR3: the missing-data (data-gap) trigger
-- ============================================================================
-- Spec: specs/meeting-auto-trigger-engine-2026-06-22.md §10 (E1/E5/E8/E11).
-- Director decision (2026-06-26): holiday source = "leaves table + weekends"
-- (institution_leaves + a Sunday skip), NOT cross-college inference and NOT
-- hr_public_holidays (that HR table is empty and drives grievance/payroll).
--
-- WHAT IT DOES
--   Flags a college-day as a *data gap* when a working day has ZERO attendance
--   recorded (E1). It is the structural inverse of the low-attendance trigger:
--   the rate trigger (metric 'attendance_rate_daily') deliberately SKIPS days
--   with no marks (rate IS NULL) and leaves them to this trigger.
--
-- WORKING-DAY ORACLE — kept consistent with attendance marking on purpose, so
-- that "if attendance couldn't be marked that day, don't flag it" holds:
--   1. Not a Sunday. The academic calendar treats ONLY Sunday as a weekend
--      (LeaveManagementService.getMonthlyCalendarData: `isWeekend =
--      dayOfWeek === 0`). Saturdays ARE working days unless a college files that
--      specific Saturday as a leave (see the "Saturday" institution_leaves rows).
--   2. Not an approved, institution-wide holiday. Mirrors the marking gate
--      LeaveManagementService.checkLeaveBlockForAttendance exactly:
--      status='approved', start_date <= date <= end_date, and scope_level
--      'institution' blocks ALL marking. Department/semester/section leaves
--      cannot zero out a whole college's marks, so they need no skip here —
--      if any section marked, rule (3) already sees data.
--   3. Zero attendance marks. Composes the validated rate RPC, which returns
--      NULL iff there are no marks at all (a genuine 0%-present day returns 0,
--      NOT NULL) — one source of truth for "what counts as a mark".
--
-- E4 grace: the cron re-checks a 3-day window and fires on the OLDEST still-empty
-- day, so a college that simply marked late is not nagged about yesterday.
-- E8 cap: shares the weekly cap (1/college/week) with the low-attendance trigger.
--
-- Security: SECURITY DEFINER, search_path pinned, anon-REVOKEd (Supabase
-- default-grants anon EXECUTE on every new function).
--
-- Seeds one INACTIVE rule per college that already has an attendance rule.
-- NOTHING fires until the Director flips a rule active in /meetings/triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC — is this college-day a data gap (working day with zero marks)?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_college_is_missing_data_day(
  p_institution_id uuid,
  p_date           date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- (1) not a Sunday (dow: 0 = Sunday)
    extract(dow from p_date) <> 0
    -- (2) not an approved institution-wide holiday (mirrors the marking gate)
    AND NOT EXISTS (
      SELECT 1
      FROM public.institution_leaves il
      WHERE il.institution_id = p_institution_id
        AND il.status         = 'approved'
        AND il.scope_level    = 'institution'
        AND p_date BETWEEN il.start_date AND il.end_date
    )
    -- (3) zero attendance marks that day (rate RPC is NULL iff no marks at all)
    AND public.fn_college_day_attendance_rate(p_institution_id, p_date) IS NULL;
$$;

COMMENT ON FUNCTION public.fn_college_is_missing_data_day(uuid, date) IS
  'Auto-meeting engine PR3: TRUE iff p_date is a working day for the college with ZERO attendance marks (a data gap). Working day = not Sunday AND not an approved institution-scope institution_leaves date; zero marks = fn_college_day_attendance_rate IS NULL. Mirrors the attendance marking gate so it never flags a day attendance could not be marked.';

REVOKE EXECUTE ON FUNCTION public.fn_college_is_missing_data_day(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_college_is_missing_data_day(uuid, date) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Seed one INACTIVE missing-data rule per attendance-reporting college
-- ----------------------------------------------------------------------------
-- comparator/threshold are nominal: the metric is binary (gap or not), evaluated
-- by fn_college_is_missing_data_day, not by the numeric compare() path. They are
-- present only because the schema requires them NOT NULL.
INSERT INTO public.meeting_trigger_rules
  (metric_key, institution_id, comparator, threshold, cooldown_days, weekly_cap, notify_role, active, notes)
SELECT
  'attendance_missing_data',
  r.institution_id,
  'eq',
  0,
  7,
  1,
  'principal',
  false,
  'Fires when a working day has ZERO attendance recorded (a data gap). Working day = not Sunday and not an approved institution-wide holiday (institution_leaves), matching the attendance marking gate. 3-day grace (re-checked nightly) so late marking is not flagged; weekly-capped. Seeded INACTIVE — flip active to start.'
FROM public.meeting_trigger_rules r
WHERE r.metric_key = 'attendance_rate_daily'
ON CONFLICT (metric_key, institution_id) DO NOTHING;

-- Refresh PostgREST's schema cache so the new RPC is callable immediately.
NOTIFY pgrst, 'reload schema';
