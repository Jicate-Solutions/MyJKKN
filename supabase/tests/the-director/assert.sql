-- Rehearsal for 20270520090000_the_director_list.sql.
-- Run by run.sh (as the cluster superuser) AFTER the migration has been applied
-- twice by the non-superuser owner supa_owner. Every check prints PASS or stops
-- the run with FAIL (ON_ERROR_STOP). Personas act exactly as a PostgREST
-- request would: request.jwt.claims set, then SET ROLE authenticated / anon /
-- service_role. "DB session" steps run as supa_owner with no claims (what a
-- migration or the SQL console is).
\set ON_ERROR_STOP 1
\set VERBOSITY terse

-- ---------------------------------------------------------------- helpers
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role, supa_owner;

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

-- The statement must be refused with 42501 (who may change the list).
CREATE FUNCTION t.must_refuse(p_sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL (not refused): %', label;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS (refused 42501): %', label;
END $$;

-- The statement must be refused with 23514 (the list can never be empty).
CREATE FUNCTION t.must_keep(p_sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL (not refused): %', label;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'PASS (refused 23514, never empty): %', label;
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

-- Owner-side read of the list row (bypasses RLS: created by the superuser).
CREATE FUNCTION t.list() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT value FROM public.platform_policies
   WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global';
$$;
CREATE FUNCTION t.row() RETURNS public.platform_policies LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM public.platform_policies
   WHERE policy_key = 'platform.the_director_profile_ids' AND scope_type = 'global';
$$;
CREATE FUNCTION t.audit_n() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'platform.the_director_profile_ids';
$$;

-- Evaluate p_sql as one signed-in person (claims + role authenticated) and
-- return the single value as text. Must be called while RESET to postgres.
CREATE FUNCTION t.q(p_sub text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM t.claims(p_sub, 'authenticated');
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO r;
  EXECUTE 'RESET ROLE';
  PERFORM t.claims(NULL, NULL);
  RETURN r;
END $$;

CREATE FUNCTION t.is_dir(p_sub text) RETURNS boolean LANGUAGE sql AS $$
  SELECT t.q(p_sub, 'SELECT public.fn_is_the_director()')::boolean;
$$;

-- Throw the list row away and re-seed it, as a migration would meet it.
CREATE FUNCTION t.drop_list() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  ALTER TABLE public.platform_policies DISABLE TRIGGER trg_guard_the_director_list;
  DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids';
  ALTER TABLE public.platform_policies ENABLE TRIGGER trg_guard_the_director_list;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role, supa_owner;

\set K '''platform.the_director_profile_ids'''
\set DIR   'd0000000-0000-4000-8000-000000000001'
\set DEV   'd0000000-0000-4000-8000-000000000002'
\set TSA   'd0000000-0000-4000-8000-000000000003'
\set PRIN  'd0000000-0000-4000-8000-000000000004'
\set HOD   'd0000000-0000-4000-8000-000000000005'
\set JMD   'd0000000-0000-4000-8000-000000000006'
\set NOPRO 'd0000000-0000-4000-8000-000000000007'
\set BLANK 'd0000000-0000-4000-8000-000000000008'
\set SPOOF 'd0000000-0000-4000-8000-000000000009'

\echo '== 1. Seed and grants'
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb,
  'seed = the ONE confirmed auth account for director@jkkn.ac.in (auth email had spaces and capitals)');
SELECT t.ok(NOT (t.list() ? 'd0000000-0000-4000-8000-000000000009'),
  'seed ignores a person who edited their own profiles.email to director@jkkn.ac.in');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1,
  'applied twice: exactly one list row');
SELECT t.ok((t.row()).updated_by IS NULL, 'seed row: updated_by is empty (made by the migration, no person)');
SELECT t.ok(t.audit_n() = 0, 'seed writes no audit row (no person to name)');
SELECT t.ok(NOT has_function_privilege('anon', 'public.fn_is_the_director()', 'EXECUTE'),
  'anon has no EXECUTE on fn_is_the_director');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                        WHERE p.proname IN ('fn_is_the_director', 'fn_guard_the_director_list',
                                            'fn_audit_the_director_list', 'fn_get_policy',
                                            'fn_get_policy_json', 'fn_get_policy_text',
                                            'fn_internship_evaluate_policy')
                          AND a.grantee = 0),
  'PUBLIC has no EXECUTE on the new functions or the patched readers');
