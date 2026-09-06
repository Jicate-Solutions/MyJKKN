-- Dynamic approval flow for receipt cancellations.
--
-- Approval used to be hardcoded: fn_act_on_receipt_cancellation raised unless
-- is_super_admin(). A super admin can now name WHO decides, per institution.
--
-- Resolution order, most specific first:
--   1. active flow for the receipt's institution
--   2. active group-wide flow (institution_id IS NULL)
--   3. none -> SUPER ADMIN ONLY, exactly as before
--
-- (3) is what makes this migration a no-op on the day it lands: no flow exists
-- yet, so every decision still requires a super admin until one is saved.
--
-- Super admins keep approval unconditionally. They configure the flows, and
-- they are the way out when a flow names someone who has left.

CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_approval_flows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = group-wide default. A row for a specific institution wins over it.
  institution_id    uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  flow_name         text NOT NULL,
  -- role_key, not custom_roles.id: it is unique, it is what profiles.role
  -- stores, and it keeps the row readable. ON UPDATE CASCADE so renaming a
  -- role cannot silently orphan a flow.
  approver_role_key text REFERENCES public.custom_roles(role_key)
                         ON UPDATE CASCADE ON DELETE RESTRICT,
  approver_user_id  uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id),
  updated_by        uuid REFERENCES public.profiles(id),
  CONSTRAINT billing_receipt_cancel_flow_one_approver CHECK (
    (approver_role_key IS NOT NULL)::int + (approver_user_id IS NOT NULL)::int = 1
  )
);

COMMENT ON TABLE public.billing_receipt_cancel_approval_flows IS
  'Who may decide a receipt-cancellation request. One active flow per institution, plus an optional group-wide default. No flow = super admin only.';

-- At most one active flow per institution, and at most one active group-wide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_flow_active_institution
  ON public.billing_receipt_cancel_approval_flows (institution_id)
  WHERE is_active AND institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_flow_active_global
  ON public.billing_receipt_cancel_approval_flows ((institution_id IS NULL))
  WHERE is_active AND institution_id IS NULL;

ALTER TABLE public.billing_receipt_cancel_approval_flows ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can see the queue, so a requester can be told who
-- their request is waiting on. Writable by super admins ONLY, which is the
-- whole point: approval authority must not be delegable by whoever holds a
-- billing permission.
DROP POLICY IF EXISTS billing_receipt_cancel_flows_select ON public.billing_receipt_cancel_approval_flows;
CREATE POLICY billing_receipt_cancel_flows_select
  ON public.billing_receipt_cancel_approval_flows FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (SELECT user_has_permission('billing.receipts.view'))
    OR (SELECT user_has_permission('billing.receipts.cancel.request'))
  );

DROP POLICY IF EXISTS billing_receipt_cancel_flows_write ON public.billing_receipt_cancel_approval_flows;
CREATE POLICY billing_receipt_cancel_flows_write
  ON public.billing_receipt_cancel_approval_flows FOR ALL TO authenticated
  USING ((SELECT is_super_admin()))
  WITH CHECK ((SELECT is_super_admin()));

-- ── Resolution ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_resolve_receipt_cancel_approver(
  p_institution_id uuid
)
RETURNS public.billing_receipt_cancel_approval_flows
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.billing_receipt_cancel_approval_flows
  WHERE is_active
    AND (institution_id = p_institution_id OR institution_id IS NULL)
  -- Specific beats general: a row for the institution sorts before the
  -- group-wide default, which carries a NULL institution_id.
  ORDER BY institution_id NULLS LAST
  LIMIT 1;
$function$;

/**
 * Does the CURRENT user hold the role named by a flow?
 *
 * Mirrors user_has_permission()'s role resolution exactly: the UNION of
 * profiles.role and user_roles -> custom_roles.role_key. This is not
 * belt-and-braces. Measured 2026-08-25: 448 users hold a user_roles role that
 * differs from profiles.role (multi-role, not corruption) and 45 users have a
 * profiles.role with no user_roles row at all. Consulting either source alone
 * grants the wrong people authority or locks out the other set, silently.
 */
