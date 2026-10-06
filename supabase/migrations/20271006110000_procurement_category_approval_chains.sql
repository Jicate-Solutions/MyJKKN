-- Migration: 20271006110000_procurement_category_approval_chains
-- Purpose:   A purchase request is approved, once, by the steps the Super Admin set for
--            its CATEGORY (e.g. HOD → Principal → CAO → Chairperson) instead of "anyone
--            holding procurement.request_approve".
--
--            * The requester chooses the category (and the department when a step is
--              its HOD). They never choose approvers.
--            * At submit the category's steps are COPIED onto the request and every step
--              is resolved to real people. If any step has nobody, the submit fails with
--              a message naming it — a request can never sit waiting for no one.
--            * Each step is acted on only through procurement_approve_request_step /
--              procurement_decide_request_step ("is it your turn"). The last approval
--              flips the request to 'approved'.
--            * Requests with no category keep the old rule, untouched.
--            * Categories and steps: Super Admin only.
--
--            Plan: docs/plans/2026-10-06-procurement-category-approval-chains.md

-- ═══ 1. Tables ════════════════════════════════════════════════════════════════════

-- Group-wide on purpose (no institution_id): one chain serves every college; the
-- college-specific people (HOD, Principal) are resolved per request.
CREATE TABLE IF NOT EXISTS public.procurement_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_categories_name
  ON public.procurement_categories (lower(trim(name)));
DROP TRIGGER IF EXISTS trg_procurement_categories_updated_at ON public.procurement_categories;
CREATE TRIGGER trg_procurement_categories_updated_at
  BEFORE UPDATE ON public.procurement_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMENT ON TABLE public.procurement_categories IS
  'Purchase categories. Each has an ordered approval chain (procurement_category_approval_steps). Super Admin only.';

CREATE TABLE IF NOT EXISTS public.procurement_category_approval_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid NOT NULL REFERENCES public.procurement_categories(id) ON DELETE CASCADE,
  step_order    int  NOT NULL CHECK (step_order BETWEEN 1 AND 10),
  label         text NOT NULL CHECK (length(trim(label)) > 0),
  approver_kind text NOT NULL CHECK (approver_kind IN ('hod', 'role', 'user')),
  role_key      text,
  same_college  boolean NOT NULL DEFAULT true,
  user_id       uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, step_order),
  CHECK ((approver_kind = 'role') = (role_key IS NOT NULL)),
  CHECK ((approver_kind = 'user') = (user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_pcas_category ON public.procurement_category_approval_steps (category_id);
COMMENT ON COLUMN public.procurement_category_approval_steps.same_college IS
  'For a role step: true = holders in the request''s college only (Principal); false = anywhere (CAO).';

ALTER TABLE public.procurement_purchase_requests
  ADD COLUMN IF NOT EXISTS category_id   uuid REFERENCES public.procurement_categories(id),
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);
CREATE INDEX IF NOT EXISTS idx_ppr_category ON public.procurement_purchase_requests (category_id);
COMMENT ON COLUMN public.procurement_purchase_requests.category_id IS
  'Chosen by the requester; decides the approval chain. NULL = legacy rule (procurement.request_approve).';
COMMENT ON COLUMN public.procurement_purchase_requests.department_id IS
  'The department the purchase is FOR — its HOD approves a hod step. Not the requester''s own department.';

CREATE TABLE IF NOT EXISTS public.procurement_request_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.procurement_purchase_requests(id) ON DELETE CASCADE,
  round         int  NOT NULL,
  step_order    int  NOT NULL,
  label         text NOT NULL,
  approver_kind text NOT NULL,
  approver_ids  uuid[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'pending', 'approved', 'skipped', 'returned', 'rejected', 'cancelled')),
  acted_by      uuid REFERENCES public.profiles(id),
  acted_at      timestamptz,
  on_behalf     boolean NOT NULL DEFAULT false,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, round, step_order),
  CHECK (status IN ('skipped', 'cancelled') OR cardinality(approver_ids) > 0)
);
CREATE INDEX IF NOT EXISTS idx_pra_request ON public.procurement_request_approvals (request_id, round);
CREATE INDEX IF NOT EXISTS idx_pra_approvers ON public.procurement_request_approvals USING gin (approver_ids);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pra_one_pending
  ON public.procurement_request_approvals (request_id) WHERE status = 'pending';
COMMENT ON TABLE public.procurement_request_approvals IS
  'A request''s approval steps, copied from its category at submit with the people resolved then. '
  'Written only by the SECURITY DEFINER functions in 20271006110000.';

