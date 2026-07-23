-- ============================================================================
-- 20260516130200 — Backfill community_category_id from community TEXT
-- ============================================================================
-- Phase 5 of the admitted+legacy fee-structure backfill plan. For the small
-- subset of admitted+legacy learners that have a non-empty community TEXT but
-- a NULL community_category_id FK, resolve the FK using the same case-
-- insensitive match the shadow-FK trigger uses (20260507100012).
--
-- After this runs, any learner that flips from missing_fields to tier1_ready
-- (because community was the only gap) becomes auto-resolvable by Phase 6.
--
-- Why this is needed: the earlier one-time backfill in 20260507100012 only
-- handled rows present at that migration's time. Newer rows or rows whose
-- community TEXT was later edited can still drift to a NULL FK. This is a
-- safe, idempotent re-run scoped to the 491-row backfill universe.
-- ============================================================================

WITH candidates AS (
    SELECT lp.id, lp.community
      FROM public.learners_profiles lp
     WHERE lp.lifecycle_status        = 'admitted'
       AND lp.legacy_fee_mode         = true
       AND lp.community_category_id   IS NULL
       AND lp.community               IS NOT NULL
       AND TRIM(lp.community)         <> ''
),
matched AS (
    UPDATE public.learners_profiles lp
       SET community_category_id = c.id,
           updated_at = now()
      FROM public.community_categories c
     WHERE lp.id IN (SELECT id FROM candidates)
       AND lp.community_category_id IS NULL
       AND (LOWER(c.code) = LOWER(TRIM(lp.community))
            OR LOWER(c.name) = LOWER(TRIM(lp.community)))
    RETURNING lp.id
)
SELECT
    (SELECT COUNT(*) FROM candidates) AS candidates_total,
    (SELECT COUNT(*) FROM matched)    AS rows_updated;
