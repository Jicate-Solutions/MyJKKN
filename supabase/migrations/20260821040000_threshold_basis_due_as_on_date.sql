-- =============================================================================
-- 20260821040000_threshold_basis_due_as_on_date.sql
--
-- THE FEE THRESHOLD MEASURES WHAT IS DUE, NOT WHAT IS BILLED.
-- Director ruling 2026-08-11 (evening): "the threshold should consider 60
-- percent of the due to be paid instead of the bill generated."
--
-- WHY. The old paid_pct divided by EVERYTHING billed to date — all years, all
-- fee kinds pooled. Measured on production 2026-08-11: A&S 2026-27 freshers had
-- paid ~21% of billed while the gate demanded 60%; the entire ₹34,000 year bill
-- falls due ~30 days after admission, so families on normal instalment
-- behaviour could never cross it. 903 paying learners (₹1.42 crore of receipts)
-- were invisible to attendance as a result. A bill whose due date has not
-- arrived is not money a learner is behind on.
--
-- WHAT THIS SHIPS.
--   1. admission_statuses.threshold_basis — per-status choice, editable in the
--      Stages & Statuses UI (?tab=learner):
--        'billed_to_date'           legacy behaviour (all non-application bills)
--        'due_to_date'              bills whose due_date has arrived (NEW DEFAULT)
--        'due_to_date_current_year' due bills of the academic year containing
--                                   today (academic_years.start_date/end_date;
--                                   there is no is_current flag on that table)
--   2. vw_learner_payment_progress recomputed:
--        · paid_pct now = due-as-on-date basis (the platform default)
--        · three explicit pct columns appended, one per basis
--        · CANCELLED bills excluded everywhere (defect found 2026-08-11: only
--          'superseded' was excluded, so 143 cancelled bills carrying ₹22.31
--          lakh dragged real learners' percentages down — kin of BUG-005176)
--      CREATE OR REPLACE VIEW keeps the original 9 columns in position; new
--      columns are APPENDED (Postgres forbids reordering).
--   3. evaluate_learner_status_after_payment picks the pct by the target
--      status row's threshold_basis; history rows record which basis fired.
--
-- DELIBERATELY NOT TOUCHED: fn_activate_learner_from_onboarding (records the
-- legacy pct in history only — recording, not enforcement) and the fee ladder's
-- numbers themselves (30/60 stay as configured; only their meaning of "%" moves
-- to due-as-on-date).
--
-- ⚠️ NO BEGIN/COMMIT IN THIS FILE, deliberately: the apply path wraps it in one
-- transaction, and an inner COMMIT would defeat a BEGIN..ROLLBACK rehearsal
-- (feedback_inner_commit_defeats_your_rollback_wrapper).
-- =============================================================================

-- §0 GUARD — refuse to run against a database this file does not recognise.
DO $guard$
BEGIN
  IF to_regclass('public.vw_learner_payment_progress') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: vw_learner_payment_progress missing — wrong database?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'evaluate_learner_status_after_payment') THEN
    RAISE EXCEPTION 'REFUSING: evaluate_learner_status_after_payment missing — wrong database?';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'admission_statuses' AND column_name = 'threshold_basis') THEN
    RAISE EXCEPTION 'REFUSING: threshold_basis already exists — this migration already ran.';
  END IF;
END
$guard$;

-- §1 The per-status setting. NOT NULL DEFAULT backfills the 15 existing rows.
ALTER TABLE public.admission_statuses
  ADD COLUMN threshold_basis text NOT NULL DEFAULT 'due_to_date'
  CONSTRAINT chk_threshold_basis
  CHECK (threshold_basis IN ('billed_to_date','due_to_date','due_to_date_current_year'));

COMMENT ON COLUMN public.admission_statuses.threshold_basis IS
  'What fee_paid_threshold_percent is measured against: billed_to_date (legacy: all non-application bills), due_to_date (default: bills whose due_date has arrived), due_to_date_current_year (due bills of the academic year containing today).';

