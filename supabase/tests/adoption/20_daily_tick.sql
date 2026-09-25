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
  IF (SELECT value FROM platform_policies WHERE policy_key='adoption.tick.exclude_features') <> '["induction.my_sessions_open", "guide.open", "learners.create_profile"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: exclusion row missing or not seeded with induction + guide + learner-profile creation'; END IF;
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
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('used.thing');   -- as the super admin
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: reminded while off: %', r; END IF;
  PERFORM set_config('request.jwt.claim.sub','',false);   -- now the scheduler
  r := fn_adoption_daily_tick();
  IF r->>'skipped' IS NULL OR (r->>'asked')::int <> 0 OR (r->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL: run acted while off: %', r; END IF;
  IF (SELECT count(*) FROM notifications) + (SELECT count(*) FROM adoption_reminders) + (SELECT count(*) FROM adoption_asks) <> 0 THEN
    RAISE EXCEPTION 'FAIL: rows written while off'; END IF;
  RAISE NOTICE 'switch off: ok';
END $$;
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);

\echo '--- the service role cannot call the reminder directly (the daily run goes through the core, under the day cap)'
SET ROLE service_role;
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_remind('used.thing', true); RAISE EXCEPTION 'FAIL: service role called fn_adoption_remind';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'service role refused: ok'; END;
END $$;
RESET ROLE;

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
SELECT set_config('request.jwt.claim.sub','',false);
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
  -- recording history is short (bridged usage starts 23 Aug 2026): never claim "never"
  IF n.body ILIKE '%never%' OR n.body NOT LIKE '%recently%' THEN RAISE EXCEPTION 'FAIL wording: %', n.body; END IF;
END $$;
\echo '--- run 2 again the same day: EXPECT nothing (30-day rule; one reminder per person per day)'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick();
  IF (w->>'asked')::int <> 0 OR (w->>'reminded')::int <> 0 THEN RAISE EXCEPTION 'FAIL same-day rerun: %', w; END IF;
END $$;

\echo '--- two days later: the 30-day rule holds per feature (learner.thing 0), a different feature may still remind (used.thing 3)'
UPDATE adoption_reminders SET sent_at = now() - interval '2 days';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
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

-- ===== review 2: fair order and the IST calendar day =====
\echo '--- fair order: EXPECT the person reminded LONGEST ago goes first, not the lowest id'
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
UPDATE adoption_reminders SET sent_at = now() - interval '35 days';
DO $$ DECLARE r jsonb; x uuid; BEGIN
  SELECT user_id INTO x FROM adoption_reminders WHERE feature_key = 'used.thing' ORDER BY user_id DESC LIMIT 1;
  UPDATE adoption_reminders SET sent_at = now() - interval '60 days' WHERE feature_key = 'used.thing' AND user_id = x;
  r := fn_adoption_remind_core('used.thing', '20000000-0000-0000-0000-000000000001', true, 1, NULL);
  IF (r->'targets'->>0)::uuid IS DISTINCT FROM x THEN RAISE EXCEPTION 'FAIL fair order: % (expected %)', r, x; END IF;
  RAISE NOTICE 'fair order: ok';
