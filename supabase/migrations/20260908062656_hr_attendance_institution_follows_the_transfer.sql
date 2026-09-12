-- ============================================================================
-- Attendance follows the person when their work institution changes.
--
-- THE CLASS OF BUG this closes. hr_attendance_records.institution_id is stamped
-- at IMPORT time from staff.institution_id and was never re-synced. The salary
-- register reads the roster from the staff member's CURRENT institution but the
-- day counts from that stamp, so a transfer split one person across two
-- institutions and they were paid by NEITHER -- silently, because both halves
-- look like an ordinary empty result. Migration 20260908055910 repaired the 93
-- rows that had already drifted; this stops them drifting again.
--
-- Three parts, and the first two must be read together: the guard would refuse
-- the very re-stamp the trigger performs if the trigger did not stay off closed
-- months.
--
--   1. hr_trig_block_writes_in_locked_period now inspects BOTH sides of an
--      UPDATE. It did `v_row := COALESCE(NEW, OLD)`, which on an UPDATE is
--      always NEW -- so moving a row INTO a closed month was refused while
--      moving one OUT of it passed without a murmur. That asymmetry is exactly
--      how a transfer could remove somebody's days from a frozen period.
--
--   2. A transfer re-stamps the person's attendance, but only for months that
--      are open on BOTH sides. A closed month is closed: its frozen summaries
--      were computed FROM those rows, so moving one would make the period
--      disagree with the records underneath it. Repairing a closed month stays
--      a deliberate reopen + recompute + re-close, never a side effect of
--      editing a staff row.
--
--   3. v_hr_attendance_institution_drift shows whatever could not follow.
--      Empty is the healthy state. This is the part that matters most: the
--      original failure was not that attendance stayed behind, it was that
--      nothing said so.
--
-- The trigger deliberately does NOT fail a transfer it cannot fully honour.
-- HR must always be able to move somebody; a warning plus a row in the drift
-- view is the right cost, a blocked personnel change is not.
--
-- CREATE OR REPLACE throughout, never DROP + CREATE: dropping a function takes
-- its ACL with it and re-creating one silently re-grants EXECUTE to PUBLIC.
-- ============================================================================

-- 1. The locked-period guard must inspect BOTH sides of an UPDATE.
CREATE OR REPLACE FUNCTION public.hr_trig_block_writes_in_locked_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_inst uuid;
  v_new_date date;
  v_old_inst uuid;
  v_old_date date;
  v_locked   record;
