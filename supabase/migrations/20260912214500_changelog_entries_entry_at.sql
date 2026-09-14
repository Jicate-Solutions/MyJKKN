-- What's New — keep the TIME a change landed, not just the day.
--
-- Director, 2026-09-12: "can we also add time to the whatsnew so that we know
-- when the change happened."
--
-- WHY THE COLUMN DID NOT EXIST. The time was captured by git and thrown away by
-- us: scripts/generate-changelog.mjs read the committer date with
-- `--date=short`, truncating `2026-09-12 19:40:00 +0530` to `2026-09-12`, and
-- `entry_date` is typed `date`, so it could not have held a time even if the
-- generator had passed one. Both halves are fixed together — the generator now
-- reads `--date=iso-strict-local` under TZ=Asia/Kolkata, and this column is
-- where the result is kept.
--
-- entry_date STAYS, and is not redundant. Three things depend on day precision
-- and none of them is being moved: the sticky date headers on the page, the
-- 90-day recent/archive split (a date predicate in app/api/whats-new/route.ts),
-- and both partial indexes — changelog_entries_date_idx is
-- (entry_date DESC, ordinal ASC) and is what the read path's keyset cursor
-- seeks into. entry_at is strictly ADDITIONAL precision, not a replacement.
--
-- NULLABLE, deliberately, and with no backfill job. Every row already in the
-- table predates the column, and the sync re-reads the WHOLE git history on
-- every run — so the first run after this ships fills entry_at for all 4,933 of
-- them by ordinary upsert. A separate backfill would be a second writer of the
-- same value, deriving it from the same git history, and could only disagree.
-- Until that run, `at` is simply absent from the payload and the page shows the
-- date alone, which is exactly what it shows today.
--
-- NOT NULL is therefore wrong here even though every future row will have one:
-- it would make this migration unapplyable against the live table, which is the
-- table it exists for.
--
-- ORDERING IS UNCHANGED. The read path still orders by
-- (entry_date DESC, ordinal ASC, app_key ASC, sha DESC), and `ordinal` is still
-- what breaks a same-day tie. Switching the sort to entry_at would reorder the
-- entire page during the window between this deploy and the first sync — every
-- existing row NULL, every new row not — and would mean re-cutting the keyset
-- cursor in app/api/whats-new/route.ts, which is a separate change with its own
-- risk. `ordinal` is assigned per date in git's own order, so within a day it
-- already agrees with entry_at.

ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS entry_at timestamptz;

COMMENT ON COLUMN public.changelog_entries.entry_at IS
  'The instant the change landed on the production main branch (committer time, '
  'read in Asia/Kolkata). NULL for rows written before 2026-09-12; filled by the '
  'next sync. entry_date is this value''s IST day and remains the ordering and '
  'windowing key.';

-- Re-asserted, not assumed. Supabase's default privileges hand `anon` access to
-- objects in the public schema, and this table's whole reason for existing in a
-- database rather than in public/*.json is that the file version was readable on
-- the open internet with no session (measured against www.jkkn.ai, 2026-09-06).
-- A column addition does not itself grant anything, so these three statements
-- are idempotent no-ops against the current state — which is the point: they
-- state the intended grant on the same page as the schema change, so a reader
-- does not have to go and check.
REVOKE ALL ON public.changelog_entries FROM anon, PUBLIC;
GRANT SELECT ON public.changelog_entries TO authenticated;
