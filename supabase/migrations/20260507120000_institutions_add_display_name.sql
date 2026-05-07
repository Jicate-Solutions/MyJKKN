-- ============================================================================
-- 20260507120000 — Add display_name column to public.institutions
-- ============================================================================
-- Adds an optional `display_name` to institutions so the UI / external API
-- consumers can render a friendlier label (e.g. abbreviation, branded name)
-- alongside the legal `name`. Mirrors the existing `display_name` pattern used
-- on degrees, departments and programs.
--
-- Behaviour:
--   - Nullable VARCHAR(255). Falls back to `name` at the read site.
--   - Applies to every entity_type (institution, admin_office, company, school).
-- ============================================================================

ALTER TABLE public.institutions
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

COMMENT ON COLUMN public.institutions.display_name IS
    'Optional friendly / abbreviated label rendered in UI lists, dropdowns and public APIs. Falls back to institutions.name when null.';
