-- fn_hr_salary_rule_lock_present(), called AS a signed-in account (role
-- authenticated), in whatever state run.sh has left the two tables in.
-- Prints LOCK <true|false> for a super admin, then REFUSED for a signed-in
-- account that is neither a super admin nor on the Director list, and for a
-- signed-in account with no staff row and no profile role.
DO $$
DECLARE v boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa04","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  v := public.fn_hr_salary_rule_lock_present();
  RESET ROLE;
  RAISE NOTICE 'LOCK     %', v;
END $$;

DO $$
DECLARE v boolean; u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('a non-super-admin',             '00000000-0000-0000-0000-00000000aa01'),
    ('no staff row, no profile role', '00000000-0000-0000-0000-00000000aa07')) x(label, uid)
  LOOP
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', u.uid, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      v := public.fn_hr_salary_rule_lock_present();
      RESET ROLE;
      RAISE NOTICE 'HOLE     % got an answer (%)', u.label, v;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE; RAISE NOTICE 'REFUSED  lock check for % (%)', u.label, SQLERRM;
    END;
  END LOOP;
END $$;
