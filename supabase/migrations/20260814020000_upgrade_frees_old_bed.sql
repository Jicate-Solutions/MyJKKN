-- Room upgrades must actually release the learner's old bed.
-- ----------------------------------------------------------------------------
-- REPORTED BY A LEARNER, 2026-08-06: pressing "Reserve & pay" to move from a
-- Classic to a Premium room failed on her phone with the raw database text
--   duplicate key value violates unique constraint
--   "hostel_allocations_room_bed_active_uidx"
--
-- ROOT CAUSE. A hostel_allocations row carries TWO "the learner has left"
-- fields — `actual_vacate_date` and `check_out_date`. The uniqueness rule that
-- stops two learners occupying one bed reads ONLY the second one:
--
--   CREATE UNIQUE INDEX hostel_allocations_room_bed_active_uidx
--     ON hostel_allocations (room_id, bed_id) WHERE (check_out_date IS NULL);
--
-- Both upgrade routines vacate the old allocation with
--   SET status='vacated', actual_vacate_date=CURRENT_DATE
-- and never set `check_out_date`. So the old row keeps satisfying the index
-- predicate and goes on reserving (room_id, bed_id) forever, while
-- hostel_beds.status is set back to 'available'. The bed then reads FREE to
-- every screen and query, but any INSERT targeting it is rejected by the index.
-- The learner sees the constraint name.
--
-- The TypeScript vacate path already gets this right —
-- lib/services/campus-living/hostel-allocation-service.ts:419-434 sets both
-- fields and carries a comment naming this exact index. The two SQL routines
-- never got the same treatment.
--
-- MEASURED IMPACT (prod, 2026-08-06 21:30 IST): 75 beds stranded — every one in
-- a girls' block (Girls A 48, Girls B 15, Girls C 12), all reading
-- hostel_beds.status='available' with no active allocation. 63 were created by
-- the 5 Aug re-placement, 11 more the same day this was found, 1 in July: the
-- count grows with every upgrade, so this is a live leak, not a backlog.
-- The girls are the larger half of the 508 learners still waiting for a bed.
--
-- DIRECTOR'S RULE (2026-08-06): "once a learner upgrades to another bed, the
-- actual allotted bed can be freed up for other learners' allocation." This
-- migration is that rule — the code always intended it; only the missing field
-- stopped it working.
--
-- WHAT THIS CHANGES: `check_out_date` is stamped alongside `actual_vacate_date`
-- in both routines, and the already-stranded rows are repaired. Nothing else in
-- either routine is touched; both bodies are otherwise reproduced verbatim from
-- their live definitions (pg_get_functiondef, 2026-08-06).
--
-- NOT IN SCOPE (Director-decided the same evening, needs its own build):
-- releasing the old bed at RESERVE time rather than at completion, auto-placing
-- a learner whose upgrade lapses into any suitable free bed, top-of-queue when
-- none is free, and routing part-payments to standing fees. Those change
-- behaviour; this migration only makes the existing behaviour work.
-- ----------------------------------------------------------------------------

-- ============ PART A — stop the leak (both bodies reproduced verbatim from
-- pg_get_functiondef 2026-08-06; ONLY the vacate UPDATE differs) ============

CREATE OR REPLACE FUNCTION public._cl_execute_room_upgrade(p_profile uuid, p_lp uuid, p_new_category_id uuid, p_room_id uuid, p_bed_id uuid, p_from_hold boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF p_from_hold THEN
    IF v_bed_status IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'Held bed is no longer reserved'; END IF;
  ELSE
    IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;
  END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id, batch_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = p_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'No active allocation to upgrade from'; END IF;

  -- 2026-08-06: check_out_date is what hostel_allocations_room_bed_active_uidx
  -- reads. Without it the vacated row keeps reserving (room_id, bed_id) and the
  -- old bed can never be re-used, even though hostel_beds says 'available'.
  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE,
         check_out_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, batch_id
  )
  SELECT v_old.institution_id, p_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, p_profile, v_old.batch_id
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=p_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, pending_hostel_category_id = NULL, updated_at=now() WHERE id = p_lp;

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
                format('Hostel room upgrade: %s -> %s', COALESCE(v_cur_name,'-'), v_new_name));
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
END $function$
;

