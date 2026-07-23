-- =============================================================================
-- Room booking / upgrade → PAY-TO-CONFIRM (user decisions 2026-06-12)
--
-- Self-service premium room selection is never instant-confirmed when money is
-- owed. The pipeline (rooms only — mess upgrades stay instant):
--
--   FIRST BOOKING (no active allocation):
--     * threshold met (academic-year bill paid % >= category gate) → instant
--       active booking (no upgrade fee exists; base year fee is operator-billed)
--     * below threshold → bed reserved + waitlist hold; auto-confirms when
--       academic payments reach the threshold (existing receipt trigger)
--
--   UPGRADE (has active allocation):
--     * threshold met → bed reserved, upgrade-fee bill generated IMMEDIATELY,
--       booking stays 'pending payment' (waitlist row links the bill via NEW
--       hostel_waitlist.upgrade_bill_id) — the move executes ONLY when the
--       upgrade bill is FULLY PAID (summed from billing_receipt_items)
--     * below threshold → bed reserved + waitlist hold, NO bill yet; once
--       academic payments reach the threshold the bill is generated (stage 1)
--       and the move waits for it to be fully paid (stage 2)
--     * zero/negative upgrade fee (matrix 0 or fee diff <= 0) → nothing to pay
--       → instant move once threshold met
--
--   Cleanup: hold expiry (hourly cron) and leave-waitlist now also CANCEL the
--   linked upgrade bill when it is unpaid with no receipts; bills with any
--   payment are left for office follow-up.
--
-- Replaces the instant-when-threshold-met behavior of 20260611150000 and the
-- ungated first booking of 20260612140000. fn_cl_process_upgrade_holds gains
-- first-booking support (it previously failed with 'No active allocation to
-- upgrade from' for held first bookings). All function bodies rebuilt from the
-- live definitions checked 2026-06-12.
-- =============================================================================

-- 1) Schema: waitlist row links its pending upgrade bill ------------------------
ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS upgrade_bill_id uuid
    REFERENCES public.billing_student_bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hostel_waitlist.upgrade_bill_id IS
  'Upgrade-fee bill that must be FULLY paid before the held room upgrade confirms. NULL until the academic threshold is met (bill is generated at that point).';

-- 2) _cl_apply_upgrade_fee_bill now returns the created bill id -----------------
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text, p_upgrade_amount numeric, p_description text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_bcat uuid; v_bill_id uuid;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'bill_id',NULL,'old_bill_id',NULL);
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);
  INSERT INTO billing_student_bills (
    student_id, institution_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  ) RETURNING id INTO v_bill_id;
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'bill_id',v_bill_id,'old_bill_id',NULL);
END $function$;

-- 3) First-booking executor (extracted from fn_self_upgrade_room_category so the
--    holds-processor can confirm held FIRST bookings too) -----------------------
CREATE OR REPLACE FUNCTION public._cl_execute_first_booking(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid,
  p_from_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bed_status text; v_inst uuid; v_ay uuid; v_sem uuid; v_tier uuid;
  v_block uuid; v_new_alloc uuid;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'Held bed is no longer reserved';
    END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'That bed is no longer available';
    END IF;
  END IF;

  SELECT institution_id, semester_id, academic_year_id INTO v_inst, v_sem, v_ay
    FROM learners_profiles WHERE id = p_lp;
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
    v_inst, p_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, p_profile,
    (SELECT user_id FROM user_block_access WHERE block_id=v_block AND revoked_at IS NULL LIMIT 1)
  ) RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;
  -- learners_profiles.hostel_category_id / mess_category_id set by
  -- trg_allocation_sync_learner_categories. No bill on a first booking.

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'booked',
    'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'new_category_id', p_new_category_id);
END $function$;

