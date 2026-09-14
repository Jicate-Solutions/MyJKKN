-- ===========================================================================
-- Admin-side room category upgrades + upgrade-bill generation
-- ===========================================================================
--
-- The Allocation Audit already DETECTS the problems (band_verdict='above_band',
-- upgrade_bill_state, verdict='upgrade_unbilled'), and the admin room upgrade
-- that moves AND bills already exists (fn_cl_admin_upgrade_room). Two things
-- have no tool at all:
--
--   1. A learner who should be upgraded but CANNOT BE MOVED -- no free bed in
--      the target category -- while already living in the room. Every admin
--      path today goes through _cl_upgrade_room_category, which validates the
--      bed against _cl_room_options and raises "That room/bed is not an
--      available option for this learner". Learners have
--      fn_self_upgrade_category_only; admins had no equivalent.
--
--   2. A learner ALREADY holding a category above their fee-band entitlement
--      with no live upgrade bill. Both existing paths price current -> target,
--      so when those are equal the fee is 0 and nobody can be charged for the
--      category they already hold. 15 active allocations are in this state
--      (9 never billed + 6 whose bills were all cancelled).
--
-- WHY A NARROW READ RPC (fn_cl_admin_upgrade_context) INSTEAD OF THE AUDIT.
-- fn_hostel_allocation_audit is gated on campus_living.allocations.audit, which
-- is granted to NO role -- it is super-admin only. campus_living.upgrades.manage
-- is held by the six roles who must actually do this work (ceo, chief_warden,
-- executive_admin_officer, hostel_office, managing_director, warden). Widening
-- the audit key would hand all six a whole cross-institution audit surface to
-- solve a four-field problem, so this exposes just those four fields instead.
--
-- THE DOUBLE-CHARGE HAZARD. _cl_apply_upgrade_fee_bill ACCUMULATES onto an
-- existing live bill rather than refusing (it was written that way to dodge a
-- 23505 on uq_bill_dedup_category). A second call therefore does not error --
-- it silently doubles the amount. fn_cl_admin_generate_upgrade_bill defends
-- against that twice: p_dry_run defaults to TRUE, and a live non-cancelled
-- hostel_category bill refuses the write unless explicitly overridden.
-- ===========================================================================


-- ── 1. Admin category-only upgrade ────────────────────────────────────────
-- Thin wrapper over the existing _cl_upgrade_category_only, mirroring
-- fn_self_upgrade_category_only for the office side. No new business logic:
-- that helper already prices the pair from hostel_category_upgrade_fees
-- (net_amount, falling back to the hostel_fees difference), short-circuits a
-- free upgrade, raises the bill through _cl_apply_upgrade_fee_bill, links a
-- hostel_waitlist row and flips learners_profiles.hostel_category_id -- all
-- WITHOUT touching hostel_allocations or hostel_beds, which is the entire point.
--
-- Authorization mirrors fn_cl_admin_upgrade_room exactly, in the same order.

