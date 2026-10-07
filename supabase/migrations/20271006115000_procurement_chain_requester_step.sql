-- Migration: 20271006115000_procurement_chain_requester_step
-- Purpose:   A request only ever goes to the approvers the Super Admin set for its
--            category — never to "all Super Admins".
--
--            Before: when the requester was themselves a step's approver, that step
--            was skipped, and if no step was left the request went to EVERY Super
--            Admin (seen live: PR-261006-00001 waiting for 15 people).
--            Now: the requester being a set approver counts as that step's approval
--            ("Approved — raised by this approver"); the request moves on to the next
--            set approver, and is approved at once when none is left.
--
--            The guard's "no self-approval" check now applies to the old single-
--            approver rule only; chain requests are decided by the chain functions,
--            which still refuse a requester approving a step that is not theirs.

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

    -- The requester IS a set approver of this step: their raising it is the approval.
    IF NEW.requested_by = ANY (v_ids) THEN
      INSERT INTO procurement_request_approvals
        (request_id, round, step_order, label, approver_kind, approver_ids, status, acted_by, acted_at, remarks)
      VALUES (NEW.id, v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, 'approved',
              NEW.requested_by, now(), 'Approved — raised by this approver');
      CONTINUE;
    END IF;

    v_status := CASE WHEN NOT v_pending THEN 'pending' ELSE 'waiting' END;
    v_pending := true;
    INSERT INTO procurement_request_approvals
      (request_id, round, step_order, label, approver_kind, approver_ids, status)
    VALUES (NEW.id, v_round, v_step.step_order, v_step.label, v_step.approver_kind, v_ids, v_status);
  END LOOP;

  IF NOT v_any THEN
    RAISE EXCEPTION 'No approval steps are set for this category yet — ask the Super Admin to set them.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_pending THEN
    -- Every set approver is the requester: approved now, by them.
    PERFORM set_config('procurement.chain_ok', 'on', true);
    UPDATE procurement_purchase_requests
       SET status = 'approved', approved_by = NEW.requested_by, approved_at = now(), updated_at = now()
     WHERE id = NEW.id;
    PERFORM set_config('procurement.chain_ok', 'off', true);
    RETURN NULL;
  END IF;

  PERFORM procurement_notify_step(NEW.id, a.id)
     FROM procurement_request_approvals a
    WHERE a.request_id = NEW.id AND a.round = v_round AND a.status = 'pending';
  RETURN NULL;
END;
$$;

-- Guard: same as 20271006105000 §4, except the self-approval check is for the
-- old single-approver rule only (chain requests: see procurement_approve_request_step).
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
