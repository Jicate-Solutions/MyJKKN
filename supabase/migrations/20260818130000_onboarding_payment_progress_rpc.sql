-- =============================================================================
-- 20260818130000_onboarding_payment_progress_rpc.sql
--
-- THE "AWAITING PAYMENT" TAB SHOWS WHY EACH LEARNER IS WAITING.
--
-- /learners/onboarding groups pre-active learners into tiers. The two terminal
-- tiers are decided by lifecycle status, not by field data:
--   ready_to_activate = 4/4 fields + 'admitted'  -> actionable now
--   awaiting_payment  = 4/4 fields + 'reserved'  -> blocked ONLY on fees
--
-- The awaiting_payment tier therefore lists 207 learners whose sole remaining
-- blocker is money, while showing nothing whatsoever about that money — the
-- table's "Missing Fields" column is always an em-dash there and "Completion"
-- is always 4/4. This migration ships the data behind the payment columns that
-- replace those two.
--
-- WHAT GATES THE PROMOTION (reserved -> admitted), for reference:
--   admission_statuses.admitted.fee_paid_threshold_percent = 30
--   admission_statuses.admitted.threshold_basis            = 'due_to_date'
-- i.e. 30% of the non-application bills WHOSE DUE DATE HAS ARRIVED, per the
-- Director ruling of 2026-08-11 (see 20260821040000_threshold_basis_due_as_on_date).
-- Showing pct_billed_to_date instead would print a number that disagrees with
-- evaluate_learner_status_after_payment — the engine that actually promotes.
--
-- TWO THINGS SHIP HERE.
--
-- SECTION 1: vw_learner_payment_progress gains due_cy_billed / due_cy_paid.
--    The view already exposes billed/paid AMOUNTS for two of the three bases
--    (countable_* for billed_to_date, due_* for due_to_date) but only a PERCENT
--    for the third. Without the amounts, "rupees still needed to cross the
--    threshold" could not be computed for a 'due_to_date_current_year' status
--    without re-deriving the basis predicate outside the view — the exact drift
--    this view exists to prevent. Columns are APPENDED; Postgres forbids
--    reordering under CREATE OR REPLACE VIEW and every existing column keeps
--    its name, type and position.
--
-- SECTION 2: fn_onboarding_payment_progress(uuid[]) — per-learner position.
--    Two reasons it is a function and not a view read, in order of weight.
--
--    (a) ONE PLACE DECIDES THE BASIS. Which percent counts, which billed/paid
--        pair pairs with it, and how many rupees short a learner is are all
--        driven by admission_statuses.threshold_basis. That switch already
--        exists inside evaluate_learner_status_after_payment — the engine that
--        actually promotes. Re-implementing it in TypeScript would put the
--        number on screen and the number in the gate on separate code paths,
--        and this module has been bitten by exactly that drift before (the
--        is_profile_complete flag, the 2026-08-11 promotion outage). The RPC
--        resolves target status, threshold and basis once, server-side, from
--        the same rows the engine reads.
--
--    (b) IT DECOUPLES THIS QUEUE FROM BILLING PERMISSIONS. The view is
--        security_invoker, so billing_student_bills' `bills_select_scoped`
--        policy applies, which demands 'billing.bills.view' OR
--        'billing.schedule.view'. Measured 2026-08-18: 0 of 7,204 non-super-admin
--        users hold learner-view without one of those, so RLS WOULD work today —
--        this is not fixing a live break. It is removing a dependency that fails
--        SILENTLY if it ever breaks: RLS returns zero rows rather than erroring,
--        so tightening the (currently near-universal) billing.schedule.view grant
--        would turn every row into "0 billed, 0% paid" with nothing in the logs.
--
--    SECURITY DEFINER is therefore deliberate but narrow. The LEARNER visibility
--    predicate is re-applied by hand, copied byte-for-byte from
--    learners_profiles_select_policy — the same discipline
--    fn_activate_learner_from_onboarding follows for the update policy. It
--    exposes only aggregate totals for learners the caller can already see
--    listed: never bill rows, never another learner's figures.
-- =============================================================================

