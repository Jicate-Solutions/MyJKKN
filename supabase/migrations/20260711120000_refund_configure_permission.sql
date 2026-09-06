-- 20260711120000_refund_configure_permission.sql
-- Grant billing.refunds.configure to Super Administrator + billing admin roles.
-- A declared key does nothing until present in custom_roles.permissions JSONB.
UPDATE custom_roles
SET permissions = permissions || jsonb_build_object('billing.refunds.configure', true)
WHERE role_name IN ('Super Administrator', 'Administrator', 'Chief Accountant')
  AND is_active;
