-- Migration: 20260816000000_procurement_roles_two_level
-- Purpose:  Give Procurement a two-level role structure.
--
--           Until now exactly ONE role held any procurement key: `store_admin`,
--           with the 6 execution keys and the approval keys pinned false
--           (20260801001000_procurement_store_admin_role_split.sql). Nobody held
--           the approval keys at all, so every PR/RFQ/PO/GRN sign-off fell to
--           super admins via the `is_super_admin` bypass.
--
--           Procurement Manager  — all 11 keys. Runs and signs off the pipeline.
--           Procurement Officer  — the 6 execution keys only. Runs the pipeline,
--                                  signs off nothing. Mirrors the store_admin
--                                  split exactly, plus rfq_approve (added later
--                                  by 20260801001200_procurement_rfq_review.sql).
--
--           SoD note: Procurement Manager deliberately holds BOTH po_create and
--           po_approve, so that person can approve their own purchase orders.
--           lib/constants/permissions.ts:2569 says the keys were split precisely
--           to prevent that. Accepted by the requester: the role is for senior
--           staff only, and every approval records approved_by. The Officer role
--           is the one that carries the segregation.
--
--           institution_scope = 'all' — a central procurement team buying for
--           every college, matching the centralized-procurement design.
--
--           Permissions JSONB carries ONLY the procurement keys. That is correct,
--           not an omission: user_has_permission() tests
--           `(cr.permissions->>key)::boolean = true`, so an absent key is NULL and
--           therefore denied. Roles in this system carry wildly different key sets
--           (super_admin has 173; the union across all roles is 1905).
--
--           The denied keys are written as explicit `false` rather than omitted so
--           the split is self-documenting in the roles UI and in psql.
--
--           Idempotent: guarded on role_key, so re-running is a no-op and will not
--           overwrite permissions an admin has since edited in the UI.

-- ---------------------------------------------------------------------------
-- 1. Procurement Manager — full rights
-- ---------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_active, is_system_role)
SELECT
  'procurement_manager',
  'Procurement Manager',
  'Full procurement rights across all institutions: raises and approves purchase '
  || 'requisitions, RFQs and purchase orders, verifies GRNs into inventory, and '
  || 'manages the vendor master.',
  jsonb_build_object(
    'procurement.view',             true,
    'procurement.request_create',   true,
    'procurement.request_approve',  true,
    'procurement.rfq_manage',       true,
    'procurement.rfq_approve',      true,
    'procurement.quotation_manage', true,
    'procurement.po_create',        true,
    'procurement.po_approve',       true,
    'procurement.grn_create',       true,
    'procurement.grn_verify',       true,
    'procurement.vendor_manage',    true
  ),
  'all',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.custom_roles WHERE role_key = 'procurement_manager'
);

-- ---------------------------------------------------------------------------
-- 2. Procurement Officer — executes the pipeline, approves nothing
-- ---------------------------------------------------------------------------
INSERT INTO public.custom_roles
  (role_key, role_name, description, permissions, institution_scope, is_active, is_system_role)
SELECT
  'procurement_officer',
  'Procurement Officer',
  'Runs the procurement pipeline across all institutions — raises requisitions, '
  || 'manages RFQs and vendor quotations, drafts purchase orders and records goods '
  || 'receipts — but cannot approve requisitions, RFQs or POs, cannot verify a GRN '
  || 'into inventory, and cannot edit the vendor master.',
  jsonb_build_object(
    -- executes
    'procurement.view',             true,
    'procurement.request_create',   true,
    'procurement.rfq_manage',       true,
    'procurement.quotation_manage', true,
    'procurement.po_create',        true,
    'procurement.grn_create',       true,
    -- approves nothing
    'procurement.request_approve',  false,
    'procurement.rfq_approve',      false,
    'procurement.po_approve',       false,
    'procurement.grn_verify',       false,
    'procurement.vendor_manage',    false
  ),
  'all',
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.custom_roles WHERE role_key = 'procurement_officer'
);
