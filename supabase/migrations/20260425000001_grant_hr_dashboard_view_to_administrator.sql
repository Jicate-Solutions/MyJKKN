-- 2026-04-25: Grant hr.dashboard.view permission to the administrator role.
--
-- Context: /api/hr/dashboard previously gated via hardcoded role-key list:
--   role === 'hr_officer' || 'hr_admin' || 'hr_manager' || 'hr_head' || 'director' || 'admin'
-- Companion PR replaces that with `user_has_permission('hr.dashboard.view')` — the
-- canonical MyJKKN pattern used across RLS policies and other module routes.
--
-- Coverage check on prod 2026-04-25:
--   * hr_admin  (1 user: coo@jkkn.ac.in)     — already has hr.dashboard.view ✓
--   * hr_head   (0 users)                     — already has hr.dashboard.view ✓
--   * hr_manager(0 users)                     — already has hr.dashboard.view ✓
--   * board     (1 user)                      — already has hr.dashboard.view ✓
--   * coo       (0 users; coo role_key ≠ coo@email) — already has hr.dashboard.view ✓
--   * administrator (4 users: deepanj, kavinkumar_d, test.admin, vg) — MISSING ← grant here
--   * director (0 users)                       — no custom_roles row; dead hardcode, no action
--   * admin (1 test user)                      — no custom_roles row; falls through to 403 (acceptable)
--
-- Idempotent: WHERE guard re-executes safely. Only updates when permission is not
-- already true.

UPDATE custom_roles
SET permissions = permissions || '{"hr.dashboard.view": true}'::jsonb,
    updated_at = now()
WHERE role_key = 'administrator'
  AND COALESCE((permissions->>'hr.dashboard.view')::boolean, false) = false;
