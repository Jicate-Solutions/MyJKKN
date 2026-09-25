-- =============================================================================
-- 20260925160000_onboarding_progress_program_rules.sql
--
-- The View Progress dialog showed ONE bar: the global 30% floor. But every
-- program's fee structure carries its own promotion rules (2026-08-21 schedule
-- feature), copied onto each bill as billing_bill_instalments.promotes_to_status_code
-- or read through billing_student_bills.fee_structure_item_id:
--   e.g. B.Ed Tamil MQ-DS: tuition 30,000 split 50/50, instalment 1 -> admitted,
--        no Application / University fee at all.
-- All 142 account + reserved learners have such rule rows. The engine
-- (evaluate_learner_status_after_payment) promotes on WHICHEVER comes first:
--   Stage A0  fn_learner_status_apply_item_rules - every rule row naming a
--             status is settled
--   Stage A   universal gate (account -> reserved)
--   Stage B   pooled threshold floor (30% of billed, 20260925150000)
--
-- ADDED to fn_onboarding_payment_progress (all existing columns unchanged):
--   rule_lines      jsonb    one entry per rule row, computed with the SAME
--                            waterfall / settled predicate as
--                            fn_learner_status_apply_item_rules:
--                            {target, category, label, seq, of, amount, paid,
--                             settled, due_date}
--   rule_to_admit   numeric  rupees still needed to settle every 'admitted'
--                            rule row; NULL when the learner has none
--   gate_in_program boolean  the learner has Application/University fee bills
--                            or a rule row targeting 'reserved'
-- blocked_reason gains 'no_gate_in_program' (account learner whose program has
-- no Application / University fee - goes straight to admitted), and the
-- '*_met_stuck' codes now also fire when the program rule itself is satisfied.
--
-- DROP + CREATE (RETURNS TABLE changes); grants re-asserted at the end.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_onboarding_payment_progress(uuid[]);

