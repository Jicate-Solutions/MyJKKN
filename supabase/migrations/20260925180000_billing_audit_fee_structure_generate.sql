-- =============================================================================
-- 20260925180000_billing_audit_fee_structure_generate.sql
--
-- Fee Structure Match audit, round 2: correct expectations, advanced filters,
-- and a "Generate missing bills" action.
--
-- WHY THE AUDIT CHANGES
--  * 43 of the 50 "missing bills" (cohort 2026) were hostel / mess fees.
--    admission_account_transition_with_bills never bills hostel / mess /
--    transport categories — Campus Living and Transport raise those. They are
--    now issue 'other_module', not 'missing_bill'. Only 7 were truly missing.
--  * Expected items now come from admission_compute_fee_items_for_learner —
--    the function account transition bills from. Same structure match, plus
--    the learner's active fee adjustments, the legacy fee snapshot and the
--    year-of-study filter. The previous version read raw structure items, so
--    its expected amounts could differ from what the generator would bill.
--    Items without a category (the "Global Adjustment" line) are not billable
--    items and are skipped.
--
-- GENERATOR  fn_billing_generate_missing_structure_bills(learner_ids, dry_run)
--  * Gate: billing.schedule.bulk_create + role_has_institution_access per
--    learner. Learners in account / reserved / admitted / active only.
--  * Creates ONLY bills for items with amount > 0, category not hostel / mess /
--    transport, and NO live bill in that category. Wrong amounts, bills from an
--    older structure and missing splits are reported, never "fixed".
--  * Inserts exactly as account transition does: one bill per fee, its
--    instalment schedule from billing_instalment_split_for_learner inside the
--    bill (billing_bill_instalments), fee_structure_item_id stamped. The
--    once_per_learner trigger still guards duplicates.
--  * dry_run = true (default) returns the preview and writes nothing.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_billing_audit_fee_structure_match(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.get_billing_audit_fee_structure_match_summary(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]);
DROP FUNCTION IF EXISTS public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]);

