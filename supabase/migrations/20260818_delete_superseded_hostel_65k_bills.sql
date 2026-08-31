-- Remove the 60 superseded Hostel Fee (65,000) bills left behind by
-- 20260818_split_hostel_mess_bills_ay2026.sql.
--
-- They are void (status='superseded') so they never counted toward any total --
-- isVoidBill() in lib/billing/bill-status.ts already excludes them -- but they
-- render as a stray SUPERSEDED row under the "All Bills" filter on
-- /billing/schedule/students/[id], which reads as a duplicate Hostel Fee.
--
-- SAFETY. billing_receipt_items.bill_id is ON DELETE CASCADE, so deleting a bill
-- that still holds a payment allocation silently erases that allocation from its
-- receipt. These 60 hold NONE: the split migration MOVED their allocations onto
-- the replacement Hostel/Mess bills rather than duplicating them the way
-- admission_fix_fee_mismatch_2026 does. The other 68 superseded bills in the
-- database are NOT in scope here -- 37 of them still carry Rs 4,40,000 of
-- allocations and deleting those would detach real collections.
--
-- Note that prevent_mass_delete() (trigger safety_log_delete) does NOT block
-- anything despite its name; it only writes a webhook_logs row. The guard below
-- is the real one.
--
-- Restorable from _bak_hostel_mess_split_20260818, which holds every column of
-- all 60 rows.

do $del$
declare
  v_target int;
  v_deleted int;
begin
  select count(*) into v_target
  from billing_student_bills b
  where b.id in (select id from _bak_hostel_mess_split_20260818)
    and b.status = 'superseded'
    and not exists (select 1 from billing_receipt_items      x where x.bill_id = b.id)
    and not exists (select 1 from billing_discounts          x where x.bill_id = b.id)
    and not exists (select 1 from billing_bill_apportionments x where x.bill_id = b.id)
    and not exists (select 1 from billing_late_charges       x where x.bill_id = b.id or x.penalty_bill_id = b.id)
    and not exists (select 1 from billing_refund_request_bills x where x.bill_id = b.id)
    and not exists (select 1 from student_credit_balances    x where x.consumed_against_bill_id = b.id)
    and not exists (select 1 from payment_transaction_items  x where x.bill_id = b.id)
    and not exists (select 1 from billing_student_bills      x where x.superseded_by_bill_id = b.id);

  if v_target <> 60 then
    raise exception 'Refusing to delete: expected exactly 60 clean superseded hostel bills, found %. '
                    'Something changed since the split -- re-audit before retrying.', v_target;
  end if;

  delete from billing_student_bills b
  where b.id in (select id from _bak_hostel_mess_split_20260818)
    and b.status = 'superseded'
    and not exists (select 1 from billing_receipt_items      x where x.bill_id = b.id)
    and not exists (select 1 from billing_discounts          x where x.bill_id = b.id)
    and not exists (select 1 from billing_bill_apportionments x where x.bill_id = b.id)
    and not exists (select 1 from billing_late_charges       x where x.bill_id = b.id or x.penalty_bill_id = b.id)
    and not exists (select 1 from billing_refund_request_bills x where x.bill_id = b.id)
    and not exists (select 1 from student_credit_balances    x where x.consumed_against_bill_id = b.id)
    and not exists (select 1 from payment_transaction_items  x where x.bill_id = b.id)
    and not exists (select 1 from billing_student_bills      x where x.superseded_by_bill_id = b.id);

  get diagnostics v_deleted = row_count;

  if v_deleted <> 60 then
    raise exception 'Deleted % rows, expected 60 -- rolling back.', v_deleted;
  end if;

  raise notice 'deleted % superseded hostel 65,000 bills', v_deleted;
end
$del$;
