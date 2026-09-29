-- Consultant commission payment approval workflow
-- Created 2026-09-28. Modelled on the billing refund workflow
-- (20260711100000 / 20260711110000 / 20260714130000).
--
-- Flow, from the consultant's Commission Structure tab (below the 1st Year Fee
-- Collection table):
--   initiate  → pending_review (stage 0) → approve … → pending_disbursement
--             → disburse → disbursed            (decline at any stage → declined)
--
--   * One GLOBAL active flow config (consultant commission is not per
--     institution: one agency's learners span institutions). The chain is
--     frozen onto each request as flow_snapshot, so editing the config never
--     re-routes a request already in flight.
--   * A request asks to pay amounts against the rate-card lines (groups) of one
--     consultant for one admission year. Each line is capped at
--       balance (fn_consultant_rate_card_earnings) - amounts held by other open requests.
--   * The 1st-year fee collection at initiation is frozen onto the request
--     (fee_collection_snapshot) so approvers see what was collected when asked.
--     It does not gate initiation (decision 2026-09-28).
--   * Disbursing writes one commission_rate_card_payments row per line, linked
--     back by payment_request_id, so Paid / Balance on the tab update themselves.
--     Direct "Record Payment" stays for admins (decision 2026-09-28).
--   * Writes happen ONLY through the SECURITY DEFINER RPCs below; RLS is SELECT-only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_payment_flow_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  initiator_roles  uuid[] NOT NULL DEFAULT '{}',
  initiator_users  uuid[] NOT NULL DEFAULT '{}',
  stages           jsonb  NOT NULL DEFAULT '[]',  -- [{key,name,assignee_roles:[],assignee_users:[]}]
  disburser_roles  uuid[] NOT NULL DEFAULT '{}',
  disburser_users  uuid[] NOT NULL DEFAULT '{}',
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_payment_flow_active
  ON public.commission_payment_flow_configs ((1)) WHERE is_active;

CREATE SEQUENCE IF NOT EXISTS public.commission_payment_request_number_seq;

CREATE TABLE IF NOT EXISTS public.commission_payment_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number           text NOT NULL UNIQUE,
  consultant_id            uuid NOT NULL REFERENCES public.education_consultants(id) ON DELETE RESTRICT,
  card_id                  uuid NOT NULL REFERENCES public.commission_rate_cards(id) ON DELETE RESTRICT,
  academic_year            integer NOT NULL,
  status                   text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','pending_disbursement','disbursed','declined')),
  current_stage_index      integer NOT NULL DEFAULT 0,
  flow_snapshot            jsonb NOT NULL,
  fee_collection_snapshot  jsonb NOT NULL DEFAULT '[]',
  total_amount             numeric(15,2) NOT NULL DEFAULT 0,
  initiated_by             uuid NOT NULL REFERENCES public.profiles(id),
  initiated_at             timestamptz NOT NULL DEFAULT now(),
  declined_by              uuid REFERENCES public.profiles(id),
  declined_at              timestamptz,
  decline_reason           text,
  declined_stage_name      text,
  payment_mode             text CHECK (payment_mode IS NULL OR payment_mode IN ('bank_transfer','upi','cheque','cash','other')),
  payment_details          jsonb,
  disbursed_by             uuid REFERENCES public.profiles(id),
  disbursed_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_payment_requests_consultant
  ON public.commission_payment_requests (consultant_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_commission_payment_requests_status
  ON public.commission_payment_requests (status);

CREATE TABLE IF NOT EXISTS public.commission_payment_request_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES public.commission_payment_requests(id) ON DELETE CASCADE,
  group_id          uuid NOT NULL REFERENCES public.commission_rate_card_groups(id) ON DELETE RESTRICT,
  earned_snapshot   numeric(15,2) NOT NULL,
  paid_snapshot     numeric(15,2) NOT NULL,
  balance_snapshot  numeric(15,2) NOT NULL,
  amount            numeric(15,2) NOT NULL,
  CONSTRAINT chk_commission_payment_line_amount CHECK (amount > 0 AND amount <= balance_snapshot),
  CONSTRAINT uq_commission_payment_request_group UNIQUE (request_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_commission_payment_lines_group
  ON public.commission_payment_request_lines (group_id);

CREATE TABLE IF NOT EXISTS public.commission_payment_request_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid NOT NULL REFERENCES public.commission_payment_requests(id) ON DELETE CASCADE,
  action_type      text NOT NULL CHECK (action_type IN ('initiated','approved','declined','disbursed')),
  stage_index      integer,
  stage_name       text NOT NULL,
  actor_id         uuid NOT NULL REFERENCES public.profiles(id),
  actor_role_name  text,
  notes            text,
  attachments      jsonb NOT NULL DEFAULT '[]',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_payment_actions_request
  ON public.commission_payment_request_actions (request_id, created_at);

-- Ledger rows written by a disbursement point back at their request. SET NULL
-- keeps the money on the ledger even if a request row is ever removed.
ALTER TABLE public.commission_rate_card_payments
  ADD COLUMN IF NOT EXISTS payment_request_id uuid
    REFERENCES public.commission_payment_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rate_card_payments_request
  ON public.commission_rate_card_payments (payment_request_id) WHERE payment_request_id IS NOT NULL;

-- A request-written ledger row is the record of an approved disbursement;
-- editing or deleting it directly would leave the ledger and the approval trail
-- disagreeing. Only a super admin may (for a genuine correction).
CREATE OR REPLACE FUNCTION public.fn_guard_request_linked_rate_card_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.payment_request_id IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'payment_from_approved_request: this entry was paid through an approved commission payment request and cannot be changed here';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;
DROP TRIGGER IF EXISTS trigger_guard_request_linked_rate_card_payment ON public.commission_rate_card_payments;
CREATE TRIGGER trigger_guard_request_linked_rate_card_payment
  BEFORE UPDATE OR DELETE ON public.commission_rate_card_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_request_linked_rate_card_payment();

CREATE OR REPLACE FUNCTION public.fn_touch_commission_payment_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_commission_payment_flow_configs_updated_at ON public.commission_payment_flow_configs;
CREATE TRIGGER trigger_commission_payment_flow_configs_updated_at
  BEFORE UPDATE ON public.commission_payment_flow_configs
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_commission_payment_updated_at();
DROP TRIGGER IF EXISTS trigger_commission_payment_requests_updated_at ON public.commission_payment_requests;
CREATE TRIGGER trigger_commission_payment_requests_updated_at
  BEFORE UPDATE ON public.commission_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_commission_payment_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — SELECT only; every write goes through an RPC.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.commission_payment_flow_configs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payment_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payment_request_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payment_request_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_payment_flow_configs,
                    public.commission_payment_requests,
                    public.commission_payment_request_lines,
                    public.commission_payment_request_actions FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.commission_payment_flow_configs,
                      public.commission_payment_requests,
                      public.commission_payment_request_lines,
                      public.commission_payment_request_actions TO authenticated;
GRANT DELETE ON TABLE public.commission_payment_flow_configs TO authenticated;

DROP POLICY IF EXISTS commission_payment_flow_configs_select ON public.commission_payment_flow_configs;
CREATE POLICY commission_payment_flow_configs_select ON public.commission_payment_flow_configs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS commission_payment_flow_configs_delete ON public.commission_payment_flow_configs;
CREATE POLICY commission_payment_flow_configs_delete ON public.commission_payment_flow_configs
  FOR DELETE TO authenticated
  USING ((SELECT is_super_admin()) OR (SELECT user_has_permission('admission.consultants.commissions.configure')));

-- Requests: commission viewers, the initiator, and anyone named in the frozen chain.
DROP POLICY IF EXISTS commission_payment_requests_select ON public.commission_payment_requests;
CREATE POLICY commission_payment_requests_select ON public.commission_payment_requests
  FOR SELECT TO authenticated USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('admission.consultants.commissions.view'))
    OR commission_payment_requests.initiated_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(commission_payment_requests.flow_snapshot->'stages') s
       WHERE s->'assignee_users' ? auth.uid()::text
          OR EXISTS (SELECT 1 FROM user_roles ur
                      WHERE ur.user_id = auth.uid() AND s->'assignee_roles' ? ur.role_id::text))
    OR (commission_payment_requests.flow_snapshot->'disburser'->'assignee_users' ? auth.uid()::text)
    OR EXISTS (SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND commission_payment_requests.flow_snapshot->'disburser'->'assignee_roles' ? ur.role_id::text)
  );

