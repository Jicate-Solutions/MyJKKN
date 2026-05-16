-- Migration: grant_admission_crm_to_counselor_roles
-- Date: 2026-05-05
-- Owner: Boobalan (per Director request — full admission CRM access for all
--        non-admission counselor roles + cross-institutional visibility)
--
-- Background
-- ──────────
-- Three system "counselor" roles (learner_counselor, staff_counselor,
-- health_counselor) had institution_scope='own' and ZERO admission.* permissions.
-- This made the Call Logs page (and the entire admission CRM) invisible to them
-- because PermissionGuard (components/auth/permission-guard.tsx) requires either:
--   (a) the literal `admission.view` permission key (which NO role has), or
--   (b) institution_scope='all' on at least one assigned role, or
--   (c) role_key ∈ {admission, admission_counselor, expo_counselor}
--
-- This migration takes path (b): widening institution_scope to 'all' triggers
-- isAdmissionGlobalUser/isCounselorUser in usePermissions.ts (lines 207, 233)
-- without any code change. We additionally union the admission_counselor
-- permission set onto these roles so that downstream granular checks
-- (canAccess('admission','leads.edit'), etc.) also pass.
--
-- Existing role-specific permissions (learners.counseling.*, hr.counseling.*,
-- health.*) are preserved via jsonb || merge.
-- ─────────────────────────────────────────────────────────────────────────
WITH admission_perm_block AS (
  SELECT jsonb_object_agg(k, true) AS perms
  FROM custom_roles cr,
       LATERAL jsonb_object_keys(cr.permissions) k
  WHERE cr.role_key = 'admission_counselor'
    AND cr.permissions ->> k = 'true'
    AND (
         k LIKE 'admission.%'
      OR k LIKE 'admissions.%'
      OR k LIKE 'learners.admissions.%'
      OR k = 'application_hub.view'
      OR k = 'learners.profiles.view'
    )
)
UPDATE custom_roles cr
SET
  permissions       = cr.permissions || (SELECT perms FROM admission_perm_block),
  institution_scope = 'all',
  updated_at        = NOW()
WHERE cr.role_key IN ('learner_counselor', 'staff_counselor', 'health_counselor');
