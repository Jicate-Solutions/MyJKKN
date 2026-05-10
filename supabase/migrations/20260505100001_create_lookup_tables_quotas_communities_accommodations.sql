-- ============================================================================
-- 20260505100001 — Create lookup tables (quotas, community_categories,
-- accommodation_types) for the admission fee structure module
-- ============================================================================
-- See: docs/superpowers/specs/2026-05-05-admission-fee-structure-automation-design.md §6.1
-- See: docs/superpowers/plans/2026-05-05-admission-fees-plan-01-foundation.md Task 1
--
-- Two are global (quotas, community_categories), one is institution-scoped
-- (accommodation_types).
-- ============================================================================

-- Global lookup: quotas
CREATE TABLE IF NOT EXISTS public.quotas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    name          text NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_quotas_active_sort
    ON public.quotas (is_active, sort_order);

-- Global lookup: community_categories
CREATE TABLE IF NOT EXISTS public.community_categories (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code          text NOT NULL UNIQUE,
    name          text NOT NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_community_categories_active_sort
    ON public.community_categories (is_active, sort_order);

-- Institution-scoped lookup: accommodation_types
CREATE TABLE IF NOT EXISTS public.accommodation_types (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code            text NOT NULL,
    name            text NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, code)
);

CREATE INDEX IF NOT EXISTS ix_accommodation_types_institution_active
    ON public.accommodation_types (institution_id, is_active, sort_order);

-- updated_at maintenance triggers
CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotas_touch ON public.quotas;
CREATE TRIGGER trg_quotas_touch
    BEFORE UPDATE ON public.quotas
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_community_categories_touch ON public.community_categories;
CREATE TRIGGER trg_community_categories_touch
    BEFORE UPDATE ON public.community_categories
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_accommodation_types_touch ON public.accommodation_types;
CREATE TRIGGER trg_accommodation_types_touch
    BEFORE UPDATE ON public.accommodation_types
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
