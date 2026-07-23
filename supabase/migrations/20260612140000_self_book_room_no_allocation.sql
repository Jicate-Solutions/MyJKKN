-- =============================================================================
-- My Hostel: let an UNALLOCATED learner BOOK a room (first allocation)
--
-- fn_self_upgrade_room_category is a MOVE (upgrade) that required an active
-- allocation — so a hosteller with a category but no allocation hit
-- "You have no active allocation to upgrade from". Now, when the learner has
-- NO active allocation, the same confirm action performs a FIRST BOOKING:
--   * instant 'active' allocation (user decision — no warden approval)
--   * UNGATED (the academic-fee threshold + bed-hold/waitlist apply only to
--     real upgrades, never a first booking)
--   * NO bill (the base hostel fee is billed by the operator's
--     campus_living_generate_hostel_year_bills run; its dedup avoids doubles)
-- The category-sync trigger (trg_allocation_sync_learner_categories) fills
-- hostel_category_id / mess_category_id from the room automatically.
--
-- Learners WITH an active allocation keep the existing threshold-gated upgrade
-- (move + upgrade bill, or below-threshold bed reservation + waitlist hold).
-- _cl_execute_room_upgrade (the mover) is unchanged — only reached WITH an
-- allocation. Rebuilt from the live body checked 2026-06-12.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(
  p_new_category_id uuid, p_room_id uuid, p_bed_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_sem uuid; v_tier uuid; v_block uuid; v_new_alloc uuid;
  v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  -- Downgrade guard applies only when moving FROM a real current category.
  IF v_cur_cat IS NOT NULL AND v_new_fee < v_cur_fee THEN
    RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)';
  END IF;

  v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active');

  -- Room-level flow: auto-assign the lowest-numbered available bed
  IF p_bed_id IS NULL THEN
    SELECT o.bed_id INTO p_bed_id
    FROM fn_my_room_options(p_new_category_id) o
    WHERE o.room_id = p_room_id
    ORDER BY o.bed_number LIMIT 1;
    IF p_bed_id IS NULL THEN
      RAISE EXCEPTION 'No available bed left in that room. Pick another room.';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  -- ── FIRST BOOKING (no active allocation): instant, ungated, no bill ─────────
  IF NOT v_has_alloc THEN
    IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
      RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
    END IF;
    SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

    SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
      FROM learners_profiles WHERE id = v_lp;
    v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
    IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;
    SELECT block_id INTO v_block FROM hostel_rooms WHERE id = p_room_id;
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active
      ORDER BY institution_id NULLS LAST LIMIT 1;
    IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, allocated_by, warden_id
    ) VALUES (
      v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
      'fresh', CURRENT_DATE, 'active', '', '', '',
      v_tier, v_profile,
      (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
    ) RETURNING id INTO v_new_alloc;
    UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;
    -- learners_profiles.hostel_category_id / mess_category_id set by
    -- trg_allocation_sync_learner_categories. No bill on a first booking.

    RETURN jsonb_build_object('success', true, 'state', 'booked',
      'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
      'new_category_id', p_new_category_id, 'new_fee', v_new_fee);
  END IF;

  -- ── UPGRADE (has active allocation): threshold-gated move ───────────────────
  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);

  IF (v_gate->>'meets')::boolean THEN
    v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  -- Below threshold: hard-reserve the bed and wait for payment
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  -- One hold per learner: release every bed currently held by their waiting
  -- upgrade entries (any category) before reserving the new one.
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting' AND held_bed_id IS NOT NULL;

  UPDATE hostel_beds SET status='reserved' WHERE id = p_bed_id;

  SELECT upgrade_hold_days INTO v_hold_days FROM hostel_categories WHERE id = p_new_category_id;
  v_expires := now() + make_interval(days => COALESCE(v_hold_days, 5));

  SELECT institution_id, academic_year_id INTO v_inst, v_ay FROM learners_profiles WHERE id = v_lp;
  v_ay := COALESCE(v_ay, (SELECT id FROM academic_years WHERE institution_id=v_inst AND is_active ORDER BY start_date DESC LIMIT 1));
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year configured'; END IF;

  SELECT id INTO v_existing FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade'
      AND target_hostel_category_id = p_new_category_id AND status='waiting' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE hostel_waitlist
       SET held_room_id=p_room_id, held_bed_id=p_bed_id, hold_expires_at=v_expires, updated_at=now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO hostel_waitlist (
      institution_id, learner_id, academic_year_id, status, entry_kind,
      target_hostel_category_id, held_room_id, held_bed_id, hold_expires_at
    ) VALUES (
      v_inst, v_profile, v_ay, 'waiting', 'upgrade',
      p_new_category_id, p_room_id, p_bed_id, v_expires
    ) RETURNING id INTO v_existing;
  END IF;

  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) TO authenticated;
