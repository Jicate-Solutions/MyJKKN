-- fn_withdraw_receipt_cancellation: record WHO withdrew, not just their uuid.
--
-- The other two RPCs in this workflow snapshot the actor's name, email, role
-- and super-admin flag onto the action row; withdraw inserted only
-- (request_id, action_type, actor_id, notes). The History section of a
-- withdrawn request therefore rendered a bare "WITHDRAWN" badge and a
-- timestamp with no actor at all, while the "REQUESTED" row above it showed
-- the full identity.
--
-- Why snapshots and not a live join on actor_id: a profile can be renamed,
-- have its email changed or be deactivated long after the fact, and an audit
-- trail that silently re-writes itself is not an audit trail. Same reasoning
-- the request/decision columns already follow.
--
-- Also backfills the one existing withdrawn action row, which is otherwise
-- stranded with a NULL identity forever.
--
-- Unchanged on purpose: withdrawing still touches neither the receipt nor the
-- bill. Withdraw means "drop my cancellation request", so the receipt stays
-- valid and the bill stays paid — only APPROVAL reverses money.

CREATE OR REPLACE FUNCTION public.fn_withdraw_receipt_cancellation(
  p_request_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req   public.billing_receipt_cancel_requests%ROWTYPE;
  v_name  text;
  v_email text;
  v_super boolean;
  v_role  text;
BEGIN
  SELECT * INTO v_req FROM public.billing_receipt_cancel_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;
  IF v_req.requested_by IS DISTINCT FROM auth.uid() AND NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;

  SELECT p.full_name, p.email, COALESCE(p.is_super_admin, false)
    INTO v_name, v_email, v_super
  FROM public.profiles p WHERE p.id = auth.uid();

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  UPDATE public.billing_receipt_cancel_requests
     SET status='withdrawn', updated_at=now() WHERE id = p_request_id;

  INSERT INTO public.billing_receipt_cancel_request_actions
    (request_id, action_type, actor_id, actor_name, actor_email,
     actor_role_name, actor_is_super_admin, notes)
  VALUES
    (p_request_id, 'withdrawn', auth.uid(), v_name, v_email,
     v_role, v_super, p_notes);
END;
$function$;

-- Backfill rows written before this fix. Identity comes from the actor's
-- profile as it stands today — the best available answer for a row that
-- captured nothing, and applied only where the snapshot is missing so a real
-- historical snapshot is never overwritten.
UPDATE public.billing_receipt_cancel_request_actions a
SET actor_name           = p.full_name,
    actor_email          = p.email,
    actor_is_super_admin = COALESCE(p.is_super_admin, false),
    actor_role_name      = (
      SELECT cr.role_name
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = a.actor_id
      LIMIT 1
    )
FROM public.profiles p
WHERE p.id = a.actor_id
  AND a.action_type = 'withdrawn'
  AND a.actor_name IS NULL;
