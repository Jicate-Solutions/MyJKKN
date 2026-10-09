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

SELECT 'READER PATCH SCENARIOS PASSED' AS result;
