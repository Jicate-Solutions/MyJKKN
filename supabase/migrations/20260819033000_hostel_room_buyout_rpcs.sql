-- ============================================================================
-- Room buyout — quote, request, consent, activate, release
-- ============================================================================
-- 2026-08-13. Companion to 20260819032000 (schema + lock).
--
-- Every amount comes from fn_settle_room_annual_cost and is combined exactly as
-- computeFeeBreakdown does: each term rounded separately, then summed, then the
-- resident's own bed deducted. No arithmetic is invented here, and none is
-- accepted from the client.
-- ============================================================================

-- ── Quote ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_buyout_quote(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year_id   uuid;
  v_cost      jsonb;
  v_capacity  int;
  v_occupants int;
  v_per_bed   numeric;
  v_settled   numeric;
  v_amount    numeric;
  v_live      record;
BEGIN
  -- Own-room scope. fn_user_allocated_room is deliberately NOT reused here: it
  -- ignores check_out_date, so a learner who has since moved out would still be
  -- able to price — and later act on — the room she used to live in.
  IF NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
        WHERE a.room_id = p_room_id
          AND a.check_out_date IS NULL
          AND a.learner_id = auth.uid())
     AND NOT fn_settle_can_manage(p_room_id, 'campus_living.fees.view') THEN
    RAISE EXCEPTION 'permission denied: you are not a resident of this room'
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'mechanism_disabled',
                              'room_id', p_room_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hostel_rooms r
    JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE r.id = p_room_id AND hc.settle_billing_enabled
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'category_not_in_scope',
                              'room_id', p_room_id);
  END IF;

  v_year_id := fn_settle_current_hostel_year();
  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_hostel_year',
                              'room_id', p_room_id);
  END IF;

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    RETURN jsonb_build_object('eligible', false, 'reason', v_cost->>'reason',
                              'room_id', p_room_id);
  END IF;

  v_capacity := (v_cost->>'capacity')::int;
  v_per_bed  := (v_cost->>'per_bed_annual_rate')::numeric;

  SELECT COUNT(*)::int INTO v_occupants
  FROM hostel_allocations a
  WHERE a.room_id = p_room_id AND a.check_out_date IS NULL;

  IF v_occupants = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_occupants',
                              'room_id', p_room_id);
  END IF;

  v_settled := round((v_cost->>'base_room_annual')::numeric / v_occupants)
             + round((v_cost->>'ac_room_annual')::numeric   / v_occupants);
  v_amount  := GREATEST(0, v_settled - v_per_bed);

  SELECT b.id, b.status INTO v_live
  FROM hostel_room_buyouts b
  WHERE b.room_id = p_room_id
    AND b.status IN ('pending_consent','active')
  LIMIT 1;

  RETURN jsonb_build_object(
    'eligible',            v_amount > 0 AND v_live.id IS NULL,
    'reason',              CASE
                             WHEN v_live.id IS NOT NULL THEN 'buyout_already_live'
                             WHEN v_amount <= 0         THEN 'room_full'
                             ELSE NULL
                           END,
    'room_id',             p_room_id,
    'hostel_year_id',      v_year_id,
    'capacity',            v_capacity,
    'occupants',           v_occupants,
    'empty_beds',          GREATEST(0, v_capacity - v_occupants),
    'per_bed_annual_rate', v_per_bed,
    'settled_share',       v_settled,
    'amount_per_resident', v_amount,
    -- More than one body in the room means everyone must agree: activation
    -- bills them all and removes their chance of the price falling later.
    'consent_required',    v_occupants > 1,
    'existing_buyout_id',  v_live.id,
    'existing_status',     v_live.status);
END;
$function$;

