-- ============================================================================
-- 20260507100016 — Grant admission_fees read+manage to Admission Officer
-- and Admission Staff roles
-- ============================================================================
-- The fee-structure module shipped with `admission_fees.*` permission keys
-- but only super_admin held them. Admission Officer (role_key='admission')
-- and Admission Staff (role_key='admission_staff') need to view AND
-- create/edit fee structures.
--
-- delete / override / approve_change_event remain super_admin-only —
-- those are higher-stakes actions (deleting a structure invalidates any
-- learner already matched to it; override bypasses the resolution engine).
--
-- Companion code change: lib/constants/permissions.ts now registers a
-- top-level "Admission Fees" module so these 6 keys appear in the
-- Role Management UI's permission groups picker.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions
                   || '{"admission_fees.read": true}'::jsonb
                   || '{"admission_fees.manage": true}'::jsonb
                   || '{"admission_fees.manage_adjustments": true}'::jsonb,
       updated_at = now()
 WHERE role_key IN ('admission', 'admission_staff');