REVOKE EXECUTE ON FUNCTION public._cl_execute_first_booking(uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, authenticated, PUBLIC;

-- 4) Mover: never double-bill — skip billing when the waitlist row already
--    carries the upgrade bill (pay-to-confirm path bills up front) --------------
CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(
  p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid,
  p_from_hold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb; v_linked_bill uuid;
BEGIN
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  -- Re-checked here (not only in the public RPC): a hold can be confirmed days
  -- later, after the learner's current category has already changed.
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'Held bed is no longer reserved';
    END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'That bed is no longer available';
    END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = p_lp;

  -- Pay-to-confirm: the bill was generated when the bed was reserved (or at
  -- threshold-met time by the holds processor). Bill here ONLY when no linked
  -- bill exists (e.g. zero-fee instant path, or legacy callers).
  SELECT upgrade_bill_id INTO v_linked_bill FROM hostel_waitlist
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting'
     AND upgrade_bill_id IS NOT NULL
   LIMIT 1;
  IF v_linked_bill IS NULL THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
                format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
  ELSE
    v_upgrade_fee := NULL;
    v_bill := jsonb_build_object('action','linked','bill_id',v_linked_bill);
  END IF;

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc,
         held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = p_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'state', 'upgraded',
    'old_allocation_id', v_old.id, 'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;

-- 5) Self-service RPC: threshold gate + pay-to-confirm --------------------------
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
  v_cur_name text; v_new_name text;
  v_gate jsonb; v_hold_days int; v_bed_status text; v_existing uuid;
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb; v_has_alloc boolean;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid; v_meets boolean;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can book or upgrade a room';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
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

  v_gate := public._cl_upgrade_threshold_check(v_lp, p_new_category_id);
  v_meets := (v_gate->>'meets')::boolean;

  -- ── FIRST BOOKING: threshold met → instant; below → bed hold + waitlist ──────
  IF NOT v_has_alloc AND v_meets THEN
    v_result := public._cl_execute_first_booking(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('new_fee', v_new_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  -- ── UPGRADE, threshold met, nothing to pay → instant move ────────────────────
  IF v_has_alloc THEN
    SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
      WHERE hostel_year_id = v_year AND is_active
        AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
    v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
    IF v_meets AND COALESCE(v_upgrade_fee, 0) <= 0 THEN
      v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
      RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
    END IF;
  END IF;

  -- ── HOLD: reserve the bed and wait (for threshold and/or upgrade-fee payment)
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  -- One upgrade intent per learner: release every held bed, decline waiting
  -- entries for OTHER target categories, and cancel their unpaid linked bills
  -- (bills with any receipt are left for office follow-up).
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = v_profile AND w.entry_kind='upgrade' AND w.status='waiting'
     AND w.target_hostel_category_id <> p_new_category_id
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id <> p_new_category_id;
  UPDATE hostel_waitlist
     SET held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
     AND target_hostel_category_id = p_new_category_id AND held_bed_id IS NOT NULL;

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

  -- ── UPGRADE + threshold met: bill the upgrade fee NOW; confirm on full payment
  IF v_has_alloc AND v_meets THEN
    SELECT upgrade_bill_id INTO v_bill_id FROM hostel_waitlist WHERE id = v_existing;
    IF v_bill_id IS NULL THEN
      v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
                  format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
      v_bill_id := (v_bill->>'bill_id')::uuid;
      UPDATE hostel_waitlist SET upgrade_bill_id = v_bill_id, updated_at=now() WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('success', true, 'state', 'pending_payment',
      'waitlist_id', v_existing, 'upgrade_bill_id', v_bill_id, 'upgrade_fee', v_upgrade_fee,
      'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
      'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
      'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
      'old_fee', v_cur_fee, 'new_fee', v_new_fee);
  END IF;

  -- ── Below threshold (first booking or upgrade): plain waitlist hold ──────────
  RETURN jsonb_build_object('success', true, 'state', 'waitlisted',
    'waitlist_id', v_existing,
    'threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct',
    'total_billed', v_gate->'total_billed', 'total_paid', v_gate->'total_paid',
    'hold_expires_at', v_expires, 'held_room_id', p_room_id, 'held_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_upgrade_room_category(uuid, uuid, uuid) TO authenticated;

-- 6) Holds processor: two-stage confirm engine (runs on every receipt item) ------
CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
  v_has_alloc boolean; v_year uuid; v_cur_cat uuid; v_cur_fee numeric;
  v_new_fee numeric; v_cur_name text; v_new_name text;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid;
  v_bill_amount numeric; v_bill_paid numeric; v_bill_status text;
BEGIN
  -- Bridge: waitlist/allocations key on profiles.id; billing keys on learners_profiles.id
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;

  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;

      v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status='active');

      -- Held FIRST booking: confirms as soon as the academic threshold is met.
      IF NOT v_has_alloc THEN
        PERFORM public._cl_execute_first_booking(
          v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      -- Held UPGRADE, stage 1: threshold just met but no upgrade bill yet —
      -- generate (and link) it; confirmation waits for it to be fully paid.
      v_bill_id := v_row.upgrade_bill_id;
      IF v_bill_id IS NOT NULL THEN
        SELECT final_amount, status INTO v_bill_amount, v_bill_status
          FROM billing_student_bills WHERE id = v_bill_id;
        IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN
          v_bill_id := NULL;  -- bill vanished/cancelled externally → re-bill
        END IF;
      END IF;
      IF v_bill_id IS NULL THEN
        SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = p_student_lp;
        SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
          WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_new_fee FROM hostel_fees
          WHERE hostel_category_id = v_row.target_hostel_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
        SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
          WHERE hostel_year_id = v_year AND is_active
            AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = v_row.target_hostel_category_id LIMIT 1;
        v_upgrade_fee := COALESCE(v_upgrade_fee, COALESCE(v_new_fee,0) - COALESCE(v_cur_fee,0));

        IF COALESCE(v_upgrade_fee, 0) <= 0 THEN
          -- Nothing to pay → confirm straight away.
          PERFORM public._cl_execute_room_upgrade(
            v_profile, p_student_lp, v_row.target_hostel_category_id,
            v_row.held_room_id, v_row.held_bed_id, true);
          v_count := v_count + 1;
          CONTINUE;
        END IF;

        SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
        SELECT name INTO v_new_name FROM hostel_categories WHERE id = v_row.target_hostel_category_id;
        v_bill := public._cl_apply_upgrade_fee_bill(p_student_lp, v_year, 'hostel', v_upgrade_fee,
                    format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
        UPDATE hostel_waitlist SET upgrade_bill_id = (v_bill->>'bill_id')::uuid, updated_at=now()
         WHERE id = v_row.id;
        CONTINUE;  -- stage 2 happens when this bill's payments arrive
      END IF;

      -- Held UPGRADE, stage 2: confirm only when the upgrade bill is FULLY paid.
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid
        FROM billing_receipt_items ri WHERE ri.bill_id = v_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        PERFORM public._cl_execute_room_upgrade(
          v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Leave the hold in place; expiry will clean it up if it never resolves.
      RAISE WARNING 'fn_cl_process_upgrade_holds: % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;
  RETURN v_count;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_process_upgrade_holds(uuid) FROM anon, authenticated, PUBLIC;

-- 7) Hold expiry: also cancel the linked unpaid upgrade bill ---------------------
CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  -- held_room_id/held_bed_id are kept on expired rows as an audit trail;
  -- the status transition itself is the idempotency stamp.
  WITH expired AS (
    UPDATE hostel_waitlist
       SET status='expired', updated_at=now()
     WHERE entry_kind='upgrade' AND status='waiting'
       AND held_bed_id IS NOT NULL AND hold_expires_at < now()
     RETURNING held_bed_id, upgrade_bill_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e
    WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  ), bills_cancelled AS (
    -- Unpaid + zero receipts only; partially paid bills are left for office
    -- follow-up (money was collected against them).
    UPDATE billing_student_bills bb
       SET status='cancelled', updated_at=now()
    FROM expired e
    WHERE bb.id = e.upgrade_bill_id AND bb.status='unpaid'
      AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id)
    RETURNING bb.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_expire_upgrade_holds() FROM anon, authenticated, PUBLIC;

-- 8) Leaving the waitlist cancels the linked unpaid bill + releases the bed ------
CREATE OR REPLACE FUNCTION public.fn_self_leave_upgrade_waitlist(p_target_category_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = auth.uid()
     AND entry_kind = 'upgrade'
     AND target_hostel_category_id = p_target_category_id
     AND status = 'waiting';
  RETURN FOUND;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_self_leave_upgrade_waitlist(uuid) TO authenticated;

-- 9) Waitlist list RPC exposes the pending upgrade bill (new OUT cols → DROP) ----
DROP FUNCTION IF EXISTS public.fn_my_upgrade_waitlist();
CREATE FUNCTION public.fn_my_upgrade_waitlist()
RETURNS TABLE(
  waitlist_id uuid, target_category_id uuid, target_category_name text,
  status text, created_at timestamptz,
  held_room_id uuid, held_room_number text, held_block_name text, held_bed_number text,
  hold_expires_at timestamptz, threshold_pct numeric, paid_pct numeric,
  upgrade_bill_id uuid, upgrade_fee_amount numeric, upgrade_fee_paid numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.target_hostel_category_id, c.name, w.status::text, w.created_at,
         w.held_room_id, r.room_number, bl.name, b.bed_number,
         w.hold_expires_at, c.upgrade_threshold_pct,
         (SELECT pp.paid_pct FROM fn_learner_academic_payment_progress(get_my_learner_id()) pp),
         w.upgrade_bill_id,
         bill.final_amount,
         (SELECT COALESCE(SUM(ri.amount_paid),0) FROM billing_receipt_items ri WHERE ri.bill_id = w.upgrade_bill_id)
  FROM hostel_waitlist w
  LEFT JOIN hostel_categories c ON c.id = w.target_hostel_category_id
  LEFT JOIN hostel_rooms r ON r.id = w.held_room_id
  LEFT JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_beds b ON b.id = w.held_bed_id
  LEFT JOIN billing_student_bills bill ON bill.id = w.upgrade_bill_id
  WHERE w.learner_id = auth.uid()
    AND w.entry_kind = 'upgrade'
    AND w.status IN ('waiting','offered')
  ORDER BY w.created_at DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() TO authenticated;
