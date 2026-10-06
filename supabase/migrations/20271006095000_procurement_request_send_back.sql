-- Procurement: "Send back for changes" on item approval.
--
-- Until now an approver could only approve or reject, and rejected is final — so a
-- request missing one detail (a room number, a spec) died and had to be raised again.
-- Now the approver can send it back with a reason: the request goes to the requester
-- (status 'returned'), who changes quantities / removes lines / adds a reply and sends
-- it again (returned -> submitted), which re-notifies the approvers.
--
--   submitted -> returned   approver (procurement.request_approve), reason required
--   returned  -> submitted  requester resubmits
--   returned  -> cancelled  requester gives up

-- 1. Status + who/why/when of the last send-back -------------------------------------
ALTER TABLE public.procurement_purchase_requests
  DROP CONSTRAINT IF EXISTS procurement_purchase_requests_status_check;
ALTER TABLE public.procurement_purchase_requests
  ADD CONSTRAINT procurement_purchase_requests_status_check
  CHECK (status = ANY (ARRAY['draft', 'submitted', 'returned', 'approved', 'rejected', 'converted', 'cancelled']));

ALTER TABLE public.procurement_purchase_requests
  ADD COLUMN IF NOT EXISTS returned_reason text,
  ADD COLUMN IF NOT EXISTS returned_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.procurement_purchase_requests.returned_reason IS
  'Why the approver last sent this request back to the requester (kept after resubmit as history).';

-- 2. Guard: sending back is an approver decision, like approve / reject ---------------
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
        v_key  := 'procurement.request_approve';
        v_what := 'approve, reject or send back a purchase requisition';
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

-- 3. Re-notify approvers on resubmit ------------------------------------------------
-- The submit notice is idempotent per request; a resubmission needs its own key or
-- ON CONFLICT swallows it.
CREATE OR REPLACE FUNCTION public.fn_procurement_notify_request_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recipients uuid[];
  v_requester  text;
  v_first_item text;
  v_item_count int;
  v_inst       text;
  v_notif_id   uuid;
  v_number     text;
  v_resubmit   boolean := TG_OP = 'UPDATE' AND OLD.status = 'returned';
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(DISTINCT p.id) INTO v_recipients
  FROM profiles p
  WHERE coalesce(p.is_active, true)
    AND NOT coalesce(p.is_login_disabled, false)
    AND p.id IS DISTINCT FROM NEW.requested_by
    AND (
      p.is_super_admin = true
      OR p.role = 'super_admin'
      OR EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p.id
          AND (cr.permissions->>'procurement.request_approve')::boolean = true
      )
      OR EXISTS (
        SELECT 1 FROM custom_roles cr
        WHERE cr.role_key = p.role
          AND (cr.permissions->>'procurement.request_approve')::boolean = true
      )
    );

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_requester FROM profiles WHERE id = NEW.requested_by;
  SELECT name INTO v_inst FROM institutions WHERE id = NEW.institution_id;
  SELECT count(*), min(item_name) INTO v_item_count, v_first_item
  FROM procurement_purchase_request_items WHERE request_id = NEW.id;

  v_number := NEW.request_number;

  INSERT INTO notifications (
    title, body, url, created_by, targeting, priority, category, metadata, idempotency_key
  ) VALUES (
    CASE WHEN v_resubmit
      THEN 'Purchase request ' || v_number || ' was changed and sent again'
      ELSE 'New purchase request ' || v_number || ' needs approval' END,
    coalesce(v_requester, 'Someone') || ' requested '
      || CASE
           WHEN v_item_count IS NULL OR v_item_count = 0 THEN 'items'
           WHEN v_item_count = 1 THEN v_first_item
           ELSE v_first_item || ' + ' || (v_item_count - 1) || ' more'
         END
      || coalesce(' for ' || v_inst, '')
      || CASE WHEN v_resubmit THEN coalesce(' — you asked: ' || nullif(trim(NEW.returned_reason), ''), '')
              ELSE coalesce(' — ' || nullif(trim(NEW.notes), ''), '') END,
    '/procurement/requests/' || NEW.id,
    coalesce(NEW.requested_by, v_recipients[1]),
    jsonb_build_object('type', 'user', 'user_ids', to_jsonb(v_recipients)),
    'high',
    'procurement',
    jsonb_build_object(
      'type', 'info',
      'source', 'procurement_request_submitted',
      'request_id', NEW.id,
      'action_label', 'Review request'
    ),
    'procurement_pr_submitted:' || NEW.id
      || CASE WHEN v_resubmit THEN ':' || NEW.return_count ELSE '' END
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_notif_id;

  IF v_notif_id IS NOT NULL THEN
    INSERT INTO user_notifications (notification_id, user_id)
    SELECT v_notif_id, unnest(v_recipients)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_procurement_notify_request_submitted(%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- 4. Tell the requester it came back -------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_procurement_notify_request_returned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notif_id uuid;
  v_by       text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'returned' OR OLD.status IS NOT DISTINCT FROM 'returned'
     OR NEW.requested_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_by FROM profiles WHERE id = NEW.returned_by;

  INSERT INTO notifications (
    title, body, url, created_by, targeting, priority, category, metadata, idempotency_key
  ) VALUES (
    'Purchase request ' || NEW.request_number || ' was sent back to you',
    coalesce(v_by, 'The approver') || ' asked: ' || coalesce(NEW.returned_reason, ''),
    '/procurement/requests/' || NEW.id,
    coalesce(NEW.returned_by, NEW.requested_by),
    jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(NEW.requested_by)),
    'high',
    'procurement',
    jsonb_build_object(
      'type', 'warning',
      'source', 'procurement_request_returned',
      'request_id', NEW.id,
      'action_label', 'Make the changes'
    ),
    'procurement_pr_returned:' || NEW.id || ':' || NEW.return_count
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_notif_id;

  IF v_notif_id IS NOT NULL THEN
    INSERT INTO user_notifications (notification_id, user_id)
    VALUES (v_notif_id, NEW.requested_by)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_procurement_notify_request_returned(%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ppr_notify_returned ON public.procurement_purchase_requests;
CREATE TRIGGER trg_ppr_notify_returned
  AFTER UPDATE OF status ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_notify_request_returned();
