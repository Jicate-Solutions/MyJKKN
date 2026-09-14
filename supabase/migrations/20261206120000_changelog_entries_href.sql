-- What's New — keep WHERE a change happened, so the reader can go and use it.
--
-- Director, 2026-09-13: "a normal user by reading what is there in the what's
-- new page will not be able to see where that change has happened unless if
-- there is some link to be clickable which takes him directly to the page where
-- he can start using it, checking it out, trying it out."
--
-- WHY THE COLUMN DID NOT EXIST. The page rendered exactly ONE link — the
-- module's own `href`, from changelog_modules, and only once the reader had
-- already filtered the list down to that module. Scrolling the timeline,
-- nothing was clickable. changelog_modules.href has existed since the table was
-- built (65 of 67 rows carry one) and the entry list never used it at all.
--
-- WHAT GOES IN IT. An in-app path — `/hr/admin/recruitment-need/norms` —
-- derived by scripts/generate-changelog.mjs from the page files each commit
-- touched. Next.js's App Router makes that mapping total rather than a guess:
-- under app/(routes), the directory IS the URL. Measured against jicate/main on
-- 2026-09-13, over 4,951 entries: 1,304 (26%) get their own screen, 3,443 (70%)
-- fall back to the module's href, 204 (4%) have neither because their module has
-- no href of its own (`platform` and `cohort-programmes`).
--
-- NULLABLE, and that is the ordinary case rather than a gap to be filled later.
-- Three quarters of user-facing commits touch no page file at all — a migration,
-- a service, a cron route, a component shared by six screens — and there is no
-- honest single URL for those. NULL means "the module's href is the best we
-- have", which is a real answer the page renders, not a missing value.
--
-- NO BACKFILL JOB, for the same reason entry_at had none: the sync re-reads the
-- WHOLE git history on every run, so the first run after this ships fills href
-- for every row that has one by ordinary upsert. A separate backfill would be a
-- second writer deriving the same value from the same history, and two writers
-- of one column can only ever disagree.
--
-- NOT A PERMISSION BOUNDARY, and must never be mistaken for one. Which entries a
-- reader can see is already decided server-side by fn_changelog_visible_modules()
-- (20261123090000_changelog_visible_modules.sql), so a link only ever appears on
-- a row that reader was already allowed to read. A deep path INSIDE such a
-- module may still carry its own finer permission, and that is fine and needs
-- nothing here: the target page states its own access. What this column must not
-- become is a second, weaker copy of that decision.
--
-- INDEXES AND ORDERING ARE UNTOUCHED. href is display data. Nothing sorts,
-- windows or pages on it.

ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS href text;

COMMENT ON COLUMN public.changelog_entries.href IS
  'In-app path to the screen this change happened on, e.g. /hr/admin/recruitment-need/norms. '
  'Derived by scripts/generate-changelog.mjs from the static app/(routes) page files the commit '
  'touched, and only when that page still exists at the synced ref — a link to a deleted screen '
  'is worse than none. NULL when the commit touched no page, touched only a dynamic route '
  '([id]), or its page has since been removed; the reader then falls back to '
  'changelog_modules.href. Display data only: it is not an access rule and nothing orders on it.';

-- Re-asserted, not assumed — the same three statements every changelog migration
-- carries. Supabase's default privileges hand `anon` access to objects in the
-- public schema, and this table exists in a database rather than in public/*.json
-- precisely because the file version was readable on the open internet with no
-- session (measured against www.jkkn.ai, 2026-09-06). A column addition grants
-- nothing by itself, so these are idempotent no-ops against the current state —
-- which is the point: the intended grant is stated on the same page as the
-- schema change.
REVOKE ALL ON public.changelog_entries FROM anon, PUBLIC;
GRANT SELECT ON public.changelog_entries TO authenticated;
