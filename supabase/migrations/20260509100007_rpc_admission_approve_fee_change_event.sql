-- ============================================================================
-- 20260509100007 — admission_approve_fee_change_event RPC
-- ============================================================================
-- Spec §8.3.2. Atomic approval of fee_change_events with per-line decisions.
-- Any RAISE EXCEPTION rolls back everything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admission_approve_fee_change_event(
    p_event_id        uuid,
    p_line_decisions  jsonb,           -- [{billing_category_id, decision, reallocation_amount?, decision_notes?}]
    p_refund_excess   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event             record;
    v_caller            uuid := auth.uid();
    v_decision          jsonb;
    v_line_cat_id       uuid;
    v_decision_kind     text;
    v_reallocate_amount numeric(15,2);
    v_old_amount        numeric(15,2);
    v_new_amount        numeric(15,2);
    v_paid_so_far       numeric(15,2);
    v_delta             numeric(15,2);
    v_old_bill_id       uuid;
    v_new_bill_id       uuid;
    v_credit_balance_id uuid;
    v_summary           jsonb := '{"new_bills":0,"superseded_bills":0,"credit_balances":0,"reallocations":0}'::jsonb;
    v_due_date          date := (now() + interval '30 days')::date;
    v_lead              record;
BEGIN
    -- 1. Permission
    IF NOT public.user_has_permission('admission_fees.approve_change_event') THEN
        RAISE EXCEPTION 'permission_denied: admission_fees.approve_change_event required'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Load event
    SELECT * INTO v_event
      FROM public.admission_fee_change_events
     WHERE id = p_event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'event_not_found: %', p_event_id USING ERRCODE = 'P0002';
    END IF;
    IF v_event.status <> 'pending_review' THEN
        RAISE EXCEPTION 'event_not_pending: %', v_event.status;
    END IF;

    -- 3. Load lead (institution_id needed for new bills)
    SELECT id, institution_id INTO v_lead
      FROM public.learners_profiles
     WHERE id = v_event.learner_id;

    -- 4. For each decision in p_line_decisions, apply
    FOR v_decision IN SELECT * FROM jsonb_array_elements(p_line_decisions)
    LOOP
        v_line_cat_id       := (v_decision->>'billing_category_id')::uuid;
        v_decision_kind     := v_decision->>'decision';
        v_reallocate_amount := COALESCE((v_decision->>'reallocation_amount')::numeric, 0);

        -- Pull the event_line snapshot
        SELECT old_amount, new_amount, paid_amount_so_far
          INTO v_old_amount, v_new_amount, v_paid_so_far
          FROM public.admission_fee_change_event_lines
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_delta := COALESCE(v_new_amount, 0) - COALESCE(v_old_amount, 0);

        -- Pick the most recent active old bill in this category (for supersede / reallocate)
        SELECT id INTO v_old_bill_id
          FROM public.billing_student_bills
         WHERE student_id = v_event.learner_id
           AND item_category_id = v_line_cat_id
           AND status <> 'superseded'
         ORDER BY created_at DESC LIMIT 1;

        CASE v_decision_kind
        WHEN 'apply_supplemental' THEN
            -- Only when delta > 0
            IF v_delta > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Supplemental — fee structure change',
                    v_due_date, 1, v_delta, v_delta, 0, v_delta,
                    v_delta, 'unpaid',
                    'Supplemental bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));
            END IF;

        WHEN 'issue_credit_note' THEN
            -- Only when delta < 0 (parent owes less now); credit balance covers the delta
            IF v_delta < 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, ABS(v_delta), 'fee_structure_change', p_event_id,
                    'Credit note for ' || v_line_cat_id::text || ' (delta ' || v_delta::text || ')',
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'refund_payment' THEN
            -- Mark for manual refund — credit balance entry with notes
            IF v_paid_so_far > 0 THEN
                INSERT INTO public.student_credit_balances (
                    student_id, amount, source, source_event_id, notes, created_by
                ) VALUES (
                    v_event.learner_id, v_paid_so_far, 'fee_structure_change', p_event_id,
                    'REFUND REQUESTED — manual refund pending; original bill ' || COALESCE(v_old_bill_id::text,'(none)'),
                    v_caller
                ) RETURNING id INTO v_credit_balance_id;
                v_summary := jsonb_set(v_summary, '{credit_balances}',
                    to_jsonb((v_summary->>'credit_balances')::int + 1));
            END IF;

        WHEN 'reallocate_payment' THEN
            -- Supersede old bill, create new bill, reallocate paid amount
            IF v_old_bill_id IS NOT NULL THEN
                UPDATE public.billing_student_bills
                   SET status = 'superseded', updated_at = now()
                 WHERE id = v_old_bill_id;
                v_summary := jsonb_set(v_summary, '{superseded_bills}',
                    to_jsonb((v_summary->>'superseded_bills')::int + 1));
            END IF;
            IF COALESCE(v_new_amount, 0) > 0 THEN
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, item_category_id, bill_description,
                    due_date, quantity, unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by
                ) VALUES (
                    v_event.learner_id, v_lead.institution_id, v_line_cat_id,
                    'Replacement — fee structure change',
                    v_due_date, 1, v_new_amount, v_new_amount, 0, v_new_amount,
                    GREATEST(0, v_new_amount - LEAST(v_paid_so_far, v_new_amount)),
                    CASE
                      WHEN v_paid_so_far >= v_new_amount THEN 'paid'
                      WHEN v_paid_so_far > 0 THEN 'partially_paid'
                      ELSE 'unpaid' END,
                    'Replacement bill for fee structure change event ' || p_event_id::text,
                    v_caller
                ) RETURNING id INTO v_new_bill_id;
                v_summary := jsonb_set(v_summary, '{new_bills}',
                    to_jsonb((v_summary->>'new_bills')::int + 1));

                -- Link supersede chain
                IF v_old_bill_id IS NOT NULL THEN
                    UPDATE public.billing_student_bills
                       SET superseded_by_bill_id = v_new_bill_id
                     WHERE id = v_old_bill_id;
                END IF;

                -- Reallocate prior payments: copy receipt_items rows pointing at old bill
                -- into NEW rows pointing at the new bill (NEVER mutate originals)
                IF v_paid_so_far > 0 AND v_old_bill_id IS NOT NULL THEN
                    INSERT INTO public.billing_receipt_items (
                        receipt_id, bill_id, amount_paid, allocation_reason
                    )
                    SELECT receipt_id,
                           v_new_bill_id,
                           LEAST(amount_paid, v_new_amount),
                           'fee_structure_change_reallocation'
                      FROM public.billing_receipt_items
                     WHERE bill_id = v_old_bill_id
                       AND allocation_reason = 'original_payment';
                    -- Increment the reallocations counter (each line that runs reallocation
                    -- counts once; the GET DIAGNOSTICS form was a draft mistake — never
                    -- assign GET DIAGNOSTICS to v_summary because it would overwrite the
                    -- JSONB with an integer).
                    v_summary := jsonb_set(v_summary, '{reallocations}',
                        to_jsonb((v_summary->>'reallocations')::int + 1));

                    -- Excess (paid > new amount) → credit_balance
                    IF v_paid_so_far > v_new_amount THEN
                        INSERT INTO public.student_credit_balances (
                            student_id, amount, source, source_event_id, notes, created_by
                        ) VALUES (
                            v_event.learner_id, v_paid_so_far - v_new_amount, 'fee_structure_change',
                            p_event_id,
                            CASE WHEN p_refund_excess
                                 THEN 'EXCESS — refund flag set; manual refund pending'
                                 ELSE 'EXCESS from reallocation; available against future bills' END,
                            v_caller
                        );
                        v_summary := jsonb_set(v_summary, '{credit_balances}',
                            to_jsonb((v_summary->>'credit_balances')::int + 1));
                    END IF;
                END IF;
            END IF;

        WHEN 'waive_delta', 'do_nothing' THEN
            -- No artifact
            NULL;

        ELSE
            RAISE EXCEPTION 'unknown_decision: %', v_decision_kind;
        END CASE;

        -- Persist the decision + artifact id back on the event_line
        UPDATE public.admission_fee_change_event_lines
           SET decision              = v_decision_kind,
               generated_artifact_id = COALESCE(v_new_bill_id, v_credit_balance_id),
               decision_notes        = v_decision->>'decision_notes'
         WHERE event_id = p_event_id AND billing_category_id = v_line_cat_id;

        v_new_bill_id := NULL;
        v_credit_balance_id := NULL;
    END LOOP;

    -- 5. Refresh resolved fee_items snapshot
    PERFORM public.admission_resolve_fee_items_for_lead(v_event.learner_id);

    -- 6. Mark event approved
    UPDATE public.admission_fee_change_events
       SET status      = 'approved',
           decided_by  = v_caller,
           decided_at  = now(),
           updated_at  = now()
     WHERE id = p_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'summary', v_summary
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_approve_fee_change_event(uuid, jsonb, boolean) TO authenticated;
