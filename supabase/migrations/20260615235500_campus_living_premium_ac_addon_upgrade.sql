-- Campus Living — "Premium Room + AC" add-on upgrade (both genders).
--
-- New upgrade tier: a Premium resident can pay +₹30,000 to add AC, moving from
-- "Premium Room" (₹42,500) to "Premium Room + AC" (₹72,500). It is a CATEGORY-ONLY
-- add-on — the resident keeps their current Premium bed; only the category changes
-- and the +₹30,000 is billed (fn_self_upgrade_category_only handles this; no room move).
--
-- Constraints honoured:
--   * Reachable ONLY from Premium → Premium + AC (not from Classic/Deluxe). Enforced
--     via a new `requires_explicit_upgrade` flag: such categories surface in the
--     resident upgrade list ONLY when an explicit upgrade-fee pair is configured from
--     the resident's current category — never through the fee-difference fallback.
--   * Both genders. Boys previously had NO base category fees at all (so boys saw zero
--     upgrade options); we seed the full boys ladder mirrored from girls, plus the AC
--     tier for both genders, so the AC upgrade actually renders for boys too.
--
-- All inserts are idempotent (NOT EXISTS guards) and bound to the current hostel year.

-- 1) Flag: categories reachable only via an explicit configured upgrade pair (add-ons).
ALTER TABLE hostel_categories
  ADD COLUMN IF NOT EXISTS requires_explicit_upgrade boolean NOT NULL DEFAULT false;

-- 2) New add-on categories (boys + girls). allocation_mode='auto' routes the resident
--    through the category-only upgrade flow (no manual room pick / no room move).
INSERT INTO hostel_categories
  (name, type, allocation_mode, upgrade_threshold_pct, upgrade_hold_days, sort_order,
   is_active, requires_explicit_upgrade)
SELECT v.name, v.type, 'auto', 30, 5, 5, true, true
FROM (VALUES ('Premium Room + AC', 'boys'), ('Premium Room + AC', 'girls')) AS v(name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM hostel_categories c WHERE c.name = v.name AND c.type = v.type
);

-- 3a) Boys base category fees — mirror the girls ladder (Classic / Deluxe / Premium)
--     so boys residents have a current-year fee and can see upgrade options at all.
INSERT INTO hostel_fees (hostel_year_id, hostel_category_id, amount, frequency, is_active)
SELECT gf.hostel_year_id, bc.id, gf.amount, gf.frequency, gf.is_active
FROM hostel_fees gf
JOIN hostel_categories gc ON gc.id = gf.hostel_category_id AND gc.type = 'girls'
JOIN hostel_categories bc ON bc.name = gc.name AND bc.type = 'boys'
WHERE gf.hostel_category_id IS NOT NULL AND gf.mess_category_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM hostel_fees x
    WHERE x.hostel_category_id = bc.id
      AND x.hostel_year_id = gf.hostel_year_id
      AND x.mess_category_id IS NULL
  );

-- 3b) "Premium Room + AC" base fee = 42,500 + 30,000 = 72,500 (both genders, current year).
INSERT INTO hostel_fees (hostel_year_id, hostel_category_id, amount, frequency, is_active)
SELECT (SELECT id FROM hostel_years WHERE is_current LIMIT 1), c.id, 72500, 'annual', true
FROM hostel_categories c
WHERE c.name = 'Premium Room + AC' AND c.type IN ('boys', 'girls')
  AND NOT EXISTS (
    SELECT 1 FROM hostel_fees x
    WHERE x.hostel_category_id = c.id
      AND x.hostel_year_id = (SELECT id FROM hostel_years WHERE is_current LIMIT 1)
      AND x.mess_category_id IS NULL
  );

-- 4) Upgrade pair: Premium Room → Premium Room + AC = ₹30,000 (the AC delta), both genders.
INSERT INTO hostel_category_upgrade_fees
  (hostel_year_id, from_hostel_category_id, to_hostel_category_id,
   from_mess_category_id, to_mess_category_id, amount, is_active)
SELECT (SELECT id FROM hostel_years WHERE is_current LIMIT 1), pr.id, ac.id, NULL, NULL, 30000, true
FROM hostel_categories pr
JOIN hostel_categories ac ON ac.name = 'Premium Room + AC' AND ac.type = pr.type
WHERE pr.name = 'Premium Room' AND pr.type IN ('boys', 'girls')
  AND NOT EXISTS (
    SELECT 1 FROM hostel_category_upgrade_fees x
    WHERE x.hostel_year_id = (SELECT id FROM hostel_years WHERE is_current LIMIT 1)
      AND x.from_hostel_category_id = pr.id
      AND x.to_hostel_category_id = ac.id
  );

-- 5) Resident upgrade list: honour the add-on flag.
--    Two changes vs. the prior body:
--      a) available_beds: add-on categories have no dedicated rooms (resident keeps their
--         bed), so report them as always-available — otherwise the front-end's
--         `available_beds > 0` gate would hide the upgrade button.
--      b) WHERE: an add-on category appears ONLY when an explicit upgrade pair is
--         configured from the resident's current category (no fee-difference fallback),
--         keeping "Premium Room + AC" reachable from Premium alone.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
 RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric, upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean, hold_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE id = auth.uid();
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(v_lp) pp;

  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         CASE WHEN c.requires_explicit_upgrade THEN 1
              ELSE (SELECT count(*)::int FROM fn_my_room_options(c.id)) END,
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL
          OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days
  FROM hostel_categories c
  JOIN hostel_fees hf
    ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
    AND (NOT c.requires_explicit_upgrade
         OR EXISTS (SELECT 1 FROM hostel_category_upgrade_fees uf2
                    WHERE uf2.hostel_year_id = v_year AND uf2.is_active
                      AND uf2.from_hostel_category_id = v_cur_cat
                      AND uf2.to_hostel_category_id = c.id))
  ORDER BY hf.amount;
END $function$;
