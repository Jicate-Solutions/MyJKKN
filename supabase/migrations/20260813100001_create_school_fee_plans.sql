-- ============================================================================
-- 20260813100001 — Create school_fee_plans + school_fee_plan_items
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.1, §4.2
--
-- School fee plans are keyed on (institution, class, academic_year) — a FLAT
-- 3-dimension key, deliberately unlike the college 8-dimension matrix in
-- admission_fee_structures.
--
-- The critical difference from college:
--   college  → admission_fee_structures.admission_year_id  (COHORT-locked;
--              a 4-year learner keeps their admission-year sheet for 4 years)
--   school   → school_fee_plans.academic_year_id           (CURRENT year;
--              re-fixed every year for every learner)
--
-- learners_profiles already carries BOTH admission_year_id and academic_year_id,
-- so the two engines read different columns and never collide.
--
-- NOTHING in this migration touches admission_fee_structures,
-- admission_fee_structure_items, billing_* tables, or any existing function,
-- trigger or policy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_fee_plans (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    -- The class (I STD / Grade 5). `programs` is rendered as "Class" for
    -- entity_type='school' via lib/utils/school-label-adapter.ts.
    program_id          uuid NOT NULL REFERENCES public.programs(id),
    -- CURRENT academic year, not admission year. This is the whole point.
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    name                text NOT NULL,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','archived')),
    -- Stamped by school_fee_generate() on first commit. Once non-NULL the plan
    -- is conceptually frozen; the enforcing trigger lands in Phase 9 together
    -- with the v2/supersede flow.
    locked_at           timestamptz,
    superseded_by       uuid REFERENCES public.school_fee_plans(id) ON DELETE SET NULL,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, program_id, academic_year_id, version)
);

-- Exactly ONE active plan per class per year. Draft and archived rows are
-- unconstrained, so v2 can be authored while v1 is still live.
CREATE UNIQUE INDEX IF NOT EXISTS ux_school_fee_plans_one_active
    ON public.school_fee_plans (institution_id, program_id, academic_year_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_school_fee_plans_institution_year_status
    ON public.school_fee_plans (institution_id, academic_year_id, status);

DROP TRIGGER IF EXISTS trg_school_fee_plans_touch ON public.school_fee_plans;
CREATE TRIGGER trg_school_fee_plans_touch
    BEFORE UPDATE ON public.school_fee_plans
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.school_fee_plans IS
  'Per-class, per-academic-year fee plan for entity_type=''school'' institutions. Re-fixed every year (contrast admission_fee_structures, which is cohort-locked on admission_year_id).';
COMMENT ON COLUMN public.school_fee_plans.academic_year_id IS
  'CURRENT academic year — resolution reads learners_profiles.academic_year_id, NOT admission_year_id.';
COMMENT ON COLUMN public.school_fee_plans.locked_at IS
  'Set when bills are first generated from this plan. Non-NULL means edits require a new version (Phase 9).';


-- ============================================================================
-- school_fee_plan_items — the fee-heads x terms grid
-- ============================================================================
-- ONE ROW PER NON-BLANK CELL. A head that is not charged in a term simply has
-- no row — that is how "Books & Notebooks - with Term I fee" is represented.
--
-- Worked example (IV STD, JKKN Matriculation, 2026-27):
--   head                     T-I    T-II   T-III   total
--   Tuition Fee             7600   12780   12780   33160
--   Skill Development          -     420     420     840
--   Books & Notebooks       3405       -       -    3405   (is_one_time)
--   Uniform Kit             3995       -       -    3995   (is_one_time)
--   ECA                     1000    1000    1000    3000
--   term total             16000   14200   14200   44400
--
-- Reconciles with the printed sheet: tuition 33160 + skill 840 = 34000, plus
-- books 3405 + uniform 3995 + ECA 3000 = 44400 for the year.
--
-- Fee heads come from the GLOBAL public.billing_categories table (collapsed to
-- global in 20260428000001), so generated bills reference the same categories
-- receipts, apportionment and analytics already join to.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_fee_plan_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             uuid NOT NULL REFERENCES public.school_fee_plans(id) ON DELETE CASCADE,
    billing_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
    -- Capped at 6 rather than hard-coded to 3 so a school on 2 or 4 terms
    -- needs no migration.
    term_number         smallint NOT NULL CHECK (term_number BETWEEN 1 AND 6),
    amount              numeric(15,2) NOT NULL CHECK (amount >= 0),
    -- Books / Uniform Kit: charged once per year. For a mid-year joiner these
    -- attach to that learner's FIRST generated term instead of being skipped.
    is_one_time         boolean NOT NULL DEFAULT false,
    sort_order          integer NOT NULL DEFAULT 0,
    UNIQUE (plan_id, billing_category_id, term_number)
);

CREATE INDEX IF NOT EXISTS ix_school_fee_plan_items_plan
    ON public.school_fee_plan_items (plan_id, sort_order, term_number);

COMMENT ON TABLE public.school_fee_plan_items IS
  'Fee head x term grid. One row per non-blank cell; a missing (head, term) row means that head is not charged that term.';
COMMENT ON COLUMN public.school_fee_plan_items.is_one_time IS
  'True for Books & Notebooks, Uniform Kit etc. Charged once per year; follows a mid-year joiner to their first generated term.';
