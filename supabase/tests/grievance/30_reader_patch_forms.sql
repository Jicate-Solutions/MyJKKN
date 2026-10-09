-- Section 12's in-place patch, on every way SQL can read grievance_tickets
-- (deep review of #4079, H3: the first version only rewrote
-- "FROM [public.]grievance_tickets", so a JOIN, a quoted or upper-case name,
-- ONLY or a comma list kept leaking complaints about the Joint MD into a
-- count). Runs after 20_about_joint_md.sql, whose complaints about the Joint
-- MD are still in college A. Every assertion raises 'FAIL: …'.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

SELECT count(*) FILTER (WHERE NOT about_joint_md) AS plain_a, count(*) FILTER (WHERE about_joint_md) AS ticked_a
  FROM grievance_tickets WHERE institution_id = '10000000-0000-0000-0000-000000000001' \gset
SELECT t_ok(:ticked_a > 0, 'college A still holds complaints about the Joint MD: ' || :ticked_a);

-- ------------------------------------------------ 1. every read form, in one function
-- Seven reads, seven forms. The comment and the string below mention the
-- table and must be left exactly as they are.
CREATE FUNCTION t_jmd_forms(p_inst uuid) RETURNS integer[] LANGUAGE plpgsql AS $fn$
DECLARE
  a int; b int; c int; d int; e int; f int; g int;
  v_label text := 'counted from grievance tickets';   -- a string that is not the table name
BEGIN
  -- comment: SELECT * FROM grievance_tickets (never rewritten)
  /* block comment: JOIN grievance_tickets gt ON true */
  SELECT count(*) INTO a FROM institutions i JOIN grievance_tickets gt ON gt.institution_id = i.id WHERE i.id = p_inst;
  SELECT count(*) INTO b
    FROM institutions i
    LEFT   JOIN "public"."grievance_tickets" AS t2 ON t2.institution_id = i.id
   WHERE i.id = p_inst AND t2.id IS NOT NULL;
  SELECT count(*) INTO c FROM institutions i, public.grievance_tickets x WHERE x.institution_id = i.id AND i.id = p_inst;
  SELECT count(*) INTO d FROM ONLY grievance_tickets WHERE grievance_tickets.institution_id = p_inst;
  SELECT count(*) INTO e FROM   PUBLIC.Grievance_Tickets
   WHERE institution_id = p_inst;
  SELECT count(*) INTO f FROM institutions i INNER JOIN grievance_tickets ON grievance_tickets.institution_id = i.id WHERE i.id = p_inst;
  SELECT count(*) INTO g FROM (SELECT * FROM grievance_tickets) s WHERE s.institution_id = p_inst;
  RETURN ARRAY[a, b, c, d, e, f, g];
END
$fn$;

SELECT t_ok((SELECT bool_and(x = :plain_a + :ticked_a) FROM unnest(t_jmd_forms('10000000-0000-0000-0000-000000000001')) x),
            'before the patch every form counts the complaints about the Joint MD too: ' || t_jmd_forms('10000000-0000-0000-0000-000000000001')::text);
SELECT t_ok((SELECT w.wrapped FROM fn_grievance_jmd_wrap_reads((SELECT prosrc FROM pg_proc WHERE proname = 't_jmd_forms'), 'all') w) = 7,
            'the rewriter finds all seven reads');
SELECT t_ok(fn_grievance_jmd_patch_reader('t_jmd_forms(uuid)'::regprocedure, 'all') = 7, 'the patch wraps all seven');
SELECT t_ok((SELECT bool_and(x = :plain_a) FROM unnest(t_jmd_forms('10000000-0000-0000-0000-000000000001')) x),
            'after the patch every form leaves them out: ' || t_jmd_forms('10000000-0000-0000-0000-000000000001')::text || ', expected ' || :plain_a);
SELECT t_ok((SELECT prosrc LIKE '%-- comment: SELECT * FROM grievance_tickets (never rewritten)%'
                AND prosrc LIKE '%/* block comment: JOIN grievance_tickets gt ON true */%'
                AND prosrc LIKE '%''counted from grievance tickets''%'
             FROM pg_proc WHERE proname = 't_jmd_forms'), 'comments and strings are left byte for byte');
