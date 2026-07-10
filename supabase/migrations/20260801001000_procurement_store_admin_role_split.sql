-- Migration: 20260801001000_procurement_store_admin_role_split
-- Purpose:  Apply the Procurement segregation-of-duties (SoD) split between the
--           `store_admin` and `super_admin` roles (matches the change applied live to
--           production on 2026-07-10).
--
--           Store Admin EXECUTES the pipeline but cannot approve its own spend or post
--           stock: it receives the 6 execution keys and the 4 approval/governance keys
--           are pinned FALSE. Super Admin needs nothing here — it has every permission
--           via the `isSuperAdmin` bypass (every guard is `isSuperAdmin || canAccess`),
--           independent of this JSONB.
--
--           `permissions || jsonb_build_object(...)` MERGES — it only touches the 10
--           procurement keys and preserves every other module store_admin already grants.
--           Idempotent (re-running yields the same state) and reversible (flip the values).

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
        -- Store Admin EXECUTES the pipeline
        'procurement.view',             true,
        'procurement.request_create',   true,
        'procurement.rfq_manage',       true,
        'procurement.quotation_manage', true,
        'procurement.po_create',        true,
        'procurement.grn_create',       true,
        -- Approvals + inventory posting + vendor master stay with Super Admin
        'procurement.request_approve',  false,
        'procurement.po_approve',       false,
        'procurement.grn_verify',       false,
        'procurement.vendor_manage',    false
    ),
    updated_at = now()
WHERE role_key = 'store_admin';
