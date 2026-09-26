-- =====================================================================
-- What's New — the strict skip-reason CHECK, and the vocabulary re-run
-- =====================================================================
-- Created: 2026-09-15.  Split out of
--   supabase/migrations/20261217120000_whats_new_skip_reason_always_and_takedowns.sql
-- on 2026-09-16 and DELIBERATELY PARKED OUTSIDE supabase/migrations/.
--
-- ---------------------------------------------------------------------
-- READ THIS BEFORE MOVING THE FILE
-- ---------------------------------------------------------------------
-- THIS FILE IS NOT A PENDING MIGRATION. It is not under supabase/migrations/
-- on purpose, for two separate reasons:
--
--   * The ship wave sweeps supabase/migrations/ and applies every version it
--     finds that is not yet in supabase_migrations.schema_migrations. If this
--     file sat there it would be applied on the next wave, before any deploy.
--   * The wave refuses any file containing DELETE FROM and FREEZES the whole
--     wave for every other pull request when it hits one. This file contains a
--     DELETE FROM. Parking it here keeps that freeze from happening to people
--     who have nothing to do with What's New.
--
-- IT MUST BE APPLIED IN THE SAME WINDOW AS THE DEPLOY that carries the output
-- gate (the cron at app/api/cron/whats-new-highlight-drafts/route.ts writing
-- skip_reason on every skipped row, and forbiddenVocabulary() refusing to
-- publish the three forbidden word families). Applying it BEFORE that deploy
-- breaks the writer, twice over:
--
--   * changelog_highlights_skipped_has_reason_check requires every skipped
--     row to carry a reason. The currently deployed cron inserts
--     status = 'skipped' with no skip_reason field at all, so that insert
--     would fail on every run — every 30 minutes — until the deploy lands.
--   * The DELETE re-qualifies those entries for selection. The currently
--     deployed writer has no vocabulary gate, so it would write them up again
--     with the same words and publish them again.
--
-- HOW TO APPLY: the same per-file Management API path the wave uses —
-- history check, BEGIN…ROLLBACK dry run, BEGIN…COMMIT, then record the
-- version in supabase_migrations.schema_migrations by hand and reload
-- PostgREST. Apply it only after the deploy is live and verified.
--
-- No BEGIN/COMMIT of its own: the operator's apply wraps it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) THE VOCABULARY OFFENDERS — re-run through the gate, not hand-edited
-- ---------------------------------------------------------------------
-- The same word-boundary test the cron's forbiddenVocabulary() applies —
-- case-insensitive, whole words only, in any of the three lines. \y is
-- Postgres's word boundary.
--
-- DELETED, not skipped: a 'skipped' row is never re-offered to the writer
-- (ruling 5 keys on the row existing), so the only way to re-run these through
-- the gate is for the row not to exist. Reports filed against them survive —
-- changelog_highlight_reports references changelog_entries, not this table.
--
-- ONLY machine-written, never-reviewed, approved rows. A person's words, and a
-- row a person has decided, are theirs (ruling 5) and are counted but left.
DO $vocab$
DECLARE
  n_deleted integer;
  n_human   integer;
BEGIN
  SELECT count(*) INTO n_human FROM public.changelog_highlights
   WHERE status = 'approved'
     AND (source = 'human' OR reviewed_at IS NOT NULL)
     AND (COALESCE(headline, '') || ' ' || COALESCE(affects, '') || ' ' || COALESCE(action, ''))
         ~* '\y(students?|faculty|staff)\y';
  IF n_human > 0 THEN
    RAISE NOTICE 'vocabulary: % person-owned approved row(s) carry a forbidden word — left for the queue, not touched', n_human;
  END IF;

  DELETE FROM public.changelog_highlights
   WHERE status = 'approved'
     AND source = 'ai'
     AND reviewed_at IS NULL
     AND (COALESCE(headline, '') || ' ' || COALESCE(affects, '') || ' ' || COALESCE(action, ''))
         ~* '\y(students?|faculty|staff)\y';
  GET DIAGNOSTICS n_deleted = ROW_COUNT;
  RAISE NOTICE 'vocabulary: % machine-written approved row(s) deleted for re-run through the output gate', n_deleted;