SELECT t_ok(fn_grievance_jmd_patch_reader('t_jmd_forms(uuid)'::regprocedure, 'all') = 0, 'patching again changes nothing');
SELECT t_ok((SELECT w.already FROM fn_grievance_jmd_wrap_reads((SELECT prosrc FROM pg_proc WHERE proname = 't_jmd_forms'), 'all') w) = 7,
            'and recognises all seven as already wrapped');

-- the "caller" rule (My Desk's): hidden from the Joint MD only
CREATE FUNCTION t_jmd_caller(p_inst uuid) RETURNS integer LANGUAGE sql AS $fn$
  SELECT count(*)::int FROM institutions i JOIN public.grievance_tickets g ON g.institution_id = i.id WHERE i.id = p_inst
$fn$;
SELECT t_ok(fn_grievance_jmd_patch_reader('t_jmd_caller(uuid)'::regprocedure, 'caller') = 1, 'a SQL-language body is patched too');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);   -- the Joint MD
SELECT t_ok(t_jmd_caller('10000000-0000-0000-0000-000000000001') = :plain_a, 'caller rule: the Joint MD does not count them');
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000000f', false);   -- another super admin
SELECT t_ok(t_jmd_caller('10000000-0000-0000-0000-000000000001') = :plain_a + :ticked_a, 'caller rule: anyone else still does');
SELECT set_config('request.jwt.claim.sub', '', false);

-- ------------------------------------------------ 1b. column references that name the table (round 2, M7)
-- After wrapping, the read is named grievance_tickets with no schema, so a
-- schema-qualified column (public.grievance_tickets.id) in a select list or a
-- subquery would fail only when the function RUNS. The patch drops the schema,
-- and the function is run here to prove it.
CREATE FUNCTION t_jmd_qualified(p_inst uuid) RETURNS integer[] LANGUAGE plpgsql AS $fn$
DECLARE a int; b int; c int;
BEGIN
  SELECT count(public.grievance_tickets.id) INTO a FROM public.grievance_tickets WHERE public.grievance_tickets.institution_id = p_inst;
  SELECT count(*) INTO b FROM institutions i
   WHERE i.id = p_inst
     AND EXISTS (SELECT 1 FROM grievance_tickets WHERE "public"."grievance_tickets".institution_id = i.id AND grievance_tickets.about_joint_md);
  SELECT (SELECT max(grievance_tickets.created_at) IS NOT NULL)::int INTO c FROM grievance_tickets WHERE grievance_tickets.institution_id = p_inst;
  RETURN ARRAY[a, b, c];
END
$fn$;
SELECT t_ok(t_jmd_qualified('10000000-0000-0000-0000-000000000001') = ARRAY[:plain_a + :ticked_a, 1, 1],
            'before the patch: ' || t_jmd_qualified('10000000-0000-0000-0000-000000000001')::text);
SELECT t_ok(fn_grievance_jmd_patch_reader('t_jmd_qualified(uuid)'::regprocedure, 'all') = 6,
            'three reads wrapped and three schema-qualified columns repaired');
SELECT t_ok(t_jmd_qualified('10000000-0000-0000-0000-000000000001') = ARRAY[:plain_a, 0, 1],
            'after the patch it RUNS and leaves them out: ' || t_jmd_qualified('10000000-0000-0000-0000-000000000001')::text);
SELECT t_ok((SELECT w.wrapped = 0 FROM fn_grievance_jmd_wrap_reads((SELECT prosrc FROM pg_proc WHERE proname = 't_jmd_qualified'), 'all') w),
            'and the section-14 check finds nothing left');
-- what section 14 must catch: a wrapped read with a schema-qualified column left over
SELECT t_ok((SELECT w.wrapped = 1 FROM fn_grievance_jmd_wrap_reads(
               'SELECT public.grievance_tickets.id FROM (SELECT * FROM public.grievance_tickets AS __jmd WHERE NOT COALESCE(__jmd.about_joint_md, false)) AS grievance_tickets', 'all') w),
            'section 14 flags a schema-qualified column left next to a wrapped read');
DO $$ BEGIN
  PERFORM fn_grievance_jmd_wrap_reads('SELECT grievance_tickets.id FROM (SELECT * FROM public.grievance_tickets AS __jmd WHERE true) AS g', 'all', 'test');
  RAISE EXCEPTION 'FAIL: a grievance_tickets.<col> with no read of that name was accepted';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
END $$;
SELECT t_ok(true, 'section 14 refuses grievance_tickets.<col> when no read carries that name');

