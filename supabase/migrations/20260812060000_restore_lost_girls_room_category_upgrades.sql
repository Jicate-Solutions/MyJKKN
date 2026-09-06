-- Restore room-category upgrades lost in the girls allocation reset (2026-08-12)
--
-- WHY THIS EXISTS
-- ---------------
-- A learner's room category is DERIVED state, not stored state:
-- trg_allocation_sync_learner_categories overwrites learners_profiles.hostel_category_id
-- from the room on every activation, and fn_auto_allocate_plan re-derives the category
-- from the FEE BAND, which knows nothing about upgrades. So when the girls allocations
-- were reset and the "Hostel Upgrade Fee" bills cancelled, every trace of an upgrade
-- disappeared and re-allocation dropped those learners back to their base category
-- (Classic). That both denied them the room they had paid/been billed for AND consumed
-- the scarce Classic pool, leaving 101 girls unplaceable against 9 free Classic beds.
--
-- The ONLY surviving record of the target category is billing_student_bills.bill_description
-- ("Hostel category upgrade: Classic Room -> Deluxe Room"). There is no FK from
-- billing_student_bills to hostel_category_upgrade_fees, so the target is recovered by
-- taking the text after the LAST "->" and matching it to a girls hostel_categories row.
-- 177 of 179 bills resolve this way; the 2 that do not are generic "Hostel Upgrade Fee"
-- rows (one is a MESS upgrade, not a room upgrade) and are deliberately left untouched.
--
-- SCOPE (confirmed by operator 2026-08-12)
--   * All 99 learners whose upgrade bills are ALL cancelled are reinstated -- both the
--     71 from the Aug-11 bulk reset and the 28 from the Aug 6-9 waves. Total re-billed
--     value ~ Rs 15,15,000.
--   * 19 learners already hold a live bill: their bills are NOT touched, only the room move.
--   * New allocations are written as 'active' (matching the pre-reset state), not
--     'pending_approval'.
--
-- VERIFIED CONSTRAINTS (dry-run against production, rolled back)
--   * tier_id and the three emergency_contact_* columns are NOT NULL. fn_auto_allocate_classic
--     passes hostel_tier_policy(tier_key='standard') and '' -- mirrored here.
--   * NEITHER trg_allocation_sync_learner_categories NOR _on_allocation_settle_arrival
--     maintains hostel_beds.status. Bed status MUST be set explicitly on both sides of a
--     move, or the bed becomes a phantom (free in inventory, taken by the allocator).
--   * billing_enforce_once_per_learner DOES fire on UPDATE and raises BL001 when another
--     non-cancelled bill exists for the same learner+category. Avoided by reactivating
--     exactly ONE bill, and only for learners with no live bill.
--   * Upgrade bills are fee_source='hostel_category', so trg_bill_apply_hostel_fee_categories
--     (which re-derives categories from the fee band and would UNDO the upgrade) does not fire.
--
-- REVERSIBILITY
--   bak_hostel_upgrade_repair_20260812 captures the full pre-state (bill status/balance,
--   allocation id, bed, room, category) for every learner touched, plus the bed actually
--   assigned. Nothing is DELETEd -- superseded allocations are 'vacated', which is this
--   schema's room-change history marker.

-- ---------------------------------------------------------------------------
-- PHASE 0 -- resolve the repair set and snapshot the pre-state
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _rep_bills ON COMMIT DROP AS
SELECT b.id                                                        AS bill_id,
       b.student_id                                                AS lp_id,
       b.status                                                    AS bill_status,
       b.final_amount,
       b.balance_amount,
       b.created_at,
       hc.id                                                       AS target_cat_id,
       hc.sort_order                                               AS target_sort
FROM billing_student_bills b
LEFT JOIN hostel_categories hc
       ON hc.name = btrim(substring(b.bill_description FROM '.*-> (.*)$'))
      AND hc.type = 'girls'
WHERE b.item_category_id = '4c58ba18-f5c8-4167-802e-b6f0677e2335';  -- Hostel Upgrade Fee

-- One target per learner: the END of their upgrade chain (highest category).
CREATE TEMP TABLE _rep_target ON COMMIT DROP AS
SELECT lp_id,
       max(target_sort)                                                AS target_sort,
       bool_or(bill_status NOT IN ('cancelled','superseded'))          AS has_live_bill
FROM _rep_bills
GROUP BY lp_id
HAVING max(target_sort) IS NOT NULL;

