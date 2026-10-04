-- =============================================================================
-- 20260925190000_billing_audit_fee_structure_per_learner.sql
--
-- Fee Structure Match, round 3: ONE ROW PER LEARNER + a details view.
--
-- The list showed one row per (learner, fee item), so a learner with three
-- problems appeared three times. Now:
--   get_billing_audit_fee_structure_learners   one row per learner with counts
--                                              per issue, expected / billed
--                                              totals and the worst issue
--   get_billing_audit_fee_structure_learner_detail
--                                              everything for ONE learner: each
--                                              structure item beside its bills,
--                                              plus bills that match no item
--                                              ("extra"), for the comparison
--                                              dialog
-- fn_billing_audit_fee_structure_rows gains an optional p_learner_ids so the
-- detail view resolves one learner instead of the whole institution. Existing
-- 8-argument callers are unaffected (default NULL).
-- Gate: billing.coverage.view + institution access, as before.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[]);

CREATE FUNCTION public.fn_billing_audit_fee_structure_rows(
  p_institution_ids    uuid[],
  p_lifecycle_statuses text[],
  p_admission_year     integer,
  p_degree_id          uuid,
  p_department_id      uuid,
  p_program_id         uuid,
  p_gender             text,
  p_accommodation_type_ids uuid[],
  p_learner_ids        uuid[] DEFAULT NULL
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
      AND (p_learner_ids IS NULL OR lp.id = ANY(p_learner_ids))
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

COMMENT ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], uuid[]) IS
  'INTERNAL row builder for the Fee Structure Match audit. No permission check inside: callable only by the gated get_billing_audit_fee_structure_* functions (owner). Expected items come from admission_compute_fee_items_for_learner — what account transition bills.';

