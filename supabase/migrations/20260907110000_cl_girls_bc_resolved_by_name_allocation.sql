-- Girls Hostel B & C — place the eight sheet rows whose Email column was blank
-- (or wrong) and which name-matching has now resolved.
--
-- 20260906120200 placed 226 of the 238 sheet rows and deliberately left ten
-- unidentified rather than guess. Two changes let eight of those ten resolve:
--
--   1. THE LIFECYCLE POOL WAS TOO NARROW. Matching only searched
--      lifecycle_status='active'. fn_cl_roster_statuses() has returned
--      {active, reserved, admitted} since the roster widening, and a learner who
--      is 'admitted' but not yet 'active' can legitimately hold a bed. Two rows
--      that looked like "no such learner exists" (M SUNITHA, R REETHIKA) are
--      simply admitted. Operator instruction, 2026-09-07: allow reserved and
--      admitted.
--
--   2. THE INITIAL IS EVIDENCE, NOT NOISE. The sheet writes "<initial> <name>"
--      (M KAVIYA); the database writes "<name> <initial>" (KAVIYA M). The first
--      matching pass tokenised on words of 2+ letters and threw the initials
--      away, which made "M KAVIYA" match "KAVIYA S" — a different person, and
--      exactly the mistake that once attached five Nursing learners to the wrong
--      record. Requiring the initials to agree also splits "S JANANI" from
--      "N JANANI", who are two of three same-programme Jananis.
--
-- HOW EACH OF THE EIGHT WAS IDENTIFIED:
--   GAYATHRI        -> GAYATHRI V. The sheet's v.gayathiri@jkkn.ac.in differs
--                      from the record's v.gayathri@jkkn.ac.in by one letter,
--                      which is why the email join missed her. Same initial V,
--                      same programme (BDS, final year / CRRI). She already holds
--                      GHA R13 B2, so this is a MOVE.
--   DHARSHANA S     -> the only BDS 2 Year Dharshana S; the other three are
--                      Maths / Standard 11 / Standard 9 at other institutions.
--                      Holds GHA R11 B5, so this is a MOVE + upgrade.
--   N JANANI        -> JANANI N, unique among the Nursing Semester I Jananis
--                      once the initial is honoured.
--   G SHANMUGAPRIYA, M SUNITHA, R REETHIKA, M YAZHINI, D DHARSHINI
--                   -> single candidate on name + initial + programme + year.
--
-- STILL NOT PLACED, and not guessed at:
--   M KAVIYA  -> KAVIYA M (Nursing, admitted) is the only initial-consistent
--                match, but she has NO profiles row, and
--                hostel_allocations.learner_id is a FK to profiles.id. She
--                cannot hold a bed until she has a login profile, which needs
--                her institution email filled in. Her bed stays free.
--   S JANANI  -> two DIFFERENT learners named JANANI S, both Nursing Semester I,
--                both unplaced (jananin26nur@ and jananis26nur@). No tiebreaker
--                exists in the sheet. Her bed stays free.
--
-- Same write rules as the parent migration: a move is an in-place UPDATE so
-- trg_allocation_sync_learner_categories cannot rewrite the category; a fresh
-- allocation sets the category BEFORE the insert so the same trigger preserves
-- it; billing is a REQUIRED TOTAL and only the shortfall is raised, because
-- billing_categories.once_per_learner is TRUE for 'Hostel Upgrade Fee'. Four of
-- these eight already hold a live upgrade bill. Nothing is ever cancelled.
--
-- GAYATHRI V is Classic on record but her fee band already buys Deluxe, so the
-- move to a Deluxe room is a band CORRECTION carrying no fee — the same case
-- VISHALI T was in the parent migration.

