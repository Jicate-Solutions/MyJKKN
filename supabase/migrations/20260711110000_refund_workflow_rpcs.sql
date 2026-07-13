-- 20260711110000_refund_workflow_rpcs.sql
-- All refund-workflow writes. SECURITY DEFINER + self-authorizing against the
-- request's FROZEN flow_snapshot (never live config — reservations drift lesson).

CREATE OR REPLACE FUNCTION public.fn_refund_assignee_match(p_roles jsonb, p_users jsonb, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p_users ? p_user::text, false)
      OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p_user AND COALESCE(p_roles ? ur.role_id::text, false));
$$;

CREATE OR REPLACE FUNCTION public.fn_resolve_refund_flow_config(p_institution_id uuid)
RETURNS billing_refund_flow_configs LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM billing_refund_flow_configs
  WHERE is_active AND (institution_id = p_institution_id OR institution_id IS NULL)
  ORDER BY institution_id NULLS LAST LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_my_refund_capabilities(p_institution_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg billing_refund_flow_configs; v_can boolean := false;
BEGIN
  v_cfg := fn_resolve_refund_flow_config(p_institution_id);
  IF v_cfg.id IS NULL THEN RETURN jsonb_build_object('configured', false, 'can_initiate', false); END IF;
  v_can := is_super_admin()
        OR auth.uid() = ANY(v_cfg.initiator_users)
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id = ANY(v_cfg.initiator_roles));
  RETURN jsonb_build_object('configured', true, 'can_initiate', v_can);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_initiate_refund_request(
  p_student_id uuid, p_refund_type text, p_bills jsonb, p_notes text, p_attachments jsonb DEFAULT '[]'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_student learners_profiles; v_cfg billing_refund_flow_configs;
  v_bill record; v_line jsonb; v_paid numeric; v_held numeric; v_amt numeric;
  v_total numeric := 0; v_request_id uuid; v_number text; v_snapshot jsonb;
  v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_refund_type NOT IN ('withdrawal','adjustment') THEN RAISE EXCEPTION 'invalid_refund_type'; END IF;
  IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
  IF jsonb_typeof(p_bills) <> 'array' OR jsonb_array_length(p_bills) = 0 THEN RAISE EXCEPTION 'no_bills_selected'; END IF;

  SELECT * INTO v_student FROM learners_profiles WHERE id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found'; END IF;

  v_cfg := fn_resolve_refund_flow_config(v_student.institution_id);
  IF v_cfg.id IS NULL THEN RAISE EXCEPTION 'no_flow_configured'; END IF;
  IF jsonb_array_length(v_cfg.stages) = 0 THEN RAISE EXCEPTION 'flow_has_no_stages'; END IF;
  IF NOT (is_super_admin() OR v_user = ANY(v_cfg.initiator_users)
          OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = v_user AND ur.role_id = ANY(v_cfg.initiator_roles))) THEN
    RAISE EXCEPTION 'not_authorized_to_initiate';
  END IF;

  -- Freeze the chain. uuids as strings so jsonb ? works in RLS/gating.
  v_snapshot := jsonb_build_object(
    'config_id', v_cfg.id::text,
    'initiator', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.initiator_roles::text[]), 'assignee_users', to_jsonb(v_cfg.initiator_users::text[])),
    'stages', v_cfg.stages,
    'disburser', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.disburser_roles::text[]), 'assignee_users', to_jsonb(v_cfg.disburser_users::text[])));

  v_number := 'RFND-' || to_char(now(),'YYYY') || '-' || lpad(nextval('billing_refund_request_number_seq')::text, 5, '0');
  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;

  INSERT INTO billing_refund_requests
    (request_number, institution_id, student_id, refund_type, status, current_stage_index,
     flow_snapshot, total_refund_amount, previous_lifecycle_status, initiated_by)
  VALUES (v_number, v_student.institution_id, p_student_id, p_refund_type, 'pending_review', 0,
     v_snapshot, 0, CASE WHEN p_refund_type='withdrawal' THEN v_student.lifecycle_status::text END, v_user)
  RETURNING id INTO v_request_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_bills) LOOP
    v_amt := (v_line->>'refund_amount')::numeric;
    SELECT * INTO v_bill FROM billing_student_bills
      WHERE id = (v_line->>'bill_id')::uuid AND student_id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bill_not_found_for_student: %', v_line->>'bill_id'; END IF;

    SELECT COALESCE(SUM(bri.amount_paid),0) INTO v_paid FROM billing_receipt_items bri WHERE bri.bill_id = v_bill.id;
    SELECT COALESCE(SUM(rb.refund_amount),0) INTO v_held
      FROM billing_refund_request_bills rb
      JOIN billing_refund_requests r ON r.id = rb.request_id
      WHERE rb.bill_id = v_bill.id AND r.status IN ('pending_review','pending_disbursement');

    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
    IF v_amt > v_paid - v_bill.refunded_amount - v_held THEN
      RAISE EXCEPTION 'amount_exceeds_refundable: bill % headroom %', v_bill.id, v_paid - v_bill.refunded_amount - v_held;
    END IF;

    INSERT INTO billing_refund_request_bills (request_id, bill_id, paid_amount_snapshot, refund_amount)
    VALUES (v_request_id, v_bill.id, v_paid, v_amt);
    v_total := v_total + v_amt;
  END LOOP;

  UPDATE billing_refund_requests SET total_refund_amount = v_total WHERE id = v_request_id;
  INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (v_request_id, 'initiated', NULL, 'Initiation', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));

  IF p_refund_type = 'withdrawal' THEN
    UPDATE learners_profiles SET lifecycle_status = 'withdrawal_pending', updated_at = now()
    WHERE id = p_student_id;  -- seat freed NOW (seat RPCs count by status)
  END IF;
  RETURN v_request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_act_on_refund_request(
  p_request_id uuid, p_action text, p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]', p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_req billing_refund_requests; v_stage jsonb;
  v_stage_count int; v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('approve','decline') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO v_req FROM billing_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_review' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;

  v_stage := v_req.flow_snapshot->'stages'->v_req.current_stage_index;
  v_stage_count := jsonb_array_length(v_req.flow_snapshot->'stages');
  IF NOT (is_super_admin()
          OR fn_refund_assignee_match(v_stage->'assignee_roles', v_stage->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_current_stage_assignee';
  END IF;

  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;

  IF p_action = 'approve' THEN
    IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
    INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'approved', v_req.current_stage_index, v_stage->>'name', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));
    IF v_req.current_stage_index + 1 >= v_stage_count THEN
      UPDATE billing_refund_requests SET status = 'pending_disbursement' WHERE id = p_request_id;
    ELSE
      UPDATE billing_refund_requests SET current_stage_index = current_stage_index + 1 WHERE id = p_request_id;
    END IF;
  ELSE  -- decline: terminal; withdrawal learner restored
    IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'declined', v_req.current_stage_index, v_stage->>'name', v_user, v_actor_role,
            COALESCE(p_notes, p_reason), COALESCE(p_attachments,'[]'));
    UPDATE billing_refund_requests
      SET status='declined', declined_by=v_user, declined_at=now(),
          decline_reason=p_reason, declined_stage_name=v_stage->>'name'
      WHERE id = p_request_id;
    IF v_req.refund_type = 'withdrawal' AND v_req.previous_lifecycle_status IS NOT NULL THEN
      UPDATE learners_profiles SET lifecycle_status = v_req.previous_lifecycle_status::lifecycle_status, updated_at = now()
      WHERE id = v_req.student_id AND lifecycle_status = 'withdrawal_pending';  -- guard: don't clobber external changes
    END IF;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_disburse_refund_request(
  p_request_id uuid, p_payment_mode text, p_payment_details jsonb DEFAULT '{}',
  p_notes text DEFAULT NULL, p_attachments jsonb DEFAULT '[]'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_req billing_refund_requests; v_line record;
  v_paid numeric; v_actor_role text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_payment_mode NOT IN ('cash','online','bank_transfer','dd','cheque') THEN RAISE EXCEPTION 'invalid_payment_mode'; END IF;
  IF COALESCE(btrim(p_notes),'') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;

  SELECT * INTO v_req FROM billing_refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_disbursement' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;
  IF NOT (is_super_admin() OR fn_refund_assignee_match(
            v_req.flow_snapshot->'disburser'->'assignee_roles',
            v_req.flow_snapshot->'disburser'->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_disburser';
  END IF;

  FOR v_line IN SELECT rb.*, b.id AS b_id FROM billing_refund_request_bills rb
                JOIN billing_student_bills b ON b.id = rb.bill_id
                WHERE rb.request_id = p_request_id FOR UPDATE OF b LOOP
    SELECT COALESCE(SUM(bri.amount_paid),0) INTO v_paid FROM billing_receipt_items bri WHERE bri.bill_id = v_line.bill_id;
    UPDATE billing_student_bills
      SET refunded_amount = refunded_amount + v_line.refund_amount,
          refund_status = CASE WHEN refunded_amount + v_line.refund_amount >= v_paid
                               THEN 'refunded' ELSE 'partially_refunded' END,
          updated_at = now()
      WHERE id = v_line.bill_id;
  END LOOP;

  SELECT cr.role_name INTO v_actor_role FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;
  INSERT INTO billing_refund_request_actions (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (p_request_id, 'disbursed', NULL, 'Disbursement', v_user, v_actor_role, p_notes, COALESCE(p_attachments,'[]'));

  UPDATE billing_refund_requests
    SET status='disbursed', payment_mode=p_payment_mode, payment_details=p_payment_details,
        disbursed_by=v_user, disbursed_at=now()
    WHERE id = p_request_id;

  IF v_req.refund_type = 'withdrawal' THEN
    UPDATE learners_profiles SET lifecycle_status = 'exited', updated_at = now() WHERE id = v_req.student_id;
  END IF;
  PERFORM refresh_student_billing_summary(v_req.student_id);
END; $$;

-- Revoke from BOTH anon and PUBLIC: anon holds a direct default grant on top of
-- the PUBLIC one, so either alone leaves the RPC callable. Self-auth remains the
-- primary gate.
REVOKE EXECUTE ON FUNCTION fn_refund_assignee_match(jsonb,jsonb,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_resolve_refund_flow_config(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_my_refund_capabilities(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_initiate_refund_request(uuid,text,jsonb,text,jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_act_on_refund_request(uuid,text,text,jsonb,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_disburse_refund_request(uuid,text,jsonb,text,jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION fn_refund_assignee_match(jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_resolve_refund_flow_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_my_refund_capabilities(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_initiate_refund_request(uuid,text,jsonb,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_act_on_refund_request(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_disburse_refund_request(uuid,text,jsonb,text,jsonb) TO authenticated;
