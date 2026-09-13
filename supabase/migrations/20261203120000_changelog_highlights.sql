-- What's New — the weekly highlights strip: a human-approved, plain-English
-- write-up of the handful of changes that actually affect the people who use
-- MyJKKN, sitting above the plain list of everything else.
--
-- THE COMPLAINT THIS ANSWERS (Director, 2026-09-12): the page "seems to be only
-- for developers and not understandable by the actual users who are non
-- developers and would like to know how it impacts them and how they can take
-- advantage of the new changes". He is describing a real property of the
-- pipeline rather than a matter of taste: lib/changelog/title-rules.mjs only
-- ever REMOVES things (isInternalEngineering, isContentFree, redactIdentifiers).
-- There is no rewriting step anywhere. What a Principal reads today is the
-- developer's commit subject, verbatim, prefix and pull-request number included.
--
-- HIS RULING ON HOW MUCH GETS WRITTEN WELL: "Highlights written well, rest left
-- plain." Each week the few changes that matter to a reader get a proper
-- write-up; everything else stays in the plain list underneath. He explicitly
-- REJECTED "AI rewrites everything, nobody checks" on accuracy grounds — on a
-- page people trust to learn the system, a confident wrong claim is worse than
-- a terse accurate one. So this table stores a DRAFT that renders nowhere until
-- a person has read it and approved it, and `status` is that gate.
--
-- ─────────────────────────── WHY A COMPANION TABLE ───────────────────────────
--
-- These four fields could have been columns on changelog_entries. They are not,
-- and the reason is the writer, not the shape:
--
--   1. changelog_entries is written ONLY by scripts/sync-changelog-db.mjs over
--      the service role, with `ON CONFLICT (app_key, sha) DO UPDATE`. Every
--      column it does not name is a column it could clobber on the next sync.
--      A human-written headline living in that row would be one careless
--      `DO UPDATE SET` away from being overwritten by a commit subject — which
--      is precisely the text it exists to replace.
--   2. The two have opposite write rules. Entries are service-role-only and
--      carry NO write policy at all, deliberately ("a missing policy is the
--      clearest possible statement that nothing else may write"). Highlights
--      are the one part of What's New a person types. Those cannot be the same
--      table's RLS.
--   3. The sync PRUNES: entries the title rules no longer produce are DELETEd.
--      Columns on that row would disappear with it silently. Here the deletion
--      is explicit — see the ON DELETE CASCADE note below.
--
-- The cost of the split is one join on the read path. That is paid in
-- app/api/whats-new/highlights/route.ts and in the reader policy below.
--
-- NOT multi-tenant, for the same reason changelog_entries is not: a product
-- change to MyJKKN happened once, for everyone. Scoping is by MODULE, and
-- therefore by permission namespace — not by institution.

-- ------------------------------------------------------------- highlights ----
CREATE TABLE IF NOT EXISTS public.changelog_highlights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifies the entry this writes up, on the SAME key changelog_entries is
  -- keyed by. A short commit hash is unique inside one repository and nowhere
  -- else (20260907183500_changelog_entries_key_by_app_and_sha.sql), so the pair
  -- is the only correct reference once a second application writes here.
  app_key     text NOT NULL DEFAULT 'myjkkn',
  sha         text NOT NULL,

  -- ── the three fields that make this a highlight rather than a restatement ──
  -- "What changed" alone is what the page already has, and is the problem.
  --
  -- headline — plain English. No `fix(scope):` prefix, no (#1234).
  -- affects  — who will notice, in the reader's own words ("Principals and HoDs").
  -- action   — what you can do now, and where on screen to find it.
  --
  -- All three are NULLable because a row is created as an empty draft the moment
  -- selection picks the entry, and is filled in afterwards. What they may not be
  -- is blank AND approved — see changelog_highlights_approved_is_complete below.
  headline    text,
  affects     text,
  action      text,

  -- The gate. Nothing but 'approved' ever reaches a reader; the read policy
  -- below enforces that in the database rather than in whatever the page
  -- remembers to filter on.
  --   draft    — selected, not yet read by a person
  --   approved — a person read it and published it
  --   skipped  — a person read it and decided it is not worth a write-up
  -- 'skipped' is kept rather than deleted so the next run of selection does not
  -- offer the same entry again, week after week.
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'approved', 'skipped')),

  -- One sentence saying why selection picked this entry, written by
  -- lib/changelog/highlights.ts at the moment it was picked. Stored rather than
  -- recomputed so that the approver sees the reason the CODE OF THE DAY gave,
  -- not the reason today's code would give — the rules will be tuned, and a
  -- queue that silently re-explains itself is a queue nobody can audit.
  selection_reason text,

  -- Who approved or skipped it, and when. NULL while it is still a draft.
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- One highlight per entry. The approval screen upserts on this.
  CONSTRAINT changelog_highlights_app_key_sha_key UNIQUE (app_key, sha),

  -- ON DELETE CASCADE, and it is a decision rather than a default. The sync
  -- DELETEs entries "the rules no longer produce" — tune title-rules.mjs so a
  -- commit is reclassified as internal engineering and its row goes. A
  -- highlight whose entry no longer exists has nothing to point at: it could
  -- not be shown (no module to scope it by, no date to file it under) and
  -- could not be re-approved. Cascading loses human-written text, which is
  -- real; leaving an orphan behind would instead leave a row that renders
  -- nowhere and that nobody can find to clean up. The lesser of the two is
  -- stated here rather than discovered later.
  CONSTRAINT changelog_highlights_entry_fk
    FOREIGN KEY (app_key, sha)
    REFERENCES public.changelog_entries (app_key, sha)
    ON UPDATE CASCADE ON DELETE CASCADE,

  -- An approved highlight is never blank. Without this, "approve" on an
  -- untouched draft would publish three empty lines above the plain list and
  -- the page would look broken to every reader, with nothing in the data to
  -- say which row did it. Draft and skipped rows are free to be empty, which
  -- is what they are when selection creates them.
  CONSTRAINT changelog_highlights_approved_is_complete CHECK (
    status <> 'approved'
    OR (
      btrim(COALESCE(headline, '')) <> ''
      AND btrim(COALESCE(affects, '')) <> ''
      AND btrim(COALESCE(action, '')) <> ''
    )
  ),

  -- A reviewed row names its reviewer, and an unreviewed one does not claim to
  -- have been reviewed. Keeps the audit trail from drifting on a partial write.
  CONSTRAINT changelog_highlights_review_stamp CHECK (
    (status = 'draft' AND reviewed_at IS NULL)
    OR (status <> 'draft' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

-- The strip reads only approved rows, and only ever for one week at a time, so
-- this is the whole hot path. Partial: drafts and skips are read by the
-- approval screen alone, which reads the table by joining from the entry side.
CREATE INDEX IF NOT EXISTS changelog_highlights_approved_idx
  ON public.changelog_highlights (app_key, sha) WHERE status = 'approved';

COMMENT ON TABLE public.changelog_highlights IS
  'Human-approved plain-English write-ups of selected changelog_entries rows. '
  'Nothing renders on /whats-new until status = ''approved''. '
  'Selection is deterministic (lib/changelog/highlights.ts); the writing and '
  'the approval are a person''s (Director ruling 2026-09-12).';

-- Repo-standard updated_at trigger; the function is created by
-- 20260524000000_hr_recruitment_need_foundation.sql and is idempotent there.
DROP TRIGGER IF EXISTS changelog_highlights_touch_updated_at ON public.changelog_highlights;
CREATE TRIGGER changelog_highlights_touch_updated_at
  BEFORE UPDATE ON public.changelog_highlights
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- -------------------------------------------------------------------- RLS ----
ALTER TABLE public.changelog_highlights ENABLE ROW LEVEL SECURITY;

-- READER. Two conditions, both of which are boundaries rather than display
-- rules, and both of which live here so that no route can forget them:
--
--   1. status = 'approved'. An unapproved draft is unreadable by anyone who is
--      not an approver — not hidden by the page, absent from the answer.
--   2. The entry it describes must be one this reader may see. That is decided
--      by fn_changelog_visible_modules(), the SAME function
--      app/api/whats-new/route.ts already uses for the plain list
--      (20261123090000_changelog_visible_modules.sql), so a highlight can never
--      surface a module whose entries are withheld. Restating the rule here in
--      any other form is the drift that function exists to prevent.
--
-- `NOT e.hidden` rides along for free: a takedown on the entry takes its
-- highlight with it, with no second list to maintain.
DROP POLICY IF EXISTS changelog_highlights_select_approved ON public.changelog_highlights;
CREATE POLICY changelog_highlights_select_approved ON public.changelog_highlights
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1
        FROM public.changelog_entries e
       WHERE e.app_key = changelog_highlights.app_key
         AND e.sha     = changelog_highlights.sha
         AND NOT e.hidden
         AND e.module_key = ANY (public.fn_changelog_visible_modules())
    )
  );