CREATE OR REPLACE FUNCTION public.fn_cl_admin_upgrade_category_only(
  p_learner_id uuid,
  p_category_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
  v_profile uuid;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Learner not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g
                  WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Learner has no login profile (cannot record the upgrade)';
  END IF;

  RETURN public._cl_upgrade_category_only(v_profile, p_learner_id, p_category_id);
END
$function$;

COMMENT ON FUNCTION public.fn_cl_admin_upgrade_category_only IS
  'Office-side category-only upgrade: bills the learner and flips their category '
  'WITHOUT moving them to another bed. For learners already living in the room '
  'when no free bed exists in the target category.';


-- ── 2. Generate an upgrade bill for an ALREADY-upgraded learner ───────────

CREATE OR REPLACE FUNCTION public.fn_cl_admin_generate_upgrade_bill(
  p_learner_id       uuid,
  p_from_category_id uuid    DEFAULT NULL,
  p_dry_run          boolean DEFAULT true,
  p_allow_additional boolean DEFAULT false
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_profile uuid; v_gender text; v_gender_type text;
  v_year uuid; v_cur_cat uuid; v_cur_name text; v_from_cat uuid; v_from_name text;
  v_net numeric; v_gross numeric; v_cur_fee numeric; v_from_fee numeric;
  v_has_alloc boolean; v_bcat uuid;
  v_live_count int := 0; v_live_total numeric := 0; v_live_balance numeric := 0;
  v_bill jsonb; v_source text;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE = '42501';
  END IF;

  SELECT lp.institution_id, lp.hostel_category_id, lp.gender
    INTO v_inst, v_cur_cat, v_gender
  FROM learners_profiles lp WHERE lp.id = p_learner_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Learner not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g
                  WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT p.id INTO v_profile FROM profiles p WHERE p.learner_id = p_learner_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Learner has no login profile';
  END IF;

  IF v_cur_cat IS NULL THEN
    RAISE EXCEPTION 'Learner holds no room category, so there is no upgrade to bill';
  END IF;

  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'No current hostel year configured';
  END IF;

  -- This bills someone for the room they are LIVING IN. Without an active
  -- allocation there is no occupancy to justify the charge.
  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations
                          WHERE learner_id = v_profile AND status = 'active');
  IF NOT v_has_alloc THEN
    RAISE EXCEPTION 'Learner has no active allocation, so there is no occupied upgrade to bill';
  END IF;

  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;

  -- ── Resolve the "from" category ──
  -- Default: the fee-band entitlement. hostel_categories are gender-partitioned
  -- ("Classic Room" exists for boys AND girls) and the band table stores ONE
  -- canonical id whose `type` is meaningless, so the entitled row must be
  -- remapped by NAME to this learner's gender -- the same convention
  -- fn_apply_hostel_fee_categories step (1) already follows.
  IF p_from_category_id IS NOT NULL THEN
    v_from_cat := p_from_category_id;
    v_source := 'explicit';
  ELSE
    v_gender_type := CASE
                       WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
                       WHEN lower(v_gender) LIKE 'f%' THEN 'girls'
                       ELSE NULL
                     END;
    SELECT gv.id INTO v_from_cat
    FROM fn_hostel_learner_room_categories(p_learner_id) r
    JOIN hostel_categories bc ON bc.id = r.category_id
    JOIN hostel_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type
                             AND gv.is_active
    LIMIT 1;
    v_source := 'fee_band';

    IF v_from_cat IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'no_band',
        'message', 'No fee band resolves for this learner, so the entitled category is unknown. Pick the "from" category explicitly.',
        'current_category_id', v_cur_cat, 'current_category', v_cur_name);
    END IF;
  END IF;

  SELECT name INTO v_from_name FROM hostel_categories WHERE id = v_from_cat;

  IF v_from_cat = v_cur_cat THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'in_band',
      'message', format('Nothing to bill — the learner already holds %s, which is what they are entitled to.', v_cur_name),
      'from_category_id', v_from_cat, 'from_category', v_from_name,
      'current_category_id', v_cur_cat, 'current_category', v_cur_name,
      'from_source', v_source);
  END IF;

  -- ── Price it ──
  -- The curated matrix is the source of truth for which from->to edges exist.
  -- Fall back to the published full-fee difference when no row is configured --
  -- there is no Classic -> Deluxe Plus row, and Premium Plus has none at all.
  SELECT uf.net_amount, uf.amount INTO v_net, v_gross
  FROM hostel_category_upgrade_fees uf
  WHERE uf.hostel_year_id = v_year AND uf.is_active
    AND uf.from_hostel_category_id = v_from_cat
    AND uf.to_hostel_category_id = v_cur_cat
  LIMIT 1;

  IF v_net IS NULL THEN
    SELECT COALESCE(amount, 0) INTO v_cur_fee FROM hostel_fees
     WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year
       AND mess_category_id IS NULL AND is_active LIMIT 1;
    SELECT COALESCE(amount, 0) INTO v_from_fee FROM hostel_fees
     WHERE hostel_category_id = v_from_cat AND hostel_year_id = v_year
       AND mess_category_id IS NULL AND is_active LIMIT 1;
    v_net := COALESCE(v_cur_fee, 0) - COALESCE(v_from_fee, 0);
    v_gross := v_net;
    v_source := v_source || '+fee_difference';
  END IF;

  -- A NEGATIVE amount means the learner sits BELOW their entitlement (entitled
  -- Deluxe, assigned Classic). Refusing is right either way, but say which it
  -- is: "prices at zero or less" reads as a pricing gap, not as a learner who
  -- is under-placed and may be owed a room rather than a bill.
  IF COALESCE(v_net, 0) < 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'below_band',
      'message', format('Nothing to bill — this learner is entitled to %s but holds %s, which is below it. They may be owed a better room, not a charge.', v_from_name, v_cur_name),
      'from_category_id', v_from_cat, 'from_category', v_from_name,
      'current_category_id', v_cur_cat, 'current_category', v_cur_name,
      'net_amount', v_net, 'from_source', v_source);
  END IF;

  IF COALESCE(v_net, 0) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'nothing_to_bill',
      'message', format('Nothing to bill — %s to %s is a free upgrade.', v_from_name, v_cur_name),
      'from_category_id', v_from_cat, 'from_category', v_from_name,
      'current_category_id', v_cur_cat, 'current_category', v_cur_name,
      'net_amount', COALESCE(v_net, 0), 'from_source', v_source);
  END IF;

  -- ── Existing live bills ──
  v_bcat := public._cl_ensure_upgrade_billing_category('hostel');
  SELECT count(*), COALESCE(sum(final_amount), 0), COALESCE(sum(balance_amount), 0)
    INTO v_live_count, v_live_total, v_live_balance
  FROM billing_student_bills
  WHERE student_id = p_learner_id AND hostel_year_id = v_year
    AND item_category_id = v_bcat AND fee_source = 'hostel_category'
    AND status NOT IN ('cancelled', 'superseded');

  -- _cl_apply_upgrade_fee_bill ACCUMULATES onto a live bill instead of erroring,
  -- so a second call silently doubles the charge. Refuse by default.
  IF v_live_count > 0 AND NOT p_allow_additional THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_billed',
      'message', format('This learner already has %s live upgrade bill(s) totalling Rs.%s (Rs.%s outstanding). Billing again would ADD to them, not replace them.',
                        v_live_count, trim(to_char(v_live_total, 'FM999999990.99')), trim(to_char(v_live_balance, 'FM999999990.99'))),
      'from_category_id', v_from_cat, 'from_category', v_from_name,
      'current_category_id', v_cur_cat, 'current_category', v_cur_name,
      'net_amount', v_net, 'gross_amount', v_gross,
      'existing_bill_count', v_live_count, 'existing_bill_total', v_live_total,
      'existing_bill_balance', v_live_balance, 'from_source', v_source);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true, 'dry_run', true, 'reason', 'preview',
      'message', format('Would bill Rs.%s for %s to %s.',
                        trim(to_char(v_net, 'FM999999990.99')), v_from_name, v_cur_name),
      'from_category_id', v_from_cat, 'from_category', v_from_name,
      'current_category_id', v_cur_cat, 'current_category', v_cur_name,
      'net_amount', v_net, 'gross_amount', v_gross,
      'discount', GREATEST(COALESCE(v_gross, v_net) - v_net, 0),
      'existing_bill_count', v_live_count, 'from_source', v_source);
  END IF;

  v_bill := public._cl_apply_upgrade_fee_bill(
    p_learner_id, v_year, 'hostel', v_net,
    format('Hostel category upgrade (office-raised): %s -> %s', v_from_name, v_cur_name),
    v_gross);

  RETURN jsonb_build_object(
    'ok', true, 'dry_run', false, 'reason', 'billed',
    'message', format('Billed Rs.%s for %s to %s.',
                      trim(to_char(v_net, 'FM999999990.99')), v_from_name, v_cur_name),
    'from_category_id', v_from_cat, 'from_category', v_from_name,
    'current_category_id', v_cur_cat, 'current_category', v_cur_name,
    'net_amount', v_net, 'gross_amount', v_gross, 'from_source', v_source,
    'bill', v_bill);
