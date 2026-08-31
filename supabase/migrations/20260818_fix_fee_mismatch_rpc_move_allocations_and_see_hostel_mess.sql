-- Patch admission_fix_fee_mismatch_2026 so the two defects it caused in the
-- 2026 data cannot recur.
--
-- 1. IT DUPLICATED PAYMENTS INSTEAD OF MOVING THEM. The 'change' branch inserted
--    a 'fee_structure_change_reallocation' row on the replacement bill but never
--    removed the 'original_payment' row from the bill it superseded, so the same
--    rupees were allocated twice. Measured before the purge: 37 of 38 affected
--    receipts over-allocated, Rs 4,32,300 of phantom allocation. Both branches
--    now MOVE allocations.
--
--    Ordering matters: update_bill_status_on_delete() unconditionally rewrites
--    the bill's status, so deleting receipt items AFTER setting 'superseded'
--    would flip the bill back to 'unpaid'. Allocations are captured, deleted,
--    and only then is the bill superseded.
--
-- 2. IT COULD NOT SEE HOSTEL OR MESS. Both sides of the comparison filtered
--    `bc.kind not in ('transport','hostel','mess')`, which is why the AY2026
--    audit reported 973/974 conformance while 60 learners carried a combined
--    Hostel 65,000 bill against structures that had split it into Hostel 25,000
--    + Mess 40,000. Now only 'transport' is excluded (transport bills come from
--    the TMS module, not the admission fee structure).
--
--    Consequence: the RPC now writes hostel/mess bills, which fire
--    trg_bill_apply_hostel_fee_categories -- a STATEMENT-level trigger that
--    rewrites learners_profiles.hostel_category_id / mess_category_id from
--    fn_learner_band_academic_fee (SUM of non-void academic bills, no category
--    filter). Mid-loop that sum is transiently wrong, and the trigger swallows
--    its own exceptions, so corruption would be silent. Guard: snapshot the two
--    categories per learner, and afterwards restore them when the learner's
--    academic total is unchanged (the band provably cannot have moved), or
--    recompute cleanly from the final state when it did change.
--
-- 3. It treated 'cancelled' as live. The billed side excluded only 'superseded',
--    but VOID_BILL_STATUSES in lib/billing/bill-status.ts is
--    ('cancelled','superseded') -- a cancelled bill was being read as a real
--    liability. Now both are excluded.
--
-- CREATE OR REPLACE, never DROP + CREATE: dropping discards the function's
-- EXECUTE grants and they revert to PUBLIC.

