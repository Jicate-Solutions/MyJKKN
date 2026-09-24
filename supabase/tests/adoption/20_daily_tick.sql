\set ON_ERROR_STOP on
-- Adoption loop E (2026-09-24, rulings 9 + 10): the daily run asks why and
-- reminds on its own. Fresh database (run.sh rebuilds it before this file).
-- Every limit the Director set is asserted here, including the refusals.

-- ===== seed =====
INSERT INTO institutions (id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','College A');
INSERT INTO custom_roles (id, role_key, role_name) VALUES
  ('10000000-0000-0000-0000-000000000001','super_admin','Super Admin'),
  ('10000000-0000-0000-0000-000000000003','hod','HOD'),
  ('10000000-0000-0000-0000-000000000004','student','Learner');
INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin) VALUES
  ('20000000-0000-0000-0000-000000000001','sa@x','Super Admin','super_admin',NULL,true),
  ('20000000-0000-0000-0000-000000000002','hoda@x','HOD A','hod','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000001','l1@x','Learner 1','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000002','l2@x','Learner 2','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000003','l3@x','Learner 3','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000004','l4@x','Learner 4','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000005','l5@x','Learner 5 (inactive)','student','aaaaaaaa-0000-0000-0000-000000000001',false);
UPDATE profiles SET is_active = false WHERE id = '30000000-0000-0000-0000-000000000005';
UPDATE loop_registry SET owner_email = 'sa@x' WHERE loop_key = 'feature-adoption';
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

\echo '--- the clock row and the cap row landed'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ai_routine_schedules WHERE routine_id='adoption-daily-tick' AND minute_of_day=633 AND enabled) THEN
    RAISE EXCEPTION 'FAIL: schedule row missing'; END IF;
  IF (SELECT (value)::int FROM platform_policies WHERE policy_key='adoption.tick.max_notifications') <> 100 THEN
    RAISE EXCEPTION 'FAIL: cap row missing or not 100 (first-rollout default)'; END IF;
  IF (SELECT value FROM platform_policies WHERE policy_key='adoption.tick.exclude_features') <> '["induction.my_sessions_open"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: exclusion row missing or not seeded with induction.my_sessions_open'; END IF;
END $$;

-- ===== label features as the super admin =====
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('used.thing','Used thing','do the used thing','{student}',NULL,NULL, now() - interval '50 days', true)->>'success' AS r1;
SELECT fn_adoption_register('learner.thing','Learner thing','do the learner thing','{student}',NULL,NULL, now() - interval '40 days', true)->>'success' AS r2;
SELECT fn_adoption_register('busy.thing','Busy thing','do the busy thing','{hod}',NULL,NULL, now() - interval '60 days', true)->>'success' AS r3;
SELECT fn_adoption_register('event.thing','Event thing','do it when it happens','{student}',NULL,NULL, now() - interval '60 days', true, NULL,NULL,NULL,'event')->>'success' AS r4;
SELECT fn_adoption_register('skip.thing','Skip thing','runs by itself','{student}',NULL,NULL, now() - interval '60 days', false, NULL,NULL,NULL,'weekly','a cron job')->>'success' AS r5;
SELECT fn_adoption_register('unwired.thing','Unwired thing','do the unwired thing','{student}',NULL,NULL, now() - interval '60 days', false)->>'success' AS r6;
SELECT fn_adoption_register('new.thing','New thing','do the new thing','{student}',NULL,NULL, now() - interval '3 days', true)->>'success' AS r7;
SELECT fn_adoption_register('retired.thing','Retired thing','do the retired thing','{student}',NULL,NULL, now() - interval '60 days', true)->>'success' AS r8;
UPDATE feature_registry SET status = 'retired' WHERE feature_key = 'retired.thing';
-- Learner 1 did used.thing three days ago; HOD A did busy.thing today.
INSERT INTO feature_usage (user_id, feature_key, day, count) VALUES
  ('30000000-0000-0000-0000-000000000001','used.thing', (now() AT TIME ZONE 'Asia/Kolkata')::date - 3, 1),
  ('20000000-0000-0000-0000-000000000002','busy.thing', (now() AT TIME ZONE 'Asia/Kolkata')::date, 1);

