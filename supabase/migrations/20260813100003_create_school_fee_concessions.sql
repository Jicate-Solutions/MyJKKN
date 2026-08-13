-- ============================================================================
-- 20260813100003 — Create school fee concession schemes + assignments
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.4
--
-- Named, reusable schemes (Staff Ward -50% tuition, Sibling -10%, RTE -100%,
-- Merit -Rs.5000) assigned to learners PER ACADEMIC YEAR, so a concession never
-- silently rolls forward into next year.
--
-- These are school-owned tables. admission_fee_adjustments (the college
-- equivalent) is NOT touched, extended or read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_fee_concession_schemes (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id       uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code                 text NOT NULL,                 -- 'STAFF_WARD'
    name                 text NOT NULL,                 -- 'Staff Ward'
    mode                 text NOT NULL CHECK (mode IN ('percent','flat')),
    -- percent → 0..100 ; flat → rupees
    value                numeric(15,2) NOT NULL CHECK (value >= 0),
    -- When true the scheme applies to every head in the plan and the
    -- scheme_heads rows are ignored.
    applies_to_all_heads boolean NOT NULL DEFAULT false,
    is_active            boolean NOT NULL DEFAULT true,
    notes                text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, code),
    CONSTRAINT school_fee_concession_percent_range
        CHECK (mode <> 'percent' OR value <= 100)
);

CREATE INDEX IF NOT EXISTS ix_school_fee_concession_schemes_institution
    ON public.school_fee_concession_schemes (institution_id, is_active);

DROP TRIGGER IF EXISTS trg_school_fee_concession_schemes_touch ON public.school_fee_concession_schemes;
CREATE TRIGGER trg_school_fee_concession_schemes_touch
    BEFORE UPDATE ON public.school_fee_concession_schemes
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();


-- Which fee heads a scheme touches. Ignored when applies_to_all_heads = true.
CREATE TABLE IF NOT EXISTS public.school_fee_concession_scheme_heads (
    scheme_id           uuid NOT NULL REFERENCES public.school_fee_concession_schemes(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    PRIMARY KEY (scheme_id, billing_category_id)
);


-- Per-learner, per-year assignment.
CREATE TABLE IF NOT EXISTS public.school_fee_concession_assignments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    scheme_id           uuid NOT NULL REFERENCES public.school_fee_concession_schemes(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (learner_id, scheme_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS ix_school_fee_concession_assignments_learner_year
    ON public.school_fee_concession_assignments (learner_id, academic_year_id);

CREATE INDEX IF NOT EXISTS ix_school_fee_concession_assignments_scheme
    ON public.school_fee_concession_assignments (scheme_id, academic_year_id);

COMMENT ON TABLE public.school_fee_concession_schemes IS
  'Reusable named concessions for school fee plans. Application order (Phase 5 resolver): sum percent schemes per head capped at 100%, apply, then subtract flat schemes spread proportionally across that head''s terms, then clamp at 0.';
COMMENT ON TABLE public.school_fee_concession_assignments IS
  'Learner-to-scheme assignment, scoped to one academic year so concessions never roll forward silently. A late-admission waiver is just a flat scheme (mid-year joiners are billed the full year by design).';
