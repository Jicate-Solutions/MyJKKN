-- ============================================================================
-- Re-stamp attendance for staff whose work institution changed after import.
--
-- THE BUG. hr_attendance_records.institution_id is a stamp taken at IMPORT
-- time from staff.institution_id (app/api/hr/attendance/import/route.ts:536).
-- Nothing re-stamps it when somebody transfers. The month-close preview then
-- disagrees with itself: the roster comes from the staff member's CURRENT
-- institution (v_hr_staff, salary-register-service.ts:485) while the day counts
-- come from fn_hr_attendance_period_projection, which reads
-- `hr_attendance_records WHERE institution_id = p_institution_id` -- the stamp.
-- A transferred person therefore lands on the new institution's roster with no
-- attendance and is excluded as "No attendance in the closed month", while 31
-- days of real biometric data sit under the old institution.
--
-- This is not cosmetic. fn_hr_compute_attendance_period_summary calls the same
-- projection, so closing the month FREEZES the omission: the person is then
-- excluded from that month's salary register with no route back through the UI.
--
-- WHAT THIS REPAIRS -- 93 rows, 2 people, verified 2026-09-08:
--   NOTJMO048 DR. RAJENDIRAN K M  2026-08  31 rows  Main Office -> C. of Education
--   NOTJMO048 DR. RAJENDIRAN K M  2026-07  31 rows  Main Office -> C. of Education
--   NOTJIC011 SELVAMANI N         2026-07  31 rows  Jicate Sol. -> Main Office
--
-- Both people were already ZERO-PAY exclusions on the live July Main Office
-- register (run c5da342d, 23 paid staff, Rs 4,29,705) -- Rajendiran as
-- 'no_salary_recorded', Selvamani as 'no_attendance_summary', which is this very
-- bug. So no issued payment is contradicted by moving these rows; the July
-- money total is untouched.
--
-- WHY THE PERIOD IS REOPENED. Main Office July 2026 is closed. Both directions
-- cross it: Rajendiran's July days leave it, Selvamani's arrive. The inbound
-- write is refused outright by trg_har_block_locked_period. The OUTBOUND write
-- is NOT -- that guard does `v_row := COALESCE(NEW, OLD)` and so, on UPDATE,
-- only ever inspects NEW; re-stamping a row to an unlocked institution slips
-- past it silently. We do not rely on that hole: the period is opened
-- explicitly, recomputed, and closed again, so the frozen counts and the
-- records they are derived from can never disagree.
--
-- The original close is PRESERVED, not replaced. locked_at / locked_by are put
-- back exactly as they were (2026-08-27, by the super admin who closed it):
-- this repairs data underneath an existing close, it does not re-close the
-- month, and the audit trail should not claim otherwise. The repair itself is
-- recorded in notes.
--
-- biometric_institution_id is DELIBERATELY LEFT ALONE. It names the machine the
-- punches came from, which really is the Main Office device and stays true
-- regardless of who employs the person. Only the employment stamp moves.
--
-- WHY THE IMPERSONATION. fn_hr_attendance_period_projection is SECURITY DEFINER
-- behind `is_super_admin() OR user_has_permission('hr.attendance.period.manage')`,
-- and is_super_admin() reads profiles.is_super_admin for auth.uid(). A migration
-- has no auth.uid(), so the recompute would raise insufficient_privilege. The
-- claims are set, transaction-locally, to the super admin who locked this very
-- period, so the recompute runs as the person whose close it is.
--
-- NOT DONE HERE, on purpose: Rajendiran's July days now sit at JKKN College of
-- Education, which has no July period. Whether to close July there and pay him
-- is a decision for HR, not for a migration.
-- ============================================================================