CREATE FUNCTION public.fn_billing_audit_fee_structure_rows(
  p_institution_ids    uuid[],
  p_lifecycle_statuses text[],
  p_admission_year     integer,
  p_degree_id          uuid,
  p_department_id      uuid,
  p_program_id         uuid,
  p_gender             text,
  p_accommodation_type_ids uuid[]
)
RETURNS TABLE (
  learner_id          uuid,
  full_name           text,
  roll_number         text,
  lifecycle_status    text,
  institution_id      uuid,
  institution_name    text,
  program_name        text,
  admission_year      integer,
  institution_has_structures boolean,
  structure_id        uuid,
  structure_name      text,
  item_id             uuid,
  category_id         uuid,
  category_name       text,
  category_kind       text,
  schedule_mode       text,
  expected_amount     numeric,
  expected_instalments integer,
  bill_count          integer,
  billed_amount       numeric,
  paid_amount         numeric,
  bill_instalments    integer,
  issue               text,
  no_structure_reason text,
  flag_other_structure boolean,
  flag_amount_mismatch boolean,
  flag_not_linked     boolean,
  flag_split_missing  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scope AS MATERIALIZED (
    SELECT lp.id, lp.institution_id, lp.quota_id, lp.community_category_id,
           lp.lifecycle_status::text AS status,
           TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS full_name,
           lp.roll_number, i.name::text AS institution_name,
           p.program_name::text AS program_name, adm.year AS adm_year,
           EXISTS (SELECT 1 FROM public.admission_fee_structures f
                    WHERE f.institution_id = lp.institution_id
                      AND f.status = 'active') AS inst_has_fs
    FROM public.learners_profiles lp
    JOIN public.admission_years adm ON adm.id = lp.admission_year_id
    LEFT JOIN public.institutions i ON i.id = lp.institution_id
    LEFT JOIN public.programs p ON p.id = lp.program_id
    WHERE lp.institution_id = ANY(p_institution_ids)
      AND lp.lifecycle_status::text = ANY(p_lifecycle_statuses)
      AND (p_admission_year IS NULL OR adm.year = p_admission_year)
      AND (p_degree_id     IS NULL OR lp.degree_id     = p_degree_id)
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
      AND (p_program_id    IS NULL OR lp.program_id    = p_program_id)
      AND (p_accommodation_type_ids IS NULL
           OR lp.accommodation_type_id = ANY(p_accommodation_type_ids))
      AND (p_gender IS NULL OR UPPER(TRIM(lp.gender)) = UPPER(TRIM(p_gender)))
  ),
  computed AS MATERIALIZED (
    -- What account transition would bill this learner today.
    SELECT s.*,
           CASE WHEN s.inst_has_fs
                THEN public.admission_compute_fee_items_for_learner(s.id)
                ELSE '[]'::jsonb END AS items
    FROM scope s
  ),
  expected AS MATERIALIZED (
    SELECT c.id AS lid,
           NULLIF(it->>'category_id', '')::uuid           AS cat_id,
           (it->>'amount')::numeric                       AS exp_amt,
           NULLIF(it->>'fee_structure_item_id', '')::uuid AS fsi_id,
           NULLIF(it->>'fee_structure_id', '')::uuid      AS fs_id
    FROM computed c
    CROSS JOIN LATERAL jsonb_array_elements(c.items) it
    WHERE NULLIF(it->>'category_id', '') IS NOT NULL
  ),
  bills AS MATERIALIZED (
    SELECT b.student_id, b.item_category_id,
           COUNT(*)::int                                   AS n_bills,
           SUM(b.final_amount)                             AS billed,
           SUM(GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))) AS paid,
           array_remove(array_agg(DISTINCT b.fee_structure_item_id), NULL) AS fsi_ids,
           COUNT(*) FILTER (WHERE b.instalment_group_id IS NOT NULL)::int AS n_grouped,
           COALESCE(SUM((SELECT COUNT(*) FROM public.billing_bill_instalments i
                           WHERE i.bill_id = b.id)), 0)::int AS n_lines
    FROM public.billing_student_bills b
    WHERE b.student_id IN (SELECT id FROM scope)
      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
    GROUP BY b.student_id, b.item_category_id
  ),
  item_rows AS (
    SELECT c.*, e.cat_id, e.exp_amt, e.fsi_id,
           COALESCE(fs.id, e.fs_id) AS fs_id,
           COALESCE(fs.name::text, 'Legacy fee snapshot') AS fs_name,
           bc.category_name::text AS cat_name, bc.kind::text AS cat_kind,
           fi.schedule_mode,
           CASE WHEN fi.schedule_mode = 'split'
                THEN (SELECT COUNT(*) FROM public.admission_fee_structure_item_schedules sc
                       WHERE sc.fee_structure_item_id = fi.id)::int
                ELSE 1 END AS exp_lines,
           bl.n_bills, bl.billed, bl.paid, bl.fsi_ids, bl.n_grouped, bl.n_lines
    FROM computed c
    JOIN expected e ON e.lid = c.id
    JOIN public.billing_categories bc ON bc.id = e.cat_id
    LEFT JOIN public.admission_fee_structure_items fi ON fi.id = e.fsi_id
    LEFT JOIN public.admission_fee_structures fs ON fs.id = COALESCE(fi.fee_structure_id, e.fs_id)
    LEFT JOIN bills bl ON bl.student_id = c.id AND bl.item_category_id = e.cat_id
  ),
  judged AS (
    SELECT r.*,
           (r.n_bills IS NOT NULL AND r.fsi_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM unnest(r.fsi_ids) x WHERE x <> r.fsi_id))                 AS f_other,
           (r.n_bills IS NOT NULL AND ABS(COALESCE(r.billed, 0) - r.exp_amt) > 1)                  AS f_amount,
           (r.n_bills IS NOT NULL AND COALESCE(cardinality(r.fsi_ids), 0) = 0)                    AS f_unlinked,
           (r.n_bills IS NOT NULL AND r.schedule_mode = 'split'
              AND COALESCE(r.n_lines, 0) = 0 AND COALESCE(r.n_grouped, 0) < 2)                     AS f_split
    FROM item_rows r
  )
  SELECT j.id, j.full_name, j.roll_number, j.status, j.institution_id, j.institution_name,
         j.program_name, j.adm_year, j.inst_has_fs, j.fs_id, j.fs_name, j.fsi_id, j.cat_id,
         j.cat_name, j.cat_kind, j.schedule_mode, j.exp_amt, j.exp_lines, COALESCE(j.n_bills, 0),
         COALESCE(j.billed, 0), COALESCE(j.paid, 0),
         GREATEST(COALESCE(j.n_lines, 0), COALESCE(j.n_grouped, 0)),
         CASE
           -- Account transition never bills these; their own modules do.
           WHEN j.n_bills IS NULL AND j.cat_kind IN ('hostel', 'mess', 'transport') THEN 'other_module'
           WHEN j.n_bills IS NULL THEN 'missing_bill'
           WHEN j.f_other         THEN 'other_structure'
           WHEN j.f_amount        THEN 'amount_mismatch'
           WHEN j.f_unlinked      THEN 'not_linked'
           WHEN j.f_split         THEN 'split_missing'
           ELSE 'ok'
         END,
         NULL::text,
         COALESCE(j.f_other, false), COALESCE(j.f_amount, false),
         COALESCE(j.f_unlinked, false), COALESCE(j.f_split, false)
  FROM judged j
  UNION ALL
  SELECT c.id, c.full_name, c.roll_number, c.status, c.institution_id, c.institution_name,
         c.program_name, c.adm_year, c.inst_has_fs, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         NULL, NULL,
         (SELECT COALESCE(SUM(b.n_bills), 0)::int FROM bills b WHERE b.student_id = c.id),
         (SELECT COALESCE(SUM(b.billed), 0) FROM bills b WHERE b.student_id = c.id),
         (SELECT COALESCE(SUM(b.paid), 0) FROM bills b WHERE b.student_id = c.id),
         0,
         'no_structure',
         CASE
           WHEN NOT c.inst_has_fs               THEN 'institution_has_none'
           WHEN c.quota_id IS NULL              THEN 'quota_missing'
           WHEN c.community_category_id IS NULL THEN 'community_missing'
           ELSE 'no_matching_combo'
         END,
         false, false, false, false
  FROM computed c
  WHERE NOT EXISTS (SELECT 1 FROM expected e WHERE e.lid = c.id);
