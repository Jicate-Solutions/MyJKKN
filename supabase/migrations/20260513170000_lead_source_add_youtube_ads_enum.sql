-- ============================================================
-- Add 'youtube_ads' as a first-class lead_source enum value, and
-- migrate the existing custom master row (key='youtube_ads',
-- enum_value='other') to use the new enum.
-- ============================================================
-- Context (2026-05-13):
--   The 'youtube_ads' master row had enum_value='other', causing
--   the source dropdown to surface "Other" and "YouTube Ads" as
--   visually distinct entries that both write source='other' to
--   admission_leads. This collapses analytics + routing into one
--   miscellaneous bucket and is the wrong default for an admin-
--   curated source.
--
--   This migration promotes 'youtube_ads' to a first-class enum
--   value, matching the existing facebook_ads / google_ads
--   naming convention. Downstream chart palettes, badge colors,
--   and TS unions are updated in the same commit.
-- ============================================================

-- 1. Add the new enum value (idempotent via IF NOT EXISTS).
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'youtube_ads';

-- 2. The UPDATE that USES the new value must run in a separate
--    statement from the ALTER TYPE — Postgres requires the enum
--    value to be committed before any DML can reference it. The
--    migration runner splits statements by ';' so this is fine
--    when applied as a script, but apply_migration via MCP runs
--    the whole body in one transaction; the actual UPDATE is
--    issued in a follow-up MCP call (see the commit's task log).
