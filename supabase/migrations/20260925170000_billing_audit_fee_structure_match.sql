-- =============================================================================
-- 20260925170000_billing_audit_fee_structure_match.sql
--
-- /billing/coverage -> Audit -> "Fee Structure Match".
--
-- When an enquiry becomes an 'account' learner, admission_account_transition_with_bills
-- resolves the learner's fee structure with admission_match_fee_structure_for_learner
-- and raises the first-year bills. Some learners' bills do not match that
-- structure. Measured 2026-09-25 for the 2026 cohort (account/reserved/admitted/
-- active, 2,210 learners): 1,233 match a structure, 1,201 fully; 50 structure
-- items have no bill (32 learners); 13 amounts differ; 134 bills came from a
-- different structure than the learner matches now; 33 bills are not linked to
-- any structure item; 26 split items have no instalments; 974 learners sit in
-- institutions with no fee structure at all.
--
-- READ-ONLY. Three functions:
--   fn_billing_audit_fee_structure_rows   internal row builder, NOT callable by
--                                         users (no permission check inside)
--   get_billing_audit_fee_structure_match          gated list, paged
--   get_billing_audit_fee_structure_match_summary  gated KPIs
-- Gate: the existing billing.coverage.view key + get_user_accessible_institutions,
-- exactly like get_billing_audit_missing_years. No new key, table or policy.
--
-- MODELLING RULES
--  * The structure is resolved with admission_match_fee_structure_for_learner —
--    the SAME function bill generation uses, so the audit cannot disagree with
--    the generator about which structure a learner "should" have.
--  * Expected set = the matched structure's items (1,051 of 1,053 active items
--    are 'first_year_only', 2 'every_year'); compared to bills on
--    item_category_id. Cancelled / superseded bills are void and ignored.
--  * One row per (learner, structure item), plus one row per learner with no
--    structure. Primary issue, first match wins:
--      missing_bill     no live bill in the item's category
--      other_structure  a bill carries a fee_structure_item_id that is not this item
--      amount_mismatch  |sum of bills - item amount| > 1 rupee
--      not_linked       bills exist but none carries a fee_structure_item_id
--      split_missing    item is split but the bills carry no instalments and no
--                       instalment group
--      ok
--    Secondary flags (flag_*) are returned too, so a row that is both
--    other_structure and amount_mismatch still shows both.
--  * no_structure reasons: institution_has_none / quota_missing /
--    community_missing / no_matching_combo.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_billing_audit_fee_structure_rows(
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
  category_name       text,
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
  matched AS MATERIALIZED (
    SELECT s.*,
           CASE WHEN s.inst_has_fs
                THEN public.admission_match_fee_structure_for_learner(s.id) END AS fs_id
    FROM scope s
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
    SELECT m.*, fs.name::text AS fs_name, fi.id AS fi_id, bc.category_name::text AS cat_name,
           fi.schedule_mode, fi.amount AS exp_amt,
           CASE WHEN fi.schedule_mode = 'split'
                THEN (SELECT COUNT(*) FROM public.admission_fee_structure_item_schedules sc
                       WHERE sc.fee_structure_item_id = fi.id)::int
                ELSE 1 END AS exp_lines,
           bl.n_bills, bl.billed, bl.paid, bl.fsi_ids, bl.n_grouped, bl.n_lines
    FROM matched m
    JOIN public.admission_fee_structures fs ON fs.id = m.fs_id
    JOIN public.admission_fee_structure_items fi ON fi.fee_structure_id = m.fs_id
    JOIN public.billing_categories bc ON bc.id = fi.billing_category_id
    LEFT JOIN bills bl ON bl.student_id = m.id AND bl.item_category_id = fi.billing_category_id
  ),
  judged AS (
    SELECT r.*,
           (r.n_bills IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(r.fsi_ids) x WHERE x <> r.fi_id)) AS f_other,
           (r.n_bills IS NOT NULL AND ABS(COALESCE(r.billed, 0) - r.exp_amt) > 1)                  AS f_amount,
           (r.n_bills IS NOT NULL AND COALESCE(cardinality(r.fsi_ids), 0) = 0)                    AS f_unlinked,
           (r.n_bills IS NOT NULL AND r.schedule_mode = 'split'
              AND COALESCE(r.n_lines, 0) = 0 AND COALESCE(r.n_grouped, 0) < 2)                     AS f_split
    FROM item_rows r
  )
  SELECT j.id, j.full_name, j.roll_number, j.status, j.institution_id, j.institution_name,
         j.program_name, j.adm_year, j.inst_has_fs, j.fs_id, j.fs_name, j.fi_id, j.cat_name,
         j.schedule_mode, j.exp_amt, j.exp_lines, COALESCE(j.n_bills, 0),
         COALESCE(j.billed, 0), COALESCE(j.paid, 0),
         GREATEST(COALESCE(j.n_lines, 0), COALESCE(j.n_grouped, 0)),
         CASE
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
  SELECT m.id, m.full_name, m.roll_number, m.status, m.institution_id, m.institution_name,
         m.program_name, m.adm_year, m.inst_has_fs, NULL, NULL, NULL, NULL, NULL,
         NULL, NULL,
         (SELECT COALESCE(SUM(b.n_bills), 0)::int FROM bills b WHERE b.student_id = m.id),
         (SELECT COALESCE(SUM(b.billed), 0) FROM bills b WHERE b.student_id = m.id),
         (SELECT COALESCE(SUM(b.paid), 0) FROM bills b WHERE b.student_id = m.id),
         0,
         'no_structure',
         CASE
           WHEN NOT m.inst_has_fs              THEN 'institution_has_none'
           WHEN m.quota_id IS NULL             THEN 'quota_missing'
           WHEN m.community_category_id IS NULL THEN 'community_missing'
           ELSE 'no_matching_combo'
         END,
         false, false, false, false
  FROM matched m
  WHERE m.fs_id IS NULL;
