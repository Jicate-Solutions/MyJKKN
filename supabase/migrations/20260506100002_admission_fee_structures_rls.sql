-- ============================================================================
-- 20260506100002 — RLS policies for admission_fee_structures + items
-- ============================================================================
ALTER TABLE public.admission_fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_fee_structure_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_structures_read ON public.admission_fee_structures;
CREATE POLICY fee_structures_read
    ON public.admission_fee_structures FOR SELECT
    USING (
      public.user_has_permission('admission_fees.read')
      AND public.role_has_institution_access(institution_id)
    );

DROP POLICY IF EXISTS fee_structures_write ON public.admission_fee_structures;
CREATE POLICY fee_structures_write
    ON public.admission_fee_structures FOR ALL
    USING (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
      public.user_has_permission('admission_fees.manage')
      AND public.role_has_institution_access(institution_id)
    );

-- Items inherit via the parent's institution_id
DROP POLICY IF EXISTS fee_structure_items_read ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_read
    ON public.admission_fee_structure_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.read')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );

DROP POLICY IF EXISTS fee_structure_items_write ON public.admission_fee_structure_items;
CREATE POLICY fee_structure_items_write
    ON public.admission_fee_structure_items FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.admission_fee_structures fs
         WHERE fs.id = admission_fee_structure_items.fee_structure_id
           AND public.user_has_permission('admission_fees.manage')
           AND public.role_has_institution_access(fs.institution_id)
      )
    );