SELECT t.ok(NOT has_function_privilege('anon', 'public.fn_guard_the_director_list()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_audit_the_director_list()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_get_policy(text, uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_get_policy_json(text, jsonb, uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_get_policy_text(text, text, uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.fn_internship_evaluate_policy(text, jsonb)', 'EXECUTE'),
  'anon has no EXECUTE on the two triggers or the four readers');
SELECT t.ok(has_function_privilege('authenticated', 'public.fn_is_the_director()', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.fn_get_policy(text, uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.fn_get_policy_json(text, jsonb, uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.fn_get_policy_text(text, text, uuid)', 'EXECUTE'),
  'authenticated keeps EXECUTE on fn_is_the_director and the readers');
SELECT t.ok((SELECT bool_and(prosecdef) FROM pg_proc
              WHERE proname IN ('fn_is_the_director', 'fn_guard_the_director_list', 'fn_audit_the_director_list')),
  'fn_is_the_director and both trigger functions are SECURITY DEFINER');
SELECT t.ok((SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'fn_guard_the_director_list') = 'supa_owner'
        AND NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'supa_owner'),
  'owner is a normal role: not superuser, no BYPASSRLS');

\echo '== 2. Who is the Director'
SELECT t.ok(t.is_dir(:'DIR'),        'the Director => true');
SELECT t.ok(NOT t.is_dir(:'DEV'),    'another active super admin (developer) => false');
SELECT t.ok(NOT t.is_dir(:'TSA'),    'the shared test super admin => false');
SELECT t.ok(NOT t.is_dir(:'PRIN'),   'a principal => false');
SELECT t.ok(NOT t.is_dir(:'HOD'),    'an HOD => false');
SELECT t.ok(NOT t.is_dir(:'SPOOF'),  'a person whose profile email says director@jkkn.ac.in => false');
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
DO $$ BEGIN
  PERFORM public.fn_get_policy('platform.the_director_profile_ids', NULL);
  RAISE EXCEPTION 'FAIL: anon executed fn_get_policy';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: anon cannot execute fn_get_policy';
END $$;
RESET ROLE;
SELECT t.claims(NULL, NULL);

\echo '== 4. Reading the raw row through the table'
INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type)
VALUES ('hr.attendance.geofence_radius_m', 'global', '200', 'number');

SELECT t.ok(t.q(:'DIR',   $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '1', 'Director reads the list row');
SELECT t.ok(t.q(:'DEV',   $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '1', 'a non-listed super admin can READ the row');
SELECT t.ok(t.q(:'PRIN',  $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'principal cannot read the list row (had a permissive "Admins can view" policy)');
SELECT t.ok(t.q(:'PRIN',  $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m'$q$) = '1', 'principal still reads an ordinary key');
SELECT t.ok(t.q(:'HOD',   $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'HOD cannot read the list row');
SELECT t.ok(t.q(:'HOD',   $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m'$q$) = '1', 'HOD still reads an ordinary key');
SELECT t.ok(t.q(:'SPOOF', $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'profile-email spoofer cannot read the list row');
SELECT t.ok(t.q(:'NOPRO', $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'no-profile user cannot read the list row');
SELECT t.ok(t.q(:'BLANK', $q$SELECT count(*) FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'no-role user cannot read the list row');
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.ok((SELECT count(*) FROM public.platform_policies) = 0, 'anon reads the table without an error, and sees nothing');
RESET ROLE;
CREATE POLICY t_probe_anon_open ON public.platform_policies FOR SELECT TO anon USING (true);
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 0, 'anon + a wide-open permissive policy: the list is still hidden');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = 1, 'anon + a wide-open permissive policy: ordinary keys visible (probe works)');
RESET ROLE;
DROP POLICY t_probe_anon_open ON public.platform_policies;
SELECT t.claims(NULL, NULL);

\echo '== 5. The generic readers (fn_get_policy family, internship reader) hide the list'
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean,
  'HOD: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_get_policy_json('platform.the_director_profile_ids', '"fallback"'::jsonb, NULL) = '"fallback"'::jsonb$q$)::boolean,
  'HOD: fn_get_policy_json(list) => the caller''s default');
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_get_policy_text('platform.the_director_profile_ids', 'fallback', NULL) = 'fallback'$q$)::boolean,
  'HOD: fn_get_policy_text(list) => the caller''s default');
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_get_policy_int('platform.the_director_profile_ids', 7, NULL) = 7$q$)::boolean,
  'HOD: fn_get_policy_int(list) => the caller''s default');
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_get_policy_bool('platform.the_director_profile_ids', true, NULL)$q$)::boolean,
  'HOD: fn_get_policy_bool(list) => the caller''s default');
SELECT t.ok(t.q(:'HOD', $q$SELECT public.fn_internship_evaluate_policy('platform.the_director_profile_ids', '{}'::jsonb) ->> 'source' = 'not_found'$q$)::boolean,
  'HOD: fn_internship_evaluate_policy(list) => not_found');
SELECT t.ok(t.q(:'PRIN',  $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean, 'principal: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(:'SPOOF', $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean, 'profile-email spoofer: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(:'NOPRO', $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean, 'no-profile user: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(:'BLANK', $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean, 'no-role user: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(NULL,     $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NULL$q$)::boolean, 'NULL uid: fn_get_policy(list) => nothing');
SELECT t.ok(t.q(:'DIR',   $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) = '["d0000000-0000-4000-8000-000000000001"]'::jsonb$q$)::boolean, 'Director: fn_get_policy(list) => the list');
SELECT t.ok(t.q(:'DEV',   $q$SELECT public.fn_get_policy('platform.the_director_profile_ids', NULL) IS NOT NULL$q$)::boolean, 'super admin: fn_get_policy(list) => the list');
SELECT t.ok(t.q(:'DIR',   $q$SELECT public.fn_internship_evaluate_policy('platform.the_director_profile_ids', '{}'::jsonb) ->> 'source' = 'global_policy'$q$)::boolean, 'Director: internship reader => the list');
SELECT t.ok(t.q(:'HOD',   $q$SELECT public.fn_get_policy('hr.attendance.geofence_radius_m', NULL) = '200'::jsonb$q$)::boolean, 'HOD: fn_get_policy still returns an ordinary key');
SELECT t.ok(t.q(:'HOD',   $q$SELECT public.fn_internship_evaluate_policy('hr.attendance.geofence_radius_m', '{}'::jsonb) ->> 'source' = 'global_policy'$q$)::boolean, 'HOD: internship reader still returns an ordinary key');
SELECT t.ok((SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.fn_get_policy(text, uuid)'::regprocedure),
                 'p_key IS DISTINCT FROM ''platform\.the_director_profile_ids''', 'g'))
          = (SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.fn_get_policy(text, uuid)'::regprocedure),
                 'policy_key\s*=\s*p_key\M', 'g')),
  'fn_get_policy: exactly one guard per "policy_key = p_key" after two applies (no double patch)');
SELECT t.ok((SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.fn_internship_evaluate_policy(text, jsonb)'::regprocedure),
                 'p_key IS DISTINCT FROM ''platform\.the_director_profile_ids''', 'g')) = 3,
  'fn_internship_evaluate_policy: its three lookups each guarded once');

SELECT t.ok((SELECT count(*) = 2 AND bool_and(
                 replace(pg_get_functiondef(d.sig::regprocedure),
                         ' AND (p_key IS DISTINCT FROM ''platform.the_director_profile_ids'' OR (SELECT public.is_super_admin()) OR (SELECT public.fn_is_the_director()))',
                         '') = d.def)
               FROM public.t_pre_defs d),
  'both readers: the body is exactly what the database held before, plus the guard (nothing else changed)');

\echo '== 6. A super admin NOT on the list cannot change it'
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
UPDATE public.platform_policies SET value = '250' WHERE policy_key = 'hr.attendance.geofence_radius_m';
RESET ROLE;
SELECT t.ok((SELECT value FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m') = '250'::jsonb,
  'a super admin can still edit an ordinary key');
SELECT t.claims(:'TSA', 'authenticated'); SET ROLE authenticated;
SELECT t.must_refuse($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000003"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'shared test super admin UPDATE the list');
RESET ROLE;
SELECT t.claims(:'SPOOF', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000009"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'profile-email spoofer UPDATE the list');
RESET ROLE;
SELECT t.claims(:'PRIN', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000004"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'principal UPDATE the list');
RESET ROLE;
SELECT t.claims(:'NOPRO', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000007"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'no-profile user UPDATE the list');
RESET ROLE;
SELECT t.claims(:'BLANK', 'authenticated'); SET ROLE authenticated;
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000008"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'no-role user UPDATE the list');
RESET ROLE;
SELECT t.claims(NULL, 'anon'); SET ROLE anon;
SELECT t.must_refuse($q$INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, data_type) VALUES ('platform.the_director_profile_ids', 'user', 'd0000000-0000-4000-8000-000000000007', '[]', 'array')$q$,
  'anon INSERT a row with the key');
SELECT t.must_not_change($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'anon UPDATE the list');
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb, 'after all refused attempts the list is unchanged');

\echo '== 7. The Director adds a second person; ids are checked; the change is recorded'
SELECT t.claims(:'DIR', 'authenticated'); SET ROLE authenticated;
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '["not-a-profile-id"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'a value that is not a profile id');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '{"d0000000-0000-4000-8000-000000000006": true}' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'a value that is not an array');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000007"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'an id that has no profile (a signed-in account with no profile row)');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-00000000abcd"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'an id nobody has');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET scope_type = 'user', scope_id = 'd0000000-0000-4000-8000-000000000001' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'moving the list to one person''s scope');
UPDATE public.platform_policies
   SET value = '["D0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006","d0000000-0000-4000-8000-000000000006"]'
 WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb,
  'stored cleaned: lower-case, de-duplicated, sorted');
SELECT t.ok((t.row()).updated_by = :'DIR'::uuid, 'updated_by = the Director');
SELECT t.ok(t.audit_n() = 1, 'one audit row written');
SELECT t.ok((SELECT edited_by = :'DIR'::uuid AND action = 'publish'
                AND old_value = '["d0000000-0000-4000-8000-000000000001"]'::jsonb
                AND new_value = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb
                AND policy_id = (t.row()).id
                AND reason = 'Changed who counts as the Director: 1 name(s) before, 2 after.'
               FROM public.hr_policy_audit_log WHERE policy_key = :K),
  'audit row: who (the Director), what (old and new list), publish');
SELECT t.ok(t.is_dir(:'JMD'),       'the added person (Joint MD) => true');
SELECT t.ok(t.is_dir(:'DIR'),       'the Director still => true');
SELECT t.ok(NOT t.is_dir(:'DEV'),   'developer super admin still => false');

\echo '== 8. The audit rows of the list are hidden like the list'
INSERT INTO public.hr_policy_audit_log (policy_id, policy_key, scope_type, action, reason, edited_by)
SELECT id, policy_key, 'global', 'publish', 'ordinary change', 'd0000000-0000-4000-8000-000000000002'
  FROM public.platform_policies WHERE policy_key = 'hr.attendance.geofence_radius_m';
SELECT t.ok(t.q(:'HOD',  $q$SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'HOD cannot read the list''s audit rows');
SELECT t.ok(t.q(:'PRIN', $q$SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '0', 'principal cannot read the list''s audit rows');
SELECT t.ok(t.q(:'HOD',  $q$SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'hr.attendance.geofence_radius_m'$q$) = '1', 'HOD still reads an ordinary global audit row');
SELECT t.ok(t.q(:'DIR',  $q$SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '1', 'the Director reads the list''s audit row');
SELECT t.ok(t.q(:'DEV',  $q$SELECT count(*) FROM public.hr_policy_audit_log WHERE policy_key = 'platform.the_director_profile_ids'$q$) = '1', 'a super admin reads the list''s audit row');

\echo '== 9. Re-applying the migration keeps the edited list'
SELECT t.claims(NULL, NULL);
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb,
  'third apply: the edited two-person list is kept');
SELECT t.ok((SELECT count(*) FROM public.platform_policies WHERE policy_key = :K) = 1, 'third apply: still one row');
SELECT t.ok((SELECT count(*) FROM regexp_matches(pg_get_functiondef('public.fn_internship_evaluate_policy(text, jsonb)'::regprocedure),
                 'p_key IS DISTINCT FROM ''platform\.the_director_profile_ids''', 'g')) = 3,
  'third apply: readers not patched twice');

\echo '== 10. NEVER EMPTY (Director ruling 30 Sep): every caller, every way'
SELECT t.claims(:'DIR', 'authenticated'); SET ROLE authenticated;
SELECT t.must_keep($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'Director empties the list');
SELECT t.must_keep($q$UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'Director switches the list off');
SELECT t.must_keep($q$DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'Director deletes the list');
SELECT t.must_keep($q$UPDATE public.platform_policies SET policy_key = 'platform.old_director_list' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'Director renames the list away');
RESET ROLE;
SELECT t.claims(NULL, 'service_role'); SET ROLE service_role;
SELECT t.must_keep($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'service_role empties the list');
SELECT t.must_keep($q$UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'service_role switches the list off');
SELECT t.must_keep($q$DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'service_role deletes the list');
RESET ROLE;
SELECT t.claims(NULL, NULL); SET ROLE supa_owner;
SELECT t.must_keep($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'SQL console / migration empties the list');
SELECT t.must_keep($q$DELETE FROM public.platform_policies WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'SQL console / migration deletes the list');
SELECT t.must_fail_22023($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000007"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'SQL console puts an id with no profile on the list');
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001","d0000000-0000-4000-8000-000000000006"]'::jsonb, 'after all refused attempts the list is unchanged');
-- one listed person can take another off, never the last one
SELECT t.claims(:'JMD', 'authenticated'); SET ROLE authenticated;
UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000006"]' WHERE policy_key = 'platform.the_director_profile_ids';
SELECT t.must_keep($q$UPDATE public.platform_policies SET value = '[]' WHERE policy_key = 'platform.the_director_profile_ids'$q$, 'the last person on the list removes themself');
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000006"]'::jsonb, 'a listed person (Joint MD) took the Director off: allowed, one name left');
SELECT t.ok(NOT t.is_dir(:'DIR'), 'after that the Director => false');
SELECT t.ok(t.audit_n() = 2 AND (SELECT edited_by FROM public.hr_policy_audit_log WHERE policy_key = :K ORDER BY edited_at DESC, id LIMIT 1) IS NOT NULL,
  'that change has its own audit row');
SELECT t.claims(NULL, 'service_role'); SET ROLE service_role;
UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001"]' WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.is_dir(:'DIR') AND NOT t.is_dir(:'JMD'), 'service_role put the Director back (a non-empty list)');
SELECT t.ok((t.row()).updated_by IS NULL AND t.audit_n() = 2, 'service_role change: updated_by empty, no audit row (no person to name)');

\echo '== 11. Missing row => false; re-apply re-seeds'
SELECT t.drop_list();
SELECT t.ok(NOT t.is_dir(:'DIR'), 'no list row: the Director => false');
SELECT t.claims(NULL, NULL); SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb, 're-apply after deletion re-seeds the Director');

\echo '== 12. Inactive row => false'
ALTER TABLE public.platform_policies DISABLE TRIGGER trg_guard_the_director_list;
UPDATE public.platform_policies SET is_active = false WHERE policy_key = 'platform.the_director_profile_ids';
SELECT t.ok(NOT t.is_dir(:'DIR'), 'inactive list row: the Director => false');
UPDATE public.platform_policies SET is_active = true WHERE policy_key = 'platform.the_director_profile_ids';
ALTER TABLE public.platform_policies ENABLE TRIGGER trg_guard_the_director_list;

\echo '== 13. Only the seed may create an empty list'
SELECT t.drop_list();
SELECT t.claims(NULL, NULL); SET ROLE supa_owner;
SELECT t.must_keep($q$INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type) VALUES ('platform.the_director_profile_ids', 'global', '[]', 'array')$q$,
  'SQL console inserts an empty list (no seed flag)');
RESET ROLE;
SELECT t.claims(NULL, 'service_role'); SET ROLE service_role;
SELECT t.must_keep($q$INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type) VALUES ('platform.the_director_profile_ids', 'global', '[]', 'array')$q$,
  'service_role inserts an empty list');
SELECT set_config('app.the_director_list_seed', 'on', false);
SELECT t.must_keep($q$INSERT INTO public.platform_policies (policy_key, scope_type, value, data_type) VALUES ('platform.the_director_profile_ids', 'global', '[]', 'array')$q$,
  'service_role inserts an empty list even with the seed flag set');
SELECT set_config('app.the_director_list_seed', '', false);
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.list() IS NULL, 'no empty list was created');

\echo '== 14. The seed trusts only ONE confirmed auth account'
-- a. the address is not confirmed
UPDATE auth.users SET email_confirmed_at = NULL WHERE id = 'd0000000-0000-4000-8000-000000000001';
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'unconfirmed Director address: seeded an EMPTY list');
SELECT t.ok(NOT t.is_dir(:'DIR'), 'empty seed: the Director => false');
SELECT t.claims(:'DIR', 'authenticated'); SET ROLE authenticated;
SELECT t.must_refuse($q$UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001"]' WHERE policy_key = 'platform.the_director_profile_ids'$q$,
  'empty seed: the Director cannot add himself from the app');
RESET ROLE;
SELECT t.claims(NULL, 'service_role'); SET ROLE service_role;
UPDATE public.platform_policies SET value = '["d0000000-0000-4000-8000-000000000001"]' WHERE policy_key = 'platform.the_director_profile_ids';
RESET ROLE;
SELECT t.claims(NULL, NULL);
SELECT t.ok(t.is_dir(:'DIR'), 'empty seed: service_role adds the Director => true');
UPDATE auth.users SET email_confirmed_at = now() WHERE id = 'd0000000-0000-4000-8000-000000000001';

-- b. two confirmed accounts carry the address
SELECT t.drop_list();
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('d0000000-0000-4000-8000-00000000000a', 'director@jkkn.ac.in', now());
INSERT INTO public.profiles (id, email, role) VALUES ('d0000000-0000-4000-8000-00000000000a', 'director@jkkn.ac.in', 'hod');
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'two confirmed accounts with the address: seeded an EMPTY list, nobody guessed');
DELETE FROM auth.users WHERE id = 'd0000000-0000-4000-8000-00000000000a';
DELETE FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-00000000000a';

