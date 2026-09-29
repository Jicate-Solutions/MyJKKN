-- Rehearsal for 20270520090000_the_director_list.sql.
-- Run by run.sh AFTER the migration has been applied twice. Every check prints
-- PASS or stops the run with FAIL (ON_ERROR_STOP).
\set ON_ERROR_STOP 1
\set VERBOSITY terse

-- ---------------------------------------------------------------- helpers
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;

CREATE FUNCTION t.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;

-- Pretend to be a request from PostgREST: claims set, then SET ROLE.
CREATE FUNCTION t.claims(p_sub text, p_role text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    CASE WHEN p_role IS NULL THEN ''
         ELSE jsonb_strip_nulls(jsonb_build_object('sub', p_sub, 'role', p_role))::text END,
    false);
$$;

-- The statement must be refused with 42501 (the trigger's error).
CREATE FUNCTION t.must_refuse(p_sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL (not refused): %', label;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS (refused 42501): %', label;
END $$;

-- The statement must change nothing: refused, or the row is invisible.
CREATE FUNCTION t.must_not_change(p_sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL (% rows changed): %', n, label; END IF;
  RAISE NOTICE 'PASS (0 rows, row not visible): %', label;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS (refused 42501): %', label;
END $$;

CREATE FUNCTION t.must_fail_22023(p_sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL (accepted): %', label;
EXCEPTION WHEN invalid_parameter_value THEN
  RAISE NOTICE 'PASS (rejected 22023): %', label;
END $$;

-- Owner-side read of the list (bypasses RLS).
CREATE FUNCTION t.list() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT value FROM public.platform_policies
   WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global';
$$;

-- Whether a given person gets true, evaluated exactly as a PostgREST call:
-- claims + role authenticated. Must be called while RESET to postgres.
CREATE FUNCTION t.is_dir(p_sub text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r boolean;
BEGIN
  PERFORM t.claims(p_sub, 'authenticated');
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.fn_is_the_director();
  EXECUTE 'RESET ROLE';
  PERFORM t.claims(NULL, NULL);
  RETURN r;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

\set K '''platform.the_director_profile_ids'''
\set DIR   'd0000000-0000-4000-8000-000000000001'
\set DEV   'd0000000-0000-4000-8000-000000000002'
\set TSA   'd0000000-0000-4000-8000-000000000003'
\set PRIN  'd0000000-0000-4000-8000-000000000004'
\set HOD   'd0000000-0000-4000-8000-000000000005'
\set JMD   'd0000000-0000-4000-8000-000000000006'
\set NOPRO 'd0000000-0000-4000-8000-000000000007'
\set BLANK 'd0000000-0000-4000-8000-000000000008'

\echo '== 1. Seed and grants'
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb,
  'seed = the profile with email director@jkkn.ac.in (looked up, case-insensitive)');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1,
  'applied twice: exactly one list row');
SELECT t.ok(NOT has_function_privilege('anon', 'public.fn_is_the_director()', 'EXECUTE'),
  'anon has no EXECUTE on fn_is_the_director');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                        WHERE p.proname = 'fn_is_the_director' AND a.grantee = 0),
  'PUBLIC has no EXECUTE on fn_is_the_director');
SELECT t.ok(has_function_privilege('authenticated', 'public.fn_is_the_director()', 'EXECUTE'),
  'authenticated can EXECUTE fn_is_the_director');
SELECT t.ok((SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE proname = 'fn_is_the_director'),
  'fn_is_the_director is SECURITY DEFINER and STABLE');

\echo '== 2. Who is the Director'
SELECT t.ok(t.is_dir(:'DIR'),        'the Director => true');
SELECT t.ok(NOT t.is_dir(:'DEV'),    'another active super admin (developer) => false');
SELECT t.ok(NOT t.is_dir(:'TSA'),    'the shared test super admin => false');
SELECT t.ok(NOT t.is_dir(:'PRIN'),   'a principal => false');
SELECT t.ok(NOT t.is_dir(:'HOD'),    'an HOD => false');
SELECT t.ok(NOT t.is_dir(:'NOPRO'),  'signed-in user with NO profile row => false');
SELECT t.ok(NOT t.is_dir(:'BLANK'),  'signed-in user with a profile but NO role => false');
SELECT t.ok(NOT t.is_dir(NULL),      'role authenticated but NULL uid => false');

\echo '== 3. anon cannot execute'
SELECT t.claims(NULL, 'anon');
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.fn_is_the_director();
  RAISE EXCEPTION 'FAIL: anon executed fn_is_the_director';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot execute fn_is_the_director';
END $$;
RESET ROLE;

\echo '== 4. Reading the raw row through the table'
-- as each person: count rows of the list key, and of an ordinary key
INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type)
VALUES ('hr.attendance.geofence_radius_m', 'global', '200', 'number');

SELECT t.claims(:'DIR', 'authenticated'); SET ROLE authenticated;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1, 'Director reads the list row');
RESET ROLE;
SELECT t.claims(:'DEV', 'authenticated'); SET ROLE authenticated;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1, 'a non-listed super admin can READ the row');
RESET ROLE;
SELECT t.claims(:'PRIN', 'authenticated'); SET ROLE authenticated;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 0, 'principal cannot read the list row (had a permissive "Admins can view" policy)');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = 1, 'principal still reads an ordinary key');
RESET ROLE;
SELECT t.claims(:'HOD', 'authenticated'); SET ROLE authenticated;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 0, 'HOD cannot read the list row');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = 1, 'HOD still reads an ordinary key');
RESET ROLE;
SELECT t.claims(:'NOPRO', 'authenticated'); SET ROLE authenticated;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 0, 'no-profile user cannot read the list row');
RESET ROLE;
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.ok((SELECT count(*) FROM public.platform_policies) = 0, 'anon reads the table without an error, and sees nothing');
RESET ROLE;
-- the anon-only policy must hide the key on its own, even if some future
-- permissive policy opened the table to anon
CREATE POLICY t_probe_anon_open ON public.platform_policies FOR SELECT TO anon USING (true);
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 0, 'anon + a wide-open permissive policy: the list is still hidden');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = 1, 'anon + a wide-open permissive policy: ordinary keys visible (probe works)');
RESET ROLE;
DROP POLICY t_probe_anon_open ON public.platform_policies;

