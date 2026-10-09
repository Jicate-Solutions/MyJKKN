\set ON_ERROR_STOP on
-- Weekly Power Users report (2026-10-09): fn_adoption_power_users on a fresh
-- database (run.sh rebuilds it), migrations A–E.2 + 20271009115500.
-- The week under test is Monday 2026-09-28 (IST): [2026-09-28 00:00 IST, 2026-10-05 00:00 IST).

-- ===== seed =====
INSERT INTO institutions (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','College A'),
  ('aaaaaaaa-0000-0000-0000-000000000002','College B'),
  ('479eac7f-3e5b-479e-bd91-dee9e0186b9b','Jicate Solutions'),
  ('a33138b6-4eea-4675-941f-1071bf88b127','JKKN College of Arts and Science (Aided)');

-- One event per (module) per call; n copies, all at ts.
CREATE FUNCTION _ev(p_user uuid, p_modules text[], p_ts timestamptz, p_type text DEFAULT 'page_visit',
                    p_n int DEFAULT 1, p_inst uuid DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO usage_events (user_id, event_type, module, institution_id, created_at)
  SELECT p_user, p_type, m, p_inst, p_ts FROM unnest(p_modules) m, generate_series(1, p_n) $$;

INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin, created_at) VALUES
  -- ranked people (College A / B)
  ('50000000-0000-0000-0000-000000000001','p01@x','Person 01','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000002','p02@x','Person 02','principal','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000003','p03@x','Person 03','hod','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000004','p04@x','Person 04','hod','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000005','p05@x','Person 05','hod','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000006','p06@x','Person 06','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000007','p07@x','Person 07','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000008','p08@x','Person 08','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000009','p09@x','Person 09','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000010','p10@x','Person 10','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('50000000-0000-0000-0000-000000000011','p11@x','Person 11','faculty','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  -- heavy users who must never be counted
  ('60000000-0000-0000-0000-000000000001','sa@x','Super Admin Flag','super_admin','aaaaaaaa-0000-0000-0000-000000000001',true,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000002','sa2@x','Super Admin Role Only','super_admin','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000003','saf@x','Principal With Flag','principal','aaaaaaaa-0000-0000-0000-000000000001',true,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000004','j1@x','Jicate Person','hod','479eac7f-3e5b-479e-bd91-dee9e0186b9b',false,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000005','as1@x','Aided Person (college only on events)','hod',NULL,false,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000006','test.hod@x','Some Name','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('60000000-0000-0000-0000-000000000007','tp@x','Test Principal','principal','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  -- one-day team members
  ('70000000-0000-0000-0000-000000000001','od1@x','One Day 1','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000002','od2@x','One Day New Account','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-10-01'),
  ('70000000-0000-0000-0000-000000000003','od3@x','One Day Came Back Later','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000004','od4@x','Two Days','hod','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000005','od5@x','One Day 5','admin','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000006','od6@x','One Day 6','admin','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000007','od7@x','One Day 7','admin','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000008','od8@x','One Day 8','admin','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000009','od9@x','One Day 9','admin','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('70000000-0000-0000-0000-000000000010','odj@x','One Day Jicate','hod','479eac7f-3e5b-479e-bd91-dee9e0186b9b',false,'2026-01-01'),
  -- one-day learners
  ('80000000-0000-0000-0000-000000000001','l1@x','Learner 1','student','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('80000000-0000-0000-0000-000000000002','l2@x','Learner 2','student','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01'),
  ('80000000-0000-0000-0000-000000000003','l3@x','Learner 3','student','aaaaaaaa-0000-0000-0000-000000000002',false,'2026-01-01'),
  ('80000000-0000-0000-0000-000000000004','l4@x','Learner Jicate','student','479eac7f-3e5b-479e-bd91-dee9e0186b9b',false,'2026-01-01'),
  ('80000000-0000-0000-0000-000000000005','l5@x','Learner Two Days','student','aaaaaaaa-0000-0000-0000-000000000001',false,'2026-01-01');

-- Ranked people. P01: 6 features. P03 and P02: 5 features + 3 records, P03 has more
-- events. P04 = P05 exactly (tie -> user_id). P06..P11: 3 features, fewer events each.
SELECT _ev('50000000-0000-0000-0000-000000000001', ARRAY['m1','m2','m3','m4','m5','m6'], '2026-09-29 10:00+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000002', ARRAY['m1','m2','m3','m4','m5'], '2026-09-29 10:00+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000002', ARRAY['m1'], '2026-09-30 10:00+05:30', 'create', 3);
SELECT _ev('50000000-0000-0000-0000-000000000003', ARRAY['m1','m2','m3','m4','m5'], '2026-09-29 10:00+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000003', ARRAY['m1'], '2026-09-30 10:00+05:30', 'update', 3);
SELECT _ev('50000000-0000-0000-0000-000000000003', ARRAY['m2'], '2026-10-01 10:00+05:30', 'page_visit', 5);
SELECT _ev('50000000-0000-0000-0000-000000000004', ARRAY['m1','m2','m3','m4'], '2026-09-29 10:00+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000004', ARRAY['m1'], '2026-09-30 10:00+05:30', 'export', 1);
SELECT _ev('50000000-0000-0000-0000-000000000005', ARRAY['m1','m2','m3','m4'], '2026-09-29 10:00+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000005', ARRAY['m1'], '2026-09-30 10:00+05:30', 'export', 1);
SELECT _ev(('50000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
           ARRAY['m1','m2','m3'], '2026-09-29 10:00+05:30', 'page_visit', 1)
  FROM generate_series(6, 11) i;
-- extra visits so P06 > P07 > ... > P11 on total events (P06 +5 ... P11 +0)
SELECT _ev(('50000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
           ARRAY['m1'], '2026-09-30 10:00+05:30', 'page_visit', 11 - i)
  FROM generate_series(6, 10) i;
-- Day boundary: the Sunday before the week (IST) is out; the last Sunday 23:30 IST is in.
SELECT _ev('50000000-0000-0000-0000-000000000011', ARRAY['zz_before'], '2026-09-27 23:30+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000011', ARRAY['zz_after'], '2026-10-05 00:10+05:30');
SELECT _ev('50000000-0000-0000-0000-000000000001', ARRAY['m1'], '2026-10-04 23:30+05:30');

-- Heavy users who must never appear: 12 features each.
SELECT _ev(u::uuid, ARRAY['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11','h12'], '2026-09-29 10:00+05:30', 'create', 2)
  FROM unnest(ARRAY['60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002',
                    '60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000004',
                    '60000000-0000-0000-0000-000000000006','60000000-0000-0000-0000-000000000007',
                    '90000000-0000-0000-0000-000000000001']) u;  -- the last one has no profile
SELECT _ev('60000000-0000-0000-0000-000000000005', ARRAY['h1','h2','h3','h4','h5','h6','h7','h8','h9','h10','h11','h12'],
           '2026-09-29 10:00+05:30', 'create', 2, 'a33138b6-4eea-4675-941f-1071bf88b127');

-- One-day team members: OD1 two modules on Tuesday; OD5..OD9 one module each.
SELECT _ev('70000000-0000-0000-0000-000000000001', ARRAY['m1','m2'], '2026-09-29 10:00+05:30');
SELECT _ev(('70000000-0000-0000-0000-00000000000' || i)::uuid, ARRAY['m1'], '2026-09-29 11:00+05:30')
  FROM generate_series(5, 9) i;
SELECT _ev('70000000-0000-0000-0000-000000000002', ARRAY['m1'], '2026-10-02 10:00+05:30');  -- account made inside the week
SELECT _ev('70000000-0000-0000-0000-000000000003', ARRAY['m1'], '2026-09-29 10:00+05:30');
SELECT _ev('70000000-0000-0000-0000-000000000003', ARRAY['m1'], '2026-10-07 10:00+05:30');  -- came back after the week
SELECT _ev('70000000-0000-0000-0000-000000000004', ARRAY['m1'], '2026-09-29 10:00+05:30');
SELECT _ev('70000000-0000-0000-0000-000000000004', ARRAY['m1'], '2026-09-30 10:00+05:30');
SELECT _ev('70000000-0000-0000-0000-000000000010', ARRAY['m1'], '2026-09-29 10:00+05:30');
-- One-day learners: two in College A, one in College B, one in Jicate (left out), one on two days.
SELECT _ev(u::uuid, ARRAY['dashboard'], '2026-09-30 09:00+05:30')
  FROM unnest(ARRAY['80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002',
                    '80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000004']) u;
SELECT _ev('80000000-0000-0000-0000-000000000005', ARRAY['dashboard'], '2026-09-30 09:00+05:30');
SELECT _ev('80000000-0000-0000-0000-000000000005', ARRAY['dashboard'], '2026-10-01 09:00+05:30');

\echo '--- the exclusion setting landed with the two colleges'
DO $$ BEGIN
  IF (SELECT value FROM platform_policies WHERE policy_key = 'adoption.power_users.exclude_institution_ids')
     <> '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", "a33138b6-4eea-4675-941f-1071bf88b127"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: exclusion setting missing or wrong'; END IF;
END $$;

\echo '--- top 10: EXPECT P01, P03, P02, P04, P05, P06..P10 in that order; P11 is 11th'
DO $$ DECLARE r jsonb; got text[]; want text[]; BEGIN
  r := fn_adoption_power_users('2026-09-28');
  RAISE NOTICE 'top: %', (SELECT string_agg(t->>'full_name', ', ') FROM jsonb_array_elements(r->'top') t);
  SELECT array_agg(t->>'user_id' ORDER BY o) INTO got FROM jsonb_array_elements(r->'top') WITH ORDINALITY x(t, o);
  want := ARRAY['50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003',
                '50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004',
                '50000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000006',
                '50000000-0000-0000-0000-000000000007','50000000-0000-0000-0000-000000000008',
                '50000000-0000-0000-0000-000000000009','50000000-0000-0000-0000-000000000010'];
  IF got IS DISTINCT FROM want THEN RAISE EXCEPTION 'FAIL: top order %', got; END IF;
  -- P01's Sunday 23:30 IST visit is inside the week: 6 modules, 8 events -> features 6 (m1 repeats).
  IF (r->'top'->0->>'features_used')::int <> 6 OR (r->'top'->0->>'active_days')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: P01 counts %', r->'top'->0; END IF;
  IF (r->'top'->1->>'records_saved')::int <> 3 THEN RAISE EXCEPTION 'FAIL: P03 records %', r->'top'->1; END IF;
  IF (r->'top'->1->>'institution_name') <> 'College B' THEN RAISE EXCEPTION 'FAIL: P03 college %', r->'top'->1; END IF;
  IF jsonb_array_length(r->'top'->0->'modules') <> 6 THEN RAISE EXCEPTION 'FAIL: P01 modules %', r->'top'->0->'modules'; END IF;
END $$;

\echo '--- exclusions: EXPECT no super admin (flag or role), no Jicate / Aided person, no test account, no profile-less usage anywhere'
DO $$ DECLARE r text; u text; BEGIN
  r := fn_adoption_power_users('2026-09-28')::text;
  FOREACH u IN ARRAY ARRAY['60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002',
                           '60000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000004',
                           '60000000-0000-0000-0000-000000000005','60000000-0000-0000-0000-000000000006',
                           '60000000-0000-0000-0000-000000000007','90000000-0000-0000-0000-000000000001',
                           '70000000-0000-0000-0000-000000000010','80000000-0000-0000-0000-000000000004'] LOOP
    IF position(u IN r) > 0 THEN RAISE EXCEPTION 'FAIL: excluded person % is in the report', u; END IF;
  END LOOP;
  IF position('zz_before' IN r) > 0 OR position('zz_after' IN r) > 0 THEN
    RAISE EXCEPTION 'FAIL: an event outside the IST week was counted'; END IF;
END $$;

\echo '--- one-day team members: EXPECT OD1, OD5, OD6, OD7, OD8 (cap 5); never OD2 (new account), OD3 (came back), OD4 (two days)'
DO $$ DECLARE r jsonb; got text[]; BEGIN
  r := fn_adoption_power_users('2026-09-28');
  SELECT array_agg(t->>'user_id' ORDER BY o) INTO got FROM jsonb_array_elements(r->'one_day_staff') WITH ORDINALITY x(t, o);
  IF got IS DISTINCT FROM ARRAY['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000005',
                                '70000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000007',
                                '70000000-0000-0000-0000-000000000008'] THEN
    RAISE EXCEPTION 'FAIL: one-day list %', got; END IF;
END $$;

\echo '--- one-day learners: EXPECT counts only (College A 2, College B 1), no learner id or name anywhere'
DO $$ DECLARE r jsonb; t text; BEGIN
  r := fn_adoption_power_users('2026-09-28');
  IF r->'one_day_learners_by_college' IS DISTINCT FROM
     '[{"institution_id":"aaaaaaaa-0000-0000-0000-000000000001","institution_name":"College A","count":2},
       {"institution_id":"aaaaaaaa-0000-0000-0000-000000000002","institution_name":"College B","count":1}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: learner counts %', r->'one_day_learners_by_college'; END IF;
  t := r::text;
  IF position('80000000-' IN t) > 0 OR position('Learner' IN t) > 0 THEN
    RAISE EXCEPTION 'FAIL: a learner is named in the report'; END IF;
END $$;

\echo '--- NEW badge: EXPECT nobody NEW without last week''s row; with it, only people not in last week''s top'
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_power_users('2026-09-28');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'top') t WHERE (t->>'is_new')::boolean) THEN
    RAISE EXCEPTION 'FAIL: someone NEW with no previous week'; END IF;
  INSERT INTO adoption_power_user_weeks (week_start, payload)
  VALUES ('2026-09-21', '{"top":[{"user_id":"50000000-0000-0000-0000-000000000001"}]}'::jsonb);
  r := fn_adoption_power_users('2026-09-28');
  IF (r->'top'->0->>'is_new')::boolean THEN RAISE EXCEPTION 'FAIL: P01 was in last week''s top'; END IF;
  IF NOT (r->'top'->1->>'is_new')::boolean THEN RAISE EXCEPTION 'FAIL: P03 should be NEW'; END IF;
END $$;

\echo '--- refusals: EXPECT a non-Monday and a switched-off exclusion setting both stop the run'
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_power_users('2026-09-29'); RAISE EXCEPTION 'FAIL: a Tuesday ran';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  UPDATE platform_policies SET is_active = false WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  BEGIN PERFORM fn_adoption_power_users('2026-09-28'); RAISE EXCEPTION 'FAIL: ran with the exclusion setting off';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  UPDATE platform_policies SET is_active = true, value = '["not-a-college"]'::jsonb
   WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  BEGIN PERFORM fn_adoption_power_users('2026-09-28'); RAISE EXCEPTION 'FAIL: ran with a broken exclusion setting';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  UPDATE platform_policies SET value = '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", "a33138b6-4eea-4675-941f-1071bf88b127"]'::jsonb
   WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
END $$;

\echo '--- who may run it and read the store: EXPECT anon and authenticated refused the fn; only a super admin reads the week rows'
DO $$ DECLARE r text; n int; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET ROLE %I', r);
    BEGIN PERFORM fn_adoption_power_users('2026-09-28'); RAISE EXCEPTION 'FAIL: % ran the report', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', false);
  SET ROLE authenticated;
  SELECT count(*) INTO n FROM adoption_power_user_weeks;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a principal read % week rows', n; END IF;
  PERFORM set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', false);
  SET ROLE authenticated;
  SELECT count(*) INTO n FROM adoption_power_user_weeks;
  RESET ROLE;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: the super admin read % week rows', n; END IF;
  SET ROLE anon;
  BEGIN SELECT count(*) INTO n FROM adoption_power_user_weeks; RAISE EXCEPTION 'FAIL: anon read the store';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
END $$;

\echo '--- the seeds: EXPECT one Monday 10:50 managed schedule row and the agenda job type (applied twice, still one of each)'
\ir ../../migrations/20271009115500_adoption_weekly_power_users.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM ai_routine_schedules WHERE routine_id = 'adoption-weekly-power-users'
        AND enabled AND managed AND days_of_week = '{1}' AND minute_of_day = 650) <> 1 THEN
    RAISE EXCEPTION 'FAIL: schedule row'; END IF;
  IF (SELECT count(*) FROM ai_job_types WHERE job_type = 'adoption.chat_agenda'
        AND prompt_template = '{{prompt}}' AND interactive = false AND lane = 'max') <> 1 THEN
    RAISE EXCEPTION 'FAIL: job type row'; END IF;
  IF (SELECT count(*) FROM platform_policies WHERE policy_key = 'adoption.power_users.exclude_institution_ids') <> 1 THEN
    RAISE EXCEPTION 'FAIL: exclusion setting duplicated on re-apply'; END IF;
  IF (SELECT count(*) FROM notifications) <> 0 THEN RAISE EXCEPTION 'FAIL: someone was messaged'; END IF;
END $$;
\echo '=== POWER USERS SCENARIOS PASSED ==='
