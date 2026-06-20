-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-06-20 — CDC Clubs: 3-state lifecycle status (BUG-004071, BUG-004072)
-- Adds a `status` column to cdc_clubs supporting Active / Inactive / Upcoming.
--   • Active   — running club, visible to students
--   • Inactive — wound-down / paused club, hidden from students
--   • Upcoming — planned but not yet started
--
-- Non-breaking: the legacy `is_active` boolean is retained. The application keeps
-- it in sync on create/update (status='active' ⇒ is_active=true, else false) so
-- the existing "Active only" list toggle and "Inactive" badge keep working with
-- zero code changes to their existing paths. The new status filter reads `status`
-- directly for the full 3-state view.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK constraint.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the status column (defaults to 'active' so all existing rows stay visible).
ALTER TABLE public.cdc_clubs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 2. Constrain status to the three known lifecycle states.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_cdc_clubs_status'
      AND conrelid = 'public.cdc_clubs'::regclass
  ) THEN
    ALTER TABLE public.cdc_clubs
      ADD CONSTRAINT chk_cdc_clubs_status
      CHECK (status IN ('active', 'inactive', 'upcoming'));
  END IF;
END;
$$;

-- 3. Backfill status from the legacy is_active flag for any pre-existing rows
--    (active rows stay 'active' from the DEFAULT; inactive rows become 'inactive').
UPDATE public.cdc_clubs
SET status = 'inactive'
WHERE is_active = false AND status = 'active';

-- 4. Index for the new list filter.
CREATE INDEX IF NOT EXISTS idx_cdc_clubs_status ON public.cdc_clubs (status);

-- 5. Verification probe (SELECT-only, safe in prod).
DO $$
DECLARE
  v_col int;
  v_con int;
BEGIN
  SELECT count(*) INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'cdc_clubs'
    AND column_name = 'status';

  IF v_col = 0 THEN
    RAISE EXCEPTION 'cdc_clubs.status column not created';
  END IF;

  SELECT count(*) INTO v_con
  FROM pg_constraint
  WHERE conname = 'chk_cdc_clubs_status';

  IF v_con = 0 THEN
    RAISE EXCEPTION 'chk_cdc_clubs_status constraint not created';
  END IF;

  RAISE NOTICE 'cdc_clubs status migration: ALL OK (column + check constraint verified)';
END;
$$;
