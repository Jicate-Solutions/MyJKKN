-- ============================================================================
-- billing_page_consolidation — one RPC replaces 11 paged REST reads
-- ============================================================================
-- The /billing/reports "Learners by Year of Study" cards were computed
-- CLIENT-side: StudentYearBreakdownService paged the ENTIRE
-- billing_student_bills table through PostgREST in 1000-row pages
-- (10,763 bills → ELEVEN sequential requests to /rest/v1/billing_student_bills
-- at ~100–240ms each, ~11k rows of payload) and aggregated in the browser.
-- This RPC performs the same aggregation in one statement server-side, so the
-- page issues ONE request and receives a handful of bucket rows.
--
-- Pattern: 20260725103000_billing_reports_filter_rpcs.sql — SECURITY DEFINER,
-- permission gate + get_user_accessible_institutions scope. The cards render
-- only on /billing/reports (the page itself refuses to render without
-- billing.reports.view), and every sibling metric on that page
-- (get_billing_reports_dashboard etc.) uses exactly this gate + scope, so the
-- year cards stay consistent with the totals above them.
--
-- Semantics mirror the client algorithm 1:1 (edge cases verified against prod:
-- zero NULL semester_order rows, zero bills with a missing learner):
--   * year of study = ceil(semester_order / 2); order 0 or name 'Freshers' → 1;
--     no / unmatched semester → NULL bucket ("Year Not Set");
--   * under an institution filter only that institution's semesters map to a
--     year (the client built its map from an institution-filtered semesters
--     query, so a learner sitting in another institution's semester bucketed
--     as NULL — replicated by the conditional join predicate);
--   * student_count = distinct learners with bills in the bucket;
--   * amount_collected = per-bill GREATEST(0, final_amount - balance_amount);
--   * outstanding = balance on unpaid / partially_paid / overdue bills;
--   * date filters compare created_at exactly as the client did
--     (>= p_date_from, <= p_date_to || 'T23:59:59.999Z') — text params so the
--     strings the UI sends are interpreted identically.

CREATE OR REPLACE FUNCTION public.get_billing_student_year_breakdown(
  p_institution_id uuid DEFAULT NULL,
  p_academic_year_id uuid DEFAULT NULL,
  p_academic_year_unspecified boolean DEFAULT false,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL
) RETURNS TABLE(
  year int,
  student_count bigint,
  amount_billed numeric,
  amount_collected numeric,
  outstanding numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_id IS NULL OR institution_id = p_institution_id);
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    yb.study_year,
    COUNT(DISTINCT yb.sid)                        AS student_count,
    SUM(yb.billed)                                AS amount_billed,
    SUM(GREATEST(0, yb.billed - yb.balance))      AS amount_collected,
    COALESCE(SUM(yb.balance) FILTER (
      WHERE yb.bill_status IN ('unpaid','partially_paid','overdue')), 0)
                                                  AS outstanding
  FROM (
    SELECT
      b.student_id                  AS sid,
      COALESCE(b.final_amount, 0)   AS billed,
      COALESCE(b.balance_amount, 0) AS balance,
      b.status                      AS bill_status,
      CASE
        WHEN s.id IS NULL THEN NULL
        WHEN s.semester_order = 0
          OR lower(btrim(COALESCE(s.semester_name, ''))) = 'freshers' THEN 1
        WHEN s.semester_order > 0 THEN CEIL(s.semester_order / 2.0)::int
        ELSE NULL
      END AS study_year
    FROM public.billing_student_bills b
    LEFT JOIN public.learners_profiles lp ON lp.id = b.student_id
    LEFT JOIN public.semesters s
      ON s.id = lp.semester_id
     AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
    WHERE b.institution_id = ANY(v_inst)
      AND (CASE
             WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
             WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
             ELSE true END)
      AND (p_date_from IS NULL OR b.created_at >= p_date_from::timestamptz)
      AND (p_date_to   IS NULL OR b.created_at <= (p_date_to || 'T23:59:59.999Z')::timestamptz)
  ) yb
  GROUP BY yb.study_year
  ORDER BY yb.study_year ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_billing_student_year_breakdown(uuid, uuid, boolean, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_billing_student_year_breakdown(uuid, uuid, boolean, text, text) TO authenticated, service_role;
