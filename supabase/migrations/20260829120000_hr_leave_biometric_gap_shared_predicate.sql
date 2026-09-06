-- One body for "is this request's biometric uploaded yet".
--
-- 20260829110000 put the rule in the approval trigger. The approval queue needs
-- the SAME answer to show a badge and disable Approve before the click. Two
-- copies of that predicate is precisely the shape that produced
-- feedback_leave_approval_overwrote_day_with_leave -- two triggers on one table,
-- only one of them holding the category rule -- and a badge that disagrees with
-- the trigger is worse than no badge: it either promises an approval the
-- database refuses, or greys out one it would have accepted.
--
-- So the predicate moves here and both callers are rewritten onto it.
--
-- Returns the FIRST covered day with no biometric row, or NULL when the request
-- may be approved. A date rather than a boolean because the caller needs it:
-- the trigger names it in the error, the queue shows it in the badge.
--
-- STABLE, not VOLATILE: it only reads. That also lets the queue RPC (itself
-- STABLE) call it once per row without the planner refusing.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_biometric_gap(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_start         date,
  p_end           date
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
  v_inst     uuid;
  v_last     date;
  v_missing  date;
BEGIN
  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = p_leave_type_id;

  -- (1) Short Time Off is exempt. It is already correct in both orders:
  -- fetch-permissions.ts feeds approved permissions into evaluateDay during the
  -- import, and recomputeForShortTimeOff runs on approve/reject/withdraw/cancel.
  -- Gating it would hold 385 of 536 pending requests for no benefit.
  IF v_category IS DISTINCT FROM 'leave'
     AND v_category IS DISTINCT FROM 'compensatory_off' THEN
    RETURN NULL;
  END IF;

  -- (2) A future-dated request cannot have biometric yet and does not need it --
  -- the import re-stamps the day when its month is uploaded
  -- (fn_restamp_leave_attendance). Blocking these would make advance leave
  -- approval impossible.
  IF p_start IS NULL OR p_start > CURRENT_DATE THEN
    RETURN NULL;
  END IF;
  v_last := LEAST(COALESCE(p_end, p_start), CURRENT_DATE);

  SELECT s.institution_id INTO v_inst
  FROM public.staff s WHERE s.id = p_employee_id;

  IF v_inst IS NULL THEN
    RETURN NULL;
  END IF;

  -- (3) Institutions that do not run biometric are exempt or they would wait
  -- forever for a file nobody uploads. Five are in that position today: Arts &
  -- Science (Aided), Matric, Nattraja Vidhyalya CBSE, Testing, Jicate.
  IF NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_records r
    WHERE r.institution_id = v_inst AND r.source = 'biometric'
  ) THEN
    RETURN NULL;
  END IF;

  -- (4) Coverage is per (INSTITUTION, DATE), never per employee: 199 of 592
  -- HR-managed staff have no biometric mapping and a per-employee test would
  -- block them permanently. Uses hr_attendance_records_inst_date_idx.
  --
  -- Weekly offs and holidays arrive as rows too (the machine reports every
  -- calendar day), so a gap here means the file is genuinely absent rather than
  -- the day merely being non-working.
  SELECT d::date INTO v_missing
  FROM generate_series(p_start, v_last, interval '1 day') AS d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_attendance_records r
    WHERE r.institution_id = v_inst
      AND r.work_date = d::date
      AND r.source = 'biometric'
  )
  ORDER BY d
  LIMIT 1;

  RETURN v_missing;
END $function$;

COMMENT ON FUNCTION public.fn_hr_leave_biometric_gap(uuid, uuid, date, date) IS
  'First covered day with no biometric row for the employee''s institution, or NULL if the request may be approved. Single source of truth for the approval gate and its UI badge.';

REVOKE ALL ON FUNCTION public.fn_hr_leave_biometric_gap(uuid, uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_leave_biometric_gap(uuid, uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_biometric_gap(uuid, uuid, date, date)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The trigger becomes a thin wrapper over the shared predicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_block_leave_approval_without_biometric()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_missing date;
BEGIN
  -- Only the transition INTO approved. Editing an already-approved row, or any
  -- other status change, is none of this trigger's business.
  IF NOT (NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  v_missing := public.fn_hr_leave_biometric_gap(
    NEW.employee_id, NEW.leave_type_id, NEW.start_date, NEW.end_date);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Biometric attendance for % has not been uploaded yet, so approving this would not reach the attendance report. Import it from HR > Attendance > Import, then approve. First missing day: %.',
      to_char(v_missing, 'Mon YYYY'),
      to_char(v_missing, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $function$;
