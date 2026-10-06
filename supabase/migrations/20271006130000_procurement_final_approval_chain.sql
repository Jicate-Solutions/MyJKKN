-- Migration: 20271006130000_procurement_final_approval_chain
-- Purpose:   Each category now has TWO approver lists, set by the Super Admin:
--              * Request approval (stage 'request') — the items asked for, as before
--              * Final approval   (stage 'final')   — the vendors and prices chosen
--                after comparing quotations; replaces "only a Super Admin" there
--            A category with no final approvers keeps the old Super Admin final
--            approval. Lists may now be emptied (the last approver can be removed).
--
--            Final approval runs off the RFQ's own status: when the store sends the
--            chosen vendors (procurement_submit_award → pending_award_approval), the
--            category's final steps are copied onto the request, round by round, the
--            same way request steps are. The last approval creates the orders through
--            the same code the Super Admin button used (procurement_award_create_pos).

-- ═══ 1. Stage on steps and on a request's copied steps ═════════════════════════════
ALTER TABLE public.procurement_category_approval_steps
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'request' CHECK (stage IN ('request', 'final'));
ALTER TABLE public.procurement_category_approval_steps
  DROP CONSTRAINT IF EXISTS procurement_category_approval_steps_category_id_step_order_key;
ALTER TABLE public.procurement_category_approval_steps
  ADD CONSTRAINT pcas_category_stage_order_key UNIQUE (category_id, stage, step_order);

ALTER TABLE public.procurement_request_approvals
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'request' CHECK (stage IN ('request', 'final'));
ALTER TABLE public.procurement_request_approvals
  DROP CONSTRAINT IF EXISTS procurement_request_approvals_request_id_round_step_order_key;
ALTER TABLE public.procurement_request_approvals
  ADD CONSTRAINT pra_request_stage_round_order_key UNIQUE (request_id, stage, round, step_order);
-- uq_pra_one_pending (one pending step per request) still holds: the stages run one after the other.

-- ═══ 2. Request stage: only 'request' steps ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_procurement_build_approval_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round   int;
  v_step    record;
  v_ids     uuid[];
  v_status  text;
  v_pending boolean := false;
  v_dept    text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NEW.status = 'cancelled' THEN
    UPDATE procurement_request_approvals SET status = 'cancelled'
     WHERE request_id = NEW.id AND status IN ('waiting', 'pending');
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM 'submitted' OR NEW.category_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft', 'returned')) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM procurement_category_approval_steps
                  WHERE category_id = NEW.category_id AND stage = 'request') THEN
    RAISE EXCEPTION 'No approvers are set for this category yet — ask the Super Admin to set them.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(max(round), 0) + 1 INTO v_round
  FROM procurement_request_approvals WHERE request_id = NEW.id AND stage = 'request';

  FOR v_step IN
    SELECT * FROM procurement_category_approval_steps
    WHERE category_id = NEW.category_id AND stage = 'request' ORDER BY step_order
  LOOP
    IF v_step.approver_kind = 'hod' AND NEW.department_id IS NULL THEN
      RAISE EXCEPTION 'Choose the department this request is for — step % (%) is its HOD.',
        v_step.step_order, v_step.label USING ERRCODE = '23502';
    END IF;
    v_ids := procurement_resolve_step(v_step.approver_kind, v_step.role_key, v_step.same_college,
                                      v_step.user_id, NEW.institution_id, NEW.department_id);
    IF cardinality(v_ids) = 0 THEN
      SELECT coalesce(display_name, department_name) INTO v_dept FROM departments WHERE id = NEW.department_id;
      RAISE EXCEPTION '%', CASE v_step.approver_kind
        WHEN 'hod' THEN format('No HOD is set for %s — ask the admin to set it, then submit again.',
                               coalesce(v_dept, 'this department'))
        ELSE format('Approver %s (%s) has no active account — ask the Super Admin to update the approvers.',
                    v_step.step_order, v_step.label)
      END USING ERRCODE = 'P0001';
    END IF;

    IF NEW.requested_by = ANY (v_ids) THEN
      INSERT INTO procurement_request_approvals
        (request_id, stage, round, step_order, label, approver_kind, approver_ids, status, acted_by, acted_at, remarks)
      VALUES (NEW.id, 'request', v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, 'approved',
              NEW.requested_by, now(), 'Approved — raised by this approver');
      CONTINUE;
    END IF;

    v_status := CASE WHEN NOT v_pending THEN 'pending' ELSE 'waiting' END;
    v_pending := true;
    INSERT INTO procurement_request_approvals
      (request_id, stage, round, step_order, label, approver_kind, approver_ids, status)
    VALUES (NEW.id, 'request', v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, v_status);
  END LOOP;

  IF NOT v_pending THEN
    PERFORM set_config('procurement.chain_ok', 'on', true);
    UPDATE procurement_purchase_requests
       SET status = 'approved', approved_by = NEW.requested_by, approved_at = now(), updated_at = now()
     WHERE id = NEW.id;
    PERFORM set_config('procurement.chain_ok', 'off', true);
    RETURN NULL;
  END IF;

  PERFORM procurement_notify_step(NEW.id, a.id)
     FROM procurement_request_approvals a
    WHERE a.request_id = NEW.id AND a.stage = 'request' AND a.round = v_round AND a.status = 'pending';
  RETURN NULL;
