-- Consultant commission payment workflow — hardening after review of PR #4118
-- Created 2026-09-30. Follows 20261228100000_consultant_commission_payment_workflow.
--
-- 1. STUCK REQUEST. A request that reached pending_disbursement kept its lines
--    "held" for ever if disbursement was refused (balance_changed), because
--    decline was allowed only in pending_review. It can now also be declined at
--    the disbursement stage — by a named disburser or a super admin.
--
-- 2. ONE PERSON COULD PAY ALONE, and around the super-admin-only rule on
--    commission_rate_card_payments (20270101090000, Director 2026-09-21).
--    Now:
--      * disbursing — the step that writes that table — is super-admin only,
--        the same rule as recording a payment directly;
--      * separation of duties: nobody may approve a request they initiated or
--        already approved at an earlier stage, and nobody who initiated or
--        approved it may disburse it. This binds super admins too.
--
-- 3. Minors from the same review:
--      * the internal helpers are revoked from authenticated (Supabase's default
--        privileges grant EXECUTE to it directly, not only via PUBLIC);
--      * flow configs are readable only by commission viewers / configurers
--        (capabilities go through a SECURITY DEFINER RPC, so nobody else needs them);
--      * the ledger guard now covers INSERT: a row claiming a payment_request_id
--        can only be written by the disbursement RPC;
--      * disbursement takes the same per-consultant advisory lock as initiation;
--      * NULLs are stripped from the flow's role / user lists on save.

-- ── helpers: no direct callers ──────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_commission_payment_active_config() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_commission_payment_actor_role(uuid) FROM anon, authenticated, PUBLIC;

-- ── flow configs readable by the people who work the flow only ──────────────
DROP POLICY IF EXISTS commission_payment_flow_configs_select ON public.commission_payment_flow_configs;
CREATE POLICY commission_payment_flow_configs_select ON public.commission_payment_flow_configs
  FOR SELECT TO authenticated USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('admission.consultants.commissions.view'))
    OR (SELECT user_has_permission('admission.consultants.commissions.configure')));

-- ── ledger guard: UPDATE / DELETE as before, plus INSERT ────────────────────
CREATE OR REPLACE FUNCTION public.fn_guard_request_linked_rate_card_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only fn_disburse_commission_payment_request sets this flag, for its own
    -- transaction.
    IF NEW.payment_request_id IS NOT NULL
       AND COALESCE(current_setting('app.commission_payment_disbursing', true), '') <> 'on' THEN
      RAISE EXCEPTION 'payment_request_id is set only by disbursing an approved commission payment request';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.payment_request_id IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'payment_from_approved_request: this entry was paid through an approved commission payment request and cannot be changed here';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
DROP TRIGGER IF EXISTS trigger_guard_request_linked_rate_card_payment ON public.commission_rate_card_payments;
CREATE TRIGGER trigger_guard_request_linked_rate_card_payment
  BEFORE INSERT OR UPDATE OR DELETE ON public.commission_rate_card_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_request_linked_rate_card_payment();

