-- ============================================================================
-- 20260506100004 — Seed canonical aliases + re-run backfill for resolved rows
-- ============================================================================
-- Strategy: keep the canonical (code, name) immutable; add a second matching
-- pass via a normalized alias map. Re-run UPDATEs to pick up newly-matchable rows.
--
-- Coverage based on actual data_quality_review pending rows (2026-05-05):
--   quota:     GQ (351), GOVT (85), MQ (74), GOVERNMENT 7.5% (12), GQ 7.5 (8),
--              7.5 (7), LAPSE (36), FG (8), COUNSELLING (1), PMSS (1)
--   community: SC (A) (155)
-- Unmapped (left as 'pending' for admin DQR review):
--   LAPSE, FG, COUNSELLING, PMSS, NOT SPECIFIED, DNC, BC-CC, blank rows
-- ============================================================================

-- Quota aliases
WITH alias_map(observed_normalized, canonical_code) AS (
  VALUES
    ('gq',                    'government'),
    ('mq',                    'management'),
    ('govt',                  'government'),
    ('government 7.5%',       'government'),
    ('gq 7.5',                'government'),
    ('7.5',                   'government')
)
UPDATE public.learners_profiles lp
   SET quota_id   = q.id,
       updated_at = now()
  FROM public.quotas q
  JOIN (SELECT * FROM alias_map) am ON am.canonical_code = q.code
 WHERE lp.quota IS NOT NULL
   AND lp.quota_id IS NULL
   AND lower(trim(lp.quota)) = am.observed_normalized;

-- Community aliases
WITH alias_map(observed_normalized, canonical_code) AS (
  VALUES
    ('sc (a)',  'sca'),
    ('sc(a)',   'sca'),
    ('bcm',     'bcm')
)
UPDATE public.learners_profiles lp
   SET community_category_id = c.id,
       updated_at             = now()
  FROM public.community_categories c
  JOIN (SELECT * FROM alias_map) am ON am.canonical_code = c.code
 WHERE lp.community IS NOT NULL
   AND lp.community_category_id IS NULL
   AND lower(trim(lp.community)) = am.observed_normalized;

-- Mark resolved DQR rows as 'mapped'
UPDATE public.data_quality_review
   SET review_status = 'mapped',
       updated_at    = now()
 WHERE review_status = 'pending'
   AND table_name    = 'learners_profiles'
   AND (
     (column_name = 'quota'     AND lower(trim(observed_value))
        IN ('gq','mq','govt','government 7.5%','gq 7.5','7.5'))
     OR (column_name = 'community' AND lower(trim(observed_value))
        IN ('sc (a)','sc(a)'))
   );
