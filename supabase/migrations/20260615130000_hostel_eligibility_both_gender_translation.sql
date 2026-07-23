-- Campus Living — make a single 'both' Category-Eligibility band serve BOTH genders.
--
-- MODEL (per operator intent): the fee→category condition is the SAME for boys and girls,
-- so it should be defined ONCE as hostel_type='both' rather than duplicated per gender.
-- Room/mess categories are gender-typed duplicates (same NAME, different `type`).
--
-- FIX 1 (condition): teach fn_hostel_effective_room_categories / _mess_categories to
-- translate the winning band's category to the requesting learner's gender — same NAME,
-- matching type. So 'both → Deluxe Room' yields girls "Deluxe Room" for a girl and boys
-- "Deluxe Room" for a boy. Falls back to the stored category when no same-name sibling
-- exists. Preserves the multi-quota quota_ids logic untouched. This is the DURABLE cure
-- for the recurring gender-misroute (see 20260613120000 / 20260615120000): a band edited
-- to "Both" in the admin UI can no longer hand a girl a boys category.
--
-- FIX 2 (data): undo the per-gender split of the BDS ₹4.0–4.4L band from 20260615120000
-- and restore a single 'both' row (the resolver now does the gender mapping).
--
-- KNOWN INVENTORY GAP (not a resolver bug): boys "Deluxe Room" (4d362993) has ZERO physical
-- rooms, so BDS boys at ₹4.0L+ resolve to a roomless category and report "No room they can
-- occupy" until boys Deluxe rooms are created (or those tiers get a boys-specific category).

-- ── FIX 1a: room resolver ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
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
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
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

-- ── FIX 1b: mess resolver (identical translation against mess_categories) ─────────────
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric, p_gender text DEFAULT NULL::text)
 RETURNS TABLE(category_id uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
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
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
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

-- ── FIX 2: consolidate the BDS ₹4.0–4.4L tier back to a single 'both' band ────────────
CREATE TABLE IF NOT EXISTS _bak_hostel_program_eligibility_20260615b AS
SELECT * FROM hostel_program_eligibility;

-- Drop the boys-Classic row added by 20260615120000.
DELETE FROM hostel_program_eligibility
WHERE program_id = 'aea1e367-65ad-442d-9b11-ab0277d93a83'
  AND fee_min = 400000 AND fee_max = 440000
  AND hostel_type = 'boys'
  AND room_category_id = '00fad18b-82ee-445a-a409-363c382bccd1';

-- Restore the tier to a single 'both' row (resolver now maps each gender by name).
UPDATE hostel_program_eligibility
SET hostel_type = 'both', updated_at = now()
WHERE id = 'ebed30cf-29fa-4af1-aa09-15aa0b59f796';
