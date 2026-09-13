-- ============================================================================
-- 20261203180000_whats_new_highlight_writer.sql
-- ----------------------------------------------------------------------------
-- What's New — the plain-English HIGHLIGHT WRITER: the ₹0 Max-lane job type
-- ('whats_new.highlight_draft') that turns a developer's commit subject into
-- the three lines a Principal can read, plus the `source` column that lets a
-- machine-written highlight be published without forging a human's signature.
--
-- ─────────────────────────── WHY THIS EXISTS ────────────────────────────────
--
-- 20261203120000_changelog_highlights.sql built the table, the queue and the
-- strip, and left the WRITING to a person. Nobody wrote anything:
-- changelog_highlights held 0 rows on 2026-09-13, and the reader policy is
-- `status = 'approved'`, so the strip renders nothing and — with no writer
-- anywhere in the codebase — always would. What a Principal reads on
-- /whats-new today is still `fix(security): global record search bypassed RLS
-- — SECURITY DEFINER -> INVOKER (#3652)`, verbatim. That is the Director's
-- original complaint, unanswered by the plumbing built to answer it.
--
-- ──────────────────── THE RULING THAT CHANGED (2026-09-13) ──────────────────
--
-- The earlier migration records a Director ruling that AI must not write these
-- unreviewed, on accuracy grounds. He has since been shown that queue standing
-- empty and has REVERSED that specific clause: highlights publish unreviewed,
-- there is no approval step, because he wants zero ongoing work. He was shown
-- the accuracy risk again and chose this. So the writer below sets
-- status = 'approved' directly.
--
-- What did NOT change, and is the reason this is safe enough to ship:
--   • A super admin can still pull a bad line. The queue UI, the manage
--     permission and every write path from 20261203120000 are untouched — a
--     machine-written row is an ordinary row that a person can edit or set to
--     'skipped'.
--   • THE ORIGINAL DEVELOPER LINE RENDERS BENEATH EVERY HIGHLIGHT, in smaller
--     type (components/changelog/highlights-strip.tsx). This is the mitigation
--     that makes unreviewed text tolerable on a page whose purpose is teaching
--     people what they can do: every claim stays checkable against what
--     actually shipped, by the reader, at the moment they read it. It is a
--     requirement of this change, not a decoration.
--
-- ───────────────────────── WHY A `source` COLUMN ────────────────────────────
--
-- changelog_highlights_review_stamp requires that a non-draft row name its
-- reviewer: `status <> 'draft' AND reviewed_at IS NOT NULL AND reviewed_by IS
-- NOT NULL`. An AI-written 'approved' row has no reviewer. The cheap way past
-- that constraint is to stamp it with the seat owner's profile id — which
-- would write, into the platform's own audit trail, that a named human read
-- and approved a sentence no human has seen. That is a worse defect than the
-- one it works around, and it is undetectable afterwards.
--
-- So the constraint is widened HONESTLY instead: a row declares who wrote it,
-- and an 'ai' row is approved carrying NO review stamp at all. The human path
-- is bit-for-bit unchanged — a 'human' row still cannot be approved without
-- naming its reviewer. `source` is also what the strip reads to decide whether
-- to caption the original line "what the developer wrote".
--
-- A person who later edits a machine-written row through the queue takes it
-- over: the route stamps their id, and source flips to 'human' (the row is now
-- theirs). That transition is the app's, not this file's; the constraint
-- permits it in either direction and neither state is ambiguous.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

-- ── 1. Who wrote this highlight ─────────────────────────────────────────────
-- DEFAULT 'human' is the honest backfill: every row that exists when this
-- applies was typed by a person through the queue (in practice there are none,
-- which is the defect this migration answers, but the default must be right
-- for the case where someone has since written one).
ALTER TABLE public.changelog_highlights
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'human';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_source_check'
  ) THEN
    ALTER TABLE public.changelog_highlights
      ADD CONSTRAINT changelog_highlights_source_check
      CHECK (source IN ('human', 'ai'));
  END IF;
END
$$;

COMMENT ON COLUMN public.changelog_highlights.source IS
  '''human'' — typed and approved by a person through the highlights queue. '
  '''ai'' — written by the whats_new.highlight_draft Max-lane job and published '
  'unreviewed (Director ruling 2026-09-13). An ''ai'' row carries NO review '
  'stamp, because nobody reviewed it; the strip renders the original developer '
  'line beneath it so every claim stays checkable.';

-- ── 2. The review stamp, widened for machine authorship ─────────────────────
-- Three permitted states, and nothing else:
--   draft            — no stamp yet (unchanged).
--   non-draft human  — reviewed_at AND reviewed_by, both present (unchanged).
--   non-draft ai     — NEITHER present. Not "optional": forbidden. A machine
--                      row that carried a stamp would be claiming a review that
--                      did not happen, which is the exact failure this design
--                      refuses, so the constraint makes it unrepresentable
--                      rather than merely discouraged.
ALTER TABLE public.changelog_highlights
  DROP CONSTRAINT IF EXISTS changelog_highlights_review_stamp;