-- ── save: strip NULLs from the role / user lists ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_save_commission_payment_flow_config(
  p_id uuid, p_name text,
  p_initiator_roles uuid[], p_initiator_users uuid[], p_stages jsonb,
  p_disburser_roles uuid[], p_disburser_users uuid[],
  p_is_active boolean DEFAULT true, p_replace_active boolean DEFAULT false
) RETURNS public.commission_payment_flow_configs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_conflicts jsonb; v_conflict_ids uuid[];
  v_stages jsonb;
  v_result public.commission_payment_flow_configs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (is_super_admin() OR user_has_permission('admission.consultants.commissions.configure')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'no_stages'; END IF;

  -- Drop JSON nulls from each stage's assignee lists.
  SELECT jsonb_agg(
           s || jsonb_build_object(
             'assignee_roles', COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(s->'assignee_roles', '[]')) x WHERE jsonb_typeof(x) = 'string'), '[]'),
             'assignee_users', COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(s->'assignee_users', '[]')) x WHERE jsonb_typeof(x) = 'string'), '[]'))
           ORDER BY ord)
    INTO v_stages
    FROM jsonb_array_elements(p_stages) WITH ORDINALITY AS t(s, ord);

  IF p_is_active THEN
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), array_agg(c.id)
      INTO v_conflicts, v_conflict_ids
      FROM public.commission_payment_flow_configs c
     WHERE c.is_active AND (p_id IS NULL OR c.id <> p_id);
    IF v_conflicts IS NOT NULL THEN
      IF NOT p_replace_active THEN RAISE EXCEPTION 'active_flow_exists|%', v_conflicts::text; END IF;
      UPDATE public.commission_payment_flow_configs SET is_active = false WHERE id = ANY (v_conflict_ids);
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.commission_payment_flow_configs
      (name, initiator_roles, initiator_users, stages, disburser_roles, disburser_users, is_active, created_by)
    VALUES (btrim(p_name),
            array_remove(COALESCE(p_initiator_roles, '{}'), NULL), array_remove(COALESCE(p_initiator_users, '{}'), NULL),
            v_stages,
            array_remove(COALESCE(p_disburser_roles, '{}'), NULL), array_remove(COALESCE(p_disburser_users, '{}'), NULL),
            p_is_active, v_user)
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.commission_payment_flow_configs SET
      name = btrim(p_name),
      initiator_roles = array_remove(COALESCE(p_initiator_roles, '{}'), NULL),
      initiator_users = array_remove(COALESCE(p_initiator_users, '{}'), NULL),
      stages = v_stages,
      disburser_roles = array_remove(COALESCE(p_disburser_roles, '{}'), NULL),
      disburser_users = array_remove(COALESCE(p_disburser_users, '{}'), NULL),
      is_active = p_is_active
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'config_not_found'; END IF;
  END IF;
  RETURN v_result;
END; $$;

