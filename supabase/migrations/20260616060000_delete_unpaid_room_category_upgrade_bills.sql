-- Delete non-paid ROOM category upgrade bills (campus living hostel)
--
-- Context: the self-service room-category upgrade flow generated 11 bills
-- (fee_source='hostel_category', item category kind='hostel'). None were ever
-- paid. 3 were live 'unpaid' (Deluxe -> Premium, created 2026-06-11); 8 were
-- already 'cancelled' (Classic -> Deluxe) after their waitlist bed holds expired
-- in the 2026-06-16 category-upgrade waitlist reset (20260616050000).
--
-- User decision (2026-06-16): purge all 11 non-paid room-upgrade bills. Mess
-- upgrade bills (kind='mess', 9 rows) and base academic hostel bills (64 rows)
-- are intentionally left untouched.
--
-- Safety: no rows in billing_receipt_items / payment_transaction(_items) /
-- billing_discounts / billing_bill_apportionments / student_credit_balances
-- referenced these bills. hostel_waitlist.upgrade_bill_id is ON DELETE SET NULL,
-- so the 8 expired waitlist holds simply had their pointer nulled.
--
-- Backup table _bak_room_upgrade_bills_20260616 holds the deleted rows; drop it
-- after smoke verification.

CREATE TABLE IF NOT EXISTS _bak_room_upgrade_bills_20260616 AS
SELECT b.*
FROM billing_student_bills b
JOIN billing_categories bc ON bc.id = b.item_category_id
WHERE b.fee_source = 'hostel_category'
  AND bc.kind = 'hostel'
  -- defensive non-paid guard: nothing paid, no payment recorded
  AND COALESCE(b.balance_amount, b.final_amount) = b.final_amount
  AND b.payment_date IS NULL;

DELETE FROM billing_student_bills
WHERE id IN (SELECT id FROM _bak_room_upgrade_bills_20260616);
