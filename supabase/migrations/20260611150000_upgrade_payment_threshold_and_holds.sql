-- =============================================================================
-- Payment-threshold-gated room category upgrades (My Hostel)
--
-- Per-category gate on self-service ROOM upgrades (mess stays instant):
--   * hostel_categories.upgrade_threshold_pct — % of the learner's CURRENT
--     academic-year academic bills that must be paid for instant confirmation.
--     NULL = no gate (existing instant behavior). FAIL-CLOSED: a learner with
--     no AY-tagged academic bills does NOT meet any non-NULL threshold.
--   * hostel_categories.upgrade_hold_days — how long a below-threshold
--     reservation is held (default 5 days).
--
-- Below threshold: the chosen bed is hard-reserved (bed status 'reserved' —
-- hidden from every picker/auto-allocation, which all filter 'available'),
-- and the learner's hostel_waitlist upgrade entry records the hold
-- (held_room_id/held_bed_id/hold_expires_at). No allocation change, no bill.
--
-- Auto-confirm: trg_cl_upgrade_holds_after_payment on billing_receipt_items
-- re-checks the threshold on EVERY payment (gateway callbacks and office
-- cash/cheque receipts both insert receipt items) and executes the held
-- upgrade via _cl_execute_room_upgrade — which also generates the upgrade
-- bill (_cl_apply_upgrade_fee_bill). Paid amounts are summed from
-- billing_receipt_items (NOT billing_student_bills.balance_amount) so the
-- check is correct regardless of trigger firing order on that table
-- (trigger_update_bill_status_on_payment refreshes the balance and fires
-- alphabetically AFTER this trigger).
--
-- Expiry: fn_cl_expire_upgrade_holds() flips stale holds to 'expired' and
-- releases the reserved beds; called by the Vercel cron
-- /api/cron/campus-living/upgrade-hold-expiry (hourly).
--
-- The atomic move+bill block formerly inline in fn_self_upgrade_room_category
-- is extracted into _cl_execute_room_upgrade(profile, lp, …) because the
-- auto-confirm path runs as the receipt-creating user (office staff/service
-- role), where auth.uid()/get_my_learner_id() are NOT the upgrading learner.
-- =============================================================================

-- 1) Schema -------------------------------------------------------------------
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS upgrade_threshold_pct numeric
    CHECK (upgrade_threshold_pct >= 0 AND upgrade_threshold_pct <= 100),
  ADD COLUMN IF NOT EXISTS upgrade_hold_days integer NOT NULL DEFAULT 5
    CHECK (upgrade_hold_days BETWEEN 1 AND 60);

COMMENT ON COLUMN public.hostel_categories.upgrade_threshold_pct IS
  'Min % of current-academic-year academic bills paid for an instant room upgrade into this category. NULL = no gate. Below it the booking is held on the waitlist.';
COMMENT ON COLUMN public.hostel_categories.upgrade_hold_days IS
  'Days a below-threshold upgrade reservation (held bed) survives before auto-expiry.';

ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS held_room_id uuid REFERENCES public.hostel_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS held_bed_id uuid REFERENCES public.hostel_beds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

-- 2) Academic payment progress (learner's current academic year ONLY) ----------
CREATE OR REPLACE FUNCTION public.fn_learner_academic_payment_progress(p_learner_id uuid)
RETURNS TABLE(total_billed numeric, total_paid numeric, paid_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Same bill scoping as fn_learner_current_year_academic_fee. Paid is summed
  -- from receipt items so the result is already correct inside AFTER INSERT
  -- triggers on billing_receipt_items, before the bill balance refreshes.
  -- No qualifying bills => NULL paid_pct => caller fails CLOSED (user decision).
  SELECT SUM(b.final_amount),
         SUM(COALESCE(p.paid, 0)),
         CASE WHEN SUM(b.final_amount) > 0
              THEN ROUND(100.0 * SUM(COALESCE(p.paid, 0)) / SUM(b.final_amount), 2)
         END
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN LATERAL (
    SELECT SUM(ri.amount_paid) AS paid
    FROM billing_receipt_items ri
    WHERE ri.bill_id = b.id
  ) p ON true
  WHERE b.student_id = p_learner_id
    AND b.fee_source = 'academic'
    AND b.status NOT IN ('cancelled','superseded')
    AND b.academic_year_id = lp.academic_year_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_learner_academic_payment_progress(uuid) TO authenticated;

-- Internal: does the learner meet the target category's threshold?
CREATE OR REPLACE FUNCTION public._cl_upgrade_threshold_check(p_learner_lp uuid, p_target_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold numeric; v_total numeric; v_paid numeric; v_pct numeric;
BEGIN
  SELECT upgrade_threshold_pct INTO v_threshold FROM hostel_categories WHERE id = p_target_category_id;
  SELECT pp.total_billed, pp.total_paid, pp.paid_pct INTO v_total, v_paid, v_pct
  FROM fn_learner_academic_payment_progress(p_learner_lp) pp;
  RETURN jsonb_build_object(
    'threshold_pct', v_threshold, 'paid_pct', v_pct,
    'total_billed', v_total, 'total_paid', v_paid,
    'meets', (v_threshold IS NULL) OR (v_pct IS NOT NULL AND v_pct >= v_threshold));
END $function$;

REVOKE EXECUTE ON FUNCTION public._cl_upgrade_threshold_check(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- 3) Canonical mover (atomic move + upgrade bill), explicit identities ----------
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
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb;
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

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(p_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));

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

REVOKE EXECUTE ON FUNCTION public._cl_execute_room_upgrade(uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, authenticated, PUBLIC;

-- 4) Self-service RPC: threshold-gated (instant when met, reserved hold when not)
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
  v_inst uuid; v_ay uuid; v_expires timestamptz; v_result jsonb;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status = 'active') THEN
    RAISE EXCEPTION 'You have no active allocation to upgrade from';
  END IF;

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

  IF (v_gate->>'meets')::boolean THEN
    v_result := public._cl_execute_room_upgrade(v_profile, v_lp, p_new_category_id, p_room_id, p_bed_id, false);
    RETURN v_result || jsonb_build_object('threshold_pct', v_gate->'threshold_pct', 'paid_pct', v_gate->'paid_pct');
  END IF;

  -- Below threshold: hard-reserve the bed and wait for payment ----------------
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

-- 5) Leaving the waitlist releases the held bed --------------------------------
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