ALTER TABLE public.changelog_highlights
  ADD CONSTRAINT changelog_highlights_review_stamp CHECK (
    (status = 'draft' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status <> 'draft' AND source = 'human'
        AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    OR (status <> 'draft' AND source = 'ai'
        AND reviewed_at IS NULL AND reviewed_by IS NULL)
  );

-- NOTE on the draft leg: the original constraint checked only `reviewed_at IS
-- NULL` for drafts, leaving a draft free to name a reviewer who had not
-- reviewed it. Tightened to both columns here because this file is already
-- rewriting the constraint and the looser leg has no user — the PUT route
-- writes the pair together or writes neither.

-- ── 3. The job type ─────────────────────────────────────────────────────────
-- prompt_template is the bare '{{prompt}}' slot, matching ai_pulse.domain_starter
-- and every other cron-fed type on this lane: the runner substitutes exactly one
-- slot from payload.prompt, so the caller assembles the whole thing.
--
-- The prompt itself therefore lives in lib/changelog/highlight-prompt.ts rather
-- than in this row, and that is the deciding reason rather than a convention:
-- a prompt in TypeScript is reachable by vitest, so the rules that matter —
-- name the ROLE never a person, strip the fix(scope): prefix and the (#1234),
-- refuse rather than invent when a change has no user-visible effect — are
-- asserted by __tests__/lib/changelog/highlight-prompt.test.ts on every PR. A
-- prompt in a migration is asserted by nothing.
--
-- ENABLED = TRUE, deliberately, and for the same reason 20260825030200 gives:
-- applying this migration is itself the Director-gated go, and nothing runs
-- until the cron is scheduled. Shipping it dark would add a second switch with
-- no second decision behind it.
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key)
SELECT
  'whats_new.highlight_draft',
  'What''s New · Plain-English Highlight Writer',
  'Rewrites one shipped change into the three lines a non-developer reads on /whats-new: '
  'a headline in plain English, who it affects (a ROLE, never a person), and what they can '
  'do now and where. Fed by the whats-new-highlight-drafts cron from the deterministic '
  'selection in lib/changelog/highlights.ts; the prompt is assembled in '
  'lib/changelog/highlight-prompt.ts and carries the commit subject, the module''s human '
  'label and the author''s display name — never a sha, never a module key. Output lands in '
  'ai_jobs.result and the same cron files it as a changelog_highlights row with '
  'source = ''ai'' and status = ''approved'' (published unreviewed, Director ruling '
  '2026-09-13). The original developer line renders beneath it on the page.',
  '{{prompt}}',
  'none', 'job.result',
  false,          -- interactive: enqueued by the cron, never the chat drain
  'max', 'seat_owner', 3,
  false,          -- schedulable: vercel.json is the clock, not this row
  true,           -- enabled: the apply of this migration is the go (see above)
  '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb,
  30, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal page, never B2A-reachable
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'whats_new.highlight_draft'
);

-- ── 4. Version-1 champion (house convention: every slot-only type carries
--      exactly one ai_prompt_versions row — verified across all 10 on prod
--      2026-09-13). WHERE NOT EXISTS, never ON CONFLICT. ────────────────────
INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
SELECT t.job_type,
       1,
       t.prompt_template,
       'champion',
       'seed: slot-only template; the assembled prompt lives in lib/changelog/highlight-prompt.ts',
       'migration:20261203180000'
  FROM public.ai_job_types t
 WHERE t.job_type = 'whats_new.highlight_draft'
   AND t.prompt_template IS NOT NULL
   AND btrim(t.prompt_template) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = t.job_type
   );

-- ── 5. Assertions — the end state, checked rather than assumed ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_job_types
     WHERE job_type = 'whats_new.highlight_draft'
       AND lane = 'max' AND enabled AND output_target = 'job.result'
       AND prompt_template = '{{prompt}}'
  ) THEN
    RAISE EXCEPTION 'whats_new.highlight_draft is not registered on the enabled max lane';
  END IF;

  -- The widened constraint must mention `source` — without that leg a machine
  -- written approved row cannot exist and the writer silently files nothing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.changelog_highlights'::regclass
       AND conname  = 'changelog_highlights_review_stamp'
       AND pg_get_constraintdef(oid) LIKE '%source%'
  ) THEN
    RAISE EXCEPTION 'the review stamp constraint was not widened for source';
  END IF;

  -- ...and anon must still not be able to read the table (the 20261203120000
  -- guarantee, re-asserted because this file touched the table).
  IF has_table_privilege('anon', 'public.changelog_highlights', 'SELECT') THEN
    RAISE EXCEPTION 'changelog_highlights is readable by anon';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