-- ── approve / decline: separation of duties; decline also at disbursement ───
CREATE OR REPLACE FUNCTION public.fn_act_on_commission_payment_request(
  p_request_id uuid, p_action text, p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]', p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req public.commission_payment_requests; v_stage jsonb; v_stage_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('approve', 'decline') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO v_req FROM public.commission_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF v_req.status = 'pending_disbursement' THEN
    -- Only a decline is possible here: the way out for a request whose
    -- balance changed after final approval (disbursement refuses it).
    IF p_action <> 'decline' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;
    IF NOT (is_super_admin() OR fn_refund_assignee_match(
              v_req.flow_snapshot->'disburser'->'assignee_roles',
              v_req.flow_snapshot->'disburser'->'assignee_users', v_user)) THEN
      RAISE EXCEPTION 'not_disburser';
    END IF;
    v_stage_name := 'Disbursement';
  ELSIF v_req.status = 'pending_review' THEN
    v_stage := v_req.flow_snapshot->'stages'->v_req.current_stage_index;
    v_stage_name := v_stage->>'name';
    IF NOT (is_super_admin()
            OR fn_refund_assignee_match(v_stage->'assignee_roles', v_stage->'assignee_users', v_user)) THEN
      RAISE EXCEPTION 'not_current_stage_assignee';
    END IF;
    IF p_action = 'approve' THEN
      IF v_user = v_req.initiated_by THEN RAISE EXCEPTION 'cannot_approve_own_request'; END IF;
      IF EXISTS (SELECT 1 FROM public.commission_payment_request_actions a
                  WHERE a.request_id = p_request_id AND a.action_type = 'approved' AND a.actor_id = v_user) THEN
        RAISE EXCEPTION 'already_approved_earlier_stage';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_status: %', v_req.status;
  END IF;

  IF p_action = 'approve' THEN
    IF COALESCE(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
    INSERT INTO public.commission_payment_request_actions
      (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'approved', v_req.current_stage_index, v_stage_name, v_user,
            fn_commission_payment_actor_role(v_user), p_notes, COALESCE(p_attachments, '[]'));
    IF v_req.current_stage_index + 1 >= jsonb_array_length(v_req.flow_snapshot->'stages') THEN
      UPDATE public.commission_payment_requests SET status = 'pending_disbursement' WHERE id = p_request_id;
    ELSE
      UPDATE public.commission_payment_requests SET current_stage_index = current_stage_index + 1 WHERE id = p_request_id;
    END IF;
  ELSE
    IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    INSERT INTO public.commission_payment_request_actions
      (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'declined',
            CASE WHEN v_req.status = 'pending_review' THEN v_req.current_stage_index END,
            v_stage_name, v_user, fn_commission_payment_actor_role(v_user),
            COALESCE(NULLIF(btrim(p_notes), ''), p_reason), COALESCE(p_attachments, '[]'));
    UPDATE public.commission_payment_requests
       SET status = 'declined', declined_by = v_user, declined_at = now(),
           decline_reason = p_reason, declined_stage_name = v_stage_name
     WHERE id = p_request_id;
  END IF;
END; $$;

-- ── disburse: super admin only, not a party to the request, locked ──────────
CREATE OR REPLACE FUNCTION public.fn_disburse_commission_payment_request(
  p_request_id uuid, p_payment_mode text, p_payment_details jsonb DEFAULT '{}',
  p_notes text DEFAULT NULL, p_attachments jsonb DEFAULT '[]'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req public.commission_payment_requests; v_line record; v_balance numeric;
  v_mode_label text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_payment_mode NOT IN ('bank_transfer','upi','cheque','cash','other') THEN RAISE EXCEPTION 'invalid_payment_mode'; END IF;
  IF COALESCE(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;

  -- Disbursing writes commission_rate_card_payments, which is super-admin only
  -- (20270101090000, Director 2026-09-21). An approved request does not widen that.
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'disburse_super_admin_only'; END IF;

  SELECT * INTO v_req FROM public.commission_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_disbursement' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;

  IF v_user = v_req.initiated_by
     OR EXISTS (SELECT 1 FROM public.commission_payment_request_actions a
                 WHERE a.request_id = p_request_id AND a.action_type = 'approved' AND a.actor_id = v_user) THEN
    RAISE EXCEPTION 'cannot_disburse_own_request';
  END IF;

  -- Same lock as initiation: two disbursements (or a disbursement and a new
  -- request) for one consultant cannot both read the same balance.
  PERFORM pg_advisory_xact_lock(hashtext('commission_payment:' || v_req.consultant_id::text));

  v_mode_label := CASE p_payment_mode
    WHEN 'bank_transfer' THEN 'Bank Transfer' WHEN 'upi' THEN 'UPI'
    WHEN 'cheque' THEN 'Cheque' WHEN 'cash' THEN 'Cash' ELSE 'Other' END;

  PERFORM set_config('app.commission_payment_disbursing', 'on', true);

  FOR v_line IN
    SELECT l.*, g.name AS group_name FROM public.commission_payment_request_lines l
      JOIN public.commission_rate_card_groups g ON g.id = l.group_id
     WHERE l.request_id = p_request_id
  LOOP
    SELECT e.balance_amount INTO v_balance
      FROM fn_consultant_rate_card_earnings(v_req.consultant_id, v_req.academic_year) e
     WHERE e.group_id = v_line.group_id;
    IF v_line.amount > COALESCE(v_balance, 0) THEN
      RAISE EXCEPTION 'balance_changed: % now has % left to pay, request asks % — decline it and raise a new one',
        v_line.group_name, COALESCE(v_balance, 0), v_line.amount;
    END IF;

    INSERT INTO public.commission_rate_card_payments
      (consultant_id, group_id, entry_type, amount, paid_on, payment_mode, reference, notes,
       payment_request_id, created_by, updated_by)
    VALUES (v_req.consultant_id, v_line.group_id, 'payment', v_line.amount, CURRENT_DATE, v_mode_label,
            COALESCE(NULLIF(p_payment_details->>'reference_number', ''), v_req.request_number),
            v_req.request_number || ': ' || btrim(p_notes),
            p_request_id, v_user, v_user);
  END LOOP;

  PERFORM set_config('app.commission_payment_disbursing', 'off', true);

  INSERT INTO public.commission_payment_request_actions
    (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (p_request_id, 'disbursed', NULL, 'Disbursement', v_user,
          fn_commission_payment_actor_role(v_user), p_notes, COALESCE(p_attachments, '[]'));

  UPDATE public.commission_payment_requests
     SET status = 'disbursed', payment_mode = p_payment_mode, payment_details = p_payment_details,
         disbursed_by = v_user, disbursed_at = now()
   WHERE id = p_request_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.fn_save_commission_payment_flow_config(uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_act_on_commission_payment_request(uuid,text,text,jsonb,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_disburse_commission_payment_request(uuid,text,jsonb,text,jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_save_commission_payment_flow_config(uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_act_on_commission_payment_request(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_disburse_commission_payment_request(uuid,text,jsonb,text,jsonb) TO authenticated;
