-- =============================================================================
-- 20260821220000_account_transition_preview_and_bill_guard.sql
--
-- Two things the Move-to-Account flow was missing:
--
--   1. A read-only preview of the EXACT bills the transition will raise, so the
--      admission team can review amounts, instalment shares and real due dates
--      before committing — not a re-derivation, the same engine.
--   2. A guarantee that the lifecycle NEVER reaches 'account' unless bills
--      actually exist. Today the RPC flips the status, then generates, then
--      returns without ever checking the result. Measured on production:
--      15 learners sit in 'admitted' with zero live bills.
--
-- WHY A NEW COMPUTE FUNCTION (§1)
-- -------------------------------
-- admission_resolve_fee_items_for_lead WRITES learners_profiles.fee_items. A
-- preview must not: opening a dialog and cancelling would otherwise leave a
-- snapshot behind, and a VOLATILE function cannot be used in the STABLE preview
-- anyway. So the pure computation is extracted, and the resolve function
-- becomes "compute, then persist". Same arithmetic, one copy — the same split
-- that admission_match_fee_structure_for_learner got in 20260821190000.
--
-- THE GUARD (§4), AND ITS ONE EXEMPTION
-- -------------------------------------
-- After generation the RPC now counts the learner's live bills. Zero raises,
-- which rolls back the status change with it — the status and the bills are
-- already in one transaction, so this needs no new plumbing, only a check that
-- was never there.
--
-- EXEMPT: a structure whose every fee item is hostel / mess / transport. Those
-- categories are deliberately skipped here because Campus Living and TMS own
-- them, and such a learner legitimately leaves this RPC with no ADMISSION
-- bills. Measured today: zero structures are all-foreign, so this exemption
-- changes nothing now — it exists so a future hostel-only structure is not
-- bricked by a guard written before it existed.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admission_match_fee_structure_for_learner') THEN
    RAISE EXCEPTION 'REFUSING: 20260821190000 has not been applied.';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 Pure fee-item computation — no writes, safe for preview
-- =============================================================================
-- Body lifted from admission_resolve_fee_items_for_lead minus its two UPDATE
-- statements. Keeps the legacy_fee_mode short-circuit, the year-of-study
-- applicability filter, the per-category adjustments and the global adjustment
-- row, in that order.
--
-- ONE deliberate difference: the base jsonb_agg now carries ORDER BY
-- fsi.sort_order. Without it the element order came from whatever the planner
-- returned, so the preview could list fees in a different order than the bills
-- were generated in — the kind of mismatch that makes an admin distrust a
-- preview they should be able to read straight down. Nothing keys on the
-- order; only presentation changes.

CREATE OR REPLACE FUNCTION public.admission_compute_fee_items_for_learner(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_legacy            boolean;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(public.fn_learner_year_of_study(p_learner_id), 1);
BEGIN
    SELECT legacy_fee_mode INTO v_legacy
      FROM public.learners_profiles WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Legacy learners keep whatever snapshot they already carry; the matrix is
    -- not consulted for them.
    IF v_legacy = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id),
                        '[]'::jsonb);
    END IF;

    v_structure_id := public.admission_match_fee_structure_for_learner(p_learner_id);
    IF v_structure_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',           fsi.billing_category_id,
                'category_name',         bc.category_name,
                'amount',                fsi.amount,
                'source',                'structure',
                'fee_structure_id',      fsi.fee_structure_id,
                'fee_structure_item_id', fsi.id)
              ORDER BY fsi.sort_order)
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id
       AND (
             fsi.applies_to = 'every_year'
          OR (fsi.applies_to = 'first_year_only' AND v_year = 1)
          OR (fsi.applies_to = 'specific_year'  AND fsi.applies_year_of_study = v_year)
       );

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',           item->>'category_id',
               'category_name',         item->>'category_name',
               'amount',                GREATEST(0, (item->>'amount')::numeric
                                          + COALESCE(pc.delta_sum, 0)),
               'source',                item->>'source',
               'fee_structure_id',      item->>'fee_structure_id',
               'fee_structure_item_id', item->>'fee_structure_item_id'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',           NULL,
                'category_name',         'Global Adjustment',
                'amount',                v_global_deltas_sum,
                'source',                'adjustment_global',
                'fee_structure_id',      NULL,
                'fee_structure_item_id', NULL));
    END IF;

    RETURN v_resolved;
