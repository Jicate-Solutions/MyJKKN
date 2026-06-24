-- Cross-institution named approvers for Service Requests.
--
-- Context: the service-type Approval Workflow builder now lets an author pick
-- ANY user as a named approver (service_request_approval_steps.approver_user_ids),
-- independent of the service type's Service Visibility / institution scope.
-- But the runtime was still institution-bound at the RLS layer:
--
--   • service_requests SELECT ("Approvers can view pending requests") matched
--     approver_user_ids in its EXISTS, but still AND-gated the whole policy on
--     is_super_admin()/is_admin()/role_has_institution_access(institution_id).
--   • service_requests UPDATE ("service_requests_approve_permission") required
--     the service_requests.approve permission AND role_has_institution_access.
--   • service_request_approvals / service_request_timeline SELECT required the
--     viewer to be requester/admin or hold service_requests.approve.
--
-- Net effect: a named approver whose own institution differs from the
-- request's institution (and who isn't super/admin or institution-granted)
-- could neither see nor act on the request, even though they were explicitly
-- chosen. This migration closes that gap WITHOUT relaxing tenant isolation for
-- the broad role-based path:
--
--   • Role-based approval stays institution-scoped (existing policies untouched).
--   • Explicitly-named approvers (present in approver_user_ids) get ADDITIVE
--     PERMISSIVE policies that grant SELECT/UPDATE regardless of institution.
--
-- INSERTs on service_request_approvals / service_request_timeline are already
-- gated only on `auth.uid() IS NOT NULL`, so named approvers can already write
-- the action-log + timeline rows — no new INSERT policy is needed.
--
-- Surgical + reversible: one SECURITY DEFINER predicate + 4 additive PERMISSIVE
-- policies. Existing policies are untouched, so nothing loses access.
--
-- Applied via MCP apply_migration on 2026-06-24.

BEGIN;

-- Predicate: is the calling user a named approver on ANY step of this request?
-- SECURITY DEFINER so it can read service_requests/steps from inside
-- service_requests' own policies without RLS recursion. It only ever reveals a
-- boolean about the CALLER's own membership (auth.uid()), so it's safe to
-- expose to authenticated. "Any step" (not just the current one) is
-- deliberate: it keeps the UPDATE WITH CHECK satisfied when handleApproved()
-- advances current_approval_step past the step the approver was named on.
CREATE OR REPLACE FUNCTION public.user_is_request_named_approver(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM service_requests sr
    JOIN service_request_approval_steps st
      ON st.service_type_id = sr.service_type_id
    WHERE sr.id = p_request_id
      AND auth.uid() = ANY (st.approver_user_ids)
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_request_named_approver(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_request_named_approver(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_is_request_named_approver(uuid) TO authenticated;

-- service_requests: a named approver can SEE the request (any institution).
DROP POLICY IF EXISTS "service_requests_named_approver_select" ON service_requests;
CREATE POLICY "service_requests_named_approver_select" ON service_requests
FOR SELECT
USING (public.user_is_request_named_approver(id));

-- service_requests: a named approver can ACT on the request — advance / approve
-- / reject / return (any institution). WITH CHECK uses the same "any step"
-- predicate so the status/step transition on the resulting row still passes.
DROP POLICY IF EXISTS "service_requests_named_approver_update" ON service_requests;
CREATE POLICY "service_requests_named_approver_update" ON service_requests
FOR UPDATE
USING (public.user_is_request_named_approver(id))
WITH CHECK (public.user_is_request_named_approver(id));

-- service_request_approvals: a named approver can read the action log for
-- requests they're an approver on (detail-view approval history).
DROP POLICY IF EXISTS "sr_approvals_named_approver_select" ON service_request_approvals;
CREATE POLICY "sr_approvals_named_approver_select" ON service_request_approvals
FOR SELECT
USING (public.user_is_request_named_approver(service_request_id));

-- service_request_timeline: a named approver can read the timeline for requests
-- they're an approver on.
DROP POLICY IF EXISTS "sr_timeline_named_approver_select" ON service_request_timeline;
CREATE POLICY "sr_timeline_named_approver_select" ON service_request_timeline
FOR SELECT
USING (public.user_is_request_named_approver(service_request_id));

COMMIT;
