-- 2026-04-17: Fix consultant_* DELETE policies so admission_staff (and any role
-- with admission.leads.delete) can permanently delete leads.
--
-- Problem: permanentDeleteLead() in lib/services/admission/lead-service.ts
-- deletes consultant_* child records before deleting the admission_leads row.
-- These tables' DELETE policies hardcoded `cr.role_key = 'admission'`, which
-- excluded the `admission_staff` role. Failed child deletes leave NO ACTION FKs
-- intact and block the final lead DELETE.
--
-- Fix: Replace hardcoded role check with dynamic user_has_permission() pattern,
-- matching the pattern already used by admission_call_logs. This follows the
-- CLAUDE.md rule: "Never hardcode role names in RLS policies".

DROP POLICY IF EXISTS "lead_attributions_delete" ON consultant_lead_attributions;
CREATE POLICY "lead_attributions_delete" ON consultant_lead_attributions FOR DELETE USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.delete')
    AND role_has_institution_access(institution_id)
  )
);

DROP POLICY IF EXISTS "commission_transactions_delete" ON consultant_commission_transactions;
CREATE POLICY "commission_transactions_delete" ON consultant_commission_transactions FOR DELETE USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.delete')
    AND role_has_institution_access(institution_id)
  )
);

DROP POLICY IF EXISTS "consultant_comms_delete" ON consultant_communications;
CREATE POLICY "consultant_comms_delete" ON consultant_communications FOR DELETE USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.delete')
    AND role_has_institution_access(institution_id)
  )
);
