\set ON_ERROR_STOP on
-- =====================================================================
-- Behaviour rehearsal for the block-course confirmation fix.
-- Every assertion runs the REAL functions from the migration against
-- seeded rows and checks the answer, not the text of the SQL.
-- Exit 0 and "ALL SCENARIOS PASSED" = every assertion held.
-- =====================================================================

-- ===== seed =====
INSERT INTO institutions (id, name) VALUES ('11111111-0000-0000-0000-000000000001','College One');
INSERT INTO profiles (id, email, is_super_admin) VALUES
  ('22222222-0000-0000-0000-000000000001','learner@x', false),
  ('22222222-0000-0000-0000-000000000009','sa@x', true);
INSERT INTO learners_profiles (id, profile_id, institution_id) VALUES
  ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001');

-- One teaching day. T1 carries the block course and its neighbours; T2 carries
-- one mark for course CZ, whose only feedback is recorded under T1.
--   p1,p2  course CX  - a BLOCK course: two periods, one class, one feedback
--   p3     course CY  - an ordinary single-period course
--   p4     no course_id at all
--   p5     course_id is a malformed non-uuid string
--   p6,p7  course CW  - a block course whose only feedback arrives LATE
--   p8     course CY  - an ABSENT mark, for the denominator
--   q1     course CZ, in timetable T2
INSERT INTO student_attendance (id, attendance_date, timetable_id, institution_id, section_id, attendance_data) VALUES
('44444444-0000-0000-0000-000000000001','2026-09-10','55555555-0000-0000-0000-00000000000a',
 '11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001', jsonb_build_object(
  'p1', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c1'::text,'course_code','CX','end_time','10:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p2', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c1'::text,'course_code','CX','end_time','11:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p3', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c2'::text,'course_code','CY','end_time','12:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p4', jsonb_build_object('course_code','CN','end_time','13:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p5', jsonb_build_object('course_id','NOT-A-UUID','course_code','CM','end_time','14:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p6', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c4'::text,'course_code','CW','end_time','15:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p7', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c4'::text,'course_code','CW','end_time','16:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present'))),
  'p8', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c2'::text,'course_code','CY','end_time','17:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Absent')))
)),
('44444444-0000-0000-0000-000000000002','2026-09-10','55555555-0000-0000-0000-00000000000b',
 '11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001', jsonb_build_object(
  'q1', jsonb_build_object('course_id','77777777-0000-0000-0000-0000000000c3'::text,'course_code','CZ','end_time','18:00',
        'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present')))
));

-- Feedback. The class day is anchored at IST midnight; window_hours is 48.
--   f1 - ONE feedback for the block course CX, given against period p1 only
--   f2 - ordinary feedback for p3
--   f3 - feedback for q1 (course CZ) but recorded under timetable T1, not T2.
--        Its period key is q1's own: under the block rule (#3963) a
--        same-course feedback confirms a sibling only when its period is in
--        the mark's own block, so what this row pins is the one thing it was
--        always about - no TIMETABLE equality on the match.
--   f4 - feedback for the block course CW, submitted THREE days late
INSERT INTO session_feedback (student_id, attendance_date, timetable_id, period_id, course_id, created_at) VALUES
('33333333-0000-0000-0000-000000000001','2026-09-10','55555555-0000-0000-0000-00000000000a','p1','77777777-0000-0000-0000-0000000000c1','2026-09-10 12:00+05:30'),
('33333333-0000-0000-0000-000000000001','2026-09-10','55555555-0000-0000-0000-00000000000a','p3','77777777-0000-0000-0000-0000000000c2','2026-09-10 12:05+05:30'),
('33333333-0000-0000-0000-000000000001','2026-09-10','55555555-0000-0000-0000-00000000000a','q1','77777777-0000-0000-0000-0000000000c3','2026-09-10 12:10+05:30'),
('33333333-0000-0000-0000-000000000001','2026-09-10','55555555-0000-0000-0000-00000000000a','p6','77777777-0000-0000-0000-0000000000c4','2026-09-13 12:00+05:30');

