-- ============================================================================
-- 20260506100001 — Create admission_fee_structures + admission_fee_structure_items
-- ============================================================================
-- Spec §6.2. Matrix-keyed fee templates (one per 8-dim combination per academic
-- year). Items are billing-category × amount per structure. The 'admission_year_id'
-- IS the version dimension (per Q4 Option C).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_structures (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    degree_id               uuid NOT NULL REFERENCES public.degrees(id),
    department_id           uuid NOT NULL REFERENCES public.departments(id),
    programme_id            uuid NOT NULL REFERENCES public.programs(id),
    quota_id                uuid NOT NULL REFERENCES public.quotas(id),
    community_category_id   uuid NOT NULL REFERENCES public.community_categories(id),
    accommodation_type_id   uuid NOT NULL REFERENCES public.accommodation_types(id),
    admission_year_id       uuid NOT NULL REFERENCES public.admission_years(id),
    name                    text NOT NULL,
    status                  text NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','archived')),
    notes                   text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, degree_id, department_id, programme_id,
            quota_id, community_category_id, accommodation_type_id, admission_year_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_structures_institution_year_status
    ON public.admission_fee_structures (institution_id, admission_year_id, status);

DROP TRIGGER IF EXISTS trg_admission_fee_structures_touch ON public.admission_fee_structures;
CREATE TRIGGER trg_admission_fee_structures_touch
    BEFORE UPDATE ON public.admission_fee_structures
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE IF NOT EXISTS public.admission_fee_structure_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_structure_id    uuid NOT NULL REFERENCES public.admission_fee_structures(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    amount              numeric(15,2) NOT NULL CHECK (amount >= 0),
    is_optional         boolean NOT NULL DEFAULT false,
    sort_order          integer NOT NULL DEFAULT 0,
    UNIQUE (fee_structure_id, billing_category_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_structure_items_structure
    ON public.admission_fee_structure_items (fee_structure_id, sort_order);