-- ═══ 2. Helpers ═══════════════════════════════════════════════════════════════════

-- SECURITY DEFINER so request ↔ approvals policies never recurse into each other.
CREATE OR REPLACE FUNCTION public.procurement_is_request_approver(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM procurement_request_approvals a
    WHERE a.request_id = p_request_id AND (SELECT auth.uid()) = ANY (a.approver_ids)
  );
$$;

CREATE OR REPLACE FUNCTION public.procurement_request_has_chain(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM procurement_request_approvals a WHERE a.request_id = p_request_id);
$$;

-- One step → the active people who may approve it.
CREATE OR REPLACE FUNCTION public.procurement_resolve_step(
  p_kind text, p_role_key text, p_same_college boolean, p_user_id uuid,
  p_institution_id uuid, p_department_id uuid
) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT p.id), '{}')
  FROM profiles p
  WHERE coalesce(p.is_active, true)
    AND NOT coalesce(p.is_login_disabled, false)
    AND CASE p_kind
      WHEN 'user' THEN p.id = p_user_id
      WHEN 'hod'  THEN p.id = (SELECT d.head_of_department_id FROM departments d WHERE d.id = p_department_id)
      WHEN 'role' THEN
        (EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                 WHERE ur.user_id = p.id AND cr.role_key = p_role_key AND coalesce(cr.is_active, true))
         OR p.role = p_role_key)
        AND (NOT p_same_college OR p.institution_id = p_institution_id)
      ELSE false
    END;
$$;

-- In-app notification to a set of people (same shape as fn_procurement_notify_request_submitted).
CREATE OR REPLACE FUNCTION public.procurement_notify_users(
  p_request_id uuid, p_user_ids uuid[], p_title text, p_body text, p_action text, p_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req      procurement_purchase_requests%ROWTYPE;
  v_notif_id uuid;
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN RETURN; END IF;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = p_request_id;
  INSERT INTO notifications (
    title, body, url, created_by, targeting, priority, category, metadata, idempotency_key
  ) VALUES (
    p_title, p_body, '/procurement/requests/' || p_request_id,
    coalesce(auth.uid(), v_req.requested_by, p_user_ids[1]),
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(p_user_ids)),
    'high', 'procurement',
    jsonb_build_object('type', 'info', 'source', 'procurement_approval_chain',
                       'request_id', p_request_id, 'action_label', p_action),
    p_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_notif_id;
  IF v_notif_id IS NOT NULL THEN
    INSERT INTO user_notifications (notification_id, user_id)
    SELECT v_notif_id, unnest(p_user_ids)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never undo an approval.
  RAISE WARNING 'procurement_notify_users(%): %', p_request_id, SQLERRM;
END;
$$;

-- Tell a step's approvers it is their turn.
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
   WHERE request_id = p_request_id AND round = v_step.round;
  PERFORM procurement_notify_users(
    p_request_id, v_step.approver_ids,
    'Purchase request ' || v_req.request_number || ' needs your approval (' || v_step.label || ')',
    coalesce(v_who, 'Someone') || ' requested ' || coalesce(nullif(trim(v_req.title), ''), 'items')
      || coalesce(' for ' || v_inst, '') || ' — step ' || v_step.step_order || ' of ' || v_total,
    'Review request',
    'procurement_pr_step:' || p_step_id
  );
END;
$$;

-- ═══ 3. Submit: copy the category's steps and resolve the people ═══════════════════

CREATE OR REPLACE FUNCTION public.fn_procurement_build_approval_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round   int;
  v_step    record;
  v_ids     uuid[];
  v_status  text;
  v_any     boolean := false;
  v_pending boolean := false;
  v_dept    text;
BEGIN
  -- Leaving 'submitted' without a decision (cancelled): close the open steps.
  IF TG_OP = 'UPDATE' AND OLD.status = 'submitted' AND NEW.status = 'cancelled' THEN
    UPDATE procurement_request_approvals SET status = 'cancelled'
     WHERE request_id = NEW.id AND status IN ('waiting', 'pending');
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM 'submitted' OR NEW.category_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.status NOT IN ('draft', 'returned')) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(max(round), 0) + 1 INTO v_round
  FROM procurement_request_approvals WHERE request_id = NEW.id;

  FOR v_step IN
    SELECT * FROM procurement_category_approval_steps
    WHERE category_id = NEW.category_id ORDER BY step_order
  LOOP
    v_any := true;
    IF v_step.approver_kind = 'hod' AND NEW.department_id IS NULL THEN
      RAISE EXCEPTION 'Choose the department this request is for — step % (%) is its HOD.',
        v_step.step_order, v_step.label USING ERRCODE = '23502';
    END IF;

    v_ids := procurement_resolve_step(v_step.approver_kind, v_step.role_key, v_step.same_college,
                                      v_step.user_id, NEW.institution_id, NEW.department_id);
    IF cardinality(v_ids) = 0 THEN
      SELECT coalesce(display_name, department_name) INTO v_dept FROM departments WHERE id = NEW.department_id;
      RAISE EXCEPTION '%', CASE v_step.approver_kind
        WHEN 'hod'  THEN format('No HOD is set for %s — ask the admin to set it, then submit again.',
                                coalesce(v_dept, 'this department'))
        WHEN 'role' THEN format('Step %s (%s) has no approver: nobody holds the "%s" role%s.',
                                v_step.step_order, v_step.label, v_step.role_key,
                                CASE WHEN v_step.same_college THEN ' in this college' ELSE '' END)
        ELSE format('Step %s (%s) has no approver: that person''s account is inactive.',
                    v_step.step_order, v_step.label)
      END USING ERRCODE = 'P0001';
    END IF;

    -- Nobody approves their own request.
    v_ids := array_remove(v_ids, NEW.requested_by);
    v_status := CASE WHEN cardinality(v_ids) = 0 THEN 'skipped'
                     WHEN NOT v_pending THEN 'pending'
                     ELSE 'waiting' END;
    IF v_status = 'pending' THEN v_pending := true; END IF;

    INSERT INTO procurement_request_approvals
      (request_id, round, step_order, label, approver_kind, approver_ids, status, remarks)
    VALUES (NEW.id, v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, v_status,
            CASE WHEN v_status = 'skipped' THEN 'Skipped — the requester is this approver' END);
  END LOOP;

  IF NOT v_any THEN
    RAISE EXCEPTION 'No approval steps are set for this category yet — ask the Super Admin to set them.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Every step was the requester: a Super Admin signs instead.
  IF NOT v_pending THEN
    SELECT coalesce(array_agg(p.id), '{}') INTO v_ids FROM profiles p
     WHERE (coalesce(p.is_super_admin, false) OR p.role = 'super_admin')
       AND coalesce(p.is_active, true) AND p.id IS DISTINCT FROM NEW.requested_by;
    IF cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'You are every approver of this category — no one else can approve it.';
    END IF;
    INSERT INTO procurement_request_approvals
      (request_id, round, step_order, label, approver_kind, approver_ids, status)
    VALUES (NEW.id, v_round, 99, 'Super Admin', 'role', v_ids, 'pending');
  END IF;

  PERFORM procurement_notify_step(NEW.id, a.id)
     FROM procurement_request_approvals a
    WHERE a.request_id = NEW.id AND a.round = v_round AND a.status = 'pending';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_build_approval_chain ON public.procurement_purchase_requests;
