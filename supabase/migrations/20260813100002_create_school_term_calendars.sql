-- ============================================================================
-- 20260813100002 — Create school_term_calendars
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.3
--
-- ONE due-date calendar per school per academic year. Every class plan in that
-- institution+year inherits it, so the office enters ~3 rows a year instead of
-- 3 rows x 12 classes.
--
--   TERM   DUE DATE     FINE FROM    FINE
--   I      2026-06-05   2026-06-16    250
--   II     2026-10-05   2026-10-16    250
--   III    2027-01-05   2027-01-16    250
--
-- NOTE ON FINES — deliberately NOT the existing engine.
-- public.fn_late_charge_accrue() (20260815010000) is a MONTHLY COMPOUNDING
-- PERCENTAGE model with grace days. A flat Rs.250 per-term fine cannot be
-- expressed as a percentage rate without faking the rate per bill amount.
-- School fines therefore get their own routine, school_fee_apply_fines()
-- (Phase 10), which inserts a single penalty billing_student_bills row per
-- overdue term bill. The college/hostel late-charge engine is NOT touched,
-- read, or altered by any of this.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_term_calendars (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    term_number         smallint NOT NULL CHECK (term_number BETWEEN 1 AND 6),
    term_name           text NOT NULL,                          -- 'Term I'
    due_date            date NOT NULL,
    -- NULL = this term carries no late fine at all.
    fine_effective_date date,
    fine_amount         numeric(15,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, academic_year_id, term_number),
    -- A fine cannot start before the amount is even due.
    CONSTRAINT school_term_calendars_fine_after_due
        CHECK (fine_effective_date IS NULL OR fine_effective_date >= due_date)
);

CREATE INDEX IF NOT EXISTS ix_school_term_calendars_institution_year
    ON public.school_term_calendars (institution_id, academic_year_id, term_number);

DROP TRIGGER IF EXISTS trg_school_term_calendars_touch ON public.school_term_calendars;
CREATE TRIGGER trg_school_term_calendars_touch
    BEFORE UPDATE ON public.school_term_calendars
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.school_term_calendars IS
  'Per-school, per-academic-year term due dates, fine-effective dates and flat fine amounts. Shared by every class fee plan in that institution+year.';
COMMENT ON COLUMN public.school_term_calendars.fine_amount IS
  'FLAT rupee fine applied once after fine_effective_date. Not a percentage — the college fn_late_charge_* engine is a different, untouched mechanism.';