-- ------------------------------------------------ 1c. the real readers, as main's migrations leave them
-- run.sh loaded each reader's newest definition from the migrations that sort
-- BEFORE this one into schema "replay" (replay_readers.py, which also failed
-- the run if a later migration re-creates one). Patch them and re-create
-- them: the rewritten text of every real body parses.
SELECT t_ok(count(*) = 5, 'five real readers replayed: ' || string_agg(p.proname, ', '))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'replay';
SELECT t_ok(fn_grievance_jmd_patch_reader(p.oid::regprocedure, 'switch') >= 1,
            'replay.' || p.proname || ': patched and re-created')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'replay';
SELECT t_ok(w.wrapped = 0 AND w.already >= 1, 'replay.' || p.proname || ': every read wrapped (' || w.already || ')')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'replay',
       fn_grievance_jmd_wrap_reads(p.prosrc, 'all', p.proname) w;

-- ------------------------------------------------ 2. what it refuses (a person has to look)
DO $$
DECLARE
  v_body text;
  v_bad  text[] := ARRAY[
    'BEGIN UPDATE grievance_tickets SET status = ''closed''; END',
    'BEGIN INSERT INTO public.grievance_tickets (subject) VALUES (''x''); END',
    'BEGIN DELETE FROM grievance_tickets WHERE false; END',
    'BEGIN EXECUTE ''SELECT count(*) FROM grievance_tickets''; END',
    'BEGIN EXECUTE $q$SELECT count(*) FROM grievance_tickets$q$; END',
    'BEGIN PERFORM 1 FROM institutions i WHERE EXISTS (SELECT 1 FROM institutions j USING grievance_tickets); END',
    'DECLARE r public.grievance_tickets; BEGIN RETURN 1; END'];   -- a bare row type: refused, to be safe
BEGIN
  FOREACH v_body IN ARRAY v_bad LOOP
    BEGIN
      PERFORM fn_grievance_jmd_wrap_reads(v_body, 'all', 'test');
      RAISE EXCEPTION 'FAIL: the patch accepted a body it cannot vouch for: %', v_body;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
SELECT t_ok(true, 'writes, dynamic SQL and unrecognised uses are refused, not silently left unfiltered');

-- not reads: left alone, no error
SELECT t_ok((SELECT w.wrapped = 0 AND w.already = 0 AND w.body = v.s
             FROM (VALUES ('DECLARE t grievance_tickets%ROWTYPE; BEGIN SELECT grievance_tickets.id INTO t.id FROM x AS grievance_tickets; RETURN t.id; END')) v(s),
                  fn_grievance_jmd_wrap_reads(v.s, 'all') w),
            '%ROWTYPE, a column qualifier and an alias named grievance_tickets are not reads and are left alone');
SELECT t_ok((SELECT w.wrapped = 0 FROM fn_grievance_jmd_wrap_reads('SELECT 1 FROM grievance_tickets_archive a, my_grievance_tickets b', 'all') w),
            'a longer name that contains grievance_tickets is not the table');

-- ------------------------------------------------ 3. the five real readers: nothing left unwrapped
SELECT t_ok(count(*) = 5, 'all five readers exist in the rehearsal: ' || count(*))
  FROM pg_proc WHERE proname IN ('fn_my_desk_waiting', 'fn_dashboard_metrics', 'fn_compute_ohs_for_institution',
                                 'fn_hod_metrics', 'fn_compute_dhs_for_user');
SELECT t_ok(w.wrapped = 0 AND w.already >= 1, p.proname || ': every read of grievance_tickets is wrapped (' || w.already || ')')
  FROM pg_proc p, fn_grievance_jmd_wrap_reads(p.prosrc, 'all', p.proname) w
 WHERE p.proname IN ('fn_my_desk_waiting', 'fn_dashboard_metrics', 'fn_compute_ohs_for_institution',
                     'fn_hod_metrics', 'fn_compute_dhs_for_user');
SELECT t_ok(NOT has_function_privilege(r, f, 'EXECUTE'), r || ' cannot run ' || f)
FROM unnest(ARRAY['anon', 'authenticated']) AS r,
     unnest(ARRAY['fn_grievance_jmd_wrap_reads(text,text,text)', 'fn_grievance_jmd_patch_reader(regprocedure,text)']) AS f;

