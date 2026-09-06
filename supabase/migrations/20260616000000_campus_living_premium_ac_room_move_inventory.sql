-- Campus Living — "Premium Room + AC" becomes a ROOM-MOVE upgrade with its own AC inventory.
--
-- Refines 20260615235500 (which made it a category-only add-on). The resident should pick
-- from the AC-equipped rooms ONLY — not all Premium rooms — so this is now a room move:
--   * Give the AC category its own inventory by re-tagging the physically-AC Premium rooms
--     to it. Both room-picker functions (fn_my_room_options / fn_my_upgrade_room_options)
--     filter purely on category_id, so once tagged, only AC rooms appear in the picker.
--     This also removes AC rooms from the regular Premium pool (a non-AC Premium resident
--     should never be auto-placed into an AC room). The AC rooms are currently EMPTY, and
--     room eligibility is block/floor-based (not category-based), so re-tagging is safe.
--   * Switch allocation_mode 'auto' → 'manual' so the front-end shows the room picker
--     (fn_self_upgrade_room_category) instead of the category-only confirm.
--
-- Inventory today: girls have 6 AC Premium rooms (24 beds, Girls Hostel C); boys have NONE,
-- so the boys AC upgrade will show "Join waitlist" until boys AC rooms are tagged.

-- 1) Re-tag AC-equipped Premium rooms to the matching-gender "Premium Room + AC" category.
UPDATE hostel_rooms r
SET category_id = ac.id, updated_at = now()
FROM hostel_categories cur
JOIN hostel_categories ac ON ac.name = 'Premium Room + AC' AND ac.type = cur.type
WHERE r.category_id = cur.id
  AND cur.name = 'Premium Room'
  AND r.ac_status = 'ac'
  AND r.room_purpose = 'student';

-- 2) Room-move (manual pick) rather than category-only.
UPDATE hostel_categories
SET allocation_mode = 'manual', updated_at = now()
WHERE name = 'Premium Room + AC';

-- 3) available_beds now reflects the AC category's real inventory again, so drop the add-on
--    sentinel (CASE … THEN 1) added in 20260615235500. The explicit-pair gate stays — the AC
--    tier still appears ONLY for residents with a configured upgrade pair to it (Premium).
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
         (SELECT count(*)::int FROM fn_my_room_options(c.id)),
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
