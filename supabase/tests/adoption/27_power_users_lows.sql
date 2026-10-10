\set ON_ERROR_STOP on
-- Weekly Power Users — #4298 panel LOW follow-ups (migration 20271010120000), on a
-- fresh database (run.sh rebuilds it) with migrations A–E.2 + 20271009115500 +
-- 20271010120000 applied in that order.

\echo '--- LOW 1: EXPECT the exclusion check gives the seeded list, and refuses every list the report function refuses'
DO $$ DECLARE bad jsonb; ok_report boolean; ok_check boolean; BEGIN
  IF fn_adoption_power_users_exclusions()
     IS DISTINCT FROM '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", "a33138b6-4eea-4675-941f-1071bf88b127"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: exclusion check returned %', fn_adoption_power_users_exclusions(); END IF;
  -- the same bad lists 25_power_users.sql feeds the report function: both must refuse each one
  FOREACH bad IN ARRAY ARRAY['["not-a-college"]', '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", null]', '[null]',
                             '["479eac7f-3e5b-479e-bd91-dee9e0186b9b", 42]', '{"a": 1}', '"x"']::jsonb[] LOOP
    UPDATE platform_policies SET value = bad WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
    BEGIN PERFORM fn_adoption_power_users_exclusions(); ok_check := true;
    EXCEPTION WHEN raise_exception THEN ok_check := false; END;
    BEGIN PERFORM fn_adoption_power_users('2026-09-28'); ok_report := true;
    EXCEPTION WHEN raise_exception THEN ok_report := false; END;
    IF ok_check OR ok_report THEN
      RAISE EXCEPTION 'FAIL: list % accepted (check %, report %)', bad, ok_check, ok_report; END IF;
  END LOOP;
  UPDATE platform_policies SET value = '[]'::jsonb WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  IF fn_adoption_power_users_exclusions() IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL: an empty list did not come back empty'; END IF;
  UPDATE platform_policies SET value = '["479eac7f-3e5b-479e-bd91-dee9e0186b9b"]'::jsonb, is_active = false
   WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  BEGIN PERFORM fn_adoption_power_users_exclusions(); RAISE EXCEPTION 'FAIL: a switched-off list was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  UPDATE platform_policies SET is_active = true, publication_state = 'draft'
   WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  BEGIN PERFORM fn_adoption_power_users_exclusions(); RAISE EXCEPTION 'FAIL: a draft list was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  DELETE FROM platform_policies WHERE policy_key = 'adoption.power_users.exclude_institution_ids';
  BEGIN PERFORM fn_adoption_power_users_exclusions(); RAISE EXCEPTION 'FAIL: a missing list was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
END $$;

\echo '--- LOW 3: EXPECT prune keeps only the given people, adds nothing, and refuses a missing week or a null list'
INSERT INTO adoption_power_user_weeks (week_start, computed_at, payload, agenda_jobs)
VALUES ('2026-09-28', now(), '{"top":[]}', '{"u-1":"j-1","u-2":"j-2","u-gone":"j-3"}');
DO $$ BEGIN
  PERFORM fn_adoption_power_user_weeks_prune_jobs('2026-09-28', ARRAY['u-1', 'u-2', 'u-new']);
  IF (SELECT agenda_jobs FROM adoption_power_user_weeks WHERE week_start = '2026-09-28')
     IS DISTINCT FROM '{"u-1":"j-1","u-2":"j-2"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: prune left %', (SELECT agenda_jobs FROM adoption_power_user_weeks WHERE week_start = '2026-09-28'); END IF;
  PERFORM fn_adoption_power_user_weeks_prune_jobs('2026-09-28', ARRAY[]::text[]);
  IF (SELECT agenda_jobs FROM adoption_power_user_weeks WHERE week_start = '2026-09-28') IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: prune with an empty keep list did not empty the map'; END IF;
  BEGIN PERFORM fn_adoption_power_user_weeks_prune_jobs('2026-08-31', ARRAY['u-1']);
    RAISE EXCEPTION 'FAIL: prune on a week with no row was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  BEGIN PERFORM fn_adoption_power_user_weeks_prune_jobs('2026-09-28', NULL);
    RAISE EXCEPTION 'FAIL: prune with a null keep list was accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM adoption_power_user_weeks WHERE week_start = '2026-08-31') THEN
    RAISE EXCEPTION 'FAIL: a week row was invented'; END IF;
