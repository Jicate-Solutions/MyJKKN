-- 20270521090000_hr_salary_no_backdating.sql
--
-- THE RULINGS (Director, verbatim)
--   29 Sep 2026: "the DATABASE must refuse any salary change starting in the
--     past, except the super admin's Excel import of old history."
--   30 Sep 2026 (these narrow and replace the 29 Sep exception):
--     (2) Old-history import: KEEP TODAY'S PAY; old rows are filed as history
--         only, the row in force never moves.
--     (3) The past-date exception may be used ONLY by names on the Director
--         list, nobody else from any screen or tool.
--     (4) A raise entered late starts from the 1st of NEXT month; the missed
--         month is not paid back through the system.
--
-- WHY
--   fn_hr_set_staff_salary never looked at p_effective_from beyond "is it
--   there". On 2026-09-29 a pay change for one staff member was saved through
--   the app on the 29th with a start of 1 Sep, a backdated raise. Nothing
--   stopped it. (That row is NOT touched here.)
--
-- DEPENDS ON 20270520090000_the_director_list.sql (Draft #4121), which defines
--   public.fn_is_the_director(). A precondition below refuses to run without
--   it, so this file cannot be applied first by accident.
--
-- WHAT THIS CHANGES
--   1. fn_hr_set_staff_salary: re-created from main's NEWEST body
--      (20260902100000 section 5; three definitions exist on main:
--      20260821201000, 20260901120000, 20260902100000) with these additions:
--        a) A start before TODAY IN INDIA (Asia/Kolkata) is refused.
--           TODAY ITSELF IS ALLOWED. An approved raise may be written on its
--           start date, and a job that runs late may still write a raise dated
--           today (see Draft #4120). The check sits AFTER the "identical
--           payload" early return, so re-uploading a file that changes nothing
--           still changes nothing and still succeeds, exactly as before.
--        b) A new last parameter, p_allow_past (default false). It lets a past
--           start through ONLY when fn_is_the_director() is true for the
--           caller. Anybody else who sets it (a super admin not on the list,
--           an HR head, a server job, a user with no role) is refused outright,
--           whatever the date. There is no other way to a past start.
--        c) HISTORY NEVER MOVES TODAY'S PAY. When the Director records a past
--           row that starts BEFORE the row in force (or the row in force has
--           no start recorded), the new row is filed as history: it is
--           inserted already superseded (superseded_by = the next row after it
--           in date order, else the row in force) and the row in force is not
--           touched. Only a row dated on or after the row in force replaces
--           it. Re-importing the same history row writes nothing.
--        d) Replacing the row in force now tells the table guard which ONE row
--           it is retiring (a transaction-local setting), because the guard
--           below refuses every other change to superseded_by.
--      Everything else in the body is main's newest version, unchanged.
--
--   2. A BEFORE INSERT/UPDATE/DELETE trigger on hr_staff_salaries. The function
--      is SECURITY INVOKER and hr_staff_salaries_write (FOR ALL) lets anyone
--      holding hr.payroll.salary.manage write and DELETE rows directly through
--      the API. The trigger applies to API callers (anon, authenticated,
--      service_role):
--        - INSERT with a start before today                   -> refused
--          (except the Director's history row, inserted by the function)
--        - UPDATE that changes superseded_by                  -> refused
--          (except the function retiring the one row in force). Before this,
--          re-pointing superseded_by could bring an old salary back into force.
--        - UPDATE that changes any other column on a row that started before
--          today (or has no start recorded), or that moves the start before
--          today                                               -> refused
--        - DELETE                                              -> refused
--      The database owner (migrations, an operator's repair in the SQL editor,
--      a foreign-key cascade when a staff record is deleted) is not an API
--      caller and is not stopped by the trigger; it IS still stopped by the
--      function check when it goes through fn_hr_set_staff_salary.
--      The two settings the function uses (app.hr_salary_allow_past,
--      app.hr_salary_supersede) cannot be set through the Data API, and the
--      trigger re-checks fn_is_the_director() itself: the past-date setting
--      alone opens nothing.
--
-- DATA DRIFT, UNVERIFIED
--   The repo declares hr_staff_salaries.effective_from NOT NULL, but the
--   orchestrator's read of production (2026-09-30) saw older rows with a NULL
--   start. Whether production enforces NOT NULL was NOT verified. This file
--   treats a NULL start as "already started" and never writes one.
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
-- (supabase/tests/hr-salary-no-backdating/run.sh). No inner BEGIN/COMMIT.

-- ---------------------------------------------------------------------------
-- 0. Precondition: the Director list (#4121) must already be in place.
-- ---------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regprocedure('public.fn_is_the_director()') IS NULL THEN
    RAISE EXCEPTION '20270521090000 needs public.fn_is_the_director() from 20270520090000_the_director_list.sql (Draft #4121). Apply that first.';
  END IF;
END
$pre$;

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
  v_new_id      uuid := gen_random_uuid();
  v_current     record;
  v_has_current boolean;
  v_epf         numeric;
  v_esi         numeric;
  v_allowance   numeric;
  v_alw_label   text;
  -- 2026-09-30: "today" is India's today, not the server's (UTC) date.
  v_today       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_director    boolean := false;
  v_past_ok     boolean;
  v_next_id     uuid;
  v_same_id     uuid;
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

  -- 2026-09-30: the past-date door belongs to the Director list alone
  -- (ruling 3). Anybody else who asks for it is refused, whatever the date, so
  -- a mistake in a caller shows up at once instead of only on the day a past
  -- date happens to arrive. IS TRUE, not a bare test: a NULL answer is "no".
  IF p_allow_past IS TRUE THEN
    v_director := public.fn_is_the_director() IS TRUE;
    IF NOT v_director THEN
      RAISE EXCEPTION 'Only the Director may record a salary that starts in the past.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  v_past_ok := p_effective_from < v_today AND v_director;

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
  v_has_current := FOUND;

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
  IF v_has_current
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

  -- 2026-09-30: no salary change may start in the past (rulings of 29 and
  -- 30 Sep). Today is allowed. Placed AFTER the identical-payload return above:
  -- a re-upload that changes nothing writes nothing, so it is not a change and
  -- still succeeds.
  IF p_effective_from < v_today AND NOT v_past_ok THEN
    RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
      to_char(p_effective_from, 'DD Mon YYYY'), to_char(v_today, 'DD Mon YYYY')
      USING ERRCODE = '22023',
            HINT = 'Pick today or a later date. A raise entered late starts from the 1st of next month. Only the Director may record old salary history.';
  END IF;

  -- 2026-09-30 (ruling 2): old history never moves today's pay. A Director's
  -- past row that starts BEFORE the row in force (or the row in force has no
  -- start recorded) is filed as history, already superseded, and the row in
  -- force is left exactly as it is.
  IF v_past_ok AND v_has_current
     AND (v_current.effective_from IS NULL OR p_effective_from < v_current.effective_from) THEN

    -- The same history row imported twice is written once.
    SELECT s.id INTO v_same_id
      FROM public.hr_staff_salaries s
     WHERE s.staff_id = p_staff_id
       AND s.effective_from         IS NOT DISTINCT FROM p_effective_from
       AND s.monthly_gross          IS NOT DISTINCT FROM p_monthly_gross
       AND s.hr_organization_id     IS NOT DISTINCT FROM p_hr_organization_id
       AND s.salary_structure       IS NOT DISTINCT FROM p_salary_structure
       AND s.overtime_level         IS NOT DISTINCT FROM p_overtime_level
       AND s.overtime_amount        IS NOT DISTINCT FROM COALESCE(p_overtime_amount, 0)
       AND s.eligible_for_pf        IS NOT DISTINCT FROM p_eligible_for_pf
       AND s.exempt_edli            IS NOT DISTINCT FROM p_exempt_edli
       AND s.eligible_for_insurance IS NOT DISTINCT FROM p_eligible_for_insurance
       AND s.eligible_for_gratuity  IS NOT DISTINCT FROM p_eligible_for_gratuity
       AND s.eligible_for_etf       IS NOT DISTINCT FROM p_eligible_for_etf
       AND s.epf_amount             IS NOT DISTINCT FROM v_epf
       AND s.eligible_for_esi       IS NOT DISTINCT FROM p_eligible_for_esi
       AND s.esi_amount             IS NOT DISTINCT FROM v_esi
       AND s.allowance_amount       IS NOT DISTINCT FROM v_allowance
       AND s.allowance_label        IS NOT DISTINCT FROM v_alw_label
       AND s.notes                  IS NOT DISTINCT FROM p_notes
     LIMIT 1;
    IF v_same_id IS NOT NULL THEN
      RETURN v_same_id;
    END IF;

    -- The next row after it in date order replaced it; if no dated row is
    -- later, the row in force did.
    SELECT s.id INTO v_next_id
      FROM public.hr_staff_salaries s
     WHERE s.staff_id = p_staff_id
       AND s.effective_from > p_effective_from
     ORDER BY s.effective_from, s.created_at, s.id
     LIMIT 1;
    v_next_id := COALESCE(v_next_id, v_current.id);

    PERFORM set_config('app.hr_salary_allow_past', 'on', true);
    INSERT INTO public.hr_staff_salaries (
      id, staff_id, hr_organization_id, salary_structure, monthly_gross,
      overtime_level, overtime_amount, eligible_for_pf, exempt_edli,
      eligible_for_insurance, eligible_for_gratuity, eligible_for_etf,
      epf_amount, eligible_for_esi, esi_amount,
      allowance_amount, allowance_label,
      effective_from, notes, created_by, updated_by, superseded_by
    ) VALUES (
      v_new_id, p_staff_id, p_hr_organization_id, p_salary_structure, p_monthly_gross,
      p_overtime_level, p_overtime_amount, p_eligible_for_pf, p_exempt_edli,
      p_eligible_for_insurance, p_eligible_for_gratuity, p_eligible_for_etf,
      v_epf, p_eligible_for_esi, v_esi,
      v_allowance, v_alw_label,
      p_effective_from, p_notes, auth.uid(), auth.uid(), v_next_id
    );
    PERFORM set_config('app.hr_salary_allow_past', '', true);
    RETURN v_new_id;
  END IF;

  -- The normal path: the new row replaces the row in force. The table guard
  -- refuses any change to superseded_by except this one, named here.
  IF v_has_current THEN
    PERFORM set_config('app.hr_salary_supersede', v_current.id::text, true);
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
    PERFORM set_config('app.hr_salary_supersede', '', true);
  END IF;

  -- A Director's past row that starts on or after the row in force (or is the
  -- first row for this person) is the one past insert the table guard lets
  -- through; the guard re-checks fn_is_the_director() itself.
  IF v_past_ok THEN
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
  'Supersede-and-insert a staff salary in one transaction. SECURITY INVOKER: hr_staff_salaries_write enforces hr.payroll.salary.manage. Returns the incumbent unchanged when the whole payload matches. Refuses a start before today (Asia/Kolkata); today is allowed. p_allow_past is honoured only for fn_is_the_director() and refused for anybody else. A Director''s past row dated before the row in force is filed as history and never replaces it. See 20270521090000.';

-- ---------------------------------------------------------------------------
-- 2. The table-level guard for direct writes
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it must see the caller's current_user (an API
-- role) and the caller's auth.uid(). fn_is_the_director() is SECURITY DEFINER
-- on its own, so it answers correctly from inside an invoker trigger. anon has
-- no EXECUTE on it, so it is only called for authenticated / service_role.
-- A trigger function needs no EXECUTE grant to fire, so nobody is granted it.
CREATE OR REPLACE FUNCTION public.hr_staff_salaries_refuse_past_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_today     date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_import_ok boolean := false;
BEGIN
  -- Only API callers. The database owner (migrations, an operator's repair, a
  -- foreign-key cascade) is not a user of the app; the function check covers
  -- any caller that goes through fn_hr_set_staff_salary.
  IF current_user NOT IN ('anon', 'authenticated', 'service_role') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- 2026-09-30: deleting a salary record rewrites pay history (and deleting
  -- the row in force leaves a person with no pay). No API caller may.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A salary record cannot be deleted. Record a new salary from today or a later date instead.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(current_setting('app.hr_salary_allow_past', true), '') = 'on'
     AND current_user <> 'anon' THEN
    v_import_ok := public.fn_is_the_director() IS TRUE;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_from < v_today AND NOT v_import_ok THEN
      RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
        to_char(NEW.effective_from, 'DD Mon YYYY'), to_char(v_today, 'DD Mon YYYY')
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE, part 1: which row is in force. Only fn_hr_set_staff_salary may
  -- change superseded_by, and only to retire the one row in force it names.
  -- Anything else (re-pointing, clearing it to bring an old salary back) is
  -- refused (W12 review of #4122, 2026-09-30).
  IF NEW.superseded_by IS DISTINCT FROM OLD.superseded_by THEN
    IF NOT (OLD.superseded_by IS NULL
            AND NEW.superseded_by IS NOT NULL
            AND COALESCE(current_setting('app.hr_salary_supersede', true), '') = OLD.id::text) THEN
      RAISE EXCEPTION 'Which salary is in force can only change by recording a new salary.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- UPDATE, part 2: the pay itself. annual_gross is GENERATED and not
  -- settable, so it is left out of the compare.
  IF (to_jsonb(NEW) - 'superseded_by' - 'updated_at' - 'updated_by' - 'annual_gross')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_by' - 'updated_at' - 'updated_by' - 'annual_gross')
  THEN
    -- Editing a row that has already started (or whose start was never
    -- recorded) rewrites pay already in force: a backdated change by another
    -- route. Moving a start into the past is the same thing. No exception for
    -- anybody: the Director's history import only ever INSERTS.
    IF OLD.effective_from IS NULL OR OLD.effective_from < v_today
       OR NEW.effective_from IS NULL OR NEW.effective_from < v_today THEN
      RAISE EXCEPTION 'A salary that has already started cannot be edited in place. Record a new salary from today or a later date.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_staff_salaries_refuse_past_start() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_staff_salaries_refuse_past_start() IS
  'BEFORE INSERT/UPDATE/DELETE guard on hr_staff_salaries for API callers: no insert starting before today (Asia/Kolkata) except the Director''s history row via fn_hr_set_staff_salary(p_allow_past); no change to superseded_by except fn_hr_set_staff_salary retiring the row in force; no in-place edit of a row already started; no delete. See 20270521090000.';

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_refuse_past_start ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_refuse_past_start
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_salaries
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_salaries_refuse_past_start();

NOTIFY pgrst, 'reload schema';
