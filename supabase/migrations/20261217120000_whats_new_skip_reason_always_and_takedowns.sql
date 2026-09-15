-- =====================================================================
-- What's New — every takedown records why, and two write-ups come down
-- =====================================================================
-- Created: 2026-09-15 (Director: "fix all issues once and for all")
--
-- FILE ONLY. The operator applies it at merge. No table is created, no column
-- is added, no policy or grant changes. Four things happen, in this order:
--
--   (1) The skip_reason CHECK admits two new values, 'vocab' and 'security',
--       which the cron now writes (app/api/cron/whats-new-highlight-drafts).
--   (2) BACKFILL. skip_reason was NULL on all 95 skipped rows on 2026-09-15 —
--       49 of them written AFTER the column landed — because only the
--       takedown path ever set it. Before that path existed a row could reach
--       'skipped' in exactly two ways: a person pressed Skip in the queue
--       (which stamps reviewed_at), or the writer refused (which does not).
--       So: reviewed_at IS NOT NULL → 'person', else 'ai_refused'.
--   (3) TWO TAKEDOWNS, by name, with their reasons on the row:
--         49ae115 (meetings) told every reader that calendar-lock RPCs "were
--                 callable by ANY logged-in user" — a security line that the
--                 kind = 'security' rule could not catch because the commit
--                 was typed fix. skip_reason = 'security'.
--         64116db (what-s-new) promised readers "updates posted by other
--                 Application Hub apps" — production has ONE app key and
--                 multi-app display is gated on a usage recorder that is not
--                 built (Director ruling). skip_reason = 'person'.
--   (4) THE 64 VOCABULARY OFFENDERS ARE RE-RUN, NOT HAND-EDITED. Every
--       machine-written, never-reviewed, approved write-up whose three lines
--       carry student/students/faculty/staff is DELETED. No row means the
--       entry re-qualifies for selection, and the cron writes it up again
--       through the output gate — retry once with the words named, then
--       'skipped' / 'vocab'. A human-written row is never touched, and a row a
--       person has reviewed is never touched (ruling 5).
--
-- Then the guarantee: a CHECK that a 'skipped' row MUST carry a skip_reason,
-- added only after the backfill has proven there are none left without one.
-- It constrains 'skipped' rows ONLY — a restore (status back to 'approved')
-- keeps its old skip_reason, exactly as 20261216113700 intended.
--
-- GRANTS, both directions, asserted and not changed. The approval queue
-- writes as the signed-in user under changelog_highlights_manage and NEEDS
-- UPDATE on changelog_highlights; that grant was revoked by mistake on the
-- morning of 2026-09-15 and the queue failed with 42501 for 63 minutes. This
-- file grants and revokes nothing; it proves UPDATE is still held by
-- authenticated and still not held by anon, and aborts if either is false.
--
-- No BEGIN/COMMIT of its own: the operator's apply wraps it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) The CHECK admits the two reasons the output gate writes
-- ---------------------------------------------------------------------
ALTER TABLE public.changelog_highlights
  DROP CONSTRAINT IF EXISTS changelog_highlights_skip_reason_check;

ALTER TABLE public.changelog_highlights
  ADD CONSTRAINT changelog_highlights_skip_reason_check
  CHECK (skip_reason IS NULL
         OR skip_reason IN ('reverted', 'reported', 'person', 'ai_refused', 'vocab', 'security'));

COMMENT ON COLUMN public.changelog_highlights.skip_reason IS
  'Why this write-up is (or was last) skipped, as a QUERYABLE value: reverted = the change is no longer on the branch (ruling 6, matched by changelog_entries.reverted_by_sha); reported = enough distinct readers flagged it (Director 2026-09-13 22:20, threshold in platform_policies); person = a super admin hid it; ai_refused = the writer said the change has no user-visible effect; vocab = the writer used a forbidden word (student/faculty/staff) twice and was never published; security = the commit describes a closed access hole and was never published. Since 2026-09-15 a skipped row MUST carry one (changelog_highlights_skipped_has_reason_check). Read WITH status — it is not cleared on restore, on purpose: it is the record of the last takedown.';

-- ---------------------------------------------------------------------
-- (2) BACKFILL — the 95 skipped rows that never said why
-- ---------------------------------------------------------------------
-- Two ways a row could have reached 'skipped' before any takedown path
-- existed, and reviewed_at tells them apart exactly: the queue's PUT stamps it
-- on every person's decision; the cron's refusal write never does.
DO $backfill$
DECLARE
  n_person     integer;
  n_ai_refused integer;
BEGIN
  UPDATE public.changelog_highlights
     SET skip_reason = 'person'
   WHERE status = 'skipped'
     AND skip_reason IS NULL
     AND reviewed_at IS NOT NULL;
  GET DIAGNOSTICS n_person = ROW_COUNT;

  UPDATE public.changelog_highlights
     SET skip_reason = 'ai_refused'
   WHERE status = 'skipped'
     AND skip_reason IS NULL
     AND reviewed_at IS NULL;
  GET DIAGNOSTICS n_ai_refused = ROW_COUNT;

  RAISE NOTICE 'skip_reason backfill: % person, % ai_refused', n_person, n_ai_refused;
END
$backfill$;

