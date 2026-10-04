-- Bill cancel request: supporting documents are no longer required, 2026-09-28.
--
-- The accounts team asked for the request to need only a reason code and
-- notes. fn_request_bill_cancellation used to refuse a request with no Drive
-- attachment; it now accepts an empty (or missing) attachment list. The
-- signature is unchanged, so grants and callers are untouched, and approval
-- still copies whatever attachments exist into billing_bill_cancellations.

CREATE OR REPLACE FUNCTION public.fn_request_bill_cancellation(
  p_bill_id     uuid,
  p_reason_code text,
  p_reason      text,
  p_attachments jsonb
)
RETURNS TABLE(request_id uuid, request_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill     public.billing_student_bills%ROWTYPE;
  v_elig     record;
  v_actor    record;
  v_category text;
  v_id       uuid;
  v_number   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_bill FROM public.billing_student_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % not found', p_bill_id;
  END IF;

  -- Authorization first, so an unauthorised caller learns nothing about the
  -- bill's state from the error message.
  IF NOT (
    is_super_admin()
    OR (user_has_permission('billing.schedule.cancel.request')
        AND role_has_institution_access(v_bill.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to request bill cancellation for this institution';
  END IF;

  SELECT * INTO v_elig FROM public.fn_bill_cancel_eligibility(ARRAY[p_bill_id]);
  IF NOT COALESCE(v_elig.eligible, false) THEN
    RAISE EXCEPTION '%', COALESCE(v_elig.blocked_reason, 'This bill cannot be cancelled');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN
     ('duplicate_bill','raised_in_error','fee_waived','learner_withdrawn','structure_corrected','other') THEN
    RAISE EXCEPTION 'A valid reason code is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;
  -- Documents are optional (2026-09-28): reason code + notes are the evidence.
  -- Anything that is not a JSON array is normalised to an empty one.
  IF p_attachments IS NULL OR jsonb_typeof(p_attachments) <> 'array' THEN
    p_attachments := '[]'::jsonb;
  END IF;

  SELECT bc.category_name INTO v_category
  FROM public.billing_categories bc WHERE bc.id = v_bill.item_category_id;

  SELECT * INTO v_actor FROM public._fn_bill_cancel_actor();

  v_number := 'BCX-' || EXTRACT(YEAR FROM now())::text || '-'
              || LPAD(nextval('public.billing_bill_cancel_number_seq')::text, 6, '0');

  INSERT INTO public.billing_bill_cancel_requests (
    request_number, bill_id, institution_id, student_id, reason_code, reason,
    attachments, bill_snapshot, amount,
    requested_by, requested_by_name, requested_by_email, requested_by_role
  ) VALUES (
    v_number, p_bill_id, v_bill.institution_id, v_bill.student_id,
    p_reason_code, trim(p_reason), p_attachments,
    jsonb_build_object('bill_description', v_bill.bill_description,
                       'final_amount',     v_bill.final_amount,
                       'balance_amount',   v_bill.balance_amount,
                       'status',           v_bill.status,
                       'due_date',         v_bill.due_date,
                       'fee_source',       v_bill.fee_source,
                       'category_name',    v_category),
    v_bill.final_amount,
    auth.uid(), v_actor.actor_name, v_actor.actor_email, v_actor.actor_role
  ) RETURNING id INTO v_id;

  INSERT INTO public.billing_bill_cancel_request_actions (
    request_id, action_type, actor_id, actor_name, actor_email, actor_role_name,
    actor_is_super_admin, notes
  ) VALUES (v_id, 'requested', auth.uid(), v_actor.actor_name, v_actor.actor_email,
            v_actor.actor_role, v_actor.actor_is_super_admin, trim(p_reason));

  RETURN QUERY SELECT v_id, v_number;
END;
$function$;
