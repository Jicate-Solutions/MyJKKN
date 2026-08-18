-- Purge the 68 remaining superseded bills (all admission year 2026), left behind
-- by the admission_fix_fee_mismatch_2026 fee-sync runs of June/August 2026.
--
-- WHY THIS IS A REPAIR, NOT A LOSS.
-- The fee-sync 'change' branch inserts a 'fee_structure_change_reallocation'
-- row on the replacement bill but never deletes the 'original_payment' row on
-- the bill it supersedes. The same rupees are therefore allocated twice -- once
-- to a void bill, once to the live one. Measured before this migration:
--   38 receipts touch a superseded bill
--   37 of them are OVER-allocated, by Rs 4,32,300 in total
-- billing_receipt_items.bill_id is ON DELETE CASCADE, so deleting the void bills
-- removes exactly the duplicate half and leaves the live allocation intact.
--
-- THE THREE EXCEPTIONS. After the delete, 35 of the 38 receipts land exactly on
-- payment_amount. Three do not -- DHARANI KUMARAN A (1,600 + 2,000) and
-- SATHASIVAM B (4,100), Rs 7,700 in total. That shortfall is not lost: it equals
-- those learners' existing unconsumed student_credit_balances to the rupee
-- (3,600 and 4,100). Their payment exceeded what they owe and the excess is held
-- as credit rather than pinned to a bill, which is the correct representation.
-- The assertions below refuse to run if that reconciliation does not hold.
--
-- Nothing needs splitting here: none of the 68 are hostel bills, and across the
-- 57 learners holding one, only a single mismatched line remains among their
-- live bills -- the replacements are already correct.
--
-- prevent_mass_delete() (trigger safety_log_delete) does NOT block anything
-- despite the name; it only writes a webhook_logs row. The guards below are the
-- real protection.

-- Phase 0 -- snapshot ---------------------------------------------------------
create table if not exists _bak_superseded_purge_20260818 as
select b.*, now() as snapshot_at
from billing_student_bills b where b.status = 'superseded';

create table if not exists _bak_superseded_purge_items_20260818 as
select ri.*, now() as snapshot_at
from billing_receipt_items ri
where ri.bill_id in (select id from _bak_superseded_purge_20260818);

create table if not exists _bak_superseded_purge_receipts_20260818 as
select r.id as receipt_id, r.receipt_number, r.student_id, r.payment_amount,
       coalesce(sum(ri.amount_paid), 0) as alloc_before, now() as snapshot_at
from billing_receipts r
join billing_receipt_items ri on ri.receipt_id = r.id
where r.id in (select receipt_id from _bak_superseded_purge_items_20260818)
group by r.id, r.receipt_number, r.student_id, r.payment_amount;

create table if not exists _bak_superseded_purge_credits_20260818 as
select scb.*, now() as snapshot_at
from student_credit_balances scb
where scb.student_id in (select student_id from _bak_superseded_purge_20260818);

-- Phases 1-2 -- assert, then delete -------------------------------------------
do $purge$
declare
  v_n          int;
  v_not_2026   int;
  v_child      int;
  v_exact      int;
  v_off        int;
  v_shortfall  numeric;
  v_unreconciled int;
  v_deleted    int;
begin
  select count(*) into v_n from billing_student_bills where status = 'superseded';
  if v_n <> 68 then
    raise exception 'Expected 68 superseded bills, found % -- re-audit before retrying.', v_n;
  end if;

  select count(*) into v_not_2026
  from billing_student_bills b
  join learners_profiles lp on lp.id = b.student_id
  left join admission_years ay on ay.id = lp.admission_year_id
  where b.status = 'superseded' and coalesce(ay.year, -1) <> 2026;
  if v_not_2026 <> 0 then
    raise exception '% superseded bills are outside admission year 2026 -- out of scope.', v_not_2026;
  end if;

  -- Every child reference EXCEPT billing_receipt_items must be empty. Those two
  -- (discounts, payment_transaction_items) also cascade, so a silent delete
  -- would destroy them; the rest would block with a FK error.
  select count(*) into v_child
  from billing_student_bills b
  where b.status = 'superseded'
    and (   exists (select 1 from billing_discounts           x where x.bill_id = b.id)
         or exists (select 1 from billing_bill_apportionments x where x.bill_id = b.id)
         or exists (select 1 from billing_late_charges        x where x.bill_id = b.id or x.penalty_bill_id = b.id)
         or exists (select 1 from billing_refund_request_bills x where x.bill_id = b.id)
         or exists (select 1 from student_credit_balances     x where x.consumed_against_bill_id = b.id)
         or exists (select 1 from payment_transaction_items   x where x.bill_id = b.id)
         or exists (select 1 from billing_student_bills       x where x.superseded_by_bill_id = b.id));
  if v_child <> 0 then
    raise exception '% superseded bills carry child references beyond receipt items -- aborting.', v_child;
  end if;

  -- Simulate the post-delete allocation of every affected receipt.
  with sim as (
    select r.id, r.student_id, r.payment_amount,
           coalesce(sum(ri.amount_paid) filter (where b.status <> 'superseded'), 0) as after_alloc
    from billing_receipts r
    join billing_receipt_items ri on ri.receipt_id = r.id
    join billing_student_bills b on b.id = ri.bill_id
    where r.id in (select receipt_id from _bak_superseded_purge_items_20260818)
    group by r.id, r.student_id, r.payment_amount
  )
  select count(*) filter (where after_alloc =  payment_amount),
         count(*) filter (where after_alloc <> payment_amount),
         coalesce(sum(payment_amount - after_alloc) filter (where after_alloc <> payment_amount), 0)
    into v_exact, v_off, v_shortfall
  from sim;

  if v_exact <> 35 or v_off <> 3 or v_shortfall <> 7700 then
    raise exception 'Post-delete simulation changed: exact=% off=% shortfall=% (expected 35 / 3 / 7700).',
      v_exact, v_off, v_shortfall;
  end if;

  -- Each of those 3 receipts' shortfall must be covered by that learner's own
  -- unconsumed credit balance, aggregated per learner.
  with sim as (
    select r.id, r.student_id, r.payment_amount,
           coalesce(sum(ri.amount_paid) filter (where b.status <> 'superseded'), 0) as after_alloc
    from billing_receipts r
    join billing_receipt_items ri on ri.receipt_id = r.id
    join billing_student_bills b on b.id = ri.bill_id
    where r.id in (select receipt_id from _bak_superseded_purge_items_20260818)
    group by r.id, r.student_id, r.payment_amount
  ),
  per_learner as (
    select student_id, sum(payment_amount - after_alloc) as shortfall
    from sim where after_alloc <> payment_amount group by student_id
  )
  select count(*) into v_unreconciled
  from per_learner pl
  where pl.shortfall <> (select coalesce(sum(scb.amount), 0) from student_credit_balances scb
                          where scb.student_id = pl.student_id and scb.is_consumed = false);
  if v_unreconciled <> 0 then
    raise exception '% learner(s) have a shortfall not matched by an unconsumed credit balance -- aborting.',
      v_unreconciled;
  end if;

  delete from billing_student_bills where status = 'superseded';
  get diagnostics v_deleted = row_count;

  if v_deleted <> 68 then
    raise exception 'Deleted % rows, expected 68 -- rolling back.', v_deleted;
  end if;

  raise notice 'purged % superseded bills; % receipts now exactly allocated, % held against credit',
    v_deleted, v_exact, v_off;
end
$purge$;
