-- ============================================================================
-- Salary register: gate liveness on superseded_at, not superseded_by
-- 2026-08-30 — corrects 20260830150000_hr_salary_register.sql
--
-- THE PROBLEM WITH THE ORIGINAL INDEX
--   `UNIQUE (hr_organization_id, period_year, period_month) WHERE superseded_by
--   IS NULL` makes regeneration impossible to order:
--     - the new run cannot be INSERTed while the old one is still live, because
--       the old one occupies the unique slot; but
--     - the old one cannot be marked superseded first, because superseded_by is
--       an FK to the successor, which does not exist yet.
--   Every self-referencing supersession column has this shape.
--
-- THE FIX
--   Separate "is this run still the live one" from "which run replaced it".
--   superseded_at needs no FK, so it can be set BEFORE the successor exists:
--     1. UPDATE old SET superseded_at = now()   -- frees the unique slot
--     2. INSERT new                              -- becomes the live run
--     3. UPDATE old SET superseded_by = new.id   -- provenance, best-effort
--   If step 3 fails the old run is superseded without a forward pointer —
--   degraded provenance, but the live run is correct and there is no duplicate.
--   The reverse ordering would leave two live runs, which is not recoverable by
--   inspection.
-- ============================================================================

ALTER TABLE public.hr_salary_register_runs
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- Backfill for consistency. No rows exist yet (the table was created minutes
-- ago), but a superseded row must never have a NULL superseded_at or it would
-- silently reclaim the live slot.
UPDATE public.hr_salary_register_runs
   SET superseded_at = COALESCE(superseded_at, updated_at)
 WHERE superseded_by IS NOT NULL
   AND superseded_at IS NULL;

DROP INDEX IF EXISTS public.uq_hr_salary_register_runs_live;
CREATE UNIQUE INDEX uq_hr_salary_register_runs_live
  ON public.hr_salary_register_runs (hr_organization_id, period_year, period_month)
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN public.hr_salary_register_runs.superseded_at IS
  'When this run stopped being the live one. Gates the partial unique index — set BEFORE the replacement is inserted, because superseded_by cannot be (it is an FK to a row that does not exist yet).';
COMMENT ON COLUMN public.hr_salary_register_runs.superseded_by IS
  'The run that replaced this one. Provenance only, written after the successor exists; liveness is decided by superseded_at.';
