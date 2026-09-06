-- CUTOVER: apply at go-live alongside the hostel-bill generation UI. Hostellers are billed via campus_living_generate_hostel_year_bills; this stops account-transition from also billing their academic portion (which would double-bill).
--
-- Guard added vs the current production body:
--   * New DECLARE var: v_is_hosteller boolean := false;
--   * After loading the learner row, resolve hosteller status via
--     accommodation_types.code = 'hostel' on v_lead.accommodation_type_id.
--   * The bill-generation block now runs only when
--     `v_bills_existing = 0 AND NOT v_is_hosteller`.
-- Everything else (lifecycle transition to 'account', fee_items resolution,
-- document handling, idempotency log, result shape) is byte-for-byte the
-- current production definition. Day scholars are unaffected.

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
    v_item              jsonb;
    v_due_date          date;
    v_caller            uuid := auth.uid();
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
    v_is_hosteller      boolean := false;
BEGIN
    -- Idempotency short-circuit
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing_result
          FROM public.admission_account_transition_log
         WHERE idempotency_key = p_idempotency_key;
        IF v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
    END IF;

    -- Permission check
    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- Load + lock learner row
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode, accommodation_type_id
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- CUTOVER guard: hostellers are billed via the Campus Living generation run
    -- (campus_living_generate_hostel_year_bills, hostel_year-stamped). Skipping
    -- bill INSERTs here prevents the academic portion from double-billing — the
    -- dedup index can't bridge a NULL hostel_year (here) vs a set one (there).
    v_is_hosteller := EXISTS (
        SELECT 1
          FROM public.accommodation_types a
         WHERE a.id = v_lead.accommodation_type_id
           AND a.code = 'hostel'
    );

    -- Status allow-list
    IF v_lead.lifecycle_status NOT IN (
        'enquiry', 'enquiry_submitted',
        'admitted', 'pending', 'approved'
    ) THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=enquiry/enquiry_submitted/admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    -- Block if a pending fee-change event exists
    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = p_learner_id
       AND status = 'pending_review'
     LIMIT 1;
    IF v_pending_event_id IS NOT NULL THEN
        RAISE EXCEPTION 'pending_fee_change_event: cannot transition while a fee-change event is pending review (event_id=%)',
            v_pending_event_id USING ERRCODE = 'P0001';
    END IF;

    -- ---- Fee resolution (FIXED: auto-resolve for legacy with empty fees) ----
    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            -- Legacy fee items not pre-populated. Auto-resolve from the fee
            -- structure matrix: flip legacy_fee_mode so the resolve function
            -- performs a full 8-dimension lookup instead of short-circuiting.
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

    -- Validate documents
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

    -- UPSERT documents
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

    -- Lifecycle update with verification audit columns
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

    -- Generate bills (idempotent — skips if bills already exist).
    -- CUTOVER: also skipped entirely for hostellers (billed via Campus Living).
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 AND NOT v_is_hosteller THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            IF (v_item->>'amount')::numeric > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
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

    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'fee_items_count', jsonb_array_length(v_fee_items),
        'verified', (p_idempotency_key IS NOT NULL)
    );

    -- Persist idempotency log
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
