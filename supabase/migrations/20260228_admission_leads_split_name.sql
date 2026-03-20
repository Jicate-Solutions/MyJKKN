-- supabase/migrations/20260228_admission_leads_split_name.sql
-- Split admission_leads.full_name into first_name + last_name.
-- full_name becomes a GENERATED ALWAYS AS STORED column so all existing
-- SELECT queries and ilike searches continue to work without any changes.

-- 1. Add new columns (nullable so existing rows don't fail)
ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- 2. Backfill from existing full_name
--    Fix: POSITION > 0 guard prevents single-word names from duplicating into last_name.
UPDATE public.admission_leads
SET
  first_name = TRIM(SPLIT_PART(COALESCE(full_name, ''), ' ', 1)),
  last_name  = CASE
    WHEN POSITION(' ' IN COALESCE(full_name, '')) > 0
    THEN NULLIF(
           TRIM(SUBSTRING(COALESCE(full_name, '')
                FROM POSITION(' ' IN COALESCE(full_name, '')) + 1)),
           '')
    ELSE NULL
  END;

-- 3. Set NOT NULL after backfill (first_name is required)
ALTER TABLE public.admission_leads
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN first_name SET DEFAULT '';

-- 4. Drop old full_name column
ALTER TABLE public.admission_leads
  DROP COLUMN IF EXISTS full_name;

-- 5. Re-add full_name as a generated column (backward compat for all SELECT/search)
ALTER TABLE public.admission_leads
  ADD COLUMN full_name TEXT GENERATED ALWAYS AS (
    first_name || COALESCE(' ' || NULLIF(TRIM(COALESCE(last_name, '')), ''), '')
  ) STORED;

-- 6. Indexes: keep search fast
CREATE INDEX IF NOT EXISTS idx_admission_leads_first_name
  ON public.admission_leads (institution_id, first_name);
CREATE INDEX IF NOT EXISTS idx_admission_leads_full_name
  ON public.admission_leads (institution_id, full_name);