DROP POLICY IF EXISTS commission_payment_request_lines_select ON public.commission_payment_request_lines;
CREATE POLICY commission_payment_request_lines_select ON public.commission_payment_request_lines
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commission_payment_requests r WHERE r.id = commission_payment_request_lines.request_id));
DROP POLICY IF EXISTS commission_payment_request_actions_select ON public.commission_payment_request_actions;
CREATE POLICY commission_payment_request_actions_select ON public.commission_payment_request_actions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commission_payment_requests r WHERE r.id = commission_payment_request_actions.request_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permission: who may author the flow config
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('admission.consultants.commissions.configure', true)
 WHERE role_name IN ('Super Administrator', 'Administrator', 'Chief Accountant')
   AND is_active;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPCs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_commission_payment_active_config()
RETURNS public.commission_payment_flow_configs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.commission_payment_flow_configs WHERE is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_commission_payment_actor_role(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cr.role_name FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
   WHERE ur.user_id = p_user ORDER BY ur.is_primary DESC NULLS LAST LIMIT 1;
$$;

-- ci:allow-secdef-authenticated fn_my_commission_payment_capabilities answers only
-- "may I, the caller, initiate?" — it returns two booleans about auth.uid() and
-- reads no other person's data, so every signed-in user may ask (it decides
-- whether the Initiate Payment button shows). Every other broadly granted
-- function in this file authorizes the caller in its own body.
CREATE OR REPLACE FUNCTION public.fn_my_commission_payment_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg public.commission_payment_flow_configs;
BEGIN
  v_cfg := fn_commission_payment_active_config();
  IF v_cfg.id IS NULL THEN RETURN jsonb_build_object('configured', false, 'can_initiate', false); END IF;
  RETURN jsonb_build_object('configured', true, 'can_initiate',
    is_super_admin()
    OR auth.uid() = ANY (v_cfg.initiator_users)
    OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id = ANY (v_cfg.initiator_roles)));
