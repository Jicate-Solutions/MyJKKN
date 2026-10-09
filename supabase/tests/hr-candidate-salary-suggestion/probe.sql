-- Call hr_candidate_salary_suggestion_inputs(candidate) AS each signed-in person
-- (role authenticated, request.jwt.claims = {sub, role}; no college id supplied
-- anywhere), and next to it how many rows the candidate table's own SELECT
-- policy shows that person ("table=").
-- Expected:
--   the Director / super admin -> A: title=Typist dept=Dept A rate=100 round=500 prior=4.5 band=yes
--                                    college=College A note=CV page 2
--                                 B: dept=Dept B rate=none (the draft's 999 is ignored) band=no
--                                 S: sees
--   HR head (A)               -> A: sees · B, S: not visible (table=0 too)
--   Salary only (A)           -> A: not visible (no recruitment view) · B: not visible · S: sees (submitted it)
--   Recruiter (A)             -> REFUSED for every candidate (no hr.payroll.salary.view), though table=1 for A
--   No role                   -> REFUSED
-- Every SEES line must agree with table=1, every "not visible" with table=0.
DO $$
DECLARE u record; p record; r record; t int; got text;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('the Director',     '00000000-0000-0000-0000-00000000aa06'),
    ('super admin',      '00000000-0000-0000-0000-00000000aa04'),
    ('HR head (A)',      '00000000-0000-0000-0000-00000000aa01'),
    ('Salary only (A)',  '00000000-0000-0000-0000-00000000aa03'),
    ('Recruiter (A)',    '00000000-0000-0000-0000-00000000aa02'),
    ('No role',          '00000000-0000-0000-0000-00000000aa07')) v(label, uid)
  LOOP
    FOR p IN SELECT * FROM (VALUES
      ('A', '00000000-0000-0000-0000-0000000ca0a1'::uuid),
      ('B', '00000000-0000-0000-0000-0000000ca0b2'::uuid),
      ('S', '00000000-0000-0000-0000-0000000ca0c3'::uuid)) w(label, cid)
    LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        SELECT count(*) INTO t FROM public.hr_recruitment_candidates c WHERE c.id = p.cid;
        SELECT count(*) AS n,
               max(format('title=%s dept=%s rate=%s round=%s prior=%s band=%s college=%s note=%s',
                   coalesce(x.designation, 'none'), coalesce(x.department_name, 'none'),
                   coalesce(x.rule_rate::text, 'none'), coalesce(x.rule_round_to::text, 'none'),
                   coalesce(x.prior_experience_years::text, 'none'),
                   CASE WHEN x.band IS NULL THEN 'no' ELSE 'yes' END,
                   coalesce(x.institution_name, 'none'), coalesce(x.prior_experience_source, 'none'))) AS what
          INTO r
          FROM public.hr_candidate_salary_suggestion_inputs(p.cid) x;
        RESET ROLE;
        got := CASE WHEN r.n = 0 THEN 'not visible' WHEN r.n > 1 THEN format('HOLE %s rows', r.n) ELSE r.what END;
        IF (r.n = 1) <> (t = 1) THEN got := 'HOLE disagrees with the table: ' || got; END IF;
        RAISE NOTICE 'SEES     % candidate % table=% -> %', rpad(u.label, 16), p.label, t, got;
      EXCEPTION
        WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'REFUSED  % candidate % (%)', rpad(u.label, 16), p.label, SQLERRM;
        WHEN others THEN RESET ROLE; RAISE NOTICE 'ERROR    % candidate % (%)', rpad(u.label, 16), p.label, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- anon must not be able to call it at all.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  PERFORM * FROM public.hr_candidate_salary_suggestion_inputs('00000000-0000-0000-0000-0000000ca0a1');
  RESET ROLE;
  RAISE NOTICE 'HOLE     anon could call hr_candidate_salary_suggestion_inputs()';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE; RAISE NOTICE 'REFUSED  anon (%)', SQLERRM;
END $$;

SELECT format('GRANTS   anon=%s authenticated=%s public_via_proacl=%s',
  has_function_privilege('anon', 'public.hr_candidate_salary_suggestion_inputs(uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.hr_candidate_salary_suggestion_inputs(uuid)', 'EXECUTE'),
  (SELECT proacl::text ~ '[{,]=X/' FROM pg_proc WHERE proname = 'hr_candidate_salary_suggestion_inputs')) AS g;