$function$;

COMMENT ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) IS
  'INTERNAL row builder for the Fee Structure Match audit. No permission check inside: callable only by the gated get_billing_audit_fee_structure_match* functions (owner). Expected items come from admission_compute_fee_items_for_learner — what account transition bills.';

REVOKE ALL ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- List (paged) — adds category / schedule / structure-name filters
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.get_billing_audit_fee_structure_match(
  p_institution_ids    uuid[]  DEFAULT NULL,
  p_lifecycle_statuses text[]  DEFAULT ARRAY['account','reserved','admitted','active'],
  p_admission_year     integer DEFAULT NULL,
  p_degree_id          uuid    DEFAULT NULL,
  p_department_id      uuid    DEFAULT NULL,
  p_program_id         uuid    DEFAULT NULL,
  p_gender             text    DEFAULT NULL,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_issue              text    DEFAULT NULL,
  p_include_ok         boolean DEFAULT false,
  p_include_no_structure_institutions boolean DEFAULT false,
  p_search             text    DEFAULT NULL,
  p_page               integer DEFAULT 1,
  p_page_size          integer DEFAULT 50,
  p_sort_by            text    DEFAULT 'full_name',
  p_sort_dir           text    DEFAULT 'asc',
  p_category_ids       uuid[]  DEFAULT NULL,
  p_schedule_mode      text    DEFAULT NULL,
  p_structure_search   text    DEFAULT NULL
)
RETURNS TABLE (
  out_learner_id uuid, out_full_name text, out_roll_number text, out_lifecycle_status text,
  out_institution_id uuid, out_institution_name text, out_program_name text, out_admission_year integer,
  out_structure_name text, out_category_id uuid, out_category_name text, out_category_kind text,
  out_schedule_mode text,
  out_expected_amount numeric, out_expected_instalments integer,
  out_bill_count integer, out_billed_amount numeric, out_paid_amount numeric, out_bill_instalments integer,
  out_issue text, out_no_structure_reason text,
  out_flag_other_structure boolean, out_flag_amount_mismatch boolean,
  out_flag_not_linked boolean, out_flag_split_missing boolean,
  out_total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_page   int := GREATEST(COALESCE(p_page, 1), 1);
  v_size   int := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 5000);
  v_search text := NULLIF(TRIM(p_search), '');
  v_fs     text := NULLIF(TRIM(p_structure_search), '');
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(a.institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) a
  WHERE (p_institution_ids IS NULL OR a.institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT r.*
    FROM public.fn_billing_audit_fee_structure_rows(
           v_inst, p_lifecycle_statuses, p_admission_year, p_degree_id,
           p_department_id, p_program_id, p_gender, p_accommodation_type_ids) r
    WHERE (p_include_ok OR r.issue <> 'ok')
      AND (p_include_no_structure_institutions OR r.institution_has_structures)
      -- 'other_module' rows are shown only when asked for by name.
      AND (CASE WHEN p_issue IS NULL THEN r.issue <> 'other_module' ELSE r.issue = p_issue END)
      AND (p_category_ids IS NULL OR r.category_id = ANY(p_category_ids))
      AND (p_schedule_mode IS NULL OR r.schedule_mode = p_schedule_mode)
      AND (v_fs IS NULL OR r.structure_name ILIKE '%' || v_fs || '%')
      AND (v_search IS NULL
           OR r.full_name ILIKE '%' || v_search || '%'
           OR r.roll_number ILIKE '%' || v_search || '%'
           OR r.structure_name ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT r.*, COUNT(*) OVER () AS total FROM rows r)
  SELECT c.learner_id, c.full_name, c.roll_number, c.lifecycle_status,
         c.institution_id, c.institution_name, c.program_name, c.admission_year,
         c.structure_name, c.category_id, c.category_name, c.category_kind, c.schedule_mode,
         c.expected_amount, c.expected_instalments,
         c.bill_count, c.billed_amount, c.paid_amount, c.bill_instalments,
         c.issue, c.no_structure_reason,
         c.flag_other_structure, c.flag_amount_mismatch, c.flag_not_linked, c.flag_split_missing,
         c.total
  FROM counted c
  ORDER BY
    CASE WHEN p_sort_dir = 'desc' THEN NULL ELSE
      CASE p_sort_by
        WHEN 'institution_name' THEN c.institution_name
        WHEN 'issue'            THEN c.issue
        WHEN 'category_name'    THEN c.category_name
        ELSE c.full_name END END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_by
        WHEN 'institution_name' THEN c.institution_name
        WHEN 'issue'            THEN c.issue
        WHEN 'category_name'    THEN c.category_name
        ELSE c.full_name END END DESC NULLS LAST,
    c.full_name, c.category_name
  OFFSET (v_page - 1) * v_size
  LIMIT v_size;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_match(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_match(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text, uuid[], text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Summary — same new filters; reports other_module separately
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.get_billing_audit_fee_structure_match_summary(
  p_institution_ids    uuid[]  DEFAULT NULL,
  p_lifecycle_statuses text[]  DEFAULT ARRAY['account','reserved','admitted','active'],
  p_admission_year     integer DEFAULT NULL,
  p_degree_id          uuid    DEFAULT NULL,
  p_department_id      uuid    DEFAULT NULL,
  p_program_id         uuid    DEFAULT NULL,
  p_gender             text    DEFAULT NULL,
  p_accommodation_type_ids uuid[] DEFAULT NULL,
  p_category_ids       uuid[]  DEFAULT NULL,
  p_schedule_mode      text    DEFAULT NULL,
  p_structure_search   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
  v_fs     text := NULLIF(TRIM(p_structure_search), '');
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(a.institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) a
  WHERE (p_institution_ids IS NULL OR a.institution_id = ANY(p_institution_ids));

  IF v_inst IS NULL THEN
    RETURN jsonb_build_object('learners_checked', 0, 'learners_ok', 0,
      'issues', '{}'::jsonb, 'learners_by_issue', '{}'::jsonb, 'no_structure_reasons', '{}'::jsonb,
      'expected_total', 0, 'billed_total', 0,
      'no_structure_institution_learners', 0, 'no_structure_institutions', '[]'::jsonb,
      'available_admission_years', '[]'::jsonb, 'categories', '[]'::jsonb);
  END IF;

  WITH r AS MATERIALIZED (
    SELECT * FROM public.fn_billing_audit_fee_structure_rows(
      v_inst, p_lifecycle_statuses, p_admission_year, p_degree_id,
      p_department_id, p_program_id, p_gender, p_accommodation_type_ids) x
    WHERE (p_category_ids IS NULL OR x.category_id = ANY(p_category_ids) OR x.issue = 'no_structure')
      AND (p_schedule_mode IS NULL OR x.schedule_mode = p_schedule_mode OR x.issue = 'no_structure')
      AND (v_fs IS NULL OR x.structure_name ILIKE '%' || v_fs || '%')
  ),
  inscope AS (SELECT * FROM r WHERE institution_has_structures),
  per_learner AS (
    -- A learner whose only gaps are other-module fees still counts as matching.
    SELECT learner_id, bool_and(issue IN ('ok', 'other_module')) AS all_ok FROM inscope GROUP BY learner_id
  )
  SELECT jsonb_build_object(
    'learners_checked', (SELECT COUNT(*) FROM per_learner),
    'learners_ok',      (SELECT COUNT(*) FROM per_learner WHERE all_ok),
    'issues', COALESCE((SELECT jsonb_object_agg(issue, n) FROM
                (SELECT issue, COUNT(*) n FROM inscope GROUP BY issue) x), '{}'::jsonb),
    'learners_by_issue', COALESCE((SELECT jsonb_object_agg(issue, n) FROM
                (SELECT issue, COUNT(DISTINCT learner_id) n FROM inscope GROUP BY issue) x), '{}'::jsonb),
    'no_structure_reasons', COALESCE((SELECT jsonb_object_agg(no_structure_reason, n) FROM
                (SELECT no_structure_reason, COUNT(*) n FROM inscope
                  WHERE issue = 'no_structure' GROUP BY no_structure_reason) x), '{}'::jsonb),
    'expected_total', (SELECT COALESCE(SUM(expected_amount), 0) FROM inscope
                        WHERE issue NOT IN ('no_structure', 'other_module')),
    'billed_total',   (SELECT COALESCE(SUM(billed_amount), 0) FROM inscope
                        WHERE issue NOT IN ('no_structure', 'other_module')),
    'no_structure_institution_learners',
        (SELECT COUNT(DISTINCT learner_id) FROM r WHERE NOT institution_has_structures),
    'no_structure_institutions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('institution_name', institution_name, 'learners', n)
                         ORDER BY n DESC)
        FROM (SELECT institution_name, COUNT(DISTINCT learner_id) n FROM r
               WHERE NOT institution_has_structures GROUP BY institution_name) x), '[]'::jsonb),
    'available_admission_years', COALESCE((
        SELECT jsonb_agg(y ORDER BY y DESC) FROM (
          SELECT DISTINCT ay.year AS y FROM public.admission_years ay
           WHERE ay.institution_id = ANY(v_inst)) ys), '[]'::jsonb),
    -- Fee items present in scope, for the advanced filter's picker.
    'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', category_id, 'name', category_name) ORDER BY category_name)
        FROM (SELECT DISTINCT category_id, category_name FROM inscope WHERE category_id IS NOT NULL) c), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_match_summary(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_match_summary(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], uuid[], text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Generator
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_billing_generate_missing_structure_bills(
  p_learner_ids uuid[],
  p_dry_run     boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_learner    record;
  v_item       jsonb;
  v_cat_id     uuid;
  v_cat        record;
  v_amount     numeric;
  v_item_id    uuid;
  v_split_rows integer;
  v_first_due  date;
  v_bill_id    uuid;
  v_results    jsonb := '[]'::jsonb;
  v_learner_bills jsonb;
  v_skips      jsonb;
  v_created    integer := 0;
  v_amount_sum numeric := 0;
  v_skipped_learners integer := 0;
BEGIN
  IF NOT (public.user_has_permission('billing.schedule.bulk_create')
          OR COALESCE(public.is_super_admin(), false)) THEN
    RAISE EXCEPTION 'permission denied: billing.schedule.bulk_create' USING ERRCODE = '42501';
  END IF;

  IF p_learner_ids IS NULL OR array_length(p_learner_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('dry_run', p_dry_run, 'bills', 0, 'amount', 0, 'learners', '[]'::jsonb);
  END IF;
  IF array_length(p_learner_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too many learners: % (max 500 per call)', array_length(p_learner_ids, 1);
  END IF;

  FOR v_learner IN
    SELECT lp.id, lp.institution_id, lp.academic_year_id, lp.lifecycle_status::text AS status,
           TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS full_name, lp.roll_number
    FROM public.learners_profiles lp
    WHERE lp.id = ANY(p_learner_ids)
    ORDER BY lp.first_name
  LOOP
    v_learner_bills := '[]'::jsonb;
    v_skips := '[]'::jsonb;

    IF NOT public.role_has_institution_access(v_learner.institution_id) THEN
      v_skips := v_skips || jsonb_build_object('reason', 'no_institution_access');
    ELSIF v_learner.status NOT IN ('account', 'reserved', 'admitted', 'active') THEN
      v_skips := v_skips || jsonb_build_object('reason', 'status_' || v_learner.status);
    ELSE
      FOR v_item IN
        SELECT * FROM jsonb_array_elements(public.admission_compute_fee_items_for_learner(v_learner.id))
      LOOP
        v_cat_id := NULLIF(v_item->>'category_id', '')::uuid;
        v_amount := COALESCE((v_item->>'amount')::numeric, 0);
        IF v_cat_id IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

        SELECT bc.id, bc.category_name::text AS name, bc.kind::text AS kind
          INTO v_cat FROM public.billing_categories bc WHERE bc.id = v_cat_id;
        IF v_cat.kind IN ('hostel', 'mess', 'transport') THEN CONTINUE; END IF;

        -- Only a category with NO live bill is "missing".
        IF EXISTS (SELECT 1 FROM public.billing_student_bills b
                    WHERE b.student_id = v_learner.id
                      AND b.item_category_id = v_cat_id
                      AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')) THEN
          CONTINUE;
        END IF;

        v_item_id := NULLIF(v_item->>'fee_structure_item_id', '')::uuid;

        SELECT count(*), min(s.instalment_due_date)
          INTO v_split_rows, v_first_due
          FROM public.billing_instalment_split_for_learner(
                 v_learner.id, v_cat_id, v_amount, now()::date, v_item_id) s;

        v_bill_id := NULL;
        IF NOT p_dry_run THEN
          INSERT INTO public.billing_student_bills (
            student_id, institution_id, academic_year_id, item_category_id,
            bill_description, due_date, quantity,
            unit_amount, total_amount, tax_amount, final_amount,
            balance_amount, status, remarks, created_by, fee_structure_item_id
          ) VALUES (
            v_learner.id, v_learner.institution_id, v_learner.academic_year_id, v_cat_id,
            COALESCE(v_item->>'category_name', v_cat.name),
            COALESCE(v_first_due, (now() + interval '30 days')::date),
            1, v_amount, v_amount, 0, v_amount, v_amount, 'unpaid',
            'Generated from Fee Structure Match audit'
              || CASE WHEN v_split_rows > 1 THEN ' (' || v_split_rows || ' instalments per fee structure schedule)' ELSE '' END,
            v_caller, v_item_id
          )
          RETURNING id INTO v_bill_id;

          IF v_split_rows > 1 THEN
            INSERT INTO public.billing_bill_instalments
              (bill_id, sequence_no, amount, due_date, promotes_to_status_code)
            SELECT v_bill_id, s.instalment_no::smallint, s.instalment_amount,
                   s.instalment_due_date, s.promotes_to_status_code
              FROM public.billing_instalment_split_for_learner(
                     v_learner.id, v_cat_id, v_amount, now()::date, v_item_id) s;
          END IF;
        END IF;

        v_learner_bills := v_learner_bills || jsonb_build_object(
          'category_id', v_cat_id, 'category_name', v_cat.name, 'amount', v_amount,
          'instalments', GREATEST(v_split_rows, 1),
          'due_date', COALESCE(v_first_due, (now() + interval '30 days')::date),
          'bill_id', v_bill_id);
        v_created := v_created + 1;
        v_amount_sum := v_amount_sum + v_amount;
      END LOOP;

      IF jsonb_array_length(v_learner_bills) = 0 THEN
        v_skips := v_skips || jsonb_build_object('reason', 'nothing_missing');
      END IF;
    END IF;

    IF jsonb_array_length(v_learner_bills) = 0 THEN
      v_skipped_learners := v_skipped_learners + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'learner_id', v_learner.id, 'full_name', v_learner.full_name,
      'roll_number', v_learner.roll_number,
      'bills', v_learner_bills, 'skipped', v_skips);
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'bills', v_created,
    'amount', v_amount_sum,
    'learners_with_bills', array_length(p_learner_ids, 1) - v_skipped_learners,
    'learners_skipped', v_skipped_learners,
    'learners', v_results);
END;
$function$;

COMMENT ON FUNCTION public.fn_billing_generate_missing_structure_bills(uuid[], boolean) IS
  'Fee Structure Match audit action: raises the bills a learner''s fee structure expects but that do not exist (no live bill in the category; hostel/mess/transport excluded). Inserts exactly as admission_account_transition_with_bills does. Gate: billing.schedule.bulk_create + institution access per learner. dry_run (default) writes nothing.';

REVOKE ALL ON FUNCTION public.fn_billing_generate_missing_structure_bills(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_billing_generate_missing_structure_bills(uuid[], boolean) TO authenticated, service_role;
