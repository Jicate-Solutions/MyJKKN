-- Record the receipt-cancellation lifecycle in the Billing Activities feed.
--
-- /billing/activities showed nothing for cancellations: it reads
-- user_activity_logs, and none of the three cancellation RPCs wrote there.
-- Requests, approvals, declines and withdrawals were invisible in the one
-- place the platform gathers "what happened in billing".
--
-- Implemented as a trigger on billing_receipt_cancel_request_actions rather
-- than as five inserts patched into the RPCs. Every lifecycle event already
-- writes exactly one row to that table, so the trigger cannot drift from the
-- audit trail, cannot be skipped by a future caller that bypasses one RPC, and
-- picks up any action_type added later without another migration.
--
-- resource_type is 'receipt' deliberately: BillingActivityService filters on
-- resource_type IN (bill, receipt, invoice, discount, refund), so anything
-- else would be written and then never shown.

CREATE OR REPLACE FUNCTION public._fn_log_receipt_cancel_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req    public.billing_receipt_cancel_requests%ROWTYPE;
  v_action text;
  v_desc   text;
  v_rcpt   text;
  v_amount numeric;
  v_actor  uuid;
BEGIN
  SELECT * INTO v_req FROM public.billing_receipt_cancel_requests
  WHERE id = NEW.request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- user_id is NOT NULL. A log row is never worth failing the cancellation
  -- itself for, so a caller with no identity (service role, a job) is skipped
  -- rather than raised on.
  v_actor := COALESCE(NEW.actor_id, v_req.requested_by);
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  v_rcpt   := v_req.receipt_snapshot->>'receipt_number';
  v_amount := NULLIF(v_req.receipt_snapshot->>'payment_amount', '')::numeric;

  v_action := CASE NEW.action_type
    WHEN 'requested' THEN 'cancel_request'
    WHEN 'approved'  THEN 'cancel_approve'
    WHEN 'declined'  THEN 'cancel_decline'
    WHEN 'withdrawn' THEN 'cancel_withdraw'
    WHEN 'failed'    THEN 'cancel_failed'
    ELSE 'cancel_' || NEW.action_type
  END;

  -- Spelled out in money terms, because that is the question someone reading
  -- the feed is actually asking. Only 'approved' moves any.
  v_desc := CASE NEW.action_type
    WHEN 'requested' THEN
      format('Cancellation requested for receipt %s (%s) - awaiting approval, receipt still valid',
             COALESCE(v_rcpt, '?'), COALESCE('Rs ' || v_amount::text, 'amount unknown'))
    WHEN 'approved'  THEN
      format('Cancellation APPROVED for receipt %s (%s) - receipt cancelled and bill reverted to unpaid',
             COALESCE(v_rcpt, '?'), COALESCE('Rs ' || v_amount::text, 'amount unknown'))
    WHEN 'declined'  THEN
      format('Cancellation declined for receipt %s - receipt stays valid and the bill stays paid',
             COALESCE(v_rcpt, '?'))
    WHEN 'withdrawn' THEN
      format('Cancellation request withdrawn for receipt %s - nothing about the payment changed',
             COALESCE(v_rcpt, '?'))
    WHEN 'failed'    THEN
      format('Cancellation failed for receipt %s - the receipt no longer existed at approval time',
             COALESCE(v_rcpt, '?'))
    ELSE
      format('Cancellation %s for receipt %s', NEW.action_type, COALESCE(v_rcpt, '?'))
  END;

  INSERT INTO public.user_activity_logs (
    user_id, action_type, resource_type, resource_id, resource_name,
    description, institution_id, metadata
  ) VALUES (
    v_actor,
    v_action,
    'receipt',
    v_req.receipt_id,
    COALESCE(v_rcpt, v_req.request_number),
    v_desc,
    v_req.institution_id,
    jsonb_build_object(
      'sub_type',        'billing_receipt_cancellation',
      'request_id',      v_req.id,
      'request_number',  v_req.request_number,
      'receipt_number',  v_rcpt,
      'amount',          v_amount,
      'reason',          v_req.reason,
      'student_id',      v_req.student_id,
      'action_notes',    NEW.notes,
      'actor_name',      NEW.actor_name,
      'actor_role',      NEW.actor_role_name,
      'actor_is_super_admin', NEW.actor_is_super_admin
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_receipt_cancel_activity
  ON public.billing_receipt_cancel_request_actions;

CREATE TRIGGER trg_log_receipt_cancel_activity
  AFTER INSERT ON public.billing_receipt_cancel_request_actions
  FOR EACH ROW EXECUTE FUNCTION public._fn_log_receipt_cancel_activity();

-- Backfill the actions written before the trigger existed, so the feed does
-- not start mid-story. Guarded on metadata->>request_id so a re-run cannot
-- double-log.
INSERT INTO public.user_activity_logs (
  user_id, action_type, resource_type, resource_id, resource_name,
  description, institution_id, metadata, created_at
)
SELECT
  COALESCE(a.actor_id, r.requested_by),
  CASE a.action_type
    WHEN 'requested' THEN 'cancel_request'
    WHEN 'approved'  THEN 'cancel_approve'
    WHEN 'declined'  THEN 'cancel_decline'
    WHEN 'withdrawn' THEN 'cancel_withdraw'
    WHEN 'failed'    THEN 'cancel_failed'
    ELSE 'cancel_' || a.action_type
  END,
  'receipt',
  r.receipt_id,
  COALESCE(r.receipt_snapshot->>'receipt_number', r.request_number),
  format('Cancellation %s for receipt %s (backfilled)',
         a.action_type, COALESCE(r.receipt_snapshot->>'receipt_number', '?')),
  r.institution_id,
  jsonb_build_object(
    'sub_type',       'billing_receipt_cancellation',
    'request_id',     r.id,
    'request_number', r.request_number,
    'receipt_number', r.receipt_snapshot->>'receipt_number',
    'amount',         NULLIF(r.receipt_snapshot->>'payment_amount', '')::numeric,
    'reason',         r.reason,
    'student_id',     r.student_id,
    'action_notes',   a.notes,
    'actor_name',     a.actor_name,
    'actor_role',     a.actor_role_name,
    'backfilled',     true
  ),
  a.created_at
FROM public.billing_receipt_cancel_request_actions a
JOIN public.billing_receipt_cancel_requests r ON r.id = a.request_id
WHERE COALESCE(a.actor_id, r.requested_by) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_activity_logs l
    WHERE l.metadata->>'request_id' = r.id::text
      AND l.action_type = CASE a.action_type
        WHEN 'requested' THEN 'cancel_request'
        WHEN 'approved'  THEN 'cancel_approve'
        WHEN 'declined'  THEN 'cancel_decline'
        WHEN 'withdrawn' THEN 'cancel_withdraw'
        WHEN 'failed'    THEN 'cancel_failed'
        ELSE 'cancel_' || a.action_type
      END
  );