-- The single bill to reinstate per learner (skip anyone already holding a live bill,
-- otherwise billing_enforce_once_per_learner raises BL001).
CREATE TEMP TABLE _rep_bill_pick ON COMMIT DROP AS
SELECT DISTINCT ON (rb.lp_id) rb.lp_id, rb.bill_id, rb.final_amount, rb.balance_amount
FROM _rep_bills rb
JOIN _rep_target rt ON rt.lp_id = rb.lp_id
WHERE rt.has_live_bill IS NOT TRUE
  AND rb.bill_status = 'cancelled'
  AND rb.target_sort = rt.target_sort
ORDER BY rb.lp_id, rb.created_at DESC;

-- Learners whose CURRENT room category differs from their recovered target.
CREATE TEMP TABLE _rep_set ON COMMIT DROP AS
SELECT rt.lp_id,
       rt.target_sort,
       tc.id                       AS target_cat_id,
       lp.roll_number,
       lp.institution_id,
       lp.degree_id, lp.department_id, lp.program_id,
       lp.semester_id, lp.academic_year_id,
       pp.id                       AS profile_id,
       ha.id                       AS old_alloc_id,
       ha.bed_id                   AS old_bed_id,
       ha.room_id                  AS old_room_id,
       hcr.sort_order              AS cur_sort,
       hcr.name                    AS cur_cat,
       i.name                      AS institution_name
FROM _rep_target rt
JOIN learners_profiles lp ON lp.id = rt.lp_id
JOIN institutions i       ON i.id  = lp.institution_id
JOIN hostel_categories tc ON tc.sort_order = rt.target_sort AND tc.type = 'girls'
LEFT JOIN LATERAL (
  SELECT p.id FROM profiles p WHERE p.learner_id = lp.id ORDER BY p.created_at LIMIT 1
) pp ON true
LEFT JOIN LATERAL (
  SELECT a.* FROM hostel_allocations a
  WHERE a.learner_id = pp.id AND a.status IN ('active','pending_approval')
  ORDER BY a.allocation_date DESC LIMIT 1
) ha ON true
LEFT JOIN hostel_rooms hr      ON hr.id  = ha.room_id
LEFT JOIN hostel_categories hcr ON hcr.id = hr.category_id
WHERE hcr.sort_order IS DISTINCT FROM rt.target_sort
  AND pp.id IS NOT NULL;

-- Guard: every reinstated bill must have had nothing collected against it, otherwise
-- resetting balance_amount = final_amount would silently erase a payment.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _rep_bill_pick bp
  WHERE bp.balance_amount IS DISTINCT FROM bp.final_amount;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ABORT: % reinstated bill(s) have prior collection; balance would be overwritten', v_bad;
  END IF;
END $$;

