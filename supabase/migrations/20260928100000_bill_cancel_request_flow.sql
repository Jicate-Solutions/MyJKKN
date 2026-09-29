-- Bill cancellation goes through approval, 2026-09-28.
--
-- THE PROBLEM THIS SOLVES:
--   Since 20260901010000 a bill was cancelled DIRECTLY: fn_cancel_student_bill
--   let any holder of billing.schedule.cancel (Chief Accountant, Administrator)
--   void a bill in one step. The evidence rule (reason code + notes + >=1 Drive
--   document) was there, but no second pair of eyes. Receipt cancellation has
--   had request -> approve since 20260729; bills now follow the same shape:
--
--     requester (billing.schedule.cancel.request: Chief Accountant, Accountant
--       Assistant; super admins bypass the key)
--       -> fn_request_bill_cancellation  (evidence captured HERE)
--       -> approver named by billing_bill_cancel_approval_flows
--          (institution row > group-wide row > none = super admin only)
--       -> fn_act_on_bill_cancellation   (approve | decline, four-eyes)
--       -> _fn_exec_bill_cancel          (the old fn_cancel_student_bill body)
--
--   fn_cancel_student_bill is DROPPED: a direct route left open would make the
--   approval decorative. trg_billing_bills_guard_cancel still closes every
--   other route into status='cancelled'.
--
-- MONEY RULE (unchanged, now also enforced at REQUEST time):
--   a bill with any receipted money cannot be cancelled. The receipts must be
--   cancelled first through the receipt-cancellation flow, which un-settles
--   the bill. The rule is re-checked at APPROVAL time too: the bill is not
--   frozen while a request is pending, so a payment taken in that window marks
--   the request 'failed' instead of orphaning that money onto a void bill.
--
-- WHILE A REQUEST IS PENDING the bill stays fully valid and payable.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.billing_bill_cancel_number_seq;

CREATE TABLE IF NOT EXISTS public.billing_bill_cancel_requests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number            text NOT NULL UNIQUE,
  -- SET NULL, not CASCADE: a super admin may still hard-delete a bill, and the
  -- history of who asked to cancel it must outlive the row. bill_snapshot
  -- preserves its identity.
  bill_id                   uuid REFERENCES public.billing_student_bills(id) ON DELETE SET NULL,
  institution_id            uuid NOT NULL,
  student_id                uuid,
  reason_code               text NOT NULL
                            CHECK (reason_code IN ('duplicate_bill','raised_in_error','fee_waived',
                                                   'learner_withdrawn','structure_corrected','other')),
  reason                    text NOT NULL,
  -- [{name, drive_file_id, drive_url, mime, size}] -- same shape as
  -- billing_bill_cancellations.attachments, copied there on approval.
  attachments               jsonb NOT NULL DEFAULT '[]'::jsonb,
  bill_snapshot             jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount                    numeric NOT NULL,
  status                    text NOT NULL DEFAULT 'pending_approval'
                            CHECK (status IN ('pending_approval','approved','declined','withdrawn','failed')),
  -- Identity SNAPSHOTS: a profile can be renamed or deactivated long after the
  -- fact; the uuid alone cannot answer "who asked / who approved" years later.
  requested_by              uuid,
  requested_by_name         text,
  requested_by_email        text,
  requested_by_role         text,
  requested_at              timestamptz NOT NULL DEFAULT now(),
  decided_by                uuid,
  decided_by_name           text,
  decided_by_email          text,
  decided_by_role           text,
  decided_by_designation    text,
  decided_by_is_super_admin boolean,
  decided_at                timestamptz,
  decision_notes            text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- At most ONE open request per bill.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_cancel_open_per_bill
  ON public.billing_bill_cancel_requests (bill_id)
  WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_bill_cancel_req_status
  ON public.billing_bill_cancel_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_cancel_req_institution
  ON public.billing_bill_cancel_requests (institution_id);
CREATE INDEX IF NOT EXISTS idx_bill_cancel_req_student
  ON public.billing_bill_cancel_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_cancel_req_bill
  ON public.billing_bill_cancel_requests (bill_id);

