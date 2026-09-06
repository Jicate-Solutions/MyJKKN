-- Migration: 2026-06-09 — Phase 1 gating-audit role grants
-- Status: APPLIED-LIVE 2026-06-09 via Management API (documents prod role-grant
--         state so a fresh/rebuilt environment reproduces it).
--
-- Context:
--   The Phase-1 admin gating-correctness audit (Director interview 2026-06-09)
--   produced two role-grant decisions that accompany the guard-fix PRs:
--
--   1. hr_manager — VIEW-only access to the 36 HR policy pages (PR #1258 moved
--      those from the phantom `users.manage` guard to `hr.policies.view`).
--      Director chose "grant view only" (NOT edit) for hr_manager. hr_admin /
--      hr_head / ceo / coo already hold hr.policies.view/edit/create.
--
--   2. principal + hod — VIEW-only access to the counselor-team section
--      (/admission/counselors/team/*). The team layout guard was tightened from
--      the broad `admission.view` to `admission.counselors.team.view`, which —
--      because `admission.counselors` is in COUNSELOR_RESTRICTED_PREFIXES
--      (permission-guard.tsx) — excludes the counselor/admission-global bypass.
--      Director chose "tighten to leaders": Admission Manager / Principal / HOD,
--      counselors lose access. Managers (admission/coo/executive_admin_officer)
--      retain `admission.counselors.team.manage`; principal/hod get VIEW only
--      (management pages — rules, allocation — are gated on .manage via nested
--      layouts), per Spec #537.
--
-- Idempotent: `||` jsonb-merge is safe to re-run.

-- 1. hr_manager → hr.policies.view (view-only)
UPDATE custom_roles
SET permissions = permissions || '{"hr.policies.view": true}'::jsonb
WHERE role_key = 'hr_manager' AND is_active;

-- 2. principal + hod → admission.counselors.team.view (view-only)
UPDATE custom_roles
SET permissions = permissions || '{"admission.counselors.team.view": true}'::jsonb
WHERE role_key IN ('principal','hod') AND is_active;