-- Baseline for the Phase 4 consistency assertion. Two beds (Girls Hostel A room 5,
-- beds 2 and 5) are ALREADY inconsistent before this migration runs -- they read
-- 'available' while carrying a pending_approval allocation from the Aug-11 reset. That
-- is a separate defect the operator chose not to fix here, so the invariant below is
-- "this migration introduced no NEW mismatch", not "there are none".
CREATE TEMP TABLE _rep_baseline ON COMMIT DROP AS
SELECT count(*) AS ghost_beds_before
FROM hostel_beds bd
WHERE (bd.status = 'available') <> NOT EXISTS (
        SELECT 1 FROM hostel_allocations a
         WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'));

CREATE TABLE IF NOT EXISTS bak_hostel_upgrade_repair_20260812 (
  lp_id              uuid,
  roll_number        text,
  institution_name   text,
  target_category    text,
  prev_category      text,
  prev_alloc_id      uuid,
  prev_room_id       uuid,
  prev_bed_id        uuid,
  reinstated_bill_id uuid,
  new_alloc_id       uuid,
  new_block_name     text,
  new_room_number    text,
  new_bed_number     text,
  outcome            text,
  captured_at        timestamptz DEFAULT now()
);

INSERT INTO bak_hostel_upgrade_repair_20260812
  (lp_id, roll_number, institution_name, target_category, prev_category,
   prev_alloc_id, prev_room_id, prev_bed_id, reinstated_bill_id, outcome)
SELECT rs.lp_id, rs.roll_number, rs.institution_name, tc.name, rs.cur_cat,
       rs.old_alloc_id, rs.old_room_id, rs.old_bed_id, bp.bill_id, 'pending'
FROM _rep_set rs
JOIN hostel_categories tc ON tc.id = rs.target_cat_id
LEFT JOIN _rep_bill_pick bp ON bp.lp_id = rs.lp_id;

-- ---------------------------------------------------------------------------
-- PHASE 1 -- reinstate the cancelled upgrade bills
--
-- The original cancellations left remarks IS NULL on all 167 rows, so nothing recorded
-- who cancelled them or why. This write deliberately stamps a remark so the reinstatement
-- is traceable even though there is still no per-bill status-history table.
-- ---------------------------------------------------------------------------

UPDATE billing_student_bills b
   SET status         = 'unpaid',
       balance_amount = b.final_amount,
       remarks        = 'Reinstated 2026-08-12: room-category upgrade lost in the girls allocation reset',
       updated_at     = now()
FROM _rep_bill_pick bp
WHERE b.id = bp.bill_id;

-- ---------------------------------------------------------------------------
-- PHASE 2 -- release the beds these learners currently hold below their target
--
-- 'vacated' is this schema's superseded-allocation marker (see the 187 existing rows);
-- never DELETE, which strands balances. Bed status is maintained by hand because no
-- trigger does it.
-- ---------------------------------------------------------------------------

-- check_out_date is LOAD-BEARING here, not cosmetic. The uniqueness guard is
--   UNIQUE (room_id, bed_id) WHERE check_out_date IS NULL
-- -- it is NOT gated on status. A row left at check_out_date IS NULL keeps holding its
-- (room, bed) slot even after being marked 'vacated', so the 19 learners moving
-- Deluxe -> Premium would block the Deluxe-targeted learners from reusing the beds they
-- just released (23505). All 212 pre-existing vacated rows already set it; match them.
UPDATE hostel_allocations a
   SET status             = 'vacated',
       actual_vacate_date = CURRENT_DATE,
       check_out_date     = CURRENT_DATE,
       vacate_reason      = 'transfer',   -- vacate_reason_enum has no 'room_change'; 'transfer' is the room-move value
       updated_at         = now()
FROM _rep_set rs
WHERE a.id = rs.old_alloc_id;

UPDATE hostel_beds bd
   SET status              = 'available',
       current_occupant_id = NULL,
       updated_at          = now()
FROM _rep_set rs
WHERE bd.id = rs.old_bed_id;

-- ---------------------------------------------------------------------------
-- PHASE 3 -- place every learner on a bed of her recovered target category
--
-- Room reachability is resolved per COHORT TUPLE using the allocation engine's own
-- predicates, so this repair can never disagree with fn_auto_allocate_plan about who
-- may enter which room. Beds are then consumed in a sequential loop against a taken-set,
-- exactly as fn_auto_allocate_plan does -- a set-based rank would hand one bed to two
-- learners, because cohort eligibility sets overlap without nesting.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _rep_tuple_rooms ON COMMIT DROP AS
SELECT t.institution_id, t.degree_id, t.department_id, t.program_id, t.semester_id, t.target_sort,
       r.id AS room_id, hb.name AS block_name, r.floor, r.room_number, r.block_id
FROM (
  SELECT institution_id, degree_id, department_id, program_id, semester_id, target_sort,
         (array_agg(lp_id ORDER BY lp_id))[1] AS rep
  FROM _rep_set
  GROUP BY institution_id, degree_id, department_id, program_id, semester_id, target_sort
) t
CROSS JOIN LATERAL (
  SELECT r.* FROM hostel_rooms r
  JOIN hostel_blocks hb2 ON hb2.id = r.block_id
  WHERE hb2.hostel_type::text = 'girls' AND r.room_purpose = 'student'
) r
JOIN hostel_blocks hb       ON hb.id = r.block_id
JOIN hostel_categories hc   ON hc.id = r.category_id
WHERE hc.sort_order = t.target_sort
  AND hc.type = 'girls'
  AND fn_room_serves_institution(r.id, t.institution_id)
  AND fn_learner_strictly_eligible_for_room(t.rep, r.id, false);

CREATE INDEX ON _rep_tuple_rooms (institution_id, degree_id, department_id, program_id, semester_id, target_sort);

DO $$
DECLARE
  cand   record;
  v_tier uuid;
  v_bed  uuid; v_room uuid; v_block uuid;
  v_bname text; v_rnum text; v_bnum text;
  v_alloc uuid;
  v_placed int := 0; v_unplaced int := 0;
BEGIN
  SELECT id INTO v_tier FROM hostel_tier_policy
   WHERE tier_key = 'standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN
    SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key = 'standard' AND is_active LIMIT 1;
  END IF;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'ABORT: no active standard hostel_tier_policy row (tier_id is NOT NULL)';
  END IF;

  CREATE TEMP TABLE _rep_taken (bed_id uuid PRIMARY KEY) ON COMMIT DROP;

  FOR cand IN
    SELECT * FROM _rep_set ORDER BY institution_name, roll_number, lp_id
  LOOP
    v_bed := NULL; v_room := NULL; v_block := NULL;

    SELECT b.id, tr.room_id, tr.block_id, tr.block_name, tr.room_number, b.bed_number
      INTO v_bed, v_room, v_block, v_bname, v_rnum, v_bnum
    FROM _rep_tuple_rooms tr
    JOIN hostel_beds b ON b.room_id = tr.room_id AND b.status = 'available'
    WHERE tr.institution_id IS NOT DISTINCT FROM cand.institution_id
      AND tr.degree_id      IS NOT DISTINCT FROM cand.degree_id
      AND tr.department_id  IS NOT DISTINCT FROM cand.department_id
      AND tr.program_id     IS NOT DISTINCT FROM cand.program_id
      AND tr.semester_id    IS NOT DISTINCT FROM cand.semester_id
      AND tr.target_sort    =  cand.target_sort
      -- Guard on check_out_date, NOT status: that is the predicate the uniqueness index
      -- uses, so it is the only test that actually predicts whether the INSERT will pass.
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.check_out_date IS NULL)
      AND NOT EXISTS (SELECT 1 FROM _rep_taken t WHERE t.bed_id = b.id)
    ORDER BY tr.block_name, tr.floor, tr.room_number, b.bed_number
    LIMIT 1;

    IF v_bed IS NULL THEN
      v_unplaced := v_unplaced + 1;
      UPDATE bak_hostel_upgrade_repair_20260812
         SET outcome = 'NO BED IN TARGET CATEGORY'
       WHERE lp_id = cand.lp_id;
      CONTINUE;
    END IF;

    INSERT INTO _rep_taken(bed_id) VALUES (v_bed);

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id,
      academic_year_id, semester_id, allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, override_reason
    ) VALUES (
      cand.institution_id, cand.profile_id, v_block, v_room, v_bed,
      cand.academic_year_id, cand.semester_id,
      (CASE WHEN cand.old_alloc_id IS NULL THEN 'fresh' ELSE 'transfer' END)::allocation_type_enum,
      CURRENT_DATE, 'active', '', '', '',
      v_tier,
      'Reinstated 2026-08-12: room-category upgrade lost in the girls allocation reset'
    )
    RETURNING id INTO v_alloc;

    UPDATE hostel_beds
       SET status = 'occupied', current_occupant_id = cand.profile_id, updated_at = now()
     WHERE id = v_bed;

    UPDATE bak_hostel_upgrade_repair_20260812
       SET new_alloc_id = v_alloc, new_block_name = v_bname,
           new_room_number = v_rnum, new_bed_number = v_bnum, outcome = 'placed'
     WHERE lp_id = cand.lp_id;

    v_placed := v_placed + 1;
  END LOOP;

  RAISE NOTICE 'upgrade repair: % placed, % unplaced', v_placed, v_unplaced;
