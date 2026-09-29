-- 20270521090000_hr_salary_no_backdating.sql
--
-- THE RULING (Director, 29 Sep 2026, verbatim)
--   "the DATABASE must refuse any salary change starting in the past, except
--    the super admin's Excel import of old history."
--
-- WHY
--   fn_hr_set_staff_salary never looked at p_effective_from beyond "is it
--   there". On 29 Sep 2026 a pay change for one staff member was saved through
--   the app on the 29th with a start of 1 Sep, a backdated raise. Nothing
--   stopped it.
--
-- WHAT THIS CHANGES
--   1. fn_hr_set_staff_salary: re-created from main's NEWEST body
--      (20260902100000 section 5; three definitions exist on main:
--      20260821201000, 20260901120000, 20260902100000) with two additions:
--        a) A start before TODAY IN INDIA (Asia/Kolkata) is refused.
--           Today itself is allowed: an approved raise is written ON its start
--           date. The check sits AFTER the "identical payload" early return,
--           so re-uploading a file that changes nothing still changes nothing
--           and still succeeds, exactly as before.
--        b) A new last parameter, p_allow_past (default false). It lets a past
--           start through ONLY when the caller is a super admin. Anybody else
--           who sets it is refused outright, whatever the date. Only the salary
--           Excel import passes it, and only for a super admin.
--      Everything else in the body is main's newest version, unchanged.
--      A NULL p_effective_from was already refused ("Effective date is
--      required") and still is.
--
--   2. A BEFORE INSERT/UPDATE trigger on hr_staff_salaries. The function is
--      SECURITY INVOKER and hr_staff_salaries_write lets anyone holding
--      hr.payroll.salary.manage write the TABLE directly through the API, so a
--      check inside the function alone could be walked around with one direct
--      insert. The trigger applies the same rule to API callers (anon,
--      authenticated, service_role):
--        - INSERT with a start before today            -> refused
--        - UPDATE that changes anything except the bookkeeping columns
--          (superseded_by, updated_at, updated_by) on a row that started
--          before today (or has no start recorded), or that moves the start
--          before today                                -> refused
--      Superseding an old row (setting superseded_by) stays allowed; that is
--      how every normal pay change works.
--      The super-admin import passes because fn_hr_set_staff_salary sets a
--      transaction-local flag for the one INSERT it makes, and the trigger
--      re-checks is_super_admin() itself: the flag alone opens nothing.
--      The database owner (migrations, an operator's repair in the SQL editor,
--      a SECURITY DEFINER function owned by it) is not an API caller and is not
--      stopped by the trigger; it IS still stopped by the function check when
--      it goes through fn_hr_set_staff_salary.
--
-- GRANTS
--   DROP + CREATE discards the ACL and a new function is executable by PUBLIC
--   (which includes anon). Hence the REVOKE ... FROM anon, PUBLIC below.
--   The 18-argument signature is dropped first: CREATE OR REPLACE with a
--   different parameter list makes an OVERLOAD, and PostgREST then answers
--   PGRST203 on every call.
--
-- NOT COMPARED WITH PRODUCTION
--   The live body of fn_hr_set_staff_salary could not be read (the read was
--   blocked by the safety system). This file is built from main's newest
--   definition. Diff it against pg_get_functiondef on production before apply.
--
-- FILE ONLY, NOT APPLIED. Re-runnable: applied twice in the rehearsal
-- (supabase/tests/hr-salary-no-backdating/run.sh).

-- ---------------------------------------------------------------------------
-- 1. fn_hr_set_staff_salary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
);
DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text, boolean
);