$function$;

COMMENT ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) IS
  'INTERNAL row builder for the Fee Structure Match audit. No permission check inside: callable only by the two gated get_billing_audit_fee_structure_match* functions (owner). Structure resolved with admission_match_fee_structure_for_learner, the same resolver bill generation uses.';

REVOKE ALL ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- List (paged)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_audit_fee_structure_match(
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
  p_sort_dir           text    DEFAULT 'asc'
)
RETURNS TABLE (
  out_learner_id uuid, out_full_name text, out_roll_number text, out_lifecycle_status text,
  out_institution_id uuid, out_institution_name text, out_program_name text, out_admission_year integer,
  out_structure_name text, out_category_name text, out_schedule_mode text,
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
      AND (p_issue IS NULL OR r.issue = p_issue)
      AND (v_search IS NULL
           OR r.full_name ILIKE '%' || v_search || '%'
           OR r.roll_number ILIKE '%' || v_search || '%'
           OR r.structure_name ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT r.*, COUNT(*) OVER () AS total FROM rows r)
  SELECT c.learner_id, c.full_name, c.roll_number, c.lifecycle_status,
         c.institution_id, c.institution_name, c.program_name, c.admission_year,
         c.structure_name, c.category_name, c.schedule_mode,
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

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_match(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_match(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Summary (KPIs)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_audit_fee_structure_match_summary(
  p_institution_ids    uuid[]  DEFAULT NULL,
  p_lifecycle_statuses text[]  DEFAULT ARRAY['account','reserved','admitted','active'],
  p_admission_year     integer DEFAULT NULL,
  p_degree_id          uuid    DEFAULT NULL,
  p_department_id      uuid    DEFAULT NULL,
  p_program_id         uuid    DEFAULT NULL,
  p_gender             text    DEFAULT NULL,
  p_accommodation_type_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst   uuid[];
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
      'issues', '{}'::jsonb, 'learners_by_issue', '{}'::jsonb,
      'expected_total', 0, 'billed_total', 0,
      'no_structure_institution_learners', 0, 'no_structure_institutions', '[]'::jsonb,
      'available_admission_years', '[]'::jsonb);
  END IF;

  WITH r AS MATERIALIZED (
    SELECT * FROM public.fn_billing_audit_fee_structure_rows(
      v_inst, p_lifecycle_statuses, p_admission_year, p_degree_id,
      p_department_id, p_program_id, p_gender, p_accommodation_type_ids)
  ),
  inscope AS (SELECT * FROM r WHERE institution_has_structures),
  per_learner AS (
    SELECT learner_id, bool_and(issue = 'ok') AS all_ok FROM inscope GROUP BY learner_id
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
    'expected_total', (SELECT COALESCE(SUM(expected_amount), 0) FROM inscope WHERE issue <> 'no_structure'),
    'billed_total',   (SELECT COALESCE(SUM(billed_amount), 0) FROM inscope WHERE issue <> 'no_structure'),
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
           WHERE ay.institution_id = ANY(v_inst)) ys), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_match_summary(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_match_summary(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]) TO authenticated, service_role;
