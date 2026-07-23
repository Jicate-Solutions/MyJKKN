-- =====================================================================
-- SQL behavior tests for public.evaluate_learner_status_after_payment
-- =====================================================================
--
-- Tested function:
--   public.evaluate_learner_status_after_payment(p_learner_id uuid)
--     RETURNS jsonb  -- SECURITY DEFINER (granted to authenticated)
--
-- Intent of the function:
--   Promote-only state machine that flips a learner from 'account' →
--   'active' (or whichever scope='learner' status has the highest
--   admission_statuses.fee_paid_threshold_percent that paid_pct >=).
--   Logs the transition to learners_profile_status_history with
--   reason_code='auto_threshold'. Refunds never demote (caller is not
--   responsible for demoting; learners not in 'account' return no-op).
--
-- How to run:
--   Each scenario is wrapped in BEGIN; ... ROLLBACK; so no permanent
--   data is mutated. You can either:
--     a) Paste each block into psql / Supabase SQL editor, or
--     b) Submit each block via mcp__supabase__execute_sql
--   Results captured during the 2026-05-18 dev run are recorded inline
--   as `-- observed:` comments.
--
-- Fixtures (resolved against dev DB at run time):
--   threshold row     : admission_statuses(code='active', scope='learner',
--                       is_active=true, fee_paid_threshold_percent=60.00)
--   learner (active)  : bc69b960-5912-45de-a971-390f86c8005a
--                       billed 50000, paid 10000 (20% before mutation)
--   learner (active)  : fa86937e-74eb-4a5c-b667-14539515ac52  (billed 29000, paid 0)
--   app_fee category  : cadf4a41-3093-4284-ba02-d449f9369bfe  (kind='application_fee')
--   non-app category  : 4c5e8f35-3d5c-40cd-b6e2-4ed5723c21ec  (kind='other')
--   super_admin user  : 1d35bef2-2b62-4f64-b2d0-196eb8047fac
--   faculty user      : d4365137-46bf-4d83-8e21-f068dba22e3a  (non-admin authenticated)
--
-- Note: There were ZERO learners in lifecycle_status='account' at run
-- time, so every scenario synthesizes the 'account' state inside the
-- BEGIN/ROLLBACK transaction.
--
-- =====================================================================


-- ---------------------------------------------------------------------
-- Scenario 1 — paid_pct < threshold → no promotion, no history row
-- ---------------------------------------------------------------------
-- Intent : Below-threshold call returns updated=false with
--          reason='below_threshold'. Learner stays in 'account'.
-- Expected RPC: {"updated": false, "reason": "below_threshold",
--               "paid_pct": 20, "learner_id": "<uuid>"}
-- Expected side-effect: learners_profiles.lifecycle_status='account'
--                       and zero new history rows.
BEGIN;
  UPDATE learners_profiles
    SET lifecycle_status='account'
    WHERE id='bc69b960-5912-45de-a971-390f86c8005a';

  WITH pre AS (
    SELECT paid_pct, countable_billed, countable_paid
    FROM vw_learner_payment_progress
    WHERE learner_id='bc69b960-5912-45de-a971-390f86c8005a'
  ),
  rpc AS (
    SELECT evaluate_learner_status_after_payment('bc69b960-5912-45de-a971-390f86c8005a') AS result
  ),
  post AS (
    SELECT lifecycle_status FROM learners_profiles WHERE id='bc69b960-5912-45de-a971-390f86c8005a'
  ),
  hist AS (
    SELECT COUNT(*) AS n FROM learners_profile_status_history
    WHERE learner_id='bc69b960-5912-45de-a971-390f86c8005a'
      AND reason_code='auto_threshold' AND changed_at > now() - interval '1 minute'
  )
  SELECT pre.paid_pct AS pre_paid_pct, pre.countable_billed, pre.countable_paid,
         rpc.result AS rpc_result, post.lifecycle_status AS post_status,
         hist.n AS history_rows
  FROM pre, rpc, post, hist;
ROLLBACK;
-- observed (2026-05-18):
--   pre_paid_pct       : 20.00
--   countable_billed   : 50000.00
--   countable_paid     : 10000.00
--   rpc_result         : {"reason":"below_threshold","updated":false,
--                         "paid_pct":20,
--                         "learner_id":"bc69b960-5912-45de-a971-390f86c8005a"}
--   post_status        : account
--   history_rows       : 0
-- result: PASS


