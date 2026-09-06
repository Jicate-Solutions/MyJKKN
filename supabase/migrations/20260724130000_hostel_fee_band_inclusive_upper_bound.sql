-- Academic Fee Band was HALF-OPEN: [fee_min, fee_max) — fee_min inclusive,
-- fee_max EXCLUSIVE (p_fee < e.fee_max). So a learner whose fee equalled the
-- band's max was NOT matched (e.g. band 300000-450000 excluded a fee of exactly
-- 450000), which forced the awkward "…325001 / 399999…" +/-1 boundary tricks.
--
-- Make the band CLOSED [fee_min, fee_max] — both ends inclusive
-- (p_fee >= fee_min AND p_fee <= fee_max) so admins can enter plain values and
-- have both the start and end fee taken. Existing rules with +1 maxes still work
-- (they now also include their exact max, a harmless 1-rupee edge). When two
-- bands share a boundary the winner logic (most specific, then narrowest band)
-- still resolves it deterministically.
--
-- Applies to BOTH the room- and mess-category resolvers (identical fee logic).

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT e.room_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.room_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <= e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  -- Gender translation: map the winning band's category to the learner's gender variant
  -- (same NAME, matching type). Lets one 'both' band serve boys and girls correctly.
  SELECT COALESCE(
           CASE WHEN p_gender IS NOT NULL AND oc.type IS NOT NULL AND oc.type <> p_gender
                THEN (SELECT sib.id FROM hostel_categories sib
                       WHERE sib.name = oc.name AND sib.type = p_gender LIMIT 1)
                ELSE NULL END,
           c.cat)
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max
  LEFT JOIN hostel_categories oc ON oc.id = c.cat;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT e.mess_category_id AS cat,
           e.program_id, e.quota_ids, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_ids  IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND e.mess_category_id IS NOT NULL
      AND (p_gender IS NULL OR e.hostel_type = 'both' OR e.hostel_type = p_gender)
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <= e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_ids, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT COALESCE(
           CASE WHEN p_gender IS NOT NULL AND oc.type IS NOT NULL AND oc.type <> p_gender
                THEN (SELECT sib.id FROM mess_categories sib
                       WHERE sib.name = oc.name AND sib.type = p_gender LIMIT 1)
                ELSE NULL END,
           c.cat)
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max
  LEFT JOIN mess_categories oc ON oc.id = c.cat;
$function$;
