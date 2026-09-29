-- ============================================================================
-- Migration: 20270512090000_hr_salary_suggestion_inputs_rpc
-- hr_salary_suggestion_inputs(p_staff_id) — what the salary suggestion needs
-- about ONE person, scoped to the colleges the caller may see
-- ============================================================================
-- !!! MUST NOT MERGE OR APPLY BEFORE #4103 AND #4111 !!!
--   #4103 (feat/hr-pay-band-check) is the base this PR is stacked on.
--   #4111 (20270506090000) locks hr.salary_suggestion_rule so that not every
--   signed-in account can read its rows. Without it, the rule's rupee amounts
--   are readable by anyone signed in. As a second guard, the rule editor's
--   save route asks fn_hr_salary_rule_lock_present() (below) and refuses to
--   publish or save a draft while #4111's policies are absent (HTTP 409).
-- ============================================================================
-- Created: 2026-09-29 - "Suggest a revised salary" on Employee Salaries.
--
-- The Director asked for a click that suggests a revised salary from the
-- salary scale, considering experience and other aspects (29 Sep 2026). The
-- suggestion itself is worked out in TypeScript (lib/hr/salary-suggestion.ts);
-- this function only hands the server route the inputs for one person:
--   - the job title, date of joining, recorded experience, qualifications and
--     research papers (from v_hr_staff, the HR-category-gated roster the salary
--     screen already lists);
--   - the monthly gross in force (superseded_by IS NULL);
--   - the college's pay band (the `hr.pay_scales` row, as hr_pay_band_policies()
--     reads it);
--   - the suggestion rule in force for the college: the college's own
--     `hr.salary_suggestion_rule` row, else the group-wide (scope_type
--     'global') row. A college row that is only a never-published draft, or was
--     published with no amount in it ('{}', or only the rounding and cap
--     switches), does not hide the group-wide rule: a row counts as a rule only
--     when hr_salary_rule_has_amount() says it holds a rupee amount (per year
--     at JKKN, per year before JKKN, or an extra's amount). That test is EXACTLY
--     the TypeScript one (parseSalarySuggestionRule + isSalarySuggestionRuleEmpty):
--     amounts are JSON numbers 0 or more (a numeric string is not an amount),
--     the stored object is the rule (no { value: ... } wrapper is unwrapped),
--     and an extra counts only as an object in an `extras` array with a
--     non-blank label. The same cases run against both
--     (supabase/tests/hr-salary-suggestion/rule-parity-cases.json).
--
-- A COLLEGE WITH NO RULE OF ITS OWN uses the group-wide rule, for everyone who
-- may see that college's people, including a holder scoped to one college. The
-- group-wide rule IS the effective rule for that college, so its amounts appear
-- in the worked-out lines. Intended (29 Sep 2026); only its effect on one person
-- is returned, never the group-wide row on its own.
--
-- WHY A FUNCTION. The rule and the band are rupee figures in platform_policies,
-- whose SELECT policy on main is `auth.uid() IS NOT NULL`, and #4111 narrows it
-- so a key holder reads only COLLEGE rows. A group-wide rule would then be
-- unreadable to the HR head, and the fallback would silently fail. This
-- function does the reading as its owner, behind the same two checks, in the
-- same order, as hr_staff_salary_directory() and hr_pay_band_policies():
--   1. user_has_permission('hr.payroll.salary.view'), or RAISE — so "no row"
--      always means "no such person in your colleges", never "not allowed";
--   2. role_has_institution_access(s.institution_id), evaluated as the CALLER
--      (both helpers read auth.uid(), the caller's JWT subject, not the owner).
-- It returns the rule only as "the rule for this person's college", never the
-- group-wide row on its own, and only its PUBLISHED value (never draft_value).
--
-- READ ONLY. STABLE, no writes. Nothing here changes anybody's pay.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. hr_salary_rule_has_amount(value) — does a stored rule hold a rupee amount?
-- ----------------------------------------------------------------------------
-- Pure. strict-mode jsonpath with silent => true: a value of the wrong shape
-- (a list, a number, `extras` that is not a list, an extra with no label)
-- simply does not match, instead of raising.
CREATE OR REPLACE FUNCTION public.hr_salary_rule_has_amount(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
       jsonb_path_exists(p_value, 'strict $.per_year_at_jkkn ? (@.type() == "number" && @ >= 0)', '{}', true)
    OR jsonb_path_exists(p_value, 'strict $.per_year_prior ? (@.type() == "number" && @ >= 0)', '{}', true)
    OR jsonb_path_exists(p_value,
         'strict $.extras[*] ? (@.type() == "object" && @.label.type() == "string" && @.label like_regex "\\S" && @.amount.type() == "number" && @.amount >= 0)',
         '{}', true),
    false)
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_rule_has_amount(jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_rule_has_amount(jsonb) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_rule_has_amount(jsonb) IS
  'True when a stored hr.salary_suggestion_rule value holds a rupee amount: per_year_at_jkkn, per_year_prior or an extra''s amount, each a JSON number 0 or more; an extra needs a non-blank string label and must sit in an extras array. Exactly the TypeScript parser''s test (parseSalarySuggestionRule). Pure.';

-- ----------------------------------------------------------------------------
-- 2. hr_salary_suggestion_inputs(p_staff_id)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_salary_suggestion_inputs(p_staff_id uuid)
RETURNS TABLE(
  staff_uuid           uuid,
  institution_id       uuid,
  designation          text,
  date_of_joining      date,
  experience_years     integer,
  has_extended_profile boolean,
  qualifications       jsonb,
  research_papers      integer,
  monthly_gross        numeric,
  band                 jsonb,
  rule                 jsonb,
  rule_source          text,
  rule_updated_at      timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.payroll.salary.view') THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to suggest a salary.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT s.id,
         s.institution_id,
         s.designation::text,
         s.date_of_joining,
         s.experience_years,
         s.has_extended_profile,
         s.qualifications,
         s.research_papers,
         sal.monthly_gross,
         bp.value,
         COALESCE(rc.value, rg.value),
         CASE WHEN rc.id IS NOT NULL THEN 'college'
              WHEN rg.id IS NOT NULL THEN 'group' END,
         COALESCE(rc.updated_at, rg.updated_at)
    FROM public.v_hr_staff s
    LEFT JOIN public.hr_staff_salaries sal
           ON sal.staff_id = s.id AND sal.superseded_by IS NULL
    LEFT JOIN public.platform_policies bp
           ON bp.policy_key = 'hr.pay_scales'
          AND bp.scope_type = 'institution'
          AND bp.scope_id = s.institution_id
    LEFT JOIN public.platform_policies rc
           ON rc.policy_key = 'hr.salary_suggestion_rule'
          AND rc.scope_type = 'institution'
          AND rc.scope_id = s.institution_id
          AND rc.is_active IS NOT FALSE
          AND rc.publication_state <> 'draft_only'
          AND public.hr_salary_rule_has_amount(rc.value)
    LEFT JOIN public.platform_policies rg
           ON rg.policy_key = 'hr.salary_suggestion_rule'
          AND rg.scope_type = 'global'
          AND rg.scope_id IS NULL
          AND rg.is_active IS NOT FALSE
          AND rg.publication_state <> 'draft_only'
          AND public.hr_salary_rule_has_amount(rg.value)
   WHERE s.id = p_staff_id
     AND s.institution_id IS NOT NULL
     AND public.role_has_institution_access(s.institution_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_suggestion_inputs(uuid) IS
  'Inputs for the salary suggestion for one person: roster fields, pay in force, the college pay band and the suggestion rule in force (college row, else group-wide; published value only). Gated on hr.payroll.salary.view and scoped by role_has_institution_access, as hr_staff_salary_directory() is. Read only.';

-- ----------------------------------------------------------------------------
-- 3. fn_hr_salary_rule_lock_present() — is #4111's protection live?
-- ----------------------------------------------------------------------------
-- The rule editor's save route (POST /api/hr/payroll/salary-suggestion-rule)
-- calls this first and refuses to publish or save a draft (409) while it is
-- false. A draft sits in the same row (draft_value), so it would be just as
-- readable.
--
-- True only when BOTH restrictive SELECT policies #4111 (20270506090000)
-- creates are present, name them hr.salary_suggestion_rule in their
-- expression, apply to role authenticated, and row level security is on for
-- their tables:
--   platform_policies_pay_keys_restricted    ON public.platform_policies
--   hr_policy_audit_log_pay_keys_restricted  ON public.hr_policy_audit_log
-- If #4111 is ever re-done under other policy names, this must change with it;
-- until then it fails CLOSED (false), which only stops the editor saving.
--
-- Read only. It reveals whether two policies exist, nothing else. SECURITY
-- DEFINER so the answer does not depend on the caller's catalog visibility.
-- SUPER ADMINS ONLY, like the route that calls it: a signed-in caller who is
-- not one gets 42501. No signed-in user (postgres, service role) = allowed.
CREATE OR REPLACE FUNCTION public.fn_hr_salary_rule_lock_present()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super administrator can check pay-policy protection.'
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
  'True when #4111''s restrictive SELECT policies (platform_policies_pay_keys_restricted, hr_policy_audit_log_pay_keys_restricted) are live and cover hr.salary_suggestion_rule. The salary rule editor refuses to save until it is true. Read only.';