END;
$$;

-- Requester form preview: request-stage approvers only.
CREATE OR REPLACE FUNCTION public.procurement_preview_chain(
  p_category_id uuid, p_institution_id uuid, p_department_id uuid
) RETURNS TABLE (step_order int, label text, approver_kind text, approver_names text, ok boolean, problem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.step_order, s.label, s.approver_kind,
         (SELECT string_agg(p.full_name, ', ' ORDER BY p.full_name) FROM profiles p WHERE p.id = ANY (r.ids)),
         cardinality(r.ids) > 0,
         CASE WHEN cardinality(r.ids) > 0 THEN NULL
              WHEN s.approver_kind = 'hod' AND p_department_id IS NULL THEN 'Choose the department'
              WHEN s.approver_kind = 'hod' THEN 'No HOD is set for this department'
              WHEN s.approver_kind = 'role' THEN 'Nobody holds this role'
              ELSE 'This person''s account is inactive' END
  FROM procurement_category_approval_steps s
  CROSS JOIN LATERAL (SELECT procurement_resolve_step(s.approver_kind, s.role_key, s.same_college,
                             s.user_id, p_institution_id, p_department_id) AS ids) r
  WHERE s.category_id = p_category_id AND s.stage = 'request'
  ORDER BY s.step_order;
$$;

-- ═══ 3. Saving a list: per stage, 0–10 approvers ══════════════════════════════════
DROP FUNCTION IF EXISTS public.procurement_save_category_steps(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.procurement_save_category_steps(
  p_category_id uuid, p_steps jsonb, p_stage text DEFAULT 'request'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  i int := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can change approval flows.' USING ERRCODE = '42501';
  END IF;
  IF p_stage NOT IN ('request', 'final') THEN RAISE EXCEPTION 'Unknown approval list %.', p_stage; END IF;
  IF NOT EXISTS (SELECT 1 FROM procurement_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) > 10 THEN
    RAISE EXCEPTION 'A list can have up to 10 approvers.';
  END IF;
  DELETE FROM procurement_category_approval_steps WHERE category_id = p_category_id AND stage = p_stage;
  FOR v IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    i := i + 1;
    IF v->>'approver_kind' = 'role' AND NOT EXISTS (
         SELECT 1 FROM custom_roles WHERE role_key = v->>'role_key' AND coalesce(is_active, true)) THEN
      RAISE EXCEPTION 'Approver %: role "%" does not exist.', i, v->>'role_key';
    END IF;
    IF v->>'approver_kind' = 'user' AND NOT EXISTS (
         SELECT 1 FROM profiles WHERE id = (v->>'user_id')::uuid) THEN
      RAISE EXCEPTION 'Approver %: choose a person.', i;
    END IF;
    INSERT INTO procurement_category_approval_steps
      (category_id, stage, step_order, label, approver_kind, role_key, same_college, user_id)
    VALUES (p_category_id, p_stage, i, trim(v->>'label'), v->>'approver_kind',
            CASE WHEN v->>'approver_kind' = 'role' THEN v->>'role_key' END,
            coalesce((v->>'same_college')::boolean, true),
            CASE WHEN v->>'approver_kind' = 'user' THEN (v->>'user_id')::uuid END);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.procurement_save_category_steps(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_save_category_steps(uuid, jsonb, text) TO authenticated;

-- ═══ 4. Creating the orders: one place, used by the Super Admin and the final chain ══
CREATE OR REPLACE FUNCTION public.procurement_award_create_pos(p_rfq_id uuid, p_approver uuid)
RETURNS SETOF public.procurement_purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rfq     public.procurement_rfqs;
  v_vendor  record;
  v_po      public.procurement_purchase_orders;
  v_num     int;
  v_created int := 0;
BEGIN
  SELECT * INTO v_rfq FROM public.procurement_rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_rfq.status <> 'pending_award_approval' THEN
    RAISE EXCEPTION 'This RFQ is %, not waiting for approval — refresh the page',
      replace(v_rfq.status, '_', ' ') USING ERRCODE = '55000';
  END IF;
  PERFORM set_config('procurement.chain_ok', 'on', true);
  FOR v_vendor IN
    SELECT q.supplier_id,
           max(q.payment_terms)                                   AS payment_terms,
           sum(qi.unit_price * coalesce(qi.quantity, ri.quantity)) AS subtotal
      FROM public.procurement_quotations q
      JOIN public.procurement_quotation_items qi ON qi.quotation_id = q.id
      JOIN public.procurement_rfq_items ri       ON ri.id = qi.rfq_item_id
     WHERE q.rfq_id = p_rfq_id
       AND qi.awarded
       AND qi.unit_price IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.procurement_purchase_orders po
                        WHERE po.rfq_id = p_rfq_id AND po.supplier_id = q.supplier_id)
     GROUP BY q.supplier_id
     ORDER BY q.supplier_id
  LOOP
    v_num := public.procurement_next_number(v_rfq.institution_id, 'PO', current_date);
    INSERT INTO public.procurement_purchase_orders (
      institution_id, store_id, po_number, supplier_id, rfq_id, domain, status,
      subtotal, tax_amount, total_amount, payment_terms, po_format_id,
      approved_by, approved_at, created_by
    )
    SELECT v_rfq.institution_id, v_rfq.store_id,
           'PO-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_num::text, 5, '0'),
           v_vendor.supplier_id, p_rfq_id, v_rfq.domain, 'approved',
           v_vendor.subtotal, 0, v_vendor.subtotal, v_vendor.payment_terms,
           s.default_po_format_id,
           p_approver, now(), coalesce(v_rfq.award_submitted_by, v_rfq.created_by)
      FROM (SELECT 1) one
      LEFT JOIN public.ims_suppliers s ON s.id = v_vendor.supplier_id
    RETURNING * INTO v_po;
    INSERT INTO public.procurement_purchase_order_items (
      po_id, rfq_item_id, source_quotation_item_id, domain_item_id,
      item_name, item_spec, ordered_quantity, unit_id, unit_label,
      unit_price, line_total
    )
    SELECT v_po.id, ri.id, qi.id, ri.domain_item_id,
           ri.item_name, ri.item_spec, coalesce(qi.quantity, ri.quantity),
           ri.unit_id, ri.unit_label,
           qi.unit_price, qi.unit_price * coalesce(qi.quantity, ri.quantity)
      FROM public.procurement_quotations q
      JOIN public.procurement_quotation_items qi ON qi.quotation_id = q.id
      JOIN public.procurement_rfq_items ri       ON ri.id = qi.rfq_item_id
     WHERE q.rfq_id = p_rfq_id
       AND q.supplier_id = v_vendor.supplier_id
       AND qi.awarded
       AND qi.unit_price IS NOT NULL
     ORDER BY ri.created_at;
    v_created := v_created + 1;
    RETURN NEXT v_po;
  END LOOP;
  UPDATE public.procurement_rfqs
     SET status = 'awarded', award_approved_by = p_approver, award_approved_at = now(), updated_at = now()
   WHERE id = p_rfq_id;
  PERFORM set_config('procurement.chain_ok', 'off', true);
  IF v_created = 0 AND NOT EXISTS (
       SELECT 1 FROM public.procurement_purchase_orders WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'No vendor is chosen on this RFQ — send it back instead'
      USING ERRCODE = '22023';
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.procurement_award_create_pos(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.procurement_approve_award(uuid) FROM public, anon;

-- The Super Admin button: unchanged for categories without final approvers.
-- SECURITY DEFINER: it calls procurement_award_create_pos, which callers can't run directly.
CREATE OR REPLACE FUNCTION public.procurement_approve_award(p_rfq_id uuid)
RETURNS SETOF public.procurement_purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can approve a vendor award' USING ERRCODE = '42501';
  END IF;
  -- Close any open final-approval steps: the Super Admin decided for everyone.
  UPDATE procurement_request_approvals a
     SET status = CASE WHEN a.status = 'pending' THEN 'approved' ELSE 'cancelled' END,
         acted_by = CASE WHEN a.status = 'pending' THEN auth.uid() END,
         acted_at = CASE WHEN a.status = 'pending' THEN now() END,
         on_behalf = a.status = 'pending'
    FROM procurement_rfqs r
   WHERE r.id = p_rfq_id AND a.request_id = r.source_request_id
     AND a.stage = 'final' AND a.status IN ('pending', 'waiting');
  RETURN QUERY SELECT * FROM public.procurement_award_create_pos(p_rfq_id, auth.uid());
END;
$$;

-- ═══ 5. Final stage: copy the category's final approvers when the award is sent ════
CREATE OR REPLACE FUNCTION public.fn_procurement_build_final_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req     procurement_purchase_requests%ROWTYPE;
  v_round   int;
  v_step    record;
  v_ids     uuid[];
  v_pending boolean := false;
  v_sender  uuid := coalesce(NEW.award_submitted_by, auth.uid());
BEGIN
  -- Leaving the approval any other way (Super Admin send back, cancel): close open steps.
  IF OLD.status = 'pending_award_approval' AND NEW.status <> 'pending_award_approval' THEN
    UPDATE procurement_request_approvals SET status = 'cancelled'
     WHERE request_id = NEW.source_request_id AND stage = 'final' AND status IN ('waiting', 'pending');
    RETURN NULL;
  END IF;
  IF NEW.status <> 'pending_award_approval' OR OLD.status = 'pending_award_approval'
     OR NEW.source_request_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = NEW.source_request_id;
  IF v_req.category_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM procurement_category_approval_steps
        WHERE category_id = v_req.category_id AND stage = 'final') THEN
    RETURN NULL; -- no final approvers set: the Super Admin approves, as before
  END IF;

  SELECT coalesce(max(round), 0) + 1 INTO v_round
  FROM procurement_request_approvals WHERE request_id = v_req.id AND stage = 'final';

  FOR v_step IN
    SELECT * FROM procurement_category_approval_steps
    WHERE category_id = v_req.category_id AND stage = 'final' ORDER BY step_order
  LOOP
    v_ids := procurement_resolve_step(v_step.approver_kind, v_step.role_key, v_step.same_college,
                                      v_step.user_id, v_req.institution_id, v_req.department_id);
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'Final approver % (%) has no active account — ask the Super Admin to update the approvers.',
        v_step.step_order, v_step.label USING ERRCODE = 'P0001';
    END IF;
    IF v_sender = ANY (v_ids) THEN
      INSERT INTO procurement_request_approvals
        (request_id, stage, round, step_order, label, approver_kind, approver_ids, status, acted_by, acted_at, remarks)
      VALUES (v_req.id, 'final', v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, 'approved',
              v_sender, now(), 'Approved — sent by this approver');
      CONTINUE;
    END IF;
    INSERT INTO procurement_request_approvals
      (request_id, stage, round, step_order, label, approver_kind, approver_ids, status)
    VALUES (v_req.id, 'final', v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids,
            CASE WHEN v_pending THEN 'waiting' ELSE 'pending' END);
    v_pending := true;
  END LOOP;

  IF NOT v_pending THEN
    PERFORM procurement_award_create_pos(NEW.id, v_sender);
    RETURN NULL;
  END IF;
  PERFORM procurement_notify_step(v_req.id, a.id)
     FROM procurement_request_approvals a
    WHERE a.request_id = v_req.id AND a.stage = 'final' AND a.round = v_round AND a.status = 'pending';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_build_final_chain ON public.procurement_rfqs;
CREATE TRIGGER trg_procurement_build_final_chain
  AFTER UPDATE OF status ON public.procurement_rfqs
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_build_final_chain();

-- ═══ 6. Acting on a step: request stage as before; final stage creates the orders ══
CREATE OR REPLACE FUNCTION public.procurement_approve_request_step(
  p_request_id uuid, p_remarks text DEFAULT NULL, p_item_changes jsonb DEFAULT '[]'::jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_req  procurement_purchase_requests%ROWTYPE;
  v_rfq  uuid;
  v_step procurement_request_approvals%ROWTYPE;
  v_next procurement_request_approvals%ROWTYPE;
  v_mine boolean;
  v_chg  jsonb;
  v_qty  numeric;
  v_item record;
  v_diff text[] := '{}';
  v_note text := nullif(trim(coalesce(p_remarks, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing is waiting for approval on this request.'; END IF;

  IF v_step.stage = 'request' AND v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'This request is not waiting for approval (it is %).', v_req.status;
  END IF;
  IF v_step.stage = 'final' THEN
    SELECT id INTO v_rfq FROM procurement_rfqs
     WHERE source_request_id = p_request_id AND status = 'pending_award_approval' LIMIT 1;
    IF v_rfq IS NULL THEN RAISE EXCEPTION 'The chosen vendors are not waiting for approval — refresh the page.'; END IF;
  END IF;

  v_mine := v_me = ANY (v_step.approver_ids);
  IF NOT v_mine AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;
  IF v_step.stage = 'request' AND v_req.requested_by = v_me AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'You cannot approve your own request.' USING ERRCODE = '42501';
  END IF;

  IF v_step.stage = 'request' THEN
    FOR v_chg IN SELECT * FROM jsonb_array_elements(coalesce(p_item_changes, '[]'::jsonb)) LOOP
      v_qty := (v_chg->>'quantity')::numeric;
      IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than 0.'; END IF;
      SELECT id, item_name, unit_label, required_quantity INTO v_item
        FROM procurement_purchase_request_items
       WHERE id = (v_chg->>'item_id')::uuid AND request_id = p_request_id;
      IF FOUND AND v_item.required_quantity <> v_qty THEN
        UPDATE procurement_purchase_request_items
           SET original_quantity    = coalesce(original_quantity, required_quantity),
               required_quantity    = v_qty,
               quantity_modified_by = v_me,
               quantity_modified_at = now()
         WHERE id = v_item.id;
        v_diff := v_diff || format('%s %s%s → %s%s', v_item.item_name, v_item.required_quantity,
                                   coalesce(v_item.unit_label, ''), v_qty, coalesce(v_item.unit_label, ''));
      END IF;
    END LOOP;
  END IF;

  UPDATE procurement_request_approvals
     SET status = 'approved', acted_by = v_me, acted_at = now(), on_behalf = NOT v_mine, remarks = v_note
   WHERE id = v_step.id;

  IF cardinality(v_diff) > 0 THEN
    UPDATE procurement_purchase_requests
       SET notes = concat_ws(E'\n', notes, format('Qty changed by %s: %s%s', v_step.label,
                   array_to_string(v_diff, '; '), coalesce(' — ' || v_note, '')))
     WHERE id = p_request_id;
  END IF;

  SELECT * INTO v_next FROM procurement_request_approvals
   WHERE request_id = p_request_id AND stage = v_step.stage AND round = v_step.round AND status = 'waiting'
   ORDER BY step_order LIMIT 1;
  IF FOUND THEN
    UPDATE procurement_request_approvals SET status = 'pending' WHERE id = v_next.id;
    PERFORM procurement_notify_step(p_request_id, v_next.id);
    RETURN 'next';
  END IF;

  IF v_step.stage = 'final' THEN
    PERFORM procurement_award_create_pos(v_rfq, v_me);
    PERFORM procurement_notify_users(
      p_request_id, ARRAY[v_req.requested_by],
      'Purchase ' || v_req.request_number || ' — vendors approved, orders created',
      'The final approval is done.', 'Open purchase',
      'procurement_pr_final_approved:' || p_request_id || ':' || v_step.round);
    RETURN 'approved';
  END IF;

  PERFORM set_config('procurement.chain_ok', 'on', true);
  UPDATE procurement_purchase_requests
     SET status = 'approved', approved_by = v_me, approved_at = now(),
         rejection_reason = NULL, updated_at = now()
   WHERE id = p_request_id;
  PERFORM set_config('procurement.chain_ok', 'off', true);

  PERFORM procurement_notify_users(
    p_request_id, ARRAY[v_req.requested_by],
    'Purchase request ' || v_req.request_number || ' is approved',
    'All approval steps are done — it now goes for quotations.',
    'Open request',
    'procurement_pr_approved:' || p_request_id || ':' || v_step.round);
  RETURN 'approved';
END;
$$;

-- Send back / reject. At the final stage there is only "send back": the chosen
-- vendors go back to the store to change (the request itself stays approved).
CREATE OR REPLACE FUNCTION public.procurement_decide_request_step(
  p_request_id uuid, p_decision text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_req  procurement_purchase_requests%ROWTYPE;
  v_step procurement_request_approvals%ROWTYPE;
  v_why  text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('return', 'reject') THEN RAISE EXCEPTION 'Unknown decision %.', p_decision; END IF;
  IF v_why IS NULL THEN
    RAISE EXCEPTION '%', CASE p_decision WHEN 'return' THEN 'Say what must change.'
                                         ELSE 'Say why it is rejected.' END USING ERRCODE = '23502';
  END IF;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found.'; END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nothing is waiting for approval on this request.'; END IF;
  IF NOT (v_me = ANY (v_step.approver_ids)) AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;
  IF v_step.stage = 'final' AND p_decision = 'reject' THEN
    RAISE EXCEPTION 'At the final approval, send it back to the store to change the vendors instead.';
  END IF;

  UPDATE procurement_request_approvals
     SET status   = CASE p_decision WHEN 'return' THEN 'returned' ELSE 'rejected' END,
         acted_by = v_me, acted_at = now(), on_behalf = NOT (v_me = ANY (approver_ids)), remarks = v_why
   WHERE id = v_step.id;
  UPDATE procurement_request_approvals SET status = 'cancelled'
   WHERE request_id = p_request_id AND stage = v_step.stage AND round = v_step.round AND status = 'waiting';

  PERFORM set_config('procurement.chain_ok', 'on', true);
  IF v_step.stage = 'final' THEN
    UPDATE procurement_rfqs
       SET status = 'draft', award_rejection_reason = v_step.label || ': ' || v_why, updated_at = now()
     WHERE source_request_id = p_request_id AND status = 'pending_award_approval';
  ELSIF p_decision = 'return' THEN
    UPDATE procurement_purchase_requests
       SET status = 'returned', returned_reason = v_why,
           notes = concat_ws(E'\n', notes, 'Sent back by ' || v_step.label || ': ' || v_why),
           updated_at = now()
     WHERE id = p_request_id;
  ELSE
    UPDATE procurement_purchase_requests
       SET status = 'rejected', approved_by = v_me, approved_at = now(),
           rejection_reason = v_step.label || ': ' || v_why, updated_at = now()
     WHERE id = p_request_id;
    PERFORM procurement_notify_users(
      p_request_id, ARRAY[v_req.requested_by],
      'Purchase request ' || v_req.request_number || ' was rejected',
      v_step.label || ': ' || v_why, 'Open request',
      'procurement_pr_rejected:' || p_request_id || ':' || v_step.round);
  END IF;
  PERFORM set_config('procurement.chain_ok', 'off', true);
END;
$$;

-- Notification wording per stage.
CREATE OR REPLACE FUNCTION public.procurement_notify_step(p_request_id uuid, p_step_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_step  procurement_request_approvals%ROWTYPE;
  v_req   procurement_purchase_requests%ROWTYPE;
  v_who   text;
  v_inst  text;
  v_total int;
BEGIN
  SELECT * INTO v_step FROM procurement_request_approvals WHERE id = p_step_id;
  SELECT * INTO v_req  FROM procurement_purchase_requests WHERE id = p_request_id;
  SELECT full_name INTO v_who FROM profiles WHERE id = v_req.requested_by;
  SELECT name INTO v_inst FROM institutions WHERE id = v_req.institution_id;
  SELECT count(*) INTO v_total FROM procurement_request_approvals
   WHERE request_id = p_request_id AND stage = v_step.stage AND round = v_step.round;
  PERFORM procurement_notify_users(
    p_request_id, v_step.approver_ids,
    CASE v_step.stage
      WHEN 'final' THEN 'Purchase ' || v_req.request_number || ' — approve the chosen vendors and prices'
      ELSE 'Purchase request ' || v_req.request_number || ' needs your approval'
    END,
    coalesce(nullif(trim(v_req.title), ''), 'Purchase') || coalesce(' for ' || v_inst, '')
      || ' · raised by ' || coalesce(v_who, 'someone')
      || ' · approver ' || v_step.step_order || ' of ' || v_total,
    CASE v_step.stage WHEN 'final' THEN 'Review vendors' ELSE 'Review request' END,
    'procurement_pr_step:' || p_step_id
  );
END;
$$;

DROP FUNCTION IF EXISTS public.procurement_my_approvals();
CREATE FUNCTION public.procurement_my_approvals()
RETURNS TABLE (request_id uuid, request_number text, title text, institution_name text,
               category_name text, step_label text, step_order int, steps_total int,
               requested_by_name text, submitted_at timestamptz, stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.request_number, r.title, i.name, c.name, a.label, a.step_order,
         (SELECT count(*)::int FROM procurement_request_approvals x
           WHERE x.request_id = r.id AND x.stage = a.stage AND x.round = a.round),
         pr.full_name, r.submitted_at, a.stage
  FROM procurement_request_approvals a
  JOIN procurement_purchase_requests r ON r.id = a.request_id
  LEFT JOIN institutions i ON i.id = r.institution_id
  LEFT JOIN procurement_categories c ON c.id = r.category_id
  LEFT JOIN profiles pr ON pr.id = r.requested_by
  WHERE a.status = 'pending' AND (SELECT auth.uid()) = ANY (a.approver_ids)
  ORDER BY r.submitted_at;
$$;
REVOKE ALL ON FUNCTION public.procurement_my_approvals() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_my_approvals() TO authenticated;

-- ═══ 7. Guard: chain-driven changes skip the role checks ══════════════════════════
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key   text;
  v_what  text;
  v_chain boolean := current_setting('procurement.chain_ok', true) = 'on';
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'procurement_rfqs'
     AND (NEW.status = 'awarded'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'pending_award_approval')) THEN
    IF NOT v_chain AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to approve or send back a vendor award — only its final approvers can'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected', 'returned') THEN
        IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT NULL
           AND public.procurement_request_has_chain(NEW.id) THEN
          IF NOT v_chain THEN
            RAISE EXCEPTION 'this request follows its category''s approval steps — use Approve / Send back on the request'
              USING ERRCODE = '42501';
          END IF;
        ELSE
          v_key  := 'procurement.request_approve';
          v_what := 'approve, reject or send back a purchase requisition';
        END IF;
      END IF;
      IF NEW.status = 'returned' THEN
        IF nullif(trim(coalesce(NEW.returned_reason, '')), '') IS NULL THEN
          RAISE EXCEPTION 'say what the requester must change before sending it back'
            USING ERRCODE = '23502';
        END IF;
        NEW.returned_by  := coalesce(NEW.returned_by, auth.uid());
        NEW.returned_at  := now();
        NEW.return_count := coalesce(OLD.return_count, 0) + 1;
      END IF;
      IF NEW.status = 'approved' THEN
        NEW.approved_by := coalesce(NEW.approved_by, auth.uid());
        NEW.approved_at := coalesce(NEW.approved_at, now());
        IF NEW.approved_by IS NULL THEN
          RAISE EXCEPTION 'an approved request must record who approved it'
            USING ERRCODE = '23502';
        END IF;
        IF NOT v_chain AND NEW.requested_by IS NOT DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
          RAISE EXCEPTION 'you cannot approve your own request — another approver must sign it off'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    WHEN 'procurement_rfqs' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.rfq_approve';
        v_what := 'approve or reject an RFQ';
      END IF;
    WHEN 'procurement_purchase_orders' THEN
      IF NEW.status IN ('approved', 'rejected') THEN
        v_key  := 'procurement.po_approve';
        v_what := 'approve or reject a purchase order';
      END IF;
    WHEN 'procurement_grn' THEN
      IF NEW.status IN ('accepted', 'partially_accepted', 'replacement_requested')
         AND (TG_OP = 'INSERT' OR OLD.status IN ('draft', 'pending_verification')) THEN
        v_key  := 'procurement.grn_verify';
        v_what := 'verify a goods receipt note';
      END IF;
  END CASE;
  IF v_key IS NULL OR v_chain THEN
    RETURN NEW;
  END IF;
  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$function$;

-- ═══ 8. Final approvers can read what they approve ══════════════════════════════
CREATE OR REPLACE FUNCTION public.procurement_is_rfq_approver(p_rfq_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurement_rfqs r
     JOIN procurement_request_approvals a ON a.request_id = r.source_request_id
    WHERE r.id = p_rfq_id AND (SELECT auth.uid()) = ANY (a.approver_ids)
  );
$$;
REVOKE ALL ON FUNCTION public.procurement_is_rfq_approver(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.procurement_is_rfq_approver(uuid) TO authenticated;

DROP POLICY IF EXISTS prfq_approver_read ON public.procurement_rfqs;
CREATE POLICY prfq_approver_read ON public.procurement_rfqs
  FOR SELECT TO authenticated USING (public.procurement_is_rfq_approver(id));
DROP POLICY IF EXISTS prfqi_approver_read ON public.procurement_rfq_items;
CREATE POLICY prfqi_approver_read ON public.procurement_rfq_items
  FOR SELECT TO authenticated USING (public.procurement_is_rfq_approver(rfq_id));
DROP POLICY IF EXISTS pq_approver_read ON public.procurement_quotations;
CREATE POLICY pq_approver_read ON public.procurement_quotations
  FOR SELECT TO authenticated USING (public.procurement_is_rfq_approver(rfq_id));
DROP POLICY IF EXISTS pqi_approver_read ON public.procurement_quotation_items;
CREATE POLICY pqi_approver_read ON public.procurement_quotation_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM procurement_quotations q
     WHERE q.id = quotation_id AND public.procurement_is_rfq_approver(q.rfq_id)));
DROP POLICY IF EXISTS ims_suppliers_rfq_approver_read ON public.ims_suppliers;
CREATE POLICY ims_suppliers_rfq_approver_read ON public.ims_suppliers
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM procurement_quotations q
     WHERE q.supplier_id = ims_suppliers.id AND public.procurement_is_rfq_approver(q.rfq_id)));
