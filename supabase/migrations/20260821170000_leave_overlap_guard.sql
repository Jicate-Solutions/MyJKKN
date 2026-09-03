-- HR Leave — one leave request per day.
--
-- Short time off got an overlap guard on 2026-08-21; day leave never had one.
-- Nothing stopped two live requests covering the same dates, and 3 such pairs
-- existed across 3 staff when this was written. Both draw down the balance on
-- approval, so the same day is paid for twice.
--
-- FIRES ON INSERT AND ON THE DATE/TYPE COLUMNS ONLY — deliberately NOT on
-- status. The pre-existing overlaps must still be approvable and rejectable; a
-- trigger that also fired on a status change would look at the sibling row,
-- find the overlap and refuse the decision, leaving them permanently stuck.
-- This guard is about CREATING an overlap, not about deciding one that exists.
--
-- Leave vs leave only. A permission on a day already covered by full-day leave
-- is also contradictory, but that is a different comparison (minutes against a
-- day) and is left alone rather than guessed at here.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_category text;
  v_clash    record;
BEGIN
  IF NEW.status NOT IN ('pending','approved','escalated') THEN
    RETURN NEW;
  END IF;

  SELECT request_category INTO v_category
  FROM public.hr_leave_types WHERE id = NEW.leave_type_id;

  IF v_category IS DISTINCT FROM 'leave' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.employee_id::text || ':leave-overlap', 0)
  );

  SELECT t2.leave_type_name AS type_name, a.start_date, a.end_date, a.status
    INTO v_clash
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t2 ON t2.id = a.leave_type_id
  WHERE a.employee_id = NEW.employee_id
    AND a.id IS DISTINCT FROM NEW.id
    AND a.status IN ('pending','approved','escalated')
    AND t2.request_category = 'leave'
    AND a.start_date <= NEW.end_date
    AND NEW.start_date <= a.end_date
  ORDER BY a.start_date
  LIMIT 1;

  IF v_clash.type_name IS NOT NULL THEN
    RAISE EXCEPTION
      'This overlaps an existing % request from % to % (%). Cancel that one first, or pick different dates.',
      v_clash.type_name,
      to_char(v_clash.start_date, 'DD/MM/YYYY'),
      to_char(v_clash.end_date, 'DD/MM/YYYY'),
      v_clash.status
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_hla_leave_overlap ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_leave_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, leave_type_id
  ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_no_overlap();

COMMENT ON FUNCTION public.hr_trig_leave_enforce_no_overlap() IS
  'Refuses a day-leave request whose dates overlap another live request for the same employee. Not fired on status changes, so pre-existing overlaps stay decidable.';
