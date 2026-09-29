-- fn_hr_salary_rule_lock_present(), called AS a signed-in account (role
-- authenticated), in whatever state run.sh has left the two tables in.
-- Prints LOCK <true|false> for a super admin, then REFUSED for a non-super-admin.
DO $$
DECLARE v boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa04', true);
  SET LOCAL ROLE authenticated;
  v := public.fn_hr_salary_rule_lock_present();
  RESET ROLE;
  RAISE NOTICE 'LOCK     %', v;
END $$;

-- A signed-in account that is not a super admin (the own-scope salary key
-- holder) must be refused.
DO $$
DECLARE v boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000aa01', true);
  SET LOCAL ROLE authenticated;
  v := public.fn_hr_salary_rule_lock_present();
  RESET ROLE;
  RAISE NOTICE 'HOLE     a non-super-admin got an answer (%)', v;
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE; RAISE NOTICE 'REFUSED  lock check for a non-super-admin (%)', SQLERRM;
END $$;
