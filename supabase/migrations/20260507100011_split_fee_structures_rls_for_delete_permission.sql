-- ============================================================================
-- 20260507100011 — Register admission_fees.delete + split fee_structures RLS
-- ============================================================================
-- User wants Delete to be permission-gated separately from edit/manage.
-- Hard delete is destructive (cascades to admission_fee_structure_items)
-- so default-granting only super_admin matches the project's stricter
-- gating for irreversible operations.
--
-- The existing FOR ALL fee_structures_write policy granted INSERT/UPDATE/
-- DELETE all under 'admission_fees.manage'. Splitting it into separate
-- INSERT/UPDATE/DELETE policies lets us require 'admission_fees.delete'
-- only for DELETE while keeping the broader 'manage' gate for create/edit.
-- ============================================================================

UPDATE public.custom_roles
   SET permissions = permissions || '{"admission_fees.delete": true}'::jsonb,
       updated_at  = now()
 WHERE role_key = 'super_admin'
   AND COALESCE(permissions->>'admission_fees.delete', 'false') <> 'true';

DROP POLICY IF EXISTS fee_structures_write ON public.admission_fee_structures;

CREATE POLICY fee_structures_insert
    ON public.admission_fee_structures FOR INSERT
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    );

CREATE POLICY fee_structures_update
    ON public.admission_fee_structures FOR UPDATE
    USING (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    );

CREATE POLICY fee_structures_delete
    ON public.admission_fee_structures FOR DELETE
    USING (
      public.user_has_permission('admission_fees.delete')
      AND public.role_has_institution_access(institution_id)
    );
