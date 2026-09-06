-- Backfill accommodation_type_id from the accommodation_type TEXT (institution-
-- scoped) for stale/missing FK rows, ahead of retiring the text column. Matches
-- by code/name with the same normalisations the shadow-FK trigger uses.
-- Genuinely unmappable values (orphan/typo) are left as-is (text dropped later).
UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type IS NOT NULL AND TRIM(lp.accommodation_type) <> ''
   AND lp.institution_id IS NOT NULL
   AND a.institution_id = lp.institution_id
   AND (LOWER(a.code) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(a.name) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.code, '_', ' ')) = LOWER(TRIM(lp.accommodation_type))
        OR LOWER(REPLACE(a.name, ' ', '')) = LOWER(REPLACE(TRIM(lp.accommodation_type), ' ', '')))
   AND lp.accommodation_type_id IS DISTINCT FROM a.id;