DO $mig$
DECLARE
  v_run          uuid := gen_random_uuid();
  v_hy           uuid;
  v_bcat         uuid;
  v_tier         uuid;
  r              record;
  v_old_bed      uuid;
  v_bed_status   text;
  v_res          jsonb;
  v_alloc        uuid;
  v_inst         uuid;
  v_ay           uuid;
  v_sem          uuid;
  v_bill_id      uuid;
  v_bill_final   numeric;
  v_bill_balance numeric;
  v_paid         numeric;
  v_topup        numeric;
  v_billed_before numeric;
  v_billed_after  numeric;
  v_bills_before  integer;
  v_bills_after   integer;
  v_bad          integer;
  v_msg          text;
BEGIN
  SELECT id INTO v_hy FROM hostel_years WHERE is_current LIMIT 1;
  IF v_hy IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;
  v_bcat := public._cl_ensure_upgrade_billing_category('hostel');

  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key = 'standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key = 'standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  SELECT count(*), COALESCE(sum(final_amount), 0)
    INTO v_bills_before, v_billed_before
    FROM billing_student_bills
   WHERE item_category_id = v_bcat AND status NOT IN ('cancelled', 'superseded');

  CREATE TEMP TABLE _cl_plan2 (
    seq integer, phase integer, action text, learner_name text,
    learner_profile_id uuid, profile_id uuid,
    target_block_id uuid, target_room_id uuid, target_bed_id uuid,
    target_category_id uuid, bill_total numeric, note text
  ) ON COMMIT DROP;

  INSERT INTO _cl_plan2 VALUES
  -- phase 1: band correction + in-place move, no fee
  (1, 1, 'move', 'GAYATHRI V',
   '9d1b5ce4-5e2c-4281-9824-b67b99cb2163', 'be23ccf2-0a83-48dc-8407-8dff3bd9dfa6',
   'e096fe49-2e1e-4935-ae65-068c7a839082', '9f8f4cdd-f64c-4983-a09a-7f8d8bb53b65',
   '75a7986f-22da-42eb-934f-572d6166b8b0', 'a679e730-5539-4f8f-a695-f9111c141058',
   0, 'Sheet row "GAYATHRI"; band correction Classic -> Deluxe, no fee'),
  -- phase 2: move + upgrade, billed by _cl_upgrade_room_category
  (2, 2, 'upgrade', 'DHARSHANA S',
   'fc9a7394-bc5f-4641-91a9-707605b4fc2c', 'f3b78f48-7fa5-4717-b4a9-b25b2b802bc6',
   'a4022e63-62b2-4777-a36f-7527de0795aa', '8e2125c6-45b6-4e70-b782-c5515802b097',
   'b8567de2-6fad-493c-acf3-780b32fab113', 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d',
   15000, 'Sheet row "DHARSHANA S"; Classic -> Premium'),
  -- phase 3: fresh allocations; bill_total is the REQUIRED TOTAL, not the charge
  (3, 3, 'fresh', 'SHANMUGAPRIYA G',
   '62bef580-c780-4ef9-9794-e5f081ea9b97', 'b57557f9-da73-45bc-bbcb-7a1c606ee4c5',
   'e096fe49-2e1e-4935-ae65-068c7a839082', '51216c62-0a80-4154-add9-d56a453eaa47',
   '82292688-48e7-42af-8914-7607415ea3ad', 'f906b9b5-eeef-4160-b8c6-762b2ad3170f',
   10000, 'Hostel room upgrade: Classic Room -> Deluxe Plus Room (Girls B/C occupancy reconciliation)'),
  (4, 3, 'fresh', 'SUNITHA M',
   'f01bf173-c487-4586-a27e-9431a090ba29', '7ffdde1b-6d1f-4168-8fc2-66116b9b6122',
   'e096fe49-2e1e-4935-ae65-068c7a839082', '51216c62-0a80-4154-add9-d56a453eaa47',
   '96ff6cc1-e59b-42f6-bab0-e93cf4fbb3c5', 'f906b9b5-eeef-4160-b8c6-762b2ad3170f',
   10000, 'Hostel room upgrade: Classic Room -> Deluxe Plus Room (Girls B/C occupancy reconciliation)'),
  (5, 3, 'fresh', 'REETHIKA R',
   '99af39a0-6e24-4cad-aec6-61964def1643', '7628cf71-48b1-427f-9490-cba2f7003795',
   'a4022e63-62b2-4777-a36f-7527de0795aa', '91a35bc5-b0bc-4d5b-a099-2f3202547f8b',
   '9102fbb3-8d89-43a8-81fc-bae7e393227c', 'a679e730-5539-4f8f-a695-f9111c141058',
   0, 'Sheet row "R REETHIKA"; already on Deluxe Room, no fee'),
  (6, 3, 'fresh', 'JANANI N',
   'e9346d7e-122a-4ab2-8d40-2e0049374da9', 'a441d9dc-ed9d-4627-9b01-005d874701a1',
   'a4022e63-62b2-4777-a36f-7527de0795aa', '1493e417-94df-47c3-a5d9-0d2bf98bf392',
   'e97ce6ad-a166-4ac1-9a7d-209dc09b4ff3', 'a679e730-5539-4f8f-a695-f9111c141058',
   7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (7, 3, 'fresh', 'YAZHINI M',
   '3f401772-38f2-4f28-8a6d-9e4232b2aebe', 'e9a48a4c-4673-4341-8e52-2e6c6eb5d333',
   'a4022e63-62b2-4777-a36f-7527de0795aa', '1493e417-94df-47c3-a5d9-0d2bf98bf392',
   '807ac74e-beb3-4608-8d25-2e409870ec7b', 'a679e730-5539-4f8f-a695-f9111c141058',
   7500, 'Hostel room upgrade: Classic Room -> Deluxe Room (Girls B/C occupancy reconciliation)'),
  (8, 3, 'fresh', 'DHARSHINI D',
   '0eb85f2f-b286-41b8-a1f8-b8b5d01599a3', '328c11ec-78c8-4294-a23c-7abe3da0b700',
   'a4022e63-62b2-4777-a36f-7527de0795aa', 'eec5fb8e-d2e4-4edb-a918-b54ab8e228ae',
   '3afbe386-f53e-4c5e-97e3-8b920b648b6b', 'c94e6b94-0ee1-4acf-869c-ff91ea60b48d',
   7500, 'Hostel room upgrade: Deluxe Room -> Premium Room (Girls B/C occupancy reconciliation)');

  INSERT INTO public.cl_girls_bc_reconcile_log
    (run_id, seq, phase, action, learner_name, learner_profile_id, profile_id,
     before_allocation_id, before_block_id, before_room_id, before_bed_id, before_category_id,
     target_block_id, target_room_id, target_bed_id, target_category_id,
     bill_amount, note, outcome)
  SELECT v_run, p.seq + 100, p.phase, p.action, p.learner_name, p.learner_profile_id, p.profile_id,
         a.id, a.block_id, a.room_id, a.bed_id, lp.hostel_category_id,
         p.target_block_id, p.target_room_id, p.target_bed_id, p.target_category_id,
         p.bill_total, p.note, 'planned'
    FROM _cl_plan2 p
    LEFT JOIN learners_profiles lp ON lp.id = p.learner_profile_id
    LEFT JOIN LATERAL (
      SELECT h.id, h.block_id, h.room_id, h.bed_id FROM hostel_allocations h
       WHERE h.learner_id = p.profile_id AND h.status = 'active' AND h.check_out_date IS NULL
       ORDER BY h.allocation_date DESC LIMIT 1
    ) a ON true;

  -- Every learner here must be on the roster and must have a login profile.
  SELECT count(*), string_agg(p.learner_name, ', ') INTO v_bad, v_msg
    FROM _cl_plan2 p JOIN learners_profiles lp ON lp.id = p.learner_profile_id
   -- lifecycle_status is an enum; fn_cl_roster_statuses() returns text[].
   WHERE lp.lifecycle_status::text <> ALL (fn_cl_roster_statuses());
  IF v_bad > 0 THEN RAISE EXCEPTION 'Not on the hostel roster: %', v_msg; END IF;

  SELECT count(*), string_agg(p.learner_name, ', ') INTO v_bad, v_msg
    FROM _cl_plan2 p WHERE NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = p.profile_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'No profiles row (cannot hold a bed): %', v_msg; END IF;

  ------------------------------------------------------- phase 1 — move only
  FOR r IN SELECT * FROM public.cl_girls_bc_reconcile_log
            WHERE run_id = v_run AND phase = 1 ORDER BY seq LOOP
    IF r.before_allocation_id IS NULL THEN
      RAISE EXCEPTION 'Move planned for % but they hold no active allocation', r.learner_name;
    END IF;
    SELECT bed_id INTO v_old_bed FROM hostel_allocations WHERE id = r.before_allocation_id FOR UPDATE;

    IF EXISTS (SELECT 1 FROM hostel_allocations h
                WHERE h.bed_id = r.target_bed_id AND h.status IN ('active','pending_approval')
                  AND h.check_out_date IS NULL AND h.id <> r.before_allocation_id) THEN
      RAISE EXCEPTION 'Target bed for % is occupied', r.learner_name;
    END IF;

    IF r.target_category_id IS DISTINCT FROM r.before_category_id THEN
      IF COALESCE((SELECT amount FROM hostel_fees WHERE hostel_category_id = r.target_category_id
                    AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0)
         < COALESCE((SELECT amount FROM hostel_fees WHERE hostel_category_id = r.before_category_id
                    AND hostel_year_id = v_hy AND mess_category_id IS NULL AND is_active LIMIT 1), 0)
      THEN RAISE EXCEPTION 'Refusing to downgrade %', r.learner_name; END IF;
      UPDATE learners_profiles SET hostel_category_id = r.target_category_id, updated_at = now()
       WHERE id = r.learner_profile_id;
    END IF;

    UPDATE hostel_allocations
       SET room_id = r.target_room_id, bed_id = r.target_bed_id, block_id = r.target_block_id,
           allocation_type = 'transfer', updated_at = now()
     WHERE id = r.before_allocation_id;
    IF v_old_bed IS NOT NULL AND v_old_bed IS DISTINCT FROM r.target_bed_id THEN
      UPDATE hostel_beds SET status='available', current_occupant_id=NULL, updated_at=now() WHERE id = v_old_bed;
    END IF;
    UPDATE hostel_beds SET status='occupied', current_occupant_id=r.profile_id, updated_at=now()
     WHERE id = r.target_bed_id;

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome='applied', after_allocation_id=r.before_allocation_id,
           after_category_id=(SELECT hostel_category_id FROM learners_profiles WHERE id=r.learner_profile_id)
     WHERE id = r.id;
  END LOOP;

  --------------------------------------------------- phase 2 — move + upgrade
  FOR r IN SELECT * FROM public.cl_girls_bc_reconcile_log
            WHERE run_id = v_run AND phase = 2 ORDER BY seq LOOP
    SELECT status::text INTO v_bed_status FROM hostel_beds
     WHERE id = r.target_bed_id AND room_id = r.target_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'Upgrade target bed for % is %', r.learner_name, COALESCE(v_bed_status,'missing');
    END IF;
    IF EXISTS (SELECT 1 FROM billing_student_bills
                WHERE student_id = r.learner_profile_id AND item_category_id = v_bcat
                  AND status NOT IN ('cancelled','superseded')
                  AND (fee_source IS DISTINCT FROM 'hostel_category' OR hostel_year_id IS DISTINCT FROM v_hy)) THEN
      RAISE EXCEPTION '% holds a Hostel Upgrade Fee bill _cl_apply_upgrade_fee_bill cannot see', r.learner_name;
    END IF;

    v_res := public._cl_upgrade_room_category(
               r.profile_id, r.learner_profile_id, r.target_category_id,
               r.target_room_id, r.target_bed_id, false);

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome='applied',
           after_allocation_id = NULLIF(v_res->>'new_allocation_id','')::uuid,
           after_category_id = (SELECT hostel_category_id FROM learners_profiles WHERE id=r.learner_profile_id),
           bill_amount = NULLIF(v_res->'bill'->>'billed','')::numeric,
           bill_action = v_res->'bill'->>'action',
           bill_id = NULLIF(v_res->'bill'->>'bill_id','')::uuid
     WHERE id = r.id;
  END LOOP;

  ------------------------------------------------------- phase 3 — fresh beds
  FOR r IN SELECT * FROM public.cl_girls_bc_reconcile_log
            WHERE run_id = v_run AND phase = 3 ORDER BY seq LOOP
    IF r.before_allocation_id IS NOT NULL THEN
      RAISE EXCEPTION '% already holds an active allocation', r.learner_name;
    END IF;
    SELECT status::text INTO v_bed_status FROM hostel_beds
     WHERE id = r.target_bed_id AND room_id = r.target_room_id;
    IF v_bed_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'Fresh target bed for % is %', r.learner_name, COALESCE(v_bed_status,'missing');
    END IF;

    SELECT lp.institution_id, lp.semester_id,
           COALESCE(lp.academic_year_id,
             (SELECT id FROM academic_years WHERE institution_id = lp.institution_id AND is_active
               ORDER BY start_date DESC LIMIT 1))
      INTO v_inst, v_sem, v_ay
      FROM learners_profiles lp WHERE lp.id = r.learner_profile_id;
    IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for %', r.learner_name; END IF;

    v_bill_id := NULL; v_bill_final := NULL; v_bill_balance := NULL;
    SELECT id, COALESCE(final_amount,0), COALESCE(balance_amount,0)
      INTO v_bill_id, v_bill_final, v_bill_balance
      FROM billing_student_bills
     WHERE student_id = r.learner_profile_id AND item_category_id = v_bcat
       AND status NOT IN ('cancelled','superseded')
     ORDER BY created_at LIMIT 1;
    v_topup := COALESCE(r.bill_amount,0) - COALESCE(v_bill_final,0);

    IF v_bill_id IS NULL AND v_topup > 0 THEN
      v_res := public._cl_apply_upgrade_fee_bill(r.learner_profile_id, v_hy, 'hostel', v_topup, r.note, v_topup);
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = v_res->>'action', bill_id = NULLIF(v_res->>'bill_id','')::uuid, bill_amount = v_topup
       WHERE id = r.id;
    ELSIF v_bill_id IS NOT NULL AND v_topup > 0 THEN
      v_paid := COALESCE(v_bill_final,0) - COALESCE(v_bill_balance,0);
      UPDATE billing_student_bills
         SET final_amount = v_bill_final + v_topup,
             total_amount = COALESCE(total_amount,0) + v_topup,
             unit_amount = v_bill_final + v_topup, quantity = 1,
             balance_amount = (v_bill_final + v_topup) - v_paid,
             status = CASE WHEN v_paid <= 0 THEN 'unpaid'
                           WHEN v_paid >= (v_bill_final + v_topup) THEN 'paid'
                           ELSE 'partially_paid' END,
             bill_description = left(CASE WHEN COALESCE(bill_description,'') = '' THEN r.note
                                          ELSE bill_description || ' + ' || r.note END, 500),
             updated_at = now()
       WHERE id = v_bill_id;
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = 'topped_up', bill_id = v_bill_id, bill_amount = v_topup WHERE id = r.id;
    ELSE
      UPDATE public.cl_girls_bc_reconcile_log
         SET bill_action = CASE WHEN COALESCE(r.bill_amount,0) = 0 THEN 'no_fee_due' ELSE 'already_billed' END,
             bill_id = v_bill_id, bill_amount = 0
       WHERE id = r.id;
    END IF;

    UPDATE learners_profiles
       SET hostel_category_id = r.target_category_id, updated_at = now()
     WHERE id = r.learner_profile_id;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id,
      academic_year_id, semester_id, allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation, tier_id, allocated_by
    ) VALUES (
      v_inst, r.profile_id, r.target_block_id, r.target_room_id, r.target_bed_id,
      v_ay, v_sem, 'fresh', CURRENT_DATE, 'active', '', '', '', v_tier, NULL
    ) RETURNING id INTO v_alloc;

    UPDATE hostel_beds SET status='occupied', current_occupant_id=r.profile_id, updated_at=now()
     WHERE id = r.target_bed_id;

    UPDATE public.cl_girls_bc_reconcile_log
       SET outcome='applied', after_allocation_id=v_alloc,
           after_category_id=(SELECT hostel_category_id FROM learners_profiles WHERE id=r.learner_profile_id)
     WHERE id = r.id;
  END LOOP;

  ------------------------------------------------------------- assertions
  SELECT count(*) INTO v_bad FROM public.cl_girls_bc_reconcile_log
   WHERE run_id = v_run AND outcome = 'planned';
  IF v_bad > 0 THEN RAISE EXCEPTION '% planned rows never applied', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM public.cl_girls_bc_reconcile_log l
    JOIN hostel_allocations h ON h.id = l.after_allocation_id
   WHERE l.run_id = v_run
     AND (h.bed_id IS DISTINCT FROM l.target_bed_id OR h.room_id IS DISTINCT FROM l.target_room_id
          OR h.status <> 'active' OR h.check_out_date IS NOT NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION '% allocations did not land on their target bed', v_bad; END IF;

  SELECT count(*), string_agg(learner_name, ', ') INTO v_bad, v_msg
    FROM public.cl_girls_bc_reconcile_log
   WHERE run_id = v_run AND after_category_id IS DISTINCT FROM target_category_id;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Category not as planned for: %', v_msg; END IF;

  SELECT count(*) INTO v_bad FROM (
    SELECT h.bed_id FROM hostel_allocations h JOIN hostel_blocks b ON b.id = h.block_id
     WHERE h.status='active' AND h.check_out_date IS NULL AND b.hostel_type='girls'
     GROUP BY h.bed_id HAVING count(*) > 1) d;
  IF v_bad > 0 THEN RAISE EXCEPTION '% girls beds hold more than one live allocation', v_bad; END IF;

  -- Every learner placed here must satisfy the room-eligibility rules, which
  -- 20260907100000 widened for Nursing and Allied Health in GHC.
  SELECT count(*), string_agg(l.learner_name, ', ') INTO v_bad, v_msg
    FROM public.cl_girls_bc_reconcile_log l
    JOIN hostel_allocations h ON h.id = l.after_allocation_id
   WHERE l.run_id = v_run
     AND fn_learner_eligible_for_room(l.learner_profile_id, h.room_id) = false;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Room-rule violation for: %', v_msg; END IF;

  SELECT count(*), COALESCE(sum(final_amount), 0) INTO v_bills_after, v_billed_after
    FROM billing_student_bills
   WHERE item_category_id = v_bcat AND status NOT IN ('cancelled','superseded');
  IF v_bills_after < v_bills_before THEN
    RAISE EXCEPTION 'Live upgrade bills dropped from % to % — a bill was cancelled', v_bills_before, v_bills_after;
  END IF;
  IF (v_billed_after - v_billed_before) <> 27500 THEN
    RAISE EXCEPTION 'Expected Rs.27500 of new billing, got Rs.%', (v_billed_after - v_billed_before);
  END IF;

  RAISE NOTICE 'Resolved-by-name placement run %: 1 move, 1 upgrade, 6 fresh. New billing Rs.%',
    v_run, (v_billed_after - v_billed_before);
END
$mig$;
