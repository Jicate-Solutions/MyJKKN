-- ============================================================================
-- 20260507100013 — Full-coverage TEXT → FK migration for quota / community
-- on learners_profiles. Adds 3 missing canonical lookup rows, clears
-- unmappable TEXT values (with audit trail in data_quality_review), and
-- resolves the remaining mappable rows via direct FK assignment.
-- ============================================================================
-- Pre-state baseline: quota 49 unmapped (LAPSE 36, FG 8, GOVERNMENT 7.5% 2,
-- COUNSELLING 2, PMSS 1); community 236 unmapped (NOT SPECIFIED 215, DNC 19,
-- BC-CC 2); accommodation_type 0 unmapped.
--
-- Post-state: every row where TEXT is non-empty has FK populated. Original
-- unmappable values audited in data_quality_review.
--
-- Quirk: community is NOT NULL on learners_profiles, so unmappable values
-- like NOT SPECIFIED are cleared to '' (empty string) instead of NULL.
-- The shadow-FK trigger from migration 20260507100012 leaves FK as NULL when
-- TEXT is empty, which is the correct outcome.
-- ============================================================================

-- ───────────────────── Phase 1: Add missing canonical rows ─────────────────────

INSERT INTO public.quotas (code, name, sort_order, is_active)
VALUES ('government_7_5', 'Government 7.5% Quota', 35, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.community_categories (code, name, sort_order, is_active)
VALUES
    ('dnc',   'DNC (Denotified Tribe)', 75, true),
    ('bc_cc', 'BC-CC',                  85, true)
ON CONFLICT (code) DO NOTHING;

-- ───────────────────── Phase 2: Audit + clear unmappable ─────────────────────

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count, review_status, review_notes)
SELECT 'learners_profiles', 'quota', UPPER(TRIM(quota)), COUNT(*),
       'ignored',
       'Cleared to NULL during 2026-05-07 migration — value is not a quota (status / scholarship code / lapse marker)'
  FROM public.learners_profiles
 WHERE UPPER(TRIM(quota)) IN ('LAPSE', 'FG', 'PMSS', 'COUNSELLING')
 GROUP BY UPPER(TRIM(quota))
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET review_status = EXCLUDED.review_status,
       review_notes  = EXCLUDED.review_notes,
       occurrence_count = EXCLUDED.occurrence_count,
       updated_at = now();

UPDATE public.learners_profiles
   SET quota = NULL
 WHERE UPPER(TRIM(quota)) IN ('LAPSE', 'FG', 'PMSS', 'COUNSELLING');

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count, review_status, review_notes)
SELECT 'learners_profiles', 'community', UPPER(TRIM(community)), COUNT(*),
       'ignored',
       'Cleared to empty string during 2026-05-07 migration — placeholder text, not a real community. NOT NULL constraint prevents true NULL.'
  FROM public.learners_profiles
 WHERE UPPER(TRIM(community)) = 'NOT SPECIFIED'
 GROUP BY UPPER(TRIM(community))
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET review_status = EXCLUDED.review_status,
       review_notes  = EXCLUDED.review_notes,
       occurrence_count = EXCLUDED.occurrence_count,
       updated_at = now();

UPDATE public.learners_profiles
   SET community = ''
 WHERE UPPER(TRIM(community)) = 'NOT SPECIFIED';

-- ───────────────────── Phase 3: Resolve remaining mappable rows ─────────────────────

UPDATE public.learners_profiles lp
   SET quota_id = (SELECT id FROM public.quotas WHERE code = 'government_7_5')
 WHERE lp.quota_id IS NULL
   AND UPPER(TRIM(lp.quota)) = 'GOVERNMENT 7.5%';

UPDATE public.learners_profiles lp
   SET community_category_id = (SELECT id FROM public.community_categories WHERE code = 'dnc')
 WHERE lp.community_category_id IS NULL
   AND UPPER(TRIM(lp.community)) = 'DNC';

UPDATE public.learners_profiles lp
   SET community_category_id = (SELECT id FROM public.community_categories WHERE code = 'bc_cc')
 WHERE lp.community_category_id IS NULL
   AND UPPER(TRIM(lp.community)) = 'BC-CC';

UPDATE public.data_quality_review
   SET review_status = 'mapped',
       review_notes  = 'Resolved by 2026-05-07 migration — added canonical entry and back-resolved FK',
       mapped_to_id  = (SELECT id FROM public.quotas WHERE code = 'government_7_5'),
       updated_at    = now()
 WHERE table_name = 'learners_profiles' AND column_name = 'quota'
   AND UPPER(TRIM(observed_value)) = 'GOVERNMENT 7.5%';

UPDATE public.data_quality_review
   SET review_status = 'mapped',
       review_notes  = 'Resolved by 2026-05-07 migration — added canonical entry and back-resolved FK',
       mapped_to_id  = (SELECT id FROM public.community_categories WHERE code = 'dnc'),
       updated_at    = now()
 WHERE table_name = 'learners_profiles' AND column_name = 'community'
   AND UPPER(TRIM(observed_value)) = 'DNC';

UPDATE public.data_quality_review
   SET review_status = 'mapped',
       review_notes  = 'Resolved by 2026-05-07 migration — added canonical entry and back-resolved FK',
       mapped_to_id  = (SELECT id FROM public.community_categories WHERE code = 'bc_cc'),
       updated_at    = now()
 WHERE table_name = 'learners_profiles' AND column_name = 'community'
   AND UPPER(TRIM(observed_value)) = 'BC-CC';
