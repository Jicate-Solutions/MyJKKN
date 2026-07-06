-- =====================================================================================
-- Dynamic recruitment approval flows (2026-07-06), part 2: pinned-user routing.
-- Extends fn_list_my_pending_recruitment so a chain step can pin a SPECIFIC
-- approver (approver_user_id) instead of routing by role_key.
-- Matching rules for the CURRENT step:
--   - approver_user_id set   → only that user sees it (role ignored)
--   - approver_user_id null  → any holder of approver_role sees it (legacy behavior;
--     legacy chains only stamp approver_user_id on already-DECIDED steps, and
--     current_step always points at an undecided one, so this is safe)
-- Rebuilt from the 20260516170000 definition (same signature → true replace).
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_list_my_pending_recruitment(p_user_id uuid)
RETURNS SETOF hr_recruitment_candidates
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH user_role_keys AS (
  SELECT lower(cr.role_key) AS role_key
  FROM public.user_roles ur
  JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = p_user_id
)
SELECT c.*
FROM public.hr_recruitment_candidates c
WHERE c.status IN ('submitted','pending_approval')
  AND jsonb_array_length(COALESCE(c.approval_chain,'[]'::jsonb)) > 0
  AND (
    (c.approval_chain -> c.current_step ->> 'approver_user_id') = p_user_id::text
    OR (
      (c.approval_chain -> c.current_step ->> 'approver_user_id') IS NULL
      AND lower((c.approval_chain -> c.current_step ->> 'approver_role'))
          IN (SELECT role_key FROM user_role_keys)
    )
  )
ORDER BY c.submitted_at DESC;
$function$;