-- ---------------------------------------------------------------------
-- (3) TWO TAKEDOWNS, by name
-- ---------------------------------------------------------------------
-- Matched on a sha PREFIX because that is how the hunt named them; a prefix
-- that matches more than one row aborts rather than guesses. A row already
-- taken down by someone else in the meantime is left as they left it — the
-- assertion at the end is on the END STATE (not approved), not on this
-- file's own row count.
DO $takedowns$
DECLARE
  n integer;
BEGIN
  -- 49ae115 — a security line, published to every reader.
  SELECT count(*) INTO n FROM public.changelog_highlights
   WHERE app_key = 'myjkkn' AND sha LIKE '49ae115%';
  IF n > 1 THEN
    RAISE EXCEPTION 'sha prefix 49ae115 matches % highlight rows — refusing to guess', n;
  END IF;

  UPDATE public.changelog_highlights
     SET status = 'skipped',
         skip_reason = 'security',
         selection_reason = left(
           'Taken down 2026-09-15: the write-up described a closed access hole '
           || '(subject: calendar-lock RPCs were callable by ANY logged-in user). '
           || 'Security lines do not go on the page; the kind = ''security'' rule could not '
           || 'catch this one because the commit was typed fix. Previously: '
           || COALESCE(selection_reason, '(no reason recorded)'), 2000)
   WHERE app_key = 'myjkkn' AND sha LIKE '49ae115%' AND status = 'approved';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'takedown 49ae115 (security): % row(s) changed', n;

  -- 64116db — a promise of something the reader cannot see.
  SELECT count(*) INTO n FROM public.changelog_highlights
   WHERE app_key = 'myjkkn' AND sha LIKE '64116db%';
  IF n > 1 THEN
    RAISE EXCEPTION 'sha prefix 64116db matches % highlight rows — refusing to guess', n;
  END IF;

  UPDATE public.changelog_highlights
     SET status = 'skipped',
         skip_reason = 'person',
         selection_reason = left(
           'Taken down 2026-09-15 on the Director''s ruling: the write-up promised updates '
           || 'from other Application Hub apps, and production has one app key — multi-app '
           || 'display is gated on a usage recorder that is not built. The reader was promised '
           || 'something they cannot see. Previously: '
           || COALESCE(selection_reason, '(no reason recorded)'), 2000)
   WHERE app_key = 'myjkkn' AND sha LIKE '64116db%' AND status = 'approved';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'takedown 64116db (person): % row(s) changed', n;
END
$takedowns$;

-- ---------------------------------------------------------------------
-- (4) THE VOCABULARY OFFENDERS — re-run through the gate, not hand-edited
-- ---------------------------------------------------------------------
-- The same word-boundary test the cron's forbiddenVocabulary() applies:
-- student, students, faculty, staff — case-insensitive, whole words only, in
-- any of the three lines. \y is Postgres's word boundary.
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
-- THE GUARANTEE — a skipped row must say why, from here on
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- VERIFY — the end state, checked rather than assumed
-- ---------------------------------------------------------------------
DO $assert$
BEGIN
  -- (1) both new reasons are representable, and the old four still are
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_skip_reason_check'
       AND pg_get_constraintdef(oid) LIKE '%vocab%'
       AND pg_get_constraintdef(oid) LIKE '%security%'
       AND pg_get_constraintdef(oid) LIKE '%reverted%'
       AND pg_get_constraintdef(oid) LIKE '%reported%'
       AND pg_get_constraintdef(oid) LIKE '%person%'
       AND pg_get_constraintdef(oid) LIKE '%ai_refused%'
  ) THEN
    RAISE EXCEPTION 'the skip_reason CHECK does not admit all six reasons';
  END IF;

  -- the guarantee is in place
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_skipped_has_reason_check'
  ) THEN
    RAISE EXCEPTION 'changelog_highlights_skipped_has_reason_check is missing';
  END IF;

  -- (2) zero skipped rows without a reason
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE status = 'skipped' AND skip_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'a skipped row with NULL skip_reason survived';
  END IF;

  -- (3) both named write-ups are down, with their reasons
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE app_key = 'myjkkn' AND sha LIKE '49ae115%' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION '49ae115 is still approved';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE app_key = 'myjkkn' AND sha LIKE '64116db%' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION '64116db is still approved';
  END IF;

  -- (4) no machine-written approved row carries a forbidden word
  IF EXISTS (
    SELECT 1 FROM public.changelog_highlights
     WHERE status = 'approved' AND source = 'ai' AND reviewed_at IS NULL
       AND (COALESCE(headline, '') || ' ' || COALESCE(affects, '') || ' ' || COALESCE(action, ''))
           ~* '\y(students?|faculty|staff)\y'
  ) THEN
    RAISE EXCEPTION 'a machine-written approved write-up still carries a forbidden word';
  END IF;

  -- GRANTS, both directions. This file changes none; it proves the queue can
  -- still write and the public still cannot read.
  IF NOT has_table_privilege('authenticated', 'public.changelog_highlights', 'UPDATE') THEN
    RAISE EXCEPTION 'the approval queue cannot write — UPDATE on changelog_highlights is not held by authenticated (this broke the queue for 63 minutes on 2026-09-15; apply 20261217061500 first)';
  END IF;
  IF has_table_privilege('anon', 'public.changelog_highlights', 'SELECT')
     OR has_table_privilege('anon', 'public.changelog_highlights', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can read or write changelog_highlights';
  END IF;
END
$assert$;