END
$function$;

COMMENT ON FUNCTION public.fn_cl_admin_generate_upgrade_bill IS
  'Raises the upgrade bill for a learner who ALREADY holds a category above '
  'their fee-band entitlement, without moving them. Dry-run by default; refuses '
  'when a live upgrade bill exists because _cl_apply_upgrade_fee_bill accumulates.';


-- ── 3. Read-only context for the allocation page ──────────────────────────
-- Gated on upgrades.manage, unlike fn_hostel_allocation_audit which needs the
-- super-admin-only allocations.audit key. Returns only the four things the card
-- shows plus the amount fn_cl_admin_generate_upgrade_bill would compute.

CREATE OR REPLACE FUNCTION public.fn_cl_admin_upgrade_context(
  p_allocation_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_lp uuid; v_inst uuid; v_gender text; v_gender_type text;
  v_year uuid;
  v_assigned uuid; v_assigned_name text;
  v_occupied uuid; v_occupied_name text; v_occupied_source uuid; v_occupied_source_name text;
  v_entitled uuid; v_entitled_name text;
  v_net numeric; v_gross numeric; v_cur_fee numeric; v_from_fee numeric;
  v_live_count int := 0; v_live_total numeric := 0; v_live_paid numeric := 0; v_live_balance numeric := 0;
  v_cancelled_count int := 0; v_state text;
BEGIN
  IF NOT public.user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'permission denied: campus_living.upgrades.manage' USING ERRCODE = '42501';
  END IF;

  SELECT a.learner_id, r.category_id, r.category_id
    INTO v_profile, v_occupied, v_occupied_source
  FROM hostel_allocations a
  LEFT JOIN hostel_rooms r ON r.id = a.room_id
  WHERE a.id = p_allocation_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;

  SELECT p.learner_id INTO v_lp FROM profiles p WHERE p.id = v_profile;
  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_learner_profile');
  END IF;

  SELECT lp.institution_id, lp.hostel_category_id, lp.gender
    INTO v_inst, v_assigned, v_gender
  FROM learners_profiles lp WHERE lp.id = v_lp;

  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g
                  WHERE g.institution_id = v_inst) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  SELECT name INTO v_assigned_name FROM hostel_categories WHERE id = v_assigned;
  SELECT name INTO v_occupied_name FROM hostel_categories WHERE id = v_occupied;

  v_gender_type := CASE WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
                        WHEN lower(v_gender) LIKE 'f%' THEN 'girls' ELSE NULL END;

  SELECT gv.id, gv.name INTO v_entitled, v_entitled_name
  FROM fn_hostel_learner_room_categories(v_lp) r
  JOIN hostel_categories bc ON bc.id = r.category_id
  JOIN hostel_categories gv ON gv.name = bc.name AND gv.type = v_gender_type AND gv.is_active
  LIMIT 1;

  -- Billable amount for entitled -> assigned, same rules as the bill RPC.
  IF v_entitled IS NOT NULL AND v_assigned IS NOT NULL AND v_entitled <> v_assigned AND v_year IS NOT NULL THEN
    SELECT uf.net_amount, uf.amount INTO v_net, v_gross
    FROM hostel_category_upgrade_fees uf
    WHERE uf.hostel_year_id = v_year AND uf.is_active
      AND uf.from_hostel_category_id = v_entitled AND uf.to_hostel_category_id = v_assigned
    LIMIT 1;
    IF v_net IS NULL THEN
      SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
       WHERE hostel_category_id = v_assigned AND hostel_year_id = v_year
         AND mess_category_id IS NULL AND is_active LIMIT 1;
      SELECT COALESCE(amount,0) INTO v_from_fee FROM hostel_fees
       WHERE hostel_category_id = v_entitled AND hostel_year_id = v_year
         AND mess_category_id IS NULL AND is_active LIMIT 1;
      v_net := COALESCE(v_cur_fee,0) - COALESCE(v_from_fee,0);
      v_gross := v_net;
    END IF;
  END IF;

  -- NOT _cl_ensure_upgrade_billing_category here. That helper reactivates the
  -- category with an UPDATE, and this function is STABLE -- PostgREST runs
  -- STABLE functions in a READ-ONLY transaction, where Postgres rejects an
  -- UPDATE statement outright even when it would touch zero rows. The result
  -- was "cannot execute UPDATE in a read-only transaction" in the browser while
  -- every psql/DO-block test passed, because those run read-write.
  --
  -- fee_source = 'hostel_category' is the discriminator on its own; the audit
  -- RPC identifies upgrade bills with exactly that and no category id.
  SELECT count(*) FILTER (WHERE status NOT IN ('cancelled','superseded')),
         COALESCE(sum(final_amount)   FILTER (WHERE status NOT IN ('cancelled','superseded')), 0),
         COALESCE(sum(final_amount - COALESCE(balance_amount,0))
                                      FILTER (WHERE status NOT IN ('cancelled','superseded')), 0),
         COALESCE(sum(balance_amount) FILTER (WHERE status NOT IN ('cancelled','superseded')), 0),
         count(*) FILTER (WHERE status = 'cancelled')
    INTO v_live_count, v_live_total, v_live_paid, v_live_balance, v_cancelled_count
  FROM billing_student_bills
  WHERE student_id = v_lp AND fee_source = 'hostel_category';

  v_state := CASE
               WHEN v_live_count = 0 AND v_cancelled_count > 0 THEN 'cancelled_only'
               WHEN v_live_count = 0 THEN 'none'
               WHEN v_live_balance <= 0 THEN 'paid'
               WHEN v_live_paid > 0 THEN 'partial'
               ELSE 'unpaid'
             END;

  RETURN jsonb_build_object(
    'ok', true,
    'learner_profile_id', v_lp,
    'entitled_category_id', v_entitled, 'entitled_category', v_entitled_name,
    'assigned_category_id', v_assigned, 'assigned_category', v_assigned_name,
    -- Deluxe Plus owns no rooms and sells from Deluxe stock, so an assigned
    -- category above the occupied one is normal, not drift. The UI must not
    -- present this as an error.
    'occupied_category_id', v_occupied, 'occupied_category', v_occupied_name,
    'above_band', (v_entitled IS NOT NULL AND v_assigned IS NOT NULL AND v_entitled <> v_assigned),
    'billable_amount', COALESCE(v_net, 0),
    'billable_gross', COALESCE(v_gross, v_net, 0),
    'upgrade_bill_state', v_state,
    'upgrade_bill_count', v_live_count,
    'upgrade_bill_total', v_live_total,
    'upgrade_bill_balance', v_live_balance,
    'cancelled_bill_count', v_cancelled_count);
END
$function$;

COMMENT ON FUNCTION public.fn_cl_admin_upgrade_context IS
  'Entitled / assigned / occupied category plus upgrade-bill state for one '
  'allocation, gated on campus_living.upgrades.manage. Exists because '
  'fn_hostel_allocation_audit needs allocations.audit, which no role holds.';


-- ── Grants ────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE leaves EXECUTE granted to PUBLIC (= anon). Revoke first.

REVOKE ALL ON FUNCTION public.fn_cl_admin_upgrade_category_only(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_admin_generate_upgrade_bill(uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cl_admin_upgrade_context(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_cl_admin_upgrade_category_only(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_generate_upgrade_bill(uuid, uuid, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_upgrade_context(uuid) TO authenticated, service_role;
