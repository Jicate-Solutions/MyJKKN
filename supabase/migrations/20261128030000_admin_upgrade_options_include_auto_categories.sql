-- ============================================================================
-- Campus Living — the office's upgrade list stops hiding auto-allocated tiers
-- ============================================================================
-- 2026-11-28
--
-- SYMPTOM
-- -------
-- On /campus-living/allocations/<id>, the "Room category & upgrade billing"
-- card offered a Classic girls resident only Premium Room and Premium Room + AC.
-- Deluxe Room — the very next rung, with a configured Classic -> Deluxe fee of
-- Rs.7,500 — never appeared, even though the learner sees it on My Hostel.
--
-- CAUSE
-- -----
-- fn_cl_admin_room_upgrade_options carried `AND c.allocation_mode = 'manual'`.
-- Classic and Deluxe are 'auto', so the office list silently dropped every
-- auto-allocated tier while the learner-facing fn_my_upgrade_room_categories
-- (which has no such filter) kept showing them. Same learner, two different
-- ladders.
--
-- The filter made sense when this RPC fed only the room-picker dialog: an auto
-- category is office-allocated, so there is no room for the admin to pick. But
-- the card grew a second action — "Upgrade category only", backed by
-- fn_cl_admin_upgrade_category_only — that reuses THIS list, and that action is
-- exactly the right one for an auto tier. Filtering here made it unreachable.
--
-- WHAT CHANGES
-- ------------
-- The clause is dropped. `allocation_mode` is already a returned column, so the
-- UI routes on it: 'auto' -> category-only, 'manual' -> pick a room. Nothing
-- else moves. Every other gate stays exactly as it was:
--   * gender must match, and the institution must be one the caller can reach
--   * the target must cost MORE than the current category (no downgrades)
--   * requires_explicit_upgrade tiers still need a configured
--     hostel_category_upgrade_fees pair from the CURRENT category
--
-- Deluxe Plus therefore still does NOT appear for a Classic resident: it is
-- requires_explicit_upgrade with only a Deluxe -> Deluxe Plus pair configured.
-- That is a pricing decision, not a bug — add the pair if it should be
-- reachable from Classic.
--
-- Signature and result type are unchanged, so CREATE OR REPLACE keeps the
-- existing ACL (authenticated + service_role, never PUBLIC).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cl_admin_room_upgrade_options(p_learner_id uuid)
 RETURNS TABLE(category_id uuid, name text, type text, allocation_mode text,
               current_year_fee numeric, upgrade_fee numeric, available_beds integer,
               threshold_pct numeric, paid_pct numeric, meets_threshold boolean,
               hold_days integer, upgrade_fee_original numeric, upgrade_discount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_gender text; v_paid_pct numeric; v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE='42501';
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_learner_id;
  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id WHERE lp.id = p_learner_id;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  SELECT pp.paid_pct INTO v_paid_pct FROM fn_learner_academic_payment_progress(p_learner_id) pp;

  RETURN QUERY
  SELECT c.id, c.name, c.type, c.allocation_mode, hf.amount,
         COALESCE(
           (SELECT uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee,
         (SELECT count(*)::int FROM _cl_room_options(v_profile, p_learner_id, c.id)),
         c.upgrade_threshold_pct,
         v_paid_pct,
         (c.upgrade_threshold_pct IS NULL OR (v_paid_pct IS NOT NULL AND v_paid_pct >= c.upgrade_threshold_pct)),
         c.upgrade_hold_days,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           hf.amount - v_cur_fee) AS upgrade_fee_original,
         COALESCE(
           (SELECT uf.amount - uf.net_amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat AND uf.to_hostel_category_id = c.id LIMIT 1),
           0) AS upgrade_discount
  FROM hostel_categories c
  JOIN hostel_fees hf ON hf.hostel_category_id = c.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  -- 2026-11-28: `AND c.allocation_mode = 'manual'` removed from this WHERE. It
  -- hid every auto-allocated tier (Classic, Deluxe) from the office while the
  -- learner-facing list showed them. The caller routes on allocation_mode.
  WHERE c.is_active
    AND ((v_gender IN ('male','m') AND c.type='boys') OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
    AND (NOT c.requires_explicit_upgrade
         OR EXISTS (SELECT 1 FROM hostel_category_upgrade_fees uf2
                    WHERE uf2.hostel_year_id = v_year AND uf2.is_active
                      AND uf2.from_hostel_category_id = v_cur_cat
                      AND uf2.to_hostel_category_id = c.id))
  ORDER BY hf.amount;
END $function$;
