-- ============================================================================
-- ai-rpc-dead-scope-rehearsal.sql
--
-- OFF PRODUCTION ONLY. Runs against the fixture in
-- ai-rpc-dead-scope-stub-schema.sql (fixed ids below); it ROLLS BACK.
--
-- Proves, for 20270308090000_ai_rpc_repair_dead_scope_lookups.sql, per function:
--   (a) it no longer raises for a caller who may use it;
--   (b) a one-college caller naming another college's id (institution,
--       department, section, academic year, learner, team member, timetable,
--       person, bug report) is REFUSED — FORBIDDEN_INSTITUTION, or NOT_FOUND for
--       the three "details" lookups — or gets their own scope only;
--   (c) a super admin still reads every college, and a named college narrows;
--   (d) anon cannot EXECUTE it (42501).
-- Every call passes the SUPER ADMIN's id as p_user_id, so a pass also proves the
-- identity pin (auth.uid(), never p_user_id) holds.
-- Also covered: callers without the key are refused (FORBIDDEN), a caller with
-- no institution is refused (NO_INSTITUTION), a legitimate grant or
-- institution_scope='all' role is honoured, and the staff module scope
-- own_records limits a caller to their own team-member record.
--
-- RUN (after the stub, the pre-fix bodies and PR #3983, see the stub header):
--   psql -h 127.0.0.1 -p 54412 -U postgres -d t -f supabase/tests/ai-rpc-dead-scope-rehearsal.sql
-- EXPECT the script to END WITH AN ERROR:
--   REPORT {"verdict": "PASS", "checks": N, "passed": N, "failures": []}
-- The report is thrown so nothing can commit. Over the pre-fix bodies (the
-- control) the verdict is FAIL; that proves the checks can fail.
-- ============================================================================

BEGIN;

-- Who and what, by name.
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid) ON COMMIT DROP;
INSERT INTO ids VALUES
  ('A',  '00000000-0000-4000-a000-00000000000a'), ('B', '00000000-0000-4000-a000-00000000000b'),
  ('C',  '00000000-0000-4000-a000-00000000000c'),
  ('SUPER','00000000-0000-4000-b000-000000000001'), ('FAC','00000000-0000-4000-b000-000000000002'),
  ('ADM','00000000-0000-4000-b000-000000000003'),   ('LEARNER','00000000-0000-4000-b000-000000000004'),
  ('GRANT','00000000-0000-4000-b000-000000000005'), ('NOINST','00000000-0000-4000-b000-000000000006'),
  ('SELF','00000000-0000-4000-b000-000000000007'),  ('DASH','00000000-0000-4000-b000-000000000008'),
  ('LADM','00000000-0000-4000-b000-000000000009'),  ('ALL','00000000-0000-4000-b000-000000000010'),
  ('DESK','00000000-0000-4000-b000-000000000011'),  ('UB','00000000-0000-4000-b000-000000000012'),
  ('D_A','00000000-0000-4000-8d00-00000000000a'),   ('D_B','00000000-0000-4000-8d00-00000000000b'),
  ('S_A','00000000-0000-4000-8e00-00000000000a'),   ('S_B','00000000-0000-4000-8e00-00000000000b'),
  ('Y_A','00000000-0000-4000-8a00-00000000000a'),   ('Y_B','00000000-0000-4000-8a00-00000000000b'),
  ('L_A1','00000000-0000-4000-9300-0000000000a1'),  ('L_B1','00000000-0000-4000-9300-0000000000b1'),
  ('ST_A1','00000000-0000-4000-9000-0000000000a1'), ('ST_A2','00000000-0000-4000-9000-0000000000a2'),
  ('ST_B1','00000000-0000-4000-9000-0000000000b1'),
  ('TT_A','00000000-0000-4000-9100-00000000000a'),  ('TT_B','00000000-0000-4000-9100-00000000000b'),
  ('BUG_A1','00000000-0000-4000-9400-0000000000a1'),('BUG_A2','00000000-0000-4000-9400-0000000000a2'),
  ('BUG_B1','00000000-0000-4000-9400-0000000000b1');

