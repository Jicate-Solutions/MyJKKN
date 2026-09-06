-- What's New — move the changelog off a committed file and into the database.
--
-- WHY: the page's entries shipped as a JSON file generated at build time. That
-- made the page only as current as the last commit of that file, needed a daily
-- pull request to stay fresh, and meant a "refresh" button was impossible — the
-- running server has no git repository and a read-only filesystem. Holding the
-- entries here makes the page live: a sync job writes rows, the page reads them,
-- and nothing has to be merged or deployed for new entries to appear.
--
-- WRITES ARE SERVICE-ROLE ONLY. The rows are derived from git history by
-- .github/workflows/whats-new-refresh.yml; nobody types them, so no human-facing
-- write policy exists. Reads are open to any signed-in user, which is the
-- Director's decision of 2026-09-05 ("everyone who signs in"). Which entries a
-- reader actually SEES is decided in the page from their permissions — that is a
-- display rule, not an access boundary, and is documented as such in
-- app/api/whats-new/route.ts.
--
-- NOT multi-tenant. Deliberately no institution_id: a product change to MyJKKN
-- happened once, for everyone. Scoping is by MODULE (and therefore by permission
-- namespace), not by institution.

-- ---------------------------------------------------------------- modules ----
-- The dictionary the page joins against: a module's display name, the permission
-- namespace(s) that gate it, and where to send a reader who wants to open it.
CREATE TABLE IF NOT EXISTS public.changelog_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  label       text NOT NULL,
  -- NULL means platform-wide (sign-in, navigation, speed): everyone signed in
  -- sees it. An array because a module can span namespaces, e.g. Users & Roles.
  perm        text[],
  href        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- entries ----
CREATE TABLE IF NOT EXISTS public.changelog_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The short commit sha. Natural key for the sync: re-running it must update in
  -- place, never duplicate.
  sha           text NOT NULL UNIQUE,
  -- The date the change reached production's main branch (committer date, not
  -- author date — a rebased commit was written earlier than it landed).
  entry_date    date NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('new', 'fixed', 'faster', 'security')),
  module_key    text NOT NULL REFERENCES public.changelog_modules(key) ON UPDATE CASCADE,
  subject       text NOT NULL,
  author        text NOT NULL,
  pr_number     integer,
  breaking      boolean NOT NULL DEFAULT false,
  -- The takedown route (Director, 2026-09-06). Replaces the hidden.mjs file:
  -- hiding an entry is now a row update, not a code change and a rebuild.
  hidden        boolean NOT NULL DEFAULT false,
  hidden_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The page reads newest-first, and filters by module. Both are covered here; the
-- partial index keeps hidden rows out of the hot path entirely.
CREATE INDEX IF NOT EXISTS changelog_entries_date_idx
  ON public.changelog_entries (entry_date DESC) WHERE NOT hidden;
CREATE INDEX IF NOT EXISTS changelog_entries_module_idx
  ON public.changelog_entries (module_key) WHERE NOT hidden;

-- ------------------------------------------------------------------- sync ----
-- One row. Lets the page say how old the list is, and lets a super admin see
-- whether the refresh they just asked for has actually landed.
CREATE TABLE IF NOT EXISTS public.changelog_sync (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton      boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  last_synced_at timestamptz,
  last_ref       text,
  entry_count    integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.changelog_sync (singleton) VALUES (true) ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------- RLS ----
ALTER TABLE public.changelog_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog_sync    ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user. NOT anon — the whole point of the move away from
-- public/*.json was that the file was readable on the open internet.
DROP POLICY IF EXISTS changelog_modules_select ON public.changelog_modules;
CREATE POLICY changelog_modules_select ON public.changelog_modules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS changelog_entries_select ON public.changelog_entries;
CREATE POLICY changelog_entries_select ON public.changelog_entries
  FOR SELECT TO authenticated USING (NOT hidden);

DROP POLICY IF EXISTS changelog_sync_select ON public.changelog_sync;
CREATE POLICY changelog_sync_select ON public.changelog_sync
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy anywhere on purpose: every write comes from the
-- sync job over the service role, which bypasses RLS. A missing policy is the
-- clearest possible statement that nothing else may write.

-- Belt and braces against Supabase's default grant to anon on new objects.
REVOKE ALL ON public.changelog_modules FROM anon;
REVOKE ALL ON public.changelog_entries FROM anon;
REVOKE ALL ON public.changelog_sync    FROM anon;
GRANT SELECT ON public.changelog_modules TO authenticated;
GRANT SELECT ON public.changelog_entries TO authenticated;
GRANT SELECT ON public.changelog_sync    TO authenticated;
