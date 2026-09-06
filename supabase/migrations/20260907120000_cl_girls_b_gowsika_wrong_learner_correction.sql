-- Girls Hostel B R25 — correct a mis-identified learner.
--
-- WHAT WENT WRONG. Sheet row "G GOWSIKA" (BSC Nursing, 1 Year, GHB R25,
-- Deluxe Room Plus) was matched in 20260906120000 to GOWSIKA S — who is BSC
-- Nursing SEMESTER VIII, i.e. a final-year student, with the initial S. The
-- sheet's learner is GOWSIKA G: initial G, Semester I, gowsikag26nur@jkkn.ac.in.
--
-- TWO INDEPENDENT BUGS IN THE MATCHER COMBINED TO PICK HER:
--   1. The candidate pool was lifecycle_status='active' only. GOWSIKA G is
--      'reserved', so she was never a candidate at all — leaving GOWSIKA S as
--      the apparent sole match, and a pool of one reads as certainty.
--   2. Name tokenising kept only words of 2+ letters, discarding the initial.
--      "G GOWSIKA" and "GOWSIKA S" then looked identical on {GOWSIKA}.
-- Neither alone would have been enough; together they produced a confident
-- wrong answer. Every other name-matched placement in that migration agrees on
-- BOTH the initial and the year — GOWSIKA S is the only casualty.
--
-- WHAT THIS DOES.
--   a) Releases GOWSIKA S from GHB R25 B2 and restores her hostel_category_id
--      to NULL, which is what it was before (before_category_id in the log).
--   b) Does NOT cancel the Rs.10,000 upgrade bill raised against her, and
--      cannot. billing_student_bills refuses any direct route to 'cancelled';
--      the only sanctioned path is fn_cancel_student_bill, which demands
--      is_super_admin() or billing.schedule.cancel, a reason, AT LEAST ONE
--      SUPPORTING DOCUMENT, and stamps cancelled_by = auth.uid(). None of that
--      exists on the service_role connection that applies migrations, and the
--      guard could only be sidestepped by forging app.bill_cancel_ctx — which
--      would leave a cancellation with no record of who did it or why. That
--      control is there on purpose and this migration respects it. The bill is
--      asserted to be unpaid with zero receipts, its id is written into the
--      reconciliation log, and a human must cancel it in Billing with evidence.
--   c) Places GOWSIKA G in GHB R25 on the bed just freed, on Deluxe Plus Room,
--      and raises her own Rs.10,000 upgrade bill (band Classic Room -> Deluxe
--      Plus Room; there is no configured rung for that pair, so it prices at the
--      fee delta 37,500 - 27,500, exactly as the parent migration did).
--
-- Net effect on billing is +Rs.10,000 — GOWSIKA G's correct charge goes on now,
-- and GOWSIKA S's wrong Rs.10,000 comes off only when a human cancels it with
-- evidence. Until then two bills exist for one bed. That is visible rather than
-- silent: the wrong bill carries a RAISED IN ERROR remark.
--
-- GOWSIKA G is 'reserved'. fn_cl_roster_statuses() is {active, reserved,
-- admitted} and the operator confirmed reserved/admitted learners may hold beds.
--
-- fn_cl_vacate_allocation cannot be called here — it gates on is_super_admin()
-- / is_admin() / user_has_permission(), all of which are false under the
-- service_role connection that applies migrations. Its body is reproduced
-- inline instead, including the conditional bed release that is the whole
-- reason a bare UPDATE is not good enough.

