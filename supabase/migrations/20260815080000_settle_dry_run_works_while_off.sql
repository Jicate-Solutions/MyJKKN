-- =============================================================================
-- The practice run must work while the mechanism is switched OFF.
-- Created: 2026-08-10 · FILE ONLY — apply is Director-gated.
--
-- Director's precondition (interview 2026-08-10): "the system works out every
-- bill it WOULD send and writes nothing. I read the list, and only then do we
-- do it for real." As shipped in 20260815060000 that was impossible: the
-- master-switch check in fn_settle_bill_close (line ~693) and
-- fn_settle_late_join_credit (line ~954) sat ABOVE the p_dry_run branch, so a
-- dry run raised 42501 while the switch was off. You had to arm the mechanism
-- to preview it — exactly backwards.
--
-- This moves the gate so it guards the LIVE path only. A dry run writes nothing
-- and now runs regardless of the switch; authorization (fn_settle_can_manage)
-- is unchanged and still applies to both paths.
--
-- Bodies below are the merged definitions VERBATIM; only the gate line changed.
-- fn_settle_window_open is deliberately NOT touched: opening a window is a real
-- write, so it stays behind the switch.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_settle_bill_close(
  p_room_id   uuid,
  p_dry_run   boolean DEFAULT true,
  p_window_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window     public.hostel_room_settle_windows%ROWTYPE;
  v_year_id    uuid;
  v_cost       jsonb;
  v_capacity   int;
  v_occupants  int;
  v_due_days   int;
  v_base_share numeric;
  v_ac_share   numeric;
  v_share      numeric;
  v_category   uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_billed     int := 0;
  v_skipped    int := 0;
  a            record;
  v_lp_id      uuid;
  v_inst_id    uuid;
  v_exists     boolean;
BEGIN
  -- Defense in depth: even a hand-made live call is refused while the master
  -- switch is off. This RAISEs rather than returning, so a caller that ignores
  -- return values still cannot bill anyone.
  -- 2026-08-10: the switch gates MONEY, not the practice run. A dry run writes
  -- nothing, so it must work while the mechanism is off — that is the whole
  -- point of reading the practice list BEFORE arming anything. Previously this
  -- check sat above the p_dry_run branch and refused even a preview, which made
  -- the Director's stated precondition impossible to satisfy.
  IF NOT p_dry_run AND NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false)'
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_settle_can_manage(p_room_id, 'campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  -- Bill the window the caller was handed, not "the oldest open one on this
  -- room". The unique index is per (room, hostel year), so a room with open
  -- windows in two hostel years would otherwise be billed against the wrong
  -- year — wrong rate, wrong dedup key — and the window that actually came due
  -- would be left open.
  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND w.status = 'open'
    AND (p_window_id IS NULL OR w.id = p_window_id)
  ORDER BY w.opened_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_window
    FROM hostel_room_settle_windows w
    WHERE w.room_id = p_room_id AND w.status = 'billed'
    ORDER BY w.billed_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_billed', 'room_id', p_room_id,
                                'window_id', v_window.id, 'billed_at', v_window.billed_at,
                                'occupants_at_billing', v_window.occupants_at_billing);
    END IF;
    RETURN jsonb_build_object('status', 'no_open_window', 'room_id', p_room_id);
  END IF;

  v_year_id := COALESCE(v_window.hostel_year_id, fn_settle_current_hostel_year());

  -- Refuse rather than stamp a NULL hostel_year_id: the dedup key against
  -- campus_living_generate_hostel_year_bills compares hostel_year_id, and NULL
  -- never matches, so a NULL-year bill would defeat the double-bill guard.
  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_hostel_year', 'room_id', p_room_id,
                              'window_id', v_window.id);
  END IF;

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    -- Missing rate config: leave the window OPEN so an admin can fix the
    -- configuration and the room bills on the next sweep. Never bill ₹0.
    RETURN jsonb_build_object('status', 'no_rate', 'room_id', p_room_id,
                              'window_id', v_window.id, 'reason', v_cost->>'reason');
  END IF;

  v_capacity := (v_cost->>'capacity')::int;
  v_category := (v_cost->>'category_id')::uuid;

  -- Occupancy exactly as v_hostel_room_occupancy defines it.
  SELECT COUNT(*)::int INTO v_occupants
  FROM hostel_allocations al
  WHERE al.room_id = p_room_id AND al.check_out_date IS NULL;

  IF v_occupants = 0 THEN
    -- Everyone left before the window closed. There is nobody to bill; close it
    -- as cancelled so the sweep stops returning it forever.
    IF NOT p_dry_run THEN
      UPDATE hostel_room_settle_windows SET status = 'cancelled' WHERE id = v_window.id;
    END IF;
    RETURN jsonb_build_object('status', 'no_occupants', 'room_id', p_room_id,
                              'window_id', v_window.id, 'dry_run', p_dry_run);
  END IF;

  -- computeFeeBreakdown parity: each term rounded separately, then summed.
  v_base_share := round((v_cost->>'base_room_annual')::numeric / v_occupants);
  v_ac_share   := round((v_cost->>'ac_room_annual')::numeric   / v_occupants);
  v_share      := v_base_share + v_ac_share;

  v_due_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.bill_due_days', 5));

  FOR a IN
    SELECT al.id AS allocation_id, al.learner_id
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id AND al.check_out_date IS NULL
    ORDER BY al.check_in_date, al.id
  LOOP
    -- profiles(id) → learners_profiles(id). Non-learner residents cannot be
    -- billed through the learner billing tables; they are reported, not billed.
    v_lp_id := NULL;
    IF a.learner_id IS NOT NULL THEN
      SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = a.learner_id;
    END IF;

    IF v_lp_id IS NULL THEN
      v_skipped := v_skipped + 1;
      v_lines := v_lines || jsonb_build_object(
        'allocation_id', a.allocation_id, 'profile_id', a.learner_id,
        'action', 'skipped', 'reason', 'not_a_learner', 'amount', 0);
      CONTINUE;
    END IF;

    SELECT lp.institution_id INTO v_inst_id
    FROM learners_profiles lp WHERE lp.id = v_lp_id;

    -- A learner on a FLAT PACKAGE is not settle-billable at all: her hostel fee
    -- is one bundled package price that does not divide by occupancy. Worse,
    -- the generate path keys package bills on package_id and would not see a
    -- 'hostel_category' row at all — so billing her here is a straight
    -- DOUBLE-BILL of the room. Detected by asking the canonical resolver rather
    -- than re-deriving its package-matching rules.
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
             COALESCE(campus_living_resolve_hostel_fee(v_lp_id, v_year_id), '[]'::jsonb)
           ) AS itm
      WHERE itm->>'fee_source' = 'hostel_package'
    ) INTO v_exists;

    IF v_exists THEN
      v_skipped := v_skipped + 1;
      v_lines := v_lines || jsonb_build_object(
        'allocation_id', a.allocation_id, 'learner_id', v_lp_id,
        'action', 'skipped', 'reason', 'flat_package', 'amount', 0);
      CONTINUE;
    END IF;

    -- Same dedup key campus_living_generate_hostel_year_bills uses, so the two
    -- paths cannot both bill this room to this learner.
    SELECT EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id      = v_lp_id
        AND b.hostel_year_id  = v_year_id
        AND b.item_category_id = v_category
        AND b.fee_source IN ('academic','hostel_category')
        AND b.status NOT IN ('cancelled','superseded')
    ) INTO v_exists;

    IF v_exists THEN
      v_skipped := v_skipped + 1;
      v_lines := v_lines || jsonb_build_object(
        'allocation_id', a.allocation_id, 'learner_id', v_lp_id,
        'action', 'skipped', 'reason', 'already_billed', 'amount', 0);
      CONTINUE;
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO billing_student_bills
        (student_id, institution_id, item_category_id, hostel_year_id, fee_source,
         bill_description, due_date, quantity, unit_amount, total_amount,
         final_amount, balance_amount, status)
      VALUES
        (v_lp_id, v_inst_id, v_category, v_year_id, 'hostel_category',
         'Hostel room share (settled at ' || v_occupants || ' of ' || v_capacity || ' occupants)',
         (now() + make_interval(days => v_due_days))::date,
         1, v_share, v_share, v_share, v_share, 'unpaid');
    END IF;

    v_billed := v_billed + 1;
    v_lines := v_lines || jsonb_build_object(
      'allocation_id', a.allocation_id, 'learner_id', v_lp_id,
      'action', CASE WHEN p_dry_run THEN 'would_bill' ELSE 'billed' END,
      'amount', v_share);
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE hostel_room_settle_windows
       SET status = 'billed', billed_at = now(), occupants_at_billing = v_occupants
     WHERE id = v_window.id;
  END IF;

  RETURN jsonb_build_object(
    'status',              'closed',
    'dry_run',             p_dry_run,
    'room_id',             p_room_id,
    'window_id',           v_window.id,
    'hostel_year_id',      v_year_id,
    'capacity',            v_capacity,
    'active_occupants',    v_occupants,
    'per_bed_annual_rate', (v_cost->>'per_bed_annual_rate')::numeric,
    'base_room_annual',    (v_cost->>'base_room_annual')::numeric,
    'ac_room_annual',      (v_cost->>'ac_room_annual')::numeric,
    'ac_tonnage',          (v_cost->>'ac_tonnage')::numeric,
    'ac_base_inr_per_month_24h', (v_cost->>'ac_base_inr_per_month_24h')::numeric,
    'base_share',          v_base_share,
    'ac_share',            v_ac_share,
    'share_per_resident',  v_share,
    'due_date',            (now() + make_interval(days => v_due_days))::date,
    'billed_count',        v_billed,
    'skipped_count',       v_skipped,
    'lines',               v_lines);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_settle_late_join_credit(
  p_room_id   uuid,
  p_dry_run   boolean DEFAULT true,
  p_window_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window       public.hostel_room_settle_windows%ROWTYPE;
  v_year_id      uuid;
  v_year_end     date;
  v_cost         jsonb;
  v_category     uuid;
  v_base         numeric;
  v_ac           numeric;
  v_n_billed     int;   -- occupants the residents were BILLED at
  v_n_before     int;   -- clamped occupancy just before one arrival
  v_n_after      int;   -- clamped occupancy just after that arrival
  v_live         int;   -- active occupants RIGHT NOW
  v_entitlement  numeric := 0;
  v_already      numeric;
  v_processed    uuid[] := '{}'::uuid[];
  v_share_before numeric;
  v_share_after  numeric;
  v_delta        numeric;
  v_remaining    int;
  v_credit       numeric;
  v_events       jsonb := '[]'::jsonb;
  v_credits      jsonb;
  v_written      int := 0;
  j              record;
  r              record;
  v_lp_id        uuid;
BEGIN
  -- 2026-08-10: the switch gates MONEY, not the practice run. A dry run writes
  -- nothing, so it must work while the mechanism is off — that is the whole
  -- point of reading the practice list BEFORE arming anything. Previously this
  -- check sat above the p_dry_run branch and refused even a preview, which made
  -- the Director's stated precondition impossible to satisfy.
  IF NOT p_dry_run AND NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false)'
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_settle_can_manage(p_room_id, 'campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  -- Credit the window the caller was handed. A room can hold billed windows in
  -- two hostel years; always taking the newest would stamp the older one's
  -- joiners never, leaving it in the due list on every sweep forever and
  -- computing against the wrong year's rate.
  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND w.status = 'billed'
    AND (p_window_id IS NULL OR w.id = p_window_id)
  ORDER BY w.billed_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_billed_window', 'room_id', p_room_id);
  END IF;

  v_year_id := COALESCE(v_window.hostel_year_id, fn_settle_current_hostel_year());
  SELECT hy.end_date INTO v_year_end FROM hostel_years hy WHERE hy.id = v_year_id;
  IF v_year_end IS NULL THEN
    RETURN jsonb_build_object('status', 'no_hostel_year', 'room_id', p_room_id,
                              'window_id', v_window.id);
  END IF;

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    RETURN jsonb_build_object('status', 'no_rate', 'room_id', p_room_id,
                              'window_id', v_window.id, 'reason', v_cost->>'reason');
  END IF;
  v_category := (v_cost->>'category_id')::uuid;
  v_base     := (v_cost->>'base_room_annual')::numeric;
  v_ac       := (v_cost->>'ac_room_annual')::numeric;

  -- ── Entitlement accumulates PER JOINING EVENT, capped at what she was billed
  -- Each arrival k contributes
  --     max(0, share(max(n_billed, n_after_k − 1)) − share(max(n_billed, n_after_k)))
  --     × remaining_months(that arrival) / 12
  -- and a resident's total entitlement is the sum over every post-billing
  -- arrival still in the room. Each round tops her up toward that sum.
  --
  -- Both clamps are load-bearing, and each one fixes a case that a simpler
  -- formula gets wrong:
  --   * max(n_billed, …) is what makes DEPARTURES behave. A room billed at 2
  --     that loses one resident and gains another still holds 2 —
  --     share(2) − share(2) = 0, nobody is credited, which is right because she
  --     paid for a 2-person room and is in one. Reconstructing the step alone
  --     reads that same room as "1 → 2" and pays out a half-room credit that
  --     was never owed.
  --   * summing PER EVENT, each with its OWN month, is what stops a later
  --     arrival in a shorter month from dragging the whole target below what
  --     was already credited and permanently under-paying the earlier step.
  --     One target recomputed against a shifting anchor does exactly that.
  -- With nobody leaving, the sum telescopes to share(n_billed) − share(n_now),
  -- and re-running is inert: the entitlement is unchanged and the top-up is
  -- entitlement − already_credited = 0.
  SELECT COUNT(*)::int INTO v_live
  FROM hostel_allocations al
  WHERE al.room_id = p_room_id AND al.check_out_date IS NULL;

  v_n_billed := GREATEST(1, COALESCE(v_window.occupants_at_billing, 1));

  FOR j IN
    SELECT al.id AS allocation_id,
           COALESCE(al.check_in_date, al.created_at::date) AS join_date,
           al.created_at,
           NOT (al.id = ANY (v_window.credited_allocation_ids)) AS is_new
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id
      AND al.check_out_date IS NULL
      AND al.created_at > v_window.billed_at
    ORDER BY al.created_at, al.id
  LOOP
    -- Occupancy reconstructed at the instant this joiner arrived (includes her).
    SELECT COUNT(*)::int INTO v_n_after
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id
      AND al.created_at <= j.created_at
      AND (al.check_out_date IS NULL OR al.check_out_date > j.created_at::date);

    v_n_after  := GREATEST(1, v_n_after);
    v_n_before := GREATEST(v_n_billed, v_n_after - 1);
    v_n_after  := GREATEST(v_n_billed, v_n_after);

    -- Same two-term, separately-rounded shape as computeFeeBreakdown.
    v_share_before := round(v_base / v_n_before) + round(v_ac / v_n_before);
    v_share_after  := round(v_base / v_n_after)  + round(v_ac / v_n_after);
    v_delta        := GREATEST(0, v_share_before - v_share_after);

    -- remainingWholeMonths(joinDate, hostelYear) from hostel-fee-compute-service.ts:
    -- whole months from the month of joining through the hostel-year end,
    -- inclusive, clamped to [0, 12]. check_in_date is nullable, so the arrival
    -- timestamp is the fallback — a NULL must not silently forfeit the credit.
    v_remaining := (
      (EXTRACT(YEAR FROM v_year_end)::int * 12 + EXTRACT(MONTH FROM v_year_end)::int)
      - (EXTRACT(YEAR FROM j.join_date)::int * 12 + EXTRACT(MONTH FROM j.join_date)::int)
    ) + 1;
    v_remaining := GREATEST(0, LEAST(12, v_remaining));

    v_entitlement := v_entitlement + round(v_delta * v_remaining / 12.0);

    IF j.is_new THEN
      v_processed := v_processed || j.allocation_id;
    END IF;

    v_events := v_events || jsonb_build_object(
      'joiner_allocation_id', j.allocation_id,
      'joined_on',            j.join_date,
      'newly_processed',      j.is_new,
      'occupants_before',     v_n_before,
      'occupants_after',      v_n_after,
      'share_before',         v_share_before,
      'share_after',          v_share_after,
      'delta_annual',         v_delta,
      'remaining_months',     v_remaining,
      'contribution',         round(v_delta * v_remaining / 12.0));
  END LOOP;

  v_credits := '[]'::jsonb;

  IF v_entitlement > 0 THEN
    FOR r IN
      SELECT al.id AS allocation_id, al.learner_id
      FROM hostel_allocations al
      WHERE al.room_id = p_room_id
        AND al.check_out_date IS NULL
        AND al.created_at <= v_window.billed_at   -- billed cohort, not the joiners
      ORDER BY al.check_in_date, al.id
    LOOP
      v_lp_id := NULL;
      IF r.learner_id IS NOT NULL THEN
        SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = r.learner_id;
      END IF;
      CONTINUE WHEN v_lp_id IS NULL;

      -- Only residents who were ACTUALLY billed for this room can be credited
      -- against it. A resident with no hostel bill has nothing to reduce.
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM billing_student_bills b
        WHERE b.student_id       = v_lp_id
          AND b.hostel_year_id   = v_year_id
          AND b.item_category_id = v_category
          AND b.fee_source IN ('academic','hostel_category')
          AND b.status NOT IN ('cancelled','superseded')
      );

      -- What earlier rounds on THIS window already gave her.
      SELECT COALESCE(SUM(scb.amount), 0) INTO v_already
      FROM student_credit_balances scb
      WHERE scb.student_id = v_lp_id
        AND scb.source     = 'fee_structure_change'
        AND scb.source_event_id = ANY (v_window.credited_allocation_ids || v_processed);

      v_credit := GREATEST(0, v_entitlement - v_already);
      CONTINUE WHEN v_credit <= 0;

      IF NOT p_dry_run THEN
        INSERT INTO student_credit_balances
          (student_id, amount, source, source_event_id, is_consumed, notes)
        VALUES
          (v_lp_id, v_credit, 'fee_structure_change',
           COALESCE(v_processed[1], v_window.id), false,
           'Campus living settle-then-bill late join: billed at ' || v_n_billed
           || ' occupant(s), room now holds ' || v_live
           || '. Entitlement ₹' || v_entitlement || ' less ₹' || v_already
           || ' already credited = ₹' || v_credit || '.');
        v_written := v_written + 1;
      END IF;

      v_credits := v_credits || jsonb_build_object(
        'learner_id', v_lp_id, 'allocation_id', r.allocation_id,
        'already_credited', v_already, 'amount', v_credit);
    END LOOP;
  END IF;

  -- Mark every joining event this round actually EVALUATED, whether or not it
  -- produced a credit row. This is the idempotency record; a zero-credit round
  -- must never come back a second time. Every arrival above is evaluated —
  -- a NULL check_in_date falls back to the arrival timestamp rather than
  -- forfeiting the credit — so stamping here can never bury money.
  IF NOT p_dry_run AND array_length(v_processed, 1) IS NOT NULL THEN
    UPDATE hostel_room_settle_windows
       SET credited_allocation_ids = credited_allocation_ids || v_processed
     WHERE id = v_window.id;
  END IF;

  RETURN jsonb_build_object(
    'status',         'ok',
    'dry_run',        p_dry_run,
    'room_id',        p_room_id,
    'window_id',      v_window.id,
    'hostel_year_id', v_year_id,
    'billed_at',      v_window.billed_at,
    'occupants_at_billing', v_n_billed,
    'active_occupants',     v_live,
    'entitlement_per_resident', v_entitlement,
    'credits',        v_credits,
    'hostel_year_end_date', v_year_end,
    -- Compute primitives, so the TS wrapper can re-derive every share and every
    -- remaining-months figure below through computeFeeBreakdown /
    -- remainingWholeMonths instead of trusting this function's arithmetic.
    'capacity',            (v_cost->>'capacity')::int,
    'per_bed_annual_rate', (v_cost->>'per_bed_annual_rate')::numeric,
    'base_room_annual',    v_base,
    'ac_room_annual',      v_ac,
    'ac_tonnage',          (v_cost->>'ac_tonnage')::numeric,
    'ac_base_inr_per_month_24h', (v_cost->>'ac_base_inr_per_month_24h')::numeric,
    'events',         v_events,
    'events_processed', COALESCE(array_length(v_processed, 1), 0),
    'credits_written', v_written);
END;
$$;

-- Re-assert the ACLs (CREATE OR REPLACE preserves them; restated so a reader
-- can see the intended end state, and so the anon-lock CI gate is satisfied).
REVOKE EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean, uuid) TO authenticated;

DO $assert$
BEGIN
  -- Tripwire: a later CREATE OR REPLACE must not restore the preview-blocking gate.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_settle_bill_close','fn_settle_late_join_credit')
      AND pg_get_functiondef(p.oid) NOT LIKE '%IF NOT p_dry_run AND NOT fn_get_policy_bool%'
  ) THEN
    RAISE EXCEPTION 'a settle money-writer still gates its DRY RUN on the master switch';
  END IF;
END
$assert$;