-- ===== who may call what =====
\echo '--- anon: EXPECT every new function refused'
SET ROLE anon;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'SELECT fn_adoption_remind(''used.thing'')',
    'SELECT fn_adoption_daily_tick(true)',
    'SELECT fn_adoption_remind_core(''used.thing'', NULL, true)',
    'SELECT fn_adoption_ask_why_core(''used.thing'', NULL, NULL, true)',
    'SELECT fn_adoption_loop_sender()',
    'SELECT * FROM fn_adoption_reminder_summary()'] LOOP
    BEGIN EXECUTE f; RAISE EXCEPTION 'FAIL: anon ran %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RAISE NOTICE 'anon refused on all six: ok';
END $$;
RESET ROLE;
\echo '--- a signed-in HOD: EXPECT the run, both cores and the reminder refused'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'SELECT fn_adoption_daily_tick(true)',
    'SELECT fn_adoption_remind_core(''used.thing'', NULL, true)',
    'SELECT fn_adoption_ask_why_core(''used.thing'', NULL, NULL, true)',
    'SELECT fn_adoption_remind(''used.thing'', true)'] LOOP
    BEGIN EXECUTE f; RAISE EXCEPTION 'FAIL: hod ran %', f;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RAISE NOTICE 'hod refused on all four: ok';
END $$;
RESET ROLE;
\echo '--- the run refuses any caller with a user id, even with EXECUTE (EXPECT 42501)'
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_daily_tick(true); RAISE EXCEPTION 'FAIL: a signed-in person started the run';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'person refused: ok'; END;
END $$;

-- ===== href: an in-app path only =====
DO $$ BEGIN
  BEGIN UPDATE feature_registry SET href = 'https://evil.example/x' WHERE feature_key='used.thing'; RAISE EXCEPTION 'FAIL: off-site href accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE feature_registry SET href = '//evil.example/x' WHERE feature_key='used.thing'; RAISE EXCEPTION 'FAIL: protocol-relative href accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE feature_registry SET href = '/learners/used-thing?tab=1' WHERE feature_key='used.thing';
  UPDATE feature_registry SET href = NULL WHERE feature_key='used.thing';
  RAISE NOTICE 'href check ok';
END $$;

