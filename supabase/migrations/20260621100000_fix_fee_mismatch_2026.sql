-- Fee-structure sync fix for the 2026 admission funnel "mismatch" learners (core academic fees).
-- Read-safe building blocks + a dry-runnable backfill. NO data is changed by this migration itself;
-- the fix is applied by CALLING admission_fix_fee_mismatch_2026(ids, p_dry_run=false) afterwards.
--
-- Strategy (mirrors the proven admission_approve_fee_change_event reallocate_payment logic):
--   * amount_change : supersede old bill -> create replacement at correct amount ->
--                     carry the paid receipt allocation onto the new bill (SAME category),
--                     capped at the new amount; any excess -> student_credit_balances.
--   * add (missing) : create a new unpaid bill for the structure line.
--   * remove (extra): supersede the (unpaid) bill; if it had any payment -> credit balance.
--   * always re-stamp learners_profiles.fee_items via admission_resolve_fee_items_for_lead.
-- Transport / Hostel / Mess fees are excluded everywhere (owned by other modules).

-- ---------------------------------------------------------------------------
-- 1) Helper: the current mismatch learner set (validated classification, exclusion-aware)
-- ---------------------------------------------------------------------------
create or replace function public._feesync_mismatch_ids_2026()
returns uuid[]
language sql
stable
security definer
set search_path to public
as $h$
  with ex as (select id from billing_categories where kind in ('transport','hostel','mess')),
  funnel as (
    select lp.id, lp.lifecycle_status, lp.legacy_fee_mode, lp.gender,
           lp.institution_id, lp.degree_id, lp.department_id, lp.program_id,
           lp.quota_id, lp.community_category_id, lp.accommodation_type_id, lp.admission_year_id,
           case when jsonb_typeof(lp.fee_items)='array' then lp.fee_items else '[]'::jsonb end as stored,
           coalesce(fn_learner_year_of_study(lp.id),1) as yos
    from learners_profiles lp
    join admission_years ay on ay.id=lp.admission_year_id and ay.year=2026
    where lp.lifecycle_status in ('enquiry','enquiry_submitted','account','reserved','admitted')
  ),
  matched as (
    select f.*, (select afs.id from admission_fee_structures afs
        where afs.institution_id=f.institution_id and afs.degree_id=f.degree_id and afs.department_id=f.department_id
          and afs.programme_id=f.program_id and afs.quota_id=f.quota_id and afs.admission_year_id=f.admission_year_id
          and afs.status='active'
          and exists (select 1 from admission_fee_structure_communities j where j.fee_structure_id=afs.id and j.community_category_id=f.community_category_id)
          and (afs.gender=upper(f.gender) or afs.gender is null)
          and (afs.accommodation_type_id=f.accommodation_type_id or afs.accommodation_type_id is null)
        order by (afs.accommodation_type_id is not null) desc, (afs.gender is not null) desc, afs.updated_at desc
        limit 1) as struct_id
    from funnel f
  ),
  expc as (
    select m.*,
      coalesce((select string_agg(fsi.billing_category_id::text||'='||trim_scale(fsi.amount)::text, ',' order by fsi.billing_category_id::text)
          from admission_fee_structure_items fsi where fsi.fee_structure_id=m.struct_id and fsi.billing_category_id not in (select id from ex)
           and (fsi.applies_to='every_year' or (fsi.applies_to='first_year_only' and m.yos=1) or (fsi.applies_to='specific_year' and fsi.applies_year_of_study=m.yos))),'') as e_id,
      coalesce((select string_agg((e->>'category_id')||'='||trim_scale((e->>'amount')::numeric)::text, ',' order by (e->>'category_id'))
          from jsonb_array_elements(m.stored) e where e->>'category_id' is not null and (e->>'category_id')::uuid not in (select id from ex)),'') as s_id
    from matched m
  )
  select coalesce(array_agg(id),'{}'::uuid[])
  from expc
  where not (legacy_fee_mode and s_id<>'') and s_id<>''
    and not (program_id is null or quota_id is null or community_category_id is null or accommodation_type_id is null
             or degree_id is null or department_id is null or institution_id is null)
    and struct_id is not null and s_id<>e_id;
$h$;

-- ---------------------------------------------------------------------------
-- 2) Backups (rollback anchor) — captured BEFORE any change
-- ---------------------------------------------------------------------------
create table if not exists public._bak_feesync_bills_20260621 as
  select b.*, now() as _bak_at from billing_student_bills b
   where b.student_id = any(public._feesync_mismatch_ids_2026());

create table if not exists public._bak_feesync_receipt_items_20260621 as
  select ri.*, now() as _bak_at from billing_receipt_items ri
   where ri.bill_id in (select id from billing_student_bills where student_id = any(public._feesync_mismatch_ids_2026()));

create table if not exists public._bak_feesync_learner_20260621 as
  select id as learner_id, fee_items, legacy_fee_mode, lifecycle_status,
         hostel_category_id, mess_category_id, now() as _bak_at
    from learners_profiles where id = any(public._feesync_mismatch_ids_2026());

-- ---------------------------------------------------------------------------
-- 3) The backfill (dry-runnable). Returns a summary + (in dry-run) the line plan.
-- ---------------------------------------------------------------------------
create or replace function public.admission_fix_fee_mismatch_2026(
    p_learner_ids uuid[],
    p_dry_run boolean default true,
    p_refund_excess boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to public
as $fn$
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

        for v_line in
            with exp as (
                select fsi.billing_category_id cat, fsi.amount new_amt, fsi.applies_year_of_study ays
                  from admission_fee_structure_items fsi
                  join billing_categories bc on bc.id=fsi.billing_category_id
                 where fsi.fee_structure_id=v_struct and bc.kind not in ('transport','hostel','mess')
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
                 where b.student_id=v_lid and b.fee_source='academic' and b.status<>'superseded'
                   and bc.kind not in ('transport','hostel','mess')
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

                    if v_target > 0 then
                        v_remaining := v_line.new_amt;
                        for v_ri in
                            select id, receipt_id, amount_paid from billing_receipt_items
                             where bill_id=v_line.bill_id and allocation_reason='original_payment'
                             order by amount_paid desc
                        loop
                            exit when v_remaining <= 0;
                            v_alloc := least(v_ri.amount_paid, v_remaining);
                            if v_alloc > 0 then
                                insert into billing_receipt_items(receipt_id, bill_id, amount_paid, allocation_reason)
                                values (v_ri.receipt_id, v_new_bill, v_alloc, 'fee_structure_change_reallocation');
                                v_remaining := v_remaining - v_alloc;
                                v_c_realloc := v_c_realloc + 1;
                            end if;
                        end loop;
                    end if;

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
                    update billing_student_bills
                       set status='superseded', updated_at=now(),
                           remarks = coalesce(remarks,'')||' | Fee-sync 2026: removed (not in structure)'
                     where id = v_line.bill_id;
                    if coalesce(v_line.paid,0) > 0 then
                        insert into student_credit_balances(student_id, amount, source, is_consumed, notes, created_by)
                        values (v_lid, v_line.paid, 'fee_structure_change', false,
                            'Credit from fee-sync 2026 removed fee ('||coalesce(v_line.cat_name,'')||')', v_caller);
                        v_c_credit := v_c_credit + 1;
                    end if;
                end if;
            end if;
        end loop;

        if not p_dry_run then
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
$fn$;
