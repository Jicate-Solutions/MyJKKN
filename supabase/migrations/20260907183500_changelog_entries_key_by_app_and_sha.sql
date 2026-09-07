-- What's New — a commit hash is unique inside ONE repository, not across ten.
--
-- WHY: the Director ruled on 2026-09-07 that the changelog becomes "one shared
-- list, seen from every app", read by every Application Hub app that holds an
-- API key. The read side is being built first, but the KEY has to move now.
--
-- 20260906090000_changelog_live_data.sql created changelog_entries with
-- `sha text NOT NULL UNIQUE` — unique across the whole table. That is correct
-- for exactly one writer and wrong for two. A short commit hash identifies a
-- commit within its own repository and nowhere else; the width here is twelve
-- hex characters, chosen because the odds of two commits colliding inside a
-- SINGLE repository already reach roughly one in four by twelve thousand
-- commits. Point a second application's history at this table and a collision
-- stops being a risk and becomes an expectation: an unrelated change in another
-- app overwrites an entry here through ON CONFLICT DO UPDATE, with no error
-- raised and no trace left behind.
--
-- WHY NOW, WHILE IT IS FREE: both tables are empty — the sync job has never
-- run, so there are zero rows to re-key and this ALTER is instant. The same
-- change after the first sync means re-keying every entry; after a second
-- application has written, it means reconciling collisions that already
-- happened and cannot be distinguished from legitimate updates.
--
-- The companion code changes ship with this migration: the sync's upsert targets
-- the pair, its prune is scoped to its own app_key (unscoped, the first MyJKKN
-- sync after any second app starts writing would delete that app's entire
-- changelog), and the read path's keyset paging ends its sort on the real key.

-- Which application's history a row came out of. NOT NULL with a DEFAULT so the
-- MyJKKN sync need not name itself on each of its several thousand rows, while
-- no row can ever be app-less. On an empty table this rewrites nothing.
ALTER TABLE public.changelog_entries
  ADD COLUMN IF NOT EXISTS app_key text NOT NULL DEFAULT 'myjkkn';

-- The single-column key, by its Postgres-generated name. Dropped rather than
-- left in place: leaving it would keep the exact collision this migration
-- exists to remove, while the new pair constraint made the schema LOOK correct.
ALTER TABLE public.changelog_entries
  DROP CONSTRAINT IF EXISTS changelog_entries_sha_key;

ALTER TABLE public.changelog_entries
  ADD CONSTRAINT changelog_entries_app_key_sha_key UNIQUE (app_key, sha);

-- Deliberately NO index on app_key alone. There is one writer and one value
-- today, so an index over it would be read by nothing and maintained by every
-- sync. The constraint above already provides an index led by app_key, which is
-- what a future per-app read would use. Revisit when a second app writes.

-- No grant changes. SELECT is granted on the TABLE to `authenticated` and
-- revoked from `anon` by the creating migration; both are column-agnostic, so
-- the new column inherits exactly the access the rest of the row already has.
