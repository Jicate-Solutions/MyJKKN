-- Campus Living — let the self-service room-category list offer AUTO categories too.
--
-- fn_my_upgrade_room_categories previously filtered `allocation_mode = 'manual'`, so a
-- Classic resident could only ever be offered Premium/Premium Plus — never Deluxe. Per
-- operator intent, an auto-category resident (Classic/Deluxe) should be able to move up to
-- ANY higher category (Classic→Deluxe, Classic→Premium). The book-vs-upgrade DECISION moves
-- to the front end (driven by the current category's allocation_mode in category-fees-tab.tsx);
-- this function just returns every higher-priced, gender-matched category with a published
-- fee and free rooms. The upgrade RPC (fn_self_upgrade_room_category) already first-books an
-- unallocated learner or bills the differential for an allocated one, so no billing change.
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
 RETURNS TABLE(category_id uuid, name text, type text, current_year_fee numeric, upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean, hold_days integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  SELECT c.id, c.name, c.type, hf.amount,
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
  WHERE c.is_active   -- any allocation_mode: auto (Deluxe) categories are upgrade targets too
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $function$;
