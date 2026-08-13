-- Instalment plans for bill generation — MECHANISM ONLY, deliberately DORMANT.
--
-- FILE ONLY / NOT APPLIED — Director-gated.
--
-- WHAT THIS IS
-- ------------
-- Tuition bills today are YEARLY: one bill per fee item, a single due_date set
-- ~30 days after the account transition, no instalments. The open PR #2995
-- redefines the fee-ladder threshold as %-of-DUE-as-on-date; instalment due
-- dates spread over the year are what make that ladder meaningful. This file
-- ships the MECHANISM: a config table describing how a yearly fee splits into
-- ordered instalments, and a split engine consulted by bill generation. The
-- CONTENTS (which programmes get how many instalments on which dates) are a
-- separate proposal awaiting the Accounts team, so this migration seeds ZERO
-- rows on purpose — with zero plans configured, bill generation behaves
-- exactly as today, byte for byte. That is not an accident; do not seed here.
--
-- GRAIN (per the spec): programme x billing category x academic year, with
-- institution_id NOT NULL for RLS scoping. One ACTIVE plan per grain.
--
-- ONCE-PER-LEARNER INTERACTION (load-bearing): billing_categories.once_per_learner
-- (20260727120000) forbids a second live bill per learner per category — N
-- instalment bills of one category would be rejected by
-- trg_billing_bills_once_per_learner mid-batch. The split engine therefore
-- REFUSES to split any category with once_per_learner = true and falls back to
-- the single yearly bill. Enabling both on one category is a config conflict
-- this file resolves in favour of the stricter rule.
--
-- APPLY-TIME CHECKLIST for the person applying this file:
--   1. This file re-ships the full body of admission_account_transition_with_bills,
--      rebuilt from supabase/migrations/20260725_account_transition_bill_hostellers_core_fees.sql
--      (the newest file-based definition). Before applying, diff the LIVE body
--      (pg_get_functiondef) against that file — if they differ, an intervening
--      live change exists and this file must be rebased on it first. That is
--      the same practice the 20260725 file itself established.
--   2. No BEGIN/COMMIT in this file, so a BEGIN .. ROLLBACK rehearsal against
--      production actually rolls back.
--   3. The paired code change (instalment expansion in
--      lib/services/billing/onboarding/onboarding-service.ts) is dormant until
--      this file is applied AND a plan is configured; apply order does not
--      matter, but the mechanism only turns on when BOTH halves exist and the
--      Accounts team's plan rows are inserted.

-- ---------------------------------------------------------------------------
-- 1. Plan header — one row per programme x billing category x academic year
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_instalment_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES public.institutions(id),
  program_id       uuid NOT NULL REFERENCES public.programs(id),
  item_category_id uuid NOT NULL REFERENCES public.billing_categories(id),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  is_active        boolean NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.billing_instalment_plans IS
  'Config: how a yearly fee for (programme, billing category, academic year) '
  'splits into instalment bills at generation time. Zero rows = the split '
  'mechanism is dormant and bill generation emits one yearly bill, unchanged. '
  'Deactivated plans (is_active=false) are kept as history.';

-- One ACTIVE plan per grain; deactivated history rows may accumulate freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_instalment_plans_active_grain
  ON public.billing_instalment_plans (institution_id, program_id, item_category_id, academic_year_id)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_billing_instalment_plans_updated_at
  ON public.billing_instalment_plans;
CREATE TRIGGER trg_billing_instalment_plans_updated_at
  BEFORE UPDATE ON public.billing_instalment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Plan lines — the ordered instalments
-- ---------------------------------------------------------------------------
-- Each line sizes its instalment by EXACTLY ONE of {share_percent, fixed_amount}
-- and dates it by EXACTLY ONE of {due_date (absolute), due_offset_days (from
-- the day the bill is generated, i.e. the admission/account-transition date)}.

CREATE TABLE IF NOT EXISTS public.billing_instalment_plan_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES public.billing_instalment_plans(id) ON DELETE CASCADE,
  sequence_no     integer NOT NULL CHECK (sequence_no >= 1),
  share_percent   numeric(7,4) CHECK (share_percent > 0 AND share_percent <= 100),
  fixed_amount    numeric(12,2) CHECK (fixed_amount > 0),
  due_date        date,
  due_offset_days integer CHECK (due_offset_days >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_bipl_amount_exactly_one
    CHECK ((share_percent IS NULL) <> (fixed_amount IS NULL)),
  CONSTRAINT chk_bipl_due_exactly_one
    CHECK ((due_date IS NULL) <> (due_offset_days IS NULL)),
  CONSTRAINT uq_bipl_plan_sequence UNIQUE (plan_id, sequence_no)
);