CREATE TRIGGER trg_procurement_build_approval_chain
  AFTER INSERT OR UPDATE OF status ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_build_approval_chain();

-- Chain requests notify their own approvers (above) — not every request_approve holder.
DROP TRIGGER IF EXISTS trg_ppr_notify_submitted ON public.procurement_purchase_requests;
CREATE TRIGGER trg_ppr_notify_submitted
  AFTER INSERT OR UPDATE OF status ON public.procurement_purchase_requests
  FOR EACH ROW WHEN (NEW.category_id IS NULL)
  EXECUTE FUNCTION public.fn_procurement_notify_request_submitted();

-- ═══ 4. Guard: a chain request changes status only through the step RPCs ══════════
-- Same body as 20271006100000 §2, plus the chain branch for purchase requests.
CREATE OR REPLACE FUNCTION public.fn_procurement_guard_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key  text;
  v_what text;
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
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'not authorized to approve or send back a vendor award — only a Super Admin can'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  CASE TG_TABLE_NAME
    WHEN 'procurement_purchase_requests' THEN
      IF NEW.status IN ('approved', 'rejected', 'returned') THEN
        IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT NULL
           AND public.procurement_request_has_chain(NEW.id) THEN
          -- Category approval steps: who may act was checked by the RPC that set this flag.
          IF current_setting('procurement.chain_ok', true) IS DISTINCT FROM 'on' THEN
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
        IF NEW.requested_by IS NOT DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
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
  IF v_key IS NULL THEN
    RETURN NEW;
  END IF;
  IF is_super_admin() OR is_admin() OR user_has_permission(v_key) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'not authorized to % — this requires the % permission', v_what, v_key
    USING ERRCODE = '42501';
