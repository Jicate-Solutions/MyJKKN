-- ============================================================================
-- 20261207090000_changelog_highlight_reports.sql
-- ----------------------------------------------------------------------------
-- What's New — REPORT IT. One tap from any reader to say "this write-up is
-- wrong", and the honest count of how often that happens.
--
-- Director ruling 7 (2026-09-13,
-- specs/whats-new/highlight-writer-rulings-2026-09-13.md):
--
--   "Every write-up carries a report-it link. One tap from any reader. This is
--   the review layer — it replaces the approval queue he declined, by moving
--   the check from one person doing weekly work to every reader doing nothing
--   until something looks wrong. It also yields an honest measure of how often
--   the writing is wrong."
--
-- ───────────────── WHY THIS IS LOAD-BEARING, NOT A NICETY ───────────────────
--
-- The writer runs TWICE AN HOUR (`13,43 * * * *`) and publishes UNREVIEWED.
-- Both are explicit Director rulings. Together they mean a fault repeats 48
-- times a day onto a page nobody is paid to check. Three things make that
-- cadence safe, and this table is one of them: ruling 5 (a hidden write-up is
-- never rewritten), ruling 7 (this), ruling 8 (a silent stop is not silent).
-- The spec records that if any of the three is dropped, the cadence must be
-- revisited. This is not a feature that can be deferred without reopening that
-- decision.
--
-- ────────────── WHY NOT bug_reports, WHICH ALREADY EXISTS ───────────────────
--
-- The Director asked that bug_reports (3,435 rows, already used, already
-- triaged) be surveyed before a new table was invented. It was, and it is the
-- wrong home — for four reasons, each of which defeats the ruling rather than
-- merely inconveniencing it:
--
--   1. IT IS NOT ONE TAP. app/api/bug-reports/route.ts validates
--      `description: z.string().min(10)` and a `page_url`. Ruling 7 says one
--      tap from any reader. A ten-character essay box is the approval queue's
--      friction reappearing at the other end of the page, and a reader who is
--      asked to write a paragraph mostly does not.
--   2. IT YIELDS NO COUNT. "How often is the writing wrong" has to be
--      answerable per write-up. In bug_reports that means grepping free text
--      for a sha. Here it is one GROUP BY, and it is right by construction.
--   3. NOTHING STOPS DOUBLE-COUNTING. bug_reports has no uniqueness per
--      (reporter, thing reported), so one annoyed reader tapping four times
--      would make the writing look four times worse than it is. The UNIQUE
--      below makes the count mean "how many DISTINCT readers said this is
--      wrong", which is the number the Director actually asked for.
--   4. IT WOULD POISON A WORKING QUEUE. bug_reports carries AI triage,
--      clustering, duplicate detection, an auto-resolve policy and a reporter
--      chat — all aimed at CODE defects with a reproduction. A wrong sentence
--      has no stack trace, no console log and nothing to reproduce; routing it
--      there would train the cluster detector on noise and put a support
--      conversation in front of a reader who tapped a link.
--
-- So: four columns, one constraint, no workflow. A report is a TALLY, not a
-- ticket. Nothing here changes a write-up's status — a reader's tap is a signal
-- for a super admin to act on, never an automatic takedown, because a single
-- reader can be wrong about a sentence that is right and the page must not be
-- editable by whoever taps fastest.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.changelog_highlight_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The SAME key changelog_entries and changelog_highlights are keyed by. A
  -- short commit hash is unique inside one repository and nowhere else
  -- (20260907183500), so the pair is the only correct reference.
  app_key     text NOT NULL DEFAULT 'myjkkn',
  sha         text NOT NULL,

  -- Who tapped. NOT NULL: an anonymous tally cannot be de-duplicated, and a
  -- count that one person can run up is not the honest measure ruling 7 asks
  -- for. ON DELETE CASCADE — a departed reader's tap leaves with them rather
  -- than becoming an unattributable row that keeps inflating the count.
  reported_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  created_at  timestamptz NOT NULL DEFAULT now(),

  -- ONE TAP PER READER PER WRITE-UP. This is what makes COUNT(*) mean
  -- "distinct readers who said this is wrong" without the counting code having
  -- to know that. A second tap is a no-op, not a second complaint.
  CONSTRAINT changelog_highlight_reports_once
    UNIQUE (app_key, sha, reported_by),

  -- Reports hang off the ENTRY, not off the highlight row, and the reason is
  -- the same one 20261203120000 gives for the highlight's own cascade: the sync
  -- PRUNES entries the title rules no longer produce. A report whose entry is
  -- gone points at nothing, can be shown nowhere and can be found by nobody to
  -- clean up. Anchoring here also means a report SURVIVES a super admin hiding
  -- the write-up — which is the point: the tally of how often the writing was
  -- wrong must not be erased by the act of fixing one instance of it.
  CONSTRAINT changelog_highlight_reports_entry_fk
    FOREIGN KEY (app_key, sha)
    REFERENCES public.changelog_entries (app_key, sha)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- The only read that is not a point lookup: "how many reports per write-up",