DO $migration$
DECLARE
  -- The super admin who closed Main Office July 2026 on 2026-08-27.
  v_actor     uuid := '7f6836fd-24b5-477b-8892-a04a77552700';
  v_mo_july   uuid := 'e1dfd3c8-e370-455e-8f73-bae1e11676e2';
  v_locked_at timestamptz;
  v_locked_by uuid;
  v_drift     integer;
  v_restamped integer;
  v_rows      integer;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text,
    true);

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'Cannot recompute: % is not a super administrator, so the projection gate would refuse.',
      v_actor;
  END IF;

  -- 1. Refuse to run against data that has moved since the analysis. A repair
  --    that silently re-stamps a set it was never reviewed against is worse
  --    than one that does not run.
  SELECT count(*) INTO v_drift
    FROM public.hr_attendance_records r
    JOIN public.staff s ON s.id = r.employee_id
   WHERE r.institution_id IS DISTINCT FROM s.institution_id;

  IF v_drift <> 93 THEN
    RAISE EXCEPTION
      'Expected 93 drifted attendance rows, found %. Re-run the analysis before applying this.',
      v_drift;
  END IF;

  -- Every drifted row must have exactly one destination organisation, or the
  -- UPDATE below would multiply rows.
  IF EXISTS (
    SELECT 1
      FROM public.hr_attendance_records r
      JOIN public.staff s ON s.id = r.employee_id
     WHERE r.institution_id IS DISTINCT FROM s.institution_id
       AND (SELECT count(*) FROM public.hr_organizations o
             WHERE o.institution_id = s.institution_id) <> 1
  ) THEN
    RAISE EXCEPTION 'A destination institution does not have exactly one hr_organizations row.';
  END IF;

  -- 2. Capture the real close so it can be restored verbatim.
  SELECT locked_at, locked_by INTO v_locked_at, v_locked_by
    FROM public.hr_attendance_periods
   WHERE id = v_mo_july AND status = 'locked';

  IF v_locked_at IS NULL THEN
    RAISE EXCEPTION
      'JKKN Main Office July 2026 is not closed. This repair assumes it is; stop and re-check.';
  END IF;

  -- 3. Open it, so trg_har_block_locked_period permits the inbound re-stamp
  --    honestly rather than the outbound one slipping past on a technicality.
  UPDATE public.hr_attendance_periods
     SET status = 'open', locked_at = NULL, locked_by = NULL, updated_by = v_actor
   WHERE id = v_mo_july;

  -- 4. The re-stamp itself. Employment stamp follows the person; the machine
  --    stamp does not move.
  WITH moved AS (
    UPDATE public.hr_attendance_records r
       SET institution_id     = s.institution_id,
           hr_organization_id = o.id,
           updated_at         = now()
      FROM public.staff s,
           public.hr_organizations o
     WHERE s.id = r.employee_id
       AND o.institution_id = s.institution_id
       AND r.institution_id IS DISTINCT FROM s.institution_id
    RETURNING 1
  )
  SELECT count(*) INTO v_restamped FROM moved;

  IF v_restamped <> 93 THEN
    RAISE EXCEPTION 'Re-stamped % rows, expected 93. Rolled back.', v_restamped;
  END IF;

  -- 5. Rebuild the frozen counts from the records as they now stand. This is
  --    the same function the close itself runs, so the period cannot end up
  --    saying something the close would not have said.
  v_rows := public.fn_hr_compute_attendance_period_summary(v_mo_july);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Recompute produced no summaries for Main Office July 2026. Rolled back.';
  END IF;

  -- 6. Restore the close exactly as it was.
  UPDATE public.hr_attendance_periods
     SET status     = 'locked',
         locked_at  = v_locked_at,
         locked_by  = v_locked_by,
         updated_by = v_actor,
         notes      = concat_ws(
           E'\n',
           nullif(notes, ''),
           'Recomputed ' || to_char(now(), 'DD Mon YYYY')
             || ': attendance re-stamped for staff whose work institution changed after import'
             || ' (NOTJMO048 out, NOTJIC011 in). Original close preserved.')
   WHERE id = v_mo_july;

  -- 7. Nothing may be left behind.
  SELECT count(*) INTO v_drift
    FROM public.hr_attendance_records r
    JOIN public.staff s ON s.id = r.employee_id
   WHERE r.institution_id IS DISTINCT FROM s.institution_id;

  IF v_drift <> 0 THEN
    RAISE EXCEPTION '% attendance rows still carry the wrong institution. Rolled back.', v_drift;
  END IF;

  RAISE NOTICE 'Re-stamped 93 rows; Main Office July 2026 recomputed to % staff and re-closed.', v_rows;
END
$migration$;
