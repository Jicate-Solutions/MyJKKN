-- ============================================================================
-- 2026-05-18 — Source Coverage Detailed Analytics (Daily Pivot + By Program)
--
-- Returns one row per (source_key, program_id) for admission_leads created
-- in [p_from, p_to], with daily_counts JSONB keyed by IST date.
--
-- Spec: docs/superpowers/specs/2026-05-18-source-coverage-detailed-analytics-design.md
--
-- "Assigned" follows the convention introduced by get_lead_counts_by_source
-- (migration 20260510230000): counselor_id IS NOT NULL.
-- IST bucketing follows fn_seat_analytics_daily_pivot.
-- Permission gate uses the catalog key admission.analytics.view per memory
-- feedback_rpc_perm_gate_must_use_catalog_key.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_admission_source_coverage_daily(uuid, date, date, text, text[], uuid[]);

CREATE OR REPLACE FUNCTION public.fn_admission_source_coverage_daily(
  p_institution_id  uuid    DEFAULT NULL,
  p_from            date    DEFAULT NULL,
  p_to              date    DEFAULT NULL,
  p_assignment      text    DEFAULT 'all',
  p_source_keys     text[]  DEFAULT NULL,
  p_program_ids     uuid[]  DEFAULT NULL
)
RETURNS TABLE (
  source_key      text,
  source_label    text,
  source_enum     lead_source,
  program_id      uuid,
  program_short   text,
  program_name    text,
  total           integer,
  assigned        integer,
  unassigned      integer,
  daily_counts    jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to   date;
  v_tmp  date;
BEGIN
  -- 1. Permission gate (catalog key)
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.analytics.view')
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- 2. Date defaults: last 30 days when both ends are NULL
  v_to   := COALESCE(p_to, (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date);
  v_from := COALESCE(p_from, v_to - INTERVAL '30 days');

  -- 3. Swap if reversed (silent — service-layer already toasts)
  IF v_from > v_to THEN
    v_tmp := v_from; v_from := v_to; v_to := v_tmp;
  END IF;

  -- 4. Cap range at 365 days (safety net; service-layer also clamps)
  IF v_to - v_from > 365 THEN
    v_from := v_to - INTERVAL '365 days';
  END IF;

  -- 5. Validate p_assignment
  IF p_assignment NOT IN ('all', 'assigned', 'unassigned') THEN
    RAISE EXCEPTION 'invalid p_assignment: %', p_assignment USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible_institutions AS (
    SELECT i.id
    FROM institutions i
    WHERE role_has_institution_access(i.id)
      AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ),
  lead_window AS (
    SELECT
      l.id,
      l.source,
      l.program_id,
      l.counselor_id,
      (l.created_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
    FROM admission_leads l
    WHERE l.institution_id IN (SELECT id FROM eligible_institutions)
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to
      AND (
        p_assignment = 'all'
        OR (p_assignment = 'assigned'   AND l.counselor_id IS NOT NULL)
        OR (p_assignment = 'unassigned' AND l.counselor_id IS NULL)
      )
      AND (
        p_program_ids IS NULL
        OR cardinality(p_program_ids) = 0
        OR l.program_id = ANY(p_program_ids)
      )
  ),
  source_resolved AS (
    SELECT
      lw.id,
      lw.source,
      lw.program_id,
      lw.counselor_id,
      lw.ist_day,
      COALESCE(sm.key, lw.source::text) AS source_key,
      COALESCE(
        sm.label,
        initcap(replace(lw.source::text, '_', ' '))
      )                                  AS source_label
    FROM lead_window lw
    LEFT JOIN admission_lead_sources_master sm
      ON sm.enum_value = lw.source
  ),
  filtered AS (
    SELECT * FROM source_resolved sr
    WHERE p_source_keys IS NULL
       OR cardinality(p_source_keys) = 0
       OR sr.source_key = ANY(p_source_keys)
  ),
  daily_agg AS (
    SELECT
      f.source_key,
      f.program_id,
      f.ist_day,
      COUNT(*)::integer AS daily_n
    FROM filtered f
    GROUP BY f.source_key, f.program_id, f.ist_day
  ),
  totals AS (
    SELECT
      f.source_key,
      f.source_label,
      f.source AS source_enum,
      f.program_id,
      COUNT(*)::integer                                              AS total,
      COUNT(*) FILTER (WHERE f.counselor_id IS NOT NULL)::integer    AS assigned,
      COUNT(*) FILTER (WHERE f.counselor_id IS NULL)::integer        AS unassigned
    FROM filtered f
    GROUP BY f.source_key, f.source_label, f.source, f.program_id
  ),
  daily_json AS (
    SELECT
      da.source_key,
      da.program_id,
      jsonb_object_agg(to_char(da.ist_day, 'YYYY-MM-DD'), da.daily_n ORDER BY da.ist_day) AS daily_counts
    FROM daily_agg da
    GROUP BY da.source_key, da.program_id
  )
  SELECT
    t.source_key,
    t.source_label,
    t.source_enum,
    t.program_id,
    p.program_id  AS program_short,
    p.program_name,
    t.total,
    t.assigned,
    t.unassigned,
    COALESCE(dj.daily_counts, '{}'::jsonb) AS daily_counts
  FROM totals t
  LEFT JOIN daily_json dj
    ON dj.source_key = t.source_key
   AND dj.program_id IS NOT DISTINCT FROM t.program_id
  LEFT JOIN programs p ON p.id = t.program_id
  ORDER BY t.total DESC, t.source_label, p.program_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admission_source_coverage_daily(
  uuid, date, date, text, text[], uuid[]
) TO authenticated;

COMMENT ON FUNCTION public.fn_admission_source_coverage_daily(uuid, date, date, text, text[], uuid[]) IS
  'Per-(source, program) daily-pivot aggregator for admission_leads in [p_from, p_to]. Returns total/assigned/unassigned + daily_counts JSONB keyed by IST date. Powers the Source Coverage Daily Pivot and By Program sub-tabs. SECURITY DEFINER + admission.analytics.view permission gate + role_has_institution_access scope.';

COMMIT;
