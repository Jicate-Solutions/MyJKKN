-- Accommodation FK prep (campus-living-critical):
-- 1. Backfill remaining accommodation_type typos to FK ids (institution-scoped)
--    so no hosteler/day-scholar is lost when the text column is dropped.
--    HOSTELLER→hostel (load-bearing for the hosteler gate), DAYSCHO*→dayscholar,
--    NA→not_applicable. After this, accommodation_type_id is 100% populated.
-- 2. user_is_hosteler: drop the legacy TEXT fallback (OR accommodation_type
--    ILIKE 'hostel%'); rely on the FK (acc.code='hostel') only. Verified the
--    FK-based hosteler set equals the old text-or-FK set (896 = 896).
UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type_id IS NULL
   AND lp.institution_id IS NOT NULL
   AND a.institution_id = lp.institution_id
   AND (
        (UPPER(TRIM(lp.accommodation_type)) = 'HOSTELLER' AND a.code = 'hostel')
     OR (UPPER(TRIM(lp.accommodation_type)) IN ('DAYSCHOALAR','DAYSCHOLER','DAYSSCHOLAR') AND a.code = 'dayscholar')
     OR (UPPER(TRIM(lp.accommodation_type)) = 'NA' AND a.code = 'not_applicable')
   );

CREATE OR REPLACE FUNCTION public.user_is_hosteler()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM learners_profiles lp
    LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE lp.id = public.get_my_learner_id()
      AND acc.code = 'hostel'
  );
$function$;
