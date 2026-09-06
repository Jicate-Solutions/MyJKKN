-- Two college-side fee-structure conformance repairs for admission year 2026-27,
-- scoped to lifecycle account / reserved / admitted / active. Schools and the
-- Aided college are deliberately out of scope -- they bill through
-- school_fee_plans, not admission_fee_structures.
--
-- PART A -- 53 learners are billed for everything except Hostel and Mess, even
-- though the structure that resolves for them carries both lines. All 53 are
-- tagged accommodation_type = 'hostel'. (Only 1 of them holds an active hostel
-- allocation, but that is not a differentiator: of the 56 learners who ARE
-- already billed hostel+mess, ZERO hold one, and only 1 of all 130 hostel-tagged
-- AY2026 learners does. Room allocation simply has not run for this cohort.)
-- 106 bills, Rs 34,45,000 of new liability.
--
-- Both lines are inserted in a SINGLE statement on purpose.
-- trg_bill_apply_hostel_fee_categories is a STATEMENT-level trigger that
-- recomputes the learner's hostel/mess entitlement band from
-- fn_learner_band_academic_fee (SUM of non-void academic bills). Inserting
-- hostel and mess in one statement means it fires once, against the final
-- state -- never against a half-applied sum. Unlike the earlier 65,000 split,
-- this genuinely RAISES the academic total by 65,000, so the band is expected
-- to move; that is what aligns these 53 with the 56 already billed. The
-- before/after snapshot records exactly which learners shifted.
--
-- PART B -- 11 College of Education learners are billed 1 Year Tuition of
-- 35,000 against a structure that says 30,000. Reduced in place rather than
-- superseded: every paid amount is between 1,000 and 6,000, far below 30,000,
-- so no overpayment or credit arises, and update_bill_balance_on_amount_change
-- (BEFORE UPDATE) recalculates balance and status automatically. In place also
-- avoids re-introducing the superseded rows that were just purged.
--
-- NOT in scope: the 2 extra Education lines (University 3,000 + Application 500
-- on one learner), the 3 HOSTEL structures missing SC-A/ST, NAVEENPRASAD R's
-- NULL quota_id, and the missing (B.Ed) Pedagogy of Computer Science structure.

-- Part A ---------------------------------------------------------------------
create table if not exists _bak_hm_backfill_targets_20260818 as
with college as (
  select lp.id, lp.institution_id, lp.degree_id, lp.department_id, lp.program_id,
         lp.quota_id, lp.community_category_id, lp.accommodation_type_id,
         lp.admission_year_id, lp.gender
  from learners_profiles lp
  join institutions i on i.id = lp.institution_id
  join admission_years ay on ay.id = lp.admission_year_id
  where ay.year = 2026
    and lp.lifecycle_status in ('account','reserved','admitted','active')
    and i.name not in ('JKKN Matric Higher Secondary School','Nattraja Vidhyalya CBSE',
                       'JKKN College of Arts and Science (Aided)')),
res as (
  select c.*, (select afs.id from admission_fee_structures afs
      where afs.institution_id = c.institution_id and afs.degree_id = c.degree_id
        and afs.department_id = c.department_id and afs.programme_id = c.program_id
        and afs.quota_id = c.quota_id and afs.admission_year_id = c.admission_year_id
        and afs.status = 'active'
        and exists (select 1 from admission_fee_structure_communities j
                     where j.fee_structure_id = afs.id
                       and j.community_category_id = c.community_category_id)
        and (afs.gender = upper(c.gender) or afs.gender is null)
        and (afs.accommodation_type_id = c.accommodation_type_id or afs.accommodation_type_id is null)
      order by (afs.accommodation_type_id is not null) desc,
               (afs.gender is not null) desc, afs.updated_at desc
      limit 1) as sid
  from college c)
select r.id as learner_id, r.institution_id, r.sid as fee_structure_id,
       ref.due_date, ref.academic_year_id, now() as snapshot_at
from res r
join lateral (select b.due_date, b.academic_year_id
                from billing_student_bills b
               where b.student_id = r.id and b.fee_source = 'academic'
                 and b.status not in ('cancelled','superseded')
               order by b.created_at limit 1) ref on true
