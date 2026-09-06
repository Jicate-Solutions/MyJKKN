-- ============================================================================
-- Empty-bed settlement — repair the settle biller before it ever bills anyone
-- ============================================================================
-- 2026-08-13.
--
-- The settle-then-bill engine (20260815060000) has never run: master switch off,
-- cron unscheduled, hostel_room_settle_windows empty. That is fortunate, because
-- it carried three defects that only a live run would have exposed.
--
--   1. FOREIGN KEY. fn_settle_bill_close wrote the ROOM's hostel_categories.id
--      into billing_student_bills.item_category_id, whose FK is
--      billing_categories(id) — validated, enforced, and sharing ZERO ids with
--      hostel_categories (0 of 12 checked 2026-08-13). The first live insert
--      would have died on 23503.
--
--   2. DEDUP GUARD. The same column mismatch made the double-bill guard compare
--      a hostel id against a billing id, so it was ALWAYS false. Fixing (1)
--      alone would therefore have converted a hard failure into silent
--      repeat-billing on every sweep. The two must be fixed together.
--
--   3. DOUBLE CHARGE. It billed the settled TOTAL. But every one of the 157
--      live fee_source='hostel_category' bills is an upgrade differential
--      ("Deluxe Room -> Premium Room" ₹7,500 = 42,500 − 35,000), which tops the
--      learner up to the per-bed rate on top of the base billed through the
--      admission fee structure. She already carries one bed. Charging her the
--      total bills that bed twice.
--
-- The charge is therefore INCREMENTAL — only the beds nobody is sleeping in:
--
--     empty_bed_charge = settled_share − per_bed_annual_rate,  floored at 0
--                      = per_bed × (capacity − occupants) / occupants
--
-- Premium Room, capacity 4, ₹42,500/bed:
--     1 occupant -> ₹1,27,500     2 -> ₹42,500 each
--     3 -> ₹14,167 each           4 -> ₹0 (nothing to settle)
--
-- Bills land on a DEDICATED billing category so Accounts can identify them at a
-- glance, and it is flagged visible_to_learners = false.
--
-- STILL SHIPS OFF. hostel.settle_bill.enabled remains false; nothing here arms
-- anything. CREATE OR REPLACE throughout — never DROP, which would discard the
-- functions' EXECUTE grants.
-- ============================================================================

-- ── 1. The settlement revenue head ──────────────────────────────────────────
-- Hidden from learners: lib/utils/billing/learner-visibility.ts filters it out
-- of /learners/my-bills and /api/parent/fees while leaving it fully billable,
-- payable and visible to Accounts. Receipts still total correctly — hidden
-- lines collapse into one "Other fees" row rather than vanishing.
INSERT INTO public.billing_categories
  (category_name, kind, frequency, collection_type, applies_to,
   visible_to_learners, once_per_learner, is_active, description)
SELECT
  'Hostel Empty Bed Settlement',
  'hostel'::billing_category_kind,
  'one-time',
  'management',
  '{college}'::text[],
  false,   -- learner-facing surfaces never name this head
  false,   -- a room can settle again in a later hostel year
  true,
  'Charge for the empty beds in an under-filled hostel room, raised by '
  || 'fn_settle_bill_close when a settle window closes or a learner buys out '
  || 'her room. INCREMENTAL only: the resident''s own bed is already billed '
  || 'through the admission fee structure plus her upgrade differential, so '
  || 'this head carries settled_share minus the per-bed rate. Never created by '
  || 'hand.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_categories
  WHERE category_name = 'Hostel Empty Bed Settlement'
);

-- Resolver, so neither the biller nor the credit path hardcodes the id.
CREATE OR REPLACE FUNCTION public.fn_settle_billing_category()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT bc.id
  FROM billing_categories bc
  WHERE bc.category_name = 'Hostel Empty Bed Settlement'
    AND bc.is_active
  ORDER BY bc.created_at
  LIMIT 1;
$function$;

-- anon AND PUBLIC. Revoking only anon is a no-op: Postgres grants EXECUTE to
-- PUBLIC on every new function and anon is a member of PUBLIC, so the function
-- stays callable with the publishable key embedded in the client bundle.
REVOKE EXECUTE ON FUNCTION public.fn_settle_billing_category() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_billing_category() TO authenticated;

