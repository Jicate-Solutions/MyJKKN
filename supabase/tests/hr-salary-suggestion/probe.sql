-- Call hr_salary_suggestion_inputs(person) AS each signed-in person (role
-- authenticated, JWT sub set to their id; no college id supplied anywhere) for
-- each person on the roster, and print what comes back.
-- Expected:
--   own-scope holder              -> A: rule college {"per_year_at_jkkn": 100}, pay 6000, band yes · B, C: not in your colleges
--   all-scope holder              -> A: college 100 · B: group 50 (never-published draft ignored) · C: group 50 (college row with no amount ignored)
--   super admin                   -> same as all-scope holder
--   own-scope holder + grant to C -> A: college 100 · B: not in your colleges · C: group 50
--   no key                        -> REFUSED (insufficient_privilege)
--   everyone who may call it      -> "Not in HR" person: not in your colleges (outside the HR roster)
DO $$
DECLARE u record; p record; r record; got text;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('own-scope holder',              '00000000-0000-0000-0000-00000000aa01'),
    ('all-scope holder',              '00000000-0000-0000-0000-00000000aa02'),
    ('super admin',                   '00000000-0000-0000-0000-00000000aa04'),
    ('own-scope holder + grant to C', '00000000-0000-0000-0000-00000000aa05'),
    ('no key',                        '00000000-0000-0000-0000-00000000aa03')) v(label, uid)
  LOOP
    FOR p IN SELECT * FROM (VALUES
      ('A', '00000000-0000-0000-0000-0000000005a1'::uuid),
      ('B', '00000000-0000-0000-0000-0000000005b2'::uuid),
      ('C', '00000000-0000-0000-0000-0000000005c3'::uuid),
      ('Not in HR', '00000000-0000-0000-0000-0000000005d4'::uuid)) w(label, sid)
    LOOP
      BEGIN
        PERFORM set_config('request.jwt.claim.sub', u.uid, true);
        SET LOCAL ROLE authenticated;
        SELECT count(*) AS n,
               max(format('rule=%s %s pay=%s band=%s',
                   coalesce(x.rule_source, 'none'), coalesce(x.rule::text, '-'),
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
