-- ============================================================================
-- 20261216113700_whats_new_takedown_reason_and_cron_absence.sql
-- ----------------------------------------------------------------------------
-- Two defects, one substrate change each, plus the config rows both need.
--
-- ⛔ FILE ONLY — NOT APPLIED BY MERGING. Applying to production is a separate,
--    Director-gated step. No BEGIN;/COMMIT; here (rollback-rehearsal safe).
--
-- ════════════════════ 1. THE REVERT DETECTOR COULD NOT SEE A REVERT ═════════
--
-- specs/whats-new/KNOWN-GAP-revert-detection.md, recorded on 2026-09-13 the day
-- after the detector shipped in PR #3710: "SHIPPED AND DEAD. The code is
-- present, tested and reachable. It can never fire in production."
--
-- Two independent blockers, each sufficient on its own:
--   (a) `git revert` writes `Revert "feat(x): …"`, which does not match the
--       generator's SUBJECT_RE, so a revert commit never became a
--       changelog_entries row at all;
--   (b) the `subject` stored on a row has had its `type(scope):` prefix
--       stripped, its `(#nnnn)` removed and its first letter upper-cased, so
--       comparing it against a revert's raw quoted subject could never succeed.
--
-- And (c), which is worse than not firing: because the prefix is stripped,
-- `feat(events): send a reminder` and `fix(billing): send a reminder` STORE AS
-- THE SAME STRING. The moment (a) was lifted, one revert would have taken down
-- an unrelated module's write-up. The Director's stated bias is that a false
-- retraction is the worse failure, so text matching is gone entirely rather
-- than guarded.
--
-- THE FIX IS A COLUMN, because the answer cannot be computed from what the
-- table holds. scripts/generate-changelog.mjs now reads the commit BODY
-- (`This reverts commit <sha>`) and, where a squash-merge threw the body away,
-- resolves the quoted subject against RAW git subjects — where the prefix is
-- still present and a subject resolves to exactly one commit or is refused.
-- Either way the answer is a SHA, which is the key changelog_entries is already
-- keyed by. Measured against this repository on 2026-09-14: 5 commits carry a
-- `Revert "…"` subject, only 2 still carry the body line, and 3 entries are
-- currently net-reverted.
--
-- NET, not historical. `Revert "Revert "X""` — and the commoner shape, a fresh
-- `git revert` OF the revert (#744 reverted #728; #749 re-landed it) — means X
-- is BACK, and the generator walks the graph rather than counting quote depth.
-- A re-landed change therefore has reverted_by_sha set back to NULL by the
-- sync's upsert, and its write-up is not retracted.
--
-- ════════════════════ 2. AN ALERT THAT ONLY SEES FAILURE ════════════════════
--
-- Measured live at 14:05 on 2026-09-14: cron_run_log held 16 runs for
-- `whats-new-highlight-drafts`, ALL ok = true, the latest at 08:13 — six hours
-- earlier on a `13,43 * * * *` schedule, so roughly a dozen fires did not
-- happen. fn_cron_failure_streaks (20260910030000) counts CONSECUTIVE
-- FAILURES; sixteen successes and then silence is a streak of zero. Nothing
-- tripped, and nothing could: there was no failure to count.
--
-- That is the shape the Director was already shown — three Instagram pipeline
-- jobs failing June to September while the dashboards read healthy — except
-- worse, because there is nothing to fail.
--
-- fn_cron_last_runs below is deliberately a FACT READER and not a second
-- detector: it returns each job's most recent run and nothing else. The
-- decision (is this job late?) is lib/cron/absence.ts, which compares that
-- against a DECLARED cadence, and the ALERT is the existing
-- /api/cron/cron-failure-alerts fan-out to super admins. One delivery path, as
-- the spec requires; no new table, no new schedule, no second notification.
--
-- WHY CADENCE IS DECLARED AND NOT INFERRED (both measured against real jobs):
--   * a broken job's own history normalises its breakage — 16 runs in 14 days
--     makes six hours of silence look ordinary, so an inferred threshold stays
--     quiet for exactly the job it exists to catch;
--   * a bursty schedule looks dead between bursts — aipulse-domain-starter-notify
--     fires ten times on a Thursday and then not for six days, and would page
--     every Friday about a healthy job.
-- The number to declare is read off vercel.json, and for a bursty schedule it
-- is the LONGEST normal gap, not the gap inside the burst.
--
-- ════════════════════ 3. THREE READERS TAKE A WRITE-UP DOWN ═════════════════
--
-- Director ruling, 2026-09-13 22:20. changelog_highlight_reports (20261207090000)
-- is a tally whose own comment says "nothing here changes a highlight's status".
-- The tally is sound; the threshold did not exist.
--
-- It could not simply be added, and that is what skip_reason below is for. The
-- retract pass collapses "a machine took this down" and "a human hid this" into
-- the single status `skipped`, distinguished only by prose inside
-- selection_reason, which is not queryable. Ruling 5's never-rewrite check keys
-- on status alone, so a restored write-up would be permanently unwritable and
-- nothing in the data would say why. One queryable column fixes both, and the
-- revert takedown uses it too.
-- ============================================================================


-- ---------------------------------------------------------------------
-- (1) changelog_entries.reverted_by_sha
-- ---------------------------------------------------------------------
ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS reverted_by_sha text;

COMMENT ON COLUMN public.changelog_entries.reverted_by_sha IS
  'The sha of the commit that reverted this change, when the change is NOT on the branch today; NULL otherwise, which is the ordinary case. Resolved by scripts/generate-changelog.mjs from the commit body''s "This reverts commit <sha>" line, or — when a squash-merge dropped the body — from the quoted subject resolved against RAW git subjects, refusing any match that is not unique. NET rather than historical: a re-landed change has this set back to NULL. Never derived from the stored `subject`, which has had its type(scope): prefix stripped and is therefore ambiguous across modules — see specs/whats-new/KNOWN-GAP-revert-detection.md.';

-- The only read: the highlight cron asks "which of the entries in my window are
-- reverted", and that is a handful of rows out of ~5,000. Partial, so the index
-- stays tiny.
CREATE INDEX IF NOT EXISTS changelog_entries_reverted_idx
  ON public.changelog_entries (app_key, sha)
  WHERE reverted_by_sha IS NOT NULL;


-- ---------------------------------------------------------------------
-- (2) changelog_highlights.skip_reason — WHY a write-up came down
-- ---------------------------------------------------------------------
-- Deliberately NOT constrained against `status`. A super admin restoring a
-- write-up sets status back to 'approved' through a route this change does not
-- own, and a cross-column CHECK would make that restore fail unless it also
-- cleared this column. The honest reading is "the reason for the LAST takedown",
-- read together with status — which is also what makes it useful after a
-- restore: it still says what the machine did.
ALTER TABLE public.changelog_highlights
  ADD COLUMN IF NOT EXISTS skip_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_skip_reason_check'
  ) THEN
    ALTER TABLE public.changelog_highlights
      ADD CONSTRAINT changelog_highlights_skip_reason_check
      CHECK (skip_reason IS NULL
             OR skip_reason IN ('reverted', 'reported', 'person', 'ai_refused'));
  END IF;
