-- ============================================================================
-- revoke-anon-ten-secdef-rehearsal.sql                              (2026-09-28)
-- OFF PRODUCTION ONLY (a fresh local PostgreSQL 16). Proves, for
-- 20270413090000_revoke_anon_execute_ten_secdef_functions.sql:
--   1. before: anon can EXECUTE the ten; after: it cannot, and authenticated
--      and service_role still can (both fn_procurement_rm_post_receipt overloads);
--   2. a signed-out READ of sections, whose write rules call
--      fn_role_scope_all_grants (the only live caller, 2026-09-28), still works;
--      a signed-out WRITE is refused before and after (after: 42501);
--   3. the precondition refuses to run when a read path calls one of the ten.
-- RUN:
--   psql -h 127.0.0.1 -p <port> -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/revoke-anon-ten-secdef-rehearsal.sql
-- EXPECT the last line: REHEARSAL PASS. (Run from the repo root: it \i's the migration.)
-- ============================================================================
\set ON_ERROR_STOP 1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE FUNCTION public.fn_is_any_leave_approver() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'select false';
CREATE FUNCTION public.fn_is_configured_leave_approver() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'select false';
CREATE FUNCTION public.fn_my_designated_hr_org_ids() RETURNS uuid[] LANGUAGE sql SECURITY DEFINER AS 'select null::uuid[]';
CREATE FUNCTION public.fn_my_hr_context() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'select null::jsonb';
CREATE FUNCTION public.fn_procurement_rm_post_receipt(uuid,uuid,integer,numeric) RETURNS void LANGUAGE sql SECURITY DEFINER AS 'select';
CREATE FUNCTION public.fn_procurement_rm_post_receipt(uuid,uuid,integer,numeric,text[]) RETURNS void LANGUAGE sql SECURITY DEFINER AS 'select';
REVOKE EXECUTE ON FUNCTION public.fn_procurement_rm_post_receipt(uuid,uuid,integer,numeric) FROM PUBLIC;  -- live: only the 5-arg one had PUBLIC=X
CREATE FUNCTION public.fn_role_scope_all_grants(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'select false';
CREATE FUNCTION public.gate_can_record() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'select false';
CREATE FUNCTION public.gate_can_scan() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'select false';
CREATE FUNCTION public.get_admin_overview() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'select null::jsonb';
CREATE FUNCTION public.hr_resolve_leave_ladder(uuid,jsonb) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'select null::jsonb';
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- sections with the live rule shape: a public read rule, and write rules that call fn_role_scope_all_grants.
CREATE TABLE public.sections (id int PRIMARY KEY, name text);
INSERT INTO public.sections VALUES (1, 'A');
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO anon, authenticated;
CREATE POLICY sections_select_all   ON public.sections FOR SELECT USING (true);
CREATE POLICY sections_insert_admin ON public.sections FOR INSERT WITH CHECK (public.fn_role_scope_all_grants('sections'));
CREATE POLICY sections_update_admin ON public.sections FOR UPDATE USING (public.fn_role_scope_all_grants('sections'));
CREATE POLICY sections_delete_admin ON public.sections FOR DELETE USING (public.fn_role_scope_all_grants('sections'));

CREATE TEMP TABLE result (n serial, what text, ok boolean);
CREATE FUNCTION pg_temp.anon_try(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN EXECUTE p_sql; r := 'ok'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  RESET ROLE; RETURN r;
END $f$;
CREATE FUNCTION pg_temp.anon_count() RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND has_function_privilege('anon', oid, 'EXECUTE') $$;

BEGIN;
INSERT INTO result (what, ok) SELECT 'before: anon can execute 10 of the 11 signatures', pg_temp.anon_count() = 10;
INSERT INTO result (what, ok) SELECT 'before: signed-out read of sections works', pg_temp.anon_try('SELECT count(*) FROM public.sections') = 'ok';
INSERT INTO result (what, ok) SELECT 'before: signed-out write to sections is refused', pg_temp.anon_try('INSERT INTO public.sections VALUES (2, ''B'')') = '42501';
COMMIT;

\i supabase/migrations/20270413090000_revoke_anon_execute_ten_secdef_functions.sql

BEGIN;
INSERT INTO result (what, ok) SELECT 'after: anon can execute none', pg_temp.anon_count() = 0;
INSERT INTO result (what, ok) SELECT 'after: authenticated keeps all 11', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prokind = 'f' AND proname <> 'anon_try' AND has_function_privilege('authenticated', oid, 'EXECUTE')) = 11;
INSERT INTO result (what, ok) SELECT 'after: service_role keeps all 11', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND has_function_privilege('service_role', oid, 'EXECUTE')) = 11;
INSERT INTO result (what, ok) SELECT 'after: signed-out read of sections still works', pg_temp.anon_try('SELECT count(*) FROM public.sections') = 'ok';
INSERT INTO result (what, ok) SELECT 'after: signed-out write to sections is refused (42501)', pg_temp.anon_try('INSERT INTO public.sections VALUES (2, ''B'')') = '42501';
INSERT INTO result (what, ok) SELECT 'after: signed-out call of gate_can_scan() is refused', pg_temp.anon_try('SELECT public.gate_can_scan()') = '42501';
COMMIT;

-- 3. the precondition refuses when a read path calls one of the ten. A probe
--    SELECT rule that calls gate_can_scan() is added, the migration is run again
--    with ON_ERROR_STOP off, and psql's LAST_ERROR_MESSAGE must be the refusal.
CREATE POLICY sections_select_probe ON public.sections FOR SELECT USING (public.gate_can_scan());
\set ON_ERROR_STOP 0
\i supabase/migrations/20270413090000_revoke_anon_execute_ten_secdef_functions.sql
\set ON_ERROR_STOP 1
INSERT INTO result (what, ok) SELECT 'precondition refuses when a SELECT rule calls one of the ten',
  :'LAST_ERROR_MESSAGE' LIKE '%a signed-out read path calls one of the ten%row rule public.sections.sections_select_probe%';
DROP POLICY sections_select_probe ON public.sections;

SELECT CASE WHEN bool_and(ok) THEN 'REHEARSAL PASS (' || count(*) || ' checks)'
            ELSE 'REHEARSAL FAIL: ' || string_agg(what, ' | ') FILTER (WHERE NOT ok) END AS verdict
  FROM result;