-- ── Activate: bill everyone who agreed, then hold the room ──────────────────
-- Internal. Never called directly by a screen — only by request (sole occupant)
-- or by the last consent to land.
CREATE OR REPLACE FUNCTION public._room_buyout_activate(p_buyout_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b         public.hostel_room_buyouts%ROWTYPE;
  v_cost      jsonb;
  v_occupants int;
  v_per_bed   numeric;
  v_settled   numeric;
  v_amount    numeric;
  v_bill_cat  uuid;
  v_due_days  int;
  v_lp_id     uuid;
  v_inst_id   uuid;
  v_bill_id   uuid;
  v_billed    int := 0;
  c           record;
BEGIN
  SELECT * INTO v_b FROM hostel_room_buyouts WHERE id = p_buyout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'buyout_id', p_buyout_id);
  END IF;
  IF v_b.status <> 'pending_consent' THEN
    RETURN jsonb_build_object('status', v_b.status, 'buyout_id', p_buyout_id);
  END IF;

  v_bill_cat := fn_settle_billing_category();
  IF v_bill_cat IS NULL THEN
    RETURN jsonb_build_object('status', 'no_billing_category', 'buyout_id', p_buyout_id);
  END IF;

  -- RE-DERIVE. The request's figure is a quote, not an authority: residents may
  -- have arrived or left while consent was being collected. Billing a number
  -- nobody agreed to is worse than making them ask again.
  v_cost := fn_settle_room_annual_cost(v_b.room_id, v_b.hostel_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    UPDATE hostel_room_buyouts
       SET status = 'cancelled', cancelled_reason = COALESCE(v_cost->>'reason','no_rate')
     WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'cancelled', 'buyout_id', p_buyout_id,
                              'reason', v_cost->>'reason');
  END IF;

  v_per_bed := (v_cost->>'per_bed_annual_rate')::numeric;

  SELECT COUNT(*)::int INTO v_occupants
  FROM hostel_allocations a
  WHERE a.room_id = v_b.room_id AND a.check_out_date IS NULL;

  IF v_occupants = 0 THEN
    UPDATE hostel_room_buyouts
       SET status = 'cancelled', cancelled_reason = 'no_occupants'
     WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'cancelled', 'buyout_id', p_buyout_id,
                              'reason', 'no_occupants');
  END IF;

  v_settled := round((v_cost->>'base_room_annual')::numeric / v_occupants)
             + round((v_cost->>'ac_room_annual')::numeric   / v_occupants);
  v_amount  := GREATEST(0, v_settled - v_per_bed);

  IF v_amount <= 0 THEN
    -- The room filled while they were deciding. There is nothing left to buy,
    -- and that is the outcome they wanted anyway.
    UPDATE hostel_room_buyouts
       SET status = 'cancelled', cancelled_reason = 'room_filled'
     WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'cancelled', 'buyout_id', p_buyout_id,
                              'reason', 'room_filled');
  END IF;

  IF v_amount <> v_b.amount_per_resident THEN
    UPDATE hostel_room_buyouts
       SET status = 'cancelled', cancelled_reason = 'occupancy_changed'
     WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'cancelled', 'buyout_id', p_buyout_id,
                              'reason', 'occupancy_changed',
                              'quoted', v_b.amount_per_resident, 'now', v_amount);
  END IF;

  v_due_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.bill_due_days', 5));

  FOR c IN
    SELECT k.id AS consent_id, k.allocation_id, k.learner_id
    FROM hostel_room_buyout_consents k
    JOIN hostel_allocations a ON a.id = k.allocation_id
    WHERE k.buyout_id = p_buyout_id
      AND k.decision = 'agreed'
      AND a.check_out_date IS NULL
    ORDER BY k.created_at
  LOOP
    SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = c.learner_id;
    CONTINUE WHEN v_lp_id IS NULL;   -- not a learner: cannot be billed

    -- A flat hostel package does not divide by occupancy, so its holder has
    -- nothing to settle. Same exclusion the sweep biller applies.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        COALESCE(campus_living_resolve_hostel_fee(v_lp_id, v_b.hostel_year_id), '[]'::jsonb)
      ) itm WHERE itm->>'fee_source' = 'hostel_package'
    );

    -- Same dedup key the sweep uses, so the two paths cannot both bill her.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id       = v_lp_id
        AND b.hostel_year_id   = v_b.hostel_year_id
        AND b.item_category_id = v_bill_cat
        AND b.fee_source       = 'hostel_category'
        AND b.status NOT IN ('cancelled','superseded')
    );

    SELECT lp.institution_id INTO v_inst_id
    FROM learners_profiles lp WHERE lp.id = v_lp_id;

    INSERT INTO billing_student_bills
      (student_id, institution_id, item_category_id, hostel_year_id, fee_source,
       bill_description, due_date, quantity, unit_amount, total_amount,
       final_amount, balance_amount, status)
    VALUES
      (v_lp_id, v_inst_id, v_bill_cat, v_b.hostel_year_id, 'hostel_category',
       'Room buyout: ' || (v_b.capacity_at_request - v_occupants)
         || ' empty bed' || CASE WHEN (v_b.capacity_at_request - v_occupants) = 1 THEN '' ELSE 's' END
         || ' held for exclusive use',
       (now() + make_interval(days => v_due_days))::date,
       1, v_amount, v_amount, v_amount, v_amount, 'unpaid')
    RETURNING id INTO v_bill_id;

    UPDATE hostel_room_buyout_consents SET bill_id = v_bill_id WHERE id = c.consent_id;
    v_billed := v_billed + 1;
  END LOOP;

  UPDATE hostel_room_buyouts
     SET status = 'active', activated_at = now(), occupants_at_request = v_occupants
   WHERE id = p_buyout_id;

  -- Close any open settle window on this room: it has just been settled by
  -- hand, and leaving the window open would put the room back in the sweep's
  -- due list where the dedup guard would have to catch it a second time.
  UPDATE hostel_room_settle_windows
     SET status = 'billed', billed_at = now(), occupants_at_billing = v_occupants
   WHERE room_id = v_b.room_id
     AND hostel_year_id = v_b.hostel_year_id
     AND status = 'open';

  RETURN jsonb_build_object('status', 'active', 'buyout_id', p_buyout_id,
                            'room_id', v_b.room_id,
                            'amount_per_resident', v_amount,
                            'bills_raised', v_billed);
