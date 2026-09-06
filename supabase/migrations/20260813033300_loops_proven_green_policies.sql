-- ============================================================================
-- Proven-green Tower semantics — recency thresholds as policy rows
-- File: 20260813033300_loops_proven_green_policies.sql
-- Date: 2026-08-13
--
-- WHY THIS EXISTS (config-not-code)
--   The Loop Control Tower (/admin/loops) now renders each registry loop with
--   a status that carries an EXPIRY DATE: green means "self-test proven within
--   N days", not "was green once". The two N values are Director-adjustable
--   dials, so they live as platform_policies rows — changing a value changes
--   Tower colors on the next page load, with no deploy.
--
--   * loops.proven_green.sim_max_age_days (30) — a loop's latest layer='sim'
--     audit (the Sunday regress routine's 'measure-verified' rows) counts as
--     proof only this many days; older, and GREEN decays to AMBER "unproven".
--   * loops.proven_green.walk_max_age_days (180) — display threshold for the
--     "last walked" (layer='walk' human audit) date. v1: information only,
--     NEVER part of the color algebra.
--
--   The page reads these scope_type='global' rows and falls back to the same
--   in-code defaults (30 / 180) when the rows are absent, so the UI is safe
--   before this migration is applied. Merging this PR applies NOTHING — the
--   apply is a separate Director-gated step, recorded in the ledger.
-- ============================================================================

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active, classification, publication_state)
SELECT
  'loops.proven_green.sim_max_age_days', 'global', NULL,
  '30'::jsonb,
  'Days a loop''s latest sim-layer audit (weekly regress, verdict=measure-verified) counts as proof on the Loop Control Tower. Older than this and the loop''s GREEN decays to AMBER "unproven". Tune without deploy.',
  'number', true, true, 'major', 'published'
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'loops.proven_green.sim_max_age_days');

INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active, classification, publication_state)
SELECT
  'loops.proven_green.walk_max_age_days', 'global', NULL,
  '180'::jsonb,
  'Days a loop''s latest walk-layer (human) audit is shown as current on the Loop Control Tower''s "last walked" line. v1: display threshold only — never part of the status color. Tune without deploy.',
  'number', true, true, 'major', 'published'
WHERE NOT EXISTS (SELECT 1 FROM platform_policies WHERE policy_key = 'loops.proven_green.walk_max_age_days');

NOTIFY pgrst, 'reload schema';
