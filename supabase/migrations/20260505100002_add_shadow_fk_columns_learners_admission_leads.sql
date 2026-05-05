-- ============================================================================
-- 20260505100002 — Add shadow-FK columns to learners_profiles and admission_leads
-- ============================================================================
-- Adds quota_id, community_category_id, accommodation_type_id alongside the
-- existing TEXT columns (gradual cutover per the admission_year_id precedent).
-- Also adds legacy_fee_mode flag — defaults to true so all existing rows are
-- treated as legacy until the per-institution feature flag flips ON.
-- ============================================================================

ALTER TABLE public.learners_profiles
    ADD COLUMN IF NOT EXISTS quota_id              uuid REFERENCES public.quotas(id),
    ADD COLUMN IF NOT EXISTS community_category_id uuid REFERENCES public.community_categories(id),
    ADD COLUMN IF NOT EXISTS accommodation_type_id uuid REFERENCES public.accommodation_types(id),
    ADD COLUMN IF NOT EXISTS legacy_fee_mode       boolean NOT NULL DEFAULT true;

ALTER TABLE public.admission_leads
    ADD COLUMN IF NOT EXISTS quota_id              uuid REFERENCES public.quotas(id),
    ADD COLUMN IF NOT EXISTS community_category_id uuid REFERENCES public.community_categories(id),
    ADD COLUMN IF NOT EXISTS accommodation_type_id uuid REFERENCES public.accommodation_types(id);

-- Indexes to support matrix lookup
CREATE INDEX IF NOT EXISTS ix_learners_profiles_matrix_full
    ON public.learners_profiles
       (institution_id, degree_id, department_id, program_id,
        quota_id, community_category_id, accommodation_type_id, admission_year_id)
    WHERE legacy_fee_mode = false;

CREATE INDEX IF NOT EXISTS ix_admission_leads_shadow_fks
    ON public.admission_leads
       (quota_id, community_category_id, accommodation_type_id);