END $$;

\echo '--- LOW 2: EXPECT a claimed/running job with no claim or start time is cancelled 24 h after its request, and nothing else changes'
INSERT INTO ai_job_types (job_type, title) VALUES ('other.job', 'Other');
INSERT INTO ai_jobs (id, job_type, requested_by, status, requested_at, claimed_at, started_at) VALUES
  -- neither time recorded, requested 30 h ago: NOW cancelled (was stuck for good)
  ('b1000000-0000-0000-0000-000000000001','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','running', now() - interval '30 hours', NULL, NULL),
  ('b1000000-0000-0000-0000-000000000002','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','claimed', now() - interval '30 hours', NULL, NULL),
  -- neither time recorded, requested 2 h ago: NOT cancelled
  ('b1000000-0000-0000-0000-000000000003','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','running', now() - interval '2 hours', NULL, NULL),
  -- requested 3 days ago but claimed a minute ago: NOT cancelled (the claim time still wins)
  ('b1000000-0000-0000-0000-000000000004','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','claimed', now() - interval '3 days', now() - interval '1 minute', NULL),
  -- claimed 2 days ago, started a minute ago: NOT cancelled
  ('b1000000-0000-0000-0000-000000000005','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','running', now() - interval '3 days', now() - interval '2 days', now() - interval '1 minute'),
  -- the old rules still hold
  ('b1000000-0000-0000-0000-000000000006','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','pending', now() - interval '30 hours', NULL, NULL),
  ('b1000000-0000-0000-0000-000000000007','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','running', now() - interval '30 hours', now() - interval '29 hours', now() - interval '28 hours'),
  ('b1000000-0000-0000-0000-000000000008','adoption.chat_agenda','60000000-0000-0000-0000-000000000001','done',    now() - interval '30 hours', NULL, NULL),
  ('b1000000-0000-0000-0000-000000000009','other.job',           '60000000-0000-0000-0000-000000000001','running', now() - interval '30 hours', NULL, NULL);
DO $$ DECLARE got text; BEGIN
  IF NOT fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000001')
     OR NOT fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: a claimed/running job with no claim or start time, requested 30 h ago, was not cancelled'; END IF;
  IF fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000003') THEN
    RAISE EXCEPTION 'FAIL: a job with no claim time requested 2 h ago was cancelled'; END IF;
  IF fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000004')
     OR fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000005') THEN
    RAISE EXCEPTION 'FAIL: a job the drain took or started a minute ago was cancelled'; END IF;
  IF NOT fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000006')
     OR NOT fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000007') THEN
    RAISE EXCEPTION 'FAIL: the old stuck rules no longer cancel'; END IF;
  IF fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000008')
     OR fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000009')
     OR fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: a finished, other-type or already-cancelled job was cancelled'; END IF;
  SELECT string_agg(status, ',' ORDER BY id) INTO got FROM ai_jobs;
  IF got IS DISTINCT FROM 'canceled,canceled,running,claimed,running,canceled,canceled,done,running' THEN
    RAISE EXCEPTION 'FAIL: job states after superseding %', got; END IF;
END $$;

\echo '--- who may call the new functions: EXPECT anon and authenticated refused'
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET ROLE %I', r);
    BEGIN PERFORM fn_adoption_power_users_exclusions(); RAISE EXCEPTION 'FAIL: % read the exclusion check', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM fn_adoption_power_user_weeks_prune_jobs('2026-09-28', ARRAY['u-1']); RAISE EXCEPTION 'FAIL: % pruned agenda ids', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM fn_adoption_agenda_supersede_stale('b1000000-0000-0000-0000-000000000003'); RAISE EXCEPTION 'FAIL: % cancelled a job', r;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
END $$;

\echo '--- re-apply: EXPECT the migration applies twice cleanly and messages nobody'
\ir ../../migrations/20271010120000_adoption_power_users_lows.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM notifications) <> 0 THEN RAISE EXCEPTION 'FAIL: someone was messaged'; END IF;
END $$;
\echo '=== POWER USERS LOWS SCENARIOS PASSED ==='
