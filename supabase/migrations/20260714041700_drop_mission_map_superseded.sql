-- =============================================================================
-- Drop the superseded `mission_map` table (cleanup paired with mission_pillars)
-- Added: 2026-07-14 · branch feat/mission-pillars-config
--
-- WHY THIS IS DESTRUCTIVE-BUT-SAFE:
-- `mission_map` was applied to prod out-of-band (13 rows) from the unmerged
-- branch feat/mission-pillar-map-configurable / PR #2038. The Director's
-- 2026-07-14 directive replaced it with the hardened `mission_pillars` table
-- (see 20260714041600). Closing that PR does NOT remove the live table, so
-- without this drop prod would carry a dead, anon-READABLE orphan (its SELECT
-- policy is `USING (true)`) with no code on main referencing it — verified:
--   • 0 code references to mission_map on jicate/main
--   • 0 foreign keys reference it, 0 views depend on it (only its own trigger)
--   • all 13 rows share ONE updated_at → a single seed, zero per-row edits;
--     content matches the approved draft (.claude/jkkn-pillar-map-draft.md,
--     which remains the source of truth). Nothing unique is lost.
-- CASCADE removes only the table's own trigger + policies.
-- =============================================================================

DROP TABLE IF EXISTS public.mission_map CASCADE;
