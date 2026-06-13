-- ============================================================================
-- 20260602171000 — Repair drifted quota_id / community_category_id on
-- learners_profiles (FK backfill from authoritative TEXT).
-- ============================================================================
-- Root cause: the 20260507100012 shadow-FK trigger only populated FK columns
-- when they were NULL. Editing the quota/community TEXT after the FK was set
-- left the FK stale (pointing at the previously-selected lookup row). The
-- 20260523160000 fix corrected the trigger AND repaired accommodation_type_id,
-- but its one-time backfill SKIPPED quota_id and community_category_id.
--
-- Result: 17 learners had quota_id pointing at the OPPOSITE quota from their
-- text (e.g. text 'MANAGEMENT' but quota_id = Government Quota), and 11 had the
-- same drift on community. The Move-to-Account dialog + fee matrix resolve by
-- FK, so they matched the wrong / no fee structure. (Reported case:
-- DHARUN N.M, JKKN-CAS-1896 — text MANAGEMENT, FK was Government Quota.)
--
-- This migration: (1) re-resolves quota_id / community_category_id from the
-- authoritative TEXT for drifted rows, and (2) backfills quota_id for rows whose
-- TEXT is a known abbreviation (GQ / MQ / GOVT / 7.5 variants) that the exact
-- code/name match never caught. Genuine junk values ('-', a stray phone number)
-- are intentionally left NULL and reported separately.
--
-- Data-only repair; no schema change. Trigger already fixed (20260523160000).
-- ============================================================================

-- 1a. Re-resolve quota_id where TEXT exactly matches a quota code/name but the
--     stored FK disagrees (the 17 inverted rows; also fills any exact-match NULLs).
UPDATE public.learners_profiles lp
   SET quota_id = q.id
  FROM public.quotas q
 WHERE lp.quota IS NOT NULL AND TRIM(lp.quota) <> ''
   AND (LOWER(q.code) = LOWER(TRIM(lp.quota)) OR LOWER(q.name) = LOWER(TRIM(lp.quota)))
   AND lp.quota_id IS DISTINCT FROM q.id;

-- 1b. Backfill quota_id for NULL-FK rows using a curated abbreviation alias map.
UPDATE public.learners_profiles lp
   SET quota_id = q.id
  FROM (VALUES
      ('gq',              'government'),
      ('govt',            'government'),
      ('mq',              'management'),
      ('government 7.5%', 'government_7_5'),
      ('7.5 quota',       'government_7_5'),
      ('gq 7.5',          'government_7_5'),
      ('gq -7.5',         'government_7_5'),
      ('gq(7.5)',         'government_7_5'),
      ('qq(7.5)',         'government_7_5')
  ) AS alias(text_value, quota_code)
  JOIN public.quotas q ON q.code = alias.quota_code
 WHERE lp.quota_id IS NULL
   AND LOWER(TRIM(lp.quota)) = alias.text_value;

-- 2. Re-resolve community_category_id from authoritative TEXT for drifted rows
--    (same forgotten-backfill bug; 11 rows).
UPDATE public.learners_profiles lp
   SET community_category_id = c.id
  FROM public.community_categories c
 WHERE lp.community IS NOT NULL AND TRIM(lp.community) <> ''
   AND (LOWER(c.code) = LOWER(TRIM(lp.community)) OR LOWER(c.name) = LOWER(TRIM(lp.community)))
   AND lp.community_category_id IS DISTINCT FROM c.id;
