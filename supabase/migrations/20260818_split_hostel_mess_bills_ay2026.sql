-- Split the combined Hostel Fee bill into Hostel + Mess for admission year 2026-27.
--
-- 87 active AY2026 fee structures carry Hostel 25,000 AND Mess 40,000 as two
-- separate lines. Bills generated before that split carry a single combined
-- Hostel Fee of 65,000 and no Mess Fee -- zero mess bills exist in the entire
-- admission year. 60 bills are affected.
--
-- Why admission_fix_fee_mismatch_2026 cannot do this: both sides of its
-- comparison filter `bc.kind not in ('transport','hostel','mess')`, so hostel
-- and mess lines are structurally invisible to it. That is also why the
-- 2026-08-17 conformance audit reported 973/974 matching.
--
-- SAFETY -- the learner's hostel room / mess entitlement band is
-- fn_learner_band_academic_fee = SUM(final_amount) over non-void
-- fee_source='academic' bills, with NO category filter. 25,000 + 40,000 = 65,000
-- keeps that sum identical, so hostel_category_id / mess_category_id cannot
-- move. The split is therefore applied ONLY when the two structure lines sum
-- EXACTLY to the existing bill amount; anything else is skipped and reported.
--
-- Receipt invariant -- every affected receipt is currently allocated to exactly
-- its payment_amount. Allocations are MOVED (insert new, delete old), not
-- duplicated the way admission_fix_fee_mismatch_2026 does, so that invariant
-- survives. Payment fills Hostel first, then Mess (structure sort_order).

-- 1. Snapshot ---------------------------------------------------------------
create table if not exists _bak_hostel_mess_split_20260818 as
select b.*, now() as snapshot_at
from billing_student_bills b
join billing_categories bc on bc.id = b.item_category_id
join learners_profiles lp on lp.id = b.student_id
join admission_years ay on ay.id = lp.admission_year_id
where ay.year = 2026 and bc.kind = 'hostel' and b.final_amount = 65000
  and b.fee_source = 'academic' and b.status not in ('cancelled','superseded');

create table if not exists _bak_hostel_mess_split_items_20260818 as
select ri.*, now() as snapshot_at
from billing_receipt_items ri
where ri.bill_id in (select id from _bak_hostel_mess_split_20260818);

create table if not exists _bak_hostel_mess_split_bands_20260818 as
select lp.id as learner_id, lp.hostel_category_id, lp.mess_category_id,
       fn_learner_admission_year_academic_fee(lp.id) as band_fee, now() as snapshot_at
from learners_profiles lp
where lp.id in (select student_id from _bak_hostel_mess_split_20260818);

-- 2. Quiet the reactive triggers so intermediate states cannot be observed ---
-- The band trigger is the dangerous one: it fires per STATEMENT, so between the
-- supersede and the two inserts it would see a sum 65,000 lower and rewrite
-- hostel_category_id / mess_category_id off a phantom band. The status triggers
-- are disabled because this migration sets status/balance explicitly.
-- prevent_bill_overpayment and billing_enforce_once_per_learner stay ENABLED as
-- safety nets.
alter table billing_student_bills disable trigger trg_bill_apply_hostel_fee_categories_ins;
alter table billing_student_bills disable trigger trg_bill_apply_hostel_fee_categories_upd;
alter table billing_student_bills disable trigger trg_evaluate_status_after_bill_paid;
alter table billing_receipt_items  disable trigger trigger_update_bill_status_on_payment;
alter table billing_receipt_items  disable trigger trigger_update_bill_status_on_delete;
alter table billing_receipt_items  disable trigger trg_cl_upgrade_holds_after_payment;

-- 3. Split ------------------------------------------------------------------
do $mig$
declare
  r            record;
  v_hostel_amt numeric;  v_hostel_cat uuid;
  v_mess_amt   numeric;  v_mess_cat   uuid;
  v_new_hostel uuid;     v_new_mess   uuid;
  v_ri         record;
  v_rem        numeric;  v_alloc      numeric;
  v_done int := 0;       v_skip int := 0;