REVOKE ALL ON FUNCTION public.fn_billing_audit_fee_structure_rows(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- One row per learner
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_audit_fee_structure_learners(
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
  out_structure_name text,
  out_items integer, out_ok integer, out_missing_bill integer, out_amount_mismatch integer,
  out_other_structure integer, out_not_linked integer, out_split_missing integer,
  out_other_module integer, out_no_structure boolean, out_no_structure_reason text,
  out_problems integer, out_worst_issue text,
  out_expected_total numeric, out_billed_total numeric, out_paid_total numeric,
  out_missing_amount numeric,
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
  WITH r AS MATERIALIZED (
    SELECT x.*
    FROM public.fn_billing_audit_fee_structure_rows(
           v_inst, p_lifecycle_statuses, p_admission_year, p_degree_id,
           p_department_id, p_program_id, p_gender, p_accommodation_type_ids) x
    WHERE (p_include_no_structure_institutions OR x.institution_has_structures)
      AND (p_category_ids IS NULL OR x.category_id = ANY(p_category_ids) OR x.issue = 'no_structure')
      AND (p_schedule_mode IS NULL OR x.schedule_mode = p_schedule_mode OR x.issue = 'no_structure')
      AND (v_fs IS NULL OR x.structure_name ILIKE '%' || v_fs || '%')
  ),
  g AS (
    SELECT r.learner_id,
           max(r.full_name) AS full_name, max(r.roll_number) AS roll_number,
           max(r.lifecycle_status) AS lifecycle_status,
           (array_agg(r.institution_id))[1] AS institution_id,
           max(r.institution_name) AS institution_name, max(r.program_name) AS program_name,
           max(r.admission_year) AS admission_year,
           string_agg(DISTINCT r.structure_name, ', ') AS structure_name,
           COUNT(*) FILTER (WHERE r.issue <> 'no_structure')::int     AS items,
           COUNT(*) FILTER (WHERE r.issue = 'ok')::int                AS ok,
           COUNT(*) FILTER (WHERE r.issue = 'missing_bill')::int      AS missing_bill,
           COUNT(*) FILTER (WHERE r.issue = 'amount_mismatch')::int   AS amount_mismatch,
           COUNT(*) FILTER (WHERE r.issue = 'other_structure')::int   AS other_structure,
           COUNT(*) FILTER (WHERE r.issue = 'not_linked')::int        AS not_linked,
           COUNT(*) FILTER (WHERE r.issue = 'split_missing')::int     AS split_missing,
           COUNT(*) FILTER (WHERE r.issue = 'other_module')::int      AS other_module,
           bool_or(r.issue = 'no_structure')                          AS no_structure,
           max(r.no_structure_reason)                                 AS no_structure_reason,
           COALESCE(SUM(r.expected_amount) FILTER (WHERE r.issue NOT IN ('no_structure','other_module')), 0) AS expected_total,
           COALESCE(SUM(r.billed_amount), 0)                          AS billed_total,
           COALESCE(SUM(r.paid_amount), 0)                            AS paid_total,
           COALESCE(SUM(r.expected_amount) FILTER (WHERE r.issue = 'missing_bill'), 0) AS missing_amount
    FROM r GROUP BY r.learner_id
  ),
  scored AS (
    SELECT g.*,
           (g.missing_bill + g.amount_mismatch + g.other_structure + g.not_linked
             + g.split_missing + CASE WHEN g.no_structure THEN 1 ELSE 0 END)::int AS problems,
           CASE
             WHEN g.no_structure         THEN 'no_structure'
             WHEN g.missing_bill > 0     THEN 'missing_bill'
             WHEN g.other_structure > 0  THEN 'other_structure'
             WHEN g.amount_mismatch > 0  THEN 'amount_mismatch'
             WHEN g.not_linked > 0       THEN 'not_linked'
             WHEN g.split_missing > 0    THEN 'split_missing'
             WHEN g.other_module > 0     THEN 'other_module'
             ELSE 'ok'
           END AS worst
    FROM g
  ),
  filtered AS (
    SELECT s.* FROM scored s
    WHERE (CASE
             WHEN p_issue IS NULL THEN (p_include_ok OR s.problems > 0)
             WHEN p_issue = 'missing_bill'    THEN s.missing_bill > 0
             WHEN p_issue = 'amount_mismatch' THEN s.amount_mismatch > 0
             WHEN p_issue = 'other_structure' THEN s.other_structure > 0
             WHEN p_issue = 'not_linked'      THEN s.not_linked > 0
             WHEN p_issue = 'split_missing'   THEN s.split_missing > 0
             WHEN p_issue = 'other_module'    THEN s.other_module > 0
             WHEN p_issue = 'no_structure'    THEN s.no_structure
             WHEN p_issue = 'ok'              THEN s.problems = 0
             ELSE true END)
      AND (v_search IS NULL
           OR s.full_name ILIKE '%' || v_search || '%'
           OR s.roll_number ILIKE '%' || v_search || '%'
           OR s.structure_name ILIKE '%' || v_search || '%')
  ),
  counted AS (SELECT f.*, COUNT(*) OVER () AS total FROM filtered f)
  SELECT c.learner_id, c.full_name, c.roll_number, c.lifecycle_status,
         c.institution_id, c.institution_name, c.program_name, c.admission_year,
         c.structure_name,
         c.items, c.ok, c.missing_bill, c.amount_mismatch, c.other_structure, c.not_linked,
         c.split_missing, c.other_module, c.no_structure, c.no_structure_reason,
         c.problems, c.worst,
         c.expected_total, c.billed_total, c.paid_total, c.missing_amount,
         c.total
  FROM counted c
  ORDER BY
    CASE WHEN p_sort_dir = 'desc' THEN NULL ELSE
      CASE p_sort_by
        WHEN 'institution_name' THEN c.institution_name
        WHEN 'worst_issue'      THEN c.worst
        ELSE c.full_name END END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_by
        WHEN 'institution_name' THEN c.institution_name
        WHEN 'worst_issue'      THEN c.worst
        ELSE c.full_name END END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'problems' AND p_sort_dir = 'desc' THEN c.problems END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'problems' AND p_sort_dir <> 'desc' THEN c.problems END ASC NULLS LAST,
    c.full_name
  OFFSET (v_page - 1) * v_size
  LIMIT v_size;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_learners(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_learners(uuid[], text[], integer, uuid, uuid, uuid, text, uuid[], text, boolean, boolean, text, integer, integer, text, text, uuid[], text, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- One learner, for the comparison dialog
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_billing_audit_fee_structure_learner_detail(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lp     record;
  v_items  jsonb;
  v_extra  jsonb;
BEGIN
  IF NOT public.user_has_permission('billing.coverage.view') THEN
    RAISE EXCEPTION 'permission denied: billing.coverage.view' USING ERRCODE = '42501';
  END IF;

  SELECT lp.id, lp.institution_id, lp.lifecycle_status::text AS status
    INTO v_lp FROM public.learners_profiles lp WHERE lp.id = p_learner_id;
  IF NOT FOUND OR NOT public.role_has_institution_access(v_lp.institution_id) THEN
    RETURN NULL;
  END IF;

  -- Every structure item with the bills in its category (ok rows included).
  SELECT jsonb_agg(jsonb_build_object(
           'category_id', r.category_id, 'category_name', r.category_name,
           'category_kind', r.category_kind, 'structure_name', r.structure_name,
           'schedule_mode', r.schedule_mode,
           'expected_amount', r.expected_amount, 'expected_instalments', r.expected_instalments,
           'bill_count', r.bill_count, 'billed_amount', r.billed_amount, 'paid_amount', r.paid_amount,
           'bill_instalments', r.bill_instalments, 'issue', r.issue,
           'no_structure_reason', r.no_structure_reason,
           'flag_other_structure', r.flag_other_structure, 'flag_amount_mismatch', r.flag_amount_mismatch,
           'flag_not_linked', r.flag_not_linked, 'flag_split_missing', r.flag_split_missing,
           'bills', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'bill_id', b.id, 'description', b.bill_description,
                      'amount', b.final_amount,
                      'paid', GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)),
                      'status', b.status, 'due_date', b.due_date,
                      'linked_to_structure', b.fee_structure_item_id IS NOT NULL)
                    ORDER BY b.due_date)
             FROM public.billing_student_bills b
             WHERE b.student_id = p_learner_id AND b.item_category_id = r.category_id
               AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')), '[]'::jsonb))
         ORDER BY CASE r.issue WHEN 'missing_bill' THEN 0 WHEN 'amount_mismatch' THEN 1
                               WHEN 'other_structure' THEN 2 WHEN 'ok' THEN 9 ELSE 5 END,
                  r.category_name)
    INTO v_items
  FROM public.fn_billing_audit_fee_structure_rows(
         ARRAY[v_lp.institution_id], ARRAY[v_lp.status], NULL, NULL, NULL, NULL, NULL, NULL,
         ARRAY[p_learner_id]) r;

  -- Live bills whose category is not in the structure at all.
  SELECT jsonb_agg(jsonb_build_object(
           'bill_id', b.id, 'category_name', bc.category_name, 'category_kind', bc.kind,
           'description', b.bill_description, 'amount', b.final_amount,
           'paid', GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount)),
           'status', b.status, 'due_date', b.due_date) ORDER BY bc.category_name)
    INTO v_extra
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(v_items, '[]'::jsonb)) it
       WHERE (it->>'category_id')::uuid = b.item_category_id);

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'items', COALESCE(v_items, '[]'::jsonb),
    'extra_bills', COALESCE(v_extra, '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_audit_fee_structure_learner_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_audit_fee_structure_learner_detail(uuid) TO authenticated, service_role;
