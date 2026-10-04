-- Bell + push notification to approvers when a purchase request is submitted.
--
-- Procurement never notified anyone: a request sat at "Waiting for approval" until an
-- approver happened to open the list. A trigger (not app code) because requests are
-- submitted from two paths — the New Request page (draft -> submitted update) and the
-- ims_create_reorder_request RPC — and because the notifications INSERT policy only
-- admits admins, so the requester's own session could not write the row anyway.
--
-- Recipients: every active Super Admin plus every holder of
-- procurement.request_approve (user_roles or legacy profiles.role), minus the
-- requester. The user_notifications insert fires trg_notify_push_on_queue_insert,
-- so web push goes out too.

CREATE OR REPLACE FUNCTION public.fn_procurement_notify_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recipients uuid[];
  v_requester  text;
  v_first_item text;
  v_item_count int;
  v_inst       text;
  v_notif_id   uuid;
  v_number     text;
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
    'New purchase request ' || v_number || ' needs approval',
    coalesce(v_requester, 'Someone') || ' requested '
      || CASE
           WHEN v_item_count IS NULL OR v_item_count = 0 THEN 'items'
           WHEN v_item_count = 1 THEN v_first_item
           ELSE v_first_item || ' + ' || (v_item_count - 1) || ' more'
         END
      || coalesce(' for ' || v_inst, '')
      || coalesce(' — ' || nullif(trim(NEW.notes), ''), ''),
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
  -- A notification failure must never block filing the request.
  RAISE WARNING 'fn_procurement_notify_request_submitted(%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_procurement_notify_request_submitted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ppr_notify_submitted ON public.procurement_purchase_requests;
CREATE TRIGGER trg_ppr_notify_submitted
  AFTER INSERT OR UPDATE OF status ON public.procurement_purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_procurement_notify_request_submitted();