END $$;
\echo '--- IST day: EXPECT someone messaged just after IST midnight is not messaged again the same IST day'
DO $$ DECLARE r jsonb; x uuid; n uuid; BEGIN
  SELECT user_id INTO x FROM adoption_reminders WHERE feature_key = 'used.thing' ORDER BY user_id DESC LIMIT 1;
  SELECT notification_id INTO n FROM adoption_reminders WHERE notification_id IS NOT NULL LIMIT 1;
  INSERT INTO adoption_reminders (user_id, feature_key, notification_id, sent_at)
  VALUES (x, 'learner.thing',  n, (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') + interval '1 minute');
  r := fn_adoption_remind_core('used.thing', '20000000-0000-0000-0000-000000000001', true, NULL, NULL);
  IF r->'targets' @> to_jsonb(ARRAY[x]) THEN RAISE EXCEPTION 'FAIL IST day: % still eligible: %', x, r; END IF;
  DELETE FROM adoption_reminders WHERE user_id = x AND feature_key = 'learner.thing'
    AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
  r := fn_adoption_remind_core('used.thing', '20000000-0000-0000-0000-000000000001', true, NULL, NULL);
  IF NOT (r->'targets' @> to_jsonb(ARRAY[x])) THEN RAISE EXCEPTION 'FAIL IST day control: % not eligible: %', x, r; END IF;
  RAISE NOTICE 'IST day: ok';
END $$;

-- ===== the per-day cap =====
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
\echo '--- a second run the same day with cap 2: EXPECT 0 more (2 in total for the day), though people are still eligible'
DO $$ DECLARE w jsonb; before int; d jsonb; BEGIN
  -- control: with the day's budget ignored, someone would still be messaged
  d := fn_adoption_ask_why_core('cap.thing', NULL, NULL, true);
  IF (d->>'asked')::int = 0 THEN RAISE EXCEPTION 'FAIL: control — nobody left to ask, the test proves nothing'; END IF;
  SELECT count(*) INTO before FROM user_notifications;
  w := fn_adoption_daily_tick();
  RAISE NOTICE 'second run same day: %', w;
  IF (w->>'asked')::int + (w->>'reminded')::int <> 0 OR (w->>'day_left')::int <> 0 OR NOT (w->>'capped')::boolean THEN
    RAISE EXCEPTION 'FAIL: the day cap was not carried across runs: %', w; END IF;
  IF (SELECT count(*) FROM user_notifications) <> before THEN RAISE EXCEPTION 'FAIL: rows written past the day cap'; END IF;
  IF (SELECT count(*) FROM adoption_asks WHERE asked_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
   + (SELECT count(*) FROM adoption_reminders WHERE sent_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') <> 2 THEN
    RAISE EXCEPTION 'FAIL: more than 2 adoption messages today'; END IF;
END $$;
\echo '--- and a super admin''s reminder that day is refused too (no call exceeds what is left of the day)'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('learner.thing');
  IF (r->>'success')::boolean OR r->>'error' NOT LIKE '%limit%used up%' THEN RAISE EXCEPTION 'FAIL: reminder past the day cap: %', r; END IF;
  UPDATE platform_policies SET value = '3'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
  r := fn_adoption_remind('learner.thing', true);
  IF (r->>'reminded')::int > 1 THEN RAISE EXCEPTION 'FAIL: a single call went past the one left today: %', r; END IF;
  UPDATE platform_policies SET value = '2'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
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

\echo '--- a super admin cannot remind about an excluded feature either'
UPDATE platform_policies SET value = '["used.thing"]'::jsonb WHERE policy_key = 'adoption.tick.exclude_features';
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r jsonb; BEGIN
  r := fn_adoption_remind('used.thing', true);
  IF (r->>'success')::boolean OR r->>'error' NOT LIKE '%exclusion list%' THEN RAISE EXCEPTION 'FAIL: reminded about an excluded feature: %', r; END IF;
END $$;
UPDATE platform_policies SET value = '[]'::jsonb WHERE policy_key = 'adoption.tick.exclude_features';

-- ===== the exclusion list fails CLOSED =====
\echo '--- exclusion row not a list / non-text entry / switched off / missing: EXPECT the run sends nothing and says why'
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
DO $$ DECLARE w jsonb; before int; bad jsonb; r jsonb; BEGIN
  PERFORM set_config('request.jwt.claim.sub','',false);
  -- control: with a readable list, this run would send something
  w := fn_adoption_daily_tick(true);
  IF (w->>'asked')::int + (w->>'reminded')::int = 0 THEN RAISE EXCEPTION 'FAIL: control — nothing to send, the test proves nothing: %', w; END IF;
  SELECT count(*) INTO before FROM user_notifications;
  FOREACH bad IN ARRAY ARRAY['"induction.my_sessions_open"'::jsonb, '["ok.thing", 5]'::jsonb, '{"a":1}'::jsonb] LOOP
    UPDATE platform_policies SET value = bad WHERE policy_key = 'adoption.tick.exclude_features';
    w := fn_adoption_daily_tick();
    IF (w->>'success')::boolean OR w->>'error' NOT LIKE '%exclusion list%' THEN RAISE EXCEPTION 'FAIL: ran with an unreadable list %: %', bad, w; END IF;
  END LOOP;
  UPDATE platform_policies SET value = '[]'::jsonb, is_active = false WHERE policy_key = 'adoption.tick.exclude_features';
  w := fn_adoption_daily_tick();
  IF (w->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: ran with the list switched off: %', w; END IF;
  PERFORM set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
  r := fn_adoption_remind('learner.thing', true);
  IF (r->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: a super admin reminded with the list switched off: %', r; END IF;
  PERFORM set_config('request.jwt.claim.sub','',false);
  DELETE FROM platform_policies WHERE policy_key = 'adoption.tick.exclude_features';
  w := fn_adoption_daily_tick();
  IF (w->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: ran with the list missing: %', w; END IF;
  IF (SELECT count(*) FROM user_notifications) <> before THEN RAISE EXCEPTION 'FAIL: something was sent with an unreadable list'; END IF;
  RAISE NOTICE 'fail closed: ok';
END $$;
INSERT INTO platform_policies (policy_key, scope_type, value, data_type, is_active)
VALUES ('adoption.tick.exclude_features', 'global', '[]'::jsonb, 'array', true);

-- ===== review 5: fair order ACROSS features =====
-- Two features only (the rest retired inside a rolled-back transaction). learner 1 used
-- both, so neither is near-zero (no questions); learners 2-4 are never-users of both.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('old.thing','Old thing','do the old thing','{student}',NULL,NULL, now() - interval '60 days', true)->>'success' AS ro;
SELECT fn_adoption_register('big.thing','Big thing','do the big thing','{student}',NULL,NULL, now() - interval '20 days', true)->>'success' AS rbg;
INSERT INTO feature_usage (user_id, feature_key, day, count) VALUES
  ('30000000-0000-0000-0000-000000000001','old.thing',(now() AT TIME ZONE 'Asia/Kolkata')::date - 1,1),
  ('30000000-0000-0000-0000-000000000001','big.thing',(now() AT TIME ZONE 'Asia/Kolkata')::date - 1,1);
\echo '--- share: budget 2, newest feature has the bigger backlog: EXPECT each feature reminds 1, not newest 2'
BEGIN;
UPDATE feature_registry SET status = 'retired' WHERE feature_key NOT IN ('old.thing','big.thing','app.login');
UPDATE adoption_asks SET asked_at = now() - interval '40 days';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
UPDATE platform_policies SET value = '2'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(true);
  IF (w->'features'->'old.thing'->>'reminded')::int <> 1 OR (w->'features'->'big.thing'->>'reminded')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL fair share across features: %', w->'features'; END IF;
  RAISE NOTICE 'share across features: ok';
END $$;
\echo '--- first before repeat: budget 1, the newest feature has only repeat-due people, an older one a first-timer: EXPECT the first-timer'
INSERT INTO adoption_reminders (user_id, feature_key, notification_id, sent_at)
SELECT u, 'big.thing', (SELECT notification_id FROM adoption_reminders WHERE notification_id IS NOT NULL LIMIT 1), now() - interval '31 days'
FROM unnest(ARRAY['30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004']::uuid[]) u;
UPDATE platform_policies SET value = '1'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(true);
  IF (w->'features'->'old.thing'->>'reminded')::int <> 1 OR COALESCE((w->'features'->'big.thing'->>'reminded')::int, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL first before repeat: %', w->'features'; END IF;
  RAISE NOTICE 'first before repeat: ok';
END $$;
ROLLBACK;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
UPDATE feature_registry SET status = 'retired' WHERE feature_key IN ('old.thing','big.thing');

-- ===== review 3: the button shares the day's budget and the one-message-a-day rule =====
\echo '--- button with the day budget spent: EXPECT refused, nothing sent'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
UPDATE platform_policies SET value = '0'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
DO $$ DECLARE r jsonb; n0 int; BEGIN
  SELECT count(*) INTO n0 FROM adoption_asks;
  r := fn_adoption_ask_why('cap.thing');
  IF (r->>'success')::boolean IS NOT FALSE OR r->>'error' NOT ILIKE '%budget%' THEN RAISE EXCEPTION 'FAIL button over budget: %', r; END IF;
  IF (SELECT count(*) FROM adoption_asks) <> n0 THEN RAISE EXCEPTION 'FAIL button over budget wrote asks'; END IF;
  RAISE NOTICE 'button budget: ok';
END $$;
UPDATE platform_policies SET value = '100'::jsonb WHERE policy_key = 'adoption.tick.max_notifications';
UPDATE adoption_asks SET asked_at = now() - interval '10 days';
UPDATE adoption_reminders SET sent_at = now() - interval '40 days';
\echo '--- someone reminded today is not asked why the same IST day, by the button or the run'
SELECT fn_adoption_register('button.thing','Button thing','do the button thing','{student}',NULL,NULL, now() - interval '45 days', true)->>'success' AS rb;
DO $$ DECLARE r jsonb; x uuid; n uuid; BEGIN
  r := fn_adoption_ask_why_core('button.thing', NULL, '20000000-0000-0000-0000-000000000001', true, NULL, '{}'::uuid[]);
  x := (r->'targets'->>0)::uuid;
  IF x IS NULL THEN RAISE EXCEPTION 'FAIL setup: nobody left to ask on button.thing: %', r; END IF;
  SELECT notification_id INTO n FROM adoption_reminders WHERE notification_id IS NOT NULL LIMIT 1;
  INSERT INTO adoption_reminders (user_id, feature_key, notification_id, sent_at) VALUES (x, 'used.thing', n, now());
  r := fn_adoption_ask_why_core('button.thing', NULL, '20000000-0000-0000-0000-000000000001', true, NULL, '{}'::uuid[]);
  IF r->'targets' @> to_jsonb(ARRAY[x]) THEN RAISE EXCEPTION 'FAIL: reminded today but still asked: %', r; END IF;
  DELETE FROM adoption_reminders WHERE user_id = x AND sent_at > now() - interval '1 minute';
  RAISE NOTICE 'same-day ask: ok';
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
