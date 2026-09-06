-- Migration: MBA analyst — Type-A department views + data-only RPC extensibility
-- Date: 2026-07-26
-- Ships DORMANT. No behaviour changes until the Director posts an Associate to one
-- of these departments. Applying it is a safe no-op for existing data (only ADDs a
-- nullable column, backfills it to match the current hardcoded logic, CREATE OR
-- REPLACEs one RPC with an equivalent-but-data-driven body, and CREATEs 8 new
-- de-identified views + 8 map rows).
--
-- WHAT THIS DOES
--   PART 1 — Data-only extensibility:
--     * ADD COLUMN mba_area_analyst_views.guard_col text  (per-view k>=5 count col;
--       NULL = the view has no individual-count dimension, its rows always pass).
--     * Backfill guard_col for the existing 7 rows to EXACTLY match the hardcoded
--       CASE that used to live inside fn_mba_analyst_views.
--     * CREATE OR REPLACE fn_mba_analyst_views(uuid) so it reads guard_col FROM the
--       map row instead of a hardcoded CASE. Adding a future view becomes a data
--       row (view + map row + grant) — no function edit. The map row IS the
--       allowlist (an unmapped/typo'd/non-learning_* name is skipped, never read),
--       which replaces the old `__unknown__` sentinel with a stricter guard.
--   PART 2 — 8 new de-identified "Type-A" department views (finance, hr,
--     mess_hostel, coe_academic, cdc_placement, iqac, procurement, transport).
--     Each is an AGGREGATE with a k>=5 guard count column (or genuinely no
--     individual dimension), institution_id in every row + GROUP BY (no cross-
--     tenant bleed), no names / no row-level PII / no free-text. Views stay LOCKED
--     (granted only to mba_learner_analyst; the SECDEF RPC is the only app door).
--
-- PRIVACY NOTES
--   * Money views (finance, procurement, cdc_placement) => is_sensitive=true.
--   * Placement packages are individual + financial => guarded at k>=5 (placements
--     >= 5) AND flagged sensitive. With only 1 placement live today the view
--     correctly returns nothing until a cohort of >=5 exists.
--   * iqac (committee meetings) and procurement (purchase orders) aggregate
--     institution-level DOCUMENTS, not individuals, so guard_col is NULL — mirroring
--     the existing learning_event_budget_actual precedent. is_sensitive still gates
--     the money one (procurement).

BEGIN;

-- ============================================================================
-- PART 1a. Add the per-view guard column (data-only extensibility).
-- ============================================================================
ALTER TABLE public.mba_area_analyst_views
  ADD COLUMN IF NOT EXISTS guard_col text;

COMMENT ON COLUMN public.mba_area_analyst_views.guard_col IS
  'Name of the view output column that counts underlying individuals; the RPC drops any group where this column < 5 (k>=5 small-cell suppression). NULL => the view has no individual-count dimension (institution-level document/financial rollups) and its rows always pass. Read live by fn_mba_analyst_views — adding a view is now a data row, not a code change.';

-- ============================================================================
-- PART 1b. Backfill guard_col for the existing 7 rows to EXACTLY match the
--          hardcoded CASE previously inside fn_mba_analyst_views.
-- ============================================================================
UPDATE public.mba_area_analyst_views SET guard_col =
  CASE view_name
    WHEN 'learning_admission_funnel'    THEN 'lead_count'
    WHEN 'learning_channel_roi'         THEN 'leads'
    WHEN 'learning_collection_summary'  THEN 'receipts'
    WHEN 'learning_conversion_gaps'     THEN 'transition_count'
    WHEN 'learning_event_attendance'    THEN 'registrations'
    WHEN 'learning_event_feedback'      THEN 'responses'
    WHEN 'learning_event_budget_actual' THEN NULL            -- event financials: no individuals
  END
WHERE view_name IN (
  'learning_admission_funnel','learning_channel_roi','learning_collection_summary',
  'learning_conversion_gaps','learning_event_attendance','learning_event_feedback',
  'learning_event_budget_actual'
);

-- ============================================================================
-- PART 1c. Refactor the delivery RPC to read guard_col from the map row.
--   PRESERVES exactly: the role + active-posting gate (manager bypass); the
--   map-as-allowlist safety (only view_names that are rows for this area are
--   read); the dynamic EXECUTE with `%I >= 5` when guard_col not null else TRUE;
--   the return shape {area_id, views:[{view_name,is_sensitive,rows}]}; anon lock.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_manage    boolean;
  v_is_assoc  boolean;
  v_posted    boolean;
  v_rec       record;
  v_where     text;
  v_rows      jsonb;
  v_views     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_manage := is_super_admin() OR is_admin()
              OR user_has_permission('improvement.board.manage');

  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.role_key = 'mba_associate'
      AND cr.is_active
  ) INTO v_is_assoc;

  -- Gate 1: must be an MBA Associate or a board manager.
  IF NOT (v_is_assoc OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: MBA Associate role or improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
  ) INTO v_posted;

  -- Gate 2: must be posted to THIS department (managers bypass — they see any).
  IF NOT (v_posted OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: no active posting to this department'
      USING ERRCODE = '42501';
  END IF;

  -- Deliver each mapped view with k>=5 small-cell suppression.
  --   The map row IS the allowlist: only view_names present as rows for this
  --   area are ever read, and guard_col comes FROM the row (data-only — adding a
  --   view no longer edits this function). This replaces the old hardcoded CASE
  --   / '__unknown__' sentinel.
  FOR v_rec IN
    SELECT view_name, is_sensitive, guard_col
    FROM mba_area_analyst_views
    WHERE area_id = p_area_id
    ORDER BY view_name
  LOOP
    -- Defense-in-depth (stricter than the old CASE): the RPC can only ever read
    -- a REAL, EXISTING learning_* relation. A typo'd, dropped, or non-learning_*
    -- map row is skipped — never errors, never touches an arbitrary relation.
    IF v_rec.view_name !~ '^learning_[a-z0-9_]+$'
       OR to_regclass('public.' || v_rec.view_name) IS NULL THEN
      CONTINUE;
    END IF;

    -- guard_col NULL => no individual-count dimension => rows pass (WHERE TRUE).
    -- else => drop any group representing fewer than 5 underlying individuals.
    IF v_rec.guard_col IS NULL THEN
      v_where := 'TRUE';
    ELSE
      v_where := format('%I >= 5', v_rec.guard_col);
    END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      v_rec.view_name, v_where
    ) INTO v_rows;

    v_views := v_views || jsonb_build_object(
      'view_name',    v_rec.view_name,
      'is_sensitive', v_rec.is_sensitive,
      'rows',         v_rows
    );
  END LOOP;

  RETURN jsonb_build_object(
    'area_id', p_area_id,
    'views',   v_views
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_analyst_views(uuid) IS
  'Assignment-scoped delivery of de-identified analyst views for one improvement_area. Guards on mba_associate role + active posting (improvement.board.manage bypasses). Reads the per-view k>=5 guard column from mba_area_analyst_views.guard_col (data-only; the map row is also the allowlist). Returns {area_id, views:[{view_name,is_sensitive,rows[]}]}.';

-- Anon lock-out (Supabase default ALTER DEFAULT PRIVILEGES otherwise grants anon EXECUTE).
REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;

-- ============================================================================
-- PART 2. The 8 Type-A department views. All aggregate, de-identified, LOCKED.
-- ============================================================================

-- finance -> billing_receipts. Yearly collection health (distinct from the
-- monthly/payment-mode learning_collection_summary): annual rollup + distinct
-- payer count. MONEY => sensitive. guard = receipts (>=5 payers-worth).
CREATE OR REPLACE VIEW public.learning_finance_collection_yearly AS
 SELECT r.institution_id,
    i.name AS institution,
    (EXTRACT(YEAR FROM r.receipt_date))::int AS collection_year,
    count(*) AS receipts,
    count(DISTINCT r.student_id) AS distinct_payers,
    sum(r.payment_amount) AS total_collected,
    round(avg(r.payment_amount), 2) AS avg_receipt
   FROM billing_receipts r
     LEFT JOIN institutions i ON i.id = r.institution_id
  GROUP BY r.institution_id, i.name, (EXTRACT(YEAR FROM r.receipt_date))::int;

-- hr -> hr_leave_applications (scoped to institution via hr_organizations). Leave
-- utilisation by type + month. guard = applications (>=5 applications-worth).
CREATE OR REPLACE VIEW public.learning_hr_leave_utilization AS
 SELECT o.institution_id,
    i.name AS institution,
    lt.leave_type_name AS leave_type,
    date_trunc('month'::text, la.start_date::timestamp with time zone)::date AS leave_month,
    count(*) AS applications,
    count(*) FILTER (WHERE la.status::text = 'approved'::text) AS approved,
    round(sum(la.total_days), 1) AS total_days,
    round(avg(la.total_days), 2) AS avg_days
   FROM hr_leave_applications la
     JOIN hr_organizations o ON o.id = la.hr_organization_id
     LEFT JOIN institutions i ON i.id = o.institution_id
     LEFT JOIN hr_leave_types lt ON lt.id = la.leave_type_id
  GROUP BY o.institution_id, i.name, lt.leave_type_name, (date_trunc('month'::text, la.start_date::timestamp with time zone)::date);

-- mess_hostel -> hostel_allocations. Occupancy by academic year + status + type.
-- guard = allocations (each allocation = one resident student, >=5).
CREATE OR REPLACE VIEW public.learning_hostel_occupancy AS
 SELECT ha.institution_id,
    i.name AS institution,
    ha.academic_year_id,
    ha.status::text AS allocation_status,
    ha.allocation_type::text AS allocation_type,
    count(*) AS allocations,
    count(*) FILTER (WHERE ha.actual_vacate_date IS NULL) AS currently_resident,
    count(*) FILTER (WHERE ha.actual_vacate_date IS NOT NULL) AS vacated
   FROM hostel_allocations ha
     LEFT JOIN institutions i ON i.id = ha.institution_id
  GROUP BY ha.institution_id, i.name, ha.academic_year_id, (ha.status::text), (ha.allocation_type::text);

-- coe_academic -> rcltp_assessment_results. Cohort assessment performance by
-- assessment. guard = learners_assessed (each row = one learner's result, >=5).
CREATE OR REPLACE VIEW public.learning_academic_assessment_performance AS
 SELECT r.institution_id,
    i.name AS institution,
    r.assessment_id,
    count(*) AS learners_assessed,
    round(avg(r.overall_score), 2) AS avg_overall_score,
    round(avg(r.reading_score), 2) AS avg_reading_score,
    round(avg(r.comprehension_score), 2) AS avg_comprehension_score,
    round(avg(r.overall_score - r.previous_overall_score), 2) AS avg_improvement
   FROM rcltp_assessment_results r
     LEFT JOIN institutions i ON i.id = r.institution_id
  GROUP BY r.institution_id, i.name, r.assessment_id;

-- cdc_placement -> cdc_placements (scoped to institution via learners_profiles).
-- Placement outcomes by status + offer month. MONEY + individual => sensitive.
-- guard = placements (each row = one placed learner + their package, >=5).
CREATE OR REPLACE VIEW public.learning_placement_outcomes AS
 SELECT lp.institution_id,
    i.name AS institution,
    p.status::text AS placement_status,
    date_trunc('month'::text, p.offered_at)::date AS offer_month,
    count(*) AS placements,
    round(avg(p.package_lpa), 2) AS avg_package_lpa,
    round(avg(p.package_inr_total), 0) AS avg_package_inr
   FROM cdc_placements p
     JOIN learners_profiles lp ON lp.id = p.learner_id
     LEFT JOIN institutions i ON i.id = lp.institution_id
  GROUP BY lp.institution_id, i.name, (p.status::text), (date_trunc('month'::text, p.offered_at)::date);

-- iqac -> accreditation_committee_meetings. Committee activity by status + year.
-- Institution-level DOCUMENTS, no individuals => guard_col NULL (rows pass).
CREATE OR REPLACE VIEW public.learning_accreditation_committee_activity AS
 SELECT m.institution_id,
    i.name AS institution,
    m.status::text AS meeting_status,
    (EXTRACT(YEAR FROM m.scheduled_for))::int AS scheduled_year,
    count(*) AS meetings,
    count(*) FILTER (WHERE m.held_at IS NOT NULL) AS held,
    count(DISTINCT m.committee_id) AS committees
   FROM accreditation_committee_meetings m
     LEFT JOIN institutions i ON i.id = m.institution_id
  GROUP BY m.institution_id, i.name, (m.status::text), (EXTRACT(YEAR FROM m.scheduled_for))::int;

-- procurement -> procurement_purchase_orders. PO spend by status + month. MONEY =>
-- sensitive. POs are institution-level financial DOCUMENTS, not individuals =>
-- guard_col NULL (mirrors learning_event_budget_actual). Supplier is never
-- selected; only status, month and aggregate value are exposed.
CREATE OR REPLACE VIEW public.learning_procurement_spend AS
 SELECT po.institution_id,
    i.name AS institution,
    po.status::text AS po_status,
    date_trunc('month'::text, po.created_at)::date AS po_month,
    count(*) AS po_count,
    sum(po.total_amount) AS total_amount,
    round(avg(po.total_amount), 2) AS avg_po_value
   FROM procurement_purchase_orders po
     LEFT JOIN institutions i ON i.id = po.institution_id
  GROUP BY po.institution_id, i.name, (po.status::text), (date_trunc('month'::text, po.created_at)::date);

-- transport -> pp_bus_assignments (note: source column is institutions_id, aliased
-- to institution_id to satisfy the contract). Ridership per route. guard = riders
-- (each assignment = one rider, >=5) so small routes are suppressed.
CREATE OR REPLACE VIEW public.learning_transport_ridership AS
 SELECT a.institutions_id AS institution_id,
    i.name AS institution,
    r.route_name,
    count(*) AS riders
   FROM pp_bus_assignments a
     LEFT JOIN pp_bus_routes r ON r.id = a.route_id
     LEFT JOIN institutions i ON i.id = a.institutions_id
  GROUP BY a.institutions_id, i.name, r.route_name;

-- ============================================================================
-- PART 2b. Lock the views to the analyst role only (mirrors the existing 7).
--          The SECDEF RPC reads them as owner; authenticated/anon are never granted.
-- ============================================================================
GRANT SELECT ON public.learning_finance_collection_yearly          TO mba_learner_analyst;
GRANT SELECT ON public.learning_hr_leave_utilization               TO mba_learner_analyst;
GRANT SELECT ON public.learning_hostel_occupancy                   TO mba_learner_analyst;
GRANT SELECT ON public.learning_academic_assessment_performance    TO mba_learner_analyst;
GRANT SELECT ON public.learning_placement_outcomes                 TO mba_learner_analyst;
GRANT SELECT ON public.learning_accreditation_committee_activity   TO mba_learner_analyst;
GRANT SELECT ON public.learning_procurement_spend                  TO mba_learner_analyst;
GRANT SELECT ON public.learning_transport_ridership                TO mba_learner_analyst;

-- ============================================================================
-- PART 2c. Seed the map rows. area_id resolved by improvement_areas.key (DR-safe).
-- ============================================================================
INSERT INTO public.mba_area_analyst_views (area_id, view_name, is_sensitive, guard_col)
SELECT a.id, v.view_name, v.is_sensitive, v.guard_col
FROM (VALUES
  ('finance',       'learning_finance_collection_yearly',        true,  'receipts'),
  ('hr',            'learning_hr_leave_utilization',             false, 'applications'),
  ('mess_hostel',   'learning_hostel_occupancy',                 false, 'allocations'),
  ('coe_academic',  'learning_academic_assessment_performance',  false, 'learners_assessed'),
  ('cdc_placement', 'learning_placement_outcomes',               true,  'placements'),
  ('iqac',          'learning_accreditation_committee_activity',  false, NULL::text),
  ('procurement',   'learning_procurement_spend',                true,  NULL::text),
  ('transport',     'learning_transport_ridership',              false, 'riders')
) AS v(area_key, view_name, is_sensitive, guard_col)
JOIN public.improvement_areas a ON a.key = v.area_key
ON CONFLICT (area_id, view_name)
DO UPDATE SET is_sensitive = EXCLUDED.is_sensitive, guard_col = EXCLUDED.guard_col;

COMMIT;