END;
$function$;

COMMENT ON FUNCTION public.admission_compute_fee_items_for_learner(uuid) IS
  'Pure fee-item resolution for a learner — computes, never writes. The persisting wrapper is admission_resolve_fee_items_for_lead. Split out so the account-transition preview can show the real numbers without leaving a fee_items snapshot behind on a dialog the admin then cancels.';

REVOKE ALL ON FUNCTION public.admission_compute_fee_items_for_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_compute_fee_items_for_learner(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §2 The persisting wrapper — compute, then write
-- =============================================================================
-- Behaviour is unchanged for every caller. The legacy short-circuit still
-- returns the existing snapshot without touching it; a no-match still clears
-- fee_items to '[]'.

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_legacy   boolean;
    v_resolved jsonb;
BEGIN
    SELECT legacy_fee_mode INTO v_legacy
      FROM public.learners_profiles WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    v_resolved := public.admission_compute_fee_items_for_learner(p_learner_id);

    -- A legacy learner's snapshot is returned as-is and never rewritten.
    IF v_legacy = true THEN
        RETURN v_resolved;
    END IF;

    UPDATE public.learners_profiles
       SET fee_items  = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$function$;

REVOKE ALL ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_resolve_fee_items_for_lead(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §3 The preview — exactly the bills the transition will raise
-- =============================================================================
-- Same fee items, same split engine, same skip rule, same anchor date as
-- admission_account_transition_with_bills. What the dialog shows is what
-- generation produces; the two cannot drift because they read one engine.
--
-- Gated on admission_documents.manage — the same permission the transition
-- itself demands, so anyone who can preview can commit and vice versa.
--
-- Foreign-module rows are RETURNED, not hidden, with is_billable = false. An
-- admin looking at a hosteller should see that Hostel Fee exists and why it is
-- not on this bill run, rather than wondering where it went.

CREATE OR REPLACE FUNCTION public.admission_preview_account_bills(p_learner_id uuid)
RETURNS TABLE (
  sort_order              integer,
  category_id             uuid,
  category_name           text,
  item_amount             numeric,
  is_billable             boolean,
  owner_module            text,
  instalment_no           integer,
  instalment_count        integer,
  instalment_amount       numeric,
  share_percent           numeric,
  due_date                date,
  promotes_to_status_code text,
  matched_source          text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  IF NOT public.user_has_permission('admission_documents.manage') THEN
    RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
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

COMMENT ON FUNCTION public.admission_preview_account_bills(uuid) IS
  'Read-only preview of the exact bills admission_account_transition_with_bills would raise for this learner today: one row per instalment, with the effective share, the real due date and the lifecycle status that instalment promotes to. Foreign-module items are returned with is_billable = false rather than hidden. Anchors on CURRENT_DATE, so an offset-based due date shifts if the transition happens on a later day.';

REVOKE ALL ON FUNCTION public.admission_preview_account_bills(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_preview_account_bills(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- §4 The guard: no bills, no 'account'
-- =============================================================================
-- Only the block marked ADDED is new; every other line is the 20260821190000
-- body verbatim.

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id uuid,
    p_required_documents jsonb,
    p_received_documents jsonb,
    p_idempotency_key uuid DEFAULT NULL::uuid,
    p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_fee_items         jsonb;
    v_required          text[];
    v_received_types    text[];
    v_missing           text[];
    v_doc               jsonb;
    v_bills_existing    integer;
    v_bills_inserted    integer := 0;
    v_bills_skipped     integer := 0;
    v_items_split       integer := 0;
    v_items_dated       integer := 0;
    v_bills_final       integer := 0;
    v_split             record;
    v_split_rows        integer;
    v_item              jsonb;
    v_item_id           uuid;
    v_group_id          uuid;
    v_due_date          date;
    v_caller            uuid := auth.uid();
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing_result
          FROM public.admission_account_transition_log
         WHERE idempotency_key = p_idempotency_key;
        IF v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
    END IF;

    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode,
           accommodation_type_id, academic_year_id
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.lifecycle_status NOT IN (
        'enquiry', 'enquiry_submitted',
        'admitted', 'pending', 'approved'
    ) THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=enquiry/enquiry_submitted/admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = p_learner_id
       AND status = 'pending_review'
     LIMIT 1;
    IF v_pending_event_id IS NOT NULL THEN
        RAISE EXCEPTION 'pending_fee_change_event: cannot transition while a fee-change event is pending review (event_id=%)',
            v_pending_event_id USING ERRCODE = 'P0001';
    END IF;

    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            UPDATE public.learners_profiles
               SET legacy_fee_mode = false,
                   updated_at      = now()
             WHERE id = p_learner_id;

            v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
            IF jsonb_array_length(v_fee_items) = 0 THEN
                RAISE EXCEPTION 'fee_items_empty: no legacy fees and no matching fee structure in the matrix';
            END IF;
        END IF;
    END IF;

    SELECT array_agg(value::text) INTO v_required
      FROM jsonb_array_elements_text(p_required_documents);

    SELECT array_agg(value->>'doc_type') INTO v_received_types
      FROM jsonb_array_elements(p_received_documents) AS value;

    SELECT array_agg(req) INTO v_missing
      FROM unnest(COALESCE(v_required, ARRAY[]::text[])) AS req
     WHERE req <> ALL (COALESCE(v_received_types, ARRAY[]::text[]));

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'required_documents_missing: %', array_to_string(v_missing, ',');
    END IF;

    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_received_documents)
    LOOP
        INSERT INTO public.learner_admission_documents
            (learner_id, doc_type, is_received, received_at, received_by, received_via, document_ref)
        VALUES
            (p_learner_id,
             v_doc->>'doc_type',
             true,
             now(),
             v_caller,
             v_doc->>'received_via',
             v_doc->>'document_ref')
        ON CONFLICT (learner_id, doc_type) DO UPDATE
            SET is_received  = true,
                received_at  = EXCLUDED.received_at,
                received_by  = EXCLUDED.received_by,
                received_via = EXCLUDED.received_via,
                document_ref = EXCLUDED.document_ref,
                updated_at   = now();
    END LOOP;

    UPDATE public.learners_profiles
       SET lifecycle_status               = 'account',
           updated_at                     = now(),
           updated_by                     = v_caller,
           account_verified_at            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN now()
                                              ELSE account_verified_at
                                            END,
           account_verified_by            = CASE
                                              WHEN p_idempotency_key IS NOT NULL
                                              THEN v_caller
                                              ELSE account_verified_by
                                            END,
           account_verification_notes     = COALESCE(p_notes, account_verification_notes)
     WHERE id = p_learner_id;

    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            IF (v_item->>'amount')::numeric > 0 THEN
                IF EXISTS (
                    SELECT 1
                      FROM public.billing_categories bc
                     WHERE bc.id = NULLIF(v_item->>'category_id','')::uuid
                       AND bc.kind IN ('hostel', 'mess', 'transport')
                ) THEN
                    v_bills_skipped := v_bills_skipped + 1;
                    CONTINUE;
                END IF;

                v_item_id  := NULLIF(v_item->>'fee_structure_item_id','')::uuid;
                v_split_rows := 0;
                v_group_id := NULL;

                FOR v_split IN
                    SELECT s.instalment_no, s.instalment_count,
                           s.instalment_amount, s.instalment_due_date,
                           s.matched_source, s.matched_ref_id
                      FROM public.billing_instalment_split_for_learner(
                             p_learner_id,
                             NULLIF(v_item->>'category_id','')::uuid,
                             (v_item->>'amount')::numeric,
                             now()::date,
                             v_item_id) s
                     ORDER BY s.instalment_no
                LOOP
                    IF v_split.instalment_count >= 2 AND v_group_id IS NULL THEN
                        v_group_id := gen_random_uuid();
                    END IF;

                    INSERT INTO public.billing_student_bills (
                        student_id, institution_id, academic_year_id, item_category_id,
                        bill_description, due_date, quantity,
                        unit_amount, total_amount, tax_amount, final_amount,
                        balance_amount, status, remarks, created_by,
                        fee_structure_item_id,
                        instalment_group_id, instalment_no, instalment_count
                    ) VALUES (
                        p_learner_id,
                        v_lead.institution_id,
                        v_lead.academic_year_id,
                        NULLIF(v_item->>'category_id','')::uuid,
                        CASE WHEN v_split.instalment_count >= 2
                             THEN COALESCE(v_item->>'category_name','Fee Item')
                                  || ' — Instalment ' || v_split.instalment_no
                                  || '/' || v_split.instalment_count
                             ELSE COALESCE(v_item->>'category_name','Fee Item')
                        END,
                        v_split.instalment_due_date,
                        1,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        0,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        'unpaid',
                        CASE WHEN v_split.instalment_count >= 2
                             THEN 'Onboarding bill — auto-generated via account transition RPC (instalment '
                                  || v_split.instalment_no || '/' || v_split.instalment_count
                                  || ' per fee structure schedule)'
                             ELSE 'Onboarding bill — auto-generated via account transition RPC'
                        END,
                        v_caller,
                        CASE WHEN v_split.matched_source LIKE 'item%'
                             THEN v_split.matched_ref_id
                             ELSE v_item_id
                        END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_group_id END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_split.instalment_no::smallint END,
                        CASE WHEN v_split.instalment_count >= 2 THEN v_split.instalment_count::smallint END
                    );
                    v_bills_inserted := v_bills_inserted + 1;
                    v_split_rows := v_split_rows + 1;
                END LOOP;

                IF v_split_rows > 1 THEN
                    v_items_split := v_items_split + 1;
                    CONTINUE;
                ELSIF v_split_rows = 1 THEN
                    v_items_dated := v_items_dated + 1;
                    CONTINUE;
                END IF;

                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, academic_year_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
                    v_lead.academic_year_id,
                    NULLIF(v_item->>'category_id','')::uuid,
                    COALESCE(v_item->>'category_name','Fee Item'),
                    v_due_date,
                    1,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    0,
                    (v_item->>'amount')::numeric,
                    (v_item->>'amount')::numeric,
                    'unpaid',
                    'Onboarding bill — auto-generated via account transition RPC',
                    v_caller
                );
                v_bills_inserted := v_bills_inserted + 1;
            END IF;
        END LOOP;
    END IF;

    -- ══ ADDED 2026-08-21 — no bills, no 'account' ═════════════════════════
    -- The status UPDATE above and this check are in the same transaction, so
    -- raising here rolls the lifecycle back with everything else. Before this,
    -- the RPC set the status, generated, and returned without ever looking at
    -- what generation produced — which is how 15 learners reached 'admitted'
    -- holding no live bill at all.
    SELECT count(*) INTO v_bills_final
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id
       AND status NOT IN ('cancelled', 'superseded');

    IF v_bills_final = 0 THEN
        -- The ONE legitimate zero: every fee item belongs to Campus Living or
        -- TMS, which bill separately. Zero structures are all-foreign today;
        -- this exists so a future hostel-only structure is not bricked.
        IF v_bills_skipped > 0 AND v_bills_inserted = 0 THEN
            NULL;
        ELSE
            RAISE EXCEPTION
              'no_bills_generated: refusing to move this learner to Account with no bills. Check that the fee structure has at least one billable item with an amount above zero.'
              USING ERRCODE = 'P0001',
                    HINT = 'The lifecycle status has been rolled back — the learner is unchanged.';
        END IF;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'bills_skipped_foreign_module', v_bills_skipped,
        'bills_split_by_instalment_plan', v_items_split,
        'items_with_scheduled_due_date', v_items_dated,
        'bills_live_after', v_bills_final,
        'fee_items_count', jsonb_array_length(v_fee_items),
        'verified', (p_idempotency_key IS NOT NULL)
    );

    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.admission_account_transition_log
            (idempotency_key, learner_id, result, created_by)
        VALUES
            (p_idempotency_key, p_learner_id, v_result, v_caller)
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  TO authenticated, service_role;