REVOKE EXECUTE ON FUNCTION public._cl_execute_room_upgrade(uuid, uuid, uuid, uuid, uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._cl_execute_room_upgrade(uuid, uuid, uuid, uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_premium_upgrade_accept(p_vacancy_id uuid, p_learner_id uuid, p_billed_inr integer, p_was_free boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vacancy        RECORD;
  v_old_alloc      RECORD;
  v_bed_status     text;
  v_new_alloc_id   uuid;
BEGIN
  -- 1. Load + lock the vacancy row (FOR UPDATE serialises concurrent accepts).
  SELECT id, institution_id, room_id, bed_id, block_id, room_category_id, status
    INTO v_vacancy
    FROM public.hostel_premium_vacancies
    WHERE id = p_vacancy_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_not_found',
      'detail', 'Upgrade vacancy not found.');
  END IF;
  IF v_vacancy.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_not_open',
      'detail', 'This upgrade vacancy is no longer open (status: ' || v_vacancy.status || ').');
  END IF;
  IF v_vacancy.bed_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_no_bed',
      'detail', 'This vacancy has no target bed to assign.');
  END IF;

  -- 2. Advisory-lock the target bed (consistent with fn_premium_reserve_bed).
  IF NOT pg_try_advisory_xact_lock(hashtext(v_vacancy.bed_id::text)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bed_locked_by_other',
      'detail', 'Another learner is currently claiming this bed. Try again.');
  END IF;

  -- 3. Target bed must still be available.
  SELECT status INTO v_bed_status FROM public.hostel_beds
    WHERE id = v_vacancy.bed_id AND room_id = v_vacancy.room_id;
  IF v_bed_status IS NULL OR v_bed_status <> 'available' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bed_unavailable',
      'detail', 'The premium bed is no longer available.');
  END IF;

  -- 4. The learner's current active allocation (the Classic seat being moved).
  SELECT id, bed_id, tier_id, academic_year_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old_alloc
    FROM public.hostel_allocations
    WHERE learner_id = p_learner_id AND status = 'active'
    ORDER BY allocation_date DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_active_allocation',
      'detail', 'Learner has no active allocation to upgrade from.');
  END IF;

  -- 5. Close the old allocation + free its bed.
  -- 2026-08-06: check_out_date added — see hostel_allocations_room_bed_active_uidx.
  UPDATE public.hostel_allocations
    SET status = 'vacated', actual_vacate_date = CURRENT_DATE,
        check_out_date = CURRENT_DATE, updated_at = now()
    WHERE id = v_old_alloc.id;
  IF v_old_alloc.bed_id IS NOT NULL THEN
    UPDATE public.hostel_beds
      SET status = 'available', current_occupant_id = NULL, updated_at = now()
      WHERE id = v_old_alloc.bed_id;
  END IF;

  -- 6. Insert the new Premium allocation (a MOVE — carries old context).
  INSERT INTO public.hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id,
    allocation_type, allocation_date, status, fee_status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, monthly_fee_at_allocation_inr, metadata
  ) VALUES (
    v_vacancy.institution_id, p_learner_id, v_vacancy.block_id, v_vacancy.room_id,
    v_vacancy.bed_id, v_old_alloc.academic_year_id,
    'regular', CURRENT_DATE, 'active',
    CASE WHEN p_was_free THEN 'paid' ELSE 'pending' END,
    v_old_alloc.emergency_contact_name, v_old_alloc.emergency_contact_phone,
    v_old_alloc.emergency_contact_relation,
    v_old_alloc.tier_id, p_learner_id, p_billed_inr,
    jsonb_build_object(
      'upgrade_from_allocation_id', v_old_alloc.id,
      'upgrade_vacancy_id', p_vacancy_id,
      'upgrade_billed_inr', p_billed_inr,
      'upgrade_was_free', p_was_free
    )
  ) RETURNING id INTO v_new_alloc_id;

  -- 7. Occupy the premium bed.
  UPDATE public.hostel_beds
    SET status = 'occupied', current_occupant_id = p_learner_id, updated_at = now()
    WHERE id = v_vacancy.bed_id;

  -- 8. Mark the vacancy filled.
  UPDATE public.hostel_premium_vacancies
    SET status = 'filled', filled_by_learner_id = p_learner_id, filled_at = now(),
        updated_at = now()
    WHERE id = p_vacancy_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_allocation_id', v_new_alloc_id,
    'old_allocation_id', v_old_alloc.id,
    'new_bed_id', v_vacancy.bed_id,
    'reason', 'ok'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason', 'unknown', 'detail', SQLERRM);
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.fn_premium_upgrade_accept(uuid, uuid, integer, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_premium_upgrade_accept(uuid, uuid, integer, boolean) TO authenticated;

-- ============ PART B — the repair: free the stranded beds ============
-- Blank-only and reversible. Touches ONLY rows that are already non-active and
-- were left without a check_out_date; an allocation a human is still using
-- (status='active') is never touched. The date is copied from what the row
-- already recorded, so no date is invented.

CREATE TABLE IF NOT EXISTS public._bak_alloc_missing_checkout_20260814 (
  allocation_id       uuid PRIMARY KEY,
  learner_id          uuid,
  room_id             uuid,
  bed_id              uuid,
  status              text,
  actual_vacate_date  date,
  old_check_out_date  date,
  new_check_out_date  date,
  captured_at         timestamptz NOT NULL DEFAULT now()
);

-- A backup of learner bed history must never be readable by an unauthenticated
-- client. CREATE TABLE never enables RLS, and Supabase's default privileges hand
-- anon a grant on every new table, so both lines are required.
REVOKE ALL ON TABLE public._bak_alloc_missing_checkout_20260814 FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public._bak_alloc_missing_checkout_20260814 TO service_role;
ALTER  TABLE public._bak_alloc_missing_checkout_20260814 ENABLE ROW LEVEL SECURITY;

INSERT INTO public._bak_alloc_missing_checkout_20260814
  (allocation_id, learner_id, room_id, bed_id, status,
   actual_vacate_date, old_check_out_date, new_check_out_date)
SELECT a.id, a.learner_id, a.room_id, a.bed_id, a.status::text,
       a.actual_vacate_date, a.check_out_date,
       COALESCE(a.actual_vacate_date, a.updated_at::date, CURRENT_DATE)
  FROM public.hostel_allocations a
 WHERE a.status <> 'active'
   AND a.check_out_date IS NULL
ON CONFLICT (allocation_id) DO NOTHING;

UPDATE public.hostel_allocations a
   SET check_out_date = b.new_check_out_date,
       updated_at     = now()
  FROM public._bak_alloc_missing_checkout_20260814 b
 WHERE a.id = b.allocation_id
   AND a.check_out_date IS NULL;

-- Re-sync the bed records for the beds this frees, so the two halves agree.
UPDATE public.hostel_beds hb
   SET status = 'available', current_occupant_id = NULL, updated_at = now()
  FROM public._bak_alloc_missing_checkout_20260814 b
 WHERE hb.id = b.bed_id
   AND hb.status <> 'available'
   AND NOT EXISTS (
     SELECT 1 FROM public.hostel_allocations x
      WHERE x.bed_id = hb.id AND x.status = 'active'
   );

DO $$
DECLARE v_rows integer; v_beds integer;
BEGIN
  SELECT count(*), count(DISTINCT bed_id)
    INTO v_rows, v_beds
    FROM public._bak_alloc_missing_checkout_20260814;
  RAISE NOTICE 'Upgrade bed-release repair: % allocation rows stamped, % beds returned to service (backup: _bak_alloc_missing_checkout_20260814)',
    v_rows, v_beds;
END $$;