CREATE TABLE IF NOT EXISTS public.billing_bill_cancel_request_actions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           uuid NOT NULL
                       REFERENCES public.billing_bill_cancel_requests(id) ON DELETE CASCADE,
  action_type          text NOT NULL
                       CHECK (action_type IN ('requested','approved','declined','withdrawn','failed')),
  actor_id             uuid,
  actor_name           text,
  actor_email          text,
  actor_role_name      text,
  actor_is_super_admin boolean,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bill_cancel_actions_request
  ON public.billing_bill_cancel_request_actions (request_id, created_at);

CREATE TABLE IF NOT EXISTS public.billing_bill_cancel_approval_flows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = group-wide default. A row for a specific institution wins over it.
  institution_id    uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  flow_name         text NOT NULL,
  approver_role_key text REFERENCES public.custom_roles(role_key)
                         ON UPDATE CASCADE ON DELETE RESTRICT,
  approver_user_id  uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id),
  updated_by        uuid REFERENCES public.profiles(id),
  CONSTRAINT billing_bill_cancel_flow_one_approver CHECK (
    (approver_role_key IS NOT NULL)::int + (approver_user_id IS NOT NULL)::int = 1
  )
);
COMMENT ON TABLE public.billing_bill_cancel_approval_flows IS
  'Who may decide a bill-cancellation request. One active flow per institution, plus an optional group-wide default. No flow = super admin only.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_cancel_flow_active_institution
  ON public.billing_bill_cancel_approval_flows (institution_id)
  WHERE is_active AND institution_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_cancel_flow_active_global
  ON public.billing_bill_cancel_approval_flows ((institution_id IS NULL))
  WHERE is_active AND institution_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_bill_cancel_flow_role
  ON public.billing_bill_cancel_approval_flows (approver_role_key);
CREATE INDEX IF NOT EXISTS idx_bill_cancel_flow_user
  ON public.billing_bill_cancel_approval_flows (approver_user_id);

-- The final audit row points back at the approval that authorised it.
ALTER TABLE public.billing_bill_cancellations
  ADD COLUMN IF NOT EXISTS request_id uuid
  REFERENCES public.billing_bill_cancel_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bill_cancellations_request
  ON public.billing_bill_cancellations (request_id);

REVOKE ALL ON TABLE public.billing_bill_cancel_requests FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.billing_bill_cancel_request_actions FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.billing_bill_cancel_approval_flows FROM anon, PUBLIC;
REVOKE ALL ON SEQUENCE public.billing_bill_cancel_number_seq FROM anon, PUBLIC;

ALTER TABLE public.billing_bill_cancel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_bill_cancel_request_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_bill_cancel_approval_flows ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Approver resolution (mirrors the receipt-cancellation functions; reuses
--    _fn_current_user_holds_role, which unions profiles.role and user_roles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_bill_cancel_approver(p_institution_id uuid)
RETURNS public.billing_bill_cancel_approval_flows
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.billing_bill_cancel_approval_flows
  WHERE is_active
    AND (institution_id = p_institution_id OR institution_id IS NULL)
  ORDER BY institution_id NULLS LAST
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_bill_cancel_approver(p_institution_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flow public.billing_bill_cancel_approval_flows;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF p_institution_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.billing_bill_cancel_approval_flows f
      WHERE f.is_active
        AND (f.approver_user_id = auth.uid()
             OR public._fn_current_user_holds_role(f.approver_role_key))
    );
  END IF;

  v_flow := public.fn_resolve_bill_cancel_approver(p_institution_id);
  IF v_flow.id IS NULL THEN
    RETURN false; -- no flow: super admins only, and they returned above
  END IF;

  RETURN COALESCE((
    v_flow.approver_user_id = auth.uid()
    OR public._fn_current_user_holds_role(v_flow.approver_role_key)
  ), false) AND role_has_institution_access(p_institution_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_can_decide_bill_cancellation(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst
  FROM public.billing_bill_cancel_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.fn_is_bill_cancel_approver(v_inst);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. RLS -- SELECT-only everywhere except flows (super admin writes). Every
--    request/decision write goes through the RPCs below, so the history cannot
--    be edited by whoever it incriminates.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS billing_bill_cancel_requests_select ON public.billing_bill_cancel_requests;
CREATE POLICY billing_bill_cancel_requests_select
  ON public.billing_bill_cancel_requests FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR requested_by = (SELECT auth.uid())
    OR (
      ((SELECT user_has_permission('billing.schedule.view'))
        OR (SELECT user_has_permission('billing.schedule.cancel.request')))
      AND role_has_institution_access(institution_id)
    )
    OR public.fn_is_bill_cancel_approver(institution_id)
  );

DROP POLICY IF EXISTS billing_bill_cancel_actions_select ON public.billing_bill_cancel_request_actions;
CREATE POLICY billing_bill_cancel_actions_select
  ON public.billing_bill_cancel_request_actions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_bill_cancel_requests r
      WHERE r.id = billing_bill_cancel_request_actions.request_id
        AND (
          (SELECT is_super_admin())
          OR r.requested_by = (SELECT auth.uid())
          OR (
            ((SELECT user_has_permission('billing.schedule.view'))
              OR (SELECT user_has_permission('billing.schedule.cancel.request')))
            AND role_has_institution_access(r.institution_id)
          )
          OR public.fn_is_bill_cancel_approver(r.institution_id)
        )
    )
  );