END;
$function$;

-- ── Request ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_buyout_request(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q        jsonb;
  v_me       uuid := auth.uid();
  v_alloc    uuid;
  v_hours    int;
  v_buyout   uuid;
  v_inst     uuid;
  v_others   int;
  a          record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'permission denied: no signed-in learner' USING ERRCODE = '42501';
  END IF;

  SELECT a2.id INTO v_alloc
  FROM hostel_allocations a2
  WHERE a2.room_id = p_room_id AND a2.check_out_date IS NULL AND a2.learner_id = v_me
  LIMIT 1;

  IF v_alloc IS NULL THEN
    RAISE EXCEPTION 'permission denied: you are not a resident of this room'
      USING ERRCODE = '42501';
  END IF;

  v_q := fn_room_buyout_quote(p_room_id);
  IF NOT (v_q->>'eligible')::boolean THEN
    RETURN jsonb_build_object('status', 'refused', 'reason', v_q->>'reason', 'quote', v_q);
  END IF;

  v_hours := GREATEST(1, fn_get_policy_int('hostel.settle_bill.buyout_consent_hours', 48));

  SELECT lp.institution_id INTO v_inst
  FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = v_me;

  INSERT INTO hostel_room_buyouts
    (room_id, hostel_year_id, institution_id, requested_by_learner_id,
     capacity_at_request, occupants_at_request, empty_beds,
     amount_per_resident, status, consent_deadline)
  VALUES
    (p_room_id, (v_q->>'hostel_year_id')::uuid, v_inst, v_me,
     (v_q->>'capacity')::int, (v_q->>'occupants')::int, (v_q->>'empty_beds')::int,
     (v_q->>'amount_per_resident')::numeric, 'pending_consent',
     now() + make_interval(hours => v_hours))
  RETURNING id INTO v_buyout;

  -- One consent row per CURRENT resident. The requester's is already agreed —
  -- asking her to confirm what she just asked for is noise.
  FOR a IN
    SELECT a2.id AS allocation_id, a2.learner_id
    FROM hostel_allocations a2
    WHERE a2.room_id = p_room_id AND a2.check_out_date IS NULL
  LOOP
    INSERT INTO hostel_room_buyout_consents
      (buyout_id, allocation_id, learner_id, decision, decided_at)
    VALUES
      (v_buyout, a.allocation_id, a.learner_id,
       CASE WHEN a.learner_id = v_me THEN 'agreed' ELSE 'pending' END,
       CASE WHEN a.learner_id = v_me THEN now() ELSE NULL END);
  END LOOP;

  SELECT COUNT(*)::int INTO v_others
  FROM hostel_room_buyout_consents
  WHERE buyout_id = v_buyout AND decision = 'pending';

  -- Sole occupant: nobody else to ask, so it takes effect at once.
  IF v_others = 0 THEN
    RETURN _room_buyout_activate(v_buyout) || jsonb_build_object('quote', v_q);
  END IF;

  RETURN jsonb_build_object('status', 'pending_consent', 'buyout_id', v_buyout,
                            'awaiting', v_others, 'quote', v_q);
END;
$function$;

-- ── Respond ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_room_buyout_respond(p_buyout_id uuid, p_agree boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_b       public.hostel_room_buyouts%ROWTYPE;
  v_consent uuid;
  v_pending int;
BEGIN
  SELECT * INTO v_b FROM hostel_room_buyouts WHERE id = p_buyout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'buyout_id', p_buyout_id);
  END IF;

  IF v_b.status <> 'pending_consent' THEN
    RETURN jsonb_build_object('status', v_b.status, 'buyout_id', p_buyout_id);
  END IF;

  IF now() > v_b.consent_deadline THEN
    UPDATE hostel_room_buyouts SET status = 'expired' WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'expired', 'buyout_id', p_buyout_id);
  END IF;

  SELECT k.id INTO v_consent
  FROM hostel_room_buyout_consents k
  WHERE k.buyout_id = p_buyout_id AND k.learner_id = v_me;

  IF v_consent IS NULL THEN
    RAISE EXCEPTION 'permission denied: you were not asked to agree to this buyout'
      USING ERRCODE = '42501';
  END IF;

  UPDATE hostel_room_buyout_consents
     SET decision = CASE WHEN p_agree THEN 'agreed' ELSE 'declined' END,
         decided_at = now()
   WHERE id = v_consent;

  -- One refusal ends it. The others are not billed, and the room stays open.
  IF NOT p_agree THEN
    UPDATE hostel_room_buyouts
       SET status = 'declined', cancelled_reason = 'roommate_declined'
     WHERE id = p_buyout_id;
    RETURN jsonb_build_object('status', 'declined', 'buyout_id', p_buyout_id);
  END IF;

  SELECT COUNT(*)::int INTO v_pending
  FROM hostel_room_buyout_consents
  WHERE buyout_id = p_buyout_id AND decision = 'pending';

  IF v_pending > 0 THEN
    RETURN jsonb_build_object('status', 'pending_consent', 'buyout_id', p_buyout_id,
                              'awaiting', v_pending);
  END IF;

  RETURN _room_buyout_activate(p_buyout_id);