-- ===== the master switch =====
\echo '--- switch off: EXPECT nothing asked or reminded, by the run or by a call'
UPDATE platform_policies SET value = 'false'::jsonb WHERE policy_key = 'adoption.loop.enabled';
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('used.thing');
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: reminded while off: %', r; END IF;
  r := fn_adoption_daily_tick();
  IF r->>'skipped' IS NULL OR (r->>'asked')::int <> 0 OR (r->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL: run acted while off: %', r; END IF;
  IF (SELECT count(*) FROM notifications) + (SELECT count(*) FROM adoption_reminders) + (SELECT count(*) FROM adoption_asks) <> 0 THEN
    RAISE EXCEPTION 'FAIL: rows written while off'; END IF;
  RAISE NOTICE 'switch off: ok';
END $$;
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

-- ===== features that must never be reminded about =====
\echo '--- event / skipped / unrecorded / new / retired / sign-in: EXPECT all refused, 0 rows'
DO $$ DECLARE k text; r jsonb; BEGIN
  FOREACH k IN ARRAY ARRAY['event.thing','skip.thing','unwired.thing','new.thing','retired.thing','app.login','no.such.thing'] LOOP
    r := fn_adoption_remind(k);
    IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: reminded about %: %', k, r; END IF;
  END LOOP;
  IF (SELECT count(*) FROM adoption_reminders) <> 0 THEN RAISE EXCEPTION 'FAIL: reminder rows written'; END IF;
  RAISE NOTICE 'seven refusals: ok';
END $$;

-- ===== dry run writes nothing, and never names people through the callable =====
\echo '--- used.thing dry run: EXPECT 3 (learners 2-4; learner 1 did it; inactive learner 5 and the super admin never)'
DO $$ DECLARE r jsonb; t jsonb; BEGIN
  r := fn_adoption_remind('used.thing', true);
  IF (r->>'reminded')::int <> 3 OR r ? 'targets' THEN RAISE EXCEPTION 'FAIL dry run: %', r; END IF;
  t := fn_adoption_remind_core('used.thing', NULL, true)->'targets';
  IF t ? '30000000-0000-0000-0000-000000000001' OR t ? '30000000-0000-0000-0000-000000000005'
     OR t ? '20000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'FAIL: wrong people: %', t; END IF;
  IF (SELECT count(*) FROM notifications) + (SELECT count(*) FROM adoption_reminders) <> 0 THEN
    RAISE EXCEPTION 'FAIL: the dry run wrote rows'; END IF;
  RAISE NOTICE 'dry run ok: %', r;
END $$;

-- ===== the daily run: dry, then real, and they agree =====
\echo '--- run 1: learner.thing is at 0 % → its four never-users are asked why; nobody gets a second message'
SELECT set_config('request.jwt.claim.role','',false);
CREATE TEMP TABLE dry AS SELECT fn_adoption_daily_tick(true) AS r;
SELECT r FROM dry;
DO $$ DECLARE d jsonb; w jsonb; BEGIN
  SELECT r INTO d FROM dry;
  IF (SELECT count(*) FROM notifications) <> 0 THEN RAISE EXCEPTION 'FAIL: the dry run wrote notifications'; END IF;
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'run 1: %', w;
  IF (w->>'asked')::int <> (d->>'asked')::int OR (w->>'reminded')::int <> (d->>'reminded')::int THEN
    RAISE EXCEPTION 'FAIL: dry run % / % but the real run % / %', d->>'asked', d->>'reminded', w->>'asked', w->>'reminded'; END IF;
  IF (w->>'asked')::int <> 4 OR (w->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL run 1 counts: %', w; END IF;
  IF (w#>>'{features,used.thing,near_zero}')::boolean OR NOT (w#>>'{features,learner.thing,near_zero}')::boolean
     OR (w#>>'{features,busy.thing,near_zero}')::boolean THEN RAISE EXCEPTION 'FAIL near-zero verdicts: %', w; END IF;
  IF w->'features' ? 'event.thing' OR w->'features' ? 'skip.thing' OR w->'features' ? 'new.thing'
     OR w->'features' ? 'retired.thing' OR w->'features' ? 'unwired.thing' OR w->'features' ? 'app.login' THEN
    RAISE EXCEPTION 'FAIL: the run looked at a feature it must never touch: %', w; END IF;
  IF (SELECT count(*) FROM adoption_asks WHERE feature_key='learner.thing') <> 4 THEN RAISE EXCEPTION 'FAIL: ask rows'; END IF;
  IF EXISTS (SELECT user_id FROM user_notifications GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL: someone got two adoption messages in one run'; END IF;
  IF EXISTS (SELECT 1 FROM user_notifications un JOIN profiles p ON p.id = un.user_id WHERE p.is_super_admin OR NOT p.is_active) THEN
    RAISE EXCEPTION 'FAIL: a super admin or an inactive person was messaged'; END IF;
  IF EXISTS (SELECT 1 FROM user_notifications WHERE user_id = '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: the HOD who uses busy.thing was messaged'; END IF;
END $$;

\echo '--- run 1 again the same day: EXPECT nothing (asked once per feature ever; no reminder the day of a question)'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick();
  IF (w->>'asked')::int <> 0 OR (w->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL same-day rerun: %', w; END IF;
END $$;

\echo '--- run 2, two days later: nothing left to ask; learner.thing (newest) reminds all four never-users, used.thing gets nobody new'
UPDATE adoption_asks SET asked_at = now() - interval '2 days';
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick();
  RAISE NOTICE 'run 2: %', w;
  IF (w->>'asked')::int <> 0 OR (w->>'reminded')::int <> 4 THEN RAISE EXCEPTION 'FAIL run 2 counts: %', w; END IF;
  IF (w#>>'{features,learner.thing,reminded}')::int <> 4 OR (w#>>'{features,used.thing,reminded}')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL run 2 split: %', w; END IF;
END $$;
\echo '--- the reminder is a plain notice: not must-answer, not blocking, sent by the loop owner, no link without an href'
SELECT title, requires_answer, requires_acknowledgment, priority, category, url, metadata->>'kind' AS kind FROM notifications ORDER BY title;
DO $$ DECLARE n record; BEGIN
  SELECT * INTO n FROM notifications WHERE metadata->>'kind' = 'adoption_reminder';
  IF n.requires_answer OR n.requires_acknowledgment OR n.url IS NOT NULL OR n.category <> 'adoption'
     OR n.created_by <> '20000000-0000-0000-0000-000000000001' OR n.expires_at IS NULL THEN
    RAISE EXCEPTION 'FAIL reminder shape: %', n; END IF;
  IF n.body NOT LIKE '%Learner thing%do the learner thing%' THEN RAISE EXCEPTION 'FAIL body: %', n.body; END IF;
END $$;
\echo '--- run 2 again the same day: EXPECT nothing (30-day rule; one reminder per person per day)'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick();
  IF (w->>'asked')::int <> 0 OR (w->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL same-day rerun: %', w; END IF;
END $$;

\echo '--- two days later: the 30-day rule holds per feature (learner.thing 0), a different feature may still remind (used.thing 3)'
UPDATE adoption_reminders SET sent_at = now() - interval '2 days';
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('learner.thing');
  IF (r->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL: reminded inside 30 days: %', r; END IF;
  r := fn_adoption_remind('used.thing');
  IF (r->>'reminded')::int <> 3 THEN RAISE EXCEPTION 'FAIL: used.thing not reminded: %', r; END IF;
END $$;
\echo '--- 31 days later, with a known link: EXPECT used.thing reminded again (3), the notice carries the link, and not twice'
UPDATE adoption_reminders SET sent_at = now() - interval '31 days';
UPDATE feature_registry SET href = '/learners/used-thing' WHERE feature_key = 'used.thing';
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('used.thing');
  IF (r->>'reminded')::int <> 3 OR r ? 'targets' THEN RAISE EXCEPTION 'FAIL: not reminded after 30 days: %', r; END IF;
  IF (SELECT url FROM notifications WHERE id = (r->>'notification_id')::uuid) <> '/learners/used-thing' THEN
    RAISE EXCEPTION 'FAIL: the link is missing'; END IF;
  r := fn_adoption_remind('used.thing');
  IF (r->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL: reminded twice in a row: %', r; END IF;
END $$;

-- ===== the per-run cap =====
\echo '--- cap 2: a new dead feature with 4 never-users: EXPECT exactly 2 messaged, run says capped'
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('cap.thing','Cap thing','do the cap thing','{student}',NULL,NULL, now() - interval '45 days', true)->>'success' AS r9;
-- keep used.thing out of this step: learners 2-4 used it
INSERT INTO feature_usage (user_id, feature_key, day, count)
SELECT id, 'used.thing', (now() AT TIME ZONE 'Asia/Kolkata')::date - 1, 1 FROM profiles
WHERE id IN ('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004');
UPDATE platform_policies SET value = '2'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','',false);
DO $$ DECLARE w jsonb; before int; BEGIN
  SELECT count(*) INTO before FROM user_notifications;
  w := fn_adoption_daily_tick();
  RAISE NOTICE 'capped run: %', w;
  IF (w->>'asked')::int + (w->>'reminded')::int <> 2 OR NOT (w->>'capped')::boolean THEN RAISE EXCEPTION 'FAIL cap: %', w; END IF;
  IF (SELECT count(*) FROM user_notifications) - before <> 2 THEN RAISE EXCEPTION 'FAIL: cap not honoured in rows'; END IF;
END $$;
\echo '--- cap 0: EXPECT nothing'
UPDATE platform_policies SET value = '0'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
DO $$ DECLARE w jsonb; before int; BEGIN
  SELECT count(*) INTO before FROM user_notifications;
  w := fn_adoption_daily_tick();
  IF (SELECT count(*) FROM user_notifications) <> before OR (w->>'asked')::int + (w->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL cap 0: %', w; END IF;
END $$;
UPDATE platform_policies SET value = '100'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';

-- ===== adoption.tick.exclude_features: the run leaves a listed feature alone =====
\echo '--- excluded: a near-zero HOD feature on the list gets no question and no reminder; off the list, it is asked again'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('excl.thing','Excluded thing','do the excluded thing','{hod}',NULL,NULL, now() - interval '30 days', true)->>'success' AS r10;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','',false);
UPDATE platform_policies SET value = '["excl.thing"]'::jsonb WHERE policy_key = 'adoption.tick.exclude_features';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(true);
  IF w->'features' ? 'excl.thing' OR NOT (w->'excluded' ? 'excl.thing') THEN RAISE EXCEPTION 'FAIL: dry run looked at an excluded feature: %', w; END IF;
  w := fn_adoption_daily_tick();
  IF w->'features' ? 'excl.thing' THEN RAISE EXCEPTION 'FAIL: run looked at an excluded feature: %', w; END IF;
  IF EXISTS (SELECT 1 FROM adoption_asks WHERE feature_key = 'excl.thing')
     OR EXISTS (SELECT 1 FROM adoption_reminders WHERE feature_key = 'excl.thing')
     OR EXISTS (SELECT 1 FROM user_notifications WHERE user_id = '20000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: an excluded feature sent something'; END IF;
  RAISE NOTICE 'excluded: nothing sent ok';
END $$;
UPDATE platform_policies SET value = '[]'::jsonb WHERE policy_key = 'adoption.tick.exclude_features';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick();
  IF (w#>>'{features,excl.thing,asked}')::int <> 1 THEN RAISE EXCEPTION 'FAIL: not asked once the exclusion was lifted: %', w; END IF;
  IF (SELECT count(*) FROM adoption_asks WHERE feature_key = 'excl.thing') <> 1 THEN RAISE EXCEPTION 'FAIL: excl.thing ask row'; END IF;
  RAISE NOTICE 'exclusion lifted: asked again ok';
END $$;

-- ===== the button still behaves exactly as before =====
\echo '--- fn_adoption_ask_why as super admin: EXPECT the old answer shape (no person ids)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_ask_why('cap.thing');
  IF r ? 'targets' OR r ? 'dry_run' OR NOT (r ? 'asked') THEN RAISE EXCEPTION 'FAIL ask shape: %', r; END IF;
  RAISE NOTICE 'ask_why shape ok: %', r;
END $$;

-- ===== the page's summary: super admins only =====
\echo '--- summary: super admin sees counts; the HOD sees nothing'
SET ROLE authenticated;
SELECT * FROM fn_adoption_reminder_summary() ORDER BY feature_key;
DO $$ BEGIN
  IF (SELECT sent_count FROM fn_adoption_reminder_summary() WHERE feature_key = 'used.thing') <> 6 THEN
    RAISE EXCEPTION 'FAIL: super admin summary'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM fn_adoption_reminder_summary()) <> 0 THEN RAISE EXCEPTION 'FAIL: the HOD read reminder totals'; END IF;
  IF (SELECT count(*) FROM adoption_reminders) <> 0 THEN RAISE EXCEPTION 'FAIL: the HOD read reminder rows'; END IF;
END $$;
RESET ROLE;
\echo '=== DAILY TICK SCENARIOS PASSED ==='
