-- Expose allocation_mode on the upgrade-category list so the My Hostel UI can branch:
-- AUTO categories (Classic/Deluxe) get a fee-only "Upgrade" (no manual room selection — the
-- room is auto-picked / office-allocated); MANUAL categories (Premium) keep the room picker.
-- Adding a RETURNS column requires DROP + CREATE. Grants preserved (authenticated, service_role).
DROP FUNCTION IF EXISTS public.fn_my_upgrade_room_categories();
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
 RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text, current_year_fee numeric, upgrade_fee numeric, available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean, hold_days integer)
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
  ORDER BY hf.amount;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated, service_role;
