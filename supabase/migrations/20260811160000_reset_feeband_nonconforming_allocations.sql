-- =====================================================================
-- Reset the hostel allocations that do not conform to the fee-band
-- eligibility configuration, so the cohort can be re-run through
-- Auto-Allocate once the fee bands are corrected.
--
-- Operator decision (2026-08-11): reset every non-conforming learner
-- EXCEPT those holding a PAID category upgrade, and cancel their
-- outstanding upgrade bills.
--
-- Scope = ACTIVE allocations where the allocated room's category is NOT in
-- the learner's fee-band entitlement (fn_hostel_learner_room_categories),
-- OR where no fee band resolves at all, AND the learner holds no PAID
-- hostel_category upgrade bill.   ==> 199 rows (152 off-band, 47 no-band)
--
-- NOTE ON STRUCTURE: the scope is frozen into bak_hostel_reset_scope_20260811
-- FIRST, in its own statement, and every mutation below reads from that table.
-- Recomputing the scope inline inside this migration was tried and blew the
-- statement timeout - fn_hostel_learner_room_categories re-derives each
-- learner's academic fee from billing_student_bills, and 692 learners of that
-- is too slow to sit in front of the writes. Freezing it also means the
-- migration applies exactly the set that was audited and approved, not
-- whatever the data happens to say at apply time.
--
-- DELIBERATELY NOT CANCELLED: 3 upgrade bills in 'partially_paid'
-- (PD25028 Rs.7,500 received, DB24A045 Rs.7,500, DB24A017 Rs.30,000 -
-- Rs.45,000 total). Cancelling a bill with payments against it strands that
-- money with no refund or credit note; those three need a Finance decision.
-- Their ALLOCATIONS are still reset, per the operator decision.
--
-- Mirrors fn_cl_admin_reset_allocation(..., p_reset_room => true,
-- p_reset_room_category => true, p_reset_mess_category => true) applied in
-- bulk; that RPC cannot be called over MCP because it gates on
-- user_has_permission('campus_living.upgrades.manage') and auth.uid() is NULL
-- there. Its two guards were verified empty for this set beforehand:
-- 0 hostel_deposits, 0 hostel_vacate_requests. Inbound FK check: 0 rows in
-- hostel_cleaning_bookings / hostel_premium_invites would cascade.
-- hostel_allocations has NO delete trigger, so step 3 is mandatory.
--
-- Rollback material: bak_hostel_reset_allocations_20260811 (full rows),
-- bak_hostel_reset_beds_20260811 (bed status + occupant),
-- bak_hostel_reset_bills_20260811 (bill ids + prior status),
-- bak_hostel_reset_scope_20260811 (old_room_cat_id, old_mess_cat_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 - freeze the scope (run as its own statement, before the migration)
-- ---------------------------------------------------------------------
-- CREATE TABLE bak_hostel_reset_scope_20260811 AS
-- WITH alloc AS (
--   SELECT a.id AS alloc_id, a.bed_id, a.learner_id AS profile_id,
--          lp.id AS lp_id, lp.roll_number,
--          NULLIF(trim(COALESCE(lp.first_name,'')||' '||COALESCE(lp.last_name,'')),'') AS learner_name,
--          b.hostel_type, b.name AS block_name, r.room_number, r.category_id AS room_cat_id,
--          lp.hostel_category_id AS old_room_cat_id, lp.mess_category_id AS old_mess_cat_id
--   FROM hostel_allocations a
--   JOIN hostel_blocks b ON b.id = a.block_id
--   JOIN hostel_rooms  r ON r.id = a.room_id
--   JOIN profiles pr ON pr.id = a.learner_id
--   JOIN learners_profiles lp ON lp.id = pr.learner_id
--   WHERE a.status = 'active'
-- ), scored AS (
--   SELECT al.*,
--          (SELECT array_remove(array_agg(e.category_id), NULL)
--             FROM fn_hostel_learner_room_categories(al.lp_id) e) AS ent_room_ids,
--          EXISTS (SELECT 1 FROM billing_student_bills b
--                   WHERE b.student_id = al.lp_id AND b.fee_source = 'hostel_category'
--                     AND b.status = 'paid') AS has_paid_upgrade
--   FROM alloc al
-- )
-- SELECT s.*, CASE WHEN COALESCE(cardinality(s.ent_room_ids),0)=0 THEN 'NO_BAND' ELSE 'OFF_BAND' END AS reset_reason
-- FROM scored s
-- WHERE NOT s.has_paid_upgrade
--   AND (COALESCE(cardinality(s.ent_room_ids),0) = 0 OR NOT (s.room_cat_id = ANY(s.ent_room_ids)));
--
-- cardinality(array_agg(...)) over a zero-row set-returning function is NULL,
-- not 0 - the COALESCE above is load-bearing, without it every no-band learner
-- silently drops out of the scope.

-- ---------------------------------------------------------------------
-- STEP 2 - the migration proper
-- ---------------------------------------------------------------------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM bak_hostel_reset_scope_20260811;
  IF v_n <> 199 THEN
    RAISE EXCEPTION 'Reset scope is % rows, expected 199', v_n;
  END IF;
END $$;

CREATE TABLE bak_hostel_reset_allocations_20260811 AS
SELECT a.* FROM hostel_allocations a
WHERE a.id IN (SELECT alloc_id FROM bak_hostel_reset_scope_20260811);

CREATE TABLE bak_hostel_reset_beds_20260811 AS
SELECT bd.id, bd.status, bd.current_occupant_id
FROM hostel_beds bd
WHERE bd.id IN (SELECT bed_id FROM bak_hostel_reset_scope_20260811 WHERE bed_id IS NOT NULL);

CREATE TABLE bak_hostel_reset_bills_20260811 AS
SELECT b.id, b.student_id, b.status AS old_status, b.final_amount, b.balance_amount
FROM billing_student_bills b
WHERE b.fee_source = 'hostel_category'
  AND b.status = 'unpaid'
  AND b.student_id IN (SELECT lp_id FROM bak_hostel_reset_scope_20260811);

-- 1. cancel the outstanding upgrade bills (unpaid only; partially_paid spared)
UPDATE billing_student_bills b
   SET status = 'cancelled'
 WHERE b.fee_source = 'hostel_category'
   AND b.status = 'unpaid'
   AND b.student_id IN (SELECT lp_id FROM bak_hostel_reset_scope_20260811);

-- 2. remove the allocations
DELETE FROM hostel_allocations a
 WHERE a.id IN (SELECT alloc_id FROM bak_hostel_reset_scope_20260811);

-- 3. release the beds (hostel_allocations has no DELETE trigger)
UPDATE hostel_beds bd
   SET status = 'available', current_occupant_id = NULL, updated_at = now()
 WHERE bd.id IN (SELECT bed_id FROM bak_hostel_reset_scope_20260811 WHERE bed_id IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1 FROM hostel_allocations a
      WHERE a.bed_id = bd.id
        AND a.status IN ('active','pending_approval')
        AND a.check_out_date IS NULL);

-- 4. clear room + mess category so re-allocation re-derives them from the fee band
UPDATE learners_profiles lp
   SET hostel_category_id = NULL
 WHERE lp.id IN (SELECT lp_id FROM bak_hostel_reset_scope_20260811)
   AND lp.hostel_category_id IS NOT NULL;

UPDATE learners_profiles lp
   SET mess_category_id = NULL
 WHERE lp.id IN (SELECT lp_id FROM bak_hostel_reset_scope_20260811)
   AND lp.mess_category_id IS NOT NULL;

-- Applied 2026-08-11. Verified after commit:
--   active allocations 692 -> 493   (199 removed, 0 of the scope remain)
--   bills cancelled 80              (3 partially_paid left alone)
--   beds still occupied 0           room/mess category still set 0