COMMENT ON TABLE public.billing_instalment_plan_lines IS
  'Ordered instalments of a billing_instalment_plans row. Amount by exactly one '
  'of share_percent / fixed_amount; due date by exactly one of due_date / '
  'due_offset_days (offset from the bill-generation date). The LAST instalment '
  'always absorbs rounding: the engine sizes it as total minus the sum of the '
  'earlier instalments, so the instalments sum EXACTLY to the yearly amount.';

DROP TRIGGER IF EXISTS trg_billing_instalment_plan_lines_updated_at
  ON public.billing_instalment_plan_lines;
CREATE TRIGGER trg_billing_instalment_plan_lines_updated_at
  BEFORE UPDATE ON public.billing_instalment_plan_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. RLS — standard permission pattern (new keys registered in
--    lib/constants/permissions.ts in the same PR, so they are grantable)
-- ---------------------------------------------------------------------------

ALTER TABLE public.billing_instalment_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_instalment_plan_lines ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges grant ALL on every new table to anon (holder of
-- the public key embedded in every bundle) — lock both tables explicitly.
-- authenticated keeps its grant; RLS above is what scopes it.
REVOKE ALL ON TABLE public.billing_instalment_plans      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.billing_instalment_plan_lines FROM anon, PUBLIC;

CREATE POLICY "billing_instalment_plans_select" ON public.billing_instalment_plans
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.instalment_plans.view')
      AND role_has_institution_access(institution_id))
);

CREATE POLICY "billing_instalment_plans_manage" ON public.billing_instalment_plans
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.instalment_plans.manage')
      AND role_has_institution_access(institution_id))
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('billing.instalment_plans.manage')
      AND role_has_institution_access(institution_id))
);

-- Lines inherit scope from their plan (different table in the subquery, so no
-- same-table RLS recursion).
CREATE POLICY "billing_instalment_plan_lines_select" ON public.billing_instalment_plan_lines
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.billing_instalment_plans p
    WHERE p.id = billing_instalment_plan_lines.plan_id
      AND (is_super_admin() OR is_admin()
           OR (user_has_permission('billing.instalment_plans.view')
               AND role_has_institution_access(p.institution_id)))
  )
);

CREATE POLICY "billing_instalment_plan_lines_manage" ON public.billing_instalment_plan_lines
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.billing_instalment_plans p
    WHERE p.id = billing_instalment_plan_lines.plan_id
      AND (is_super_admin() OR is_admin()
           OR (user_has_permission('billing.instalment_plans.manage')
               AND role_has_institution_access(p.institution_id)))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.billing_instalment_plans p
    WHERE p.id = billing_instalment_plan_lines.plan_id
      AND (is_super_admin() OR is_admin()
           OR (user_has_permission('billing.instalment_plans.manage')
               AND role_has_institution_access(p.institution_id)))
  )
);

-- ---------------------------------------------------------------------------
-- 4. Split engine — the SINGLE source of truth for the split arithmetic
-- ---------------------------------------------------------------------------
-- Both bill-generation paths consume THIS function, so the two paths can never
-- disagree about a learner's schedule:
--   - admission_account_transition_with_bills (rebuilt below) calls it directly;
--   - the TypeScript bulk-generate path calls it through the guarded wrapper
--     billing_get_instalment_split.
-- Returns ZERO rows whenever there is nothing (safe) to split: no active plan
-- for the learner's (institution, programme, category, academic year), fewer
-- than 2 lines, a once-per-learner category, or a plan whose lines do not
-- produce strictly positive amounts for this total. Zero rows = caller emits
-- the single yearly bill exactly as today.
--
-- Output column names are deliberately NOT names of any table column read in
-- the body (instalment_no, not sequence_no; matched_plan_id, not plan_id) —
-- a bare reuse would raise 42702 on every call while CREATE succeeds.

