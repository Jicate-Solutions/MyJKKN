\set ON_ERROR_STOP on
-- Adoption loop E.2 (2026-10-02): reminders go only to people who signed in lately.
-- Fresh database (run.sh rebuilds it), migrations A–E.2. Director 2026-09-30 "a".

-- ===== seed =====
INSERT INTO institutions (id, name) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','College A');
INSERT INTO custom_roles (id, role_key, role_name) VALUES
  ('10000000-0000-0000-0000-000000000001','super_admin','Super Admin'),
  ('10000000-0000-0000-0000-000000000004','student','Learner');
INSERT INTO profiles (id, email, full_name, role, institution_id, is_super_admin) VALUES
  ('20000000-0000-0000-0000-000000000001','sa@x','Super Admin','super_admin',NULL,true),
  ('30000000-0000-0000-0000-000000000001','l1@x','Signed in 2 days ago','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000002','l2@x','Signed in 15 days ago','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000003','l3@x','Signed in 40 days ago','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000004','l4@x','Never signed in','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000005','l5@x','No login account','student','aaaaaaaa-0000-0000-0000-000000000001',false),
  ('30000000-0000-0000-0000-000000000006','l6@x','Uses it','student','aaaaaaaa-0000-0000-0000-000000000001',false);
UPDATE auth.users SET last_sign_in_at = now() - interval '2 days'  WHERE id = '30000000-0000-0000-0000-000000000001';
UPDATE auth.users SET last_sign_in_at = now() - interval '15 days' WHERE id = '30000000-0000-0000-0000-000000000002';
UPDATE auth.users SET last_sign_in_at = now() - interval '40 days' WHERE id = '30000000-0000-0000-0000-000000000003';
UPDATE auth.users SET last_sign_in_at = NULL                       WHERE id = '30000000-0000-0000-0000-000000000004';
DELETE FROM auth.users WHERE id = '30000000-0000-0000-0000-000000000005';
UPDATE loop_registry SET owner_email = 'sa@x' WHERE loop_key = 'feature-adoption';
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('learner.thing','Learner thing','do the learner thing','{student}',NULL,NULL, now() - interval '60 days', true)->>'success' AS r1;
-- Learner 6 used it today, so the feature is not near-zero: the daily run
-- reminds (rather than asks why), which is the path under test.
INSERT INTO feature_usage (user_id, feature_key, day, count) VALUES
  ('30000000-0000-0000-0000-000000000006','learner.thing', (now() AT TIME ZONE 'Asia/Kolkata')::date, 1);
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','',false);

\echo '--- the setting landed at 30, and its reader returns 30'
DO $$ BEGIN
  IF (SELECT (value)::int FROM platform_policies WHERE policy_key='adoption.remind.signed_in_within_days') <> 30 THEN
    RAISE EXCEPTION 'FAIL: setting row missing or not 30'; END IF;
  IF fn_adoption_remind_signed_in_days() <> 30 THEN RAISE EXCEPTION 'FAIL: reader did not return 30'; END IF;
END $$;

\echo '--- default 30 days: EXPECT only the people who signed in 2 and 15 days ago'
DO $$ DECLARE t jsonb; BEGIN
  t := fn_adoption_remind_core('learner.thing', NULL, true)->'targets';
  RAISE NOTICE 'targets: %', t;
  IF NOT (t ? '30000000-0000-0000-0000-000000000001' AND t ? '30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: a recent sign-in was left out: %', t; END IF;
  IF t ? '30000000-0000-0000-0000-000000000003' OR t ? '30000000-0000-0000-0000-000000000004'
     OR t ? '30000000-0000-0000-0000-000000000005' THEN
    RAISE EXCEPTION 'FAIL: someone without a sign-in in 30 days would be reminded: %', t; END IF;
END $$;

\echo '--- set to 10 days: EXPECT only the person who signed in 2 days ago'
UPDATE platform_policies SET value = to_jsonb(10) WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ DECLARE t jsonb; BEGIN
  t := fn_adoption_remind_core('learner.thing', NULL, true)->'targets';
  IF jsonb_array_length(t) <> 1 OR NOT t ? '30000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'FAIL: 10-day window wrong: %', t; END IF;
END $$;

\echo '--- set to 0: EXPECT the filter off (all five never-users, as before this change)'
UPDATE platform_policies SET value = to_jsonb(0) WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ DECLARE t jsonb; BEGIN
  t := fn_adoption_remind_core('learner.thing', NULL, true)->'targets';
  IF jsonb_array_length(t) <> 5 THEN RAISE EXCEPTION 'FAIL: 0 should mean no sign-in filter: %', t; END IF;
END $$;

\echo '--- broken setting (text, switched off, deleted): EXPECT it fails closed to 30'
UPDATE platform_policies SET value = '"thirty"'::jsonb WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ BEGIN IF fn_adoption_remind_signed_in_days() <> 30 THEN RAISE EXCEPTION 'FAIL: text value not read as 30'; END IF; END $$;
UPDATE platform_policies SET value = to_jsonb(-5) WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ BEGIN IF fn_adoption_remind_signed_in_days() <> 30 THEN RAISE EXCEPTION 'FAIL: negative value not read as 30'; END IF; END $$;
UPDATE platform_policies SET value = to_jsonb(0), is_active = false WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ BEGIN IF fn_adoption_remind_signed_in_days() <> 30 THEN RAISE EXCEPTION 'FAIL: a switched-off row was obeyed'; END IF; END $$;
DELETE FROM platform_policies WHERE policy_key = 'adoption.remind.signed_in_within_days';
DO $$ DECLARE t jsonb; BEGIN
  IF fn_adoption_remind_signed_in_days() <> 30 THEN RAISE EXCEPTION 'FAIL: missing row not read as 30'; END IF;
  t := fn_adoption_remind_core('learner.thing', NULL, true)->'targets';
  IF jsonb_array_length(t) <> 2 THEN RAISE EXCEPTION 'FAIL: missing row did not fall back to 30 days: %', t; END IF;
END $$;

\echo '--- the daily run, for real: EXPECT 2 reminded, nobody without a recent sign-in'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'run: %', w;
  IF (SELECT count(*) FROM adoption_reminders) <> 2 THEN RAISE EXCEPTION 'FAIL: expected 2 reminders: %', w; END IF;
  IF EXISTS (SELECT 1 FROM adoption_reminders WHERE user_id IN (
      '30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005')) THEN
    RAISE EXCEPTION 'FAIL: the run reminded someone without a recent sign-in'; END IF;
END $$;

\echo '--- who may call the reader: EXPECT anon and authenticated refused'
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET ROLE %I', r);
    BEGIN PERFORM fn_adoption_remind_signed_in_days(); RAISE EXCEPTION 'FAIL: % ran the reader', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
END $$;
\echo '=== REMIND SIGNED-IN SCENARIOS PASSED ==='
