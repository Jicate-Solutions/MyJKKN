-- 20270521090000_hr_salary_no_backdating.sql
--
-- THE RULINGS (Director)
--   29 Sep 2026: the DATABASE must refuse any salary change starting in the
--     past.
--   30 Sep 2026 08:25 (4): a raise entered late starts from the 1st of NEXT
--     month; the missed month is not paid back through the system.
--   30 Sep 2026 08:59 (confirmed 09:05; REPLACES the earlier Excel-import and
--     past-date exceptions):
--     - The salary Excel import is REMOVED. Every salary is created or edited
--       on the screen only.
--     - Only the Director list (director@jkkn.ac.in and isvarya@jkkn.ac.in,
--       fn_is_the_director(), Draft #4121) may create or edit a salary. The HR
--       head (hr.payroll.salary.manage) can only look.
--     - NO past-date exception for anyone: the database refuses every salary
--       change starting before today (India time).
--     - The approvals job (fn_hr_salary_revision_apply_due, Draft #4120) stays
--       the one automatic pay write, on the Director's approval.
--
-- WHY
--   fn_hr_set_staff_salary never looked at p_effective_from beyond "is it
--   there", and anyone holding hr.payroll.salary.manage could write any pay.
--   On 2026-09-29 a pay change for one staff member was saved through the app
--   on the 29th with a start of 1 Sep, a backdated raise. Nothing stopped it.
--   (That row is NOT touched here.)
--
-- DEPENDS ON 20270520090000_the_director_list.sql (Draft #4121), which defines
--   public.fn_is_the_director(). A precondition below refuses to run without
--   it, so this file cannot be applied first by accident. #4122 merges AFTER
--   #4121.
--
-- WHAT THIS CHANGES
--   1. fn_hr_set_staff_salary: re-created from main's NEWEST body
--      (20260902100000 section 5; three definitions exist on main:
--      20260821201000, 20260901120000, 20260902100000). SAME 18 arguments,
--      so every caller (the salary dialog, the staff form, the approvals job)
--      keeps working unchanged. Three additions:
--        a) WHO. A signed-in caller must be on the Director list
--           (fn_is_the_director()). Anybody else (an HR head holding
--           hr.payroll.salary.manage, a super admin who is not on the list, a
--           user with no role) is refused, 42501. A signed-out caller is
--           refused. The server key (service_role) is allowed. So is trusted
--           database code that is not an API role: the approvals job
--           (SECURITY DEFINER, so it runs as the function owner) writing a
--           raise the Director approved, a migration, an operator in the SQL
--           editor.
--        b) WHEN. A start before TODAY IN INDIA (Asia/Kolkata) is refused, for
--           every caller, the Director and the server key included. There is
--           no exception and no parameter to ask for one. TODAY ITSELF IS
--           ALLOWED. The check sits AFTER the "identical payload" early
--           return: saving something that changes nothing writes nothing, so
--           it is not a change and still succeeds, exactly as before.
--        c) Replacing the row in force tells the table guard which ONE row it
--           is retiring (a transaction-local setting), because the guard below
--           refuses every other change to superseded_by.
--      Everything else in the body is main's newest version, unchanged.
--      An earlier draft of this PR added a 19th parameter (p_allow_past) and a
--      history path. Both are gone; the 19-argument form is dropped IF EXISTS.
--
--   2. A BEFORE INSERT/UPDATE/DELETE trigger on hr_staff_salaries. The function
--      is SECURITY INVOKER and hr_staff_salaries_write (FOR ALL) still lets
--      anyone holding hr.payroll.salary.manage write and DELETE rows directly
--      through the Data API. That policy is left as it is, because it also
--      decides who may READ pay (the 21 Aug narrowing), and reads do not
--      change here. The trigger closes the direct writes instead. For API
--      callers (anon, authenticated, service_role):
--        - anon                                                -> refused
--        - signed in and NOT on the Director list              -> refused
--        - DELETE                                              -> refused
--        - INSERT with no start, or a start before today       -> refused
--        - UPDATE that changes superseded_by                   -> refused
--          (except fn_hr_set_staff_salary retiring the one row in force).
--          Re-pointing superseded_by could bring an old salary back into force.
--        - UPDATE that changes any other column on a row that started before
--          today (or has no start recorded), or that moves the start before
--          today                                               -> refused
--      The database owner (migrations, an operator's repair in the SQL editor,
--      a foreign-key cascade when a staff record is deleted, the approvals job)
--      is not an API caller and is not stopped by the trigger; it IS still
--      stopped by the past-date check when it goes through
--      fn_hr_set_staff_salary.
--      The supersede setting (app.hr_salary_supersede) cannot be set through
--      the Data API, and the trigger still requires the Director list for a
--      signed-in caller, so the setting alone opens nothing.
--
-- READS DO NOT CHANGE. hr_staff_salaries_select, hr_staff_salaries_write and
--   hr_staff_salary_directory() are untouched: super admins and the HR head
--   still see the register; everyone still sees their own pay.
--
-- DATA DRIFT, UNVERIFIED
--   The repo declares hr_staff_salaries.effective_from NOT NULL, but the
--   orchestrator's read of production (2026-09-30) saw older rows with a NULL
--   start. Whether production enforces NOT NULL was NOT verified. This file
--   treats a NULL start as "already started" and never writes one.
--
-- NOT COMPARED WITH PRODUCTION
--   The live body of fn_hr_set_staff_salary could not be read. This file is
--   built from main's newest definition. Diff it against pg_get_functiondef on
--   production before apply.
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
-- The 19-argument form existed only in an earlier, never-applied draft of this
-- PR. Dropped in case a rehearsal database still has it, so no overload is
-- left behind (PostgREST answers PGRST203 on every call when two exist).
DROP FUNCTION IF EXISTS public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text, boolean
);

