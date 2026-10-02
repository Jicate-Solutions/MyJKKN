-- ============================================================================
-- Migration: 20270512090000_hr_salary_suggestion_inputs_rpc
-- The salary suggestion: one person's inputs, and the Director's amounts per
-- department — readable only as "the amount for this person's department",
-- writable only by the Director list.
-- ============================================================================
-- !!! MUST NOT MERGE OR APPLY BEFORE #4103, #4111 AND #4121 !!!
--   #4103 (feat/hr-pay-band-check) is the base this PR is stacked on.
--   #4111 (20270506090000) locks hr.salary_suggestion_rule so that not every
--   signed-in account can read its rows. Without it, the amounts are readable
--   by anyone signed in. As a second guard, the settings page's save route
--   asks fn_hr_salary_rule_lock_present() (section 4) and refuses to publish
--   or save a draft while #4111's policies are absent (HTTP 409).
--   #4121 (20270520090000) creates fn_is_the_director(). Section 0 below stops
--   this migration outright if that function is missing.
--
-- VERSION NUMBER: 20270512090000 is a deliberate far-future sort version, like
-- the other HR drafts of September 2026 (20270506…, 20270519…, 20270520…). It
-- only orders the file; the work is dated 29–30 September 2026.
-- ============================================================================
-- Created: 2026-09-29 - "Suggest a revised salary" on Employee Salaries.
-- Updated: 2026-09-30 - the Director's rulings: the amount per year at JKKN is
--   set PER DEPARTMENT on one settings page (empty = no suggestion); years
--   before JKKN count at HALF the department's amount (only when recorded); a
--   doctorate adds nothing; no cap at the band top (a red warning instead);
--   and the amounts may be changed ONLY by the Director list.
--
-- THE RULE. One group-wide row of platform_policies, key
-- 'hr.salary_suggestion_rule', scope_type 'global', scope_id NULL:
--   { "per_year_by_department": { "<department id>": <rupees>, ... },
--     "round_to": <rupees> }                           -- round_to optional
-- A department with no key has NO amount: nobody in it gets a suggestion.
-- The figure is worked out in TypeScript (lib/hr/salary-suggestion.ts); this
-- file only reads the inputs and guards the row.
--
-- The live body of fn_hr_set_staff_salary was not readable when this was
-- written; nothing here touches it. Nothing here changes anybody's pay.
-- No inner BEGIN/COMMIT. Idempotent: safe to apply twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. #4121 first. Stop here, changing nothing, if the Director list's check
--    function is not in this database.
-- ----------------------------------------------------------------------------
DO $check$
BEGIN
  IF to_regprocedure('public.fn_is_the_director()') IS NULL THEN
    RAISE EXCEPTION 'ABORT: public.fn_is_the_director() is missing. Apply #4121 (20270520090000_the_director_list) before this migration.';
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- 1. hr_salary_rule_department_rate(value, department) — one department's amount
-- ----------------------------------------------------------------------------
-- Pure. The amount per year at JKKN the stored rule holds for one department,
-- or NULL when it holds none. EXACTLY the TypeScript test
-- (parseSalarySuggestionRule + departmentRate): the stored object is the rule
-- (no { value: ... } wrapper is unwrapped), per_year_by_department must be an
-- object, the key is the department id as uuid::text prints it (lower case),
-- and the amount must be a JSON number 0 or more (a numeric string is not an
-- amount). CASE, not AND, so the ::numeric cast only ever sees a JSON number.
-- The same cases run against both (supabase/tests/hr-salary-suggestion/
-- rule-parity-cases.json).
CREATE OR REPLACE FUNCTION public.hr_salary_rule_department_rate(p_value jsonb, p_department_id uuid)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'object'
     AND jsonb_typeof(p_value -> 'per_year_by_department') = 'object'
     AND jsonb_typeof(p_value -> 'per_year_by_department' -> (p_department_id::text)) = 'number'
    THEN CASE
      WHEN (p_value -> 'per_year_by_department' ->> (p_department_id::text))::numeric >= 0
      THEN (p_value -> 'per_year_by_department' ->> (p_department_id::text))::numeric
    END
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_rule_department_rate(jsonb, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_rule_department_rate(jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_rule_department_rate(jsonb, uuid) IS
  'The rupees per year at JKKN a stored hr.salary_suggestion_rule value holds for one department (per_year_by_department -> <department id>), a JSON number 0 or more; NULL when it holds none. Exactly the TypeScript parser''s test. Pure. Migration 20270512090000.';

-- ----------------------------------------------------------------------------
-- 2. hr_salary_rule_round_to(value) — the rounding step, when one is set
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_rule_round_to(p_value jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'object' AND jsonb_typeof(p_value -> 'round_to') = 'number'
    THEN CASE WHEN (p_value ->> 'round_to')::numeric > 0 THEN (p_value ->> 'round_to')::numeric END
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_rule_round_to(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_rule_round_to(jsonb) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_rule_round_to(jsonb) IS
  'The rounding step a stored hr.salary_suggestion_rule value holds (round_to, a JSON number above 0), else NULL (the suggestion then rounds to 100). Pure. Migration 20270512090000.';

-- ----------------------------------------------------------------------------
-- 3. hr_salary_suggestion_inputs(p_staff_id)
-- ----------------------------------------------------------------------------
-- What the suggestion needs about ONE person, for the server route:
--   - department, job title, date of joining and recorded experience (from
--     v_hr_staff, the HR-category-gated roster the salary screen already lists);
--   - the monthly gross in force (superseded_by IS NULL);
--   - the college's pay band (the `hr.pay_scales` row, as hr_pay_band_policies()
--     reads it);
--   - from the rule, ONLY the amount for this person's department and the
--     rounding step — never the row itself, never another department's amount.
--     Only the PUBLISHED value counts (never draft_value; a never-published
--     row is ignored).
--
-- WHY A FUNCTION. The rule and the band are rupee figures in platform_policies,
-- and #4111 lets only admins read a group-wide pay row. This function does the
-- reading as its owner, behind the same two checks, in the same order, as
-- hr_staff_salary_directory() and hr_pay_band_policies():
--   1. user_has_permission('hr.payroll.salary.view') must be TRUE, or RAISE —
--      so "no row" always means "no such person in your colleges". Written
--      "IS NOT TRUE" so a NULL answer is a refusal, never a pass;
--   2. role_has_institution_access(s.institution_id), evaluated as the CALLER
--      (both helpers read auth.uid(), the caller's JWT subject, not the owner).
--
-- READ ONLY. STABLE, no writes.
CREATE OR REPLACE FUNCTION public.hr_salary_suggestion_inputs(p_staff_id uuid)
RETURNS TABLE(
  staff_uuid           uuid,
  institution_id       uuid,
  department_id        uuid,
  department_name      text,
  designation          text,
  date_of_joining      date,
  experience_years     integer,
  has_extended_profile boolean,
  monthly_gross        numeric,
  band                 jsonb,
  rule_rate            numeric,
  rule_round_to        numeric,
  rule_updated_at      timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.user_has_permission('hr.payroll.salary.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to suggest a salary.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.institution_id,
         s.department_id,
         d.department_name::text,
         s.designation::text,
         s.date_of_joining,
         s.experience_years,
         s.has_extended_profile,
         sal.monthly_gross,
         bp.value,
         public.hr_salary_rule_department_rate(rg.value, s.department_id),
         public.hr_salary_rule_round_to(rg.value),
         rg.updated_at
    FROM public.v_hr_staff s
    LEFT JOIN public.departments d
           ON d.id = s.department_id
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
    LEFT JOIN public.platform_policies bp
           ON bp.policy_key = 'hr.pay_scales'
          AND bp.scope_type = 'institution'
          AND bp.scope_id = s.institution_id
    LEFT JOIN public.platform_policies rg
           ON rg.policy_key = 'hr.salary_suggestion_rule'
          AND rg.scope_type = 'global'
          AND rg.scope_id IS NULL
          AND rg.is_active IS NOT FALSE
          AND rg.publication_state <> 'draft_only'
   WHERE s.id = p_staff_id
     AND s.institution_id IS NOT NULL
     AND public.role_has_institution_access(s.institution_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_suggestion_inputs(uuid) IS
  'Inputs for the salary suggestion for one person: roster fields and department, pay in force, the college pay band, and from the group-wide hr.salary_suggestion_rule row only the amount for the person''s department and the rounding step (published value only). Gated on hr.payroll.salary.view (IS NOT TRUE refuses) and scoped by role_has_institution_access, as hr_staff_salary_directory() is. Read only. Migration 20270512090000.';

-- ----------------------------------------------------------------------------
-- 4. fn_hr_salary_rule_lock_present() — is #4111's protection live?
-- ----------------------------------------------------------------------------
-- The settings page's save route (POST /api/hr/payroll/salary-suggestion-rule)
-- calls this and refuses to publish or save a draft (409) while it is false.
-- A draft sits in the same row (draft_value), so it would be just as readable.
--
-- True only when BOTH restrictive SELECT policies #4111 (20270506090000)
-- creates are present, name hr.salary_suggestion_rule in their expression,
-- apply to role authenticated, and row level security is on for their tables:
--   platform_policies_pay_keys_restricted    ON public.platform_policies
--   hr_policy_audit_log_pay_keys_restricted  ON public.hr_policy_audit_log
-- If #4111 is ever re-done under other policy names, this must change with it;
-- until then it fails CLOSED (false), which only stops the page saving.
--
-- Read only. It reveals whether two policies exist, nothing else. SECURITY
-- DEFINER so the answer does not depend on the caller's catalog visibility.
-- Only a super admin or someone on the Director list may ask: any other
-- signed-in caller gets 42501 ("IS NOT TRUE", so a NULL answer refuses too).
-- No signed-in user (postgres, service role) = allowed.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_rule_lock_present()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.is_super_admin() IS NOT TRUE
     AND public.fn_is_the_director() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a super administrator or the Director can check pay-policy protection.'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
  SELECT count(*) = 2
    FROM pg_catalog.pg_policies p
    JOIN pg_catalog.pg_class c
      ON c.relname = p.tablename
     AND c.relnamespace = 'public'::regnamespace
   WHERE p.schemaname = 'public'
     AND (p.tablename, p.policyname) IN (
           ('platform_policies',   'platform_policies_pay_keys_restricted'),
           ('hr_policy_audit_log', 'hr_policy_audit_log_pay_keys_restricted'))
     AND p.permissive = 'RESTRICTIVE'
     AND p.cmd = 'SELECT'
     AND 'authenticated' = ANY (p.roles)
     AND strpos(p.qual, 'hr.salary_suggestion_rule') > 0
     AND c.relrowsecurity
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_salary_rule_lock_present() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_salary_rule_lock_present() TO authenticated;

COMMENT ON FUNCTION public.fn_hr_salary_rule_lock_present() IS
  'True when #4111''s restrictive SELECT policies (platform_policies_pay_keys_restricted, hr_policy_audit_log_pay_keys_restricted) are live and cover hr.salary_suggestion_rule. The salary suggestion settings page refuses to save until it is true. Super admins and the Director list only. Read only. Migration 20270512090000.';

-- ----------------------------------------------------------------------------
-- 5. Only the Director list may write the rule
-- ----------------------------------------------------------------------------
-- The Director's ruling (30 Sep 2026): the per-department amounts are
-- editable ONLY by the Director list; other super admins look only. #4111's
-- restrictive write policies let any super admin write this key (15 accounts,
-- developers and a shared test account among them). This BEFORE trigger
-- narrows that to fn_is_the_director() for EVERY insert, update or delete
-- that touches the key — including renaming another row into it or out of it
-- — whatever the policies allow (permissive policies OR together, so a policy
-- alone could be widened later by accident; a trigger cannot).
--
-- Allowed: a caller on the Director list; service_role; a database session
-- with no JWT (a migration, the SQL console). Refused with 42501: anon (before
-- fn_is_the_director() is even called — anon has no EXECUTE on it), and every
-- other signed-in account. The same shape as #4121's guard on its own list.
CREATE OR REPLACE FUNCTION public.fn_guard_salary_suggestion_rule_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  c_key CONSTANT text := 'hr.salary_suggestion_rule';
  v_role text := auth.role();
BEGIN
  IF NOT ((TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
       OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated' THEN
      RAISE EXCEPTION 'Only the Director can change the salary suggestion amounts.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change the salary suggestion amounts.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_salary_suggestion_rule_writes() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_salary_suggestion_rule_writes() IS
  'BEFORE trigger on platform_policies. Refuses any insert/update/delete touching hr.salary_suggestion_rule unless the caller is on the Director list (fn_is_the_director()), is service_role, or is a direct DB session with no JWT. The Director''s ruling of 30 Sep 2026. Migration 20270512090000.';

DROP TRIGGER IF EXISTS trg_guard_salary_suggestion_rule_writes ON public.platform_policies;
CREATE TRIGGER trg_guard_salary_suggestion_rule_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_salary_suggestion_rule_writes();

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration):
--   DROP TRIGGER IF EXISTS trg_guard_salary_suggestion_rule_writes ON public.platform_policies;
--   DROP FUNCTION IF EXISTS public.fn_guard_salary_suggestion_rule_writes();
--   DROP FUNCTION IF EXISTS public.fn_hr_salary_rule_lock_present();
--   DROP FUNCTION IF EXISTS public.hr_salary_suggestion_inputs(uuid);
--   DROP FUNCTION IF EXISTS public.hr_salary_rule_round_to(jsonb);
--   DROP FUNCTION IF EXISTS public.hr_salary_rule_department_rate(jsonb, uuid);
