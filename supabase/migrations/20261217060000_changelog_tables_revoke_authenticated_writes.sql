-- Revoke UPDATE and DELETE from `authenticated` on every changelog table.
--
-- Supabase ships
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated
-- so every new table arrives with UPDATE and DELETE already held by every signed-in
-- account, SEPARATELY from any GRANT in the creating migration. The changelog
-- migrations revoked from anon and PUBLIC and granted SELECT to authenticated —
-- which does not narrow the default grant. Measured live 2026-09-15 05:10 IST:
--
--   has_table_privilege('authenticated','changelog_highlights','DELETE') = true
--   has_table_privilege('authenticated','changelog_entries',  'DELETE') = true
--   has_table_privilege('authenticated','changelog_modules',  'UPDATE') = true
--
-- RLS contains it today (no write policy exists for these roles), so this is
-- defence in depth, not an open hole. But `changelog_highlights` is the ONLY
-- review layer on 447 unreviewed AI write-ups, and the takedown guarantee on
-- `changelog_entries.hidden` rests on nobody being able to write the row.
-- A grant that RLS happens to block is a grant waiting for a policy to loosen.
--
-- The one changelog table already correct is `changelog_highlight_reports`,
-- whose migration named authenticated in its REVOKE after its own assertion
-- refused to apply the version that did not. This file brings the other four
-- to the same standard, and asserts it the same way.

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.changelog_entries, public.changelog_modules, public.changelog_sync,
     public.changelog_highlights
  FROM authenticated;

-- The sync job writes as its own role (never as authenticated), the highlight
-- writer runs as the service role, and super-admin takedowns go through the
-- service role too. Nothing legitimate loses a privilege here.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['changelog_entries','changelog_modules','changelog_sync','changelog_highlights']
  LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated still holds UPDATE or DELETE on %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon can read %', t;
    END IF;
  END LOOP;
  -- SELECT must survive: the page reads these as the signed-in user.
  IF NOT has_table_privilege('authenticated', 'public.changelog_entries', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on changelog_entries — the page would go dark';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
