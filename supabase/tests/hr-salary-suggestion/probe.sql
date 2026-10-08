-- Call hr_salary_suggestion_inputs(person) AS each signed-in person (role
-- authenticated, request.jwt.claims = {sub, role}; no college or department id
-- supplied anywhere) for each person on the roster, and print what comes back.
-- Expected:
--   own-scope holder              -> A: Dept A rate=100 round=500 pay=6000 band=yes · No dept: rate=none
--                                    · B, C: not in your colleges
--   all-scope holder              -> A: rate=100 · B: rate=none (the pending draft's 999 and the old
--                                    college row's 888 are both ignored) · C: rate=50 · No dept: rate=none
--   super admin / the Director    -> same as all-scope holder
--   own-scope holder + grant to C -> A: 100 · B: not in your colleges · C: 50
--   no key, no role               -> REFUSED (insufficient_privilege)
--   everyone who may call it      -> "Not in HR" person: not in your colleges (outside the HR roster)
-- A row never carries another department's amount: there is no column for it.
DO $$
DECLARE u record; p record; r record; got text;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('own-scope holder',              '00000000-0000-0000-0000-00000000aa01'),
    ('all-scope holder',              '00000000-0000-0000-0000-00000000aa02'),
    ('super admin',                   '00000000-0000-0000-0000-00000000aa04'),
    ('the Director',                  '00000000-0000-0000-0000-00000000aa06'),
    ('own-scope holder + grant to C', '00000000-0000-0000-0000-00000000aa05'),
    ('no key',                        '00000000-0000-0000-0000-00000000aa03'),
    ('no staff row, no profile role', '00000000-0000-0000-0000-00000000aa07')) v(label, uid)
  LOOP
    FOR p IN SELECT * FROM (VALUES
      ('A', '00000000-0000-0000-0000-0000000005a1'::uuid),
      ('B', '00000000-0000-0000-0000-0000000005b2'::uuid),
      ('C', '00000000-0000-0000-0000-0000000005c3'::uuid),
      ('No dept', '00000000-0000-0000-0000-0000000005e5'::uuid),
      ('Not in HR', '00000000-0000-0000-0000-0000000005d4'::uuid)) w(label, sid)
    LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        SELECT count(*) AS n,
               max(format('dept=%s rate=%s round=%s pay=%s band=%s',
                   coalesce(x.department_name, 'none'),
                   coalesce(x.rule_rate::text, 'none'), coalesce(x.rule_round_to::text, 'none'),
                   coalesce(x.monthly_gross::text, '-'),
                   CASE WHEN x.band IS NULL THEN 'no' ELSE 'yes' END)) AS what
          INTO r
          FROM public.hr_salary_suggestion_inputs(p.sid) x;
        RESET ROLE;
        got := CASE WHEN r.n = 0 THEN 'not in your colleges' WHEN r.n > 1 THEN format('HOLE %s rows', r.n) ELSE r.what END;
        RAISE NOTICE 'SEES     % person % -> %', rpad(u.label, 30), rpad(p.label, 9), got;
      EXCEPTION
        WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'REFUSED  % person % (%)', rpad(u.label, 30), rpad(p.label, 9), SQLERRM;
        WHEN others THEN RESET ROLE; RAISE NOTICE 'ERROR    % person % (%)', rpad(u.label, 30), rpad(p.label, 9), SQLERRM;
      END;
    END LOOP;
  END LOOP;
END $$;

-- anon must not be able to call it at all.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  PERFORM * FROM public.hr_salary_suggestion_inputs('00000000-0000-0000-0000-0000000005a1');
  RESET ROLE;
  RAISE NOTICE 'HOLE     anon could call hr_salary_suggestion_inputs()';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE; RAISE NOTICE 'REFUSED  anon (%)', SQLERRM;
END $$;

SELECT format('GRANTS   anon=%s authenticated=%s public_via_proacl=%s',
  has_function_privilege('anon', 'public.hr_salary_suggestion_inputs(uuid)', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.hr_salary_suggestion_inputs(uuid)', 'EXECUTE'),
  (SELECT proacl::text ~ '[{,]=X/' FROM pg_proc WHERE proname = 'hr_salary_suggestion_inputs')) AS g;