-- §2 The view. Original 9 columns keep name/type/position; paid_pct switches to
-- the due basis; cancelled bills excluded everywhere; new columns appended.
CREATE OR REPLACE VIEW public.vw_learner_payment_progress
WITH (security_invoker = true) AS
SELECT
  lp.id AS learner_id,
  lp.institution_id,
  lp.lifecycle_status,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee'), 0) AS countable_paid,
  -- paid_pct: DUE-AS-ON-DATE basis (platform default per 2026-08-11 ruling).
  -- Every existing reader of paid_pct (promotion RPC, onboarding approval,
  -- campus-living upgrade gates) follows this definition from apply-time on.
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(
      100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE)
    , 2)
  END AS paid_pct,
  BOOL_OR(bc.kind = 'application_fee' AND b.status = 'paid') AS application_fee_paid,
  COUNT(b.id) AS total_bills,
  COUNT(b.id) FILTER (WHERE b.status = 'paid') AS paid_bills,
  -- appended: the three bases, explicit
  CASE
    WHEN COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind <> 'application_fee'), 0) = 0 THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount) FILTER (WHERE bc.kind <> 'application_fee')
      / SUM(b.final_amount)                    FILTER (WHERE bc.kind <> 'application_fee'), 2)
  END AS pct_billed_to_date,
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 2)
  END AS pct_due_to_date,
  CASE
    WHEN COALESCE(SUM(b.final_amount)
                  FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                          AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) = 0
      THEN 0
    ELSE ROUND(100.0
      * SUM(b.final_amount - b.balance_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                  AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE)
      / SUM(b.final_amount)
          FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                  AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 2)
  END AS pct_due_current_year,
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) AS due_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) AS due_paid
FROM public.learners_profiles lp
LEFT JOIN public.billing_student_bills b
  ON b.student_id = lp.id AND b.status NOT IN ('superseded', 'cancelled')
LEFT JOIN public.billing_categories bc
  ON bc.id = b.item_category_id
LEFT JOIN public.academic_years ayr
  ON ayr.id = b.academic_year_id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress. paid_pct = DUE-AS-ON-DATE basis (2026-08-11 ruling): paid ÷ billed over non-application bills whose due_date has arrived. pct_billed_to_date / pct_due_to_date / pct_due_current_year expose all three bases; admission_statuses.threshold_basis picks per status. Cancelled AND superseded bills excluded (cancelled-inclusion defect fixed 2026-08-11). security_invoker=true so RLS applies.';

