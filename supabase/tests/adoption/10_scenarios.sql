\set ON_ERROR_STOP on
-- ===== seed =====
INSERT INTO institutions (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','College A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','College B');
INSERT INTO custom_roles (id, role_key, role_name) VALUES
  ('10000000-0000-0000-0000-000000000001','super_admin','Super Admin'),
  ('10000000-0000-0000-0000-000000000002','principal','Principal'),
  ('10000000-0000-0000-0000-000000000003','hod','HOD'),
  ('10000000-0000-0000-0000-000000000004','student','Learner');
INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin) VALUES
  ('20000000-0000-0000-0000-000000000001','sa@x','Super Admin','super_admin',NULL,true),
  ('20000000-0000-0000-0000-000000000002','hoda@x','HOD A','hod','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('20000000-0000-0000-0000-000000000003','princa@x','Principal A','principal','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('20000000-0000-0000-0000-000000000004','princb@x','Principal B','faculty','bbbbbbbb-0000-0000-0000-000000000002',false),
  ('20000000-0000-0000-0000-000000000005','stua1@x','Learner A1','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('20000000-0000-0000-0000-000000000006','stua2@x','Learner A2','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('20000000-0000-0000-0000-000000000007','stub@x','Learner B','student','bbbbbbbb-0000-0000-0000-000000000002',false),
  ('20000000-0000-0000-0000-000000000008','sa2@x','Other Super Admin','super_admin',NULL,true);
-- Principal B holds the role ONLY through user_roles (multi-role path), profile says faculty.
INSERT INTO user_roles (user_id, role_id) VALUES
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002');

\echo '--- permission grant (migration A §6) landed on principal + super_admin'
SELECT role_key, permissions->>'adoption.view' AS adoption_view FROM custom_roles ORDER BY role_key;
\echo '--- loop row + app.login seed'
SELECT loop_key, loop_class FROM loop_registry; SELECT feature_key, intended_roles FROM feature_registry;

\echo '--- policy off by default: EXPECT the switch row false, and recording refused'
SELECT policy_key, value FROM platform_policies WHERE policy_key='adoption.loop.enabled';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN IF fn_feature_used('app.login') THEN RAISE EXCEPTION 'FAIL: recorded while the loop is off'; END IF;
  IF (SELECT count(*) FROM feature_usage) <> 0 THEN RAISE EXCEPTION 'FAIL: rows while off'; END IF; END $$;
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key='adoption.loop.enabled';

-- ===== as super admin: label features (wired = something records the key) =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT fn_adoption_register('bug_reports.submit','Report a bug','report a problem you hit','{all}','bug_reports',3900, now() - interval '20 days', true);
SELECT fn_adoption_register('hod.thing','HOD thing','do the hod thing','{hod}',NULL,NULL, now() - interval '15 days', true);
SELECT fn_adoption_register('fresh.thing','Fresh thing','do the fresh thing','{all}',NULL,NULL, now(), true);
SELECT fn_adoption_register('unwired.thing','Unwired thing','do the unwired thing','{all}',NULL,NULL, now() - interval '40 days');
SELECT fn_adoption_register('BAD KEY','x','y');
\echo '--- unwired, 40 days old, zero use: EXPECT ask refused (no recording yet)'
SELECT fn_adoption_ask_why('unwired.thing') AS unwired_ask;
DO $$ DECLARE r jsonb; BEGIN r := fn_adoption_ask_why('unwired.thing');
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: asked about an unwired feature'; END IF; END $$;
\echo '--- bridge: a feature measured from the existing usage log'
SELECT fn_adoption_register('attendance.mark','Mark attendance','mark attendance for a class','{hod,faculty}','academic/attendance',NULL, now() - interval '60 days', false, 'academic/attendance','mark_attendance','create');
INSERT INTO usage_events (user_id, event_type, module, feature, institution_id, role, source, created_at) VALUES
  ('20000000-0000-0000-0000-000000000002','create','academic/attendance','mark_attendance','aaaaaaaa-0000-0000-0000-000000000001','hod','explicit', now() - interval '2 days'),
  ('20000000-0000-0000-0000-000000000002','create','academic/attendance','mark_attendance','aaaaaaaa-0000-0000-0000-000000000001','hod','explicit', now() - interval '2 days'),
  ('20000000-0000-0000-0000-000000000002','create','academic/attendance','mark_attendance','aaaaaaaa-0000-0000-0000-000000000001','hod','explicit', now() - interval '1 day'),
  ('20000000-0000-0000-0000-000000000002','page_visit','academic/attendance',NULL,'aaaaaaaa-0000-0000-0000-000000000001','hod','explicit', now()),
  ('20000000-0000-0000-0000-000000000005','create','academic/attendance','mark_attendance','aaaaaaaa-0000-0000-0000-000000000001','student','explicit', now() - interval '5 days');
SELECT fn_adoption_sync_usage_events(30) AS bridge;
SELECT user_id, day, count FROM feature_usage WHERE feature_key='attendance.mark' ORDER BY user_id, day;
DO $$ DECLARE n int; c int; BEGIN
  SELECT count(*), sum(count) INTO n, c FROM feature_usage WHERE feature_key='attendance.mark';
  IF n <> 3 OR c <> 4 THEN RAISE EXCEPTION 'FAIL bridge: % rows, % events (expected 3 rows / 4 events, page_visit ignored)', n, c; END IF;
  PERFORM fn_adoption_sync_usage_events(30);
  SELECT count(*), sum(count) INTO n, c FROM feature_usage WHERE feature_key='attendance.mark';
  IF n <> 3 OR c <> 4 THEN RAISE EXCEPTION 'FAIL bridge not idempotent: % rows, % events', n, c; END IF;
  IF NOT (SELECT usage_wired FROM feature_registry WHERE feature_key='attendance.mark') THEN RAISE EXCEPTION 'FAIL: bridge did not mark wired'; END IF;
END $$;

-- ===== as HOD A: core action twice today =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT fn_feature_used('bug_reports.submit') AS first_use, fn_feature_used('bug_reports.submit') AS second_use, fn_feature_used('not.registered') AS unregistered;
\echo '--- EXPECT one row, count 2'
SELECT user_id, feature_key, day, count, role, institution_id FROM feature_usage;
DO $$ DECLARE n int; c int; BEGIN
  SELECT count(*), max(count) INTO n, c FROM feature_usage WHERE feature_key='bug_reports.submit';
  IF n <> 1 OR c <> 2 THEN RAISE EXCEPTION 'FAIL: expected 1 row count 2, got % rows max %', n, c; END IF;
END $$;
\echo '--- non-admin cannot register / ask / propose (EXPECT 3 refusals)'
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_register('x.y','x','y'); RAISE EXCEPTION 'FAIL: hod registered'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'refused register ok'; END;
  BEGIN PERFORM fn_adoption_ask_why('hod.thing'); RAISE EXCEPTION 'FAIL: hod asked'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'refused ask ok'; END;
  BEGIN PERFORM fn_adoption_propose('hod.thing','retire'); RAISE EXCEPTION 'FAIL: hod proposed'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'refused propose ok'; END;
END $$;

-- ===== as super admin: the three numbers =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- metrics (all): EXPECT bug_reports.submit/all intended 8 weekly 1 ever 1; hod.thing/hod intended 1, 0, 0'
SELECT feature_key, role, intended_count, weekly_active, ever_active, pct_weekly, pct_ever, asked_count, answers FROM fn_adoption_metrics(NULL, NULL);
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM fn_adoption_metrics(NULL,NULL) m WHERE m.feature_key='bug_reports.submit';
  IF r.intended_count <> 8 OR r.weekly_active <> 1 OR r.ever_active <> 1 THEN RAISE EXCEPTION 'FAIL metrics: %', r; END IF;
END $$;

-- ===== ruling 7: names =====
\echo '--- principal A: names for A only (EXPECT 4 rows, all institution A)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT full_name, role, ever_used, total_count FROM fn_adoption_people('bug_reports.submit','aaaaaaaa-0000-0000-0000-000000000001');
DO $$ DECLARE n int; bad int; BEGIN
  SELECT count(*), count(*) FILTER (WHERE institution_id <> 'aaaaaaaa-0000-0000-0000-000000000001') INTO n, bad
  FROM fn_adoption_people('bug_reports.submit','aaaaaaaa-0000-0000-0000-000000000001');
  IF n <> 4 OR bad <> 0 THEN RAISE EXCEPTION 'FAIL people A: % rows, % foreign', n, bad; END IF;
  BEGIN PERFORM fn_adoption_people('bug_reports.submit','bbbbbbbb-0000-0000-0000-000000000002'); RAISE EXCEPTION 'FAIL: principal A saw B';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'principal A refused for B: ok'; END;
END $$;
\echo '--- principal A metrics are confined to A (EXPECT intended 4 for role all)'
SELECT feature_key, role, intended_count FROM fn_adoption_metrics(NULL, 'bbbbbbbb-0000-0000-0000-000000000002') WHERE feature_key='bug_reports.submit';
\echo '--- principal B (role via user_roles only): names for B (EXPECT 2 rows)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000004',false);
SELECT full_name, institution_id FROM fn_adoption_people('bug_reports.submit','bbbbbbbb-0000-0000-0000-000000000002');
\echo '--- learner A1: refused names (EXPECT refusal)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',false);
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_people('bug_reports.submit','aaaaaaaa-0000-0000-0000-000000000001'); RAISE EXCEPTION 'FAIL: learner saw names';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'learner refused: ok'; END;
END $$;

