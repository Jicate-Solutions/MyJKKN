-- ============================================================================
-- Campus Living — Category entitlement must come back in a DETERMINISTIC,
-- cheapest-first order (2026-08-11)
-- ============================================================================
--
-- fn_hostel_effective_room_categories returns EVERY eligibility row that shares
-- the winning (program_id, quota_ids, fee_min, fee_max) tuple, so a cohort can
-- legitimately hold more than one room category. Its final SELECT had no
-- ORDER BY, so the array built by
--
--     array_agg(category_id) FROM fn_hostel_effective_room_categories(...)
--
-- came back in whatever order the planner produced.
--
-- That array is NOT just a set. Both engine functions sort candidate beds with
--
--     ORDER BY array_position(cand.room_cats, x.category_id), tier, ...
--
-- and the 20260810200000 header describes room_cats as "priority-ordered
-- entitlement". It never was — the ordering was accidental. Today it cannot
-- bite: measured on 2026-08-11, 693 of 696 active hostel learners resolve to
-- exactly ONE category and 3 to none, so every array has at most one element
-- and this change is a provable no-op.
--
-- It stops being a no-op in the very next migration, which grants the Nursing
-- and B.Pharm girls a SECOND category (Deluxe) alongside Classic so they can be
-- housed in Girls Hostel B / C. Without a defined order those learners could be
-- sent to a ₹35,000 Deluxe bed while a ₹27,500 Classic bed they are entitled to
-- sits free — and the preview and the allocator could even disagree with each
-- other, because each evaluates the array in its own plan.
--
-- ORDER: hostel_categories.sort_order (Classic 1 → Deluxe 2 → Premium 3 →
-- Premium Plus 4 → Premium+AC 5), i.e. cheapest entitled room first, then name
-- as a stable tiebreak. Filling the base category before spilling upward is
-- both the cheaper outcome for the learner and the one that preserves premium
-- inventory.
--
-- DISTINCT: two rows of the winning tuple can map onto the SAME effective
-- category once the gender-sibling remap runs (a 'both' row carrying the boys
-- category and a 'girls' row carrying the girls one both resolve to the girls
-- category). A duplicate would make array_position ambiguous. No such pair
-- exists today; the guard is here so adding one later cannot corrupt priority.
--
-- Signature, volatility, security and search_path are unchanged, so this is a
-- plain CREATE OR REPLACE: the EXECUTE grants to authenticated / service_role
-- survive and no second overload is created.
--
-- fn_hostel_effective_mess_categories is deliberately NOT touched. It has the
-- same shape, but mess entitlement is never intersected with physical rooms and
-- nothing sorts by array_position over mess_cats — only mess_cats[1] is read.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid,
  p_program uuid,
  p_quota uuid,
  p_fee numeric,
  p_gender text DEFAULT NULL::text
)
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
  ),
  -- Unchanged resolution, lifted into its own CTE so the result can be ordered
  -- by the category it actually resolves to rather than the one it started as.
  effective AS (
    SELECT COALESCE(
             CASE WHEN p_gender IS NOT NULL AND oc.type IS NOT NULL AND oc.type <> p_gender
                  THEN (SELECT sib.id FROM hostel_categories sib
                         WHERE sib.name = oc.name AND sib.type = p_gender LIMIT 1)
                  ELSE NULL END,
             c.cat) AS cat_id
    FROM candidates c JOIN winner w
      ON c.program_id IS NOT DISTINCT FROM w.program_id
     AND c.quota_ids  IS NOT DISTINCT FROM w.quota_ids
     AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
     AND c.fee_max    IS NOT DISTINCT FROM w.fee_max
    LEFT JOIN hostel_categories oc ON oc.id = c.cat
  ),
  ranked AS (
    SELECT DISTINCT e.cat_id, hc.sort_order, hc.name
    FROM effective e
    JOIN hostel_categories hc ON hc.id = e.cat_id
  )
  SELECT r.cat_id
  FROM ranked r
  ORDER BY r.sort_order NULLS LAST, r.name;
$function$;