-- APPROVER. Reads every draft and writes every field. Gated on a permission
-- key, never on a role name — user_has_permission() carries the multi-role
-- OR-merge and the super-admin bypass, which is why every policy in this
-- database opens this way. No role holds whats_new.highlights.manage today, so
-- in practice this resolves to super admins until Role Management grants it.
--
-- PERMISSIVE, so it ORs with the reader policy above: an approver sees both
-- their drafts and the approved set, which is what the screen needs.
DROP POLICY IF EXISTS changelog_highlights_manage ON public.changelog_highlights;
CREATE POLICY changelog_highlights_manage ON public.changelog_highlights
  FOR ALL TO authenticated
  USING (public.user_has_permission('whats_new.highlights.manage'))
  WITH CHECK (public.user_has_permission('whats_new.highlights.manage'));

-- Belt and braces against Supabase's ALTER DEFAULT PRIVILEGES, which hands
-- `anon` a DIRECT grant on every new table, separate from PUBLIC — revoking
-- PUBLIC alone would leave this readable with the anon key that ships inside
-- every client bundle. No DELETE is granted to anyone: a highlight is retired
-- by setting status = 'skipped', never by removing the row, so that selection
-- does not offer the same entry again next week.
REVOKE ALL ON public.changelog_highlights FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.changelog_highlights TO authenticated;

-- ------------------------------------------------------------- assertions ----
-- The end state, checked rather than assumed. has_table_privilege reads the
-- EFFECTIVE privilege: anon is a member of PUBLIC, so an ACL can read as
-- revoked while anon still holds the grant through it.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.changelog_highlights', 'SELECT') THEN
    RAISE EXCEPTION 'changelog_highlights is readable by anon';
  END IF;
  IF NOT (
    SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.changelog_highlights'::regclass
  ) THEN
    RAISE EXCEPTION 'row level security is not enabled on changelog_highlights';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'changelog_highlights') <> 2 THEN
    RAISE EXCEPTION 'changelog_highlights should carry exactly 2 policies';
  END IF;
END
$$;