-- ===== rulings 2 + 6: ask why =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- fresh feature: EXPECT younger-than-14-days error'
SELECT fn_adoption_ask_why('fresh.thing');
\echo '--- hod.thing: EXPECT asked 1 (HOD A), then asked 0 on repeat'
SELECT fn_adoption_ask_why('hod.thing') AS first_ask;
SELECT fn_adoption_ask_why('hod.thing') AS repeat_ask;
\echo '--- bug_reports.submit: EXPECT asked 4 = princA, princB, stuA1, stuB, stuA2 minus... (HOD A used it; super admin exempt) -> 5? see assertion'
SELECT fn_adoption_ask_why('bug_reports.submit') AS ask_bug;
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM adoption_asks WHERE feature_key='bug_reports.submit';
  -- intended 'all' minus super admin (exempt) minus HOD A (used it) = 5, minus nobody for the 7-day gap
  -- EXCEPT HOD A was asked about hod.thing seconds ago -> already excluded by usage; so 5.
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL ask count: %', n; END IF;
  IF EXISTS (SELECT 1 FROM adoption_asks a JOIN profiles p ON p.id=a.user_id WHERE p.is_super_admin) THEN RAISE EXCEPTION 'FAIL: super admin asked'; END IF;
END $$;
\echo '--- 7-day gap: label a 3rd old feature; EXPECT asked 0 (everyone was asked this week)'
SELECT fn_adoption_register('old.other','Old other','do the other thing','{all}',NULL,NULL, now() - interval '40 days', true);
SELECT fn_adoption_ask_why('old.other') AS gap_ask;
\echo '--- the notification is a must-answer one (feedback gate shape)'
SELECT title, requires_answer, answer_options, metadata->>'kind' AS kind, category FROM notifications;
SELECT count(*) AS user_notification_rows FROM user_notifications;