begin
  for r in
    select b.id, b.student_id, b.institution_id, b.due_date, b.academic_year_id,
           b.applies_year_of_study, b.final_amount, b.remarks
    from billing_student_bills b
    join billing_categories bc on bc.id = b.item_category_id
    join learners_profiles lp on lp.id = b.student_id
    join admission_years ay on ay.id = lp.admission_year_id
    where ay.year = 2026 and bc.kind = 'hostel' and b.final_amount = 65000
      and b.fee_source = 'academic' and b.status not in ('cancelled','superseded')
    order by b.student_id
  loop
    -- Resolve the learner's structure with the accommodation-aware,
    -- deterministic predicate from admission_fix_fee_mismatch_2026 -- NOT
    -- admission_resolve_fee_items_readonly, which omits accommodation_type_id
    -- and has no tiebreaker, so it picks arbitrarily between the DS and HOSTEL
    -- variants (a 65,000 difference).
    select h.amount, h.billing_category_id, m.amount, m.billing_category_id
      into v_hostel_amt, v_hostel_cat, v_mess_amt, v_mess_cat
    from learners_profiles lp
    join lateral (
      select afs.id from admission_fee_structures afs
       where afs.institution_id = lp.institution_id and afs.degree_id = lp.degree_id
         and afs.department_id = lp.department_id and afs.programme_id = lp.program_id
         and afs.quota_id = lp.quota_id and afs.admission_year_id = lp.admission_year_id
         and afs.status = 'active'
         and exists (select 1 from admission_fee_structure_communities j
                      where j.fee_structure_id = afs.id
                        and j.community_category_id = lp.community_category_id)
         and (afs.gender = upper(lp.gender) or afs.gender is null)
         and (afs.accommodation_type_id = lp.accommodation_type_id or afs.accommodation_type_id is null)
       order by (afs.accommodation_type_id is not null) desc,
                (afs.gender is not null) desc, afs.updated_at desc
       limit 1) s on true
    join admission_fee_structure_items h on h.fee_structure_id = s.id
     and h.billing_category_id in (select id from billing_categories where kind = 'hostel')
    join admission_fee_structure_items m on m.fee_structure_id = s.id
     and m.billing_category_id in (select id from billing_categories where kind = 'mess')
    where lp.id = r.student_id;

    if v_hostel_amt is null or v_mess_amt is null
       or (v_hostel_amt + v_mess_amt) <> r.final_amount then
      v_skip := v_skip + 1;
      raise notice 'SKIP learner % bill % : hostel=% mess=% does not sum to %',
        r.student_id, r.id, v_hostel_amt, v_mess_amt, r.final_amount;
      continue;
    end if;

    update billing_student_bills
       set status = 'superseded', updated_at = now(),
           remarks = coalesce(remarks || ' | ', '')
                     || 'AY2026 hostel/mess split: replaced by separate Hostel + Mess bills'
     where id = r.id;

    insert into billing_student_bills(
      student_id, institution_id, item_category_id, bill_description, due_date,
      quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
      status, fee_source, academic_year_id, applies_year_of_study, remarks)
    values (r.student_id, r.institution_id, v_hostel_cat, 'Hostel Fee', r.due_date,
            1, v_hostel_amt, v_hostel_amt, 0, v_hostel_amt, v_hostel_amt,
            'unpaid', 'academic', r.academic_year_id, r.applies_year_of_study,
            'AY2026 hostel/mess split: hostel portion of bill ' || r.id::text)
    returning id into v_new_hostel;

    insert into billing_student_bills(
      student_id, institution_id, item_category_id, bill_description, due_date,
      quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
      status, fee_source, academic_year_id, applies_year_of_study, remarks)
    values (r.student_id, r.institution_id, v_mess_cat, 'Mess Fee', r.due_date,
            1, v_mess_amt, v_mess_amt, 0, v_mess_amt, v_mess_amt,
            'unpaid', 'academic', r.academic_year_id, r.applies_year_of_study,
            'AY2026 hostel/mess split: mess portion of bill ' || r.id::text)
    returning id into v_new_mess;

    update billing_student_bills set superseded_by_bill_id = v_new_hostel where id = r.id;

    for v_ri in select id, receipt_id, amount_paid from billing_receipt_items
                 where bill_id = r.id order by amount_paid desc
    loop
      v_rem   := v_ri.amount_paid;
      v_alloc := least(v_rem, v_hostel_amt);
      if v_alloc > 0 then
        insert into billing_receipt_items(receipt_id, bill_id, amount_paid, allocation_reason)
        values (v_ri.receipt_id, v_new_hostel, v_alloc, 'fee_structure_change_reallocation');
        v_rem := v_rem - v_alloc;
      end if;
      if v_rem > 0 then
        insert into billing_receipt_items(receipt_id, bill_id, amount_paid, allocation_reason)
        values (v_ri.receipt_id, v_new_mess, v_rem, 'fee_structure_change_reallocation');
      end if;
      delete from billing_receipt_items where id = v_ri.id;
    end loop;

    update billing_student_bills b
       set balance_amount = b.final_amount - coalesce(p.paid, 0),
           status = case when coalesce(p.paid,0) >= b.final_amount then 'paid'
                         when coalesce(p.paid,0) > 0                then 'partially_paid'
                         else 'unpaid' end,
           payment_date = case when coalesce(p.paid,0) >= b.final_amount then now() end,
           updated_at = now()
      from (select bill_id, sum(amount_paid) paid from billing_receipt_items
             where bill_id in (v_new_hostel, v_new_mess) group by bill_id) p
     where b.id = p.bill_id;

    v_done := v_done + 1;
  end loop;

  raise notice 'hostel/mess split complete: % split, % skipped', v_done, v_skip;
end
$mig$;

-- 4. Restore triggers -------------------------------------------------------
alter table billing_student_bills enable trigger trg_bill_apply_hostel_fee_categories_ins;
alter table billing_student_bills enable trigger trg_bill_apply_hostel_fee_categories_upd;
alter table billing_student_bills enable trigger trg_evaluate_status_after_bill_paid;
alter table billing_receipt_items  enable trigger trigger_update_bill_status_on_payment;
alter table billing_receipt_items  enable trigger trigger_update_bill_status_on_delete;
alter table billing_receipt_items  enable trigger trg_cl_upgrade_holds_after_payment;