-- ---------------------------------------------------------------------
-- Scenario 2 — paid_pct ≥ threshold → promotion + history row
-- ---------------------------------------------------------------------
-- Intent : Promotion path. Synthesize a learner sitting at paid_pct=60
--          (= threshold) and verify (a) RPC returns updated=true with
--          to_status='active', (b) lifecycle_status flips to 'active',
--          (c) a history row is appended with reason_code='auto_threshold',
--          paid_pct_at_change/threshold_at_change populated, and
--          metadata.rpc='evaluate_learner_status_after_payment'.
--
-- Synthesis : Learner bc69b960 has one non-app-fee bill (1 Year Tuition
--             Fee, final 50000, balance 40000 → 10000 paid = 20%).
--             Setting balance_amount=20000, status='partially_paid'
--             makes paid = 30000 / 50000 = 60.00%.
--
-- Note on captured side-effects: we use a TEMP TABLE to record state
-- across statements; multi-statement WITH-CTEs do not see the RPC's
-- writes in time because the function is volatile and post-CTEs share
-- the same snapshot as the RPC CTE.
BEGIN;
  UPDATE learners_profiles SET lifecycle_status='account'
    WHERE id='bc69b960-5912-45de-a971-390f86c8005a';

  UPDATE billing_student_bills
  SET balance_amount = 20000, status='partially_paid'
  WHERE id = (
    SELECT b.id FROM billing_student_bills b
    JOIN billing_categories bc ON bc.id = b.item_category_id
    WHERE b.student_id='bc69b960-5912-45de-a971-390f86c8005a'
      AND bc.kind <> 'application_fee'
      AND b.status <> 'superseded'
    ORDER BY b.final_amount DESC
    LIMIT 1
  );

  CREATE TEMP TABLE _t2 (k text, v jsonb) ON COMMIT DROP;
  INSERT INTO _t2 VALUES ('pre', to_jsonb((
    SELECT jsonb_build_object('paid_pct', paid_pct,
      'countable_billed', countable_billed, 'countable_paid', countable_paid)
    FROM vw_learner_payment_progress WHERE learner_id='bc69b960-5912-45de-a971-390f86c8005a'
  )));
  INSERT INTO _t2 VALUES ('rpc',
    evaluate_learner_status_after_payment('bc69b960-5912-45de-a971-390f86c8005a'));
  INSERT INTO _t2 VALUES ('post_status', to_jsonb(
    (SELECT lifecycle_status::text FROM learners_profiles WHERE id='bc69b960-5912-45de-a971-390f86c8005a')));
  INSERT INTO _t2 VALUES ('hist', to_jsonb((
    SELECT jsonb_build_object(
      'from_status', from_status::text, 'to_status', to_status::text,
      'reason_code', reason_code, 'paid_pct_at_change', paid_pct_at_change,
      'threshold_at_change', threshold_at_change, 'metadata', metadata)
    FROM learners_profile_status_history
    WHERE learner_id='bc69b960-5912-45de-a971-390f86c8005a'
      AND reason_code='auto_threshold' AND changed_at > now() - interval '1 minute'
    ORDER BY changed_at DESC LIMIT 1
  )));
  SELECT * FROM _t2;
ROLLBACK;
-- observed (2026-05-18):
--   pre         : {"paid_pct":60, "countable_billed":50000, "countable_paid":30000}
--   rpc         : {"updated":true, "paid_pct":60, "threshold":60,
--                  "to_status":"active", "from_status":"account",
--                  "learner_id":"bc69b960-5912-45de-a971-390f86c8005a"}
--   post_status : "active"
--   hist        : {"from_status":"account", "to_status":"active",
--                  "reason_code":"auto_threshold",
--                  "paid_pct_at_change":60, "threshold_at_change":60,
--                  "metadata":{"rpc":"evaluate_learner_status_after_payment"}}
-- result: PASS