-- §3 The promotion engine, basis-aware. Body is the live production definition
-- (md5 9d3b14f7f5a1c11b00c5b3792645a113, snapshotted 2026-08-11 19:41 IST)
-- with five surgical edits; nothing else changed.
CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status        lifecycle_status;
  v_paid_pct              numeric;
  v_pct_billed            numeric;
  v_pct_due               numeric;
  v_pct_due_cy            numeric;
  v_basis                 text;
  v_used_pct              numeric;
  v_app_paid              boolean;
  v_universals_paid       boolean;
  v_gate_bills            integer := 0;
  v_gate_paid             integer := 0;
  v_threshold             numeric;
  v_target_code           text;
  v_updated               integer := 0;
  v_universal_target      text;
  v_promoted_to_universal boolean := false;
  v_promoted_to_threshold boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  -- Promotion only. This function never demotes, so it is safe to call on any
  -- learner at any time — which is what makes the nightly sweep and the manual
  -- re-evaluate action safe.
  IF v_current_status::text NOT IN ('account', 'reserved') THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  SELECT v.pct_billed_to_date, v.pct_due_to_date, v.pct_due_current_year
    INTO v_pct_billed, v_pct_due, v_pct_due_cy
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;
  v_pct_billed := COALESCE(v_pct_billed, 0);
  v_pct_due    := COALESCE(v_pct_due, 0);
  v_pct_due_cy := COALESCE(v_pct_due_cy, 0);
  -- Platform default basis: due-as-on-date (Director ruling 2026-08-11).
  v_paid_pct := v_pct_due;

  SELECT
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')
        AND (b.status::text = 'paid'
             OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0
             -- A zero-amount bill with nothing outstanding is settled by
             -- definition. Without this it satisfies neither branch above and
             -- blocks the gate forever, however much the learner pays elsewhere.
             OR (b.final_amount = 0 AND COALESCE(b.balance_amount, 0) = 0))),
    COALESCE(bool_or(bc.kind = 'application_fee' AND b.status::text = 'paid'), false),
    COALESCE(bool_and(b.status::text = 'paid') FILTER (WHERE bc.kind = 'university_fee'), false)
  INTO v_gate_bills, v_gate_paid, v_app_paid, v_universals_paid
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND b.status::text <> 'superseded';

  IF v_current_status::text = 'account' AND v_gate_bills > 0 AND v_gate_paid = v_gate_bills THEN
    SELECT s.code INTO v_universal_target
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.auto_promote_when_universal_paid = true
    LIMIT 1;

    IF v_universal_target IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_universal_target::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text = 'account';

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, 'account'::lifecycle_status, v_universal_target::lifecycle_status,
           'auto_universal_paid', v_paid_pct, NULL, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'application_fee_paid', v_app_paid,
                              'university_fee_paid', v_universals_paid,
                              'gate_bills', v_gate_bills,
                              'gate_paid', v_gate_paid,
                              'gate_rule', 'partial'));
        v_current_status := v_universal_target::lifecycle_status;
        v_promoted_to_universal := true;
      END IF;
    END IF;
  END IF;

  -- Stage B. gates_login = false deliberately excludes 'active' (60%):
  -- granting a login is never automatic. auto_promote_when_universal_paid =
  -- false excludes 'reserved', which Stage A owns.
  IF v_current_status::text IN ('account', 'reserved') THEN
    SELECT s.code, s.fee_paid_threshold_percent, s.threshold_basis,
           CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN v_pct_billed
             WHEN 'due_to_date_current_year' THEN v_pct_due_cy
             ELSE                                 v_pct_due
           END
      INTO v_target_code, v_threshold, v_basis, v_used_pct
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.fee_paid_threshold_percent IS NOT NULL
      AND s.gates_login = false
      AND s.auto_promote_when_universal_paid = false
      AND (CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN v_pct_billed
             WHEN 'due_to_date_current_year' THEN v_pct_due_cy
             ELSE                                 v_pct_due
           END) >= s.fee_paid_threshold_percent
    ORDER BY s.fee_paid_threshold_percent DESC
    LIMIT 1;

    IF v_target_code IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_target_code::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text IN ('account', 'reserved');

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, v_current_status, v_target_code::lifecycle_status,
           'auto_threshold', v_used_pct, v_threshold, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'threshold_basis', v_basis,
                              'cascaded_from_universal', v_promoted_to_universal));
        v_promoted_to_threshold := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', (v_promoted_to_universal OR v_promoted_to_threshold),
    'promoted_to_universal', v_promoted_to_universal,
    'promoted_to_threshold', v_promoted_to_threshold,
    'final_status', v_current_status::text,
    'paid_pct', v_paid_pct,
    'pct_billed_to_date', v_pct_billed,
    'pct_due_to_date', v_pct_due,
    'pct_due_current_year', v_pct_due_cy,
    'threshold_basis', v_basis,
    'application_fee_paid', v_app_paid,
    'university_fee_paid', v_universals_paid,
    'gate_bills', v_gate_bills,
    'gate_paid', v_gate_paid,
    'threshold', v_threshold
  );
END;
$function$
;

-- §4 Grant hygiene (CREATE OR REPLACE preserves ACLs, but re-assert per repo
-- rule: Supabase default privileges hand anon EXECUTE on new functions).
REVOKE EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) TO authenticated, service_role;

-- §5 View grant hygiene. security_invoker=true already makes RLS apply, but the
-- CI anon-lock gate (rightly) demands the explicit revoke as well: without it a
-- future edit dropping security_invoker would silently serve rows to anon.
REVOKE ALL ON TABLE public.vw_learner_payment_progress FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_learner_payment_progress TO authenticated, service_role;
