-- ============================================================================
-- RCLTP Part-B — fix the review/approve path so a Senior Learner can approve
-- AI-generated question drafts. 2026-07-23.
-- ----------------------------------------------------------------------------
-- Two pre-existing bugs block the review gate (found while wiring AI generation):
--
--   1. FK MISMATCH. `reviewed_by` referenced `staff(id)`, but the review console
--      writes `auth.uid()` (= profiles.id) — the same value `created_by` /
--      `updated_by` use, and those correctly reference profiles(id). So an approve
--      would violate the staff(id) FK for any reviewer whose profiles.id is not
--      also a staff.id. Repoint reviewed_by → profiles(id) for consistency.
--
--   2. PERMISSION SPLIT. The review page is gated on `rcltp.question.approve`, but
--      the only write policy (`rcltp_pbq_write`, FOR ALL) requires
--      `rcltp.config.manage`. A reviewer holding only `rcltp.question.approve`
--      sees the page but is RLS-denied on the approve UPDATE. Add a dedicated
--      UPDATE policy that also admits `rcltp.question.approve` (institution-scoped
--      rows only — global-library rows stay admin/author-managed). INSERT/DELETE
--      remain author-only via the existing FOR ALL policy (no over-grant).
-- ============================================================================

BEGIN;

-- 1. reviewed_by → profiles(id) (consistent with created_by / updated_by).
ALTER TABLE public.rcltp_part_b_questions
  DROP CONSTRAINT IF EXISTS rcltp_part_b_questions_reviewed_by_fkey;
ALTER TABLE public.rcltp_part_b_questions
  ADD CONSTRAINT rcltp_part_b_questions_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);

-- 2. Reviewers (rcltp.question.approve) may UPDATE institution-scoped questions
--    (approve / retire / edit). Additive to the existing FOR ALL write policy.
DROP POLICY IF EXISTS rcltp_pbq_update_review ON public.rcltp_part_b_questions;
CREATE POLICY rcltp_pbq_update_review ON public.rcltp_part_b_questions
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      (
        user_has_permission('rcltp.config.manage')
        OR user_has_permission('rcltp.question.approve')
      )
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      (
        user_has_permission('rcltp.config.manage')
        OR user_has_permission('rcltp.question.approve')
      )
      AND institution_id IS NOT NULL
      AND role_has_institution_access(institution_id)
    )
  );

COMMIT;
