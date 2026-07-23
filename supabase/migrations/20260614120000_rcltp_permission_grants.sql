-- ============================================================================
-- Migration: 20260614120000_rcltp_permission_grants
-- RCLTP Phase 0 — grant the rcltp.* permissions onto roles (THE LIVE FIX)
-- ============================================================================
-- BUG this fixes: Phase A (PR #1387) wrote the rcltp.* permission keys into the
-- RLS WHERE-clauses (user_has_permission('rcltp.config.manage') etc.) but the
-- deferred seed migration (20260614000002) that grants those keys onto roles was
-- never written. Audit of all 67 custom_roles confirmed ZERO rows carry any
-- rcltp.* key. Net effect in production TODAY: no non-superadmin can pass any
-- RCLTP staff/teacher/principal RLS check — Phase A/B + the policy editor are
-- effectively super-admin-only. This migration grants the keys so the shipped
-- RLS becomes functional.
--
-- Permissions model: custom_roles.permissions is a flat jsonb { "dotted.key": bool }.
-- Canonical grant pattern (see 20260531090200_student_role_resident_bundle.sql):
--   UPDATE custom_roles SET permissions = permissions || jsonb_build_object(...).
-- Idempotent: the || merge overwrites the same keys to the same values on re-run.
--
-- Keys the Phase A RLS actually evaluates (the load-bearing 5):
--   rcltp.report.view_all, rcltp.report.view_class, rcltp.review,
--   rcltp.assessment.manage, rcltp.config.manage
-- Plus PRD §5 nav/UI keys for students: rcltp.assessment.take, rcltp.report.view_own.
--
-- Grant matrix (PRD §2 personas × §5 permissions):
--   admins (super_admin/administrator/system_admin) — full rcltp.* (they bypass
--     RLS, but UI requirePermission/hasPermission reads this jsonb)
--   teachers (faculty/school_faculty) — assessment.manage + review + report.view_class
--   heads (principal/school_principal) — report.view_all + config.manage + report.view_class
--   students (student) — assessment.take + report.view_own
--
-- DEFERRED (NOT granted here): parent (rcltp.report.view_child). Parent-facing
--   RCLTP RLS is not built (Phase A note: parent branch deferred → follow-up
--   20260614000003) and the rcltp_consent / parent_learner_links scope decision is
--   still OPEN. Granting view_child now would be a no-op (no RLS branch reads it)
--   and would misleadingly imply parent access works. Grant it WITH the parent RLS.
--
-- v2 permission keys (rcltp.content.manage, rcltp.level.manage, rcltp.reward.config,
--   rcltp.reward.view, rcltp.question.generate, rcltp.question.approve,
--   rcltp.nudge.monitor, rcltp.assessment.trigger) are intentionally NOT granted
--   here — their surfaces + RLS clauses don't exist yet; they land with their
--   respective v2 phases. This migration only makes the SHIPPED RLS work.
-- ============================================================================

-- Admins — full RCLTP key set (RLS-bypass roles; grant for UI permission checks)
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
      'rcltp.assessment.take',   true,
      'rcltp.assessment.manage', true,
      'rcltp.review',            true,
      'rcltp.report.view_own',   true,
      'rcltp.report.view_child', true,
      'rcltp.report.view_class', true,
      'rcltp.report.view_all',   true,
      'rcltp.config.manage',     true
    ),
    updated_at = now()
WHERE role_key IN ('super_admin', 'administrator', 'system_admin');

-- Teachers — manage assessments for their class, review recordings, see class reports
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
      'rcltp.assessment.manage', true,
      'rcltp.review',            true,
      'rcltp.report.view_class', true
    ),
    updated_at = now()
WHERE role_key IN ('faculty', 'school_faculty');

-- Heads (principal / school principal) — institution-wide reports + config
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
      'rcltp.report.view_all',   true,
      'rcltp.report.view_class', true,
      'rcltp.config.manage',     true
    ),
    updated_at = now()
WHERE role_key IN ('principal', 'school_principal');

-- Students — take assessments (writes still go server-side) + see own report
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
      'rcltp.assessment.take', true,
      'rcltp.report.view_own', true
    ),
    updated_at = now()
WHERE role_key = 'student';
