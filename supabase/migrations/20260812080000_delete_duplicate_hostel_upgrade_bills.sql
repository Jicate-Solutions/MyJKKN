-- Purge duplicate "Hostel Upgrade Fee" bills (2026-08-12, operator-directed)
--
-- WHAT AND WHY
-- ------------
-- 22 cancelled bills remained in billing category 'Hostel Upgrade Fee'
-- (4c58ba18-f5c8-4167-802e-b6f0677e2335) after the 2026-08-12 restoration. They split into:
--   * 10 EXACT DUPLICATES  -- the learner holds a LIVE bill for the SAME target category.
--                             These are what this migration deletes.
--   * 12 SUPERSEDED CHAINS -- the learner later upgraded further (Classic->Deluxe retired
--                             and replaced by a Premium / Premium+AC bill). NOT touched.
--
-- The operator was offered `status='superseded'` + `superseded_by_bill_id` (the mechanism
-- 68 bills already use, reversible, preserves the reason) and chose a hard DELETE instead.
-- Proceeding as directed; the snapshot tables below make it restorable anyway.
--
-- SAFETY ESTABLISHED BEFORE WRITING THIS
--   * Nothing was ever collected against these 10: 0 receipt_items, 0 payment_transaction_items,
--     0 apportionments, 0 late_charges, 0 refund_request_bills, 0 consumed credit balances.
--     So the DELETE creates no refund liability and moves no money.
--   * hostel_waitlist.upgrade_bill_id is ON DELETE SET NULL and 1 of the 10 is referenced.
--     That link is snapshotted below so it can be restored; without the snapshot the delete
--     would blank it silently.
--   * `prevent_mass_delete` does NOT prevent anything despite its name -- it only writes a
--     SAFETY_ALERT row to webhook_logs. It is not a safety net.
--
-- SELECTION IS BY PREDICATE, NOT HARDCODED IDS: a bill qualifies only when the category it
-- upgrades TO is identical to the category the learner's live bill upgrades to.

-- ---------------------------------------------------------------------------
-- Resolve the exact set
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE _dupe_bills ON COMMIT DROP AS
SELECT bc.id AS bill_id
FROM billing_student_bills bc
JOIN LATERAL (
  SELECT b2.bill_description
  FROM billing_student_bills b2
  WHERE b2.student_id       = bc.student_id
    AND b2.item_category_id = bc.item_category_id
    AND b2.status NOT IN ('cancelled','superseded')
  ORDER BY b2.created_at DESC
  LIMIT 1
) live ON true
WHERE bc.item_category_id = '4c58ba18-f5c8-4167-802e-b6f0677e2335'
  AND bc.status = 'cancelled'
  AND btrim(substring(bc.bill_description FROM '.*-> (.*)$'))
      = btrim(substring(live.bill_description FROM '.*-> (.*)$'));

-- Refuse to run if the set is not the 10 rows this migration was reviewed against.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM _dupe_bills;
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'ABORT: expected 10 duplicate bills, found % -- data changed since review', v_n;
  END IF;
END $$;

-- Refuse to run if any money is attached after all.
DO $$
DECLARE v_money int;
BEGIN
  SELECT (SELECT count(*) FROM billing_receipt_items x JOIN _dupe_bills d ON d.bill_id = x.bill_id)
       + (SELECT count(*) FROM payment_transaction_items x JOIN _dupe_bills d ON d.bill_id = x.bill_id)
       + (SELECT count(*) FROM billing_refund_request_bills x JOIN _dupe_bills d ON d.bill_id = x.bill_id)
       + (SELECT count(*) FROM student_credit_balances x JOIN _dupe_bills d ON d.bill_id = x.consumed_against_bill_id)
    INTO v_money;
  IF v_money > 0 THEN
    RAISE EXCEPTION 'ABORT: % money-bearing row(s) reference these bills; refusing to delete', v_money;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Snapshot -- full row, so a restore is a plain INSERT ... SELECT
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS bak_deleted_upgrade_duplicate_bills_20260812;
CREATE TABLE bak_deleted_upgrade_duplicate_bills_20260812 AS
SELECT b.*, now() AS deleted_at
FROM billing_student_bills b
JOIN _dupe_bills d ON d.bill_id = b.id;

-- hostel_waitlist.upgrade_bill_id is SET NULL on delete: capture the links first.
DROP TABLE IF EXISTS bak_deleted_upgrade_dup_waitlist_links_20260812;
CREATE TABLE bak_deleted_upgrade_dup_waitlist_links_20260812 AS
SELECT w.id AS waitlist_id, w.upgrade_bill_id, now() AS captured_at
FROM hostel_waitlist w
JOIN _dupe_bills d ON d.bill_id = w.upgrade_bill_id;

-- ---------------------------------------------------------------------------
-- Delete
-- ---------------------------------------------------------------------------

DELETE FROM billing_student_bills b
USING _dupe_bills d
WHERE b.id = d.bill_id;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_left int; v_snap int; v_orphan int;
BEGIN
  SELECT count(*) INTO v_snap FROM bak_deleted_upgrade_duplicate_bills_20260812;
  IF v_snap <> 10 THEN
    RAISE EXCEPTION 'ABORT: snapshot holds % rows, expected 10', v_snap;
  END IF;

  SELECT count(*) INTO v_left
  FROM billing_student_bills b
  JOIN bak_deleted_upgrade_duplicate_bills_20260812 k ON k.id = b.id;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'ABORT: % targeted bill(s) still present', v_left;
  END IF;

  -- Every learner touched must still hold exactly the live bill that made the deleted row
  -- redundant. If any of them is now left with no live upgrade bill, we deleted the wrong row.
  SELECT count(*) INTO v_orphan
  FROM (SELECT DISTINCT student_id FROM bak_deleted_upgrade_duplicate_bills_20260812) k
  WHERE NOT EXISTS (
    SELECT 1 FROM billing_student_bills b
     WHERE b.student_id = k.student_id
       AND b.item_category_id = '4c58ba18-f5c8-4167-802e-b6f0677e2335'
       AND b.status NOT IN ('cancelled','superseded'));
  IF v_orphan > 0 THEN
    RAISE EXCEPTION 'ABORT: % learner(s) left with no live upgrade bill', v_orphan;
  END IF;
END $$;
