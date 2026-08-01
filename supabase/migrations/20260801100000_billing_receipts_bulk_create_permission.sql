-- 20260801100000_billing_receipts_bulk_create_permission.sql
--
-- Introduces `billing.receipts.bulk_create` — the permission behind the
-- "Bulk Generate Receipts" button on /billing/schedule.
--
-- BACKGROUND
-- Bulk receipt generation was hardcoded to super admins at five places: the
-- button, the dialog mount, and three API routes (bulk-template,
-- bulk-template/count, bulk-import). Those routes run on the service-role
-- client, so RLS is not in their path and the super-admin test WAS the tenant
-- boundary. This migration makes the gate delegable through Role Management;
-- the matching code change (lib/auth/bulk-receipt-access.ts) replaces the
-- super-admin test with this key AND bounds each request to the caller's
-- accessible institutions, which is what keeps the boundary intact.
--
-- WHY A SEPARATE KEY FROM billing.receipts.create
-- `billing.receipts.create` is held by 7 roles and covers writing ONE receipt.
-- This flow writes up to 5000 bills' worth of payment rows from a single
-- uploaded sheet. Inheriting the bulk path from the single-receipt key would
-- silently hand that to every one of those roles, including Admission Officer
-- and Payment Audit Admin (Test Institution). A distinct key makes each grant
-- a deliberate toggle.
--
-- INITIAL GRANTS
-- The five institution_scope='all' finance/administration roles that already
-- hold billing.receipts.create. Deliberately NOT granted to:
--   - admission (Admission Officer) — holds receipts.create but is not a
--     bulk-collections owner.
--   - payment_audit_admin (Test Institution) — scope='own'; grant it only when
--     someone wants to exercise the institution-scoped path.
-- Both can be switched on in Role Management without a code change.
--
-- Idempotent: `permissions || jsonb_build_object(...)` overwrites the key if
-- present and adds it otherwise, so re-running is safe.

UPDATE custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb)
                || jsonb_build_object('billing.receipts.bulk_create', true),
  updated_at = now()
WHERE role_key IN (
  'accounts',                  -- Chief Accountant
  'accountant_assistant',      -- Accountant Assistant
  'administrator',             -- Administrator
  'cao',                       -- Chief Administrative Officer
  'executive_admin_officer'    -- Executive Administrative Officer
);

-- Verification (expect 5 rows, all true):
--   SELECT role_key, permissions -> 'billing.receipts.bulk_create'
--   FROM custom_roles
--   WHERE permissions ? 'billing.receipts.bulk_create'
--   ORDER BY role_key;