CREATE FUNCTION public.fn_hr_set_staff_salary(
  p_staff_id               uuid,
  p_hr_organization_id     uuid,
  p_monthly_gross          numeric,
  p_effective_from         date,
  p_salary_structure       text    DEFAULT 'Monthly',
  p_overtime_level         text    DEFAULT 'No overtime',
  p_overtime_amount        numeric DEFAULT 0,
  p_eligible_for_pf        boolean DEFAULT false,
  p_exempt_edli            boolean DEFAULT false,
  p_eligible_for_insurance boolean DEFAULT false,
  p_eligible_for_gratuity  boolean DEFAULT false,
  p_eligible_for_etf       boolean DEFAULT false,
  p_notes                  text    DEFAULT NULL,
  p_epf_amount             numeric DEFAULT 0,
  p_eligible_for_esi       boolean DEFAULT false,
  p_esi_amount             numeric DEFAULT 0,
  p_allowance_amount       numeric DEFAULT 0,
  p_allowance_label        text    DEFAULT NULL,
  p_allow_past             boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_id    uuid := gen_random_uuid();
  v_current   record;
  v_epf       numeric;
  v_esi       numeric;
  v_allowance numeric;
  v_alw_label text;
  -- 2027-05-21: "today" is India's today, not the server's (UTC) date.
  v_today     date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_staff_id IS NULL OR p_hr_organization_id IS NULL THEN
    RAISE EXCEPTION 'Staff and payroll organisation are both required'
      USING ERRCODE = '22023';
  END IF;
  IF p_monthly_gross IS NULL OR p_monthly_gross <= 0 THEN
    RAISE EXCEPTION 'Monthly salary must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Effective date is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_epf_amount, 0) < 0 OR COALESCE(p_esi_amount, 0) < 0 THEN
    RAISE EXCEPTION 'EPF and ESI amounts cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_allowance_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Allowance cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- 2027-05-21: the past-history door is the super admin's alone. Anybody else
  -- who asks for it is refused, whatever the date, so a mistake in a caller
  -- shows up at once instead of only on the day a past date happens to arrive.
  -- COALESCE, not a bare test: a NULL flag means "not asked", and
  -- is_super_admin() is COALESCE'd to false by its own body.
  IF COALESCE(p_allow_past, false) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may record a salary that starts in the past.'
      USING ERRCODE = '42501';
  END IF;

  -- An amount against a flag that is OFF is zeroed, not rejected. The bulk
  -- importer feeds this from a spreadsheet where a leftover figure beside a "No"
  -- is a formatting slip, and a hard failure there would abort a 754-row import.
  v_epf := CASE WHEN p_eligible_for_pf  THEN COALESCE(p_epf_amount, 0) ELSE 0 END;
  v_esi := CASE WHEN p_eligible_for_esi THEN COALESCE(p_esi_amount, 0) ELSE 0 END;

  v_allowance := COALESCE(p_allowance_amount, 0);
  -- A label with no money behind it is noise on every screen that renders it.
  v_alw_label := CASE WHEN v_allowance > 0
                      THEN NULLIF(TRIM(COALESCE(p_allowance_label, '')), '')
                      ELSE NULL END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_staff_id::text || ':salary', 0));

  SELECT * INTO v_current
    FROM public.hr_staff_salaries
   WHERE staff_id = p_staff_id AND superseded_by IS NULL;

  -- Re-writing an IDENTICAL record would bury the real history under duplicates,
  -- so the incumbent is returned untouched instead.
  --
  -- COMPARES THE WHOLE PAYLOAD. It once tested only monthly_gross and
  -- effective_from, which made every other kind of edit a silent no-op that
  -- still reported success. Every column written below must appear here.
  --
  -- IS DISTINCT FROM throughout, not <>. p_notes and p_allowance_label are
  -- nullable, and `x <> NULL` is NULL rather than false — a plain <> chain would
  -- evaluate to NULL, be read as "not different", and restore the very bug this
  -- comparison exists to prevent.
  IF FOUND
     AND v_current.monthly_gross          IS NOT DISTINCT FROM p_monthly_gross
     AND v_current.effective_from         IS NOT DISTINCT FROM p_effective_from
     AND v_current.hr_organization_id     IS NOT DISTINCT FROM p_hr_organization_id
     AND v_current.salary_structure       IS NOT DISTINCT FROM p_salary_structure
     AND v_current.overtime_level         IS NOT DISTINCT FROM p_overtime_level
     AND v_current.overtime_amount        IS NOT DISTINCT FROM COALESCE(p_overtime_amount, 0)
     AND v_current.eligible_for_pf        IS NOT DISTINCT FROM p_eligible_for_pf
     AND v_current.exempt_edli            IS NOT DISTINCT FROM p_exempt_edli
     AND v_current.eligible_for_insurance IS NOT DISTINCT FROM p_eligible_for_insurance
     AND v_current.eligible_for_gratuity  IS NOT DISTINCT FROM p_eligible_for_gratuity
     AND v_current.eligible_for_etf       IS NOT DISTINCT FROM p_eligible_for_etf
     AND v_current.epf_amount             IS NOT DISTINCT FROM v_epf
     AND v_current.eligible_for_esi       IS NOT DISTINCT FROM p_eligible_for_esi
     AND v_current.esi_amount             IS NOT DISTINCT FROM v_esi
     AND v_current.allowance_amount       IS NOT DISTINCT FROM v_allowance
     AND v_current.allowance_label        IS NOT DISTINCT FROM v_alw_label
     AND v_current.notes                  IS NOT DISTINCT FROM p_notes THEN
    RETURN v_current.id;
  END IF;

  -- 2027-05-21: no salary change may start in the past (Director's ruling).
  -- Placed AFTER the identical-payload return above: a re-upload that changes
  -- nothing writes nothing, so it is not a change and still succeeds.
  IF p_effective_from < v_today
     AND NOT (COALESCE(p_allow_past, false) AND public.is_super_admin()) THEN
    RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
      to_char(p_effective_from, 'DD Mon YYYY'), to_char(v_today, 'DD Mon YYYY')
      USING ERRCODE = '22023',
            HINT = 'Pick today or a later date. Only a super admin''s import of old salary history may use a past date.';
  END IF;

  IF FOUND THEN
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
  END IF;

  -- 2027-05-21: the table trigger below applies the same rule to direct writes.
  -- This transaction-local flag tells it the ONE insert that follows is the
  -- super admin's history import (the only way to reach here with a past date).
  -- The condition is restated in full rather than trusting the RAISE above, so
  -- a later edit that weakens that check cannot also open the table. The
  -- trigger re-checks is_super_admin() itself, and the flag is cleared
  -- straight after the insert.
  IF p_effective_from < v_today
     AND COALESCE(p_allow_past, false) AND public.is_super_admin() THEN
    PERFORM set_config('app.hr_salary_allow_past', 'on', true);
  END IF;

  INSERT INTO public.hr_staff_salaries (
    id, staff_id, hr_organization_id, salary_structure, monthly_gross,
    overtime_level, overtime_amount, eligible_for_pf, exempt_edli,
    eligible_for_insurance, eligible_for_gratuity, eligible_for_etf,
    epf_amount, eligible_for_esi, esi_amount,
    allowance_amount, allowance_label,
    effective_from, notes, created_by, updated_by
  ) VALUES (
    v_new_id, p_staff_id, p_hr_organization_id, p_salary_structure, p_monthly_gross,
    p_overtime_level, p_overtime_amount, p_eligible_for_pf, p_exempt_edli,
    p_eligible_for_insurance, p_eligible_for_gratuity, p_eligible_for_etf,
    v_epf, p_eligible_for_esi, v_esi,
    v_allowance, v_alw_label,
    p_effective_from, p_notes, auth.uid(), auth.uid()
  );

  PERFORM set_config('app.hr_salary_allow_past', '', true);

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text, boolean
) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text, boolean
) IS
  'Supersede-and-insert a staff salary in one transaction. SECURITY INVOKER: hr_staff_salaries_write enforces hr.payroll.salary.manage. Returns the incumbent unchanged when the whole payload matches. Refuses a start before today (Asia/Kolkata) unless p_allow_past is set by a super admin (the history import); p_allow_past from anybody else is refused. See 20270521090000.';

