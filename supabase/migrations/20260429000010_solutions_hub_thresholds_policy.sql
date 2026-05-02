-- ============================================================================
-- Migration: 20260429000010_solutions_hub_thresholds_policy
-- Phase 1.5a follow-up — Retire 2 hardcoded Solutions Hub thresholds.
-- ============================================================================
-- Documents the policy seeds backing the runtime read in
-- lib/services/solutions/content-service.ts:
--
--   solutions.content.self_claim_threshold = 50000
--     Budget INR cap for content-order self-claim/HOD approval.
--     Above this the order escalates to MD approval.
--
--   solutions.content.revision_flag_threshold = 3
--     Revision count beyond which a deliverable is auto-flagged to MD
--     for review.
--
-- Idempotent — only inserts rows if no row exists for the (key, scope) pair.
-- The seed has already been written to prod via Supabase MCP; this file
-- exists so fresh databases (CI, local, fresh staging) inherit the same
-- defaults.
-- Substrate (table + fn_get_policy resolver) lives in
-- 20260429000002_platform_policies_substrate.sql.
-- ============================================================================

INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active
)
SELECT * FROM (VALUES
  (
    'solutions.content.self_claim_threshold',
    'global',
    NULL::uuid,
    '50000'::jsonb,
    'Budget INR threshold; orders <= this amount can be self-claimed/HOD-approved, above escalates to MD.',
    'number',
    true,
    true
  ),
  (
    'solutions.content.revision_flag_threshold',
    'global',
    NULL::uuid,
    '3'::jsonb,
    'Revision count threshold; deliverables exceeding this count auto-flag to MD.',
    'number',
    true,
    true
  )
) AS r(policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.platform_policies p
  WHERE p.policy_key = r.policy_key
    AND p.scope_type = r.scope_type
    AND COALESCE(p.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(r.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