-- ------------------------------------------------ 4. THE READER GATE (round 3)
-- Every function / view / materialized view in the database that reads
-- grievance_tickets, _comments or _history is wrapped or allow-listed. The
-- rehearsal's own fixtures are named here; nothing else is excused.
\set fixtures '{tk,t_break_one_notice,t_desk_grievance_ids,t_sb,t_jmd_forms,t_jmd_caller,t_jmd_qualified}'
SELECT t_ok(NOT EXISTS (SELECT 1 FROM fn_grievance_jmd_reader_gate(:'fixtures'::text[])),
            'the gate passes: ' || COALESCE((SELECT string_agg(object || ' — ' || problem, '; ') FROM fn_grievance_jmd_reader_gate(:'fixtures'::text[])), 'nothing unfiltered'));
SELECT t_ok((SELECT count(*) FROM fn_grievance_jmd_reader_allow_list() WHERE reason IS NULL OR length(reason) < 10) = 0,
            'every allow-list entry carries its reason');

-- it catches what a panel would have had to find by hand
CREATE FUNCTION t_leak_count() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT count(*) FROM grievance_tickets $fn$;
CREATE SCHEMA t_elsewhere;
CREATE FUNCTION t_elsewhere.t_leak_join(p uuid) RETURNS bigint LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN (SELECT count(*) FROM institutions i JOIN public.grievance_tickets g ON g.institution_id = i.id WHERE i.id = p);
END $fn$;
CREATE FUNCTION t_leak_comments() RETURNS bigint LANGUAGE sql AS $fn$ SELECT count(*) FROM grievance_comments $fn$;
CREATE FUNCTION t_leak_dynamic() RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE n bigint; BEGIN EXECUTE 'SELECT count(*) FROM grievance_tickets' INTO n; RETURN n; END $fn$;
CREATE FUNCTION t_leak_atomic() RETURNS bigint LANGUAGE sql BEGIN ATOMIC SELECT count(*) FROM public.grievance_tickets; END;
CREATE VIEW t_leak_view AS SELECT id, subject FROM grievance_tickets;
CREATE FUNCTION t_only_a_comment() RETURNS int LANGUAGE sql AS $fn$ SELECT 1 -- grievance_tickets is only named here
$fn$;
CREATE TEMP TABLE gate_hits AS SELECT * FROM fn_grievance_jmd_reader_gate(:'fixtures'::text[]);
SELECT t_ok((SELECT count(*) FROM gate_hits WHERE object = o) = 1, 'the gate names ' || o || ': '
            || COALESCE((SELECT problem FROM gate_hits WHERE object = o), 'MISSED'))
FROM unnest(ARRAY['t_leak_count()', 't_elsewhere.t_leak_join(uuid)', 't_leak_comments()', 't_leak_dynamic()',
                  't_leak_atomic()', 'public.t_leak_view']) AS o;
SELECT t_ok(NOT EXISTS (SELECT 1 FROM gate_hits WHERE object = 't_only_a_comment()'), 'a name in a comment is not a read');
SELECT t_ok((SELECT count(*) FROM gate_hits) = 6, 'and nothing else: ' || (SELECT string_agg(object, ', ') FROM gate_hits));
-- the migration's own self-check refuses the same (section 14 runs the gate)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM fn_grievance_jmd_reader_gate() WHERE object = 't_leak_count()') THEN
    RAISE EXCEPTION 'FAIL: the self-check''s gate call does not see the leak';
  END IF;
END $$;
-- wrapped, it passes
SELECT t_ok(fn_grievance_jmd_patch_reader('t_leak_count()'::regprocedure, 'switch') = 1, 'the leak, wrapped');
SELECT t_ok(NOT EXISTS (SELECT 1 FROM fn_grievance_jmd_reader_gate(:'fixtures'::text[]) WHERE object = 't_leak_count()'),
            'wrapped, the gate lets it through');
SELECT t_ok(t_leak_count() = (SELECT count(*) FROM grievance_tickets WHERE NOT about_joint_md), 'and it no longer counts them');
DROP VIEW t_leak_view;
DROP FUNCTION t_leak_count(), t_leak_comments(), t_leak_dynamic(), t_leak_atomic(), t_only_a_comment();
DROP SCHEMA t_elsewhere CASCADE;
SELECT t_ok(NOT EXISTS (SELECT 1 FROM fn_grievance_jmd_reader_gate(:'fixtures'::text[])), 'clean again');

SELECT 'READER PATCH SCENARIOS PASSED' AS result;
