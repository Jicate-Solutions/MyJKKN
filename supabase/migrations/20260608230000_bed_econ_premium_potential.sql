-- Bed Economics — Premium Revenue potential model (super-admin).
--
-- WHY: the Director's goal is "maximise revenue per premium bed." Every lever
-- already exists in production as real config — tier uplift % (hostel_tier_policy:
-- Premium +25%, Premium Plus +50%), AC surcharge (policy
-- hostel.room.ac_default_cost_per_ton_inr = ₹77,000/ton, 7 rooms configured at
-- 1.5 ton), and inventory by gender (hostel_categories.type) × tier. The ONLY
-- unset input is the base bed rate (hostel_fees is empty). So this RPC computes
-- the monetisation MODEL from real levers + a caller-supplied assumed base rate,
-- and surfaces the ₹-gap = potential − currently-billed (≈₹0 today).
--
-- Pattern source: fn_bed_econ_summary / fn_bed_econ_block_grid in
-- 20260607120000_bed_economics_substrate.sql (sellable-purpose policy, gender via
-- hostel_categories.type, active = check_out_date IS NULL, super-admin gate +
-- anon revoke). Tier uplift from hostel_tier_policy (20260516131800).
--
-- All money is annual ₹. No DB writes. Masked today by 0 base rate → gap shows
-- the full modelled potential the moment a base rate is typed in the UI.

