-- Item change requests carry stock edits too.
--
-- The item form shows a Store Admin the Stock section (Opening Stock, Stock
-- Balance), but a request only carried ims_items columns. Changing just the
-- stock produced an empty diff, the client said "Nothing changed" and no
-- request was ever raised -- the super admin's queue stayed empty.
--
-- Stock lives on ims_stock_summary (per store), not ims_items, so it gets its
-- own pair of columns rather than being squeezed into proposed_changes, whose
-- keys the approval maps 1:1 onto ims_items:
--
--   stock_changes  {"opening_quantity": n, "current_quantity": n}   -- new values
--   stock_before   the same keys, as the store held them when asked
--
-- Approving applies them the way the form does for someone who may edit:
-- opening_quantity is written directly; a Stock Balance change is booked as a
-- correction (up) or damage (down) adjustment in ims_financial_transactions
-- and moved on the summary. Same stale-check rule as the item fields: if the
-- store's numbers moved since the request, it is refused, not applied.

alter table public.ims_item_change_requests
  add column if not exists stock_changes jsonb not null default '{}'::jsonb,
  add column if not exists stock_before  jsonb not null default '{}'::jsonb;

alter table public.ims_item_change_requests
  drop constraint if exists ims_item_change_requests_not_empty;

alter table public.ims_item_change_requests
  add constraint ims_item_change_requests_not_empty check (
    jsonb_typeof(proposed_changes) = 'object'
    and jsonb_typeof(stock_changes) = 'object'
    and (proposed_changes <> '{}'::jsonb or stock_changes <> '{}'::jsonb)
  );

-- Only the two stock keys, never negative, and stock is per store so a store
-- must be named.
alter table public.ims_item_change_requests
  drop constraint if exists ims_item_change_requests_stock_shape;

alter table public.ims_item_change_requests
  add constraint ims_item_change_requests_stock_shape check (
    stock_changes - 'opening_quantity' - 'current_quantity' = '{}'::jsonb
    and coalesce((stock_changes ->> 'opening_quantity')::numeric, 0) >= 0
    and coalesce((stock_changes ->> 'current_quantity')::numeric, 0) >= 0
    and (stock_changes = '{}'::jsonb or store_id is not null)
  );

comment on column public.ims_item_change_requests.stock_changes is
  'Proposed per-store stock values {opening_quantity, current_quantity}; applied to ims_stock_summary on approval.';
comment on column public.ims_item_change_requests.stock_before is
  'Stock values for the same keys when the request was raised; approval refuses if the store has moved since.';

create or replace function public.ims_review_item_change_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_req    public.ims_item_change_requests;
    v_item   public.ims_items;
    v_stock  public.ims_stock_summary;
    v_merged jsonb;
    v_key    text;
    v_stale  text[] := array[]::text[];
    v_delta  numeric;
    v_value  numeric;
    v_type   text;