create or replace function public.admission_fix_fee_mismatch_2026(
  p_learner_ids uuid[], p_dry_run boolean default true, p_refund_excess boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    v_caller   uuid := auth.uid();
    v_lid      uuid;
    v_l        record;
    v_yos      int;
    v_struct   uuid;
    v_line     record;
    v_ri       record;
    v_new_bill uuid;
    v_remaining numeric;
    v_alloc     numeric;
    v_target    numeric;
    v_excess    numeric;
    v_allocs    jsonb;
    v_sum_before numeric;
    v_sum_after  numeric;
    v_hc0       uuid;
    v_mc0       uuid;
    v_c_learner int := 0;
    v_c_change  int := 0;
    v_c_add     int := 0;
    v_c_remove  int := 0;
    v_c_realloc int := 0;
    v_c_credit  int := 0;
    v_c_fee     int := 0;
    v_plan      jsonb := '[]'::jsonb;
begin
    foreach v_lid in array p_learner_ids loop
        select id, institution_id, gender, degree_id, department_id, program_id,
               quota_id, community_category_id, accommodation_type_id, admission_year_id,
               academic_year_id, legacy_fee_mode, lifecycle_status
          into v_l from learners_profiles where id = v_lid for update;
        if not found then continue; end if;

        v_yos := coalesce(fn_learner_year_of_study(v_lid), 1);

        select afs.id into v_struct
          from admission_fee_structures afs
         where afs.institution_id=v_l.institution_id and afs.degree_id=v_l.degree_id
           and afs.department_id=v_l.department_id and afs.programme_id=v_l.program_id
           and afs.quota_id=v_l.quota_id and afs.admission_year_id=v_l.admission_year_id and afs.status='active'
           and exists (select 1 from admission_fee_structure_communities j
                        where j.fee_structure_id=afs.id and j.community_category_id=v_l.community_category_id)
           and (afs.gender=upper(v_l.gender) or afs.gender is null)
           and (afs.accommodation_type_id=v_l.accommodation_type_id or afs.accommodation_type_id is null)
         order by (afs.accommodation_type_id is not null) desc, (afs.gender is not null) desc, afs.updated_at desc
         limit 1;

        if v_struct is null then
            v_plan := v_plan || jsonb_build_object('learner', v_lid, 'skipped', 'no_structure');
            continue;
        end if;
        v_c_learner := v_c_learner + 1;

        -- Hostel/mess band guard (see header note 2).
        select coalesce(sum(final_amount), 0) into v_sum_before
          from billing_student_bills
         where student_id = v_lid and fee_source = 'academic'
           and status not in ('cancelled','superseded');
        select hostel_category_id, mess_category_id into v_hc0, v_mc0
          from learners_profiles where id = v_lid;

        for v_line in
            with exp as (
                select fsi.billing_category_id cat, fsi.amount new_amt, fsi.applies_year_of_study ays
                  from admission_fee_structure_items fsi
                  join billing_categories bc on bc.id=fsi.billing_category_id
                 where fsi.fee_structure_id=v_struct and bc.kind <> 'transport'
                   and (fsi.applies_to='every_year'
                        or (fsi.applies_to='first_year_only' and v_yos=1)
                        or (fsi.applies_to='specific_year' and fsi.applies_year_of_study=v_yos))
            ),
            bil as (
                select distinct on (b.item_category_id)
                       b.id bill_id, b.item_category_id cat, b.final_amount old_amt, b.status,
                       b.due_date, b.academic_year_id, b.applies_year_of_study,
                       b.final_amount - coalesce(b.balance_amount,0) paid
                  from billing_student_bills b
                  join billing_categories bc on bc.id=b.item_category_id
                 where b.student_id=v_lid and b.fee_source='academic'
                   and b.status not in ('cancelled','superseded')
                   and bc.kind <> 'transport'
                 order by b.item_category_id, b.created_at desc
            )
            select coalesce(e.cat, bi.cat) cat, e.new_amt, e.ays,
                   bi.bill_id, bi.old_amt, bi.status, bi.paid, bi.due_date, bi.academic_year_id, bi.applies_year_of_study,
                   case when bi.cat is null then 'add'
                        when e.cat  is null then 'remove'
                        when coalesce(bi.old_amt,0) <> coalesce(e.new_amt,0) then 'change'
                        else 'ok' end as action,
                   (select category_name from billing_categories where id = coalesce(e.cat,bi.cat)) as cat_name
              from exp e full outer join bil bi on bi.cat = e.cat
        loop
            if v_line.action = 'ok' then continue; end if;

            if v_line.action = 'change' then
                v_c_change := v_c_change + 1;
                v_target := least(coalesce(v_line.paid,0), v_line.new_amt);
                v_excess := greatest(0, coalesce(v_line.paid,0) - v_line.new_amt);
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','change','category',v_line.cat_name,
                              'old',v_line.old_amt,'new',v_line.new_amt,'paid',v_line.paid,'carry',v_target,'excess',v_excess);
                if not p_dry_run then
                    -- Capture then remove the old allocations BEFORE superseding:
                    -- update_bill_status_on_delete would otherwise un-supersede.
                    select coalesce(jsonb_agg(jsonb_build_object('receipt_id', receipt_id, 'amount', amount_paid)
                                              order by amount_paid desc), '[]'::jsonb)
                      into v_allocs
                      from billing_receipt_items where bill_id = v_line.bill_id;
                    delete from billing_receipt_items where bill_id = v_line.bill_id;

                    update billing_student_bills set status='superseded', updated_at=now() where id = v_line.bill_id;

                    insert into billing_student_bills(
                        student_id, institution_id, item_category_id, bill_description, due_date,
                        quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
                        status, fee_source, academic_year_id, applies_year_of_study, remarks, created_by)
                    values (v_lid, v_l.institution_id, v_line.cat, coalesce(v_line.cat_name,'Fee'),
                        coalesce(v_line.due_date, (now()+interval '30 days')::date),
                        1, v_line.new_amt, v_line.new_amt, 0, v_line.new_amt, v_line.new_amt,
                        'unpaid','academic', v_line.academic_year_id, v_line.applies_year_of_study,
                        'Fee-sync 2026: replaces bill '||v_line.bill_id::text||' (was '||v_line.old_amt::text||')', v_caller)
                    returning id into v_new_bill;

                    update billing_student_bills set superseded_by_bill_id=v_new_bill where id=v_line.bill_id;

                    v_remaining := v_line.new_amt;
                    for v_ri in
                        select (e->>'receipt_id')::uuid receipt_id, (e->>'amount')::numeric amount_paid
                          from jsonb_array_elements(v_allocs) e
                    loop
                        v_alloc := least(v_ri.amount_paid, greatest(v_remaining, 0));
                        if v_alloc > 0 then
                            insert into billing_receipt_items(receipt_id, bill_id, amount_paid, allocation_reason)
                            values (v_ri.receipt_id, v_new_bill, v_alloc, 'fee_structure_change_reallocation');
                            v_remaining := v_remaining - v_alloc;
                            v_c_realloc := v_c_realloc + 1;
                        end if;
                    end loop;

                    if v_excess > 0 then
                        insert into student_credit_balances(student_id, amount, source, is_consumed, notes, created_by)
                        values (v_lid, v_excess, 'fee_structure_change', false,
                            case when p_refund_excess
                                 then 'EXCESS refund pending - fee-sync 2026 ('||coalesce(v_line.cat_name,'')||')'
                                 else 'Credit from fee-sync 2026 reallocation ('||coalesce(v_line.cat_name,'')||')' end,
                            v_caller);
                        v_c_credit := v_c_credit + 1;
                    end if;
                end if;

            elsif v_line.action = 'add' then
                v_c_add := v_c_add + 1;
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','add','category',v_line.cat_name,'new',v_line.new_amt);
                if not p_dry_run then
                    insert into billing_student_bills(
                        student_id, institution_id, item_category_id, bill_description, due_date,
                        quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
                        status, fee_source, academic_year_id, applies_year_of_study, remarks, created_by)
                    values (v_lid, v_l.institution_id, v_line.cat, coalesce(v_line.cat_name,'Fee'),
                        (now()+interval '30 days')::date,
                        1, v_line.new_amt, v_line.new_amt, 0, v_line.new_amt, v_line.new_amt,
                        'unpaid','academic', v_l.academic_year_id, v_line.ays,
                        'Fee-sync 2026: added missing structure line', v_caller);
                end if;

            elsif v_line.action = 'remove' then
                v_c_remove := v_c_remove + 1;
                v_plan := v_plan || jsonb_build_object('learner',v_lid,'action','remove','category',v_line.cat_name,
                              'old',v_line.old_amt,'paid',v_line.paid);
                if not p_dry_run then
                    if coalesce(v_line.paid,0) > 0 then
                        insert into student_credit_balances(student_id, amount, source, is_consumed, notes, created_by)
                        values (v_lid, v_line.paid, 'fee_structure_change', false,
                            'Credit from fee-sync 2026 removed fee ('||coalesce(v_line.cat_name,'')||')', v_caller);
                        v_c_credit := v_c_credit + 1;
                    end if;
                    -- Same ordering rule as 'change': strip allocations first, so
                    -- the payment is not left double-counted on a void bill.
                    delete from billing_receipt_items where bill_id = v_line.bill_id;

                    update billing_student_bills
                       set status='superseded', updated_at=now(),
                           remarks = coalesce(remarks,'')||' | Fee-sync 2026: removed (not in structure)'
                     where id = v_line.bill_id;
                end if;
            end if;
        end loop;

        if not p_dry_run then
            select coalesce(sum(final_amount), 0) into v_sum_after
              from billing_student_bills
             where student_id = v_lid and fee_source = 'academic'
               and status not in ('cancelled','superseded');

            if v_sum_after = v_sum_before then
                -- Total unchanged, so the band cannot legitimately have moved;
                -- undo anything the statement-level trigger rewrote mid-loop.
                update learners_profiles
                   set hostel_category_id = v_hc0, mess_category_id = v_mc0, updated_at = now()
                 where id = v_lid
                   and (hostel_category_id is distinct from v_hc0
                        or mess_category_id is distinct from v_mc0);
            else
                perform fn_apply_hostel_fee_categories(v_lid);
            end if;

            perform admission_resolve_fee_items_for_lead(v_lid);
        end if;
        v_c_fee := v_c_fee + 1;
    end loop;

    return jsonb_build_object(
        'dry_run', p_dry_run,
        'learners_processed', v_c_learner,
        'amount_changes', v_c_change,
        'added', v_c_add,
        'removed', v_c_remove,
        'reallocations', v_c_realloc,
        'credits', v_c_credit,
        'feeitems_resynced', v_c_fee,
        'plan', case when p_dry_run then v_plan else '[]'::jsonb end
    );
end
$function$;
