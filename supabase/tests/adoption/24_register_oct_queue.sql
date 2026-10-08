\set ON_ERROR_STOP on
-- Adoption register, October queue (20271008140000): 20 rows, all unwired, message nobody.
-- Fresh database (run.sh rebuilds it before this file), migrations A–E.2, then the
-- register migration applied TWICE here to prove it is idempotent.

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
-- Everyone signed in yesterday, so the sign-in filter never hides a reminder.
UPDATE auth.users SET last_sign_in_at = now() - interval '1 day';
UPDATE loop_registry SET owner_email = 'sa@x' WHERE loop_key = 'feature-adoption';
UPDATE platform_policies SET value = 'true'::jsonb WHERE policy_key = 'adoption.loop.enabled';

-- Positive control: a WIRED feature for learners that nobody has used, 60 days old.
-- The real run below must remind for it; otherwise "no reminder for the new rows" proves nothing.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT fn_adoption_register('control.thing','Control thing','do the control thing','{student}',NULL,NULL, now() - interval '60 days', true)->>'success' AS control_registered;
-- one learner used it, so it is not near-zero and the run reminds the other
INSERT INTO feature_usage (user_id, feature_key, day, count) VALUES
  ('30000000-0000-0000-0000-000000000001','control.thing', (now() AT TIME ZONE 'Asia/Kolkata')::date, 1);
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','',false);

CREATE TEMP TABLE oct_keys(k text PRIMARY KEY);
INSERT INTO oct_keys VALUES
  ('hr.salary_revision_request'),('hr.raise_approve'),('admission.consultant_commission_approve'),
  ('hr.pay_band_check'),('meetings.my_followups_close'),('meetings.record_pdf_download'),
  ('hr.appraisal_write'),('hr.payroll_lop_preview'),('admission.certificate_checklist'),
  ('events.tournament_create'),('events.tournament_result_record'),('events.tournament_record_winners'),
  ('pde.clinical_case_answer'),('hr.compoff_decide'),('events.cancel_with_reason'),
  ('bug_reports.answer_still_open'),('admission.pg_previous_degree'),('auth.sign_out_all_devices'),
  ('procurement.purchase_request_raise'),('improvement.idea_raise');

-- ===== apply once =====
CREATE TEMP TABLE counts(run int, total int);
INSERT INTO counts SELECT 0, count(*) FROM feature_registry;
\ir ../../migrations/20271008140000_adoption_register_oct_queue.sql
INSERT INTO counts SELECT 1, count(*) FROM feature_registry;
-- someone edits one row by hand between runs; the re-run must not overwrite it
UPDATE feature_registry SET title = 'Edited by hand' WHERE feature_key = 'hr.pay_band_check';
\ir ../../migrations/20271008140000_adoption_register_oct_queue.sql
INSERT INTO counts SELECT 2, count(*) FROM feature_registry;

\echo '--- first run adds exactly the 20 keys; second run adds nothing and keeps the hand edit'
DO $$ DECLARE c0 int; c1 int; c2 int; BEGIN
  SELECT total INTO c0 FROM counts WHERE run = 0;
  SELECT total INTO c1 FROM counts WHERE run = 1;
  SELECT total INTO c2 FROM counts WHERE run = 2;
  IF c1 - c0 <> 20 THEN RAISE EXCEPTION 'FAIL: first run added % rows, expected 20', c1 - c0; END IF;
  IF c2 <> c1 THEN RAISE EXCEPTION 'FAIL: re-run changed the row count % -> %', c1, c2; END IF;
  IF (SELECT count(*) FROM feature_registry fr JOIN oct_keys o ON o.k = fr.feature_key) <> 20 THEN
    RAISE EXCEPTION 'FAIL: not every listed key is registered'; END IF;
  IF (SELECT title FROM feature_registry WHERE feature_key = 'hr.pay_band_check') <> 'Edited by hand' THEN
    RAISE EXCEPTION 'FAIL: the re-run overwrote a row edited in the meantime'; END IF;
END $$;

\echo '--- every new row: unwired, no usage source, live, a known cadence, a source PR, roles set'
DO $$ DECLARE bad text; BEGIN
  SELECT string_agg(fr.feature_key, ', ') INTO bad
  FROM feature_registry fr JOIN oct_keys o ON o.k = fr.feature_key
  WHERE fr.usage_wired IS DISTINCT FROM false
     OR fr.usage_event_module IS NOT NULL
     OR fr.status <> 'live'
     OR fr.cadence NOT IN ('weekly','term','event')
     OR fr.source_pr IS NULL
     OR cardinality(fr.intended_roles) = 0
     OR fr.shipped_at > now();
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL: rows break the register rules: %', bad; END IF;
END $$;

\echo '--- ask-why and remind both refuse every new row (unwired)'
DO $$ DECLARE r record; a jsonb; m jsonb; BEGIN
  FOR r IN SELECT k FROM oct_keys LOOP
    a := fn_adoption_ask_why_core(r.k, (now() AT TIME ZONE 'Asia/Kolkata')::date, NULL, true);
    m := fn_adoption_remind_core(r.k, NULL, true);
    IF COALESCE((a->>'success')::boolean, false) THEN RAISE EXCEPTION 'FAIL: ask-why accepted %: %', r.k, a; END IF;
    IF COALESCE((m->>'success')::boolean, false) THEN RAISE EXCEPTION 'FAIL: remind accepted %: %', r.k, m; END IF;
  END LOOP;
END $$;

\echo '--- real daily run: EXPECT the control is reminded, and nothing at all for the 20 new rows'
DO $$ DECLARE w jsonb; BEGIN
  w := fn_adoption_daily_tick(false);
  RAISE NOTICE 'run: %', w;
  IF NOT (w->>'success')::boolean THEN RAISE EXCEPTION 'FAIL: the run failed: %', w; END IF;
  IF NOT EXISTS (SELECT 1 FROM adoption_reminders WHERE feature_key = 'control.thing'
                  AND user_id = '30000000-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: control not reminded — the run did nothing, so this proof is empty'; END IF;
  IF EXISTS (SELECT 1 FROM adoption_reminders ar JOIN oct_keys o ON o.k = ar.feature_key) THEN
    RAISE EXCEPTION 'FAIL: a new unwired row sent a reminder'; END IF;
  IF EXISTS (SELECT 1 FROM adoption_asks aa JOIN oct_keys o ON o.k = aa.feature_key) THEN
    RAISE EXCEPTION 'FAIL: a new unwired row sent a why-not question'; END IF;
END $$;
\echo '=== OCT QUEUE REGISTER SCENARIOS PASSED ==='