-- ── 2. The biller ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_settle_bill_close(p_room_id uuid, p_dry_run boolean DEFAULT true, p_window_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window     public.hostel_room_settle_windows%ROWTYPE;
  v_year_id    uuid;
  v_cost       jsonb;
  v_capacity   int;
  v_occupants  int;
  v_due_days   int;
  v_base_share numeric;
  v_ac_share   numeric;
  v_settled    numeric;
  v_per_bed    numeric;
  v_share      numeric;
  v_category   uuid;   -- hostel_categories.id — the ROOM's category
  v_bill_cat   uuid;   -- billing_categories.id — the revenue head
  v_lines      jsonb := '[]'::jsonb;
  v_billed     int := 0;
  v_skipped    int := 0;
  a            record;
  v_lp_id      uuid;
  v_inst_id    uuid;
  v_exists     boolean;
BEGIN
  -- Defense in depth: even a hand-made live call is refused while the master
  -- switch is off. The switch gates MONEY, not the practice run — a dry run
  -- writes nothing, so it must work while the mechanism is off.
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

  IF v_year_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_hostel_year', 'room_id', p_room_id,
                              'window_id', v_window.id);
  END IF;

  -- The revenue head must exist before anything is priced. Writing a NULL
  -- item_category_id would produce an unidentifiable bill that the dedup guard
  -- below could never match again, so refuse instead and leave the window open.
  v_bill_cat := fn_settle_billing_category();
  IF v_bill_cat IS NULL THEN
    RETURN jsonb_build_object('status', 'no_billing_category', 'room_id', p_room_id,
                              'window_id', v_window.id,
                              'reason', 'billing_categories row "Hostel Empty Bed Settlement" is missing or inactive');
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
  v_per_bed  := (v_cost->>'per_bed_annual_rate')::numeric;

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
  v_settled    := v_base_share + v_ac_share;

  -- THE INCREMENT. She already carries one bed at the per-bed rate (admission
  -- fee structure + upgrade differential), so only the empty beds are new
  -- money. At full occupancy settled_share = per_bed exactly and this is 0.
  v_share := GREATEST(0, v_settled - v_per_bed);

  v_due_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.bill_due_days', 5));

  IF v_share <= 0 THEN
    -- Room is full (or the rate makes the empty beds free). Nothing is owed;
    -- close the window so the sweep stops returning it.
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
      'per_bed_annual_rate', v_per_bed,
      'base_room_annual',    (v_cost->>'base_room_annual')::numeric,
      'ac_room_annual',      (v_cost->>'ac_room_annual')::numeric,
      'ac_tonnage',          (v_cost->>'ac_tonnage')::numeric,
      'ac_base_inr_per_month_24h', (v_cost->>'ac_base_inr_per_month_24h')::numeric,
      'base_share',          v_base_share,
      'ac_share',            v_ac_share,
      'settled_share',       v_settled,
      'share_per_resident',  0,
      'due_date',            (now() + make_interval(days => v_due_days))::date,
      'billed_count',        0,
      'skipped_count',       0,
      'reason',              'nothing_to_settle',
      'lines',               '[]'::jsonb);
  END IF;

  FOR a IN
    SELECT al.id AS allocation_id, al.learner_id
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id AND al.check_out_date IS NULL
    ORDER BY al.check_in_date, al.id
  LOOP
    -- profiles(id) -> learners_profiles(id). Non-learner residents cannot be
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
    -- is one bundled package price that does not divide by occupancy. Detected
    -- by asking the canonical resolver rather than re-deriving its
    -- package-matching rules.
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

    -- Dedup on the SETTLEMENT head, in its own id domain. The previous version
    -- compared a hostel_categories.id against item_category_id
    -- (billing_categories.id) and so was always false — it could not see its own
    -- prior bills. It also matched fee_source 'academic', which would now skip
    -- every learner holding an upgrade differential, i.e. everyone in a premium
    -- room. Scoped tightly to what THIS function writes.
    SELECT EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id       = v_lp_id
        AND b.hostel_year_id   = v_year_id
        AND b.item_category_id = v_bill_cat
        AND b.fee_source       = 'hostel_category'
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
        (v_lp_id, v_inst_id, v_bill_cat, v_year_id, 'hostel_category',
         'Hostel empty-bed settlement: ' || (v_capacity - v_occupants)
           || ' of ' || v_capacity || ' beds empty at ' || v_occupants || ' occupant'
           || CASE WHEN v_occupants = 1 THEN '' ELSE 's' END,
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
    'hostel_category_id',  v_category,
    'billing_category_id', v_bill_cat,
    'per_bed_annual_rate', v_per_bed,
    'base_room_annual',    (v_cost->>'base_room_annual')::numeric,
    'ac_room_annual',      (v_cost->>'ac_room_annual')::numeric,
    'ac_tonnage',          (v_cost->>'ac_tonnage')::numeric,
    'ac_base_inr_per_month_24h', (v_cost->>'ac_base_inr_per_month_24h')::numeric,
    'base_share',          v_base_share,
    'ac_share',            v_ac_share,
    -- settled_share is what she would owe for the room in total at this
    -- occupancy; share_per_resident is what is actually BILLED, i.e. the empty
    -- beds only. The TS parity gate re-derives the first and subtracts the
    -- per-bed rate to reach the second.
    'settled_share',       v_settled,
    'share_per_resident',  v_share,
    'due_date',            (now() + make_interval(days => v_due_days))::date,
    'billed_count',        v_billed,
    'skipped_count',       v_skipped,
    'lines',               v_lines);