-- c. the account is deleted
SELECT t.drop_list();
UPDATE auth.users SET deleted_at = now() WHERE id = 'd0000000-0000-4000-8000-000000000001';
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'deleted Director account: seeded an EMPTY list');
UPDATE auth.users SET deleted_at = NULL WHERE id = 'd0000000-0000-4000-8000-000000000001';

-- d. only a profile email says director@ (the spoof), no auth account does
SELECT t.drop_list();
UPDATE auth.users SET email = 'someone.else@jkkn.ac.in' WHERE id = 'd0000000-0000-4000-8000-000000000001';
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'only an edited profiles.email says director@: seeded an EMPTY list (profiles.email is not trusted)');

-- e. the auth account exists but has no profile
SELECT t.drop_list();
UPDATE auth.users SET email = 'director@jkkn.ac.in' WHERE id = 'd0000000-0000-4000-8000-000000000007';
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '[]'::jsonb, 'Director auth account with no profile: seeded an EMPTY list');
UPDATE auth.users SET email = 'noprofile@jkkn.ac.in' WHERE id = 'd0000000-0000-4000-8000-000000000007';

-- f. back to the real case
SELECT t.drop_list();
UPDATE auth.users SET email = ' Director@JKKN.ac.in ' WHERE id = 'd0000000-0000-4000-8000-000000000001';
SET ROLE supa_owner;
\ir ../../migrations/20270520090000_the_director_list.sql
RESET ROLE;
SELECT t.ok(t.list() = '["d0000000-0000-4000-8000-000000000001"]'::jsonb, 'one confirmed account again: seeded the Director');

\echo 'ALL CHECKS PASSED'