-- 6) List RPCs gain threshold/hold columns (new OUT cols => DROP + CREATE) ------
DROP FUNCTION IF EXISTS public.fn_my_upgrade_room_categories();
CREATE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE(
  category_id uuid, name text, type text, current_year_fee numeric, upgrade_fee numeric,
  available_beds integer, threshold_pct numeric, paid_pct numeric, meets_threshold boolean,
  hold_days integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
  WHERE c.is_active AND c.allocation_mode = 'manual'
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND c.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount > v_cur_fee
  ORDER BY hf.amount;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_room_categories() TO authenticated;

DROP FUNCTION IF EXISTS public.fn_my_upgrade_waitlist();
CREATE FUNCTION public.fn_my_upgrade_waitlist()
RETURNS TABLE(
  waitlist_id uuid, target_category_id uuid, target_category_name text,
  status text, created_at timestamptz,
  held_room_id uuid, held_room_number text, held_block_name text, held_bed_number text,
  hold_expires_at timestamptz, threshold_pct numeric, paid_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT w.id, w.target_hostel_category_id, c.name, w.status::text, w.created_at,
         w.held_room_id, r.room_number, bl.name, b.bed_number,
         w.hold_expires_at, c.upgrade_threshold_pct,
         (SELECT pp.paid_pct FROM fn_learner_academic_payment_progress(get_my_learner_id()) pp)
  FROM hostel_waitlist w
  LEFT JOIN hostel_categories c ON c.id = w.target_hostel_category_id
  LEFT JOIN hostel_rooms r ON r.id = w.held_room_id
  LEFT JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_beds b ON b.id = w.held_bed_id
  WHERE w.learner_id = auth.uid()
    AND w.entry_kind = 'upgrade'
    AND w.status IN ('waiting','offered')
  ORDER BY w.created_at DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_my_upgrade_waitlist() TO authenticated;

-- 7) Auto-confirm held upgrades when payments reach the threshold ----------------
CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
BEGIN
  -- Bridge: waitlist/allocations key on profiles.id; billing keys on learners_profiles.id
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_student_lp;
  IF v_profile IS NULL THEN RETURN 0; END IF;

  FOR v_row IN
    SELECT id, target_hostel_category_id, held_room_id, held_bed_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NOT NULL AND hold_expires_at > now()
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF (v_gate->>'meets')::boolean THEN
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

CREATE OR REPLACE FUNCTION public._on_receipt_item_process_upgrade_holds()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
BEGIN
  -- Never fail a receipt because of upgrade processing.
  BEGIN
    SELECT br.student_id INTO v_student_id
    FROM public.billing_receipts br
    WHERE br.id = NEW.receipt_id;
    IF v_student_id IS NOT NULL THEN
      PERFORM public.fn_cl_process_upgrade_holds(v_student_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_on_receipt_item_process_upgrade_holds: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cl_upgrade_holds_after_payment ON public.billing_receipt_items;
CREATE TRIGGER trg_cl_upgrade_holds_after_payment
AFTER INSERT ON public.billing_receipt_items
FOR EACH ROW EXECUTE FUNCTION public._on_receipt_item_process_upgrade_holds();

-- 8) Expire stale holds (cron: /api/cron/campus-living/upgrade-hold-expiry) -----
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
     RETURNING held_bed_id
  ), released AS (
    UPDATE hostel_beds b SET status='available'
    FROM expired e
    WHERE b.id = e.held_bed_id AND b.status='reserved'
    RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM expired;
  RETURN COALESCE(v_count, 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_expire_upgrade_holds() FROM anon, authenticated, PUBLIC;
