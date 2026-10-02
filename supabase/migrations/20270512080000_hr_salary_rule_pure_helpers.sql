-- Migration: 20270512080000_hr_salary_rule_pure_helpers
-- The two PURE helpers of #4119 (20270512090000), copied verbatim, so the salary
-- revision module (20270519090000) can be applied before #4119. They read no
-- table, touch no policy and change nobody's pay. #4119 re-creates them with
-- CREATE OR REPLACE, so applying it later is a no-op for these two.

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

NOTIFY pgrst, 'reload schema';