-- ---------------------------------------------------------------------------
-- 2. The table-level guard for direct writes
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it must see the caller's current_user (an API
-- role) and the caller's auth.uid(). is_super_admin() is SECURITY DEFINER on
-- its own, so it answers correctly from inside an invoker trigger.
-- A trigger function needs no EXECUTE grant to fire, so nobody is granted it.
CREATE OR REPLACE FUNCTION public.hr_staff_salaries_refuse_past_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_import_ok boolean;
BEGIN
  -- Only API callers. The database owner (migrations, an operator's repair) is
  -- not a user of the app; the function check covers any caller that goes
  -- through fn_hr_set_staff_salary.
  IF current_user NOT IN ('anon', 'authenticated', 'service_role') THEN
    RETURN NEW;
  END IF;

  v_import_ok := COALESCE(current_setting('app.hr_salary_allow_past', true), '') = 'on'
                 AND public.is_super_admin();

  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_from < v_today AND NOT v_import_ok THEN
      RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
        to_char(NEW.effective_from, 'DD Mon YYYY'), to_char(v_today, 'DD Mon YYYY')
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. Superseding (superseded_by, and the two bookkeeping columns that go
  -- with it) is how every normal pay change works, and is always allowed.
  -- annual_gross is GENERATED and not settable, so it is left out of the compare.
  IF (to_jsonb(NEW) - 'superseded_by' - 'updated_at' - 'updated_by' - 'annual_gross')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_by' - 'updated_at' - 'updated_by' - 'annual_gross')
  THEN
    -- Editing a row that has already started (or whose start was never
    -- recorded) rewrites pay already in force: a backdated change by another
    -- route. Moving a start into the past is the same thing.
    IF (OLD.effective_from IS NULL OR OLD.effective_from < v_today
        OR NEW.effective_from < v_today)
       AND NOT v_import_ok THEN
      RAISE EXCEPTION 'A salary that has already started cannot be edited in place. Record a new salary from today or a later date.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_staff_salaries_refuse_past_start() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_staff_salaries_refuse_past_start() IS
  'BEFORE INSERT/UPDATE guard on hr_staff_salaries: an API caller may not insert a salary starting before today (Asia/Kolkata) or edit one already started, except the super admin history import via fn_hr_set_staff_salary(p_allow_past). See 20270521090000.';

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_refuse_past_start ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_refuse_past_start
  BEFORE INSERT OR UPDATE ON public.hr_staff_salaries
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_salaries_refuse_past_start();

NOTIFY pgrst, 'reload schema';