-- ===== day 2: the block rule itself (#3963), with real start/end times =====
-- Every day-1 period lacks a start_time, so fn_scf_block_period_keys falls
-- back to "every period of the course" there. Day 2 has readable times:
--   g1 09:00-10:00, g2 10:05-11:00  course CG - BACK-TO-BACK (5-min gap): one block
--   g3 12:00-13:00                  course CG - SEPARATE (60-min gap): its own block
--   h1 14:00-15:00, h2 (no start)   course CH - one unreadable time: the whole
--                                   course falls back to one unit
--   k1 15:30-16:30, k2 16:35-17:30  course CK - back-to-back, answered on k2 only
-- All taught by fac@x. Feedback: g1, h1, k2, all in window.
INSERT INTO profiles (id, email, is_super_admin) VALUES
  ('22222222-0000-0000-0000-000000000005','fac@x', false);
INSERT INTO student_attendance (id, attendance_date, timetable_id, institution_id, section_id, attendance_data)
SELECT '44444444-0000-0000-0000-000000000003','2026-09-11','55555555-0000-0000-0000-00000000000a',
       '11111111-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001',
       jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object(
         'course_id', c, 'course_code', code, 'start_time', st, 'end_time', et,
         'assigned_faculty', jsonb_build_object('faculty_email','fac@x'),
         'students', jsonb_build_array(jsonb_build_object('student_id','33333333-0000-0000-0000-000000000001','status','Present')))))
FROM (VALUES
  ('g1','77777777-0000-0000-0000-0000000000d1','CG','09:00','10:00'),
  ('g2','77777777-0000-0000-0000-0000000000d1','CG','10:05','11:00'),
  ('g3','77777777-0000-0000-0000-0000000000d1','CG','12:00','13:00'),
  ('h1','77777777-0000-0000-0000-0000000000d2','CH','14:00','15:00'),
  ('h2','77777777-0000-0000-0000-0000000000d2','CH',NULL,   '15:25'),
  ('k1','77777777-0000-0000-0000-0000000000d3','CK','15:30','16:30'),
  ('k2','77777777-0000-0000-0000-0000000000d3','CK','16:35','17:30')
) v(k, c, code, st, et);
INSERT INTO session_feedback (student_id, attendance_date, timetable_id, period_id, course_id, created_at) VALUES
('33333333-0000-0000-0000-000000000001','2026-09-11','55555555-0000-0000-0000-00000000000a','g1','77777777-0000-0000-0000-0000000000d1','2026-09-11 12:00+05:30'),
('33333333-0000-0000-0000-000000000001','2026-09-11','55555555-0000-0000-0000-00000000000a','h1','77777777-0000-0000-0000-0000000000d2','2026-09-11 16:00+05:30'),
('33333333-0000-0000-0000-000000000001','2026-09-11','55555555-0000-0000-0000-00000000000a','k2','77777777-0000-0000-0000-0000000000d3','2026-09-11 18:00+05:30');

SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001';

-- ===== 1. the predicate's own truth table =====
\echo '--- 1. fn_scf_feedback_matches_mark'
DO $t$
DECLARE cx uuid := '77777777-0000-0000-0000-0000000000c1'; cy uuid := '77777777-0000-0000-0000-0000000000c2';
        blk text[] := ARRAY['p1','p2'];
BEGIN
  IF NOT public.fn_scf_feedback_matches_mark('p1',cx,'p1',cx,blk) THEN RAISE EXCEPTION 'FAIL exact period must match'; END IF;
  IF NOT public.fn_scf_feedback_matches_mark('p1',cx,'p2',cx,blk) THEN RAISE EXCEPTION 'FAIL sibling period in the same block must match'; END IF;
  IF     public.fn_scf_feedback_matches_mark('p1',cx,'p5',cx,ARRAY['p5']) THEN RAISE EXCEPTION 'FAIL same course OUTSIDE the mark''s block must not match (#3963)'; END IF;
  IF     public.fn_scf_feedback_matches_mark('p1',cx,'p3',cy,blk) THEN RAISE EXCEPTION 'FAIL a different course must not match'; END IF;
  IF     public.fn_scf_feedback_matches_mark('p1',cx,'p2',NULL,blk) THEN RAISE EXCEPTION 'FAIL a mark with no course keeps exact-period behaviour'; END IF;
  IF NOT public.fn_scf_feedback_matches_mark('p2',cx,'p2',NULL,ARRAY['p2']) THEN RAISE EXCEPTION 'FAIL a mark with no course still matches its own period'; END IF;
  IF     public.fn_scf_feedback_matches_mark('p1',NULL,'p2',cx,blk) THEN RAISE EXCEPTION 'FAIL feedback with no course must not match a sibling'; END IF;
  IF NOT public.fn_scf_feedback_matches_mark('p1',cx,'p1',cx,NULL) THEN RAISE EXCEPTION 'FAIL a NULL block must not stop the exact-period arm'; END IF;
  RAISE NOTICE 'ok';