END;
$function$;

-- ── Release: give the beds back ─────────────────────────────────────────────
-- Staff only. Deliberately does NOT reverse the bill: the room was genuinely
-- held, and cancelling money is a billing decision taken in the billing module
-- with its own audit trail, not a side effect of unlocking a door.
CREATE OR REPLACE FUNCTION public.fn_room_buyout_release(p_buyout_id uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.hostel_room_buyouts%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM hostel_room_buyouts WHERE id = p_buyout_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'buyout_id', p_buyout_id);
  END IF;

  IF NOT fn_settle_can_manage(v_b.room_id, 'campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  IF v_b.status NOT IN ('pending_consent','active') THEN
    RETURN jsonb_build_object('status', v_b.status, 'buyout_id', p_buyout_id);
  END IF;

  UPDATE hostel_room_buyouts
     SET status = 'released', released_at = now(), released_by = auth.uid(),
         release_reason = p_reason
   WHERE id = p_buyout_id;

  RETURN jsonb_build_object('status', 'released', 'buyout_id', p_buyout_id,
                            'room_id', v_b.room_id);
END;
$function$;

-- ── Learner-facing reads ────────────────────────────────────────────────────
-- Her own room's countdown. Own-room scoped: returns nothing rather than
-- raising, so a resident of a room with no window simply sees no deadline.
CREATE OR REPLACE FUNCTION public.fn_my_room_settle_window()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'window_id',        w.id,
           'room_id',          w.room_id,
           'opened_at',        w.opened_at,
           'current_deadline', w.current_deadline,
           'hard_deadline',    w.hard_deadline,
           'restart_count',    w.restart_count,
           'status',           w.status)
  FROM hostel_room_settle_windows w
  JOIN hostel_allocations a
    ON a.room_id = w.room_id
   AND a.check_out_date IS NULL
   AND a.learner_id = auth.uid()
  WHERE w.status = 'open'
  ORDER BY w.current_deadline
  LIMIT 1;
$function$;

-- anon AND PUBLIC on every one. Revoking only anon is a no-op: Postgres grants
-- EXECUTE to PUBLIC on each new function and anon is a member of PUBLIC, so the
-- RPC would stay callable with the publishable key that ships in the client
-- bundle. These four write money or read another learner's room, so the
-- distinction is not academic.
REVOKE EXECUTE ON FUNCTION public.fn_room_buyout_quote(uuid)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_room_buyout_request(uuid)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_room_buyout_respond(uuid, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_room_buyout_release(uuid, text)    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_room_settle_window()            FROM anon, PUBLIC;
-- Internal only: reached through request/respond, never from a screen. It bills
-- every consenting resident, so `authenticated` goes too.
REVOKE EXECUTE ON FUNCTION public._room_buyout_activate(uuid)           FROM anon, PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_room_buyout_quote(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_room_buyout_request(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_room_buyout_respond(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_room_buyout_release(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_room_settle_window()          TO authenticated;
