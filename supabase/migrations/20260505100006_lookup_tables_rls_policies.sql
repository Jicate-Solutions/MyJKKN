-- ============================================================================
-- 20260505100006 — RLS policies for lookup tables + admission_settings
-- ============================================================================
-- quotas, community_categories: global read for any authenticated user;
-- write only by users with admission_fees.manage permission.
-- accommodation_types: read scoped to institution (role_has_institution_access);
-- write requires admission_fees.manage AND institution access.
-- admission_settings_per_institution: read scoped to institution;
-- write requires admission.settings.manage.
-- ============================================================================

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_settings_per_institution ENABLE ROW LEVEL SECURITY;

-- quotas — global read, gated write
DROP POLICY IF EXISTS quotas_read ON public.quotas;
CREATE POLICY quotas_read
    ON public.quotas FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS quotas_write ON public.quotas;
CREATE POLICY quotas_write
    ON public.quotas FOR ALL
    USING (public.user_has_permission('admission_fees.manage'))
    WITH CHECK (public.user_has_permission('admission_fees.manage'));

-- community_categories — same pattern
DROP POLICY IF EXISTS community_categories_read ON public.community_categories;
CREATE POLICY community_categories_read
    ON public.community_categories FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS community_categories_write ON public.community_categories;
CREATE POLICY community_categories_write
    ON public.community_categories FOR ALL
    USING (public.user_has_permission('admission_fees.manage'))
    WITH CHECK (public.user_has_permission('admission_fees.manage'));

-- accommodation_types — institution-scoped
DROP POLICY IF EXISTS accommodation_types_read ON public.accommodation_types;
CREATE POLICY accommodation_types_read
    ON public.accommodation_types FOR SELECT
    USING (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS accommodation_types_write ON public.accommodation_types;
CREATE POLICY accommodation_types_write
    ON public.accommodation_types FOR ALL
    USING (
        public.user_has_permission('admission_fees.manage')
        AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
        public.user_has_permission('admission_fees.manage')
        AND public.role_has_institution_access(institution_id)
    );

-- admission_settings_per_institution — institution-scoped
DROP POLICY IF EXISTS admission_settings_read ON public.admission_settings_per_institution;
CREATE POLICY admission_settings_read
    ON public.admission_settings_per_institution FOR SELECT
    USING (public.role_has_institution_access(institution_id));

DROP POLICY IF EXISTS admission_settings_write ON public.admission_settings_per_institution;
CREATE POLICY admission_settings_write
    ON public.admission_settings_per_institution FOR ALL
    USING (
        public.user_has_permission('admission.settings.manage')
        AND public.role_has_institution_access(institution_id)
    )
    WITH CHECK (
        public.user_has_permission('admission.settings.manage')
        AND public.role_has_institution_access(institution_id)
    );