CREATE OR REPLACE FUNCTION public.billing_instalment_split_for_learner(
  p_learner_id  uuid,
  p_category_id uuid,
  p_amount      numeric,
  p_anchor_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  instalment_no       integer,
  instalment_count    integer,
  instalment_amount   numeric,
  instalment_due_date date,
  matched_plan_id     uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id  uuid;
  v_total    numeric;
  v_n        integer;
  v_idx      integer := 0;
  v_sum_prev numeric := 0;
  v_amt      numeric;
  v_line     record;
  v_amounts  numeric[] := ARRAY[]::numeric[];
  v_dues     date[]    := ARRAY[]::date[];
BEGIN
  IF p_learner_id IS NULL OR p_category_id IS NULL
     OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  v_total := round(p_amount, 2);

  -- Once-per-learner categories can hold at most ONE live bill per learner
  -- (trg_billing_bills_once_per_learner) — a split batch would be rejected
  -- mid-insert. Never split those; the stricter rule wins.
  IF EXISTS (
    SELECT 1 FROM public.billing_categories bc
    WHERE bc.id = p_category_id AND bc.once_per_learner = true
  ) THEN
    RETURN;
  END IF;

  -- Plan matching: exact grain, active only. The partial unique index
  -- uq_billing_instalment_plans_active_grain guarantees at most one row.
  SELECT bip.id INTO v_plan_id
  FROM public.billing_instalment_plans bip
  JOIN public.learners_profiles lp ON lp.id = p_learner_id
  WHERE bip.is_active = true
    AND bip.institution_id   = lp.institution_id
    AND bip.program_id       = lp.program_id
    AND bip.item_category_id = p_category_id
    AND bip.academic_year_id = lp.academic_year_id
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.billing_instalment_plan_lines l
  WHERE l.plan_id = v_plan_id;

  IF v_n < 2 THEN
    RETURN;  -- a 1-line "plan" is not a split
  END IF;

  -- Size every instalment. Lines 1..n-1 take their own size (fixed amount, or
  -- share_percent of the total rounded to 2dp); the LAST line absorbs rounding
  -- by taking total minus the sum of the earlier lines, so the instalments sum
  -- EXACTLY to the yearly amount. Amounts are accumulated first and emitted
  -- only after every one is validated, so a malformed plan emits NOTHING
  -- rather than a partial schedule.
  FOR v_line IN
    SELECT l.sequence_no, l.share_percent, l.fixed_amount, l.due_date, l.due_offset_days
    FROM public.billing_instalment_plan_lines l
    WHERE l.plan_id = v_plan_id
    ORDER BY l.sequence_no
  LOOP
    v_idx := v_idx + 1;
    IF v_idx < v_n THEN
      v_amt := COALESCE(v_line.fixed_amount,
                        round(v_total * v_line.share_percent / 100.0, 2));
    ELSE
      v_amt := v_total - v_sum_prev;
    END IF;

    IF v_amt IS NULL OR v_amt <= 0 THEN
      RETURN;  -- plan does not fit this amount → refuse to split, single bill
    END IF;

    v_sum_prev := v_sum_prev + v_amt;
    v_amounts  := v_amounts || v_amt;
    v_dues     := v_dues || COALESCE(v_line.due_date,
                                     p_anchor_date + v_line.due_offset_days);
  END LOOP;

  FOR v_idx IN 1 .. v_n LOOP
    instalment_no       := v_idx;
    instalment_count    := v_n;
    instalment_amount   := v_amounts[v_idx];
    instalment_due_date := v_dues[v_idx];
    matched_plan_id     := v_plan_id;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date) IS
  'INTERNAL split engine — single source of truth for instalment arithmetic. '
  'Returns zero rows whenever a split is not configured or not safe, which '
  'callers must treat as "emit the single yearly bill, unchanged". Not '
  'callable by end users; reach it through billing_get_instalment_split.';

-- Internal engine: callable only from other SECURITY DEFINER functions and the
-- service role. Supabase default privileges grant EXECUTE to anon AND
-- authenticated on every new function, so both must be revoked explicitly.
REVOKE ALL ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_instalment_split_for_learner(uuid, uuid, numeric, date)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Guarded wrapper for the TypeScript bulk-generate path
-- ---------------------------------------------------------------------------
-- The TS path (OnboardingService.createBillsFromProfile) cannot read the plan
-- tables directly: an accounts operator without billing.instalment_plans.view
-- would get an RLS-silent zero rows and generate a DIFFERENT schedule than an
-- admin — the classic silent-denial failure. This wrapper is SECURITY DEFINER
-- and gates on the ability to create bills, which is exactly the population
-- whose bill generation must consult plans.

CREATE OR REPLACE FUNCTION public.billing_get_instalment_split(
  p_learner_id  uuid,
  p_category_id uuid,
  p_amount      numeric
)
RETURNS TABLE (
  instalment_no       integer,
  instalment_count    integer,
  instalment_amount   numeric,
  instalment_due_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_super_admin() OR public.is_admin()
    OR public.user_has_permission('billing.schedule.create')
    OR public.user_has_permission('billing.bills.create')
  ) THEN
    RAISE EXCEPTION 'not_authorized: creating bills requires billing.schedule.create or billing.bills.create'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.instalment_no, s.instalment_count, s.instalment_amount, s.instalment_due_date
  FROM public.billing_instalment_split_for_learner(
         p_learner_id, p_category_id, p_amount, CURRENT_DATE) s
  ORDER BY s.instalment_no;
END;
$$;

COMMENT ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric) IS
  'Guarded read of the instalment split engine for the TypeScript bill '
  'generation path. Zero rows = no split configured; caller emits the single '
  'yearly bill exactly as before.';