BEGIN
  -- NEW and OLD are read into locals first. Referencing NEW.* during a DELETE
  -- (or OLD.* during an INSERT) raises "record is not assigned yet" even when
  -- the reference sits behind a TG_OP test, because the whole expression is
  -- still evaluated.
  IF TG_OP <> 'DELETE' THEN
    v_new_inst := NEW.institution_id;
    v_new_date := NEW.work_date;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old_inst := OLD.institution_id;
    v_old_date := OLD.work_date;
  END IF;

  -- Every (institution, date) the write TOUCHES, not just where it lands.
  SELECT ap.period_year, ap.period_month, ap.locked_at, i.name AS institution
    INTO v_locked
    FROM public.hr_attendance_periods ap
    LEFT JOIN public.institutions i ON i.id = ap.institution_id
   WHERE ap.status = 'locked'
     AND (
       (ap.institution_id = v_new_inst
         AND v_new_date >= make_date(ap.period_year, ap.period_month, 1)
         AND v_new_date <  (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date)
       OR
       (ap.institution_id = v_old_inst
         AND v_old_date >= make_date(ap.period_year, ap.period_month, 1)
         AND v_old_date <  (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date)
     )
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Attendance for %-% at % is closed (locked %). Reopen that month before changing attendance that belongs to it.',
      v_locked.period_year, lpad(v_locked.period_month::text, 2, '0'),
      COALESCE(v_locked.institution, 'that institution'),
      to_char(v_locked.locked_at, 'DD Mon YYYY')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- 2. A transfer carries the person's re-stampable attendance with it.
CREATE OR REPLACE FUNCTION public.fn_hr_restamp_attendance_on_transfer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orgs  uuid[];
  v_org   uuid;
  v_moved integer := 0;
  v_stuck integer := 0;
BEGIN
  -- hr_organization_id is NOT NULL, so a destination that does not resolve to
  -- exactly one organisation has nowhere to write. Warn and leave the rows
  -- alone rather than failing the transfer itself.
  SELECT array_agg(o.id) INTO v_orgs
    FROM public.hr_organizations o
   WHERE o.institution_id = NEW.institution_id;

  IF v_orgs IS NULL OR array_length(v_orgs, 1) <> 1 THEN
    RAISE WARNING
      'Staff % moved to an institution with % HR organisation(s); attendance keeps its old stamp. See v_hr_attendance_institution_drift.',
      NEW.id, COALESCE(array_length(v_orgs, 1), 0);
    RETURN NEW;
  END IF;
  v_org := v_orgs[1];

  -- Only rows whose month is open on BOTH sides -- see the header.
  WITH movable AS (
    SELECT r.id
      FROM public.hr_attendance_records r
     WHERE r.employee_id = NEW.id
       AND r.institution_id IS DISTINCT FROM NEW.institution_id
       AND NOT EXISTS (
         SELECT 1
           FROM public.hr_attendance_periods ap
          WHERE ap.status = 'locked'
            AND ap.institution_id IN (r.institution_id, NEW.institution_id)
            AND r.work_date >= make_date(ap.period_year, ap.period_month, 1)
            AND r.work_date <  (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date
       )
  ), moved AS (
    UPDATE public.hr_attendance_records r
       SET institution_id     = NEW.institution_id,
           hr_organization_id = v_org,
           updated_at         = now()
      FROM movable m
     WHERE r.id = m.id
    RETURNING 1
  )
  SELECT count(*) INTO v_moved FROM moved;

  SELECT count(*) INTO v_stuck
    FROM public.hr_attendance_records r
   WHERE r.employee_id = NEW.id
     AND r.institution_id IS DISTINCT FROM NEW.institution_id;

  IF v_stuck > 0 THEN
    RAISE WARNING
      'Staff %: % attendance row(s) re-stamped, % left behind in a CLOSED month. Those days stay with the old institution and will not reach the new one''s salary register until that month is reopened and recomputed. See v_hr_attendance_institution_drift.',
      NEW.id, v_moved, v_stuck;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staff_restamp_attendance_on_transfer ON public.staff;

-- AFTER, and narrowed twice (UPDATE OF + WHEN): staff is a hot table whose
-- UPDATE already fires a profile rewrite, and this must not add work to the
-- bulk edits that do not touch institution_id at all.
CREATE TRIGGER trg_staff_restamp_attendance_on_transfer
AFTER UPDATE OF institution_id ON public.staff
FOR EACH ROW
WHEN (OLD.institution_id IS DISTINCT FROM NEW.institution_id)
EXECUTE FUNCTION public.fn_hr_restamp_attendance_on_transfer();


-- 3. What could not follow the person, made visible.
CREATE OR REPLACE VIEW public.v_hr_attendance_institution_drift
WITH (security_invoker = true) AS
SELECT s.id                                        AS staff_id,
       s.staff_id                                  AS employee_code,
       btrim(concat_ws(' ', s.first_name, s.last_name)) AS staff_name,
       s.institution_id                            AS current_institution_id,
       ci.name                                     AS current_institution,
       r.institution_id                            AS record_institution_id,
       ri.name                                     AS record_institution,
       date_trunc('month', r.work_date)::date      AS work_month,
       count(*)                                    AS rows_adrift,
       bool_or(ap.status = 'locked')               AS month_is_closed
  FROM public.hr_attendance_records r
  JOIN public.staff s        ON s.id = r.employee_id
  LEFT JOIN public.institutions ci ON ci.id = s.institution_id
  LEFT JOIN public.institutions ri ON ri.id = r.institution_id
  LEFT JOIN public.hr_attendance_periods ap
         ON ap.institution_id = r.institution_id
        AND ap.period_year    = EXTRACT(YEAR  FROM r.work_date)::int
        AND ap.period_month   = EXTRACT(MONTH FROM r.work_date)::int
 WHERE r.institution_id IS DISTINCT FROM s.institution_id
 GROUP BY s.id, s.staff_id, s.first_name, s.last_name,
          s.institution_id, ci.name, r.institution_id, ri.name,
          date_trunc('month', r.work_date);

COMMENT ON VIEW public.v_hr_attendance_institution_drift IS
  'Attendance still stamped with an institution the staff member has left. Empty is the healthy state. A row with month_is_closed = true needs a deliberate reopen + recompute + re-close; anything else means the transfer trigger could not resolve a destination organisation.';

GRANT SELECT ON public.v_hr_attendance_institution_drift TO authenticated;