CREATE OR REPLACE FUNCTION public._fn_current_user_holds_role(p_role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_role_key IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role = p_role_key)
    OR EXISTS (SELECT 1 FROM public.user_roles ur
                 JOIN public.custom_roles cr ON cr.id = ur.role_id
                WHERE ur.user_id = auth.uid() AND cr.role_key = p_role_key)
  );
$function$;

/** "Am I an approver for this institution?" — for the page guard and RLS. */
CREATE OR REPLACE FUNCTION public.fn_is_receipt_cancel_approver(
  p_institution_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flow public.billing_receipt_cancel_approval_flows;
BEGIN
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF p_institution_id IS NULL THEN
    -- No institution in hand (the page guard asks "anywhere?"): true when any
    -- active flow names this user.
    RETURN EXISTS (
      SELECT 1 FROM public.billing_receipt_cancel_approval_flows f
      WHERE f.is_active
        AND (f.approver_user_id = auth.uid()
             OR public._fn_current_user_holds_role(f.approver_role_key))
    );
  END IF;

  v_flow := public.fn_resolve_receipt_cancel_approver(p_institution_id);
  IF v_flow.id IS NULL THEN
    RETURN false; -- no flow: super admins only, and they returned above
  END IF;

  RETURN (
    v_flow.approver_user_id = auth.uid()
    OR public._fn_current_user_holds_role(v_flow.approver_role_key)
  ) AND role_has_institution_access(p_institution_id);
END;
$function$;

/**
 * The single authority check for deciding one request. Both
 * fn_act_on_receipt_cancellation and the UI call this, so the button and the
 * RPC cannot drift apart.
 *
 * Four-eyes is NOT applied here — the caller reports "you raised this" as its
 * own message, and the UI needs to distinguish "not an approver" from "your
 * own request".
 */
CREATE OR REPLACE FUNCTION public.fn_can_decide_receipt_cancellation(
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.billing_receipt_cancel_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.billing_receipt_cancel_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.fn_is_receipt_cancel_approver(v_req.institution_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_resolve_receipt_cancel_approver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_current_user_holds_role(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_is_receipt_cancel_approver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_can_decide_receipt_cancellation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_receipt_cancel_approver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._fn_current_user_holds_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_receipt_cancel_approver(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_decide_receipt_cancellation(uuid) TO authenticated, service_role;

-- ── Widen the two gates in front of the queue ───────────────────────────────
--
-- Without this a configured approver opens the page and sees NOTHING: the
-- SELECT policy demanded billing.receipts.view, which most candidate approver
-- roles (principal among them) do not hold. An empty queue and a 403 are the
-- two ways this feature would have failed quietly.

DROP POLICY IF EXISTS billing_receipt_cancel_requests_select ON public.billing_receipt_cancel_requests;
CREATE POLICY billing_receipt_cancel_requests_select
  ON public.billing_receipt_cancel_requests FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR requested_by = (SELECT auth.uid())
    OR ((SELECT user_has_permission('billing.receipts.view')) AND role_has_institution_access(institution_id))
    OR public.fn_is_receipt_cancel_approver(institution_id)
  );

DROP POLICY IF EXISTS billing_receipt_cancel_actions_select ON public.billing_receipt_cancel_request_actions;
CREATE POLICY billing_receipt_cancel_actions_select
  ON public.billing_receipt_cancel_request_actions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_receipt_cancel_requests r
      WHERE r.id = billing_receipt_cancel_request_actions.request_id
        AND (
          (SELECT is_super_admin())
          OR r.requested_by = (SELECT auth.uid())
          OR ((SELECT user_has_permission('billing.receipts.view')) AND role_has_institution_access(r.institution_id))
          OR public.fn_is_receipt_cancel_approver(r.institution_id)
        )
    )
  );