where r.sid is not null
  and exists (select 1 from admission_fee_structure_items fsi
              join billing_categories bc on bc.id = fsi.billing_category_id
              where fsi.fee_structure_id = r.sid and bc.kind = 'hostel')
  and not exists (select 1 from billing_student_bills b
                  join billing_categories bc on bc.id = b.item_category_id
                  where b.student_id = r.id and bc.kind in ('hostel','mess')
                    and b.status not in ('cancelled','superseded'));

create table if not exists _bak_hm_backfill_bands_20260818 as
select lp.id as learner_id, lp.hostel_category_id, lp.mess_category_id,
       fn_learner_admission_year_academic_fee(lp.id) as band_fee, now() as snapshot_at
from learners_profiles lp
where lp.id in (select learner_id from _bak_hm_backfill_targets_20260818);

do $partA$
declare v_targets int; v_inserted int;
begin
  select count(*) into v_targets from _bak_hm_backfill_targets_20260818;
  if v_targets <> 53 then
    raise exception 'Expected 53 backfill targets, found % -- re-audit before retrying.', v_targets;
  end if;

  insert into billing_student_bills(
      student_id, institution_id, item_category_id, bill_description, due_date,
      quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
      status, fee_source, academic_year_id, remarks)
  select t.learner_id, t.institution_id, fsi.billing_category_id, bc.category_name,
         t.due_date, 1, fsi.amount, fsi.amount, 0, fsi.amount, fsi.amount,
         'unpaid', 'academic', t.academic_year_id,
         'AY2026 hostel/mess backfill: structure line was never billed'
    from _bak_hm_backfill_targets_20260818 t
    join admission_fee_structure_items fsi on fsi.fee_structure_id = t.fee_structure_id
    join billing_categories bc on bc.id = fsi.billing_category_id and bc.kind in ('hostel','mess');

  get diagnostics v_inserted = row_count;
  if v_inserted <> 106 then
    raise exception 'Inserted % bills, expected 106 (53 x 2) -- rolling back.', v_inserted;
  end if;
  raise notice 'Part A: created % hostel/mess bills for % learners', v_inserted, v_targets;
end
$partA$;

-- Part B ---------------------------------------------------------------------
create table if not exists _bak_edu_tuition_35k_20260818 as
select b.*, now() as snapshot_at
from billing_student_bills b
join billing_categories bc on bc.id = b.item_category_id
join learners_profiles lp on lp.id = b.student_id
join institutions i on i.id = lp.institution_id
join admission_years ay on ay.id = lp.admission_year_id
where ay.year = 2026 and i.name = 'JKKN College of Education' and bc.kind = 'tuition'
  and b.final_amount = 35000 and b.status not in ('cancelled','superseded')
  and lp.lifecycle_status in ('account','reserved','admitted','active');

do $partB$
declare v_n int; v_updated int; v_overpaid int;
begin
  select count(*) into v_n from _bak_edu_tuition_35k_20260818;
  if v_n <> 11 then
    raise exception 'Expected 11 Education tuition bills at 35,000, found %.', v_n;
  end if;

  -- Nobody may end up having paid more than the reduced amount.
  select count(*) into v_overpaid
  from _bak_edu_tuition_35k_20260818 s
  where (select coalesce(sum(ri.amount_paid),0) from billing_receipt_items ri where ri.bill_id = s.id) > 30000;
  if v_overpaid <> 0 then
    raise exception '% bill(s) have payments above 30,000 -- reducing would create a credit; aborting.', v_overpaid;
  end if;

  update billing_student_bills
     set final_amount = 30000, total_amount = 30000, unit_amount = 30000
   where id in (select id from _bak_edu_tuition_35k_20260818);
  get diagnostics v_updated = row_count;

  if v_updated <> 11 then
    raise exception 'Updated % bills, expected 11 -- rolling back.', v_updated;
  end if;
  raise notice 'Part B: reduced % Education tuition bills from 35,000 to 30,000', v_updated;
end
$partB$;