CREATE FUNCTION public.fn_onboarding_payment_progress(p_learner_ids uuid[])
RETURNS TABLE(
  learner_id uuid, target_code text, target_label text,
  threshold_pct numeric, threshold_basis text, achieved_pct numeric,
  basis_billed numeric, basis_paid numeric, basis_balance numeric,
  total_billed numeric, total_paid numeric, total_balance numeric,
  amount_to_threshold numeric, meets_threshold boolean, has_basis_due boolean,
  next_due_date date, next_due_amount numeric,
  instalments_total integer, instalments_settled integer,
  -- ADDED 2026-09-25
  lifecycle_status text,
  app_bills integer, app_billed numeric, app_paid numeric,
  uni_bills integer, uni_billed numeric, uni_paid numeric,
  gate_bills integer, gate_settled integer,
  pct_billed_to_date numeric,
  blocked_reason text,
  -- ADDED 2026-09-25 (program rules)
  rule_lines jsonb,
  rule_to_admit numeric,
  gate_in_program boolean
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

  v_perm := (
    COALESCE(public.user_has_permission('learners.admissions.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.profiles.view'::text), false)
    OR COALESCE(public.user_has_permission('learners.view'::text), false)
  );

  RETURN QUERY
  WITH visible AS (
    SELECT lp.id, lp.institution_id, lp.lifecycle_status::text AS status
    FROM public.learners_profiles lp
    WHERE lp.id = ANY (p_learner_ids)
      AND (
        v_is_super
        OR (v_perm AND public.role_has_institution_access(lp.institution_id))
        OR lp.student_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
        OR lp.college_email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
      )
  ),
  -- The waterfall, inline. Not read from vw_bill_instalment_state because that
  -- view is security_invoker: inside this SECURITY DEFINER function it would be
  -- filtered by whoever is calling, so two admins could see different schedules
  -- for the same learner.
  tranche AS (
    SELECT
      b.student_id,
      i.due_date,
      i.amount,
      (LEAST(
         GREATEST(
           GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
           - COALESCE(SUM(i.amount) OVER (
               PARTITION BY i.bill_id ORDER BY i.due_date, i.sequence_no
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
           0),
         i.amount) >= i.amount) AS is_settled
    FROM public.billing_bill_instalments i
    JOIN public.billing_student_bills b ON b.id = i.bill_id
    WHERE b.student_id IN (SELECT id FROM visible)
      AND b.status NOT IN ('cancelled', 'superseded')
  ),
  sched AS (
    SELECT
      t.student_id,
      MIN(t.due_date) FILTER (WHERE NOT t.is_settled) AS next_due,
      COUNT(*)::int                                    AS n_total,
      COUNT(*) FILTER (WHERE t.is_settled)::int        AS n_settled
    FROM tranche t
    GROUP BY t.student_id
  ),
  next_amt AS (
    SELECT t.student_id, SUM(t.amount) AS amt
    FROM tranche t
    JOIN sched s2 ON s2.student_id = t.student_id AND s2.next_due = t.due_date
    WHERE NOT t.is_settled
    GROUP BY t.student_id
  ),
  -- Engine Stage A, per fee. The "settled" predicate is the engine's, verbatim.
  gate AS (
    SELECT
      b.student_id,
      COUNT(*) FILTER (WHERE bc.kind = 'application_fee')::int AS n_app,
      COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind = 'application_fee'), 0) AS app_b,
      COALESCE(SUM(GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)))
               FILTER (WHERE bc.kind = 'application_fee'), 0) AS app_p,
      COUNT(*) FILTER (WHERE bc.kind = 'university_fee')::int AS n_uni,
      COALESCE(SUM(b.final_amount) FILTER (WHERE bc.kind = 'university_fee'), 0) AS uni_b,
      COALESCE(SUM(GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)))
               FILTER (WHERE bc.kind = 'university_fee'), 0) AS uni_p,
      COUNT(*) FILTER (WHERE
          b.status::text = 'paid'
          OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0
          OR (b.final_amount = 0 AND COALESCE(b.balance_amount, 0) = 0))::int AS n_settled
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE b.student_id IN (SELECT id FROM visible)
      AND bc.kind IN ('application_fee', 'university_fee')
      AND b.status NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id
  ),
  -- Program rules, exactly as fn_learner_status_apply_item_rules sees them.
  rule_tranche AS (
    SELECT
      b.student_id,
      i.promotes_to_status_code AS target,
      bc.category_name::text AS category,
      i.label,
      i.sequence_no AS seq,
      (COUNT(*) OVER (PARTITION BY i.bill_id))::int AS n_of,
      i.amount,
      i.due_date,
      LEAST(
        GREATEST(
          GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
          - COALESCE(SUM(i.amount) OVER (
              PARTITION BY i.bill_id ORDER BY i.due_date, i.sequence_no
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
          0),
        i.amount) AS paid
    FROM public.billing_bill_instalments i
    JOIN public.billing_student_bills b ON b.id = i.bill_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE b.student_id IN (SELECT id FROM visible)
      AND b.status::text NOT IN ('cancelled', 'superseded')
  ),
  rule_unscheduled AS (
    SELECT
      b.student_id,
      fsi.promotes_to_status_code AS target,
      bc.category_name::text AS category,
      NULL::text AS label,
      1 AS seq,
      1 AS n_of,
      b.final_amount AS amount,
      b.due_date,
      GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)) AS paid,
      (COALESCE(b.status::text = 'paid', false)
       OR COALESCE(b.balance_amount, b.final_amount) <= 0) AS settled
    FROM public.billing_student_bills b
    JOIN public.admission_fee_structure_items fsi ON fsi.id = b.fee_structure_item_id
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE b.student_id IN (SELECT id FROM visible)
      AND b.status::text NOT IN ('cancelled', 'superseded')
      AND fsi.promotes_to_status_code IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.billing_bill_instalments i WHERE i.bill_id = b.id)
  ),
  rule_rows AS (
    SELECT student_id, target, category, label, seq, n_of, amount, due_date, paid,
           (paid >= amount) AS settled
    FROM rule_tranche WHERE target IS NOT NULL
    UNION ALL
    SELECT student_id, target, category, label, seq, n_of, amount, due_date, paid, settled
    FROM rule_unscheduled
  ),
  rules AS (
    SELECT
      r.student_id,
      jsonb_agg(jsonb_build_object(
        'target', r.target, 'category', r.category, 'label', r.label,
        'seq', r.seq, 'of', r.n_of, 'amount', r.amount, 'paid', r.paid,
        'settled', r.settled, 'due_date', r.due_date)
        ORDER BY r.target, r.due_date, r.category, r.seq) AS lines,
      bool_or(r.target = 'reserved') AS has_reserved,
      COALESCE(bool_and(r.settled) FILTER (WHERE r.target = 'reserved'), false) AS reserved_met,
      bool_or(r.target = 'admitted') AS has_admitted,
      COALESCE(bool_and(r.settled) FILTER (WHERE r.target = 'admitted'), false) AS admitted_met,
      SUM(GREATEST(0, r.amount - r.paid)) FILTER (WHERE r.target = 'admitted') AS to_admit
    FROM rule_rows r
    GROUP BY r.student_id
  ),
  progress AS (
    SELECT
      vis.id AS lid,
      vis.status,
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
      v.countable_paid   AS t_paid,
      v.pct_billed_to_date AS pct_billed
    FROM visible vis
    JOIN public.vw_learner_payment_progress v ON v.learner_id = vis.id
  ),
  judged AS (
    SELECT
      p.*,
      COALESCE(g.n_app, 0) + COALESCE(g.n_uni, 0) AS g_bills,
      COALESCE(g.n_settled, 0)                    AS g_settled,
      (v_threshold IS NOT NULL AND COALESCE(p.b_billed, 0) > 0
        AND COALESCE(p.pct, 0) >= v_threshold)    AS meets,
      ru.lines                                    AS r_lines,
      COALESCE(ru.has_reserved, false)            AS r_has_reserved,
      COALESCE(ru.reserved_met, false)            AS r_reserved_met,
      COALESCE(ru.has_admitted, false)            AS r_has_admitted,
      COALESCE(ru.admitted_met, false)            AS r_admitted_met,
      ru.to_admit                                 AS r_to_admit
    FROM progress p
    LEFT JOIN gate g ON g.student_id = p.lid
    LEFT JOIN rules ru ON ru.student_id = p.lid
  )
  SELECT
    j.lid,
    v_target_code,
    v_target_label,
    v_threshold,
    v_basis,
    COALESCE(j.pct, 0),
    COALESCE(j.b_billed, 0),
    COALESCE(j.b_paid, 0),
    COALESCE(j.b_billed, 0) - COALESCE(j.b_paid, 0),
    COALESCE(j.t_billed, 0),
    COALESCE(j.t_paid, 0),
    COALESCE(j.t_billed, 0) - COALESCE(j.t_paid, 0),
    CASE
      WHEN v_threshold IS NULL OR COALESCE(j.b_billed, 0) <= 0 THEN NULL
      ELSE GREATEST(0, CEIL(j.b_billed * v_threshold / 100.0) - COALESCE(j.b_paid, 0))
    END,
    j.meets,
    (COALESCE(j.b_billed, 0) > 0),
    sc.next_due,
    na.amt,
    COALESCE(sc.n_total, 0),
    COALESCE(sc.n_settled, 0),
    j.status,
    COALESCE(g.n_app, 0), COALESCE(g.app_b, 0), COALESCE(g.app_p, 0),
    COALESCE(g.n_uni, 0), COALESCE(g.uni_b, 0), COALESCE(g.uni_p, 0),
    j.g_bills,
    j.g_settled,
    COALESCE(j.pct_billed, 0),
    CASE
      WHEN j.status NOT IN ('account', 'reserved')            THEN 'none'
      -- Either admit path satisfied: the pooled floor or the program rule.
      WHEN j.meets OR (j.r_has_admitted AND j.r_admitted_met) THEN 'threshold_met_stuck'
      WHEN j.status = 'account' AND j.r_has_reserved AND j.r_reserved_met THEN 'gate_met_stuck'
      -- No App / Univ fee billed and no rule naming 'reserved': this program
      -- goes account -> admitted directly.
      WHEN j.status = 'account' AND j.g_bills = 0 AND NOT j.r_has_reserved THEN 'no_gate_in_program'
      WHEN j.status = 'account' AND j.g_bills = 0             THEN 'gate_no_bills'
      WHEN j.status = 'account' AND j.g_settled < j.g_bills   THEN 'gate_unpaid'
      WHEN j.status = 'account'                               THEN 'gate_met_stuck'
      WHEN COALESCE(j.b_billed, 0) <= 0 AND NOT j.r_has_admitted THEN 'nothing_due'
      ELSE                                                         'below_threshold'
    END,
    COALESCE(j.r_lines, '[]'::jsonb),
    j.r_to_admit,
    (j.g_bills > 0 OR j.r_has_reserved)
  FROM judged j
  LEFT JOIN gate     g  ON g.student_id  = j.lid
  LEFT JOIN sched    sc ON sc.student_id = j.lid
  LEFT JOIN next_amt na ON na.student_id = j.lid;
END;
$function$;

COMMENT ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) IS
  'Fee position for the Awaiting Payment tier (account + reserved). Percentages come from vw_learner_payment_progress so the number on screen and the number in the promotion gate cannot drift. Returns the next unsettled instalment (2026-08-22) and, since 2026-09-25, the Application/University fee gate per fee plus blocked_reason: the first pipeline stage (account->reserved, then reserved->admitted) that is holding the learner back. Since 20260925160000 also the program fee-structure rules (rule_lines, rule_to_admit, gate_in_program), evaluated exactly as fn_learner_status_apply_item_rules does.';

REVOKE ALL ON FUNCTION public.fn_onboarding_payment_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_onboarding_payment_progress(uuid[])
  TO authenticated, service_role;
