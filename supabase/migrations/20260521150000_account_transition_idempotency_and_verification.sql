-- ============================================================================
-- 20260521150000 — Pre-account verification flow: idempotency + audit columns
-- ============================================================================
-- Phase 2 of the account-verification rollout (see Phase 1 commit for the
-- AccountVerificationDialog component). This migration:
--
--   1. Creates admission_account_transition_log — a dedupe table keyed on
--      the idempotency_key the client generates per dialog open. Rapid
--      double-clicks on Confirm pass the same key; the RPC returns the
--      previously-stored result instead of re-firing.
--
--   2. Adds account_verified_at / account_verified_by / account_verification_notes
--      columns to learners_profiles. Populated by the RPC when the
--      verification dialog confirms; provides forensic proof of who
--      ticked the dimensions + on what timestamp.
--
--   3. Extends admission_account_transition_with_bills RPC with two new
--      optional params (p_idempotency_key, p_notes), an idempotency
--      short-circuit at the top, a pending-fee-change-event guard, and
--      writes to the new audit columns. All existing callers (the leads-
--      module AccountTransitionDialog) continue to work because both new
--      params default to NULL — the old behaviour is preserved when they
--      aren't provided.
-- ============================================================================

-- 1. Idempotency log table
CREATE TABLE IF NOT EXISTS public.admission_account_transition_log (
  idempotency_key uuid PRIMARY KEY,
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  result          jsonb NOT NULL,
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_aatl_learner
  ON public.admission_account_transition_log (learner_id, created_at DESC);

ALTER TABLE public.admission_account_transition_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aatl_read ON public.admission_account_transition_log;
CREATE POLICY aatl_read ON public.admission_account_transition_log
  FOR SELECT USING (
    public.is_super_admin()
    OR public.user_has_permission('admission_documents.manage')
  );

-- 2. Audit columns on learners_profiles
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS account_verified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS account_verified_by        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS account_verification_notes text;

-- 3. RPC extension. Full body re-emitted (CREATE OR REPLACE) — the only
--    semantic changes are:
--      a) two new optional params at the end of the signature
--      b) idempotency short-circuit before the permission check
--      c) pending-fee-change-event guard before fee resolution
--      d) audit-column writes alongside the existing UPDATE
--      e) idempotency log insert at the end (success path only)
--
--    NOTE on overloads: Postgres treats functions with different argument
--    counts as DISTINCT functions. Adding DEFAULT NULL params via
--    CREATE OR REPLACE doesn't replace the old 3-arg overload — both live
--    side-by-side, and PostgREST then can't disambiguate which to call.
--    We DROP the old 3-arg signature explicitly below; the new 5-arg with
--    NULL defaults is a strict behavioural superset.

DROP FUNCTION IF EXISTS public.admission_account_transition_with_bills(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.admission_account_transition_with_bills(
    p_learner_id          uuid,
    p_required_documents  jsonb,
    p_received_documents  jsonb,
    p_idempotency_key     uuid DEFAULT NULL,
    p_notes               text DEFAULT NULL
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
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
BEGIN
    -- Idempotency short-circuit: if the same key has fired before, return
    -- the stored result without re-running. The dialog generates one UUID
    -- per Confirm session; rapid double-clicks pass the same key.
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing_result
          FROM public.admission_account_transition_log
         WHERE idempotency_key = p_idempotency_key;
        IF v_existing_result IS NOT NULL THEN
            RETURN v_existing_result;
        END IF;
    END IF;

    -- Permission check (unchanged)
    IF NOT public.user_has_permission('admission_documents.manage') THEN
        RAISE EXCEPTION 'permission_denied: admission_documents.manage required'
            USING ERRCODE = '42501';
    END IF;

    -- Load + validate lead (unchanged)
    SELECT id, institution_id, lifecycle_status, fee_items, legacy_fee_mode
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- Allow-list (unchanged from 2026-05-20 patch)
    IF v_lead.lifecycle_status NOT IN (
        'enquiry', 'enquiry_submitted',
        'admitted', 'pending', 'approved'
    ) THEN
        RAISE EXCEPTION 'invalid_status_for_account_transition: current=%, allowed=enquiry/enquiry_submitted/admitted/pending/approved',
            v_lead.lifecycle_status;
    END IF;

    -- NEW: block if a pending admission_fee_change_events row exists. The
    -- post-account reconciliation queue must be cleared before a new
    -- account transition fires, otherwise the new bills would race against
    -- the pending supersede.
    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = p_learner_id
       AND status = 'pending_review'
     LIMIT 1;
    IF v_pending_event_id IS NOT NULL THEN
        RAISE EXCEPTION 'pending_fee_change_event: cannot transition while a fee-change event is pending review (event_id=%)',
            v_pending_event_id USING ERRCODE = 'P0001';
    END IF;

    -- Validate fee structure (unchanged)
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

    -- Validate documents (unchanged)
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

    -- UPSERT documents (unchanged)
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

    -- NEW: lifecycle update now also stamps the verification audit columns
    -- when called via the verification dialog (p_idempotency_key not null).
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

    -- Generate bills (unchanged — idempotent guard preserves prior behaviour)
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
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

    -- Build result jsonb
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

    -- NEW: persist the idempotency log entry on success
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
        -- Surface the original error; transaction auto-rolls back
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text) TO authenticated;
