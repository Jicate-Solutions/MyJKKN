-- =====================================================================
-- Counselor Taxonomy Phase 1 — additive role seed
-- Spec: specs/counselor-taxonomy-spec.md
-- Date: 2026-04-27
--
-- What this migration does (Phase 1 = additive only; no schema changes):
--   1. Seeds 2 NEW counselor roles into custom_roles:
--        - learner_counselor  (counsels enrolled learners; scope=own)
--        - staff_counselor    (counsels employees; scope=own)
--   2. Updates the EXISTING health_counselor row:
--        - sets description (currently NULL on prod — flagged in spec)
--        - flips is_system_role from false -> true (spec bug fix)
--
-- Out of scope for Phase 1 (separate PRs):
--   - Module pages /learners/counseling/*, /hr/counseling/*  -> Phase 2
--   - Tables learner_counseling_sessions, staff_counseling_sessions -> Phase 2
--   - Renaming existing 'counselor' role to 'admission_counselor' -> Phase 3
--
-- Idempotency:
--   - INSERTs use ON CONFLICT (role_key) DO NOTHING to preserve any
--     manual edits made between PR open and PR merge.
--   - UPDATE on health_counselor is guarded by WHERE so re-running won't
--     overwrite values once they are already set.
--
-- Safe to re-run.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Learner Counsellor (NEW)
--    Counsels enrolled students on academic progress, well-being,
--    dropout prevention, and career guidance. College-scoped by default.
-- ---------------------------------------------------------------------
INSERT INTO custom_roles (
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  is_active,
  permissions,
  module_scopes
) VALUES (
  'learner_counselor',
  'Learner Counsellor',
  'Counsels enrolled learners on academic progress, well-being, dropout prevention, and career guidance. Logs sessions, tracks at-risk learners, and creates interventions. Scope: own institution.',
  true,
  'own',
  true,
  jsonb_build_object(
    -- === Unique counseling perms (NEW keys) ===
    'learners.counseling.view',           true,
    'learners.counseling.sessions.view',  true,
    'learners.counseling.sessions.create',true,
    'learners.counseling.notes.create',   true,
    'learners.counseling.notes.view_own', true,
    'learners.at_risk.view',              true,
    'learners.interventions.create',      true,
    'learners.interventions.close',       true,

    -- === Read-only access to existing data surfaces ===
    'learners.profiles.view',             true,
    'academic.attendance.view',           true,
    'academic.internal-marks.view',       true,
    'billing.schedule.view',              true,

    -- === Baseline app shell ===
    'view_dashboard',                     true,
    'view_profile',                       true
  ),
  '{}'::jsonb
)
ON CONFLICT (role_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Staff Counsellor (NEW)
--    Counsels employees on workplace wellness, grievance support, and
--    career development. College-scoped by default.
-- ---------------------------------------------------------------------
INSERT INTO custom_roles (
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  is_active,
  permissions,
  module_scopes
) VALUES (
  'staff_counselor',
  'Staff Counsellor',
  'Counsels employees on workplace wellness, grievance, and career development. Logs sessions, escalates formal grievances to HR, and reads attendance/leave patterns as wellness signals. Scope: own institution.',
  true,
  'own',
  true,
  jsonb_build_object(
    -- === Unique HR counseling perms (NEW keys) ===
    'hr.counseling.view',                 true,
    'hr.counseling.sessions.view',        true,
    'hr.counseling.sessions.create',      true,
    'hr.counseling.notes.create',         true,
    'hr.counseling.notes.view_own',       true,
    'hr.grievance.view',                  true,
    'hr.grievance.escalate',              true,
    'hr.career_development.view',         true,

    -- === Read-only access to existing HR surfaces ===
    'hr.employees.view',                  true,
    'hr.leave.view',                      true,

    -- === Baseline app shell ===
    'view_dashboard',                     true,
    'view_profile',                       true
  ),
  '{}'::jsonb
)
ON CONFLICT (role_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. health_counselor (EXISTING) — patch description + is_system_role
--    Spec flagged: row exists with description=NULL and is_system_role=false.
--    Both are bugs — this is a platform-level role, not a tenant-created one,
--    and it should carry the same documentation as every other system role.
--
--    Permission JSONB is intentionally LEFT ALONE here — the full perm audit
--    (sessions/notes/medical_records/legal_hold) lands in Phase 2 alongside
--    the health-counseling table schema and confidentiality RLS.
-- ---------------------------------------------------------------------
UPDATE custom_roles
   SET description = COALESCE(
         description,
         'Counsels learners and staff on medical and mental wellness. Session notes and medical records are confidential by default; super_admin does not bypass without an explicit legal_hold flag (Phase 2). Cross-campus by design.'
       ),
       is_system_role = true,
       updated_at     = NOW()
 WHERE role_key = 'health_counselor'
   AND (description IS NULL OR is_system_role = false);

-- ---------------------------------------------------------------------
-- Done. Verify with:
--   SELECT role_key, role_name, is_system_role, institution_scope,
--          jsonb_object_keys(permissions) AS perm
--     FROM custom_roles
--    WHERE role_key IN ('learner_counselor','staff_counselor','health_counselor')
--    ORDER BY role_key, perm;
-- ---------------------------------------------------------------------

COMMIT;
