-- ============================================================================
-- 20260813100004 — Create school_fee_generation_runs
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §4.5
--
-- Audit row for every "Generate Year Fee" invocation. Both the dry run and the
-- subsequent commit are recorded, so "who generated 2026-27, when, and what did
-- the preview say" is answerable after the fact.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.school_fee_generation_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    academic_year_id    uuid NOT NULL REFERENCES public.academic_years(id),
    is_dry_run          boolean NOT NULL,
    learners_matched    integer NOT NULL DEFAULT 0 CHECK (learners_matched >= 0),
    bills_created       integer NOT NULL DEFAULT 0 CHECK (bills_created >= 0),
    skipped_no_plan     integer NOT NULL DEFAULT 0 CHECK (skipped_no_plan >= 0),
    skipped_existing    integer NOT NULL DEFAULT 0 CHECK (skipped_existing >= 0),
    -- Per-class breakdown as shown on the preview screen:
    --   [{ "program_id": "...", "class": "I STD", "learners": 62,
    --      "plan_id": "...", "version": 1, "status": "ready" }, ...]
    result              jsonb,
    run_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    run_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_school_fee_generation_runs_institution_year
    ON public.school_fee_generation_runs (institution_id, academic_year_id, run_at DESC);

COMMENT ON TABLE public.school_fee_generation_runs IS
  'Audit of school_fee_generate() invocations. is_dry_run=true rows write no bills; the matching commit row follows.';