CREATE OR REPLACE FUNCTION public.fn_hr_set_staff_salary(
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
  p_allowance_label        text    DEFAULT NULL
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
  -- 2026-09-30: "today" is India's today, not the server's (UTC) date.
  v_today     date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- 2026-09-30 (ruling of 08:59): only the Director list may create or edit a
  -- salary. current_user is the caller's API role because this function is
  -- SECURITY INVOKER. service_role (the server key) and trusted database code
  -- (the approvals job runs SECURITY DEFINER, as the owner) are not API users
  -- and pass. IS TRUE, not a bare test: a NULL answer is "no".
  IF current_user = 'anon' THEN
    RAISE EXCEPTION 'Only the Director can change a salary.'
      USING ERRCODE = '42501';
  END IF;
  IF current_user = 'authenticated' AND NOT (public.fn_is_the_director() IS TRUE) THEN
    RAISE EXCEPTION 'Only the Director can change a salary.'
      USING ERRCODE = '42501';
  END IF;

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

  -- An amount against a flag that is OFF is zeroed, not rejected. A leftover
  -- figure beside a "No" is a formatting slip, not a decision.
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

  -- 2026-09-30: no salary change may start in the past, for anybody. Today is
  -- allowed. Placed AFTER the identical-payload return above: saving something
  -- that changes nothing writes nothing, so it is not a change.
  IF p_effective_from < v_today THEN
    RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
      to_char(p_effective_from, 'DD Mon YYYY'), to_char(v_today, 'DD Mon YYYY')
      USING ERRCODE = '22023',
            HINT = 'Pick today or a later date. A raise entered late starts from the 1st of next month.';
  END IF;

  -- The new row replaces the row in force. The table guard refuses any change
  -- to superseded_by except this one, named here for this transaction only.
  -- FOUND still describes the SELECT above: nothing in between sets it.
  IF FOUND THEN
    PERFORM set_config('app.hr_salary_supersede', v_current.id::text, true);
    UPDATE public.hr_staff_salaries
       SET superseded_by = v_new_id, updated_at = now(), updated_by = auth.uid()
     WHERE id = v_current.id;
    PERFORM set_config('app.hr_salary_supersede', '', true);
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

  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_hr_set_staff_salary(
  uuid, uuid, numeric, date, text, text, numeric,
  boolean, boolean, boolean, boolean, boolean, text,
  numeric, boolean, numeric, numeric, text
) IS
  'Supersede-and-insert a staff salary in one transaction. SECURITY INVOKER. A signed-in caller must be on the Director list (fn_is_the_director()); service_role and trusted database code (the approvals job) may also write. Returns the incumbent unchanged when the whole payload matches. Refuses a start before today (Asia/Kolkata) for every caller; today is allowed. See 20270521090000.';

-- ---------------------------------------------------------------------------
-- 2. The table-level guard for direct writes
-- ---------------------------------------------------------------------------
-- An earlier, never-applied draft of this PR named the guard
-- hr_staff_salaries_refuse_past_start. Removed in case a rehearsal database
-- still has it, so two guards never run.
DROP TRIGGER IF EXISTS trg_hr_staff_salaries_refuse_past_start ON public.hr_staff_salaries;
DROP FUNCTION IF EXISTS public.hr_staff_salaries_refuse_past_start();

-- SECURITY INVOKER on purpose: it must see the caller's current_user (an API
-- role) and the caller's auth.uid(). fn_is_the_director() is SECURITY DEFINER
-- on its own, so it answers correctly from inside an invoker trigger. It is
-- only called for authenticated, which holds EXECUTE on it.
-- A trigger function needs no EXECUTE grant to fire, so nobody is granted it.
CREATE OR REPLACE FUNCTION public.hr_staff_salaries_guard_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  -- Only API callers. The database owner (migrations, an operator's repair, a
  -- foreign-key cascade, the approvals job running SECURITY DEFINER) is not a
  -- user of the app; the function's past-date check covers any caller that
  -- goes through fn_hr_set_staff_salary.
  IF current_user NOT IN ('anon', 'authenticated', 'service_role') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- 2026-09-30 (ruling of 08:59): WHO. Only the Director list writes pay. The
  -- HR head's hr.payroll.salary.manage still passes the table's row rule (that
  -- rule also governs reads, which do not change), so it is refused here.
  IF current_user = 'anon'
     OR (current_user = 'authenticated' AND NOT (public.fn_is_the_director() IS TRUE)) THEN
    RAISE EXCEPTION 'Only the Director can change a salary.'
      USING ERRCODE = '42501';
  END IF;

  -- Deleting a salary record rewrites pay history (and deleting the row in
  -- force leaves a person with no pay). No API caller may.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A salary record cannot be deleted. Record a new salary from today or a later date instead.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_from IS NULL OR NEW.effective_from < v_today THEN
      RAISE EXCEPTION 'A salary change cannot start in the past. % is before today (%).',
        COALESCE(to_char(NEW.effective_from, 'DD Mon YYYY'), 'A blank start date'),
        to_char(v_today, 'DD Mon YYYY')
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE, part 1: which row is in force. Only fn_hr_set_staff_salary may
  -- change superseded_by, and only to retire the one row in force it names.
  -- Anything else (re-pointing, clearing it to bring an old salary back) is
  -- refused.
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
    -- route. Moving a start into the past is the same thing.
    IF OLD.effective_from IS NULL OR OLD.effective_from < v_today
       OR NEW.effective_from IS NULL OR NEW.effective_from < v_today THEN
      RAISE EXCEPTION 'A salary that has already started cannot be edited in place. Record a new salary from today or a later date.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_staff_salaries_guard_writes() FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.hr_staff_salaries_guard_writes() IS
  'BEFORE INSERT/UPDATE/DELETE guard on hr_staff_salaries for API callers: anon refused; a signed-in caller must be on the Director list (fn_is_the_director()); no insert with a blank start or a start before today (Asia/Kolkata); no change to superseded_by except fn_hr_set_staff_salary retiring the row in force; no in-place edit of a row already started; no delete. See 20270521090000.';

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_guard_writes ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_guard_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.hr_staff_salaries
  FOR EACH ROW EXECUTE FUNCTION public.hr_staff_salaries_guard_writes();

NOTIFY pgrst, 'reload schema';