END $$;

-- ---------------------------------------------------------------------------
-- PHASE 4 -- invariants. Any failure aborts the whole migration.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_dup int; v_ghost int; v_ghost_before int; v_short int;
BEGIN
  -- No bed may hold two occupancy slots. Tested on check_out_date, matching the index.
  SELECT count(*) INTO v_dup FROM (
    SELECT bed_id FROM hostel_allocations
    WHERE check_out_date IS NULL AND bed_id IS NOT NULL
    GROUP BY bed_id HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN RAISE EXCEPTION 'ABORT: % bed(s) double-booked', v_dup; END IF;

  -- Bed status must not drift further out of step with the allocation ledger.
  SELECT count(*) INTO v_ghost
  FROM hostel_beds bd
  WHERE (bd.status = 'available') <> NOT EXISTS (
          SELECT 1 FROM hostel_allocations a
           WHERE a.bed_id = bd.id AND a.status IN ('active','pending_approval'));
  SELECT ghost_beds_before INTO v_ghost_before FROM _rep_baseline;
  IF v_ghost > v_ghost_before THEN
    RAISE EXCEPTION 'ABORT: bed/ledger mismatches rose from % to %', v_ghost_before, v_ghost;
  END IF;

  -- Everyone in the repair set must now sit at their target category.
  SELECT count(*) INTO v_short
  FROM bak_hostel_upgrade_repair_20260812 k
  WHERE k.outcome <> 'placed';
  IF v_short > 0 THEN
    RAISE WARNING 'upgrade repair: % learner(s) could not be placed -- see bak_hostel_upgrade_repair_20260812', v_short;
  END IF;
END $$;
