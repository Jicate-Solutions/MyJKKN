-- =====================================================================================
-- fn_list_my_pending_recruitment — "Awaiting my action" inbox for HR recruitment
-- =====================================================================================
-- Replaces the broken PostgREST `.contains('approval_chain', [{approver_user_id}])` filter
-- that PR #946 wired into RecruitmentService.listCandidates(pending_for_me=true).
--
-- Why the old filter was broken:
--   buildApprovalChain() sets approver_user_id = NULL at submit-time (only filled at
--   approve-time). So `approval_chain @> [{"approver_user_id": <id>}]` matches 0 rows
--   for everyone. Worse, the combined query (status IN + jsonb @> + range + count=exact)
--   raised an unpicklable error in PostgREST for super-admin auth context, surfacing as
--   HTTP 500 `{"error":"Unknown error"}`.
--
-- Correct comparison:
--   Match the caller's `user_roles → custom_roles.role_key` (lowercased) against
--   `approval_chain[current_step].approver_role`. That's an array-deref-then-join that
--   PostgREST cannot express cleanly — hence the SECURITY DEFINER RPC.
--
-- Why SECURITY DEFINER:
--   1. user_roles + custom_roles are RLS-restricted; SD lets the fn read them on behalf
--      of the caller without granting the caller direct table access.
--   2. Returning SETOF hr_recruitment_candidates means PostgREST still enforces the
--      table's RLS on the caller for the returned rows (the SD only widens the role
--      lookup, not the candidate visibility).
--
-- Empty-chain orphans (legacy candidates with approval_chain = '[]'::jsonb) are
-- correctly EXCLUDED here — nobody is the named approver, so they cannot be "awaiting
-- my action". They remain visible via the "All Pending" tab (separate code path).
--
-- ACL: REVOKE FROM PUBLIC/anon, GRANT to authenticated only. Final grantees:
--   {postgres, authenticated, service_role}.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_list_my_pending_recruitment(
  p_user_id uuid
)
RETURNS SETOF public.hr_recruitment_candidates
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH user_role_keys AS (
    SELECT lower(cr.role_key) AS role_key
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = p_user_id
  )
  SELECT c.*
  FROM public.hr_recruitment_candidates c
  WHERE c.status IN ('submitted', 'pending_approval')
    AND jsonb_array_length(COALESCE(c.approval_chain, '[]'::jsonb)) > 0
    AND lower(
      (c.approval_chain -> c.current_step ->> 'approver_role')
    ) IN (SELECT role_key FROM user_role_keys)
  ORDER BY c.submitted_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_list_my_pending_recruitment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_list_my_pending_recruitment(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_list_my_pending_recruitment(uuid) TO authenticated;