END; $$;

-- Role → member pairs for the config editor's user picker (config authors only).
CREATE OR REPLACE FUNCTION public.fn_commission_payment_role_members()
RETURNS TABLE (role_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.role_id, ur.user_id
    FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
   WHERE cr.is_active
     AND (is_super_admin() OR is_admin() OR user_has_permission('admission.consultants.commissions.configure'));
$$;

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
  v_result public.commission_payment_flow_configs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (is_super_admin() OR user_has_permission('admission.consultants.commissions.configure')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) = 0 THEN RAISE EXCEPTION 'no_stages'; END IF;

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
    VALUES (btrim(p_name), p_initiator_roles, p_initiator_users, p_stages,
            p_disburser_roles, p_disburser_users, p_is_active, v_user)
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.commission_payment_flow_configs SET
      name = btrim(p_name), initiator_roles = p_initiator_roles, initiator_users = p_initiator_users,
      stages = p_stages, disburser_roles = p_disburser_roles, disburser_users = p_disburser_users,
      is_active = p_is_active
     WHERE id = p_id
    RETURNING * INTO v_result;
    IF NOT FOUND THEN RAISE EXCEPTION 'config_not_found'; END IF;
  END IF;
  RETURN v_result;
END; $$;

-- p_lines: [{group_id, amount}]
CREATE OR REPLACE FUNCTION public.fn_initiate_commission_payment_request(
  p_consultant_id uuid, p_academic_year integer, p_lines jsonb,
  p_notes text, p_attachments jsonb DEFAULT '[]'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cfg public.commission_payment_flow_configs;
  v_card_id uuid; v_line jsonb; v_amt numeric; v_held numeric;
  v_earn record; v_total numeric := 0;
  v_request_id uuid; v_snapshot jsonb; v_fees jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF COALESCE(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'no_lines_selected'; END IF;

  v_cfg := fn_commission_payment_active_config();
  IF v_cfg.id IS NULL THEN RAISE EXCEPTION 'no_flow_configured'; END IF;
  IF jsonb_array_length(v_cfg.stages) = 0 THEN RAISE EXCEPTION 'flow_has_no_stages'; END IF;
  IF NOT (is_super_admin() OR v_user = ANY (v_cfg.initiator_users)
          OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = v_user AND ur.role_id = ANY (v_cfg.initiator_roles))) THEN
    RAISE EXCEPTION 'not_authorized_to_initiate';
  END IF;
  -- The balance comes from fn_consultant_rate_card_earnings, which returns
  -- nothing to callers without commission view access. Say so, rather than
  -- failing later as if the institution line did not exist.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.consultants.commissions.view')) THEN
    RAISE EXCEPTION 'commissions_view_required';
  END IF;

  SELECT c.id INTO v_card_id FROM public.commission_rate_cards c
   WHERE c.is_active AND c.academic_year = p_academic_year LIMIT 1;
  IF v_card_id IS NULL THEN RAISE EXCEPTION 'no_rate_card_for_year: %', p_academic_year; END IF;

  -- Serialise initiations for one consultant so two concurrent requests can't
  -- both claim the same balance.
  PERFORM pg_advisory_xact_lock(hashtext('commission_payment:' || p_consultant_id::text));

  v_snapshot := jsonb_build_object(
    'config_id', v_cfg.id::text,
    'initiator', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.initiator_roles::text[]), 'assignee_users', to_jsonb(v_cfg.initiator_users::text[])),
    'stages', v_cfg.stages,
    'disburser', jsonb_build_object('assignee_roles', to_jsonb(v_cfg.disburser_roles::text[]), 'assignee_users', to_jsonb(v_cfg.disburser_users::text[])));

  SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]') INTO v_fees
    FROM fn_consultant_first_year_fee_collection(p_consultant_id, p_academic_year) f;

  INSERT INTO public.commission_payment_requests
    (request_number, consultant_id, card_id, academic_year, status, current_stage_index,
     flow_snapshot, fee_collection_snapshot, total_amount, initiated_by)
  VALUES ('CPAY-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('commission_payment_request_number_seq')::text, 5, '0'),
          p_consultant_id, v_card_id, p_academic_year, 'pending_review', 0,
          v_snapshot, v_fees, 0, v_user)
  RETURNING id INTO v_request_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_amt := (v_line->>'amount')::numeric;
    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

    -- Earnings resolver is gated on commissions.view; no row = not visible or not on this card.
    SELECT e.* INTO v_earn
      FROM fn_consultant_rate_card_earnings(p_consultant_id, p_academic_year) e
     WHERE e.group_id = (v_line->>'group_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'group_not_on_card: %', v_line->>'group_id'; END IF;

    SELECT COALESCE(sum(l.amount), 0) INTO v_held
      FROM public.commission_payment_request_lines l
      JOIN public.commission_payment_requests r ON r.id = l.request_id
     WHERE l.group_id = v_earn.group_id AND r.consultant_id = p_consultant_id
       AND r.status IN ('pending_review', 'pending_disbursement');

    IF v_amt > v_earn.balance_amount - v_held THEN
      RAISE EXCEPTION 'amount_exceeds_payable: % can take at most %', v_earn.group_name,
        GREATEST(v_earn.balance_amount - v_held, 0);
    END IF;

    INSERT INTO public.commission_payment_request_lines
      (request_id, group_id, earned_snapshot, paid_snapshot, balance_snapshot, amount)
    VALUES (v_request_id, v_earn.group_id, COALESCE(v_earn.total_amount, 0), v_earn.paid_amount,
            v_earn.balance_amount, v_amt);
    v_total := v_total + v_amt;
  END LOOP;

  UPDATE public.commission_payment_requests SET total_amount = v_total WHERE id = v_request_id;
  INSERT INTO public.commission_payment_request_actions
    (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (v_request_id, 'initiated', NULL, 'Initiation', v_user,
          fn_commission_payment_actor_role(v_user), p_notes, COALESCE(p_attachments, '[]'));
  RETURN v_request_id;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_act_on_commission_payment_request(
  p_request_id uuid, p_action text, p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]', p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_req public.commission_payment_requests; v_stage jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_action NOT IN ('approve', 'decline') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO v_req FROM public.commission_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_review' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;

  v_stage := v_req.flow_snapshot->'stages'->v_req.current_stage_index;
  IF NOT (is_super_admin()
          OR fn_refund_assignee_match(v_stage->'assignee_roles', v_stage->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_current_stage_assignee';
  END IF;

  IF p_action = 'approve' THEN
    IF COALESCE(btrim(p_notes), '') = '' THEN RAISE EXCEPTION 'notes_required'; END IF;
    INSERT INTO public.commission_payment_request_actions
      (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
    VALUES (p_request_id, 'approved', v_req.current_stage_index, v_stage->>'name', v_user,
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
    VALUES (p_request_id, 'declined', v_req.current_stage_index, v_stage->>'name', v_user,
            fn_commission_payment_actor_role(v_user), COALESCE(NULLIF(btrim(p_notes), ''), p_reason),
            COALESCE(p_attachments, '[]'));
    UPDATE public.commission_payment_requests
       SET status = 'declined', declined_by = v_user, declined_at = now(),
           decline_reason = p_reason, declined_stage_name = v_stage->>'name'
     WHERE id = p_request_id;
  END IF;
END; $$;

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

  SELECT * INTO v_req FROM public.commission_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF v_req.status <> 'pending_disbursement' THEN RAISE EXCEPTION 'invalid_status: %', v_req.status; END IF;
  IF NOT (is_super_admin() OR fn_refund_assignee_match(
            v_req.flow_snapshot->'disburser'->'assignee_roles',
            v_req.flow_snapshot->'disburser'->'assignee_users', v_user)) THEN
    RAISE EXCEPTION 'not_disburser';
  END IF;
  -- Needed for the balance re-check below (see fn_initiate_commission_payment_request).
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.consultants.commissions.view')) THEN
    RAISE EXCEPTION 'commissions_view_required';
  END IF;

  -- Same labels the direct Record Payment dialog stores, so the ledger reads one way.
  v_mode_label := CASE p_payment_mode
    WHEN 'bank_transfer' THEN 'Bank Transfer' WHEN 'upi' THEN 'UPI'
    WHEN 'cheque' THEN 'Cheque' WHEN 'cash' THEN 'Cash' ELSE 'Other' END;

  FOR v_line IN
    SELECT l.*, g.name AS group_name FROM public.commission_payment_request_lines l
      JOIN public.commission_rate_card_groups g ON g.id = l.group_id
     WHERE l.request_id = p_request_id
  LOOP
    -- The balance can shrink while a request waits (a counted learner leaves
    -- Account/Admitted/Active, or someone recorded a direct payment). Paying
    -- past it would create Excess to recover, so refuse and let it be declined
    -- and re-raised for the right amount.
    SELECT e.balance_amount INTO v_balance
      FROM fn_consultant_rate_card_earnings(v_req.consultant_id, v_req.academic_year) e
     WHERE e.group_id = v_line.group_id;
    IF v_line.amount > COALESCE(v_balance, 0) THEN
      RAISE EXCEPTION 'balance_changed: % now has % left to pay, request asks %',
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

  INSERT INTO public.commission_payment_request_actions
    (request_id, action_type, stage_index, stage_name, actor_id, actor_role_name, notes, attachments)
  VALUES (p_request_id, 'disbursed', NULL, 'Disbursement', v_user,
          fn_commission_payment_actor_role(v_user), p_notes, COALESCE(p_attachments, '[]'));

  UPDATE public.commission_payment_requests
     SET status = 'disbursed', payment_mode = p_payment_mode, payment_details = p_payment_details,
         disbursed_by = v_user, disbursed_at = now()
   WHERE id = p_request_id;
END; $$;

-- Revoke from BOTH anon and PUBLIC (anon holds its own default grant).
REVOKE EXECUTE ON FUNCTION public.fn_commission_payment_active_config() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_commission_payment_actor_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_commission_payment_capabilities() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_commission_payment_role_members() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_save_commission_payment_flow_config(uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_initiate_commission_payment_request(uuid,integer,jsonb,text,jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_act_on_commission_payment_request(uuid,text,text,jsonb,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_disburse_commission_payment_request(uuid,text,jsonb,text,jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_touch_commission_payment_updated_at() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_commission_payment_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_commission_payment_role_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_save_commission_payment_flow_config(uuid,text,uuid[],uuid[],jsonb,uuid[],uuid[],boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_initiate_commission_payment_request(uuid,integer,jsonb,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_act_on_commission_payment_request(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_disburse_commission_payment_request(uuid,text,jsonb,text,jsonb) TO authenticated;
