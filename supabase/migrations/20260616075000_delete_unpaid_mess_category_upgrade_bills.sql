-- Delete non-paid MESS category upgrade bills (campus living hostel)
--
-- Context: completes the upgrade-billing wipe begun in 20260616060000 (room
-- bills). 7 mess category bills existed (fee_source='hostel_category',
-- kind='mess'), all unpaid and all with description "Mess upgrade: Classic ->
-- Premium": 5 under "Mess Upgrade Fee" + 2 under the generic "Mess Fee" category
-- (early upgrades predating the dedicated category). User decision (2026-06-16):
-- clear all mess category upgrade bills.
--
-- Safety: none paid (amount_paid=0, payment_date NULL); zero rows in
-- billing_receipt_items / payment_transaction(_items) / billing_bill_apportionments
-- / student_credit_balances referenced them. Base academic hostel bills (kind
-- 'hostel', fee_source 'academic') are untouched.
--
-- Backup _bak_mess_upgrade_bills_20260616 (7 rows); drop after smoke.

CREATE TABLE IF NOT EXISTS _bak_mess_upgrade_bills_20260616 AS
SELECT b.*
FROM billing_student_bills b
JOIN billing_categories bc ON bc.id = b.item_category_id
WHERE b.fee_source = 'hostel_category'
  AND bc.kind = 'mess'
  AND COALESCE(b.balance_amount, b.final_amount) = b.final_amount
  AND b.payment_date IS NULL;

DELETE FROM billing_student_bills
WHERE id IN (SELECT id FROM _bak_mess_upgrade_bills_20260616);
