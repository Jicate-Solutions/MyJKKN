-- =============================================================================
-- 20260822100000_single_bill_generation_and_due_date_sync.sql
--
-- PHASES 3 + 4 of "One bill per fee, with an instalment schedule inside it".
--
-- §1-2  billing_student_bills.due_date starts tracking the NEXT UNSETTLED
--       tranche. This is what lets the 33 functions that read due_date keep
--       working untouched: overdue marking, aging buckets, defaulter lists and
--       risk scores all continue to mean "the date the next money is owed",
--       which is exactly right once a bill can be collected in tranches.
--
-- §3    The account-transition RPC stops splitting a scheduled fee into N
--       BILLS and emits ONE bill carrying N TRANCHES. Three fee items now
--       produce three bills, not five.
--
-- WHAT THIS UNDOES FROM YESTERDAY
-- -------------------------------
-- 20260821190000 stamped instalment_group_id / instalment_no / instalment_count
-- on N sibling bills and relaxed billing_enforce_once_per_learner so those
-- siblings could coexist in a once_per_learner category. With one bill per fee,
-- once_per_learner is satisfied naturally and that exemption becomes
-- unreachable — no bill will carry a group again. The columns and the trigger
-- branch are LEFT IN PLACE, inert: zero production bills ever used them, and
-- dropping a column from a 19k-row table to delete dead-but-harmless code is a
-- worse trade than a documented no-op.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF to_regclass('public.billing_bill_instalments') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: phase 1 (20260822090000) has not been applied.';
  END IF;
END
$guard$;

-- =============================================================================
-- §1 due_date := the next unsettled tranche
-- =============================================================================
-- Computed inline from the tranche table rather than through
-- vw_bill_instalment_state: that view is security_invoker = true, so inside a
-- trigger it would be filtered by whoever happens to be writing. A trigger that
-- silently sees fewer rows for some users is a trigger that writes wrong dates
-- for some users.
--
-- All tranches settled -> the LAST tranche date, so a fully paid bill keeps a
-- sensible historical due date instead of NULL (the column is NOT NULL) or a
-- date that keeps moving.

