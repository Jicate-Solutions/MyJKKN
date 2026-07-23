-- ============================================================================
-- Premium Stay Phase 1 — RLS for chief_warden override path
-- ============================================================================
-- Created: 2026-05-16
-- Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#13)
--
-- Chief wardens can override a premium learner's pick provided they record
-- a mandatory free-text override_reason. This adds an ADDITIONAL UPDATE
-- policy on hostel_allocations that grants chief_warden (via the new
-- campus_living.premium.override_pick permission) the ability to write
-- to allocations within their institution + block scope — but only when
-- override_reason is non-empty.
--
-- The existing campus_living.allocations.edit policy is unchanged. The new
-- policy is additive — RLS evaluates ALL FOR UPDATE policies and any-grants
-- the row if any policy permits, so this expands the grant set rather than
-- shrinking it.
-- ============================================================================

DROP POLICY IF EXISTS hostel_allocations_premium_override ON public.hostel_allocations;
CREATE POLICY hostel_allocations_premium_override ON public.hostel_allocations
  FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.premium.override_pick')
      AND role_has_institution_access(institution_id)
      AND role_has_block_access(block_id)
    )
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.premium.override_pick')
      AND role_has_institution_access(institution_id)
      AND role_has_block_access(block_id)
      AND override_reason IS NOT NULL
      AND length(trim(override_reason)) > 0
    )
  );

COMMENT ON POLICY hostel_allocations_premium_override ON public.hostel_allocations IS
  'Premium Stay Phase 1: grants chief_warden (via campus_living.premium.override_pick) the ability to forcibly re-allocate a premium learner''s bed, conditional on a non-empty override_reason. Other writers (campus_living.allocations.edit holders) keep their existing policy. Audit trail: override_reason is the gate.';
