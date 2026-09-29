-- ============================================================================
-- Migration: 20270512090000_hr_salary_suggestion_inputs_rpc
-- hr_salary_suggestion_inputs(p_staff_id) — what the salary suggestion needs
-- about ONE person, scoped to the colleges the caller may see
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
--     when it holds a rupee amount (per year at JKKN, per year before JKKN, or
--     an extra's amount), which is the same test the suggestion applies
--     (isSalarySuggestionRuleEmpty). The editor stores amounts as numbers.
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
          AND (jsonb_typeof(rc.value -> 'per_year_at_jkkn') = 'number'
               OR jsonb_typeof(rc.value -> 'per_year_prior') = 'number'
               OR jsonb_path_exists(rc.value, '$.extras[*].amount ? (@.type() == "number")'))
    LEFT JOIN public.platform_policies rg
           ON rg.policy_key = 'hr.salary_suggestion_rule'
          AND rg.scope_type = 'global'
          AND rg.scope_id IS NULL
          AND rg.is_active IS NOT FALSE
          AND rg.publication_state <> 'draft_only'
          AND (jsonb_typeof(rg.value -> 'per_year_at_jkkn') = 'number'
               OR jsonb_typeof(rg.value -> 'per_year_prior') = 'number'
               OR jsonb_path_exists(rg.value, '$.extras[*].amount ? (@.type() == "number")'))
   WHERE s.id = p_staff_id
     AND s.institution_id IS NOT NULL
     AND public.role_has_institution_access(s.institution_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_salary_suggestion_inputs(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_salary_suggestion_inputs(uuid) IS
  'Inputs for the salary suggestion for one person: roster fields, pay in force, the college pay band and the suggestion rule in force (college row, else group-wide; published value only). Gated on hr.payroll.salary.view and scoped by role_has_institution_access, as hr_staff_salary_directory() is. Read only.';