END $t$;

\echo '--- 2. fn_scf_uuid_or_null'
DO $t$
BEGIN
  IF public.fn_scf_uuid_or_null('NOT-A-UUID') IS NOT NULL THEN RAISE EXCEPTION 'FAIL malformed must be NULL'; END IF;
  IF public.fn_scf_uuid_or_null('') IS NOT NULL THEN RAISE EXCEPTION 'FAIL empty must be NULL'; END IF;
  IF public.fn_scf_uuid_or_null(NULL) IS NOT NULL THEN RAISE EXCEPTION 'FAIL null must be NULL'; END IF;
  IF public.fn_scf_uuid_or_null('77777777-0000-0000-0000-0000000000c1') IS NULL THEN RAISE EXCEPTION 'FAIL a real uuid must survive'; END IF;
  RAISE NOTICE 'ok';
END $t$;

-- ===== 3. the learner's history badges =====
\echo '--- 3. fn_scf_confirmation_status — per-period verdicts'
SELECT period_id, confirmed FROM public.fn_scf_confirmation_status('2026-09-10','2026-09-10') ORDER BY period_id;
DO $t$
DECLARE r record; got jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT period_id, confirmed FROM public.fn_scf_confirmation_status('2026-09-10','2026-09-10') LOOP
    got := got || jsonb_build_object(r.period_id, r.confirmed);
  END LOOP;

  -- THE FIX: one feedback for the block course confirms BOTH its periods.
  IF coalesce(got->>'p1','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL p1 (the period fed back) must be confirmed'; END IF;
  IF coalesce(got->>'p2','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL p2 (sibling of the block course) must be confirmed — this is the reported defect'; END IF;
  IF coalesce(got->>'p3','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL p3 single-period course must be confirmed'; END IF;

  -- A mark with no course_id keeps exact-period behaviour.
  IF coalesce(got->>'p4','MISSING') <> 'false' THEN RAISE EXCEPTION 'FAIL p4 has no course_id and no feedback of its own'; END IF;

  -- A MALFORMED course_id must neither confirm nor raise 22P02. Reaching this
  -- line at all is the real assertion: a raise would have aborted the call.
  IF coalesce(got->>'p5','MISSING') <> 'false' THEN RAISE EXCEPTION 'FAIL p5 malformed course_id must not confirm'; END IF;
  IF NOT (got ? 'p5')        THEN RAISE EXCEPTION 'FAIL p5 vanished — the malformed row was dropped, not survived'; END IF;

  -- Decision #11: a late feedback confirms nothing, and nor does its sibling.
  IF coalesce(got->>'p6','MISSING') <> 'false' THEN RAISE EXCEPTION 'FAIL p6 late feedback must not confirm'; END IF;
  IF coalesce(got->>'p7','MISSING') <> 'false' THEN RAISE EXCEPTION 'FAIL p7 sibling of a LATE feedback must not confirm'; END IF;

  -- Cross-timetable. The pending list (20270208090000, applied above) has NO
  -- timetable equality, so feedback for q1 recorded under timetable T1
  -- suppresses the q1 item in the pending list. This reader therefore has to confirm it, or the mark would
  -- be neither offered nor confirmable. Assertion 6 proves that invariant on
  -- every mark; this pins the specific row.
  IF coalesce(got->>'q1','MISSING') <> 'true' THEN RAISE EXCEPTION 'FAIL q1 cross-timetable feedback must confirm, as the pending list already assumes'; END IF;

  -- The absent mark is not a confirmable session at all.
  IF got ? 'p8' THEN RAISE EXCEPTION 'FAIL p8 is Absent and must not appear'; END IF;
  RAISE NOTICE 'ok';
END $t$;

-- ===== 4. the learner's own percentage, and its denominator =====
\echo '--- 4. fn_scf_my_confirmed_attendance'
SELECT present_marks, absent_marks, total_marks, confirmed_present FROM public.fn_scf_my_confirmed_attendance('2026-09-10','2026-09-10');
DO $t$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fn_scf_my_confirmed_attendance('2026-09-10','2026-09-10');
  -- DENOMINATOR: 8 Present + 1 Absent, and the fix must never move it.
  IF r.present_marks <> 8 THEN RAISE EXCEPTION 'FAIL present_marks expected 8, got %', r.present_marks; END IF;
  IF r.absent_marks  <> 1 THEN RAISE EXCEPTION 'FAIL absent_marks expected 1, got %', r.absent_marks; END IF;
  IF r.total_marks   <> 9 THEN RAISE EXCEPTION 'FAIL total_marks (DENOMINATOR) expected 9, got %', r.total_marks; END IF;
  -- NUMERATOR: p1, p2, p3 and q1. Without the sibling branch it would be 2;
  -- with the old timetable equality q1 would be excluded and it would be 3.
  IF r.confirmed_present <> 4 THEN RAISE EXCEPTION 'FAIL confirmed_present expected 4 (p1,p2,p3,q1), got %', r.confirmed_present; END IF;
  RAISE NOTICE 'ok';
END $t$;

-- ===== 4b. day 2: back-to-back vs separate classes, in every reader =====
\echo '--- 4b. the block rule (#3963) in the learner readers'
SELECT period_id, confirmed FROM public.fn_scf_confirmation_status('2026-09-11','2026-09-11') ORDER BY period_id;
DO $t$
DECLARE r record; got jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT period_id, confirmed FROM public.fn_scf_confirmation_status('2026-09-11','2026-09-11') LOOP
    got := got || jsonb_build_object(r.period_id, r.confirmed);
  END LOOP;
  IF coalesce(got->>'g1','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL g1 was answered'; END IF;
  IF coalesce(got->>'g2','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL g2 is back-to-back with g1 and must confirm from its answer'; END IF;
  IF coalesce(got->>'g3','MISSING') <> 'false' THEN RAISE EXCEPTION 'FAIL g3 is a SEPARATE class of CG: the pending list still asks for it, so it must not read confirmed'; END IF;
  IF coalesce(got->>'h1','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL h1 was answered'; END IF;
  IF coalesce(got->>'h2','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL h2 has an unreadable time, so CH falls back to one unit and h2 confirms'; END IF;
  IF coalesce(got->>'k1','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL k1 is back-to-back with the answered k2 and must confirm'; END IF;
  IF coalesce(got->>'k2','MISSING') <> 'true'  THEN RAISE EXCEPTION 'FAIL k2 was answered'; END IF;
  SELECT * INTO r FROM public.fn_scf_my_confirmed_attendance('2026-09-11','2026-09-11');
  IF r.total_marks <> 7 OR r.present_marks <> 7 THEN RAISE EXCEPTION 'FAIL day-2 denominator expected 7, got %', r.total_marks; END IF;
  IF r.confirmed_present <> 6 THEN RAISE EXCEPTION 'FAIL day-2 confirmed_present expected 6 (all but g3), got %', r.confirmed_present; END IF;
  RAISE NOTICE 'ok';
END $t$;

\echo '--- 4c. the team member''s completion view'
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000005';
SELECT period_id, present_count, confirmed_count FROM public.fn_scf_faculty_completion('2026-09-11','2026-09-11') ORDER BY period_id;
DO $t$
DECLARE r record; got jsonb := '{}'::jsonb;
BEGIN
  FOR r IN SELECT period_id, present_count, confirmed_count FROM public.fn_scf_faculty_completion('2026-09-11','2026-09-11') LOOP
    IF r.present_count <> 1 THEN RAISE EXCEPTION 'FAIL % present_count expected 1, got %', r.period_id, r.present_count; END IF;
    got := got || jsonb_build_object(r.period_id, r.confirmed_count);
  END LOOP;
  IF got <> '{"g1":1,"g2":1,"g3":0,"h1":1,"h2":1,"k1":1,"k2":1}'::jsonb THEN
    RAISE EXCEPTION 'FAIL faculty completion per period: %', got;
  END IF;
  RAISE NOTICE 'ok';
END $t$;

\echo '--- 4d. the admin at-risk list (coupling switched on for this check only)'
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000009';
CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(p_key text, p_default boolean, p_institution_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT CASE WHEN p_key = 'session_feedback.attendance_coupling_enabled' THEN true ELSE p_default END $$;
DO $t$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.fn_scf_effective_attendance('2026-09-11','2026-09-11');
  IF r.present_marks <> 7 THEN RAISE EXCEPTION 'FAIL effective present_marks expected 7, got %', r.present_marks; END IF;
  IF r.confirmed_present <> 6 THEN RAISE EXCEPTION 'FAIL effective confirmed_present expected 6 (all but g3), got %', r.confirmed_present; END IF;
  SELECT * INTO r FROM public.fn_scf_effective_attendance('2026-09-10','2026-09-10');
  IF r.confirmed_present <> 4 THEN RAISE EXCEPTION 'FAIL effective day-1 confirmed_present expected 4, got %', r.confirmed_present; END IF;
  RAISE NOTICE 'ok';
END $t$;
CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(p_key text, p_default boolean, p_institution_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_default $$;

-- ===== 5. the rollup says the same thing as the predicate =====
\echo '--- 5. fn_scf_confirmation_rollup — two joins, one meaning'
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000009';
SELECT total_present, confirmed FROM public.fn_scf_confirmation_rollup('2026-09-10','2026-09-10',NULL,NULL,NULL,NULL,48);
SELECT total_present, confirmed FROM public.fn_scf_confirmation_rollup('2026-09-11','2026-09-11',NULL,NULL,NULL,NULL,48);
DO $t$
DECLARE r record; v_predicate bigint;
BEGIN
  SELECT * INTO r FROM public.fn_scf_confirmation_rollup('2026-09-10','2026-09-10',NULL,NULL,NULL,NULL,48);
  -- DENOMINATOR: every Present mark across both timetables.
  IF r.total_present <> 8 THEN RAISE EXCEPTION 'FAIL rollup total_present (DENOMINATOR) expected 8, got %', r.total_present; END IF;
  SELECT * INTO r FROM public.fn_scf_confirmation_rollup('2026-09-11','2026-09-11',NULL,NULL,NULL,NULL,48);
  IF r.total_present <> 7 THEN RAISE EXCEPTION 'FAIL rollup day-2 total_present expected 7, got %', r.total_present; END IF;
  IF r.confirmed <> 6 THEN RAISE EXCEPTION 'FAIL rollup day-2 confirmed expected 6 (g3 is a separate class), got %', r.confirmed; END IF;
  SELECT * INTO r FROM public.fn_scf_confirmation_rollup('2026-09-10','2026-09-11',NULL,NULL,NULL,NULL,48);

  -- ANTI-DRIFT: the rollup expresses the rule as two hash joins instead of
  -- calling fn_scf_feedback_matches_mark, for a plan reason. Recompute its
  -- numerator straight from the predicate, at the rollup's own setting
  -- (p_require_same_timetable => false), and require the same answer. If the
  -- two forms ever diverge, this fails.
  SELECT count(*) INTO v_predicate FROM (
    SELECT sa.attendance_date, period.key AS pid,
           public.fn_scf_uuid_or_null(period.value ->> 'course_id') AS cid,
           public.fn_scf_block_period_keys(sa.attendance_data, period.key) AS bkeys,
           (st ->> 'student_id')::uuid AS sid
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) period
    CROSS JOIN LATERAL jsonb_array_elements(public.fn_attendance_slot_students(period.value)) st
    WHERE sa.attendance_date BETWEEN '2026-09-10' AND '2026-09-11' AND st ->> 'status' = 'Present') m
  WHERE EXISTS (
    SELECT 1 FROM public.session_feedback f
    WHERE f.student_id = m.sid AND f.attendance_date = m.attendance_date
      AND public.fn_scf_feedback_matches_mark(f.period_id, f.course_id, m.pid, m.cid, m.bkeys));
  IF r.confirmed <> v_predicate THEN
    RAISE EXCEPTION 'FAIL rollup numerator % disagrees with the shared predicate %', r.confirmed, v_predicate;
  END IF;
  RAISE NOTICE 'ok (rollup confirmed=% matches predicate)', r.confirmed;
END $t$;

-- ===== 6. the invariant, both ways: withheld <=> confirmed =====
\echo '--- 6. the pending list withholds exactly what the confirmation reader confirms'
SET request.jwt.claim.sub = '22222222-0000-0000-0000-000000000001';
DO $t$
DECLARE v_withheld_unconfirmed int; v_offered_confirmed int; v_checked int;
BEGIN
  -- "Withheld" is fn_scf_pending_for_learner's NOT EXISTS clause, copied from
  -- 20270208090000 (the migration this rehearsal applies first), not this
  -- file's predicate - so the two rules are compared, not one with itself.
  -- One deviation, on purpose: its NULLIF(course)::uuid cast is replaced by
  -- fn_scf_uuid_or_null, because p5's malformed course_id makes the pending
  -- list's own cast raise; that is the pending list's issue, not this one's.
  -- In-window feedback only: outside the window decision #11 governs.
  WITH m AS (
    SELECT sa.attendance_date, sa.attendance_data, period.key AS pid, period.value AS pv
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) period
    CROSS JOIN LATERAL jsonb_array_elements(public.fn_attendance_slot_students(period.value)) st
    WHERE sa.attendance_date BETWEEN '2026-09-10' AND '2026-09-11'
      AND st ->> 'status' = 'Present'
      AND (st ->> 'student_id')::uuid = '33333333-0000-0000-0000-000000000001'
  ), j AS (
    SELECT m.pid,
           EXISTS (
             SELECT 1 FROM public.session_feedback f
             WHERE f.student_id = '33333333-0000-0000-0000-000000000001'
               AND f.attendance_date = m.attendance_date
               AND f.created_at <= ((m.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
                                    + make_interval(hours => 48))
               AND (
                 f.period_id = m.pid
                 OR (public.fn_scf_uuid_or_null(m.pv ->> 'course_id') IS NOT NULL
                     AND f.course_id = public.fn_scf_uuid_or_null(m.pv ->> 'course_id')
                     AND f.period_id = ANY (public.fn_scf_block_period_keys(m.attendance_data, m.pid)))
               )) AS withheld,
           cs.confirmed
    FROM m
    JOIN public.fn_scf_confirmation_status('2026-09-10','2026-09-11') cs
      ON cs.period_id = m.pid AND cs.attendance_date = m.attendance_date
  )
  SELECT count(*) FILTER (WHERE withheld AND confirmed IS NOT TRUE),
         count(*) FILTER (WHERE NOT withheld AND confirmed),
         count(*)
    INTO v_withheld_unconfirmed, v_offered_confirmed, v_checked
  FROM j;

  IF v_checked <> 15 THEN RAISE EXCEPTION 'FAIL expected 15 Present marks across both days, compared %', v_checked; END IF;
  IF v_withheld_unconfirmed <> 0 THEN
    RAISE EXCEPTION 'FAIL % mark(s) are withheld by the pending list yet not confirmed', v_withheld_unconfirmed;
  END IF;
  -- The other direction is the one #3963 created: a tick on a class the
  -- learner is still being asked about.
  IF v_offered_confirmed <> 0 THEN
    RAISE EXCEPTION 'FAIL % mark(s) are still offered by the pending list yet read confirmed', v_offered_confirmed;
  END IF;
  RAISE NOTICE 'ok (% marks: none withheld-and-unconfirmed, none offered-and-confirmed)', v_checked;
END $t$;

\echo 'ALL SCENARIOS PASSED'
