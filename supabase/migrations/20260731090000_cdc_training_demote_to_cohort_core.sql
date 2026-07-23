-- ============================================================================
-- COHORT CORE — CDC Training demote onto the cohort spine (Phase 4 · kind='cdc')
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 4)
-- Branch: feat/cohort-cdc-demote  ·  PR-STAGED (NOT applied to prod)
-- ============================================================================
-- WHAT: Register the CDC Training container (cdc_training_programmes) into the
--       canonical cohort spine as an ADDITIVE MIRROR (public.cohorts kind='cdc',
--       mapped 1:1 via cohorts.config->>'cdc_training_programme_id'), and DEMOTE
--       cdc_training_enrollments to a per-learner EXTENSION that LINKS to its
--       cohort membership through ONE nullable FK column
--       (cdc_training_enrollments.cohort_membership_id).
--
--       cdc_training_enrollments stays AUTHORITATIVE — its extension tables
--       (cdc_training_semester_schedules) and its own attendance / certificate
--       columns keep FK-ing / referencing cdc_training_programmes.id and
--       cdc_training_enrollments.id UNCHANGED. Cohort-core is reached in one hop:
--       enrollment → cohort_membership_id → membership → cohort. The cohorts
--       mirror is minted FORWARD in the service (lazy, on first enrol), NOT here.
--
-- WHY A LINK COLUMN, NOT A RE-KEY (mirrors the SF100 demote precedent,
--       supabase/migrations/20260731060000_sf100_demote_to_extension.sql):
--       cdc_training_semester_schedules already FKs cdc_training_programmes, and
--       attendance/cert live inline on the enrollment. Re-keying to
--       cohort_memberships would rewrite FKs + live joins — a large irreversible
--       blast radius. The link column adds ONE nullable column to the enrollment
--       hub; the extension is untouched, and the change is reversible by dropping
--       one column.
--
-- TIER: TIER-1 (schema, ADDITIVE, IDEMPOTENT, NON-DESTRUCTIVE). DROPS NOTHING.
--
-- GREENFIELD (verified prod 2026-07-06): cdc_training_enrollments = 0 rows,
--       cdc_training_programmes = 1 row, NEITHER carries a cohort_id/
--       cohort_membership_id column today. There is therefore NO legacy data to
--       backfill — this migration ONLY adds the link column, its FK, the reverse
--       index, and the L3 partial unique index on the spine mirror. First-enrol
--       lazy-mint (TrainingService.addEnrollment) populates the spine going
--       forward. A RAISE NOTICE records the empty state instead of a backfill.
-- ============================================================================

-- ── STEP 1: LINK COLUMN — nullable (a program with no enrol yet has no cohort) ─
-- Nullable on purpose and forever a plain link: it is populated best-effort by
-- the service twin AFTER the authoritative enrollment insert commits, and a
-- lagging / RLS-denied mirror legitimately leaves it NULL (the extension row is
-- still a real, authoritative member). No NOT NULL is ever appropriate here.
ALTER TABLE public.cdc_training_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;

-- ── STEP 2: FK — ON DELETE SET NULL (this is a LINK, not identity) ────────────
-- SET NULL (never CASCADE): deleting a cohort membership must NEVER cascade-
-- delete the live, authoritative CDC enrollment row (which owns attendance +
-- certificate + semester-schedule children). Postgres has no
-- `ADD CONSTRAINT IF NOT EXISTS`, so guard on pg_constraint for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'cdc_training_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.cdc_training_enrollments'::regclass
  ) THEN
    ALTER TABLE public.cdc_training_enrollments
      ADD CONSTRAINT cdc_training_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── STEP 3: reverse-lookup index (membership → enrollment) ────────────────────
CREATE INDEX IF NOT EXISTS idx_cdc_training_enrollments_cohort_membership
  ON public.cdc_training_enrollments (cohort_membership_id);

-- ── STEP 4: L3 partial unique index on the spine mirror ───────────────────────
-- The service lazy-mints ONE public.cohorts row per CDC programme, keyed on
-- config->>'cdc_training_programme_id'. Without this UNIQUE guard two concurrent
-- first-enrols would mint DUPLICATE mirror cohorts, and every later single-row
-- lookup would error on multiple rows and mint yet another, compounding. The
-- INDEX is the race backstop; the service mint helper re-SELECTs the winner on a
-- 23505. Partial (WHERE kind='cdc') so it never collides with the sf100 /
-- foundations / trainer mirrors that share the cohorts table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohorts_cdc_training_programme
  ON public.cohorts ((config->>'cdc_training_programme_id'))
  WHERE kind = 'cdc';

-- ── STEP 5: self-check — greenfield, so record the empty state (no backfill) ──
-- Unlike the SF100 demote (which follows a data backfill and can assert every
-- enrollment links), CDC is greenfield: 0 enrollments exist, so there is nothing
-- to populate or assert. A NOTICE documents that state rather than a spurious
-- abort.
DO $$
DECLARE v_enrollments int;
BEGIN
  SELECT COUNT(*) INTO v_enrollments FROM public.cdc_training_enrollments;
  RAISE NOTICE 'cdc training demote: link column + FK + indexes added; % existing enrollment(s) (greenfield, no backfill — spine minted forward by TrainingService.addEnrollment).', v_enrollments;
END $$;

-- Reload PostgREST schema cache so the new column/relationship is queryable.
NOTIFY pgrst, 'reload schema';
