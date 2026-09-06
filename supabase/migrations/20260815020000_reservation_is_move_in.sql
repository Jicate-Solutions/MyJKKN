-- A reservation IS the move-in — the category-upgrade hold flow stops evicting non-payers.
-- ----------------------------------------------------------------------------
-- DIRECTOR'S RULES (2026-08-07, locked — rank 4 of the upgrade-lifecycle plan):
--   * the old bed is freed THE MOMENT she reserves
--   * the reservation counts as MOVED IN
--   * a learner who never pays KEEPS the room and owes the full premium rate
--   * the unpaid amount JOINS HER FEE DUES (the platform's overdue-fee policy
--     applies to it like any other bill)
--   * the 5-day window stays — as a PAYMENT window only
--   Consequence: nobody is ever moved out for non-payment.
--
-- WHERE EACH FLOW ALREADY STANDS (verified against pg_get_functiondef dumps of
-- the LIVE database, 2026-08-07 ~01:25 IST — the repo and ledger are stale for
-- function bodies):
--   * fn_premium_upgrade_accept — conforms since PR #2890 (move + old bed freed
--     with check_out_date stamped). Untouched here.
--   * _cl_upgrade_room_category (room-picked upgrades) — ALREADY move-now in
--     the live body: it clears prior holds and calls _cl_execute_room_upgrade /
--     _cl_execute_first_booking immediately; the payment threshold is
--     reporting-only and no payment gates the move. Old bed freed with
--     check_out_date per #2890. Nothing left to change — NOT replaced here.
--   * The CATEGORY-upgrade waitlist-hold flow is the one that still evicts:
--     fn_cl_expire_upgrade_holds flips lapsed 'waiting' holds to 'expired',
--     releases any reserved bed and CANCELS the unpaid upgrade bill — i.e. a
--     non-payer loses the upgrade. The Director inverted exactly this.
--
-- WHAT THIS MIGRATION CHANGES (functions only — NO data is written at apply
-- time; the 22 currently-waiting holds converge to moved-in on the next run of
-- the hourly cron /api/cron/campus-living/upgrade-hold-expiry):
--   1. fn_cl_expire_upgrade_holds — for waiting rows past hold_expires_at,
--      CONFIRM the move instead of expiring it. Held-bed rows complete the
--      physical move via _cl_execute_room_upgrade / _cl_execute_first_booking
--      (both honor the hostel_allocations_room_bed_active_uidx contract:
--      check_out_date is stamped in the same statement that vacates — the
--      95-ghost-beds incident, PR #2890). Category-only rows have their
--      optimistic category flip made permanent. The bed is NOT released, the
--      bill is NOT cancelled, the category is NOT reverted. Unpaid bills stay
--      'unpaid'/'partially_paid' — receiptable like any fee bill (the normal
--      receipts flow already targets exactly those statuses), so part-payments
--      keep routing to them and the overdue-fee policy applies.
--   2. fn_cl_process_upgrade_holds — idempotency guard: if the learner already
--      holds the active allocation on the held room/bed (the expiry cron may
--      have confirmed the move first), stamp the waitlist row 'allocated'
--      instead of double-allocating. The partial unique index would refuse the
--      duplicate INSERT; the error must not be the control flow.
--
-- DELIBERATELY UNCHANGED (all verified in the live dumps):
--   * _cl_upgrade_category_only — the reserve step (optimistic flip + bill +
--     payment window) already matches "the reservation counts as moved in".
--   * fn_self_leave_upgrade_waitlist / fn_cl_admin_cancel_upgrade — explicit
--     decline/cancel actions remain; the Director's rule is about NON-PAYMENT,
--     not about removing the ability to cancel. The admin path can NOT cancel
--     a bill that has payments (double guard: status='unpaid' AND no receipt
--     items), so no paid money is ever stranded by a cancel.
--   * No backfill of previously-'expired'/'cancelled' holds — Director ruled
--     no restore.
--
-- Both bodies below start from the live pg_get_functiondef dumps verbatim and
-- change only what the rule requires (fn_cl_expire_upgrade_holds necessarily
-- becomes a loop: confirming a move needs per-row calls into the PL/pgSQL
-- executors, which a single set-based CTE cannot do).
-- ----------------------------------------------------------------------------

-- ============ 1. Expiry cron: lapsed payment window ⇒ CONFIRM the move ======
-- (live body 2026-08-07 was the expire/release/cancel/revert CTE; replaced)

CREATE OR REPLACE FUNCTION public.fn_cl_expire_upgrade_holds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD; v_lp uuid; v_alloc uuid; v_count int := 0;
BEGIN
  -- Director's rule (2026-08-07): a reservation IS the move-in. When the
  -- payment window (hold_expires_at) lapses the move is CONFIRMED, never
  -- undone: the held bed is not released, the upgrade bill is not cancelled,
  -- the category is not reverted. The unpaid bill simply remains part of the
  -- learner's fee dues. Nobody is moved out for non-payment.
  FOR v_row IN
    SELECT w.id, w.learner_id, w.target_hostel_category_id,
           w.held_room_id, w.held_bed_id
    FROM hostel_waitlist w
    WHERE w.entry_kind='upgrade' AND w.status='waiting'
      AND w.hold_expires_at IS NOT NULL AND w.hold_expires_at < now()
    ORDER BY w.created_at
  LOOP
    BEGIN
      SELECT lp.id INTO v_lp
        FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id
       WHERE p.id = v_row.learner_id;
      IF v_lp IS NULL THEN
        RAISE WARNING 'fn_cl_expire_upgrade_holds: no learners_profile for % (waitlist %)',
          v_row.learner_id, v_row.id;
        CONTINUE;
      END IF;

      IF v_row.held_bed_id IS NOT NULL THEN
        -- Room hold (pre-change transition rows): complete the move onto the
        -- held bed. _cl_execute_room_upgrade vacates the old allocation with
        -- check_out_date stamped in the same statement (the partial-index
        -- contract of hostel_allocations_room_bed_active_uidx, PR #2890),
        -- links the existing upgrade bill instead of re-billing, and marks
        -- this waitlist row 'allocated'.
        SELECT a.id INTO v_alloc FROM hostel_allocations a
         WHERE a.learner_id = v_row.learner_id AND a.status = 'active'
           AND a.room_id = v_row.held_room_id AND a.bed_id = v_row.held_bed_id
         LIMIT 1;
        IF v_alloc IS NOT NULL THEN
          -- Already living on the held bed — just stamp the confirmation.
          UPDATE hostel_waitlist
             SET status='allocated', allocated_allocation_id=v_alloc,
                 held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
           WHERE id = v_row.id;
        ELSIF EXISTS (SELECT 1 FROM hostel_allocations
                       WHERE learner_id = v_row.learner_id AND status = 'active') THEN
          PERFORM public._cl_execute_room_upgrade(v_row.learner_id, v_lp,
            v_row.target_hostel_category_id, v_row.held_room_id, v_row.held_bed_id, true);
        ELSE
          PERFORM public._cl_execute_first_booking(v_row.learner_id, v_lp,
            v_row.target_hostel_category_id, v_row.held_room_id, v_row.held_bed_id, true);
        END IF;
      ELSE
        -- Category-only hold: the optimistic flip at reserve time IS the
        -- move-in. Make it permanent — the same statements the paid-confirm
        -- branch of fn_cl_process_upgrade_holds runs. The bill stays as dues.
        UPDATE learners_profiles
           SET hostel_category_id = v_row.target_hostel_category_id,
               pending_hostel_category_id = NULL, updated_at=now()
         WHERE id = v_lp;
        UPDATE hostel_waitlist SET status='allocated', updated_at=now() WHERE id = v_row.id;
      END IF;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- e.g. a transition row whose held bed was given away before this rule
      -- shipped ("Held bed is no longer reserved"): the row stays 'waiting',
      -- a warning surfaces, the next run retries. fn_cl_admin_cancel_upgrade
      -- remains the manual resolution tool for those.
      RAISE WARNING 'fn_cl_expire_upgrade_holds: % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  RETURN v_count;
END $function$;

-- Service-role only (hourly cron); same ACL the live function carries.
REVOKE EXECUTE ON FUNCTION public.fn_cl_expire_upgrade_holds() FROM anon, authenticated, PUBLIC;

-- ============ 2. Payment-confirm path: idempotent against the cron ==========
-- (live body 2026-08-07 reproduced VERBATIM; the ONLY change is the guard at
-- the top of the held-bed loop plus its v_existing_alloc declaration)

CREATE OR REPLACE FUNCTION public.fn_cl_process_upgrade_holds(p_student_lp uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid; v_row RECORD; v_gate jsonb; v_count int := 0;
  v_has_alloc boolean; v_year uuid; v_cur_cat uuid; v_cur_fee numeric;
  v_new_fee numeric; v_cur_name text; v_new_name text;
  v_upgrade_fee numeric; v_bill jsonb; v_bill_id uuid;
  v_bill_amount numeric; v_bill_paid numeric; v_bill_status text;
  v_existing_alloc uuid;
BEGIN
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
      -- 2026-08-15: idempotency — if the learner already lives on the held
      -- bed (the expiry cron confirms lapsed reservations as move-ins now),
      -- stamp the row instead of double-allocating. The partial unique index
      -- hostel_allocations_room_bed_active_uidx would refuse the duplicate
      -- INSERT, and that error must not be the control flow.
      SELECT id INTO v_existing_alloc FROM hostel_allocations
       WHERE learner_id = v_profile AND status = 'active'
         AND room_id = v_row.held_room_id AND bed_id = v_row.held_bed_id
       LIMIT 1;
      IF v_existing_alloc IS NOT NULL THEN
        UPDATE hostel_waitlist
           SET status='allocated', allocated_allocation_id=v_existing_alloc,
               held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
         WHERE id = v_row.id;
        v_count := v_count + 1; CONTINUE;
      END IF;
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;
      v_has_alloc := EXISTS (SELECT 1 FROM hostel_allocations WHERE learner_id = v_profile AND status='active');
      IF NOT v_has_alloc THEN
        PERFORM public._cl_execute_first_booking(v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1; CONTINUE;
      END IF;
      v_bill_id := v_row.upgrade_bill_id;
      IF v_bill_id IS NOT NULL THEN
        SELECT final_amount, status INTO v_bill_amount, v_bill_status FROM billing_student_bills WHERE id = v_bill_id;
        IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN v_bill_id := NULL; END IF;
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
          PERFORM public._cl_execute_room_upgrade(v_profile, p_student_lp, v_row.target_hostel_category_id,
            v_row.held_room_id, v_row.held_bed_id, true);
          v_count := v_count + 1; CONTINUE;
        END IF;
        SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
        SELECT name INTO v_new_name FROM hostel_categories WHERE id = v_row.target_hostel_category_id;
        v_bill := public._cl_apply_upgrade_fee_bill(p_student_lp, v_year, 'hostel', v_upgrade_fee,
                    format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));
        UPDATE hostel_waitlist SET upgrade_bill_id = (v_bill->>'bill_id')::uuid, updated_at=now() WHERE id = v_row.id;
        CONTINUE;
      END IF;
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid FROM billing_receipt_items ri WHERE ri.bill_id = v_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        PERFORM public._cl_execute_room_upgrade(v_profile, p_student_lp, v_row.target_hostel_category_id,
          v_row.held_room_id, v_row.held_bed_id, true);
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_cl_process_upgrade_holds (room): % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  FOR v_row IN
    SELECT id, target_hostel_category_id, upgrade_bill_id
    FROM hostel_waitlist
    WHERE learner_id = v_profile AND entry_kind='upgrade' AND status='waiting'
      AND held_bed_id IS NULL AND upgrade_bill_id IS NOT NULL
    ORDER BY created_at
  LOOP
    BEGIN
      v_gate := public._cl_upgrade_threshold_check(p_student_lp, v_row.target_hostel_category_id);
      IF NOT (v_gate->>'meets')::boolean THEN CONTINUE; END IF;
      SELECT final_amount, status INTO v_bill_amount, v_bill_status FROM billing_student_bills WHERE id = v_row.upgrade_bill_id;
      IF v_bill_amount IS NULL OR v_bill_status IN ('cancelled','superseded') THEN CONTINUE; END IF;
      SELECT COALESCE(SUM(ri.amount_paid),0) INTO v_bill_paid FROM billing_receipt_items ri WHERE ri.bill_id = v_row.upgrade_bill_id;
      IF v_bill_paid >= v_bill_amount THEN
        UPDATE learners_profiles SET hostel_category_id = v_row.target_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_student_lp;
        UPDATE hostel_waitlist SET status='allocated', updated_at=now() WHERE id = v_row.id;
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_cl_process_upgrade_holds (category): % (waitlist %)', SQLERRM, v_row.id;
    END;
  END LOOP;

  RETURN v_count;
END $function$;

-- Service-role only (fired by the receipt-item trigger, which is SECURITY
-- DEFINER itself); same ACL the live function carries.
REVOKE EXECUTE ON FUNCTION public.fn_cl_process_upgrade_holds(uuid) FROM anon, authenticated, PUBLIC;
