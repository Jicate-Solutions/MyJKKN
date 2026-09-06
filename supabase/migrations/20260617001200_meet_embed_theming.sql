-- 20260617001200_meet_embed_theming.sql
--
-- Universal Booking M7 — "Embed + Theming" (Calendly parity:
-- "embed Calendly on a website" + "custom colors").
--
-- Adds a single per-host brand color to the public booking surface. The color
-- is applied as a CSS variable on:
--   • the embeddable widget at /embed/<handle> (iframe-friendly), and
--   • (optionally, future) the existing /meet/<handle> page.
--
-- DESIGN: one nullable additive column on the existing host-page row. No new
-- table, no new RPC. The public embed read reuses the SAME service-role read
-- path the /meet page uses (PublicHostService); the embed page layers a tiny
-- additive `theme_color` read on top — so the D20 bookability gate stays the
-- single source of truth and this migration cannot change who is bookable.
--
-- SECURITY: theme_color is a public-safe field (a hex string). Writes are
-- scoped to the signed-in host by the existing meeting_host_pages RLS policy
-- (host_profile_id = auth.uid()); this migration adds no new grants and no new
-- function, so there is no anon-execute surface to revoke.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded CHECK constraint.

-- ── theme_color: nullable hex string; UI applies a default when null. ───────
ALTER TABLE public.meeting_host_pages
  ADD COLUMN IF NOT EXISTS theme_color text;

COMMENT ON COLUMN public.meeting_host_pages.theme_color IS
  'M7: per-host brand color for the public booking widget / embed, stored as a '
  '#RRGGBB hex string. NULL = use the platform default (evergreen #0E4D34). '
  'Public-safe; surfaced to anon via the existing public read path.';

-- Validate the format so a malformed value can never reach a CSS variable
-- (defense against a stored value that breaks the iframe styling). Guarded so
-- re-running the migration does not error on the already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_host_pages_theme_color_hex_chk'
      AND conrelid = 'public.meeting_host_pages'::regclass
  ) THEN
    ALTER TABLE public.meeting_host_pages
      ADD CONSTRAINT meeting_host_pages_theme_color_hex_chk
      CHECK (theme_color IS NULL OR theme_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

-- PostgREST keeps a cached view of the schema; force a reload so the new
-- column is immediately visible to the REST/embed reads.
NOTIFY pgrst, 'reload schema';
