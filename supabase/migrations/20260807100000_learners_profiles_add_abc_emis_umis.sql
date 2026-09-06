-- File: supabase/migrations/20260807100000_learners_profiles_add_abc_emis_umis.sql
-- Three external learner identifiers issued by bodies outside this system:
--   abc_id : Academic Bank of Credits ID (UGC/NAD)
--   emis   : Education Management Information System number (school-side, TN)
--   umis   : University Management Information System number (TN)
-- All three are alphanumeric, e.g. ED453871909686 (letters + digits).
--
-- Nullable by design: every existing row has none, they arrive at different
-- points in a learner's life (EMIS from the feeder school, ABC ID after NAD
-- registration), and a missing identifier must never block a save.
--
-- text with NO length cap and NO format CHECK, deliberately. The issuing bodies
-- have each changed their format at least once, and each has legacy holders on
-- the old one. A CHECK here would reject a genuine identifier and make the row
-- unsaveable with no way for an operator to override; the UI normalises input
-- (upper-case, strip spaces/hyphens) so the stored shape stays consistent
-- without the database refusing real-world data.
--
-- Partial unique indexes are intentionally NOT added: duplicates across
-- learners are a data-quality problem to report on, not a write to reject —
-- and a hard constraint would block the common case of two siblings' records
-- being entered before one typo is noticed.
BEGIN;

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS abc_id text,
  ADD COLUMN IF NOT EXISTS emis   text,
  ADD COLUMN IF NOT EXISTS umis   text;

COMMENT ON COLUMN public.learners_profiles.abc_id IS
  'Academic Bank of Credits ID (alphanumeric, nullable). External identifier — not a foreign key despite the _id suffix.';
COMMENT ON COLUMN public.learners_profiles.emis IS
  'EMIS number — Education Management Information System, school-side (alphanumeric, nullable).';
COMMENT ON COLUMN public.learners_profiles.umis IS
  'UMIS number — University Management Information System (alphanumeric, nullable).';

-- Lookups by these identifiers are the point of storing them (verification
-- against a government list, de-dup sweeps). Partial so the index only carries
-- the rows that actually have a value.
CREATE INDEX IF NOT EXISTS idx_learners_profiles_abc_id
  ON public.learners_profiles(abc_id) WHERE abc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learners_profiles_emis
  ON public.learners_profiles(emis) WHERE emis IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learners_profiles_umis
  ON public.learners_profiles(umis) WHERE umis IS NOT NULL;

COMMIT;
