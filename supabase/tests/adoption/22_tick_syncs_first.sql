\set ON_ERROR_STOP on
-- Adoption loop E.1 (2026-09-27): the daily run copies usage in before it reads it.
-- Fresh database (run.sh rebuilds it before this file), migrations A–E + E.1.
-- On production the copy had last run four days before the first daily run, so
-- the run reminded people who had just done the thing for the first time.

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
  ('30000000-0000-0000-0000-000000000002','l2@x','Learner 2','student','aaaaaaaa-0000-0000-0000-000000000001',false);
UPDATE loop_registry SET owner_email = 'sa@x' WHERE loop_key = 'feature-adoption';
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('bridged.thing','Bridged thing','do the bridged thing','{student}',NULL,NULL, now() - interval '60 days', true)->>'success' AS r1;
-- counted from the usage log; last copied yesterday (fresh)
UPDATE feature_registry
SET usage_event_module = 'portal', usage_event_feature = 'thing', usage_synced_at = now() - interval '1 day'
WHERE feature_key = 'bridged.thing';
-- Learner 1 did the thing for the first time today; only the log knows.
INSERT INTO usage_events (user_id, event_type, module, feature, role, institution_id)
VALUES ('30000000-0000-0000-0000-000000000001','action','portal','thing','student','aaaaaaaa-0000-0000-0000-000000000001');

-- ===== who may call what =====
\echo '--- the copy core and the send half: EXPECT refused to authenticated and service_role'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE r text; f text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('SET ROLE %I', r);
    FOREACH f IN ARRAY ARRAY['SELECT fn_adoption_sync_usage_events_core(30)', 'SELECT fn_adoption_daily_tick_send(true)'] LOOP
      BEGIN EXECUTE f; RAISE EXCEPTION 'FAIL: % ran %', r, f;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END LOOP;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'core and send half refused to all three: ok';
END $$;
\echo '--- the Sync button: EXPECT a HOD refused'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM fn_adoption_sync_usage_events(30); RAISE EXCEPTION 'FAIL: a HOD ran the Sync button';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'hod refused: ok'; END;
END $$;
RESET ROLE;

-- ===== dry run: copies nothing =====
\echo '--- dry run: EXPECT no copy, synced time unchanged, and Learner 1 still looks like a never-user'
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','',false);
CREATE TEMP TABLE before AS SELECT usage_synced_at AS t FROM feature_registry WHERE feature_key = 'bridged.thing';
DO $$ DECLARE d jsonb; BEGIN
  d := fn_adoption_daily_tick(true);
  RAISE NOTICE 'dry: %', d;
  IF d#>>'{usage_sync,skipped}' IS NULL THEN RAISE EXCEPTION 'FAIL: dry run did not say it skipped the copy: %', d; END IF;
  IF EXISTS (SELECT 1 FROM feature_usage WHERE feature_key = 'bridged.thing') THEN RAISE EXCEPTION 'FAIL: the dry run copied usage'; END IF;
  IF (SELECT usage_synced_at FROM feature_registry WHERE feature_key = 'bridged.thing') <> (SELECT t FROM before) THEN
    RAISE EXCEPTION 'FAIL: the dry run moved usage_synced_at'; END IF;
  IF NOT (fn_adoption_remind_core('bridged.thing', NULL, true)->'targets') ? '30000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'FAIL: setup — before a copy Learner 1 should look like a never-user'; END IF;
  IF (SELECT count(*) FROM adoption_reminders) + (SELECT count(*) FROM notifications) <> 0 THEN
    RAISE EXCEPTION 'FAIL: the dry run wrote rows'; END IF;
END $$;