END
$$;

COMMENT ON COLUMN public.changelog_highlights.skip_reason IS
  'Why this write-up was last taken down, as a QUERYABLE value rather than prose inside selection_reason: reverted = the change is no longer on the branch (ruling 6, matched by changelog_entries.reverted_by_sha); reported = enough distinct readers flagged it (Director 2026-09-13 22:20, threshold in platform_policies); person = a super admin hid it; ai_refused = the writer said the change has no user-visible effect. NULL for a row that has never come down. Read WITH status — it is not cleared on restore, on purpose: it is the record of what the machine did.';

-- "Which write-ups did a machine take down, so a person can review them." The
-- whole point of the column; without an index it is a full scan of a table that
-- is mostly approved rows.
CREATE INDEX IF NOT EXISTS changelog_highlights_skip_reason_idx
  ON public.changelog_highlights (skip_reason, app_key, sha)
  WHERE skip_reason IS NOT NULL;


-- ---------------------------------------------------------------------
-- (3) READ — each job's most recent run, so absence can be measured
-- ---------------------------------------------------------------------
-- A FACT READER, not a detector. It answers "when did each job last run, and
-- how many runs are in the window" and takes no view on whether that is late;
-- the lateness decision needs a DECLARED cadence, lives in lib/cron/absence.ts,
-- and is unit-tested there rather than being buried in plpgsql where nothing
-- can exercise it.
--
-- EVERY run counts, successful or not. A job that is failing is already the
-- streak detector's business; what this one must not do is call a job absent
-- because its runs were failures — that would double-page for one fault.
--
-- Service-role only, like every other reader on this table: `error` can carry
-- raw third-party error text, there is no UI for this, and a human admin
-- already has a read path through the table's own admin SELECT policy.
CREATE OR REPLACE FUNCTION public.fn_cron_last_runs(
    p_lookback_hours integer DEFAULT 336   -- 14 days = the retention window
)
RETURNS TABLE(
    job_key        text,
    path           text,
    last_run_at    timestamptz,
    runs_in_window integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_lookback integer := GREATEST(COALESCE(p_lookback_hours, 336), 1);
BEGIN
    RETURN QUERY
    SELECT l.job_key,
           -- The path as of the most recent run. A route that moved would
           -- otherwise report whichever path sorted first.
           (array_agg(l.path ORDER BY l.started_at DESC))[1] AS path,
           max(l.started_at)  AS last_run_at,
           count(*)::integer  AS runs_in_window
      FROM public.cron_run_log l
     WHERE l.started_at >= now() - make_interval(hours => v_lookback)
     GROUP BY l.job_key
     ORDER BY max(l.started_at) ASC;   -- quietest first
END;
$function$;

-- Supabase's ALTER DEFAULT PRIVILEGES hands `anon` a direct EXECUTE grant on
-- every new function, separate from PUBLIC, so revoking PUBLIC alone leaves the
-- function callable with the anon key that is embedded in every page bundle
-- (feedback_supabase_anon_execute_default_grant). `authenticated` is named for
-- the same reason.
REVOKE EXECUTE ON FUNCTION public.fn_cron_last_runs(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cron_last_runs(integer) TO service_role;

COMMENT ON FUNCTION public.fn_cron_last_runs(integer) IS
  'Each job in cron_run_log with its MOST RECENT run and its run count inside the lookback window, quietest job first. A fact reader for absence detection: /api/cron/cron-failure-alerts compares last_run_at against a declared cadence (platform_ops.cron_expected_interval_minutes) using lib/cron/absence.ts. Exists because fn_cron_failure_streaks counts consecutive FAILURES and therefore cannot see a job that simply STOPS — measured 2026-09-14: whats-new-highlight-drafts, 16 runs all ok, silent for six hours on a half-hourly schedule, nothing anywhere went red. Service-role only.';


-- ---------------------------------------------------------------------
-- (4) CONFIG — the two policy decisions this change makes
-- ---------------------------------------------------------------------
-- Every policy decision is a config row (docs/architecture/config-table-pattern.md).
-- Two shape traps in this table, both hit before and both copied verbatim from
-- 20260910030000 rather than re-derived:
--   * the unique index is an EXPRESSION index, so a bare ON CONFLICT (policy_key)
--     raises 42P10 — the conflict target must be spelled out exactly as below;
--   * data_type has no 'integer' in its CHECK — the numeric type is 'number'.
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('platform_ops.cron_expected_interval_minutes', 'global',
   '{"whats-new-highlight-drafts": 30}'::jsonb,
   -- 'object', not 'json'. data_type's CHECK admits number|string|boolean|
   -- array|object|enum and nothing else (20260429000002), and a wrong value
   -- here aborts the whole migration on a constraint nobody reads twice.
   'object', 'major', 'published', true,
   'job_key -> how many minutes may pass between runs before /api/cron/cron-failure-alerts calls that scheduled job STOPPED. Read off vercel.json; for a bursty schedule declare the LONGEST normal gap (a Thursday-only job is 7 days, not the hour between its fires) or it pages every week about a healthy job. A job that is NOT listed here is not watched for absence at all — cadence is declared rather than inferred because a broken job''s own history normalises its breakage: whats-new-highlight-drafts logged 16 runs in 14 days on a half-hourly schedule, so six hours of silence looks ordinary against its own record. Three consecutive missed intervals (lib/cron/absence.ts), never less than 45 minutes, before it raises.'),
  ('whats_new.highlight_report_hide_threshold', 'global', '3'::jsonb, 'number',
   'major', 'published', true,
   'How many DISTINCT readers must tap report-it on a What''s New write-up before it is taken down automatically (Director, 2026-09-13 22:20). 3, so one annoyed reader cannot edit the page and a genuinely wrong sentence still comes down the same day. Counted from changelog_highlight_reports, whose UNIQUE (app_key, sha, reported_by) makes a row count mean distinct readers. Never applied to a row a person has already approved, skipped or restored — that guard is what stops the cron fighting a super admin''s restore every half hour.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;


-- ---------------------------------------------------------------------
-- (5) SELF-ASSERTION — prove the end state, do not describe it
-- ---------------------------------------------------------------------
-- has_function_privilege reports the EFFECTIVE privilege, which is the only
-- thing that matters: `anon` is a MEMBER of PUBLIC, so an ACL string can read as
-- revoked while anon still holds the grant through PUBLIC. Reading ACL text has
-- produced exactly that false clean bill before. RAISE, never NOTICE, so a
-- leaked grant aborts the migration instead of reporting success.
DO $assert$
BEGIN
    IF has_function_privilege('anon', 'public.fn_cron_last_runs(integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_cron_last_runs(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fn_cron_last_runs is still executable by anon or authenticated';
    END IF;

    IF NOT has_function_privilege('service_role', 'public.fn_cron_last_runs(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role cannot execute fn_cron_last_runs — no absence would ever be detected';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'changelog_entries'
         AND column_name = 'reverted_by_sha'
    ) THEN
        RAISE EXCEPTION 'changelog_entries.reverted_by_sha is missing — the sync would fail on every run';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'changelog_highlights'
         AND column_name = 'skip_reason'
    ) THEN
        RAISE EXCEPTION 'changelog_highlights.skip_reason is missing — a machine takedown would be indistinguishable from a human one';
    END IF;

    -- The takedown values the code writes must be representable. A CHECK that
    -- did not list one of them would fail every takedown at 2am, silently, in a
    -- cron nobody is watching.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.changelog_highlights'::regclass
         AND conname  = 'changelog_highlights_skip_reason_check'
         AND pg_get_constraintdef(oid) LIKE '%reverted%'
         AND pg_get_constraintdef(oid) LIKE '%reported%'
    ) THEN
        RAISE EXCEPTION 'the skip_reason CHECK does not admit both machine takedown reasons';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.platform_policies
       WHERE policy_key = 'whats_new.highlight_report_hide_threshold'
    ) THEN
        RAISE EXCEPTION 'the report-hide threshold policy row was not written';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.platform_policies
       WHERE policy_key = 'platform_ops.cron_expected_interval_minutes'
    ) THEN
        RAISE EXCEPTION 'the cron cadence policy row was not written — no job would be watched for absence';
    END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
