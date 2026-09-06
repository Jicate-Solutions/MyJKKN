-- ============================================================================
-- admission_preview_account_bills: let bill-creating staff read it too.
--
-- WHY (2026-09-06). The New Bill form is gaining a "Load from fee structure"
-- action that fills the whole form from the learner's structure — every fee
-- item with its amount, its instalment split, its shares and its due dates.
-- This RPC already computes exactly that and is the same resolver the
-- onboarding preview uses, so reusing it keeps ONE answer to "what does this
-- learner's structure say" instead of a second implementation on the billing
-- side that could disagree.
--
-- Its gate was admission_documents.manage only, which an accounts operator
-- does not hold — they would get 42501 and the button would appear to do
-- nothing.
--
-- WHY THIS GRANTS NOTHING NEW. The gate now also accepts the keys that already
-- let a caller price a bill: billing.schedule.create / billing.bills.create are
-- precisely the keys on billing_get_instalment_split, which returns the SAME
-- numbers one category at a time. Someone who can create bills for a learner
-- can already read every value this returns; the only difference is how many
-- round trips it takes them. The function stays STABLE and read-only.
--
-- Nothing else about the function changes: same signature, same body, same
-- CREATE OR REPLACE (never DROP — that would take the ACL with it and a
-- re-CREATE silently re-grants EXECUTE to PUBLIC).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_preview_account_bills(p_learner_id uuid)
RETURNS TABLE(
  sort_order integer, category_id uuid, category_name text, item_amount numeric,
  is_billable boolean, owner_module text, instalment_no integer,
  instalment_count integer, instalment_amount numeric, share_percent numeric,
  due_date date, promotes_to_status_code text, matched_source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_items   jsonb;
  v_item    jsonb;
  v_idx     integer := 0;
  v_cat     uuid;
  v_amt     numeric;
  v_item_id uuid;
  v_kind    text;
  v_split   record;
  v_rows    integer;
  v_anchor  date := CURRENT_DATE;
  v_default integer;
BEGIN
  -- Widened 2026-09-06: the billing keys read the same numbers
  -- billing_get_instalment_split already exposes to them per category.
  IF NOT (
    public.user_has_permission('admission_documents.manage')
    OR public.user_has_permission('billing.schedule.create')
    OR public.user_has_permission('billing.bills.create')
    OR public.is_super_admin()
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'permission_denied: admission_documents.manage or billing.schedule.create required'
      USING ERRCODE = '42501';
  END IF;

  v_items := public.admission_compute_fee_items_for_learner(p_learner_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb))
  LOOP
    v_idx     := v_idx + 1;
    v_cat     := NULLIF(v_item->>'category_id','')::uuid;
    v_amt     := COALESCE((v_item->>'amount')::numeric, 0);
    v_item_id := NULLIF(v_item->>'fee_structure_item_id','')::uuid;

    IF v_amt <= 0 THEN
      CONTINUE;   -- the generation loop skips these too
    END IF;

    SELECT bc.kind::text INTO v_kind FROM public.billing_categories bc WHERE bc.id = v_cat;

    IF v_kind IN ('hostel','mess','transport') THEN
      sort_order              := v_idx;
      category_id             := v_cat;
      category_name           := v_item->>'category_name';
      item_amount             := v_amt;
      is_billable             := false;
      owner_module            := CASE WHEN v_kind = 'transport' THEN 'tms' ELSE 'campus_living' END;
      instalment_no           := NULL;
      instalment_count        := NULL;
      instalment_amount       := NULL;
      share_percent           := NULL;
      due_date                := NULL;
      promotes_to_status_code := NULL;
      matched_source          := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_rows := 0;
    FOR v_split IN
      SELECT s.* FROM public.billing_instalment_split_for_learner(
        p_learner_id, v_cat, v_amt, v_anchor, v_item_id) s
      ORDER BY s.instalment_no
    LOOP
      sort_order              := v_idx;
      category_id             := v_cat;
      category_name           := v_item->>'category_name';
      item_amount             := v_amt;
      is_billable             := true;
      owner_module            := 'admission';
      instalment_no           := v_split.instalment_no;
      instalment_count        := v_split.instalment_count;
      instalment_amount       := v_split.instalment_amount;
      -- EFFECTIVE share, derived from the amount the engine actually produced,
      -- not the configured percentage: the last instalment absorbs rounding, so
      -- its true share differs slightly from what was typed.
      share_percent           := CASE WHEN v_amt > 0
                                      THEN round(v_split.instalment_amount * 100.0 / v_amt, 2)
                                      ELSE NULL END;
      due_date                := v_split.instalment_due_date;
      promotes_to_status_code := v_split.promotes_to_status_code;
      matched_source          := v_split.matched_source;
      RETURN NEXT;
      v_rows := v_rows + 1;
    END LOOP;

    -- Engine resolved nothing (a legacy snapshot with no structure item behind
    -- it): one bill on the structure default, or the platform 30.
    IF v_rows = 0 THEN
      SELECT fs.default_due_offset_days INTO v_default
        FROM public.admission_fee_structures fs
       WHERE fs.id = public.admission_match_fee_structure_for_learner(p_learner_id);

      sort_order              := v_idx;
      category_id             := v_cat;
      category_name           := v_item->>'category_name';
      item_amount             := v_amt;
      is_billable             := true;
      owner_module            := 'admission';
      instalment_no           := 1;
      instalment_count        := 1;
      instalment_amount       := v_amt;
      share_percent           := 100;
      due_date                := v_anchor + COALESCE(v_default, 30);
      promotes_to_status_code := NULL;
      matched_source          := 'default';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;