-- ===== real run: copies first, then reminds only the real never-user =====
\echo '--- real run: EXPECT the copy lands, Learner 1 is NOT reminded, Learner 2 is'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'real: %', w;
  IF NOT COALESCE((w#>>'{usage_sync,success}')::boolean, false) THEN RAISE EXCEPTION 'FAIL: the copy did not succeed: %', w; END IF;
  IF NOT (w->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: the run failed: %', w; END IF;
  IF NOT EXISTS (SELECT 1 FROM feature_usage WHERE feature_key = 'bridged.thing' AND user_id = '30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: Learner 1''s use was not copied'; END IF;
  IF (SELECT usage_synced_at FROM feature_registry WHERE feature_key = 'bridged.thing') <= (SELECT t FROM before) THEN
    RAISE EXCEPTION 'FAIL: usage_synced_at did not move'; END IF;
  IF EXISTS (SELECT 1 FROM adoption_reminders WHERE user_id = '30000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: Learner 1 was reminded about a thing they did today'; END IF;
  IF NOT EXISTS (SELECT 1 FROM adoption_reminders WHERE user_id = '30000000-0000-0000-0000-000000000002' AND feature_key = 'bridged.thing') THEN
    RAISE EXCEPTION 'FAIL: Learner 2 (never did it) was not reminded: %', w; END IF;
END $$;

-- ===== the copy fails, data still fresh: the run still sends =====
\echo '--- copy fails, last good copy fresh: EXPECT the failure reported and the run still reminds Learner 3'
INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin) VALUES
  ('30000000-0000-0000-0000-000000000003','l3@x','Learner 3','student','aaaaaaaa-0000-0000-0000-000000000001',false);
ALTER TABLE usage_events RENAME TO usage_events_gone;
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'copy failed, fresh: %', w;
  IF COALESCE((w#>>'{usage_sync,success}')::boolean, true) OR w#>>'{usage_sync,error}' IS NULL THEN
    RAISE EXCEPTION 'FAIL: the failed copy was not reported: %', w; END IF;
  IF NOT (w->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: a failed copy failed the whole run: %', w; END IF;
  IF NOT EXISTS (SELECT 1 FROM adoption_reminders WHERE user_id = '30000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL: the run stopped sending because the copy failed: %', w; END IF;
END $$;

-- ===== the copy fails, data stale: the stale guard holds =====
\echo '--- copy fails, last good copy 8 days old: EXPECT nobody reminded about the feature'
INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin) VALUES
  ('30000000-0000-0000-0000-000000000004','l4@x','Learner 4','student','aaaaaaaa-0000-0000-0000-000000000001',false);
UPDATE feature_registry SET usage_synced_at = now() - interval '8 days' WHERE feature_key = 'bridged.thing';
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'copy failed, stale: %', w;
  IF EXISTS (SELECT 1 FROM adoption_reminders WHERE user_id = '30000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL: reminded from an 8-day-old copy: %', w; END IF;
END $$;
ALTER TABLE usage_events_gone RENAME TO usage_events;

-- ===== loop off: no copy, no send =====
\echo '--- loop off: EXPECT no copy and nothing sent'
UPDATE platform_policies SET value = 'false'::jsonb WHERE policy_key = 'adoption.loop.enabled';
INSERT INTO usage_events (user_id, event_type, module, feature, role, institution_id)
VALUES ('30000000-0000-0000-0000-000000000004','action','portal','thing','student','aaaaaaaa-0000-0000-0000-000000000001');
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'loop off: %', w;
  IF w#>>'{usage_sync,skipped}' IS NULL THEN RAISE EXCEPTION 'FAIL: loop off but the copy ran: %', w; END IF;
  IF EXISTS (SELECT 1 FROM feature_usage WHERE user_id = '30000000-0000-0000-0000-000000000004') THEN
    RAISE EXCEPTION 'FAIL: loop off but usage was copied'; END IF;
  IF COALESCE((w->>'reminded')::int, 0) + COALESCE((w->>'asked')::int, 0) <> 0 THEN RAISE EXCEPTION 'FAIL: loop off but it sent: %', w; END IF;
END $$;
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

-- ===== the Sync button still works for a super admin =====
\echo '--- Sync button as super admin: EXPECT success, Learner 4 copied'
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
DO $$ DECLARE s jsonb; BEGIN
  s := fn_adoption_sync_usage_events(30);
  IF NOT (s->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: Sync button: %', s; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM feature_usage WHERE user_id = '30000000-0000-0000-0000-000000000004' AND feature_key = 'bridged.thing') THEN
    RAISE EXCEPTION 'FAIL: the Sync button did not copy'; END IF;
END $$;
\echo '=== TICK SYNCS FIRST SCENARIOS PASSED ==='