-- ===== the answer lands through the gate's own function =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',false);
SELECT fn_notification_answer((SELECT id FROM notifications WHERE metadata->>'feature_key'='bug_reports.submit'), 'Do not need it') AS learner_answer;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000007',false);
SELECT fn_notification_answer((SELECT id FROM notifications WHERE metadata->>'feature_key'='bug_reports.submit'), 'Did not know it exists') AS learner_b_answer;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- metrics now carry answers + asked_count (EXPECT asked 5, answers {Do not need it:1, Did not know it exists:1})'
SELECT feature_key, asked_count, answers FROM fn_adoption_metrics(NULL,NULL) WHERE feature_key='bug_reports.submit';
DO $$ DECLARE a jsonb; BEGIN
  SELECT answers INTO a FROM fn_adoption_metrics(NULL,NULL) m WHERE m.feature_key='bug_reports.submit';
  IF (a->>'Do not need it')::int <> 1 OR (a->>'Did not know it exists')::int <> 1 THEN RAISE EXCEPTION 'FAIL answers: %', a; END IF;
END $$;
\echo '--- ruling 7 on answers: principal A sees ONLY A''s reply (EXPECT {Do not need it:1}, no B reply)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
SELECT feature_key, answers FROM fn_adoption_metrics(NULL,NULL) WHERE feature_key='bug_reports.submit';
DO $$ DECLARE a jsonb; BEGIN
  SELECT answers INTO a FROM fn_adoption_metrics(NULL,NULL) m WHERE m.feature_key='bug_reports.submit';
  IF a ? 'Did not know it exists' THEN RAISE EXCEPTION 'FAIL: principal A saw college B''s reply: %', a; END IF;
  IF (a->>'Do not need it')::int <> 1 THEN RAISE EXCEPTION 'FAIL: principal A missing own college reply: %', a; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);

-- ===== ruling 8: propose / decide =====
\echo '--- propose retire hod.thing: EXPECT proposal id, then "already waiting" on repeat'
SELECT fn_adoption_propose('hod.thing','retire','Nobody did the hod thing in 4 weeks; 1 of 1 said do-not-need', '{"Do not need it":1}');
SELECT fn_adoption_propose('hod.thing','simplify');
SELECT fn_adoption_propose('hod.thing','burn');
\echo '--- decide: a super admin who is NOT the loop owner is refused (EXPECT refusal); owner decides'
UPDATE loop_registry SET owner_email = 'sa@x' WHERE loop_key = 'feature-adoption';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000008',false);
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_decide((SELECT id FROM adoption_proposals WHERE status='pending'), 'retire'); RAISE EXCEPTION 'FAIL: non-owner super admin decided';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'non-owner refused: ok'; END;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- decide retire (as owner): EXPECT status retired, usage recording now returns false'
SELECT fn_adoption_decide((SELECT id FROM adoption_proposals WHERE status='pending'), 'retire');
SELECT feature_key, status FROM feature_registry WHERE feature_key='hod.thing';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SELECT fn_feature_used('hod.thing') AS retired_use;
DO $$ BEGIN IF fn_feature_used('hod.thing') THEN RAISE EXCEPTION 'FAIL: retired feature recorded'; END IF; END $$;