begin
    if public.get_current_user_role() <> 'super_admin' then
        raise exception 'Only a super admin can review item change requests'
            using errcode = 'insufficient_privilege';
    end if;

    select * into v_req
      from public.ims_item_change_requests
     where id = p_request_id
     for update;

    if v_req.id is null then
        raise exception 'Change request not found' using errcode = 'no_data_found';
    end if;
    if v_req.status <> 'pending' then
        raise exception 'This request was already %', v_req.status
            using errcode = 'invalid_parameter_value';
    end if;

    if not p_approve then
        update public.ims_item_change_requests
           set status = 'rejected', reviewed_by = auth.uid(),
               reviewed_at = now(), review_note = p_note, updated_at = now()
         where id = p_request_id;

        return jsonb_build_object('status', 'rejected', 'item_id', v_req.item_id);
    end if;

    select * into v_item from public.ims_items where id = v_req.item_id for update;
    if v_item.id is null then
        raise exception 'The item no longer exists' using errcode = 'no_data_found';
    end if;

    -- Stale check, item fields.
    for v_key in select jsonb_object_keys(v_req.proposed_changes) loop
        if (to_jsonb(v_item) -> v_key) is distinct from (v_req.current_values -> v_key) then
            v_stale := v_stale || v_key;
        end if;
    end loop;

    -- Stale check, stock. A missing summary row reads as zeros, which is what
    -- the form showed the requester in that case.
    if v_req.stock_changes <> '{}'::jsonb then
        select * into v_stock
          from public.ims_stock_summary
         where item_id = v_req.item_id and store_id = v_req.store_id
         for update;

        if v_req.stock_changes ? 'opening_quantity'
           and coalesce(v_stock.opening_quantity, 0)
               <> coalesce((v_req.stock_before ->> 'opening_quantity')::numeric, 0) then
            v_stale := v_stale || 'opening stock'::text;
        end if;
        if v_req.stock_changes ? 'current_quantity'
           and coalesce(v_stock.current_quantity, 0)
               <> coalesce((v_req.stock_before ->> 'current_quantity')::numeric, 0) then
            v_stale := v_stale || 'stock balance'::text;
        end if;
    end if;

    if array_length(v_stale, 1) > 0 then
        raise exception
            'The item changed since this request was raised (%). Ask for a fresh request.',
            array_to_string(v_stale, ', ')
            using errcode = 'serialization_failure';
    end if;

    -- Item fields.
    if v_req.proposed_changes <> '{}'::jsonb then
        v_merged := to_jsonb(v_item) || v_req.proposed_changes;

        update public.ims_items as i
           set name                    = m.name,
               description             = m.description,
               company_name            = m.company_name,
               brand                   = m.brand,
               category_id             = m.category_id,
               item_type               = m.item_type,
               base_unit_id            = m.base_unit_id,
               purchase_unit_id        = m.purchase_unit_id,
               sale_unit_id            = m.sale_unit_id,
               indent_unit_id          = m.indent_unit_id,
               cost_price              = m.cost_price,
               mrp                     = m.mrp,
               selling_price           = m.selling_price,
               gst_rate                = m.gst_rate,
               hsn_code                = m.hsn_code,
               reorder_level           = m.reorder_level,
               max_stock_level         = m.max_stock_level,
               is_active               = m.is_active,
               track_batch             = m.track_batch,
               track_expiry            = m.track_expiry,
               is_sellable_to_students = m.is_sellable_to_students,
               is_distributable        = m.is_distributable,
               is_bundle               = m.is_bundle,
               is_chemical             = m.is_chemical,
               variant_attributes      = m.variant_attributes,
               image_url               = m.image_url,
               updated_at              = now()
          from jsonb_populate_record(null::public.ims_items, v_merged) as m
         where i.id = v_req.item_id
        returning i.* into v_item;
    end if;

    -- Opening stock: a direct write, as the form does.
    if v_req.stock_changes ? 'opening_quantity' then
        if v_stock.id is null then
            insert into public.ims_stock_summary
                (item_id, store_id, institution_id, opening_quantity,
                 current_quantity, available_quantity, reserved_quantity, total_value)
            values
                (v_req.item_id, v_req.store_id, v_req.institution_id,
                 (v_req.stock_changes ->> 'opening_quantity')::numeric, 0, 0, 0, 0)
            returning * into v_stock;
        else
            update public.ims_stock_summary
               set opening_quantity = (v_req.stock_changes ->> 'opening_quantity')::numeric,
                   updated_at = now()
             where id = v_stock.id
            returning * into v_stock;
        end if;
    end if;

    -- Stock balance: booked as an adjustment for the difference, valued at the
    -- item's (possibly just-approved) cost price -- mirrors
    -- ImsStockAdjustmentService.createAdjustment.
    if v_req.stock_changes ? 'current_quantity' then
        v_delta := (v_req.stock_changes ->> 'current_quantity')::numeric
                   - coalesce((v_req.stock_before ->> 'current_quantity')::numeric, 0);

        if v_delta <> 0 then
            v_type  := case when v_delta > 0 then 'correction' else 'damage' end;
            v_value := abs(v_delta) * coalesce(v_item.cost_price, 0);

            insert into public.ims_financial_transactions
                (transaction_type, reference_id, reference_type, amount, description,
                 item_id, quantity, created_by, institution_id, store_id)
            values
                ('adjustment', v_req.id, 'adjustment', v_value,
                 v_type || ' - ' || v_item.name || ' (' || coalesce(v_item.code, '') || '): '
                   || 'Approved item change request',
                 v_req.item_id, abs(v_delta), auth.uid(), v_req.institution_id, v_req.store_id);

            if v_stock.id is null then
                if v_delta > 0 then
                    insert into public.ims_stock_summary
                        (item_id, store_id, institution_id, opening_quantity,
                         current_quantity, available_quantity, reserved_quantity, total_value)
                    values
                        (v_req.item_id, v_req.store_id, v_req.institution_id, 0,
                         v_delta, v_delta, 0, v_value);
                end if;
            else
                update public.ims_stock_summary
                   set current_quantity   = greatest(0, coalesce(current_quantity, 0) + v_delta),
                       available_quantity = greatest(0, coalesce(available_quantity, 0) + v_delta),
                       total_value        = greatest(0, coalesce(total_value, 0)
                                              + case when v_delta > 0 then v_value else -v_value end),
                       updated_at         = now()
                 where id = v_stock.id;
            end if;
        end if;
    end if;

    update public.ims_item_change_requests
       set status = 'approved', reviewed_by = auth.uid(),
           reviewed_at = now(), review_note = p_note,
           applied_at = now(), updated_at = now()
     where id = p_request_id;

    return jsonb_build_object(
        'status',  'approved',
        'item_id', v_req.item_id,
        'applied', v_req.proposed_changes,
        'stock',   v_req.stock_changes
    );
end;
$function$;
