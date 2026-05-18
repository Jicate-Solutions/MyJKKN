-- ============================================================================
-- 20260516130201 — Backfill community_category_id for "SC (A)" / "SC(A)" variants
-- ============================================================================
-- Phase 5b. Phase 5 (20260516130200) resolved community_category_id via exact
-- LOWER(code)/LOWER(name) match against community_categories. 9 admitted+legacy
-- rows used "SC (A)" as community TEXT — Tamil Nadu's Scheduled Caste —
-- Arundathiyar sub-category — but the canonical row has code='sca' (no
-- parens/spaces), so the strict match failed.
--
-- This migration normalizes by stripping spaces, parens, and underscores from
-- BOTH sides before comparing — same idea as the accommodation_type fuzzy
-- match in 20260507100012 line 47.
-- ============================================================================

WITH normalized_categories AS (
    SELECT id,
           REGEXP_REPLACE(LOWER(code), '[\s\(\)_-]+', '', 'g') AS norm_code,
           REGEXP_REPLACE(LOWER(name), '[\s\(\)_-]+', '', 'g') AS norm_name
      FROM public.community_categories
),
matched AS (
    UPDATE public.learners_profiles lp
       SET community_category_id = nc.id,
           updated_at = now()
      FROM normalized_categories nc
     WHERE lp.lifecycle_status        = 'admitted'
       AND lp.legacy_fee_mode         = true
       AND lp.community_category_id   IS NULL
       AND lp.community               IS NOT NULL
       AND TRIM(lp.community)         <> ''
       AND (
            nc.norm_code = REGEXP_REPLACE(LOWER(TRIM(lp.community)), '[\s\(\)_-]+', '', 'g')
         OR nc.norm_name = REGEXP_REPLACE(LOWER(TRIM(lp.community)), '[\s\(\)_-]+', '', 'g')
       )
    RETURNING lp.id, lp.community
)
-- Clean up the Phase 5 failure rows for any that we now resolved.
DELETE FROM public.learners_profile_fee_backfill_failures
WHERE resolution_status = 'phase5_community_backfill_unmatched'
  AND learner_id IN (SELECT id FROM matched);