-- ===== ruling 1c: daily sign-ins =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000005',false);
SELECT fn_feature_used('app.login');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000007',false);
SELECT fn_feature_used('app.login');
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- logins today (EXPECT 2 all, 1 for A)'
SELECT * FROM fn_adoption_logins_daily(30, NULL);
SELECT * FROM fn_adoption_logins_daily(30, 'aaaaaaaa-0000-0000-0000-000000000001');
\echo '--- app.login is NOT in the feature table (EXPECT 0)'
SELECT count(*) AS login_rows_in_metrics FROM fn_adoption_metrics(NULL,NULL) WHERE feature_key='app.login';
-- ===== R-A1 / R-A4: term cadence =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
\echo '--- term window with default [6,12] on a September day: EXPECT Jun 1 .. Nov 30'
SELECT * FROM fn_adoption_term_window(DATE '2026-09-18');
DO $$ DECLARE s date; e date; BEGIN
  SELECT term_start, term_end INTO s, e FROM fn_adoption_term_window(DATE '2026-09-18');
  IF s <> DATE '2026-06-01' OR e <> DATE '2026-11-30' THEN RAISE EXCEPTION 'FAIL term window: % .. %', s, e; END IF;
  SELECT term_start, term_end INTO s, e FROM fn_adoption_term_window(DATE '2027-02-10');
  IF s <> DATE '2026-12-01' OR e <> DATE '2027-05-31' THEN RAISE EXCEPTION 'FAIL term window (wrap): % .. %', s, e; END IF;
END $$;
\echo '--- a term-judged feature: metrics carry cadence + this-term share'
SELECT fn_adoption_register('seasonal.thing','Seasonal thing','do the seasonal thing','{hod}',NULL,NULL, now() - interval '60 days', true, NULL, NULL, NULL, 'term');
SELECT fn_adoption_register('bad.cadence','x','y','{hod}',NULL,NULL,NULL,true,NULL,NULL,NULL,'yearly');
SELECT feature_key, cadence, term_active, pct_term, term_start, term_end FROM fn_adoption_metrics(NULL,NULL) WHERE feature_key='seasonal.thing';
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM fn_adoption_metrics(NULL,NULL) m WHERE m.feature_key='seasonal.thing';
  IF r.cadence <> 'term' OR r.term_start IS NULL OR r.term_end IS NULL THEN RAISE EXCEPTION 'FAIL: term columns missing: %', r; END IF;
END $$;
\echo '--- mid-term: EXPECT ask refused (asked only in the last 14 days of the term)'
SELECT fn_adoption_ask_why('seasonal.thing') AS midterm_ask;
DO $$ DECLARE r jsonb; BEGIN r := fn_adoption_ask_why('seasonal.thing');
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: asked mid-term'; END IF; END $$;
\echo '--- 30 days before term end: EXPECT refused; 3 days before: EXPECT allowed (success true)'
DO $$ DECLARE e date; r jsonb; BEGIN
  SELECT term_end INTO e FROM fn_adoption_term_window();
  r := fn_adoption_ask_why('seasonal.thing', e - 30);
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: asked 30 days before term end'; END IF;
  r := fn_adoption_ask_why('seasonal.thing', e - 3);
  IF NOT (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: not asked 3 days before term end: %', r; END IF;
  RAISE NOTICE 'term-end ask ok: %', r;
END $$;
\echo '--- skipped on purpose: registered with a reason, never asked'
SELECT fn_adoption_register('cron.thing','Nightly job','runs by itself','{all}',NULL,NULL, now() - interval '40 days', false, NULL,NULL,NULL,'weekly','a cron job — nobody uses it');
SELECT feature_key, skip_reason FROM fn_adoption_metrics(NULL,NULL) WHERE feature_key='cron.thing';
DO $$ DECLARE r jsonb; BEGIN r := fn_adoption_ask_why('cron.thing');
  IF (r->>'success')::boolean OR r->>'error' NOT LIKE 'this feature is skipped on purpose%' THEN RAISE EXCEPTION 'FAIL skipped ask: %', r; END IF; END $$;
\echo '=== ALL SCENARIOS PASSED ==='