END;
$function$;

-- ── 3. Late-join credit: same domain bug, one line ──────────────────────────
-- The credit itself needs no rescaling. It is a DELTA between two shares, and
-- the per-bed deduction is a constant subtracted from both:
--     (share_before − per_bed) − (share_after − per_bed) = share_before − share_after
-- so the arithmetic, and verifyLateJoinEvent in settle-bill-service.ts, stand
-- unchanged. Nor can it over-credit: the entitlement telescopes to
-- share(n_billed) − share(n_now), and share(n_now) >= per_bed always, so it can
-- never exceed the billed share(n_billed) − per_bed.
--
-- What WAS broken is the eligibility test — "was she actually billed for this
-- room" compared a hostel_categories.id against item_category_id, was therefore
-- always false, and CONTINUEd past every resident. Nobody could ever have been
-- credited.
CREATE OR REPLACE FUNCTION public.fn_settle_late_join_credit(p_room_id uuid, p_dry_run boolean DEFAULT true, p_window_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window       public.hostel_room_settle_windows%ROWTYPE;
  v_year_id      uuid;
  v_year_end     date;
  v_cost         jsonb;
  v_bill_cat     uuid;
  v_base         numeric;
  v_ac           numeric;
  v_n_billed     int;
  v_n_before     int;
  v_n_after      int;
  v_live         int;
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
  IF NOT p_dry_run AND NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false)'
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_settle_can_manage(p_room_id, 'campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

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

  v_bill_cat := fn_settle_billing_category();
  IF v_bill_cat IS NULL THEN
    RETURN jsonb_build_object('status', 'no_billing_category', 'room_id', p_room_id,
                              'window_id', v_window.id);
  END IF;

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    RETURN jsonb_build_object('status', 'no_rate', 'room_id', p_room_id,
                              'window_id', v_window.id, 'reason', v_cost->>'reason');
  END IF;
  v_base := (v_cost->>'base_room_annual')::numeric;
  v_ac   := (v_cost->>'ac_room_annual')::numeric;

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
    SELECT COUNT(*)::int INTO v_n_after
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id
      AND al.created_at <= j.created_at
      AND (al.check_out_date IS NULL OR al.check_out_date > j.created_at::date);

    v_n_after  := GREATEST(1, v_n_after);
    v_n_before := GREATEST(v_n_billed, v_n_after - 1);
    v_n_after  := GREATEST(v_n_billed, v_n_after);

    v_share_before := round(v_base / v_n_before) + round(v_ac / v_n_before);
    v_share_after  := round(v_base / v_n_after)  + round(v_ac / v_n_after);
    v_delta        := GREATEST(0, v_share_before - v_share_after);

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
        AND al.created_at <= v_window.billed_at
      ORDER BY al.check_in_date, al.id
    LOOP
      v_lp_id := NULL;
      IF r.learner_id IS NOT NULL THEN
        SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = r.learner_id;
      END IF;
      CONTINUE WHEN v_lp_id IS NULL;

      -- Only residents who actually hold a settlement bill for this room can be
      -- credited against it. Compared on the settlement head, in its own id
      -- domain — the previous predicate used the hostel category id and so was
      -- never true, silently skipping every resident.
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM billing_student_bills b
        WHERE b.student_id       = v_lp_id
          AND b.hostel_year_id   = v_year_id
          AND b.item_category_id = v_bill_cat
          AND b.fee_source       = 'hostel_category'
          AND b.status NOT IN ('cancelled','superseded')
      );

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
           || '. Entitlement Rs ' || v_entitlement || ' less Rs ' || v_already
           || ' already credited = Rs ' || v_credit || '.');
        v_written := v_written + 1;
      END IF;

      v_credits := v_credits || jsonb_build_object(
        'learner_id', v_lp_id, 'allocation_id', r.allocation_id,
        'already_credited', v_already, 'amount', v_credit);
    END LOOP;
  END IF;

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
$function$;

-- ── Re-assert the lockdown on both replaced billers ─────────────────────────
-- CREATE OR REPLACE preserves existing grants, so these are already correct in
-- the database. Restated here so this migration is self-contained: read alone,
-- it must leave two money-writing SECURITY DEFINER functions unreachable by the
-- publishable key.
REVOKE EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean, uuid)       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean, uuid)       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean, uuid) TO authenticated, service_role;
