-- ============================================================================
-- revoke-anon-ten-secdef-rehearsal.sql                              (2026-09-28)
-- OFF PRODUCTION ONLY (a fresh local PostgreSQL 16). Proves, for
-- 20270413090000_revoke_anon_execute_ten_secdef_functions.sql:
--   1. before: anon can EXECUTE the ten; after: it cannot, and authenticated
--      and service_role still can (both fn_procurement_rm_post_receipt overloads);
--   2. a signed-out READ of sections, whose write rules call
--      fn_role_scope_all_grants (the only live caller, 2026-09-28), still works;
--      a signed-out WRITE is refused before and after (after: 42501);
--   3. the precondition names every signed-out read path that calls one of the
--      ten (and ignores an authenticated-only rule); the file RAISEs on any.
-- RUN:
--   psql -h 127.0.0.1 -p <port> -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/revoke-anon-ten-secdef-rehearsal.sql
-- EXPECT: NOTICE REHEARSAL PASS (16 checks) and exit 0; any failed or NULL check RAISEs. (Run from the repo root: it \i's the migration.)
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

-- 3. the precondition. It is pg_temp.anon_ten_read_paths(), created by the
--    migration run above in this same session, and the file RAISEs when it
--    returns anything. Call it directly (no ON_ERROR_STOP games): empty on the
--    live shape; names a probe SELECT rule for anon; ignores the same rule for
--    authenticated only; names a view anon may read; names an invoker trigger.
INSERT INTO result (what, ok) SELECT 'precondition: nothing on the live shape', pg_temp.anon_ten_read_paths() IS NULL;
BEGIN;
CREATE POLICY sections_select_probe ON public.sections FOR SELECT USING (public.gate_can_scan());
SELECT (coalesce(pg_temp.anon_ten_read_paths(), '') LIKE '%row rule public.sections.sections_select_probe (SELECT)%') AS p1 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: names a SELECT rule that applies to anon', :'p1'::boolean);
BEGIN;
CREATE POLICY sections_select_authed ON public.sections FOR SELECT TO authenticated USING (public.gate_can_scan());
SELECT (pg_temp.anon_ten_read_paths() IS NULL) AS p2 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: ignores a SELECT rule for authenticated only', :'p2'::boolean);
BEGIN;
CREATE TABLE public.t_probe (id int);
ALTER TABLE public.t_probe ENABLE ROW LEVEL SECURITY;
CREATE POLICY t_probe_insert ON public.t_probe FOR INSERT WITH CHECK (public.gate_can_record());
SELECT (coalesce(pg_temp.anon_ten_read_paths(), '') LIKE '%row rule public.t_probe.t_probe_insert (INSERT)%') AS p6 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: names an unexpected anon-reachable WRITE rule (only the 3 sections rules are exempt)', :'p6'::boolean);
BEGIN;
CREATE VIEW public.v_probe AS SELECT public.gate_can_scan() AS can;
GRANT SELECT ON public.v_probe TO anon;
SELECT (coalesce(pg_temp.anon_ten_read_paths(), '') LIKE '%view v_probe%') AS p3 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: names a view anon may read', :'p3'::boolean);
BEGIN;
CREATE FUNCTION public.trg_probe() RETURNS trigger LANGUAGE plpgsql AS $t$ BEGIN PERFORM public.gate_can_record(); RETURN NEW; END $t$;
REVOKE EXECUTE ON FUNCTION public.trg_probe() FROM PUBLIC;
SELECT (coalesce(pg_temp.anon_ten_read_paths(), '') LIKE '%invoker function trg_probe()%') AS p4 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: names an invoker trigger function even without an anon grant', :'p4'::boolean);
BEGIN;
CREATE FUNCTION public.fn_std_probe() RETURNS boolean LANGUAGE sql BEGIN ATOMIC SELECT public.gate_can_scan(); END;
GRANT EXECUTE ON FUNCTION public.fn_std_probe() TO anon;
SELECT (coalesce(pg_temp.anon_ten_read_paths(), '') LIKE '%invoker function fn_std_probe()%') AS p5 \gset
ROLLBACK;
INSERT INTO result (what, ok) VALUES ('precondition: reads a BEGIN ATOMIC body', :'p5'::boolean);

-- Verdict: RAISE (non-zero psql exit under ON_ERROR_STOP) unless every check is explicitly TRUE.
DO $v$
DECLARE v_bad text; v_n int;
BEGIN
  SELECT string_agg(n || ': ' || what, ' | ' ORDER BY n) FILTER (WHERE ok IS NOT TRUE), count(*) INTO v_bad, v_n FROM result;
  IF v_n <> 16 THEN RAISE EXCEPTION 'REHEARSAL FAIL: expected 16 checks, ran %', v_n; END IF;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'REHEARSAL FAIL: %', v_bad; END IF;
  RAISE NOTICE 'REHEARSAL PASS (% checks)', v_n;
END $v$;