REVOKE ALL ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_get_instalment_split(uuid, uuid, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Bill generation consults the engine — admission_account_transition_with_bills
-- ---------------------------------------------------------------------------
-- Rebuilt from 20260725_account_transition_bill_hostellers_core_fees.sql (the
-- newest file-based definition — see the APPLY-TIME CHECKLIST at the top).
-- The ONLY behavioural change is inside the bill-generation loop: each fee
-- item first asks the split engine; N returned rows insert N instalment bills
-- (amounts summing exactly to the item amount, each with its own due date);
-- zero rows insert the single yearly bill EXACTLY as before. The result JSON
-- gains one additive key, bills_split_by_instalment_plan.

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
    v_split             record;
    v_split_rows        integer;
    v_item              jsonb;
    v_due_date          date;
    v_caller            uuid := auth.uid();
    v_existing_result   jsonb;
    v_pending_event_id  uuid;
    v_result            jsonb;
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

    -- ---- Fee resolution (auto-resolve for legacy with empty fees) ----
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

    -- Generate bills (idempotent — all-or-nothing: skips if ANY bill exists).
    -- Hostellers are NOT skipped; hostel/mess/transport CATEGORIES are skipped
    -- for everyone, because those belong to Campus Living and TMS respectively
    -- (see 20260725_account_transition_bill_hostellers_core_fees.sql).
    SELECT count(*) INTO v_bills_existing
      FROM public.billing_student_bills
     WHERE student_id = p_learner_id;

    IF v_bills_existing = 0 THEN
        v_due_date := (now() + interval '30 days')::date;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_fee_items)
        LOOP
            IF (v_item->>'amount')::numeric > 0 THEN
                -- Category ownership guard. An item with no resolvable category
                -- is billed (unchanged behaviour) — only a POSITIVE match on a
                -- foreign-module kind is skipped, so an unmapped fee is never
                -- silently dropped.
                IF EXISTS (
                    SELECT 1
                      FROM public.billing_categories bc
                     WHERE bc.id = NULLIF(v_item->>'category_id','')::uuid
                       AND bc.kind IN ('hostel', 'mess', 'transport')
                ) THEN
                    v_bills_skipped := v_bills_skipped + 1;
                    CONTINUE;
                END IF;

                -- Instalment expansion — DORMANT until an active plan matches
                -- this learner's (institution, programme, category, academic
                -- year). The engine returns zero rows for no plan, a 1-line
                -- plan, a once-per-learner category, or a plan that does not
                -- fit this amount; zero rows fall through to the single-bill
                -- insert below, byte for byte today's behaviour. The offset
                -- anchor is the transition date itself (now()), not the
                -- 30-day yearly due date.
                v_split_rows := 0;
                FOR v_split IN
                    SELECT s.instalment_no, s.instalment_count,
                           s.instalment_amount, s.instalment_due_date
                      FROM public.billing_instalment_split_for_learner(
                             p_learner_id,
                             NULLIF(v_item->>'category_id','')::uuid,
                             (v_item->>'amount')::numeric,
                             now()::date) s
                     ORDER BY s.instalment_no
                LOOP
                    INSERT INTO public.billing_student_bills (
                        student_id, institution_id, item_category_id,
                        bill_description, due_date, quantity,
                        unit_amount, total_amount, tax_amount, final_amount,
                        balance_amount, status, remarks, created_by
                    ) VALUES (
                        p_learner_id,
                        v_lead.institution_id,
                        NULLIF(v_item->>'category_id','')::uuid,
                        COALESCE(v_item->>'category_name','Fee Item')
                            || ' — Instalment ' || v_split.instalment_no
                            || '/' || v_split.instalment_count,
                        v_split.instalment_due_date,
                        1,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        0,
                        v_split.instalment_amount,
                        v_split.instalment_amount,
                        'unpaid',
                        'Onboarding bill — auto-generated via account transition RPC (instalment '
                            || v_split.instalment_no || '/' || v_split.instalment_count
                            || ' per instalment plan)',
                        v_caller
                    );
                    v_bills_inserted := v_bills_inserted + 1;
                    v_split_rows := v_split_rows + 1;
                END LOOP;

                IF v_split_rows > 0 THEN
                    v_items_split := v_items_split + 1;
                    CONTINUE;
                END IF;

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
        'bills_skipped_foreign_module', v_bills_skipped,
        'bills_split_by_instalment_plan', v_items_split,
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

-- Re-assert the ACL in the same file as the CREATE OR REPLACE (house rule):
-- the live grants (from 20260605191101) are anon revoked, authenticated
-- granted — restated here, not widened.
REVOKE ALL ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_account_transition_with_bills(uuid, jsonb, jsonb, uuid, text)
  TO authenticated, service_role;
