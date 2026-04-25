-- =====================================================================
-- Persona Design PR-2 of 4: ten new roles for Campus Living + external actors
-- Spec: ~/.claude/skills/persona-design/reference/myjkkn-campus-living.md
-- Date: 2026-04-21
-- Depends on: PR-1 (scope-extension helpers — merged 2026-04-21 via #275)
--
-- What this migration does:
--   Seeds 10 NEW rows into custom_roles. Each role has:
--     - role_key, role_name, description (from persona matrix)
--     - institution_scope — 'own' for all internal + external actors, 'all' only
--       for accreditation_officer (needs cross-institution evidence view)
--     - is_system_role = true (protected from casual deletion in Role Mgmt UI)
--     - is_active = true (immediately available for assignment)
--     - permissions = '{}' empty jsonb — PR-3 adds the permission catalog,
--       PR-4 retrofits RLS + wires each role to its permission keys
--     - module_scopes = '{}' — no module-specific scope overrides yet
--
-- Why permissions are empty in PR-2:
--   Keeps this PR purely structural. A role with zero permissions is inert:
--     user_has_permission() returns false for every key → no side effects.
--   PR-3 populates PERMISSION_CATEGORIES catalog with ~120 campus_living.*
--   keys. PR-4 retrofits RLS on 48 hostel_*/mess_* tables AND bulk-UPDATE-s
--   each role's permissions jsonb to grant its specific scaffolding.
--
-- Scope-extension hookup:
--   These roles reference user_block_access / user_learner_relationship /
--   user_contract_access (PR-1 tables) via RLS in PR-4. The junction tables
--   must exist before roles that need them — that's why PR-1 lands first.
--
-- Idempotent via ON CONFLICT (role_key) DO NOTHING — safe to re-run.
-- =====================================================================

BEGIN;

INSERT INTO public.custom_roles (
  role_key, role_name, description,
  is_system_role, institution_scope, is_active,
  permissions, module_scopes
) VALUES
  (
    'warden',
    'Warden',
    'Block-level hostel supervisor. Sees only assigned blocks via user_block_access (PR-1). Manages attendance, gate passes, leave requests, maintenance tickets, and parent communication for their blocks. Reports to chief_warden.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'chief_warden',
    'Chief Warden',
    'College-wide hostel head. Coordinates all wardens within own institution. Handles escalations, fee-default reports, vendor contract oversight, and board-ready summaries. Above warden, below principal.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'gate_security',
    'Security / Gate Guard',
    'Hostel gate controller (3 shifts, 24/7). Sees only assigned blocks via user_block_access (PR-1). Verifies hosteler gate passes, logs visitors, records late entries, triggers emergency alerts. Narrow permissions — no PII beyond what gate flow requires.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'housekeeping_staff',
    'Housekeeping Staff',
    'Hostel cleaning crew. Sees only assigned blocks via user_block_access (PR-1). Marks daily tasks complete with photo proof. No PII access — only task list + completion markers.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'parent',
    'Parent / Guardian',
    'External read-only role. Sees only the learner(s) they are linked to via user_learner_relationship (PR-1), and only after the relationship is verified. Views attendance, leave status, mess attendance, late-entry alerts, fee dues. Can provide parent-consent for leave requests.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'mess_caterer',
    'Mess Caterer',
    'External food vendor. Sees only own contract via user_contract_access (PR-1, contract_type=caterer). Publishes menus, views real-time meal-booking counts for billing (BDMR model), responds to mess feedback, manages billing reconciliation.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'maintenance_vendor',
    'Maintenance Vendor',
    'External repair vendor. Sees only own contract via user_contract_access (PR-1, contract_type=maintenance_vendor). Queue of assigned tickets, SLA timers, photo proof before/after, parts-request workflow, performance score visibility.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'hostel_office',
    'Hostel Office Admin',
    'Internal clerical hostel administrator. Handles new admissions, allocations, fee receipts, vacate workflow, refunds, ID card issuance. Institution-scoped (own college). Replaces generic office_assistant for hostel operations.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'anti_ragging_member',
    'Anti-Ragging Committee Member',
    'Per-college anti-ragging committee (3-5 members each). Reviews incidents, reads anonymous complaints, logs interviews. Provides AICTE quarterly compliance evidence. Confidentiality enforced — victim identity protected from general staff.',
    true, 'own', true,
    '{}'::jsonb, '{}'::jsonb
  ),
  (
    'accreditation_officer',
    'Accreditation Officer',
    'Cross-institution accreditation lead (JKKN-wide, scope=all). Gathers evidence for NAAC / NIRF / NBA / QS / DCI / PCI / INC / NCTE / AICTE / UGC reports. Pulls hostel infrastructure, safety, mess hygiene, anti-ragging records for Criterion 4 submissions. Read-biased role.',
    true, 'all', true,
    '{}'::jsonb, '{}'::jsonb
  )
ON CONFLICT (role_key) DO NOTHING;

-- Sanity: confirm 10 rows inserted on first run (0 on re-run = idempotency proven)
-- Run: SELECT role_key, role_name, institution_scope FROM custom_roles
--      WHERE role_key IN ('warden','chief_warden','gate_security','housekeeping_staff',
--                         'parent','mess_caterer','maintenance_vendor','hostel_office',
--                         'anti_ragging_member','accreditation_officer')
--      ORDER BY role_key;

COMMIT;
