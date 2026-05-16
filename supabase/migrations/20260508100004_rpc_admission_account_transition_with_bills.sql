-- ============================================================================
-- 20260508100004 — admission_account_transition_with_bills RPC
-- ============================================================================
-- Spec §8.3.1. Atomic: documents persistence + status update + bill generation.
-- Any RAISE EXCEPTION rolls back everything.
--
-- Bill INSERT column list mirrors OnboardingService.createBillsFromProfile
-- (lib/services/billing/onboarding/onboarding-service.ts) exactly:
--   student_id, institution_id, item_category_id, bill_description, due_date,
--   quantity, unit_amount, total_amount, tax_amount, final_amount,
--   balance_amount, status, remarks, created_by
-- Other billing_student_bills columns (is_recurring, recurrence_pattern,
-- number_of_recurrences, payment_date) keep their table defaults.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id          uuid,
    p_required_documents  jsonb,   -- ["pan","aadhaar","parent_id","agreement_form"]
    p_received_documents  jsonb    -- [{"doc_type":"pan","received_via":"physical","document_ref":"PAN-1234"}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
    -- 1. Permission check
    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Load + validate lead
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.lifecycle_status NOT IN ('admitted','pending','approved') THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    -- 3. Validate fee structure resolves (or legacy mode has existing fee_items)
    IF v_lead.legacy_fee_mode = false THEN
        v_fee_items := public.admission_resolve_fee_items_for_lead(p_learner_id);
        IF jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'fee_structure_not_resolvable: no matching matrix combo';
        END IF;
    ELSE
        v_fee_items := v_lead.fee_items;
        IF v_fee_items IS NULL OR jsonb_array_length(v_fee_items) = 0 THEN
            RAISE EXCEPTION 'legacy_fee_items_empty: cannot transition with no fees';
        END IF;
    END IF;

    -- 4. Validate documents
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

    -- 5. UPSERT documents
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

    -- 6. Update lifecycle status
    UPDATE public.learners_profiles
       SET lifecycle_status = 'account',
           updated_at = now(),
           updated_by = v_caller
     WHERE id = p_learner_id;

    -- 7. Generate bills (idempotent — skip if any exist)
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            -- Only insert items with positive amount
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

    -- 8. Return result (activity log entries written by service-layer caller per
    --    project pattern — keeping the RPC focused on data integrity)
    RETURN jsonb_build_object(
        'success', true,
        'learner_id', p_learner_id,
        'lifecycle_status', 'account',
        'documents_recorded', jsonb_array_length(p_received_documents),
        'bills_existing', v_bills_existing,
        'bills_generated', v_bills_inserted,
        'fee_items_count', jsonb_array_length(v_fee_items)
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Surface the original error; transaction auto-rolls back
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb) TO authenticated;
