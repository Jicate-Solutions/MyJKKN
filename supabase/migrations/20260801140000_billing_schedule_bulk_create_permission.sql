-- 20260801140000_billing_schedule_bulk_create_permission.sql
--
-- Introduces `billing.schedule.bulk_create` — the permission behind the
-- "Bulk Create" button on /billing/schedule, the "Bulk Create Bills (N)"
-- button on /billing/schedule/students, and the /billing/schedule/bulk-create
-- flow (including its Excel upload sub-page).
--
-- WHY
-- Bulk bill creation had no key of its own; every surface checked
-- billing.schedule.create, the same key that gates creating ONE bill. The
-- separation already existed in the code as a distinct `canBulkCreate`
-- variable (student-data-table.tsx) that just resolved to the same key. This
-- gives it a real key so the bulk path can be revoked without also removing
-- single-bill creation. Companion to billing.receipts.bulk_create
-- (migration 20260801100000).
--
-- ADDITIVE, NOT A REPLACEMENT
-- Every UI surface checks `create AND bulk_create`. The RLS INSERT policy on
-- billing_student_bills still gates on billing.schedule.create alone (and, as
-- of migration 20260801120000, role_has_institution_access). Granting
-- bulk_create WITHOUT create would render the button and then fail every
-- insert with an RLS denial — so bulk_create is only meaningful alongside
-- create, and is granted here to exactly the roles that already hold create.
--
-- NO REGRESSION BY CONSTRUCTION
-- Unlike billing.receipts.bulk_create (which expanded a super-admin-only
-- feature to a chosen subset), bulk bill creation is available TODAY to every
-- role holding billing.schedule.create. Granting the new key to a narrower set
-- would silently remove access those roles currently have. So the grant is
-- derived from the data rather than hardcoded: every role whose JSONB has
-- billing.schedule.create = true gets billing.schedule.bulk_create = true.
--
-- As measured 2026-08-01 that is 7 roles — accounts, accountant_assistant,
-- administrator, admission, cao, executive_admin_officer, payment_audit_admin
-- — but the derived form stays correct if that set has drifted by the time
-- this runs.
--
-- Idempotent: `permissions || jsonb_build_object(...)` overwrites the key if
-- present and adds it otherwise, so re-running is safe.

UPDATE custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb)
                || jsonb_build_object('billing.schedule.bulk_create', true),
  updated_at = now()
WHERE COALESCE((permissions ->> 'billing.schedule.create')::boolean, false) = true;

-- Verification — every role with create should now also have bulk_create,
-- and the mismatch count should be 0:
--   SELECT count(*) FROM custom_roles
--   WHERE COALESCE((permissions ->> 'billing.schedule.create')::boolean,false)
--     AND NOT COALESCE((permissions ->> 'billing.schedule.bulk_create')::boolean,false);