DO $mig$
DECLARE
  v_hy        uuid;
  v_bcat      uuid;
  v_tier      uuid;
  v_s_lp      uuid := '23147f5a-663c-4bea-8128-bfd22f9e6c64';  -- GOWSIKA S  (wrongly placed)
  v_s_prof    uuid := '76d60892-4666-4b94-a4d9-bbe473dbcf7b';
  v_g_lp      uuid := 'a11fc32b-2545-458f-95ef-6813afeeadd9';  -- GOWSIKA G  (the sheet's learner)
  v_g_prof    uuid := '392bf2fb-bec0-433a-a628-72f192c55d9a';
  v_room      uuid := '51216c62-0a80-4154-add9-d56a453eaa47';  -- GHB R25
  v_deluxe_pl uuid := 'f906b9b5-eeef-4160-b8c6-762b2ad3170f';  -- Deluxe Plus Room (girls)
  v_alloc     uuid;
  v_bed       uuid;
  v_bedno     text;
  v_bill      uuid;
  v_bill_amt  numeric;
  v_receipts  integer;
  v_new_alloc uuid;
  v_inst      uuid;
  v_ay        uuid;
  v_sem       uuid;
  v_res       jsonb;
  v_billed_before numeric;
  v_billed_after  numeric;
  v_bad       integer;
BEGIN
  SELECT id INTO v_hy FROM hostel_years WHERE is_current LIMIT 1;
  IF v_hy IS NULL THEN RAISE EXCEPTION 'No current hostel year'; END IF;
  v_bcat := public._cl_ensure_upgrade_billing_category('hostel');

  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy'; END IF;

  SELECT COALESCE(sum(final_amount),0) INTO v_billed_before
    FROM billing_student_bills
   WHERE item_category_id = v_bcat AND status NOT IN ('cancelled','superseded');

  -- Refuse to run against anything other than the exact situation described.
  IF NOT EXISTS (SELECT 1 FROM learners_profiles lp JOIN semesters s ON s.id = lp.semester_id
                  WHERE lp.id = v_g_lp AND s.semester_name ILIKE '%I') THEN
    RAISE EXCEPTION 'GOWSIKA G is not the Semester I learner this correction was written for';
  END IF;

  ----------------------------------------------------- a) release GOWSIKA S
  SELECT id, bed_id INTO v_alloc, v_bed
    FROM hostel_allocations
   WHERE learner_id = v_s_prof AND room_id = v_room AND status = 'active' AND check_out_date IS NULL
   FOR UPDATE;
  IF v_alloc IS NULL THEN
    RAISE EXCEPTION 'GOWSIKA S holds no active allocation in GHB R25 — already corrected?';
  END IF;
  SELECT bed_number INTO v_bedno FROM hostel_beds WHERE id = v_bed;

  UPDATE hostel_allocations
     SET status = 'vacated', vacate_reason = 'transfer',
         actual_vacate_date = CURRENT_DATE, check_out_date = CURRENT_DATE, updated_at = now()
   WHERE id = v_alloc;

  IF v_bed IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hostel_allocations a
     WHERE a.bed_id = v_bed AND a.id <> v_alloc
       AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  ) THEN
    UPDATE hostel_beds SET status='available', current_occupant_id=NULL, updated_at=now() WHERE id = v_bed;
  END IF;

  -- restore the category she had before the erroneous run (NULL, per the log)
  UPDATE learners_profiles
     SET hostel_category_id = (SELECT before_category_id FROM public.cl_girls_bc_reconcile_log
                                WHERE learner_name = 'G GOWSIKA' ORDER BY seq LIMIT 1),
         updated_at = now()
   WHERE id = v_s_lp;

  --------------------------- b) flag the erroneous bill for human cancellation
  SELECT b.id, b.final_amount INTO v_bill, v_bill_amt
    FROM public.cl_girls_bc_reconcile_log l
    JOIN billing_student_bills b ON b.id = l.bill_id
   WHERE l.learner_name = 'G GOWSIKA' AND b.status NOT IN ('cancelled','superseded')
   ORDER BY l.seq LIMIT 1;

  IF v_bill IS NOT NULL THEN
    SELECT count(*) INTO v_receipts FROM billing_receipt_items WHERE bill_id = v_bill;
    IF v_receipts > 0 THEN
      RAISE EXCEPTION 'Bill % has % receipt item(s) — money was collected against the wrong learner; stop and settle by hand',
        v_bill, v_receipts;
    END IF;
    -- Flag it for the human who can cancel it properly. remarks is a plain
    -- text column with no guard, so the note lands even though the status
    -- cannot; whoever opens the bill sees why it exists before cancelling.
    UPDATE billing_student_bills
       SET remarks = left(COALESCE(remarks || ' | ', '')
             || 'RAISED IN ERROR 2026-09-07 and awaiting cancellation: migration 20260906120000 matched sheet row '
             || '"G GOWSIKA" to GOWSIKA S (BSC Nursing Semester VIII) when the sheet means GOWSIKA G '
             || '(Semester I), who has since been billed separately. Unpaid, no receipts. '
             || 'Cancel via Billing with reason + supporting document (fn_cancel_student_bill).', 1000),
           updated_at = now()
     WHERE id = v_bill;
  END IF;

  ------------------------------------------------------ c) place GOWSIKA G
  IF EXISTS (SELECT 1 FROM hostel_allocations
              WHERE learner_id = v_g_prof AND status='active' AND check_out_date IS NULL) THEN
    RAISE EXCEPTION 'GOWSIKA G already holds an active allocation';
  END IF;

  SELECT bd.id, bd.bed_number INTO v_bed, v_bedno
    FROM hostel_beds bd
   WHERE bd.room_id = v_room AND bd.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval')
                        AND a.check_out_date IS NULL)
   ORDER BY bd.bed_number LIMIT 1;
  IF v_bed IS NULL THEN RAISE EXCEPTION 'No free bed in GHB R25 for GOWSIKA G'; END IF;

  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
    FROM learners_profiles lp WHERE lp.id = v_g_lp;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year for GOWSIKA G'; END IF;

  -- Her own upgrade bill. She holds none today, so this creates one.
  v_res := public._cl_apply_upgrade_fee_bill(
             v_g_lp, v_hy, 'hostel', 10000,
             'Hostel room upgrade: Classic Room -> Deluxe Plus Room (Girls B/C occupancy reconciliation)',
             10000);

  -- Category BEFORE the insert, so trg_allocation_sync_learner_categories sees
  -- room_source_category_id = the room's category and preserves Deluxe Plus.
  UPDATE learners_profiles
     SET hostel_category_id = v_deluxe_pl, updated_at = now()
   WHERE id = v_g_lp;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id,
    academic_year_id, semester_id, allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation, tier_id, allocated_by
  )
  SELECT v_inst, v_g_prof, r.block_id, v_room, v_bed, v_ay, v_sem,
         'fresh', CURRENT_DATE, 'active', '', '', '', v_tier, NULL
    FROM hostel_rooms r WHERE r.id = v_room
  RETURNING id INTO v_new_alloc;

  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_g_prof, updated_at=now() WHERE id = v_bed;

  UPDATE public.cl_girls_bc_reconcile_log
     SET learner_name = 'GOWSIKA G',
         learner_profile_id = v_g_lp,
         profile_id = v_g_prof,
         after_allocation_id = v_new_alloc,
         after_category_id = v_deluxe_pl,
         target_bed_id = v_bed,
         bill_id = NULLIF(v_res->>'bill_id','')::uuid,
         bill_action = v_res->>'action',
         note = COALESCE(note,'') || ' — corrected 2026-09-07: was wrongly matched to GOWSIKA S (Semester VIII); '
                || 'she is released and her erroneous bill cancelled. GOWSIKA G (Semester I) placed on bed ' || v_bedno || '.'
   WHERE learner_name = 'G GOWSIKA';

  ------------------------------------------------------------- assertions
  IF EXISTS (SELECT 1 FROM hostel_allocations
              WHERE learner_id = v_s_prof AND status='active' AND check_out_date IS NULL) THEN
    RAISE EXCEPTION 'GOWSIKA S still holds an active allocation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hostel_allocations
                  WHERE learner_id = v_g_prof AND room_id = v_room AND bed_id = v_bed
                    AND status='active' AND check_out_date IS NULL) THEN
    RAISE EXCEPTION 'GOWSIKA G was not placed';
  END IF;
  IF (SELECT hostel_category_id FROM learners_profiles WHERE id = v_g_lp) IS DISTINCT FROM v_deluxe_pl THEN
    RAISE EXCEPTION 'GOWSIKA G did not end on Deluxe Plus Room';
  END IF;
  IF fn_learner_eligible_for_room(v_g_lp, v_room) = false THEN
    RAISE EXCEPTION 'GOWSIKA G fails the room-eligibility rule for GHB R25';
  END IF;

  SELECT count(*) INTO v_bad FROM (
    SELECT h.bed_id FROM hostel_allocations h JOIN hostel_blocks b ON b.id=h.block_id
     WHERE h.status='active' AND h.check_out_date IS NULL AND b.hostel_type='girls'
     GROUP BY h.bed_id HAVING count(*) > 1) d;
  IF v_bad > 0 THEN RAISE EXCEPTION '% girls beds double-booked', v_bad; END IF;

  -- GOWSIKA G's correct Rs.10,000 goes on; GOWSIKA S's wrong Rs.10,000 stays
  -- until a human cancels it with evidence, so the category total rises by
  -- exactly one bill. It drops back by 10,000 once that cancellation happens.
  SELECT COALESCE(sum(final_amount),0) INTO v_billed_after
    FROM billing_student_bills
   WHERE item_category_id = v_bcat AND status NOT IN ('cancelled','superseded');
  IF (v_billed_after - v_billed_before) <> 10000 THEN
    RAISE EXCEPTION 'Expected Rs.10000 of new billing for GOWSIKA G, got Rs.%',
      (v_billed_after - v_billed_before);
  END IF;

  RAISE NOTICE 'GOWSIKA correction: S released from GHB R25 (her erroneous bill % still needs cancelling), G placed on bed %',
    v_bill, v_bedno;
END
$mig$;
