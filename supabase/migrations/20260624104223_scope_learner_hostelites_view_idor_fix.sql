-- ============================================================================
-- Fix cross-tenant IDOR on the hostelites roster (campus-living -> Residents).
-- ============================================================================
-- v_learner_hostelites bypasses RLS (security_invoker = false), so it returns
-- EVERY hostelite regardless of caller. LearnerHosteliteService.listHostelites
-- runs CLIENT-SIDE and scoped block-wardens ONLY by a CLIENT-supplied
-- `block_ids` filter -- a warden could tamper the request (drop or replace the
-- filter) and read every hostelite across all blocks and institutions, plus
-- their billing rollups.
--
-- Fix: a security_barrier view that re-derives the caller's scope from
-- auth.uid() server-side (non-forgeable), mirroring the app's branching:
--   * super admin              -> all rows
--   * caller with block grants -> only their granted blocks (cross-institution;
--                                 excludes unassigned / NULL-block learners)
--   * everyone else            -> rows in their accessible institutions
--
-- The base view is intentionally left unchanged: other consumers (dashboard,
-- detail drawer, allocation-eligibility) read it server-side and expect the
-- unscoped projection. Only the client-facing list path is repointed
-- (LearnerHosteliteService.listHostelites -> v_learner_hostelites_scoped).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_learner_hostelites_scoped
WITH (security_barrier = true) AS
SELECT v.*
FROM public.v_learner_hostelites v
WHERE
  is_super_admin()
  OR (
    CASE
      -- Is the caller block-scoped? (has at least one active warden grant)
      WHEN EXISTS (
        SELECT 1 FROM public.user_block_access uba
        WHERE uba.user_id = auth.uid()
          AND uba.revoked_at IS NULL
      )
      -- Yes -> restrict to their granted blocks; unassigned learners
      -- (current_block_id IS NULL) belong to no warden, so exclude them.
      THEN v.current_block_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.user_block_access uba
             WHERE uba.user_id = auth.uid()
               AND uba.revoked_at IS NULL
               AND uba.block_id = v.current_block_id
           )
      -- No -> institution-scoped access (admins / campus-living operators).
      ELSE role_has_institution_access(v.institution_id)
    END
  );

-- API exposure: authenticated only, never anon.
REVOKE ALL ON public.v_learner_hostelites_scoped FROM anon;
GRANT SELECT ON public.v_learner_hostelites_scoped TO authenticated;
