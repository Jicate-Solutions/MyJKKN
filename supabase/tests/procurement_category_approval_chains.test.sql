-- Test for 20271006105000_procurement_category_approval_chains.
--
-- Run it in ONE call together with the migration body, against a database where the
-- migration is not applied yet:   <migration SQL>  +  <this file>
-- The last statement always raises, so the whole call — migration included — rolls
-- back and nothing persists. Success = the error text starts with "ALL PASSED".
-- (The Supabase MCP is bound to production: this is the only safe way to test there.)
--
-- Fixture people (live, 2026-10-06): JKKN College of Pharmacy; Pharmaceutical Chemistry
-- HOD; Pharmacy Principal; Engineering Principal standing in for "Chairperson" (an
-- approver with no access to Pharmacy); an Engineering HOD (no access, not an approver).

CREATE OR REPLACE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_err(p_sql text, p_needle text, p_test text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(lower(p_needle) IN lower(SQLERRM)) = 0 THEN
      RAISE EXCEPTION '% FAILED: expected "%", got "%"', p_test, p_needle, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '% FAILED: expected an error "%", got none', p_test, p_needle;
END;
$$;

DO $test$
DECLARE
  c_inst     constant uuid := '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334';  -- JKKN College of Pharmacy
  c_dept     constant uuid := 'f0d45e02-bfa4-4d26-b51a-68722271bbcb';  -- Pharmaceutical Chemistry
  c_dept_no  constant uuid := '22f6189b-ecd4-4898-b890-b33accadf582';  -- REGULATORY AFFAIRS (no HOD)
  c_hod      constant uuid := '998ac0cb-e062-47e1-b350-f114a8fa73b6';
  c_princ    constant uuid := '4f2d28c1-bffe-4da6-b099-8fb0d01cf648';
  c_chair    constant uuid := 'ce564f06-6e81-496e-a553-21150b3688ea';  -- Engineering Principal
  c_outsider constant uuid := '11d35135-b028-4498-a2e6-63cf1c53b158';  -- Engineering HOD
  c_req_user constant uuid := 'dc30c862-7b61-4277-90a2-09f791d58c07';  -- lab assistant
  c_super    constant uuid := 'd96aabde-f49e-4c37-8cf0-5c2627c62629';
  v_cat  uuid;
  v_req  uuid;
  v_req2 uuid;
  v_req3 uuid;
  v_n    int;
  v_s    text;
  v_r    text;
  v_log  text := '';
BEGIN
  -- Setup: a category whose chain is HOD → Principal → Chairperson (named person).
  INSERT INTO procurement_categories (name) VALUES ('ZZ test chain') RETURNING id INTO v_cat;
  PERFORM pg_temp.as_user(c_super);
  PERFORM procurement_save_category_steps(v_cat, jsonb_build_array(
    jsonb_build_object('label', 'HOD', 'approver_kind', 'hod'),
    jsonb_build_object('label', 'Principal', 'approver_kind', 'role', 'role_key', 'principal', 'same_college', true),
    jsonb_build_object('label', 'Chairperson', 'approver_kind', 'user', 'user_id', c_chair)));
  SELECT count(*) INTO v_n FROM procurement_category_approval_steps WHERE category_id = v_cat;
  ASSERT v_n = 3, 'setup: 3 steps saved';

  INSERT INTO procurement_purchase_requests (institution_id, request_number, request_type, requested_by, title, category_id)
  VALUES (c_inst, 'PR-TEST-00001', 'new_item', c_req_user, 'Test chemicals', v_cat) RETURNING id INTO v_req;
  INSERT INTO procurement_purchase_request_items (request_id, item_name, required_quantity)
  VALUES (v_req, 'Acetic acid', 2);

  -- T1 no department
  PERFORM pg_temp.as_user(c_req_user);
  PERFORM pg_temp.expect_err(format($$UPDATE procurement_purchase_requests SET status='submitted' WHERE id=%L$$, v_req),
                             'Choose the department', 'T1');
  v_log := v_log || 'T1 ';

  -- T2 department without HOD
  UPDATE procurement_purchase_requests SET department_id = c_dept_no WHERE id = v_req;
  PERFORM pg_temp.expect_err(format($$UPDATE procurement_purchase_requests SET status='submitted' WHERE id=%L$$, v_req),
                             'No HOD is set', 'T2');
  v_log := v_log || 'T2 ';

  -- T13 preview says the same before submitting
  SELECT string_agg(coalesce(problem, 'ok'), ',' ORDER BY step_order) INTO v_s
  FROM procurement_preview_chain(v_cat, c_inst, c_dept_no);
  ASSERT v_s = 'No HOD is set for this department,ok,ok', 'T13 preview: ' || v_s;
  v_log := v_log || 'T13 ';

  -- T3 good submit → 3 steps, first pending
  UPDATE procurement_purchase_requests SET department_id = c_dept WHERE id = v_req;
  UPDATE procurement_purchase_requests SET status = 'submitted', submitted_at = now() WHERE id = v_req;
  SELECT string_agg(status, ',' ORDER BY step_order) INTO v_s FROM procurement_request_approvals WHERE request_id = v_req;
  ASSERT v_s = 'pending,waiting,waiting', 'T3 statuses: ' || coalesce(v_s, 'none');
  SELECT count(*) INTO v_n FROM user_notifications un JOIN notifications n ON n.id = un.notification_id
   WHERE n.idempotency_key LIKE 'procurement_pr_step:%' AND un.user_id = c_hod
     AND n.metadata->>'request_id' = v_req::text;
  ASSERT v_n = 1, 'T3 HOD notified';
  SELECT count(*) INTO v_n FROM notifications WHERE idempotency_key = 'procurement_pr_submitted:' || v_req;
  ASSERT v_n = 0, 'T3 old "every approver" notice not sent';
  v_log := v_log || 'T3 ';

  -- T14 the HOD sees it in "waiting for me"; the Principal does not yet
  PERFORM pg_temp.as_user(c_hod);
  SELECT count(*) INTO v_n FROM procurement_my_approvals() WHERE request_id = v_req;
  ASSERT v_n = 1, 'T14 HOD inbox';
  PERFORM pg_temp.as_user(c_princ);
  SELECT count(*) INTO v_n FROM procurement_my_approvals() WHERE request_id = v_req;
  ASSERT v_n = 0, 'T14 Principal inbox empty';
  v_log := v_log || 'T14 ';

  -- T4 not your turn
  PERFORM pg_temp.expect_err(format($$SELECT procurement_approve_request_step(%L)$$, v_req),
                             'waiting for HOD', 'T4');
  v_log := v_log || 'T4 ';

  -- T5 HOD approves (with a quantity change) → next
  PERFORM pg_temp.as_user(c_hod);
  SELECT procurement_approve_request_step(v_req, 'ok',
           jsonb_build_array(jsonb_build_object('item_id',
             (SELECT id FROM procurement_purchase_request_items WHERE request_id = v_req), 'quantity', 3)))
    INTO v_r;
  ASSERT v_r = 'next', 'T5 returns next';
  SELECT string_agg(status, ',' ORDER BY step_order) INTO v_s FROM procurement_request_approvals WHERE request_id = v_req;
  ASSERT v_s = 'approved,pending,waiting', 'T5 statuses: ' || v_s;
  SELECT (required_quantity::numeric)::int::text || '/' || (original_quantity::numeric)::int::text INTO v_s
    FROM procurement_purchase_request_items WHERE request_id = v_req;
  ASSERT v_s = '3/2', 'T5 qty change recorded: ' || v_s;
  v_log := v_log || 'T5 ';

  -- T6 a plain UPDATE cannot skip the chain
  PERFORM pg_temp.as_user(c_princ);
  PERFORM pg_temp.expect_err(format($$UPDATE procurement_purchase_requests SET status='approved' WHERE id=%L$$, v_req),
                             'follows its category', 'T6');
  v_log := v_log || 'T6 ';

  -- T7 Principal sends back → returned, step 3 cancelled; resubmit → round 2 from HOD
  PERFORM procurement_decide_request_step(v_req, 'return', 'Add the room number');
  SELECT status INTO v_s FROM procurement_purchase_requests WHERE id = v_req;
  ASSERT v_s = 'returned', 'T7 returned: ' || v_s;
  SELECT string_agg(status, ',' ORDER BY step_order) INTO v_s
    FROM procurement_request_approvals WHERE request_id = v_req AND round = 1;
  ASSERT v_s = 'approved,returned,cancelled', 'T7 round 1: ' || v_s;
  PERFORM pg_temp.as_user(c_req_user);
  UPDATE procurement_purchase_requests SET status = 'submitted', submitted_at = now() WHERE id = v_req;
  SELECT string_agg(status, ',' ORDER BY step_order) INTO v_s
    FROM procurement_request_approvals WHERE request_id = v_req AND round = 2;
  ASSERT v_s = 'pending,waiting,waiting', 'T7 round 2: ' || coalesce(v_s, 'none');
  v_log := v_log || 'T7 ';

  -- T8 all three approve → approved by the last one
  PERFORM pg_temp.as_user(c_hod);   PERFORM procurement_approve_request_step(v_req);
  PERFORM pg_temp.as_user(c_princ); PERFORM procurement_approve_request_step(v_req);
  PERFORM pg_temp.as_user(c_chair); SELECT procurement_approve_request_step(v_req) INTO v_r;
  ASSERT v_r = 'approved', 'T8 returns approved';
  SELECT status || '/' || (approved_by = c_chair)::text INTO v_s FROM procurement_purchase_requests WHERE id = v_req;
  ASSERT v_s = 'approved/true', 'T8 request: ' || v_s;
  v_log := v_log || 'T8 ';

  -- T11 RLS: the outside approver reads the request + items; an outsider does not
  PERFORM pg_temp.as_user(c_chair);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM procurement_purchase_requests WHERE id = v_req;
  ASSERT v_n = 1, 'T11 approver reads request';
  SELECT count(*) INTO v_n FROM procurement_purchase_request_items WHERE request_id = v_req;
  ASSERT v_n = 1, 'T11 approver reads items';
  SELECT count(*) INTO v_n FROM procurement_request_approvals WHERE request_id = v_req;
  ASSERT v_n = 6, 'T11 approver reads steps';
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.as_user(c_outsider);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM procurement_purchase_requests WHERE id = v_req;
  ASSERT v_n = 0, 'T11 outsider cannot read request';
  SELECT count(*) INTO v_n FROM procurement_request_approvals WHERE request_id = v_req;
  ASSERT v_n = 0, 'T11 outsider cannot read steps';
  EXECUTE 'RESET ROLE';
  v_log := v_log || 'T11 ';

  -- T9 the requester IS the HOD → HOD step skipped, Principal first
  INSERT INTO procurement_purchase_requests (institution_id, request_number, request_type, requested_by, title, category_id, department_id)
  VALUES (c_inst, 'PR-TEST-00002', 'new_item', c_hod, 'HOD own request', v_cat, c_dept) RETURNING id INTO v_req2;
  PERFORM pg_temp.as_user(c_hod);
  UPDATE procurement_purchase_requests SET status = 'submitted' WHERE id = v_req2;
  SELECT string_agg(status, ',' ORDER BY step_order) INTO v_s FROM procurement_request_approvals WHERE request_id = v_req2;
  ASSERT v_s = 'skipped,pending,waiting', 'T9: ' || v_s;
  v_log := v_log || 'T9 ';

  -- T10 legacy request (no category) still follows procurement.request_approve
  INSERT INTO procurement_purchase_requests (institution_id, request_number, request_type, requested_by, title)
  VALUES (c_inst, 'PR-TEST-00003', 'new_item', c_req_user, 'Legacy') RETURNING id INTO v_req3;
  PERFORM pg_temp.as_user(c_req_user);
  UPDATE procurement_purchase_requests SET status = 'submitted' WHERE id = v_req3;
  SELECT count(*) INTO v_n FROM procurement_request_approvals WHERE request_id = v_req3;
  ASSERT v_n = 0, 'T10 no chain rows';
  PERFORM pg_temp.as_user(c_princ);
  PERFORM pg_temp.expect_err(format($$UPDATE procurement_purchase_requests SET status='approved' WHERE id=%L$$, v_req3),
                             'requires the procurement.request_approve', 'T10');
  PERFORM pg_temp.as_user(c_super);
  UPDATE procurement_purchase_requests SET status = 'approved' WHERE id = v_req3;
  v_log := v_log || 'T10 ';

  -- T12 settings: Super Admin only, unknown role refused
  PERFORM pg_temp.expect_err(format($$SELECT procurement_save_category_steps(%L, '[{"label":"X","approver_kind":"role","role_key":"chairman_typo"}]')$$, v_cat),
                             'does not exist', 'T12a');
  PERFORM pg_temp.as_user(c_princ);
  PERFORM pg_temp.expect_err(format($$SELECT procurement_save_category_steps(%L, '[{"label":"HOD","approver_kind":"hod"}]')$$, v_cat),
                             'Only a Super Admin', 'T12b');
  v_log := v_log || 'T12 ';

  -- T15 empty category refuses submit
  DELETE FROM procurement_category_approval_steps WHERE category_id = v_cat;
  INSERT INTO procurement_purchase_requests (institution_id, request_number, request_type, requested_by, title, category_id, department_id)
  VALUES (c_inst, 'PR-TEST-00004', 'new_item', c_req_user, 'No steps', v_cat, c_dept) RETURNING id INTO v_req3;
  PERFORM pg_temp.as_user(c_req_user);
  PERFORM pg_temp.expect_err(format($$UPDATE procurement_purchase_requests SET status='submitted' WHERE id=%L$$, v_req3),
                             'No approval steps are set', 'T15');
  v_log := v_log || 'T15 ';

  RAISE EXCEPTION 'ALL PASSED: %', v_log;
END;
$test$;
