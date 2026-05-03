-- Fix store_admin role: add missing base permissions (view_dashboard, view_profile)
-- Without these, the Dashboard and Profile sidebar items are hidden for store_admin users
-- Updated: 2026-03-02

UPDATE custom_roles
SET permissions = permissions || jsonb_build_object(
  'view_dashboard', true,
  'view_profile', true
)
WHERE role_key = 'store_admin';