DROP POLICY IF EXISTS billing_bill_cancel_flows_select ON public.billing_bill_cancel_approval_flows;
CREATE POLICY billing_bill_cancel_flows_select
  ON public.billing_bill_cancel_approval_flows FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT user_has_permission('billing.schedule.view'))
    OR (SELECT user_has_permission('billing.schedule.cancel.request'))
    OR (SELECT public.fn_is_bill_cancel_approver(NULL))
  );

DROP POLICY IF EXISTS billing_bill_cancel_flows_write ON public.billing_bill_cancel_approval_flows;
CREATE POLICY billing_bill_cancel_flows_write
  ON public.billing_bill_cancel_approval_flows FOR ALL TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

GRANT SELECT ON public.billing_bill_cancel_requests TO authenticated;
GRANT SELECT ON public.billing_bill_cancel_request_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_bill_cancel_approval_flows TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Eligibility -- ONE answer for the button and the RPC guard.
--    Takes an array so a list page asks once per page, not once per row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bill_cancel_eligibility(p_bill_ids uuid[])
RETURNS TABLE(bill_id uuid, eligible boolean, blocked_reason text,
              receipted_amount numeric, receipt_numbers text, pending_request_id uuid,
              pending_request_number text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH b AS (
    SELECT sb.id, sb.status, sb.institution_id
    FROM public.billing_student_bills sb
    WHERE sb.id = ANY(p_bill_ids)
      -- Only bills the caller could see anyway.
      AND (is_super_admin() OR role_has_institution_access(sb.institution_id))
  ),
  money AS (
    SELECT ri.bill_id,
           COALESCE(SUM(ri.amount_paid), 0) AS amt,
           string_agg(DISTINCT r.receipt_number, ', ') AS refs
    FROM public.billing_receipt_items ri
    JOIN public.billing_receipts r ON r.id = ri.receipt_id
    WHERE ri.bill_id = ANY(p_bill_ids)
    GROUP BY ri.bill_id
  ),
  pend AS (
    SELECT q.bill_id, q.id, q.request_number
    FROM public.billing_bill_cancel_requests q
    WHERE q.bill_id = ANY(p_bill_ids) AND q.status = 'pending_approval'
  )
  SELECT b.id,
         (b.status IN ('unpaid','partially_paid','overdue')
            AND COALESCE(m.amt, 0) = 0
            AND p.id IS NULL) AS eligible,
         CASE
           WHEN b.status = 'cancelled' THEN 'Bill is already cancelled'
           WHEN b.status NOT IN ('unpaid','partially_paid','overdue')
             AND COALESCE(m.amt, 0) = 0 THEN format('Bills with status "%s" cannot be cancelled', b.status)
           WHEN COALESCE(m.amt, 0) > 0 THEN
             format('Rs %s is receipted against this bill (%s). Cancel the receipt(s) first.',
                    to_char(m.amt, 'FM99,99,99,999.00'), COALESCE(m.refs, 'receipt unknown'))
           WHEN p.id IS NOT NULL THEN format('Cancellation request %s is already awaiting approval', p.request_number)
           ELSE NULL
         END,
         COALESCE(m.amt, 0)::numeric,
         m.refs::text,
         p.id,
         p.request_number::text
  FROM b
  LEFT JOIN money m ON m.bill_id = b.id
  LEFT JOIN pend  p ON p.bill_id = b.id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Caller identity snapshot helper (role lookup with the profiles.role
--    fallback that user_has_permission() already has).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_bill_cancel_actor()
RETURNS TABLE(actor_name text, actor_email text, actor_role text,
              actor_designation text, actor_is_super_admin boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  IF v_role IS NULL THEN
    SELECT cr.role_name INTO v_role
    FROM public.profiles p JOIN public.custom_roles cr ON cr.role_key = p.role
    WHERE p.id = auth.uid() LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT p.full_name::text, p.email::text, v_role, p.designation::text, is_super_admin()
  FROM public.profiles p WHERE p.id = auth.uid();
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. The cancellation itself, WITHOUT authorization. Only reachable from
--    fn_act_on_bill_cancellation; EXECUTE revoked from everyone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_exec_bill_cancel(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req    public.billing_bill_cancel_requests%ROWTYPE;
  v_bill   public.billing_student_bills%ROWTYPE;
  v_actor  record;
  v_id     uuid;
BEGIN
  SELECT * INTO v_req FROM public.billing_bill_cancel_requests WHERE id = p_request_id;
  SELECT * INTO v_bill FROM public.billing_student_bills WHERE id = v_req.bill_id FOR UPDATE;
  SELECT * INTO v_actor FROM public._fn_bill_cancel_actor();

  INSERT INTO public.billing_bill_cancellations (
    bill_id, institution_id, student_id, reason_code, reason, attachments,
    bill_snapshot, amount_cancelled,
    cancelled_by, cancelled_by_name, cancelled_by_email, cancelled_by_role,
    cancelled_by_is_super_admin, request_id
  ) VALUES (
    v_bill.id, v_bill.institution_id, v_bill.student_id,
    v_req.reason_code, v_req.reason, v_req.attachments,
    v_req.bill_snapshot, v_bill.final_amount,
    auth.uid(), v_actor.actor_name, v_actor.actor_email, v_actor.actor_role,
    v_actor.actor_is_super_admin, p_request_id
  ) RETURNING id INTO v_id;

  -- Transaction-local flag trg_billing_bills_guard_cancel looks for.
  PERFORM set_config('app.bill_cancel_ctx', v_bill.id::text, true);

  UPDATE public.billing_student_bills
     SET status = 'cancelled', balance_amount = 0, updated_at = now()
   WHERE id = v_bill.id;

  PERFORM set_config('app.bill_cancel_ctx', '', true);
  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Request
-- ---------------------------------------------------------------------------
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
  IF p_attachments IS NULL
     OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) < 1 THEN
    RAISE EXCEPTION 'At least one supporting document must be attached';
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

-- ---------------------------------------------------------------------------
-- 8. Decide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_act_on_bill_cancellation(
  p_request_id uuid,
  p_action     text,
  p_notes      text DEFAULT NULL
)
RETURNS TABLE(status text, request_number text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req   public.billing_bill_cancel_requests%ROWTYPE;
  v_elig  record;
  v_actor record;
  v_fail  text;
BEGIN
  IF p_action NOT IN ('approve','decline') THEN
    RAISE EXCEPTION 'p_action must be approve or decline';
  END IF;

  SELECT * INTO v_req FROM public.billing_bill_cancel_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;

  IF NOT public.fn_can_decide_bill_cancellation(p_request_id) THEN
    RAISE EXCEPTION 'You are not an approver for this institution''s bill cancellations';
  END IF;

  IF v_req.requested_by IS NOT NULL AND v_req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot decide your own cancellation request - another approver must act on it';
  END IF;

  IF p_action = 'decline' AND (p_notes IS NULL OR length(trim(p_notes)) < 3) THEN
    RAISE EXCEPTION 'A reason is required to decline a request';
  END IF;

  SELECT * INTO v_actor FROM public._fn_bill_cancel_actor();

  IF p_action = 'decline' THEN
    UPDATE public.billing_bill_cancel_requests
       SET status='declined', decided_by=auth.uid(), decided_at=now(),
           decision_notes=trim(p_notes), decided_by_name=v_actor.actor_name,
           decided_by_email=v_actor.actor_email, decided_by_role=v_actor.actor_role,
           decided_by_designation=v_actor.actor_designation,
           decided_by_is_super_admin=v_actor.actor_is_super_admin, updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_bill_cancel_request_actions
      (request_id, action_type, actor_id, actor_name, actor_email, actor_role_name,
       actor_is_super_admin, notes)
    VALUES (p_request_id, 'declined', auth.uid(), v_actor.actor_name, v_actor.actor_email,
            v_actor.actor_role, v_actor.actor_is_super_admin, trim(p_notes));
    RETURN QUERY SELECT 'declined'::text, v_req.request_number, 'Request declined. The bill is unchanged.'::text;
    RETURN;
  END IF;

  -- Re-validate: the bill was not frozen while the request waited. Record the
  -- failure (and RETURN, not RAISE, so the record survives the transaction).
  IF v_req.bill_id IS NULL THEN
    v_fail := 'The bill no longer exists';
  ELSE
    -- The request's own pending row would make the bill ineligible; the
    -- eligibility function counts it, so test the other conditions directly.
    SELECT * INTO v_elig FROM public.fn_bill_cancel_eligibility(ARRAY[v_req.bill_id]);
    IF v_elig.bill_id IS NULL THEN
      v_fail := 'The bill is not visible to the approver';
    ELSIF v_elig.receipted_amount > 0 THEN
      v_fail := v_elig.blocked_reason;
    ELSIF v_elig.pending_request_id IS DISTINCT FROM p_request_id THEN
      v_fail := COALESCE(v_elig.blocked_reason, 'The bill is no longer in a cancellable state');
    ELSIF NOT EXISTS (SELECT 1 FROM public.billing_student_bills
                       WHERE id = v_req.bill_id
                         AND billing_student_bills.status IN ('unpaid','partially_paid','overdue')) THEN
      v_fail := 'The bill is no longer in a cancellable state';
    END IF;
  END IF;

  IF v_fail IS NOT NULL THEN
    UPDATE public.billing_bill_cancel_requests
       SET status='failed', decided_by=auth.uid(), decided_at=now(), decision_notes=v_fail,
           decided_by_name=v_actor.actor_name, decided_by_email=v_actor.actor_email,
           decided_by_role=v_actor.actor_role, decided_by_designation=v_actor.actor_designation,
           decided_by_is_super_admin=v_actor.actor_is_super_admin, updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_bill_cancel_request_actions
      (request_id, action_type, actor_id, actor_name, actor_email, actor_role_name,
       actor_is_super_admin, notes)
    VALUES (p_request_id, 'failed', auth.uid(), v_actor.actor_name, v_actor.actor_email,
            v_actor.actor_role, v_actor.actor_is_super_admin, v_fail);
    RETURN QUERY SELECT 'failed'::text, v_req.request_number, v_fail;
    RETURN;
  END IF;

  PERFORM public._fn_exec_bill_cancel(p_request_id);

  UPDATE public.billing_bill_cancel_requests
     SET status='approved', decided_by=auth.uid(), decided_at=now(),
         decision_notes=NULLIF(trim(COALESCE(p_notes, '')), ''),
         decided_by_name=v_actor.actor_name, decided_by_email=v_actor.actor_email,
         decided_by_role=v_actor.actor_role, decided_by_designation=v_actor.actor_designation,
         decided_by_is_super_admin=v_actor.actor_is_super_admin, updated_at=now()
   WHERE id = p_request_id;
  INSERT INTO public.billing_bill_cancel_request_actions
    (request_id, action_type, actor_id, actor_name, actor_email, actor_role_name,
     actor_is_super_admin, notes)
  VALUES (p_request_id, 'approved', auth.uid(), v_actor.actor_name, v_actor.actor_email,
          v_actor.actor_role, v_actor.actor_is_super_admin, NULLIF(trim(COALESCE(p_notes, '')), ''));

  RETURN QUERY SELECT 'approved'::text, v_req.request_number,
                      'Bill cancelled and its balance cleared.'::text;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9. Withdraw -- the requester (or a super admin) while still pending.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_withdraw_bill_cancellation(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req   public.billing_bill_cancel_requests%ROWTYPE;
  v_actor record;
BEGIN
  SELECT * INTO v_req FROM public.billing_bill_cancel_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;
  IF v_req.requested_by IS DISTINCT FROM auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;

  SELECT * INTO v_actor FROM public._fn_bill_cancel_actor();

  UPDATE public.billing_bill_cancel_requests
     SET status='withdrawn', updated_at=now() WHERE id = p_request_id;

  INSERT INTO public.billing_bill_cancel_request_actions
    (request_id, action_type, actor_id, actor_name, actor_email, actor_role_name,
     actor_is_super_admin, notes)
  VALUES (p_request_id, 'withdrawn', auth.uid(), v_actor.actor_name, v_actor.actor_email,
          v_actor.actor_role, v_actor.actor_is_super_admin, NULLIF(trim(COALESCE(p_notes, '')), ''));
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10. Activity log -- one user_activity_logs row per history action.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_log_bill_cancel_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req    public.billing_bill_cancel_requests%ROWTYPE;
  v_desc   text;
  v_label  text;
  v_actor  uuid;
BEGIN
  SELECT * INTO v_req FROM public.billing_bill_cancel_requests WHERE id = NEW.request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  v_actor := COALESCE(NEW.actor_id, v_req.requested_by);
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  v_label := COALESCE(v_req.bill_snapshot->>'bill_description',
                      v_req.bill_snapshot->>'category_name', 'bill');

  v_desc := CASE NEW.action_type
    WHEN 'requested' THEN format('Cancellation requested for bill "%s" (Rs %s) - awaiting approval, bill still payable', v_label, v_req.amount)
    WHEN 'approved'  THEN format('Cancellation APPROVED for bill "%s" (Rs %s) - bill cancelled', v_label, v_req.amount)
    WHEN 'declined'  THEN format('Cancellation declined for bill "%s" - bill unchanged', v_label)
    WHEN 'withdrawn' THEN format('Cancellation request withdrawn for bill "%s" - bill unchanged', v_label)
    WHEN 'failed'    THEN format('Cancellation failed for bill "%s": %s', v_label, COALESCE(NEW.notes, ''))
    ELSE format('Cancellation %s for bill "%s"', NEW.action_type, v_label)
  END;

  INSERT INTO public.user_activity_logs (
    user_id, action_type, resource_type, resource_id, resource_name,
    description, institution_id, metadata
  ) VALUES (
    v_actor,
    'cancel_' || CASE NEW.action_type
                   WHEN 'requested' THEN 'request'
                   WHEN 'approved'  THEN 'approve'
                   WHEN 'declined'  THEN 'decline'
                   WHEN 'withdrawn' THEN 'withdraw'
                   ELSE NEW.action_type END,
    'student_bill',
    v_req.bill_id,
    v_label,
    v_desc,
    v_req.institution_id,
    jsonb_build_object(
      'sub_type',             'bill_cancel_request',
      'request_id',           v_req.id,
      'request_number',       v_req.request_number,
      'amount',               v_req.amount,
      'reason_code',          v_req.reason_code,
      'reason',               v_req.reason,
      'student_id',           v_req.student_id,
      'action_notes',         NEW.notes,
      'actor_name',           NEW.actor_name,
      'actor_role',           NEW.actor_role_name,
      'actor_is_super_admin', NEW.actor_is_super_admin
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_bill_cancel_activity ON public.billing_bill_cancel_request_actions;
CREATE TRIGGER trg_log_bill_cancel_activity
  AFTER INSERT ON public.billing_bill_cancel_request_actions
  FOR EACH ROW EXECUTE FUNCTION public._fn_log_bill_cancel_activity();

-- ---------------------------------------------------------------------------
-- 11. Close the direct route.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_cancel_student_bill(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.fn_guard_bill_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF COALESCE(current_setting('app.bill_cancel_ctx', true), '') <> NEW.id::text THEN
      RAISE EXCEPTION 'Bills can only be cancelled through an approved bill cancellation request (Billing > Bill Cancellations). Direct status updates are not permitted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_resolve_bill_cancel_approver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_is_bill_cancel_approver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_can_decide_bill_cancellation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_bill_cancel_eligibility(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_bill_cancel_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_exec_bill_cancel(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_log_bill_cancel_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_request_bill_cancellation(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_act_on_bill_cancellation(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_withdraw_bill_cancellation(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_resolve_bill_cancel_approver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_bill_cancel_approver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_decide_bill_cancellation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_bill_cancel_eligibility(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_request_bill_cancellation(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_act_on_bill_cancellation(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_withdraw_bill_cancellation(uuid, text) TO authenticated, service_role;

