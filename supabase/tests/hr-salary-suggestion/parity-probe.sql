-- hr_salary_rule_has_amount() against every case in rule-parity-cases.json (the
-- same file __tests__/hr/salary-suggestion-rule-parity.test.ts reads). run.sh
-- passes the file in as :'cases'. Prints PARITY ok/MISMATCH per case, then a total.
SELECT format('PARITY   %s %s (expected %s, got %s)',
         CASE WHEN public.hr_salary_rule_has_amount(c -> 'value') = (c ->> 'has_amount')::boolean
              THEN 'ok      ' ELSE 'MISMATCH' END,
         c ->> 'case', c ->> 'has_amount', public.hr_salary_rule_has_amount(c -> 'value'))
  FROM jsonb_array_elements(:'cases'::jsonb) c;
SELECT format('PARITY   total=%s mismatches=%s', count(*),
         count(*) FILTER (WHERE public.hr_salary_rule_has_amount(c -> 'value') <> (c ->> 'has_amount')::boolean))
  FROM jsonb_array_elements(:'cases'::jsonb) c;