-- SECTION 0: GUARD — refuse to run against a database this file does not know.
DO $guard$
BEGIN
  IF to_regclass('public.vw_learner_payment_progress') IS NULL THEN
    RAISE EXCEPTION 'REFUSING: vw_learner_payment_progress missing — wrong database?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'admission_statuses' AND column_name = 'threshold_basis') THEN
    RAISE EXCEPTION 'REFUSING: admission_statuses.threshold_basis missing — apply 20260821040000 first.';
  END IF;
END
$guard$;

-- =============================================================================
-- SECTION 1: append the current-year basis AMOUNTS alongside its existing
--            percent. Body is the live production definition plus two columns.
-- =============================================================================
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
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE), 0) AS due_paid,
  -- appended 2026-08-18: amounts for the current-year basis, so every basis in
  -- admission_statuses.threshold_basis can answer "how much more, in rupees?".
  COALESCE(SUM(b.final_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                   AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) AS due_cy_billed,
  COALESCE(SUM(b.final_amount - b.balance_amount)
           FILTER (WHERE bc.kind <> 'application_fee' AND b.due_date <= CURRENT_DATE
                   AND ayr.start_date <= CURRENT_DATE AND ayr.end_date >= CURRENT_DATE), 0) AS due_cy_paid
FROM public.learners_profiles lp
LEFT JOIN public.billing_student_bills b
  ON b.student_id = lp.id AND b.status NOT IN ('superseded', 'cancelled')
LEFT JOIN public.billing_categories bc
  ON bc.id = b.item_category_id
LEFT JOIN public.academic_years ayr
  ON ayr.id = b.academic_year_id
GROUP BY lp.id, lp.institution_id, lp.lifecycle_status;

COMMENT ON VIEW public.vw_learner_payment_progress IS
  'Per-learner payment progress. paid_pct = DUE-AS-ON-DATE basis (2026-08-11 ruling): paid over billed across non-application bills whose due_date has arrived. pct_billed_to_date / pct_due_to_date / pct_due_current_year expose all three bases, each with a matching amount pair (countable_*, due_*, due_cy_*); admission_statuses.threshold_basis picks per status. Cancelled AND superseded bills excluded. security_invoker=true so RLS applies.';

-- =============================================================================
-- SECTION 2: the RPC.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_onboarding_payment_progress(p_learner_ids uuid[])
RETURNS TABLE (
  learner_id          uuid,
  target_code         text,
  target_label        text,
  threshold_pct       numeric,
  threshold_basis     text,
  achieved_pct        numeric,
  basis_billed        numeric,
  basis_paid          numeric,
  basis_balance       numeric,
  total_billed        numeric,
  total_paid          numeric,
  total_balance       numeric,
  amount_to_threshold numeric,
  meets_threshold     boolean,
  has_basis_due       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_code   text;
  v_target_label  text;
  v_threshold     numeric;
  v_basis         text;
  v_is_super      boolean := COALESCE(public.is_super_admin(), false);
  v_perm          boolean;
BEGIN
  IF p_learner_ids IS NULL OR array_length(p_learner_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- The promotion target for a 'reserved' learner. Resolved with the SAME
  -- predicate evaluate_learner_status_after_payment uses to find a Stage B
  -- target: a threshold-bearing status that neither gates a login ('active',
  -- 60% — never automatic) nor is the universal-paid target ('reserved' itself).
  -- ORDER BY ASC, not DESC: the engine picks the highest threshold ALREADY MET,
  -- but this screen answers "which bar is next?", which is the lowest one.
  SELECT s.code, s.label, s.fee_paid_threshold_percent, s.threshold_basis
    INTO v_target_code, v_target_label, v_threshold, v_basis
  FROM public.admission_statuses s
  WHERE s.scope = 'learner'
    AND s.is_active = true
    AND s.fee_paid_threshold_percent IS NOT NULL
    AND s.gates_login = false
    AND s.auto_promote_when_universal_paid = false
  ORDER BY s.fee_paid_threshold_percent ASC
  LIMIT 1;

  v_basis := COALESCE(v_basis, 'due_to_date');

  -- One permission probe for the whole batch rather than one per learner:
  -- user_has_permission() is the hot path in every RLS policy on this database
  -- and calling it 200x per page render is the shape that produces 57014.
  -- Institution access still varies per row and is checked per row below.
  v_perm := (
    COALESCE(public.user_has_permission('learners.admissions.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.profiles.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.view'::text), false)
  );

  RETURN QUERY
  WITH visible AS (
    -- Byte-for-byte the predicate in learners_profiles_select_policy. DEFINER
    -- bypassed that policy, so it is re-applied here by hand. The self-service
    -- branches are kept so this function is never STRICTER than the policy —
    -- a learner who can see their own row gets their own figures, nobody else's.
    SELECT lp.id, lp.institution_id
    FROM public.learners_profiles lp
    WHERE lp.id = ANY (p_learner_ids)
      AND (
        v_is_super
        OR (v_perm AND public.role_has_institution_access(lp.institution_id))
        OR lp.student_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
        OR lp.college_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
      )
  ),
  progress AS (
    SELECT
      vis.id AS lid,
      -- Basis-aligned pair. The percent is taken from the view rather than
      -- recomputed from the amounts: a 0.01 rounding difference between this
      -- screen and the promotion engine would read as a bug in the gate.
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.pct_billed_to_date
        WHEN 'due_to_date_current_year' THEN v.pct_due_current_year
        ELSE                                 v.pct_due_to_date
      END AS pct,
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.countable_billed
        WHEN 'due_to_date_current_year' THEN v.due_cy_billed
        ELSE                                 v.due_billed
      END AS b_billed,
      CASE v_basis
        WHEN 'billed_to_date'           THEN v.countable_paid
        WHEN 'due_to_date_current_year' THEN v.due_cy_paid
        ELSE                                 v.due_paid
      END AS b_paid,
      v.countable_billed AS t_billed,
      v.countable_paid   AS t_paid
    FROM visible vis
    JOIN public.vw_learner_payment_progress v ON v.learner_id = vis.id
  )
  SELECT
    p.lid,
    v_target_code,
    v_target_label,
    v_threshold,
    v_basis,
    COALESCE(p.pct, 0),
    COALESCE(p.b_billed, 0),
    COALESCE(p.b_paid, 0),
    COALESCE(p.b_billed, 0) - COALESCE(p.b_paid, 0),
    COALESCE(p.t_billed, 0),
    COALESCE(p.t_paid, 0),
    COALESCE(p.t_billed, 0) - COALESCE(p.t_paid, 0),
    -- NULL, not 0, when nothing is due yet or no threshold is configured.
    -- Rendering "0 to admit" for a learner whose first instalment has not come
    -- due would read as "pay nothing and they are in", which is false — they
    -- are waiting on a due date, not on money.
    CASE
      WHEN v_threshold IS NULL OR COALESCE(p.b_billed, 0) <= 0 THEN NULL
      ELSE GREATEST(0, CEIL(p.b_billed * v_threshold / 100.0) - COALESCE(p.b_paid, 0))
    END,
    (v_threshold IS NOT NULL AND COALESCE(p.b_billed, 0) > 0 AND COALESCE(p.pct, 0) >= v_threshold),
    (COALESCE(p.b_billed, 0) > 0)
  FROM progress p;
END;
$function$;

COMMENT ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) IS
  'Per-learner payment position against the configured reserved->admitted fee threshold, for the Awaiting Payment tier of /learners/onboarding. Basis-aware (admission_statuses.threshold_basis). SECURITY DEFINER so bill totals are readable without billing.bills.view, which working this queue does not require; re-applies learners_profiles_select_policy per row so it never widens who can see a learner.';

-- Supabase grants EXECUTE directly to anon, so REVOKE FROM PUBLIC alone is a
-- no-op — this reads billing aggregates and must not be anon-callable.
REVOKE ALL ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) TO service_role;