-- for the queue screen and for the Director's honest measure.
CREATE INDEX IF NOT EXISTS changelog_highlight_reports_entry_idx
  ON public.changelog_highlight_reports (app_key, sha);

COMMENT ON TABLE public.changelog_highlight_reports IS
  'One tap per reader per What''s New write-up, saying the write-up is wrong '
  '(Director ruling 7, 2026-09-13). A TALLY, not a ticket: nothing here changes '
  'a highlight''s status, and COUNT(*) per (app_key, sha) is by construction the '
  'number of DISTINCT readers who flagged it. Deliberately NOT bug_reports — '
  'that route requires a 10-character description and a page URL, has no '
  'per-target uniqueness, and runs AI triage and clustering aimed at code '
  'defects; see this migration''s header for the full comparison.';

-- -------------------------------------------------------------------- RLS ----
ALTER TABLE public.changelog_highlight_reports ENABLE ROW LEVEL SECURITY;

-- REPORTER — may file a report, for themselves only, and only about a write-up
-- they can actually SEE.
--
-- The visibility test is not decoration. Without it a signed-in reader could
-- file reports against entries in modules they are not scoped to, and the count
-- a super admin reads would include complaints about sentences the complainer
-- was never shown. It is expressed as EXISTS over changelog_highlights, whose
-- own reader policy (20261203120000) already carries BOTH boundaries —
-- status = 'approved' AND fn_changelog_visible_modules() — so this policy
-- inherits them instead of restating them and drifting from them.
DROP POLICY IF EXISTS changelog_highlight_reports_insert_own
  ON public.changelog_highlight_reports;
CREATE POLICY changelog_highlight_reports_insert_own
  ON public.changelog_highlight_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.changelog_highlights h
       WHERE h.app_key = changelog_highlight_reports.app_key
         AND h.sha     = changelog_highlight_reports.sha
    )
  );

-- REPORTER — sees their own taps, so the page can say "you reported this"
-- after a reload rather than offering the link again as though nothing
-- happened.
DROP POLICY IF EXISTS changelog_highlight_reports_select_own
  ON public.changelog_highlight_reports;
CREATE POLICY changelog_highlight_reports_select_own
  ON public.changelog_highlight_reports
  FOR SELECT TO authenticated
  USING (reported_by = auth.uid());

-- SUPER ADMIN / APPROVER — reads every report, because the count is the whole
-- deliverable. Gated on the same permission key the highlights queue is gated
-- on, never on a role name: user_has_permission() carries the multi-role
-- OR-merge and the super-admin bypass.
--
-- PERMISSIVE, so it ORs with the reporter's own-row policy.
--
-- There is deliberately NO update or delete policy. A report is a fact about
-- what a reader said; editing the tally would make the measure worth nothing,
-- and the Director asked for an HONEST count. Rows leave only with their entry
-- or their reader, through the two cascades above.
DROP POLICY IF EXISTS changelog_highlight_reports_read_all
  ON public.changelog_highlight_reports;
CREATE POLICY changelog_highlight_reports_read_all
  ON public.changelog_highlight_reports
  FOR SELECT TO authenticated
  USING (public.user_has_permission('whats_new.highlights.manage'));

-- ------------------------------------------------------------- privileges ----
-- anon holds a direct grant on every new table through Supabase's
-- ALTER DEFAULT PRIVILEGES, separate from PUBLIC. Revoking PUBLIC alone leaves
-- it (feedback_supabase_anon_execute_default_grant); and `authenticated` holds
-- its own grant too, so the write surface is named explicitly rather than
-- assumed (feedback_authenticated_holds_a_direct_table_grant_too).
REVOKE ALL ON public.changelog_highlight_reports FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.changelog_highlight_reports TO authenticated;

-- ── Assertions — the end state, checked rather than assumed ─────────────────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.changelog_highlight_reports', 'SELECT') THEN
    RAISE EXCEPTION 'changelog_highlight_reports is readable by anon';
  END IF;

  IF has_table_privilege('anon', 'public.changelog_highlight_reports', 'INSERT') THEN
    RAISE EXCEPTION 'changelog_highlight_reports is writable by anon';
  END IF;

  -- UPDATE and DELETE are not granted to anyone: the tally is append-only.
  IF has_table_privilege('authenticated', 'public.changelog_highlight_reports', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.changelog_highlight_reports', 'DELETE')
  THEN
    RAISE EXCEPTION 'changelog_highlight_reports must be append-only for authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlight_reports'::regclass
       AND conname  = 'changelog_highlight_reports_once'
  ) THEN
    RAISE EXCEPTION 'the one-tap-per-reader constraint is missing — the count would not be honest';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
