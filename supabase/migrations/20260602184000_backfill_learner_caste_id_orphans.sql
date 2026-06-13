-- Backfill caste_id for rows that have caste text but no caste_id, in
-- preparation for retiring the caste TEXT column. Caste names/aliases are
-- ambiguous (duplicate names across castes), so disambiguate by the row's
-- community_category_id. Pass 1: exact name + same community. Pass 2: alias +
-- same community. Genuinely unmappable values (typos / not in the castes table)
-- are intentionally left NULL (caste is nullable).

UPDATE public.learners_profiles lp
   SET caste_id = (
        SELECT c.id FROM public.castes c
         WHERE LOWER(c.name) = LOWER(TRIM(lp.caste))
           AND c.community_category_id = lp.community_category_id
         ORDER BY c.id LIMIT 1)
 WHERE TRIM(COALESCE(lp.caste,'')) <> '' AND lp.caste_id IS NULL
   AND EXISTS (SELECT 1 FROM public.castes c
                WHERE LOWER(c.name) = LOWER(TRIM(lp.caste))
                  AND c.community_category_id = lp.community_category_id);

UPDATE public.learners_profiles lp
   SET caste_id = (
        SELECT c.id FROM public.castes c
         WHERE LOWER(TRIM(lp.caste)) = ANY(SELECT LOWER(x) FROM unnest(c.aliases) x)
           AND c.community_category_id = lp.community_category_id
         ORDER BY c.id LIMIT 1)
 WHERE TRIM(COALESCE(lp.caste,'')) <> '' AND lp.caste_id IS NULL
   AND EXISTS (SELECT 1 FROM public.castes c
                WHERE LOWER(TRIM(lp.caste)) = ANY(SELECT LOWER(x) FROM unnest(c.aliases) x)
                  AND c.community_category_id = lp.community_category_id);
