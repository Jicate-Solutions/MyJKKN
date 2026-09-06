-- ============================================================================
-- fn_billing_resync_item_schedules — reconnect already-generated bills to the
-- fee-structure item they came from.
--
-- WHY (2026-09-06): billing_student_bills.fee_structure_item_id landed on
-- 2026-08-21 and is the ONLY path from a bill back to its fee item. Every bill
-- generated before that date has it NULL, and three things read through it:
--
--   billing_instalment_split_for_learner()  -> tranches from the item's schedule
--   bbi_sync_bill_due_date()                -> bill.due_date from the next tranche
--   fn_learner_status_apply_item_rules()    -> promotes_to_status_code
--
-- Measured on AY 2026-27 at the time of writing: 8,344 live bills, 47 stamped,
-- 13 with tranches — against 426 split items and 895 configured schedule lines.
-- The configuration was connected to nothing. This RPC connects it, and stays
-- callable so the next structure edit does not need another migration.
--
-- The bill -> item mapping is
--   admission_match_fee_structure_for_learner(learner)  (the 8-dimension match
--   the generator itself uses) + billing_category_id
-- which was verified to yield EXACTLY ONE candidate item per bill across all
-- 4,727 in-scope rows: 0 ambiguous, 0 conflicting with an existing stamp.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It never touches final_amount, balance_amount or status on the bill.
--     That is load-bearing: those are the columns
--     trg_evaluate_status_after_bill_paid and trg_learner_status_on_bill_payment_drop
--     watch, so leaving them alone keeps promotion entirely under this
--     function's control instead of firing the full engine 4,700 times.
--   * It re-shares the bill's OWN final_amount rather than re-pricing from the
--     item. A learner's bill is what they were told they owe; a structure whose
--     price has since moved is reported as an amount mismatch, not silently
--     applied.
--   * It calls fn_learner_status_apply_item_rules (STAGE A0 only), NOT
--     evaluate_learner_status_after_payment. Running the full engine after a
--     resync promotes far more people than the rules name — splitting a bill
--     shrinks "due to date", so STAGE B's pooled threshold suddenly clears.
--     Measured on this cohort: 325 learners via the threshold vs 14 named by
--     the explicit rules. STAGE B keeps working normally on the next real
--     payment; it is just not driven by a backfill.
--
-- Promotion is one-directional by construction and this function adds no way
-- around that: STAGE A0 acts only on 'account'/'reserved', only targets a
-- higher sort_order, and afsis_validate_status_target refuses any status with
-- gates_login = true. Nobody can be demoted and nobody gains portal login.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_billing_resync_item_schedules(
  p_admission_year_ids uuid[],
  p_institution_ids    uuid[]  DEFAULT NULL,
  p_dry_run            boolean DEFAULT true,
  p_apply_status       boolean DEFAULT true,
  p_replace_existing   boolean DEFAULT false,
  p_max_due_date       date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scanned              integer := 0;
  v_conflicts            integer := 0;
  v_stamped              integer := 0;
  v_tranche_bills        integer := 0;
  v_tranches             integer := 0;
  v_split_did_not_fit    integer := 0;
  v_skipped_existing     integer := 0;
  v_due_fixed            integer := 0;
  v_due_out_of_ay        integer := 0;
  v_amount_mismatch      integer := 0;
  v_unresolved_learners  integer := 0;
  v_status_candidates    integer := 0;
  v_promoted             integer := 0;
  v_learner              record;
  v_res                  jsonb;
  v_promotions           jsonb := '[]'::jsonb;
BEGIN
  -- This is a bulk maintenance action, not a per-request read. Gate it on the
  -- key that already exists for bulk bill work rather than on the much broader
  -- billing.schedule.update, which six roles hold.
  IF NOT (
    public.is_super_admin()
    OR public.user_has_permission('billing.schedule.bulk_create')
    -- The service key already bypasses RLS wholesale, so admitting it here
    -- grants nothing new and lets a server-side job call this.
    OR auth.role() = 'service_role'
    -- A direct superuser session (migration console / maintenance) carries no
    -- JWT at all, so every check above is false for it. session_user, NOT
    -- current_user: inside SECURITY DEFINER current_user is the function owner
    -- and would match unconditionally.
    OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))
  ) THEN
    RAISE EXCEPTION
      'not_authorized: resyncing fee-item schedules requires billing.schedule.bulk_create'
      USING ERRCODE = '42501';
  END IF;

  IF p_admission_year_ids IS NULL OR cardinality(p_admission_year_ids) = 0 THEN
    RAISE EXCEPTION 'p_admission_year_ids is required'
      USING ERRCODE = '22023',
            HINT = 'Pass the admission_years.id values to resync. This function never runs unscoped.';
  END IF;

  -- Thousands of bill UPDATEs, each firing the per-row billing-summary MV
  -- refresh. Give the batch room; the caller is expected to pass one
  -- institution at a time anyway.
  PERFORM set_config('statement_timeout', '600000', true);

  -- ── 1. Resolve the candidate set ────────────────────────────────────────
  -- fee_source = 'academic' only: transport (TMS) and hostel_category bills are
  -- generated by other engines and are not described by an admission fee item.
  DROP TABLE IF EXISTS _resync_scope;
  DROP TABLE IF EXISTS _resync_tranches;

  CREATE TEMP TABLE _resync_scope ON COMMIT DROP AS
  SELECT
    b.id                 AS bill_id,
    b.student_id,
    b.institution_id,
    b.item_category_id,
    b.final_amount,
    b.due_date,
    b.created_at::date   AS gen_date,
    b.fee_structure_item_id AS cur_item,
    fsi.id               AS item_id,
    fsi.schedule_mode,
    fsi.due_anchor,
    fsi.due_date         AS item_due,
    fsi.amount           AS item_amount,
    (SELECT count(*) FROM public.admission_fee_structure_item_schedules s
      WHERE s.fee_structure_item_id = fsi.id)        AS line_count,
    (SELECT count(*) FROM public.billing_bill_instalments i
      WHERE i.bill_id = b.id)                        AS cur_inst
  FROM public.billing_student_bills b
  JOIN public.learners_profiles lp ON lp.id = b.student_id
  JOIN LATERAL (
    SELECT public.admission_match_fee_structure_for_learner(lp.id) AS fs_id
  ) m ON m.fs_id IS NOT NULL
  -- Exactly one item per (structure, billing_category) — verified across the
  -- whole 2026-27 cohort. applies_to therefore never has to disambiguate.
  JOIN public.admission_fee_structure_items fsi
    ON fsi.fee_structure_id    = m.fs_id
   AND fsi.billing_category_id = b.item_category_id
  WHERE lp.admission_year_id = ANY(p_admission_year_ids)
    AND (p_institution_ids IS NULL OR b.institution_id = ANY(p_institution_ids))
    AND b.status::text NOT IN ('cancelled', 'superseded')
    AND b.fee_source = 'academic'
    AND b.final_amount > 0;

  SELECT count(*) INTO v_scanned FROM _resync_scope;

  -- A bill already pointing at a DIFFERENT item than the matrix now resolves is
  -- a real disagreement, not something to overwrite silently. Drop it and say so.
  DELETE FROM _resync_scope WHERE cur_item IS NOT NULL AND cur_item <> item_id;
  GET DIAGNOSTICS v_conflicts = ROW_COUNT;

  SELECT count(*) INTO v_amount_mismatch
  FROM _resync_scope WHERE final_amount <> item_amount;

  SELECT count(*) INTO v_skipped_existing
  FROM _resync_scope WHERE cur_inst > 0 AND NOT p_replace_existing;

  -- Learners in range holding live academic bills that resolve no structure at
  -- all (missing quota/community, or an institution with no structures — the
  -- school stream bills from school_fee_plans instead).
  SELECT count(DISTINCT lp.id) INTO v_unresolved_learners
  FROM public.learners_profiles lp
  WHERE lp.admission_year_id = ANY(p_admission_year_ids)
    AND (p_institution_ids IS NULL OR lp.institution_id = ANY(p_institution_ids))
    AND public.admission_match_fee_structure_for_learner(lp.id) IS NULL
    AND EXISTS (
      SELECT 1 FROM public.billing_student_bills b
      WHERE b.student_id = lp.id
        AND b.status::text NOT IN ('cancelled', 'superseded')
        AND b.fee_source = 'academic');

  -- ── counts that must be known in dry run too ────────────────────────────
  SELECT count(*) INTO v_due_out_of_ay
  FROM _resync_scope
  WHERE schedule_mode = 'single' AND due_anchor = 'fixed_date'
    AND item_due IS NOT NULL AND item_due IS DISTINCT FROM due_date
    AND cur_inst = 0
    AND p_max_due_date IS NOT NULL AND item_due > p_max_due_date;

  SELECT count(*) INTO v_due_fixed
  FROM _resync_scope
  WHERE schedule_mode = 'single' AND due_anchor = 'fixed_date'
    AND item_due IS NOT NULL AND item_due IS DISTINCT FROM due_date
    AND cur_inst = 0
    AND (p_max_due_date IS NULL OR item_due <= p_max_due_date);

  -- ── 2. Stamp the link ───────────────────────────────────────────────────
  IF p_dry_run THEN
    SELECT count(*) INTO v_stamped FROM _resync_scope WHERE cur_item IS NULL;
  ELSE
    UPDATE public.billing_student_bills b
       SET fee_structure_item_id = s.item_id
      FROM _resync_scope s
     WHERE b.id = s.bill_id
       AND b.fee_structure_item_id IS NULL;
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
  END IF;

  -- ── 3. Tranches ─────────────────────────────────────────────────────────
  -- instalment_count >= 2 is the acceptance test, not schedule_mode alone: a
  -- schedule whose fixed_amounts do not fit this bill's total makes the
  -- resolver fall through and return ONE row. Writing that as a single tranche
  -- would replace the bill's due date with a derived one and gain nothing, so
  -- those are skipped and reported instead.
  IF p_replace_existing AND NOT p_dry_run THEN
    DELETE FROM public.billing_bill_instalments i
     USING _resync_scope s
     WHERE i.bill_id = s.bill_id
       AND s.schedule_mode = 'split' AND s.line_count >= 2;
  END IF;

  CREATE TEMP TABLE _resync_tranches ON COMMIT DROP AS
  SELECT s.bill_id, s.item_id,
         r.instalment_no, r.instalment_count, r.instalment_amount,
         r.instalment_due_date, r.promotes_to_status_code
  FROM _resync_scope s
  CROSS JOIN LATERAL public.billing_instalment_split_for_learner(
         s.student_id, s.item_category_id, s.final_amount, s.gen_date, s.item_id) r
  WHERE s.schedule_mode = 'split'
    AND s.line_count >= 2
    AND (s.cur_inst = 0 OR p_replace_existing);

  SELECT count(DISTINCT bill_id) INTO v_split_did_not_fit
  FROM _resync_tranches WHERE instalment_count < 2;

  DELETE FROM _resync_tranches WHERE instalment_count < 2;

  SELECT count(*), count(DISTINCT bill_id) INTO v_tranches, v_tranche_bills
  FROM _resync_tranches;

  IF NOT p_dry_run THEN
    -- sequence_no == the schedule line's sequence_no: the resolver walks the
    -- lines ORDER BY sequence_no and numbers from 1, and sequence_no is unique
    -- and contiguous from 1 by the write path's own renumbering. That is what
    -- makes carrying the line's id and label back a safe join.
    INSERT INTO public.billing_bill_instalments
      (bill_id, sequence_no, amount, due_date, promotes_to_status_code,
       fee_structure_item_schedule_id, label)
    SELECT t.bill_id, t.instalment_no::smallint, t.instalment_amount,
           t.instalment_due_date, t.promotes_to_status_code,
           sl.id, sl.label
    FROM _resync_tranches t
    LEFT JOIN public.admission_fee_structure_item_schedules sl
      ON sl.fee_structure_item_id = t.item_id
     AND sl.sequence_no           = t.instalment_no;
    -- bill.due_date now follows the next unsettled tranche automatically via
    -- trg_bbi_sync_due_date; the deferred trg_bbi_validate_sum checks the
    -- tranche total against final_amount at commit.
  END IF;

  -- ── 4. Single fixed-date items ──────────────────────────────────────────
  -- Only bills with no tranches: a scheduled bill's due date is owned by
  -- bbi_sync_bill_due_date and must not be overwritten here.
  IF NOT p_dry_run THEN
    UPDATE public.billing_student_bills b
       SET due_date = s.item_due
      FROM _resync_scope s
     WHERE b.id = s.bill_id
       AND s.schedule_mode = 'single'
       AND s.due_anchor    = 'fixed_date'
       AND s.item_due IS NOT NULL
       AND s.item_due IS DISTINCT FROM s.due_date
       AND s.cur_inst = 0
       AND (p_max_due_date IS NULL OR s.item_due <= p_max_due_date);
  END IF;

  -- ── 5. Status, on the item rules only ───────────────────────────────────
  SELECT count(DISTINCT s.student_id) INTO v_status_candidates
  FROM _resync_scope s
  JOIN public.learners_profiles lp ON lp.id = s.student_id
  WHERE lp.lifecycle_status::text IN ('account', 'reserved');

  IF p_apply_status AND NOT p_dry_run THEN
    FOR v_learner IN
      SELECT DISTINCT s.student_id AS id
      FROM _resync_scope s
      JOIN public.learners_profiles lp ON lp.id = s.student_id
      WHERE lp.lifecycle_status::text IN ('account', 'reserved')
    LOOP
      v_res := public.fn_learner_status_apply_item_rules(
                 v_learner.id, 'fn_billing_resync_item_schedules');
      IF COALESCE((v_res->>'promoted')::boolean, false) THEN
        v_promoted   := v_promoted + 1;
        v_promotions := v_promotions || jsonb_build_object(
          'learner_id', v_learner.id,
          'from',       v_res->>'from_status',
          'to',         v_res->>'final_status');
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run',                    p_dry_run,
    'admission_year_ids',         to_jsonb(p_admission_year_ids),
    'institution_ids',            to_jsonb(p_institution_ids),
    'bills_scanned',              v_scanned,
    'stamped',                    v_stamped,
    'tranches_created',           v_tranches,
    'bills_scheduled',            v_tranche_bills,
    'due_dates_fixed',            v_due_fixed,
    'skipped_due_dates_out_of_ay', v_due_out_of_ay,
    'skipped_existing_tranches',  v_skipped_existing,
    'skipped_split_did_not_fit',  v_split_did_not_fit,
    'item_conflicts',             v_conflicts,
    'amount_mismatches',          v_amount_mismatch,
    'unresolved_learners',        v_unresolved_learners,
    'status_candidates',          v_status_candidates,
    'promoted',                   v_promoted,
    'promotions',                 v_promotions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_billing_resync_item_schedules(uuid[], uuid[], boolean, boolean, boolean, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_billing_resync_item_schedules(uuid[], uuid[], boolean, boolean, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_billing_resync_item_schedules(uuid[], uuid[], boolean, boolean, boolean, date) TO service_role;

COMMENT ON FUNCTION public.fn_billing_resync_item_schedules(uuid[], uuid[], boolean, boolean, boolean, date) IS
  'Reconnects already-generated bills to their admission fee-structure item: stamps fee_structure_item_id, '
  'creates instalment tranches from the item schedule, applies single fixed due dates, and promotes learners '
  'on the explicit item rules only (never the pooled threshold). Dry-run by default. '
  'Requires billing.schedule.bulk_create.';
