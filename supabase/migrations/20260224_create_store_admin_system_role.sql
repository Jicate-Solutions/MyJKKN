-- Migration: 20260224_create_store_admin_system_role
-- Purpose: Seed the Store Administrator system role for the IMS module.
-- All 14 IMS permission keys are granted. is_system_role = true prevents
-- accidental deletion through the Role Management UI.
-- Uses ON CONFLICT DO UPDATE to make this migration idempotent (safe to re-run).

INSERT INTO public.custom_roles (
  role_key,
  role_name,
  description,
  permissions,
  is_system_role,
  is_active
)
VALUES (
  'store_admin',
  'Store Administrator',
  'Full operational and administrative access to the IMS module: inventory, stock, GRN, indents, sales/POS, reports, and store settings.',
  '{
    "ims.dashboard.view":   true,
    "ims.inventory.view":   true,
    "ims.inventory.manage": true,
    "ims.stock.view":       true,
    "ims.stock.manage":     true,
    "ims.grn.view":         true,
    "ims.grn.create":       true,
    "ims.indent.view":      true,
    "ims.indent.create":    true,
    "ims.indent.approve":   true,
    "ims.sales.view":       true,
    "ims.sales.manage":     true,
    "ims.reports.view":     true,
    "ims.settings.manage":  true
  }'::jsonb,
  true,
  true
)
ON CONFLICT (role_key)
DO UPDATE SET
  role_name      = EXCLUDED.role_name,
  description    = EXCLUDED.description,
  permissions    = EXCLUDED.permissions,
  is_system_role = true,
  updated_at     = now();
