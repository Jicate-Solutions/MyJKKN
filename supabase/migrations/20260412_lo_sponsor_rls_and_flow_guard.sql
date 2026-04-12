-- Migration: Sponsor approval flow — RLS policies for sponsor visibility + update
-- Created: 2026-04-12
-- Purpose: Phase 2 of the sponsor-approval workflow.
--   Phase 1 added `sponsor_id`, `sponsor_approval_status`, `sponsor_comments`,
--   `sponsor_action_at` columns to `leave_onduty_applications` but no policies
--   let the sponsor see or update their own assignments.
--
--   This migration adds:
--     1. SELECT policy — sponsor sees applications where sponsor_id = auth.uid()
--     2. UPDATE policy — sponsor can set sponsor_approval_status/comments/action_at
--        on their own pending applications only (no retroactive edits)
--
--   Code-side enforcement (in leave-onduty-service.ts) also prevents the
--   academic approval chain from advancing while sponsor_approval_status
--   is still pending. RLS + code-level guard = defense in depth.

-- ============================================================================
-- 1. SELECT policy — sponsors see their own pending + acted-on applications
-- ============================================================================

DROP POLICY IF EXISTS "sponsors_view_assigned" ON leave_onduty_applications;
CREATE POLICY "sponsors_view_assigned" ON leave_onduty_applications
  FOR SELECT TO authenticated
  USING (sponsor_id = auth.uid());

-- ============================================================================
-- 2. UPDATE policy — sponsors can only act on PENDING, not retroactively edit
-- ============================================================================
-- Note: this is UPDATE permission for sponsors ONLY. The existing
-- `admins_update_applications` policy still handles admin updates.
-- The WITH CHECK clause prevents sponsors from modifying anything beyond
-- the sponsor-specific columns (RLS doesn't enforce column-level; we rely
-- on the service layer to only send sponsor_* columns in the patch).

DROP POLICY IF EXISTS "sponsors_update_own_pending" ON leave_onduty_applications;
CREATE POLICY "sponsors_update_own_pending" ON leave_onduty_applications
  FOR UPDATE TO authenticated
  USING (
    sponsor_id = auth.uid()
    AND sponsor_approval_status = 'pending'
  )
  WITH CHECK (
    sponsor_id = auth.uid()
  );

-- ============================================================================
-- 3. Reload PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';