\echo '== 5. A super admin NOT on the list cannot change it'
SELECT t.claims(:'DEV', 'authenticated'); SET ROLE authenticated;
SELECT t.must_refuse($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000002"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'developer super admin UPDATE the list');
SELECT t.must_refuse($q$UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'developer super admin switch the list off');
SELECT t.must_refuse($q$DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'developer super admin DELETE the list');
SELECT t.must_refuse($q$INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type) VALUES ('platform.the_director_profile_ids', 'user', 'd0000000-0000-4000-8000-000000000002', '["d0000000-0000-4000-8000-000000000002"]', 'array')$q$,
  'developer super admin INSERT a second row with the key');
SELECT t.must_refuse($q$UPDATE public.platform_policies SET policy_key = 'platform.the_director_profile_ids', value = '["d0000000-0000-4000-8000-000000000002"]' WHERE policy_key = 'hr.attendance.geofence_radius_m'$q$,
  'developer super admin RENAME another row into the key');
-- ordinary keys are untouched by the guard
UPDATE public.platform_policies SET value = '250' WHERE policy_key = 'hr.attendance.geofence_radius_m';
RESET ROLE;
SELECT t.ok((SELECT value FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = '250'::jsonb,
  'a super admin can still edit an ordinary key');

SELECT t.claims(:'TSA', 'authenticated'); SET ROLE authenticated;
SELECT t.must_refuse($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000003"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'shared test super admin UPDATE the list');
RESET ROLE;
SELECT t.claims(:'PRIN', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000004"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'principal UPDATE the list');
RESET ROLE;
SELECT t.claims(:'NOPRO', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000007"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'no-profile user UPDATE the list');
RESET ROLE;
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.must_refuse($q$INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type) VALUES ('platform.the_director_profile_ids', 'user', 'd0000000-0000-4000-8000-000000000007', '[]', 'array')$q$,
  'anon INSERT a row with the key');
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'anon UPDATE the list');
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb, 'after all refused attempts the list is unchanged');

\echo '== 6. The Director adds a second person'
SELECT t.claims(:'DIR', 'authenticated'); SET ROLE authenticated;
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '["not-a-profile-id"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'a value that is not a profile id');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '{"d0000000-0000-4000-8000-000000000006": true}' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'a value that is not an array');
UPDATE public.platform_policies
   SET value = '["D0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006","d0000000-0000-4000-8000-000000000006"]'
 WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb,
  'stored cleaned: lower-case, de-duplicated, sorted');
SELECT t.ok(t.is_dir(:'JMD'),       'the added person (Joint MD) => true');
SELECT t.ok(t.is_dir(:'DIR'),       'the Director still => true');
SELECT t.ok(NOT t.is_dir(:'DEV'),   'developer super admin still => false');

\echo '== 7. Re-applying the migration keeps the edited list'
SELECT t.claims(NULL, NULL);
\ir ../../migrations/20270520090000_the_director_list.sql
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb,
  'third apply: the edited two-person list is kept');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1, 'third apply: still one row');

\echo '== 8. Empty list => false for everyone; only service_role can recover'
SELECT t.claims(:'JMD', 'authenticated'); SET ROLE authenticated;
UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'a listed person (Joint MD) emptied the list');
SELECT t.ok(NOT t.is_dir(:'DIR'),  'empty list: the Director => false');
SELECT t.ok(NOT t.is_dir(:'JMD'),  'empty list: Joint MD => false');
SELECT t.ok(NOT t.is_dir(:'DEV'),  'empty list: developer super admin => false');
SELECT t.claims(:'DEV', 'authenticated'); SET ROLE authenticated;
SELECT t.must_refuse($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000002"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'empty list: a super admin cannot claim it');
RESET ROLE;
SELECT t.claims(NULL, 'service_role'); SET ROLE service_role;
UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001"]' WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.ok(t.is_dir(:'DIR'), 'service_role restored the Director => true');

\echo '== 9. Missing row => false; re-apply re-seeds'
SELECT t.claims(NULL, NULL);
DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids';
SELECT t.ok(NOT t.is_dir(:'DIR'), 'no list row: the Director => false');
\ir ../../migrations/20270520090000_the_director_list.sql
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb, 're-apply after deletion re-seeds the Director');

\echo '== 10. Inactive row => false'
UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'platform.the_director_profile_ids';
SELECT t.ok(NOT t.is_dir(:'DIR'), 'inactive list row: the Director => false');
UPDATE public.platform_policies SET is_active = true WHERE policy_key = 'platform.the_director_profile_ids';

\echo '== 11. No director@jkkn.ac.in profile => empty seed + NOTICE'
DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids';
UPDATE public.profiles SET email = 'someone.else@jkkn.ac.in' WHERE id = 'd0000000-0000-4000-8000-000000000001';
\ir ../../migrations/20270520090000_the_director_list.sql
SELECT t.ok(t.list() = '[]'::jsonb, 'no such profile: seeded an EMPTY list');
SELECT t.ok(NOT t.is_dir(:'DIR'), 'empty seed: the Director => false');
UPDATE public.profiles SET email = 'director@jkkn.ac.in' WHERE id = 'd0000000-0000-4000-8000-000000000001';

\echo 'ALL CHECKS PASSED'