CREATE OR REPLACE FUNCTION public.bbi_sync_bill_due_date(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_paid numeric(15,2);
  v_next date;
  v_last date;
BEGIN
  SELECT GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
    INTO v_paid
  FROM public.billing_student_bills b WHERE b.id = p_bill_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH st AS (
    SELECT i.due_date, i.amount,
           COALESCE(SUM(i.amount) OVER (
             ORDER BY i.due_date, i.sequence_no
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before_amt
    FROM public.billing_bill_instalments i
    WHERE i.bill_id = p_bill_id
  )
  SELECT min(due_date) FILTER (
           WHERE LEAST(GREATEST(v_paid - before_amt, 0), amount) < amount),
         max(due_date)
    INTO v_next, v_last
  FROM st;

  -- No tranches at all: leave due_date exactly as it is. This is every one of
  -- the bills that existed before this feature.
  IF v_last IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.billing_student_bills
     SET due_date = COALESCE(v_next, v_last)
   WHERE id = p_bill_id
     AND due_date IS DISTINCT FROM COALESCE(v_next, v_last);
END;
$function$;

COMMENT ON FUNCTION public.bbi_sync_bill_due_date(uuid) IS
  'Sets billing_student_bills.due_date to the earliest UNSETTLED tranche (or the last tranche once all are settled). Keeps every existing consumer of due_date — overdue marking, aging, defaulters, risk scoring — correct about WHEN the next money is owed. No-op for a bill with no tranches.';

REVOKE ALL ON FUNCTION public.bbi_sync_bill_due_date(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bbi_sync_bill_due_date(uuid) TO authenticated, service_role;

-- =============================================================================
-- §2 When to re-sync
-- =============================================================================
-- Two events move the next unsettled tranche: the schedule changing, and money
-- arriving.
--
-- The bill-side trigger is scoped to `UPDATE OF balance_amount`, which matters
-- twice over: it is the only column that changes the answer, and it means the
-- due_date write this function performs cannot re-enter the trigger.

CREATE OR REPLACE FUNCTION public.bbi_sync_due_date_from_instalment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- NEW is unassigned in a plpgsql DELETE trigger; branch, never COALESCE.
  IF TG_OP = 'DELETE' THEN
    PERFORM public.bbi_sync_bill_due_date(OLD.bill_id);
  ELSE
    PERFORM public.bbi_sync_bill_due_date(NEW.bill_id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bbi_sync_due_date ON public.billing_bill_instalments;
CREATE TRIGGER trg_bbi_sync_due_date
  AFTER INSERT OR UPDATE OF amount, due_date, sequence_no OR DELETE
  ON public.billing_bill_instalments
  FOR EACH ROW EXECUTE FUNCTION public.bbi_sync_due_date_from_instalment();

CREATE OR REPLACE FUNCTION public.bbi_sync_due_date_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.bbi_sync_bill_due_date(NEW.id);
  RETURN NULL;
END;
$function$;

-- Named to sort AFTER trg_evaluate_status_after_bill_paid, so the promotion
-- engine still sees the bill exactly as the payment left it. Postgres fires row
-- triggers in alphabetical order by name, and 'trg_z' is deliberate.
DROP TRIGGER IF EXISTS trg_z_bbi_sync_due_date_after_payment ON public.billing_student_bills;
CREATE TRIGGER trg_z_bbi_sync_due_date_after_payment
  AFTER UPDATE OF balance_amount ON public.billing_student_bills
  FOR EACH ROW EXECUTE FUNCTION public.bbi_sync_due_date_after_payment();

-- =============================================================================
-- §3 Generation: ONE bill per fee, tranches inside it
-- =============================================================================
-- Only the bill-generation loop changes. Idempotency, the permission check, the
-- status allow-list, the pending-fee-change block, fee resolution, document
-- validation, the lifecycle update, the no-bills guard and the result assembly
-- are the 20260821220000 body verbatim.
--
-- The engine contract is unchanged and still drives everything:
--   0 rows  -> one bill on the caller's legacy +30 day default
--   1 row   -> one bill on the resolved due date, NO tranches (an unsplit fee
--              is not a schedule; its status rule stays on the fee item and
--              Stage A0 reads it through fee_structure_item_id, exactly as for
--              the 19,349 bills that predate this feature)
--   N rows  -> ONE bill for the full amount + N tranches

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
    v_tranches_inserted integer := 0;
    v_bills_final       integer := 0;
    v_split             record;
    v_split_rows        integer;
    v_item              jsonb;
    v_item_id           uuid;
    v_new_bill_id       uuid;
    v_first_due         date;
    v_amount            numeric;
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
            v_amount := (v_item->>'amount')::numeric;
            IF v_amount > 0 THEN
                IF EXISTS (
                    SELECT 1
                      FROM public.billing_categories bc
                     WHERE bc.id = NULLIF(v_item->>'category_id','')::uuid
                       AND bc.kind IN ('hostel', 'mess', 'transport')
                ) THEN
                    v_bills_skipped := v_bills_skipped + 1;
                    CONTINUE;
                END IF;

                v_item_id := NULLIF(v_item->>'fee_structure_item_id','')::uuid;

                SELECT count(*), min(s.instalment_due_date)
                  INTO v_split_rows, v_first_due
                  FROM public.billing_instalment_split_for_learner(
                         p_learner_id,
                         NULLIF(v_item->>'category_id','')::uuid,
                         v_amount,
                         now()::date,
                         v_item_id) s;

                -- ONE bill for the whole fee, whatever the schedule.
                INSERT INTO public.billing_student_bills (
                    student_id, institution_id, academic_year_id, item_category_id,
                    bill_description, due_date, quantity,
                    unit_amount, total_amount, tax_amount, final_amount,
                    balance_amount, status, remarks, created_by,
                    fee_structure_item_id
                ) VALUES (
                    p_learner_id,
                    v_lead.institution_id,
                    v_lead.academic_year_id,
                    NULLIF(v_item->>'category_id','')::uuid,
                    COALESCE(v_item->>'category_name','Fee Item'),
                    COALESCE(v_first_due, v_due_date),
                    1,
                    v_amount, v_amount, 0, v_amount, v_amount,
                    'unpaid',
                    CASE WHEN v_split_rows > 1
                         THEN 'Onboarding bill — auto-generated via account transition RPC ('
                              || v_split_rows || ' instalments per fee structure schedule)'
                         ELSE 'Onboarding bill — auto-generated via account transition RPC'
                    END,
                    v_caller,
                    v_item_id
                )
                RETURNING id INTO v_new_bill_id;
                v_bills_inserted := v_bills_inserted + 1;

                IF v_split_rows > 1 THEN
                    -- The schedule lives INSIDE the bill. sequence_no comes from
                    -- the engine so it still names the tranche the author
                    -- configured, while the waterfall orders by date.
                    INSERT INTO public.billing_bill_instalments
                        (bill_id, sequence_no, amount, due_date, promotes_to_status_code)
                    SELECT v_new_bill_id, s.instalment_no::smallint,
                           s.instalment_amount, s.instalment_due_date,
                           s.promotes_to_status_code
                      FROM public.billing_instalment_split_for_learner(
                             p_learner_id,
                             NULLIF(v_item->>'category_id','')::uuid,
                             v_amount,
                             now()::date,
                             v_item_id) s;
                    v_tranches_inserted := v_tranches_inserted + v_split_rows;
                    v_items_split := v_items_split + 1;
                ELSIF v_split_rows = 1 THEN
                    v_items_dated := v_items_dated + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;

    SELECT count(*) INTO v_bills_final
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id
       AND status NOT IN ('cancelled', 'superseded');

    IF v_bills_final = 0 THEN
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
        'instalments_generated', v_tranches_inserted,
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