-- Call as a signed-in user (or anon when p_who is 'ANON'), the way PostgREST does:
-- request.jwt.claims + SET LOCAL ROLE. A raised error comes back as {raised, sqlstate}.
CREATE FUNCTION pg_temp.call_as(p_who text, p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE r jsonb; v_uid uuid; v_sql text := p_sql; k record;
BEGIN
  FOR k IN SELECT * FROM ids ORDER BY length(ids.k) DESC LOOP
    v_sql := replace(v_sql, '{' || k.k || '}', quote_literal(k.v) || '::uuid');
  END LOOP;
  SELECT v INTO v_uid FROM ids WHERE ids.k = p_who;
  PERFORM set_config('request.jwt.claims',
    CASE WHEN v_uid IS NULL THEN '' ELSE jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text END, true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_uid::text, ''), true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE ' || CASE WHEN v_uid IS NULL THEN 'anon' ELSE 'authenticated' END;
    EXECUTE 'SELECT (' || v_sql || ')::jsonb' INTO r;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    r := jsonb_build_object('raised', SQLERRM, 'sqlstate', SQLSTATE);
  END;
  RETURN r;
END $f$;

-- expect: ok            success true
--         ok:N          success true and data is an array of N rows
--         code:X        success false with error.code X and no data
--         denied        raised 42501 (EXECUTE refused)
--         expr:<sql>    any boolean over $1 (the jsonb result)
CREATE TEMP TABLE chk (n serial, fn text, cat text, who text, call text, expect text) ON COMMIT DROP;
INSERT INTO chk (fn, cat, who, call, expect) VALUES
  -- ai_rpc_academic_years (academic.years.view; colleges role_has_institution_access admits)
  ('academic_years','a','FAC',    'public.ai_rpc_academic_years({SUPER}, NULL)',  'ok:2'),
  ('academic_years','b','FAC',    'public.ai_rpc_academic_years({SUPER}, {B})',   'code:FORBIDDEN_INSTITUTION'),
  ('academic_years','a','FAC',    'public.ai_rpc_academic_years({SUPER}, {A})',   'ok:2'),
  ('academic_years','a','GRANT',  'public.ai_rpc_academic_years({SUPER}, NULL)',  'ok:3'),
  ('academic_years','a','ALL',    'public.ai_rpc_academic_years({SUPER}, {B})',   'ok:1'),
  ('academic_years','b','LEARNER','public.ai_rpc_academic_years({SUPER}, NULL)',  'code:FORBIDDEN'),
  ('academic_years','b','NOINST', 'public.ai_rpc_academic_years({SUPER}, NULL)',  'code:NO_INSTITUTION'),
  ('academic_years','c','SUPER',  'public.ai_rpc_academic_years({SUPER}, NULL)',  'ok:4'),
  ('academic_years','c','SUPER',  'public.ai_rpc_academic_years({SUPER}, {B})',   'ok:1'),
  ('academic_years','d','ANON',   'public.ai_rpc_academic_years({SUPER}, NULL)',  'denied'),
  -- ai_rpc_attendance_summary (own college; dashboard key widens to accessible set)
  ('attendance_summary','a','FAC',  'public.ai_rpc_attendance_summary({SUPER})',                    'expr:($1->''data''->>''total_records'')::int = 3'),
  ('attendance_summary','b','FAC',  'public.ai_rpc_attendance_summary({SUPER}, NULL, {S_B})',       'code:FORBIDDEN_INSTITUTION'),
  ('attendance_summary','b','FAC',  'public.ai_rpc_attendance_summary({SUPER}, NULL, NULL, {D_B})', 'code:FORBIDDEN_INSTITUTION'),
  ('attendance_summary','b','FAC',  'public.ai_rpc_attendance_summary({SUPER}, {L_B1})',            'code:FORBIDDEN_INSTITUTION'),
  ('attendance_summary','a','FAC',  'public.ai_rpc_attendance_summary({SUPER}, {L_A1})',            'expr:($1->''data''->>''total_records'')::int = 3'),
  ('attendance_summary','b','GRANT','public.ai_rpc_attendance_summary({SUPER})',                    'expr:($1->''data''->>''total_records'')::int = 3'),
  ('attendance_summary','a','DASH', 'public.ai_rpc_attendance_summary({SUPER})',                    'expr:($1->''data''->>''total_records'')::int = 4'),
  ('attendance_summary','b','LEARNER','public.ai_rpc_attendance_summary({SUPER})',                  'code:FORBIDDEN'),
  ('attendance_summary','c','SUPER','public.ai_rpc_attendance_summary({SUPER})',                    'expr:($1->''data''->>''total_records'')::int = 6'),
  ('attendance_summary','c','SUPER','public.ai_rpc_attendance_summary({SUPER}, NULL, {S_B})',       'expr:($1->''data''->>''total_records'')::int = 2'),
  ('attendance_summary','d','ANON', 'public.ai_rpc_attendance_summary({SUPER})',                    'denied'),
  -- ai_rpc_bug_report_details (reporter, or super_admin/admin/ceo profile role within the caller's colleges)
  ('bug_report_details','a','LEARNER','public.ai_rpc_bug_report_details({SUPER}, {BUG_A2})', 'expr:($1->>''success'')::boolean AND $1->''data''->>''display_id'' = ''BUG-A2'''),
  ('bug_report_details','a','FAC',    'public.ai_rpc_bug_report_details({SUPER}, {BUG_A1})', 'ok'),
  ('bug_report_details','b','FAC',    'public.ai_rpc_bug_report_details({SUPER}, {BUG_A2})', 'code:NOT_FOUND'),
  ('bug_report_details','b','FAC',    'public.ai_rpc_bug_report_details({SUPER}, {BUG_B1})', 'code:NOT_FOUND'),
  ('bug_report_details','a','LADM',   'public.ai_rpc_bug_report_details({SUPER}, {BUG_A2})', 'ok'),
  ('bug_report_details','b','LADM',   'public.ai_rpc_bug_report_details({SUPER}, {BUG_B1})', 'code:NOT_FOUND'),
  ('bug_report_details','c','SUPER',  'public.ai_rpc_bug_report_details({SUPER}, {BUG_B1})', 'ok'),
  ('bug_report_details','d','ANON',   'public.ai_rpc_bug_report_details({SUPER}, {BUG_A1})', 'denied'),
  -- ai_rpc_courses (organizations.courses.view)
  ('courses','a','FAC',    'public.ai_rpc_courses({SUPER}, NULL)', 'ok:2'),
  ('courses','b','FAC',    'public.ai_rpc_courses({SUPER}, {B})',  'code:FORBIDDEN_INSTITUTION'),
  ('courses','a','GRANT',  'public.ai_rpc_courses({SUPER}, NULL)', 'ok:3'),
  ('courses','b','LEARNER','public.ai_rpc_courses({SUPER}, NULL)', 'code:FORBIDDEN'),
  ('courses','c','SUPER',  'public.ai_rpc_courses({SUPER}, NULL)', 'ok:4'),
  ('courses','c','SUPER',  'public.ai_rpc_courses({SUPER}, {B})',  'ok:1'),
  ('courses','d','ANON',   'public.ai_rpc_courses({SUPER}, NULL)', 'denied'),
  -- ai_rpc_degrees (no key; colleges role_has_institution_access admits)
  ('degrees','a','LEARNER','public.ai_rpc_degrees({SUPER}, NULL)', 'ok:1'),
  ('degrees','b','LEARNER','public.ai_rpc_degrees({SUPER}, {B})',  'code:FORBIDDEN_INSTITUTION'),
  ('degrees','a','GRANT',  'public.ai_rpc_degrees({SUPER}, NULL)', 'ok:2'),
  ('degrees','b','NOINST', 'public.ai_rpc_degrees({SUPER}, NULL)', 'code:NO_INSTITUTION'),
  ('degrees','c','SUPER',  'public.ai_rpc_degrees({SUPER}, NULL)', 'ok:3'),
  ('degrees','c','SUPER',  'public.ai_rpc_degrees({SUPER}, {C})',  'ok:1'),
  ('degrees','d','ANON',   'public.ai_rpc_degrees({SUPER}, NULL)', 'denied'),
  -- ai_rpc_faculty_assignments (staff.view + staff module scope; no such table live -> [])
  ('faculty_assignments','a','FAC',    'public.ai_rpc_faculty_assignments({SUPER})',              'ok:0'),
  ('faculty_assignments','b','FAC',    'public.ai_rpc_faculty_assignments({SUPER}, {ST_B1})',     'code:FORBIDDEN_INSTITUTION'),
  ('faculty_assignments','b','FAC',    'public.ai_rpc_faculty_assignments({SUPER}, NULL, {D_B})', 'code:FORBIDDEN_INSTITUTION'),
  ('faculty_assignments','b','LEARNER','public.ai_rpc_faculty_assignments({SUPER})',              'code:FORBIDDEN'),
  ('faculty_assignments','c','SUPER',  'public.ai_rpc_faculty_assignments({SUPER}, {ST_B1})',     'ok:0'),
  ('faculty_assignments','d','ANON',   'public.ai_rpc_faculty_assignments({SUPER})',              'denied'),
  -- ai_rpc_institution_access (own grants for anyone; others need roles.edit/admin + the target's college)
  ('institution_access','a','GRANT','public.ai_rpc_institution_access({SUPER})',              'ok:1'),
  ('institution_access','a','FAC',  'public.ai_rpc_institution_access({SUPER})',              'ok:0'),
  ('institution_access','b','FAC',  'public.ai_rpc_institution_access({SUPER}, {UB})',        'code:FORBIDDEN'),
  ('institution_access','b','FAC',  'public.ai_rpc_institution_access({SUPER}, NULL, {B})',   'code:FORBIDDEN_INSTITUTION'),
  ('institution_access','a','ADM',  'public.ai_rpc_institution_access({SUPER})',              'ok:1'),
  ('institution_access','b','ADM',  'public.ai_rpc_institution_access({SUPER}, {UB})',        'code:FORBIDDEN_INSTITUTION'),
  ('institution_access','a','ADM',  'public.ai_rpc_institution_access({SUPER}, {LEARNER})',   'ok:1'),
  ('institution_access','c','SUPER','public.ai_rpc_institution_access({SUPER})',              'ok:4'),
  ('institution_access','d','ANON', 'public.ai_rpc_institution_access({SUPER})',              'denied'),
  -- ai_rpc_periods (no key; OWN college only)
  ('periods','a','LEARNER','public.ai_rpc_periods({SUPER}, NULL)', 'ok:2'),
  ('periods','b','LEARNER','public.ai_rpc_periods({SUPER}, {B})',  'code:FORBIDDEN_INSTITUTION'),
  ('periods','b','ALL',    'public.ai_rpc_periods({SUPER}, {B})',  'code:FORBIDDEN_INSTITUTION'),
  ('periods','a','FAC',    'public.ai_rpc_periods({SUPER}, {A})',  'ok:2'),
  ('periods','b','NOINST', 'public.ai_rpc_periods({SUPER}, NULL)', 'code:NO_INSTITUTION'),
  ('periods','c','SUPER',  'public.ai_rpc_periods({SUPER}, NULL)', 'ok:4'),
  ('periods','c','SUPER',  'public.ai_rpc_periods({SUPER}, {B})',  'ok:1'),
  ('periods','d','ANON',   'public.ai_rpc_periods({SUPER}, NULL)', 'denied'),
  -- ai_rpc_staff_details (staff.view + staff module scope; outside scope reads as NOT_FOUND)
  ('staff_details','a','FAC',    'public.ai_rpc_staff_details({SUPER}, {ST_A2})', 'expr:($1->>''success'')::boolean AND $1->''data''->>''staff_id'' = ''SA2'''),
  ('staff_details','b','FAC',    'public.ai_rpc_staff_details({SUPER}, {ST_B1})', 'code:NOT_FOUND'),
  ('staff_details','a','SELF',   'public.ai_rpc_staff_details({SUPER}, {ST_A1})', 'ok'),
  ('staff_details','b','SELF',   'public.ai_rpc_staff_details({SUPER}, {ST_A2})', 'code:NOT_FOUND'),
  ('staff_details','b','LEARNER','public.ai_rpc_staff_details({SUPER}, {ST_A2})', 'code:FORBIDDEN'),
  ('staff_details','c','SUPER',  'public.ai_rpc_staff_details({SUPER}, {ST_B1})', 'ok'),
  ('staff_details','d','ANON',   'public.ai_rpc_staff_details({SUPER}, {ST_A2})', 'denied'),
  -- ai_rpc_staff_plans
  ('staff_plans','a','FAC',    'public.ai_rpc_staff_plans({SUPER})',              'ok:2'),
  ('staff_plans','b','FAC',    'public.ai_rpc_staff_plans({SUPER}, {D_B})',       'code:FORBIDDEN_INSTITUTION'),
  ('staff_plans','b','FAC',    'public.ai_rpc_staff_plans({SUPER}, NULL, {TT_B})','code:FORBIDDEN_INSTITUTION'),
  ('staff_plans','a','SELF',   'public.ai_rpc_staff_plans({SUPER})',              'ok:1'),
  ('staff_plans','b','LEARNER','public.ai_rpc_staff_plans({SUPER})',              'code:FORBIDDEN'),
  ('staff_plans','c','SUPER',  'public.ai_rpc_staff_plans({SUPER})',              'ok:4'),
  ('staff_plans','d','ANON',   'public.ai_rpc_staff_plans({SUPER})',              'denied'),
  -- ai_rpc_timetable_slots (academic.timetables.view; outside scope reads as NOT_FOUND)
  ('timetable_slots','a','FAC',    'public.ai_rpc_timetable_slots({SUPER}, {TT_A})', 'ok:2'),
  ('timetable_slots','b','FAC',    'public.ai_rpc_timetable_slots({SUPER}, {TT_B})', 'code:NOT_FOUND'),
  ('timetable_slots','b','LEARNER','public.ai_rpc_timetable_slots({SUPER}, {TT_A})', 'code:FORBIDDEN'),
  ('timetable_slots','b','NOINST', 'public.ai_rpc_timetable_slots({SUPER}, {TT_A})', 'code:NO_INSTITUTION'),
  ('timetable_slots','c','SUPER',  'public.ai_rpc_timetable_slots({SUPER}, {TT_B})', 'ok:1'),
  ('timetable_slots','d','ANON',   'public.ai_rpc_timetable_slots({SUPER}, {TT_A})', 'denied'),
  -- ai_rpc_timetables
  ('timetables','a','FAC',    'public.ai_rpc_timetables({SUPER})',                   'ok:1'),
  ('timetables','b','FAC',    'public.ai_rpc_timetables({SUPER}, {D_B})',            'code:FORBIDDEN_INSTITUTION'),
  ('timetables','b','FAC',    'public.ai_rpc_timetables({SUPER}, NULL, {Y_B})',      'code:FORBIDDEN_INSTITUTION'),
  ('timetables','b','FAC',    'public.ai_rpc_timetables({SUPER}, NULL, NULL, {S_B})','code:FORBIDDEN_INSTITUTION'),
  ('timetables','b','LEARNER','public.ai_rpc_timetables({SUPER})',                   'code:FORBIDDEN'),
  ('timetables','c','SUPER',  'public.ai_rpc_timetables({SUPER})',                   'ok:2'),
  ('timetables','d','ANON',   'public.ai_rpc_timetables({SUPER})',                   'denied'),
  -- ai_rpc_user_roles (own roles for anyone; others need roles.edit/admin + the target's college)
  ('user_roles','a','FAC',  'public.ai_rpc_user_roles({SUPER})',          'ok:1'),
  ('user_roles','b','FAC',  'public.ai_rpc_user_roles({SUPER}, {UB})',    'code:FORBIDDEN'),
  ('user_roles','a','ADM',  'public.ai_rpc_user_roles({SUPER})',          'ok:7'),
  ('user_roles','b','ADM',  'public.ai_rpc_user_roles({SUPER}, {UB})',    'code:FORBIDDEN_INSTITUTION'),
  ('user_roles','a','ADM',  'public.ai_rpc_user_roles({SUPER}, {FAC})',   'ok:1'),
  ('user_roles','c','SUPER','public.ai_rpc_user_roles({SUPER})',          'ok:9'),
  ('user_roles','c','SUPER','public.ai_rpc_user_roles({SUPER}, {UB})',    'ok:1'),
  ('user_roles','d','ANON', 'public.ai_rpc_user_roles({SUPER})',          'denied'),
  -- ai_rpc_users (users.view; colleges role_has_institution_access admits)
  ('users','a','ADM',  'public.ai_rpc_users({SUPER})',       'ok:10'),
  ('users','b','ADM',  'public.ai_rpc_users({SUPER}, {B})',  'code:FORBIDDEN_INSTITUTION'),
  ('users','b','FAC',  'public.ai_rpc_users({SUPER})',       'code:FORBIDDEN'),
  ('users','c','SUPER','public.ai_rpc_users({SUPER})',       'ok:12'),
  ('users','c','SUPER','public.ai_rpc_users({SUPER}, {B})',  'ok:1'),
  ('users','d','ANON', 'public.ai_rpc_users({SUPER})',       'denied'),
  -- ai_rpc_admission_analytics (Section B: #3983's guards + the nested-aggregate fix)
  ('admission_analytics','a','DESK', 'public.ai_rpc_admission_analytics({SUPER})',
     'expr:($1->''data''->>''total_enquiries'')::int = 3 AND $1->''data''->''monthly_trend'' = ''{"2026-06": 1, "2026-07": 2}''::jsonb AND $1->''data''->''by_reference_type'' = ''{"staff": 2}''::jsonb'),
  ('admission_analytics','b','DESK', 'public.ai_rpc_admission_analytics({SUPER}, {B})', 'code:FORBIDDEN_INSTITUTION'),
  ('admission_analytics','b','FAC',  'public.ai_rpc_admission_analytics({SUPER})',      'code:FORBIDDEN'),
  ('admission_analytics','c','SUPER','public.ai_rpc_admission_analytics({SUPER})',
     'expr:($1->''data''->>''total_enquiries'')::int = 4 AND $1->''data''->''by_reference_type'' = ''{"agent": 1, "staff": 2}''::jsonb'),
  ('admission_analytics','c','SUPER','public.ai_rpc_admission_analytics({SUPER}, {B})', 'expr:($1->''data''->>''total_enquiries'')::int = 1'),
  ('admission_analytics','d','ANON', 'public.ai_rpc_admission_analytics({SUPER})',      'denied'),
  -- ai_rpc_academic_context (Section B: #3983's guards + is_active / academic_year_name)
  ('academic_context','a','FAC',   'public.ai_rpc_academic_context(NULL)', 'expr:($1->>''academic_year_id'')::uuid = ''00000000-0000-4000-8a00-00000000000a'' AND $1->>''academic_year_name'' = ''AY A'''),
  ('academic_context','b','FAC',   'public.ai_rpc_academic_context({B})',  'code:FORBIDDEN_INSTITUTION'),
  ('academic_context','c','SUPER', 'public.ai_rpc_academic_context({B})',  'expr:$1->>''academic_year_name'' = ''AY B'''),
  ('academic_context','b','NOINST','public.ai_rpc_academic_context(NULL)', 'code:NO_INSTITUTION'),
  ('academic_context','d','ANON',  'public.ai_rpc_academic_context(NULL)', 'denied');

DO $rep$
DECLARE
  c record; r jsonb; ok boolean; v_expect text;
  v_fail jsonb := '[]'::jsonb; v_n int := 0; v_pass int := 0;
BEGIN
  FOR c IN SELECT * FROM chk ORDER BY n LOOP
    v_n := v_n + 1;
    r := pg_temp.call_as(c.who, c.call);
    v_expect := c.expect;
    IF v_expect = 'denied' THEN
      ok := (r->>'sqlstate') = '42501';
    ELSIF r ? 'raised' THEN
      ok := false;
    ELSIF v_expect = 'ok' THEN
      ok := COALESCE((r->>'success')::boolean, false);
    ELSIF v_expect LIKE 'ok:%' THEN
      ok := COALESCE((r->>'success')::boolean, false)
            AND jsonb_typeof(r->'data') = 'array'
            AND jsonb_array_length(r->'data') = split_part(v_expect, ':', 2)::int;
    ELSIF v_expect LIKE 'code:%' THEN
      ok := (r->>'success') = 'false'
            AND r->'error'->>'code' = split_part(v_expect, ':', 2)
            AND COALESCE(r->'data', 'null'::jsonb) = 'null'::jsonb;
    ELSIF v_expect LIKE 'expr:%' THEN
      EXECUTE 'SELECT COALESCE((' || substr(v_expect, 6) || '), false)' INTO ok USING r;
    ELSE
      RAISE EXCEPTION 'bad expectation %', v_expect;
    END IF;
    IF ok THEN
      v_pass := v_pass + 1;
    ELSE
      v_fail := v_fail || jsonb_build_object('n', c.n, 'fn', c.fn, 'cat', c.cat, 'as', c.who, 'call', c.call,
                                             'expected', c.expect, 'got', left(r::text, 300));
    END IF;
    RAISE NOTICE '% #% % (%) as % -> %', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, c.n, c.fn, c.cat, c.who, left(r::text, 160);
  END LOOP;
  RAISE EXCEPTION 'REPORT %', jsonb_build_object(
    'verdict', CASE WHEN jsonb_array_length(v_fail) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'checks', v_n, 'passed', v_pass, 'failed', jsonb_array_length(v_fail),
    'by_category', (SELECT jsonb_object_agg(cat, cnt) FROM (SELECT cat, count(*) cnt FROM chk GROUP BY cat) x),
    'failures', v_fail);
END $rep$;

ROLLBACK;