-- ---------------------------------------------------------------------
-- Scenario 3 — Only application_fee paid → no promotion
-- ---------------------------------------------------------------------
-- Intent : Verify that paying only application_fee bills does NOT
--          contribute to paid_pct (vw_learner_payment_progress excludes
--          kind='application_fee' from countable_*). With no other bills,
--          paid_pct=0 and the RPC returns below_threshold.
--
-- Synthesis : Take learner fa86937e (0% paid, active), supersede every
--             existing bill so they don't count, then insert one paid
--             application_fee bill. Result: countable_billed=0,
--             countable_paid=0, application_fee_paid=true.
BEGIN;
  UPDATE learners_profiles SET lifecycle_status='account'
    WHERE id='fa86937e-74eb-4a5c-b667-14539515ac52';

  UPDATE billing_student_bills SET status='superseded'
    WHERE student_id='fa86937e-74eb-4a5c-b667-14539515ac52';

  INSERT INTO billing_student_bills (
    student_id, institution_id, item_category_id, bill_description,
    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
    status, payment_date, balance_amount
  ) VALUES (
    'fa86937e-74eb-4a5c-b667-14539515ac52',
    'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
    'cadf4a41-3093-4284-ba02-d449f9369bfe', -- Application Fee category
    'Application Fee Test',
    CURRENT_DATE, 1, 1000, 1000, 0, 1000,
    'paid', now(), 0
  );

  CREATE TEMP TABLE _t3 (k text, v jsonb) ON COMMIT DROP;
  INSERT INTO _t3 VALUES ('pre', to_jsonb((
    SELECT jsonb_build_object('paid_pct', paid_pct,
      'countable_billed', countable_billed, 'countable_paid', countable_paid,
      'application_fee_paid', application_fee_paid)
    FROM vw_learner_payment_progress WHERE learner_id='fa86937e-74eb-4a5c-b667-14539515ac52'
  )));
  INSERT INTO _t3 VALUES ('rpc',
    evaluate_learner_status_after_payment('fa86937e-74eb-4a5c-b667-14539515ac52'));
  INSERT INTO _t3 VALUES ('post_status', to_jsonb(
    (SELECT lifecycle_status::text FROM learners_profiles WHERE id='fa86937e-74eb-4a5c-b667-14539515ac52')));
  SELECT * FROM _t3;
ROLLBACK;
-- observed (2026-05-18):
--   pre         : {"paid_pct":0, "countable_paid":0, "countable_billed":0,
--                  "application_fee_paid":true}
--   rpc         : {"reason":"below_threshold", "updated":false, "paid_pct":0,
--                  "learner_id":"fa86937e-74eb-4a5c-b667-14539515ac52"}
--   post_status : "account"
-- result: PASS


-- ---------------------------------------------------------------------
-- Scenario 4 — Already in 'active' → no-op (promote-only design)
-- ---------------------------------------------------------------------
-- Intent : Confirm the function is a one-way ratchet: when a learner is
--          NOT in 'account', the function short-circuits with reason
--          'no_op_for_status' regardless of paid_pct. Refunds / billing
--          adjustments will never bounce a learner out of 'active'.
BEGIN;
  CREATE TEMP TABLE _t4 (k text, v jsonb) ON COMMIT DROP;
  INSERT INTO _t4 VALUES ('pre_status', to_jsonb(
    (SELECT lifecycle_status::text FROM learners_profiles WHERE id='bc69b960-5912-45de-a971-390f86c8005a')));
  INSERT INTO _t4 VALUES ('rpc',
    evaluate_learner_status_after_payment('bc69b960-5912-45de-a971-390f86c8005a'));
  INSERT INTO _t4 VALUES ('post_status', to_jsonb(
    (SELECT lifecycle_status::text FROM learners_profiles WHERE id='bc69b960-5912-45de-a971-390f86c8005a')));
  INSERT INTO _t4 VALUES ('hist_count', to_jsonb((
    SELECT COUNT(*) FROM learners_profile_status_history
    WHERE learner_id='bc69b960-5912-45de-a971-390f86c8005a'
      AND reason_code='auto_threshold' AND changed_at > now() - interval '1 minute'
  )));
  SELECT * FROM _t4;
ROLLBACK;
-- observed (2026-05-18):
--   pre_status  : "active"
--   rpc         : {"reason":"no_op_for_status", "updated":false,
--                  "current_status":"active",
--                  "learner_id":"bc69b960-5912-45de-a971-390f86c8005a"}
--   post_status : "active"
--   hist_count  : 0
-- result: PASS


-- ---------------------------------------------------------------------
-- Scenario 5 — RLS scope: callable by authenticated (SECURITY DEFINER)
-- ---------------------------------------------------------------------
-- Intent : Confirm the GRANT EXECUTE TO authenticated from D1 is in
--          effect — a non-super-admin authenticated session can invoke
--          the RPC without permission errors. Because the function is
--          SECURITY DEFINER, RLS does not gate its internal UPDATE.
--          (We don't assert promotion here; the RPC simply must be
--          callable and return a well-formed jsonb.)
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"d4365137-46bf-4d83-8e21-f068dba22e3a","role":"authenticated"}';

  SELECT evaluate_learner_status_after_payment('bc69b960-5912-45de-a971-390f86c8005a') AS rpc_result_active;
ROLLBACK;
-- observed (2026-05-18) — impersonating faculty user d4365137-...:
--   rpc_result_active : {"reason":"no_op_for_status", "updated":false,
--                        "current_status":"active",
--                        "learner_id":"bc69b960-5912-45de-a971-390f86c8005a"}
-- result: PASS (no permission denied, well-formed JSON returned)