CREATE OR REPLACE FUNCTION public.fn_bed_econ_premium_potential(
  p_hostel_year_id  uuid,
  p_institution_id  uuid     DEFAULT NULL,
  p_assumed_base_inr numeric DEFAULT NULL
)
RETURNS TABLE (
  gender             text,
  tier               text,
  tier_key           text,
  beds               int,
  occupied_beds      int,
  empty_beds         int,
  uplift_pct         numeric,
  ac_rooms           int,
  base_potential     numeric,
  uplift_potential   numeric,
  ac_potential       numeric,
  total_potential    numeric,
  currently_billed   numeric,
  gap                numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sellable_purposes text[];
  v_base       numeric := GREATEST(COALESCE(p_assumed_base_inr, 0), 0);
  v_ac_per_ton numeric;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super admin only' USING ERRCODE = '42501';
  END IF;

  v_sellable_purposes := COALESCE(
    (SELECT array_agg(elem::text)
       FROM jsonb_array_elements_text(fn_get_policy('bed_econ.sellable_room_purposes', NULL)) elem),
    ARRAY['student']);

  -- Real AC cost lever: ₹/ton/year (default 77,000 if policy ever unset).
  v_ac_per_ton := COALESCE(
    NULLIF(fn_get_policy_text('hostel.room.ac_default_cost_per_ton_inr', '77000', NULL), '')::numeric,
    77000);

  RETURN QUERY
  WITH cat AS (
    -- One row per gender × category (tier), with the real tier uplift % resolved
    -- from hostel_tier_policy by matching the category name to a tier_key.
    SELECT
      hc.id   AS category_id,
      hc.type AS gender,
      hc.name AS tier,
      -- map "Premium Plus Room"->premium_plus, "Premium Room"->premium,
      -- "Classic Room"->standard, "Deluxe Room"->deluxe (no policy row → 0).
      CASE
        WHEN hc.name ILIKE '%premium plus%' THEN 'premium_plus'
        WHEN hc.name ILIKE '%premium%'      THEN 'premium'
        WHEN hc.name ILIKE '%deluxe%'       THEN 'deluxe'
        ELSE 'standard'
      END AS tier_key
    FROM public.hostel_categories hc
    WHERE hc.is_active
  ),
  uplift AS (
    SELECT tp.tier_key, COALESCE(tp.fee_uplift_percentage_default, 0) AS pct
    FROM public.hostel_tier_policy tp
    WHERE tp.is_active
  ),
  room_roll AS (
    -- Inventory + AC rooms per category, scoped to sellable + institution.
    SELECT
      r.category_id,
      COALESCE(SUM(COALESCE(r.actual_capacity, r.capacity, 0)), 0)::int AS beds,
      COUNT(*) FILTER (WHERE r.ac_status = 'ac')::int                   AS ac_rooms,
      COALESCE(SUM(
        CASE WHEN r.ac_status = 'ac'
             THEN COALESCE(r.ac_tonnage_tons, 1.5) * v_ac_per_ton
             ELSE 0 END), 0)                                            AS ac_potential
    FROM public.hostel_rooms r
    WHERE r.room_purpose = ANY(v_sellable_purposes)
      AND r.category_id IS NOT NULL
      AND (p_institution_id IS NULL OR EXISTS (
            SELECT 1 FROM public.hostel_block_institutions hbi
            WHERE hbi.block_id = r.block_id AND hbi.institution_id = p_institution_id))
    GROUP BY r.category_id
  ),
  occ AS (
    -- Active occupancy per category (check_out_date IS NULL = canonical active).
    SELECT r.category_id, COUNT(a.id)::int AS occupied
    FROM public.hostel_rooms r
    JOIN public.hostel_allocations a
      ON a.room_id = r.id AND a.check_out_date IS NULL
    WHERE r.room_purpose = ANY(v_sellable_purposes) AND r.category_id IS NOT NULL
    GROUP BY r.category_id
  )
  SELECT
    cat.gender,
    cat.tier,
    cat.tier_key,
    COALESCE(rr.beds, 0)                                              AS beds,
    COALESCE(o.occupied, 0)                                           AS occupied_beds,
    GREATEST(COALESCE(rr.beds,0) - COALESCE(o.occupied,0), 0)         AS empty_beds,
    COALESCE(u.pct, 0)                                               AS uplift_pct,
    COALESCE(rr.ac_rooms, 0)                                          AS ac_rooms,
    ROUND(v_base * COALESCE(rr.beds,0))                              AS base_potential,
    ROUND(v_base * COALESCE(rr.beds,0) * COALESCE(u.pct,0) / 100.0)  AS uplift_potential,
    ROUND(COALESCE(rr.ac_potential, 0))                              AS ac_potential,
    ROUND(v_base * COALESCE(rr.beds,0) * (1 + COALESCE(u.pct,0)/100.0)
          + COALESCE(rr.ac_potential,0))                            AS total_potential,
    -- Currently billed for this gender×tier from hostel-source bills (≈0 today).
    COALESCE((
      SELECT SUM(b.final_amount)
      FROM public.billing_student_bills b
      JOIN public.hostel_allocations a2 ON a2.learner_id = b.student_id AND a2.check_out_date IS NULL
      JOIN public.hostel_rooms r2 ON r2.id = a2.room_id AND r2.category_id = cat.category_id
      WHERE b.hostel_year_id = p_hostel_year_id
        AND b.fee_source IN ('hostel_category','hostel_package')
        AND b.status NOT IN ('cancelled','superseded')
    ), 0)                                                            AS currently_billed,
    ROUND(v_base * COALESCE(rr.beds,0) * (1 + COALESCE(u.pct,0)/100.0)
          + COALESCE(rr.ac_potential,0)
          - COALESCE((
            SELECT SUM(b.final_amount)
            FROM public.billing_student_bills b
            JOIN public.hostel_allocations a2 ON a2.learner_id = b.student_id AND a2.check_out_date IS NULL
            JOIN public.hostel_rooms r2 ON r2.id = a2.room_id AND r2.category_id = cat.category_id
            WHERE b.hostel_year_id = p_hostel_year_id
              AND b.fee_source IN ('hostel_category','hostel_package')
              AND b.status NOT IN ('cancelled','superseded')
          ), 0))                                                     AS gap
  FROM cat
  LEFT JOIN uplift u   ON u.tier_key = cat.tier_key
  LEFT JOIN room_roll rr ON rr.category_id = cat.category_id
  LEFT JOIN occ o      ON o.category_id = cat.category_id
  WHERE COALESCE(rr.beds, 0) > 0          -- only categories that actually have inventory
  ORDER BY cat.gender, COALESCE(u.pct, 0) DESC, cat.tier;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_bed_econ_premium_potential(uuid, uuid, numeric) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bed_econ_premium_potential(uuid, uuid, numeric) TO authenticated;