END
$vocab$;

-- ---------------------------------------------------------------------
-- (2) THE GUARANTEE — a skipped row must say why, from here on
-- ---------------------------------------------------------------------
-- 20261217120000 backfilled the rows that had no reason. Between that apply
-- and this one the deployed cron may have written more, so the guard runs
-- again here and the same backfill rule is re-applied before the CHECK lands.
DO $backfill_again$
DECLARE
  n_person     integer;
  n_ai_refused integer;
BEGIN
  UPDATE public.changelog_highlights
     SET skip_reason = 'person'
   WHERE status = 'skipped' AND skip_reason IS NULL AND reviewed_at IS NOT NULL;
  GET DIAGNOSTICS n_person = ROW_COUNT;

  UPDATE public.changelog_highlights
     SET skip_reason = 'ai_refused'
   WHERE status = 'skipped' AND skip_reason IS NULL AND reviewed_at IS NULL;
  GET DIAGNOSTICS n_ai_refused = ROW_COUNT;

  RAISE NOTICE 'top-up backfill since 20261217120000: % person, % ai_refused', n_person, n_ai_refused;
END
$backfill_again$;

DO $guard$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.changelog_highlights
   WHERE status = 'skipped' AND skip_reason IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% skipped row(s) still carry no skip_reason after the backfill — the CHECK would fail; aborting', n;
  END IF;
END
$guard$;

ALTER TABLE public.changelog_highlights
  DROP CONSTRAINT IF EXISTS changelog_highlights_skipped_has_reason_check;

ALTER TABLE public.changelog_highlights
  ADD CONSTRAINT changelog_highlights_skipped_has_reason_check
  CHECK (status <> 'skipped' OR skip_reason IS NOT NULL);

-- The column comment can now state the requirement as live, which
-- 20261217120000 deliberately did not.
COMMENT ON COLUMN public.changelog_highlights.skip_reason IS
  'Why this write-up is (or was last) skipped, as a QUERYABLE value: reverted = the change is no longer on the branch (ruling 6, matched by changelog_entries.reverted_by_sha); reported = enough distinct readers flagged it (Director 2026-09-13 22:20, threshold in platform_policies); person = a super admin hid it; ai_refused = the writer said the change has no user-visible effect; vocab = the writer used a forbidden word twice and was never published; security = the commit describes a closed access hole and was never published. A skipped row MUST carry one (changelog_highlights_skipped_has_reason_check). Read WITH status — it is not cleared on restore, on purpose: it is the record of the last takedown.';

-- ---------------------------------------------------------------------
-- VERIFY — the three assertions this file earns
-- ---------------------------------------------------------------------
DO $assert$
BEGIN
  -- the guarantee is in place
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_skipped_has_reason_check'
  ) THEN
    RAISE EXCEPTION 'changelog_highlights_skipped_has_reason_check is missing';
  END IF;

  -- zero skipped rows without a reason
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE status = 'skipped' AND skip_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'a skipped row with NULL skip_reason survived';
  END IF;

  -- no machine-written approved row carries a forbidden word
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE status = 'approved' AND source = 'ai' AND reviewed_at IS NULL
       AND (COALESCE(headline, '') || ' ' || COALESCE(affects, '') || ' ' || COALESCE(action, ''))
           ~* '\y(students?|faculty|staff)\y'
  ) THEN
    RAISE EXCEPTION 'a machine-written approved write-up still carries a forbidden word';
  END IF;

  -- the six reasons must already be representable — 20261217120000 first
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_skip_reason_check'
       AND pg_get_constraintdef(oid) LIKE '%vocab%'
       AND pg_get_constraintdef(oid) LIKE '%security%'
  ) THEN
    RAISE EXCEPTION 'apply supabase/migrations/20261217120000 first — the skip_reason CHECK does not yet admit vocab/security';
  END IF;
END
$assert$;