END;
$function$;

-- ═══ 5. Acting on a step ══════════════════════════════════════════════════════════

-- Approve the step waiting now. Optional quantity corrections: [{item_id, quantity}].
CREATE OR REPLACE FUNCTION public.procurement_approve_request_step(
  p_request_id uuid, p_remarks text DEFAULT NULL, p_item_changes jsonb DEFAULT '[]'::jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_req  procurement_purchase_requests%ROWTYPE;
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
  IF NOT FOUND OR v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'This request is not waiting for approval (it is %).', coalesce(v_req.status, 'missing');
  END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request has no approval step waiting.'; END IF;

  v_mine := v_me = ANY (v_step.approver_ids);
  IF NOT v_mine AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;
  IF v_req.requested_by = v_me AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'You cannot approve your own request.' USING ERRCODE = '42501';
  END IF;

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
   WHERE request_id = p_request_id AND round = v_step.round AND status = 'waiting'
   ORDER BY step_order LIMIT 1;
  IF FOUND THEN
    UPDATE procurement_request_approvals SET status = 'pending' WHERE id = v_next.id;
    PERFORM procurement_notify_step(p_request_id, v_next.id);
    RETURN 'next';
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

-- Send back ('return') or reject at the step waiting now. Ends the round.
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
    RAISE EXCEPTION '%', CASE p_decision WHEN 'return' THEN 'Say what the requester must change.'
                                         ELSE 'Say why it is rejected.' END USING ERRCODE = '23502';
  END IF;
  SELECT * INTO v_req FROM procurement_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'submitted' THEN
    RAISE EXCEPTION 'This request is not waiting for approval.';
  END IF;
  SELECT * INTO v_step FROM procurement_request_approvals
   WHERE request_id = p_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This request has no approval step waiting.'; END IF;
  IF NOT (v_me = ANY (v_step.approver_ids)) AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'This step is waiting for %.', v_step.label USING ERRCODE = '42501';
  END IF;

  UPDATE procurement_request_approvals
     SET status   = CASE p_decision WHEN 'return' THEN 'returned' ELSE 'rejected' END,
         acted_by = v_me, acted_at = now(), on_behalf = NOT (v_me = ANY (approver_ids)), remarks = v_why
   WHERE id = v_step.id;
  UPDATE procurement_request_approvals SET status = 'cancelled'
   WHERE request_id = p_request_id AND round = v_step.round AND status = 'waiting';

  PERFORM set_config('procurement.chain_ok', 'on', true);
  IF p_decision = 'return' THEN
    -- trg_ppr_notify_returned tells the requester.
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

-- ═══ 6. Settings + reading (Super Admin sets; everyone reads what they need) ══════

-- Replace a category's whole chain. Unknown roles are refused — never "no restriction".
CREATE OR REPLACE FUNCTION public.procurement_save_category_steps(p_category_id uuid, p_steps jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
  i int := 0;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can change approval flows.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM procurement_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF jsonb_typeof(p_steps) <> 'array' OR jsonb_array_length(p_steps) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'An approval flow needs 1 to 10 steps.';
  END IF;
  DELETE FROM procurement_category_approval_steps WHERE category_id = p_category_id;
  FOR v IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    i := i + 1;
    IF v->>'approver_kind' = 'role' AND NOT EXISTS (
         SELECT 1 FROM custom_roles WHERE role_key = v->>'role_key' AND coalesce(is_active, true)) THEN
      RAISE EXCEPTION 'Step %: role "%" does not exist.', i, v->>'role_key';
    END IF;
    IF v->>'approver_kind' = 'user' AND NOT EXISTS (
         SELECT 1 FROM profiles WHERE id = (v->>'user_id')::uuid) THEN
      RAISE EXCEPTION 'Step %: choose a person.', i;
    END IF;
    INSERT INTO procurement_category_approval_steps
      (category_id, step_order, label, approver_kind, role_key, same_college, user_id)
    VALUES (p_category_id, i, trim(v->>'label'), v->>'approver_kind',
            CASE WHEN v->>'approver_kind' = 'role' THEN v->>'role_key' END,
            coalesce((v->>'same_college')::boolean, true),
            CASE WHEN v->>'approver_kind' = 'user' THEN (v->>'user_id')::uuid END);
  END LOOP;
END;
$$;

-- What the requester sees before submitting: each step and who it resolves to.
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
              WHEN s.approver_kind = 'role' THEN 'Nobody holds this role' ||
                   CASE WHEN s.same_college THEN ' in this college' ELSE '' END
              ELSE 'This person''s account is inactive' END
  FROM procurement_category_approval_steps s
  CROSS JOIN LATERAL (SELECT procurement_resolve_step(s.approver_kind, s.role_key, s.same_college,
                             s.user_id, p_institution_id, p_department_id) AS ids) r
  WHERE s.category_id = p_category_id
  ORDER BY s.step_order;
$$;

-- "Waiting for my approval".
CREATE OR REPLACE FUNCTION public.procurement_my_approvals()
RETURNS TABLE (request_id uuid, request_number text, title text, institution_name text,
               category_name text, step_label text, step_order int, steps_total int,
               requested_by_name text, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.request_number, r.title, i.name, c.name, a.label, a.step_order,
         (SELECT count(*)::int FROM procurement_request_approvals x
           WHERE x.request_id = r.id AND x.round = a.round),
         pr.full_name, r.submitted_at
  FROM procurement_request_approvals a
  JOIN procurement_purchase_requests r ON r.id = a.request_id
  LEFT JOIN institutions i ON i.id = r.institution_id
  LEFT JOIN procurement_categories c ON c.id = r.category_id
  LEFT JOIN profiles pr ON pr.id = r.requested_by
  WHERE a.status = 'pending' AND (SELECT auth.uid()) = ANY (a.approver_ids)
  ORDER BY r.submitted_at;
$$;

-- Layout gate: approvers without procurement.view still get in to act.
CREATE OR REPLACE FUNCTION public.procurement_has_approval_work()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM procurement_request_approvals
                 WHERE (SELECT auth.uid()) = ANY (approver_ids));
$$;

-- ═══ 7. RLS ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.procurement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_category_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_request_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_read ON public.procurement_categories;
CREATE POLICY pc_read ON public.procurement_categories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pc_manage ON public.procurement_categories;
CREATE POLICY pc_manage ON public.procurement_categories
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Steps are written only through procurement_save_category_steps().
DROP POLICY IF EXISTS pcas_read ON public.procurement_category_approval_steps;
CREATE POLICY pcas_read ON public.procurement_category_approval_steps
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pra_read ON public.procurement_request_approvals;
CREATE POLICY pra_read ON public.procurement_request_approvals
  FOR SELECT TO authenticated USING (
    -- An approver of ANY step sees the whole chain (who signed before them, who is next).
    public.procurement_is_request_approver(request_id)
    OR EXISTS (SELECT 1 FROM procurement_purchase_requests r
               WHERE r.id = request_id
                 AND (r.requested_by = (SELECT auth.uid()) OR role_has_institution_access(r.institution_id)))
  );

-- Approvers outside the college's institution scope (CAO, Chairperson…) read what they approve.
DROP POLICY IF EXISTS ppr_approver_read ON public.procurement_purchase_requests;
CREATE POLICY ppr_approver_read ON public.procurement_purchase_requests
  FOR SELECT TO authenticated USING (public.procurement_is_request_approver(id));
DROP POLICY IF EXISTS ppri_approver_read ON public.procurement_purchase_request_items;
CREATE POLICY ppri_approver_read ON public.procurement_purchase_request_items
  FOR SELECT TO authenticated USING (public.procurement_is_request_approver(request_id));

-- ═══ 8. Grants ════════════════════════════════════════════════════════════════════

GRANT SELECT ON public.procurement_categories, public.procurement_category_approval_steps,
  public.procurement_request_approvals TO authenticated;

REVOKE ALL ON FUNCTION public.procurement_is_request_approver(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_request_has_chain(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_resolve_step(text, text, boolean, uuid, uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.procurement_notify_users(uuid, uuid[], text, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.procurement_notify_step(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.procurement_approve_request_step(uuid, text, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_decide_request_step(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_save_category_steps(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_preview_chain(uuid, uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_my_approvals() FROM public, anon;
REVOKE ALL ON FUNCTION public.procurement_has_approval_work() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.procurement_is_request_approver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_request_has_chain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_approve_request_step(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_decide_request_step(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_save_category_steps(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_preview_chain(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_my_approvals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.procurement_has_approval_work() TO authenticated;

-- ═══ 9. Starter categories (the Super Admin sets their steps on Approval flows) ════

INSERT INTO public.procurement_categories (name, sort_order) VALUES
  ('Lab chemicals & glassware', 1),
  ('IT & electronics', 2),
  ('Stationery & office', 3),
  ('Furniture & maintenance', 4)
ON CONFLICT DO NOTHING;
