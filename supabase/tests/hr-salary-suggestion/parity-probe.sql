-- hr_salary_rule_department_rate() and hr_salary_rule_round_to() against every
-- case in rule-parity-cases.json (the same file
-- __tests__/hr/salary-suggestion-rule-parity.test.ts reads). run.sh passes the
-- file in as :'cases'. Prints PARITY ok/MISMATCH per case, then a total.
WITH c AS (
  SELECT x AS c,
         public.hr_salary_rule_department_rate(x -> 'value', (x ->> 'department_id')::uuid) AS got_rate,
         public.hr_salary_rule_round_to(x -> 'value') AS got_round,
         (x ->> 'rate')::numeric AS want_rate,
         (x ->> 'round_to')::numeric AS want_round
    FROM jsonb_array_elements(:'cases'::jsonb) x
)
SELECT format('PARITY   %s %s (expected rate %s round %s, got rate %s round %s)',
         CASE WHEN got_rate IS NOT DISTINCT FROM want_rate AND got_round IS NOT DISTINCT FROM want_round
              THEN 'ok      ' ELSE 'MISMATCH' END,
         c ->> 'case', coalesce(want_rate::text, 'none'), coalesce(want_round::text, 'none'),
         coalesce(got_rate::text, 'none'), coalesce(got_round::text, 'none'))
  FROM c;

WITH c AS (
  SELECT public.hr_salary_rule_department_rate(x -> 'value', (x ->> 'department_id')::uuid) AS got_rate,
         public.hr_salary_rule_round_to(x -> 'value') AS got_round,
         (x ->> 'rate')::numeric AS want_rate,
         (x ->> 'round_to')::numeric AS want_round
    FROM jsonb_array_elements(:'cases'::jsonb) x
)
SELECT format('PARITY   total=%s mismatches=%s', count(*),
         count(*) FILTER (WHERE got_rate IS DISTINCT FROM want_rate OR got_round IS DISTINCT FROM want_round))
  FROM c;
