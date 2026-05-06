-- ============================================================================
-- 20260508100002 — RLS policies for learner_admission_documents
-- ============================================================================
-- Read: anyone with admission_fees.read or admission_documents.manage who
--       has institution access to the parent learner.
-- Write: admission_documents.manage + same institution access.
-- ============================================================================

ALTER TABLE public.learner_admission_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_admission_documents_read
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_read
    ON public.learner_admission_documents FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND (
             public.user_has_permission('admission_fees.read')
             OR public.user_has_permission('admission_documents.manage')
           )
           AND public.role_has_institution_access(lp.institution_id)
      )
    );

DROP POLICY IF EXISTS learner_admission_documents_write
    ON public.learner_admission_documents;
CREATE POLICY learner_admission_documents_write
    ON public.learner_admission_documents FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.learners_profiles lp
         WHERE lp.id = learner_admission_documents.learner_id
           AND public.user_has_permission('admission_documents.manage')
           AND public.role_has_institution_access(lp.institution_id)
      )
    );
