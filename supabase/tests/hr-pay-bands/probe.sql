-- Call hr_pay_band_policies() AS each signed-in person (role authenticated, JWT sub
-- set to their id; no college id supplied anywhere) and print which colleges come back.
-- Expected:
--   own-scope holder              -> College A
--   all-scope holder              -> College A, College B, College C
--   super admin                   -> College A, College B, College C
--   own-scope holder + grant to C -> College A, College C
--   no key                        -> REFUSED (insufficient_privilege)
DO $$
DECLARE u record; got text;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('own-scope holder',              '00000000-0000-0000-0000-00000000aa01'),
    ('all-scope holder',              '00000000-0000-0000-0000-00000000aa02'),
    ('super admin',                   '00000000-0000-0000-0000-00000000aa04'),
    ('own-scope holder + grant to C', '00000000-0000-0000-0000-00000000aa05'),
    ('no key',                        '00000000-0000-0000-0000-00000000aa03')) v(label, uid)
  LOOP
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', u.uid, true);
      SET LOCAL ROLE authenticated;
      SELECT COALESCE(string_agg(i.name, ', ' ORDER BY i.name), '(none)') INTO got
        FROM public.hr_pay_band_policies() b
        JOIN public.institutions i ON i.id = b.institution_id;
      RESET ROLE;
      RAISE NOTICE 'SEES     % -> %', rpad(u.label, 30), got;
    EXCEPTION
      WHEN insufficient_privilege THEN RESET ROLE; RAISE NOTICE 'REFUSED  % (%)', rpad(u.label, 30), SQLERRM;
      WHEN others THEN RESET ROLE; RAISE NOTICE 'ERROR    % (%)', rpad(u.label, 30), SQLERRM;
    END;
  END LOOP;
END $$;

-- Raw row count for the super admin, with no join: 3 college rows, never the
-- NULL-scope band or the other policy key.
BEGIN;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa04', true) \gset
SET LOCAL ROLE authenticated;
SELECT format('ROWS     super admin raw rows=%s null_scope=%s', count(*), count(*) FILTER (WHERE institution_id IS NULL)) AS r
  FROM public.hr_pay_band_policies();
ROLLBACK;

-- anon must not be able to call it at all.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  PERFORM * FROM public.hr_pay_band_policies();
  RESET ROLE;
  RAISE NOTICE 'HOLE     anon could call hr_pay_band_policies()';
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE; RAISE NOTICE 'REFUSED  anon (%)', SQLERRM;
END $$;

SELECT format('GRANTS   anon=%s authenticated=%s public_via_proacl=%s',
  has_function_privilege('anon', 'public.hr_pay_band_policies()', 'EXECUTE'),
  has_function_privilege('authenticated', 'public.hr_pay_band_policies()', 'EXECUTE'),
  (SELECT proacl::text ~ '[{,]=X/' FROM pg_proc WHERE proname = 'hr_pay_band_policies')) AS g;
