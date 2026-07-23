-- Migration: Gate ③ capture spine — audit_parameter_results + fn_audit_capture_cycle_results
-- Date: 2026-07-14
-- Why: The self-improving audit's gate ③ measures, per parameter per cycle, how the
--      gap changed vs the prior cycle — closure of prior findings, recurrence ("we keep
--      finding the same gap"), and the finding-count delta. This is the durable capture
--      the audit needs to get sharper each cycle. Design: .claude/scratch/loop-audit-
--      design-2026-07-10.md → "Gate ③ — the capture spine". Gate ④ (adapt) stays DEFERRED
--      until ③ has ≥2–3 cycles of history — building it now is speculative.
--
-- Grain: one row per (parameter_code, institution_id) that has activity in the cycle
-- (a finding) OR had a result row in a prior cycle (so closure/recurrence of a now-clean
-- parameter is still captured). Applied to prod via the Management API (show-SQL-first).

-- 1. Table -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_parameter_results (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id     uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  parameter_code     text NOT NULL,
  institution_id     uuid,                 -- nullable: system-wide parameters
  finding_count      integer NOT NULL DEFAULT 0,   -- findings this parameter raised this cycle
  open_finding_count integer NOT NULL DEFAULT 0,   -- of those, still open
  attested           boolean NOT NULL DEFAULT false, -- signed for this param×institution this cycle
  verdict            text NOT NULL,        -- pass | partial | fail
  measured_value     jsonb,                -- summary counts
  prior_result_id    uuid REFERENCES public.audit_parameter_results(id) ON DELETE SET NULL,
  delta              jsonb,                -- {finding_count_change, closed_from_prior, still_open_from_prior}
  recurrence_count   integer NOT NULL DEFAULT 0,   -- consecutive cycles this pair carried findings
  computed_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_parameter_results IS
  'Gate ③ capture: per-parameter, per-institution, per-cycle verdict + closure/recurrence/delta vs the prior cycle. Written by fn_audit_capture_cycle_results when a cycle closes or on demand. The audit''s cross-cycle memory.';

CREATE INDEX IF NOT EXISTS idx_audit_param_results_cycle
  ON public.audit_parameter_results (audit_cycle_id);
CREATE INDEX IF NOT EXISTS idx_audit_param_results_pair
  ON public.audit_parameter_results (parameter_code, institution_id, computed_at DESC);

-- RLS: the capture fn writes via SECURITY DEFINER; this governs direct authenticated reads.
ALTER TABLE public.audit_parameter_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_parameter_results_select ON public.audit_parameter_results;
CREATE POLICY audit_parameter_results_select ON public.audit_parameter_results
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')
  );
REVOKE ALL    ON public.audit_parameter_results FROM anon, PUBLIC;
GRANT  SELECT ON public.audit_parameter_results TO authenticated;

-- 2. Capture function ------------------------------------------------------------------
-- Recomputes gate ③ results for one cycle (idempotent: deletes the cycle's rows, re-inserts).
-- A "finding" is an audit_finding service_request whose form_data.audit_cycle_id = the cycle.
-- OPEN = status NOT IN (closed,rejected,cancelled) AND closed_at IS NULL (matches param-status.ts).
CREATE OR REPLACE FUNCTION public.fn_audit_capture_cycle_results(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_type_id uuid;
  v_written integer := 0;
BEGIN
  -- Authz: super-admin/admin or an auditor. service_role (auth.uid() null) is allowed
  -- so the cycle-close path and cron can call it.
  IF auth.uid() IS NOT NULL
     AND NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.view required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM audit_cycles WHERE id = p_cycle_id) THEN
    RAISE EXCEPTION 'audit cycle % not found', p_cycle_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_service_type_id FROM service_types WHERE slug = 'audit_finding' LIMIT 1;

  -- Findings on this cycle, keyed to (parameter_code, institution_id).
  CREATE TEMP TABLE _cyc_findings ON COMMIT DROP AS
  SELECT sr.form_data->>'parameter_code' AS parameter_code,
         sr.institution_id,
         sr.id AS finding_id,
         (sr.status NOT IN ('closed','rejected','cancelled') AND sr.closed_at IS NULL) AS is_open
  FROM service_requests sr
  WHERE sr.service_type_id = v_service_type_id
    AND sr.form_data->>'audit_cycle_id' = p_cycle_id::text
    AND sr.form_data->>'parameter_code' IS NOT NULL;

  -- Pairs to capture: any pair with a finding this cycle, any pair attested this cycle
  -- (so a clean signed parameter shows its 'pass'), plus any pair that had a prior result
  -- carrying a finding (so a now-clean parameter still gets its closure/recurrence recorded).
  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT DISTINCT parameter_code, institution_id FROM _cyc_findings
  UNION
  SELECT DISTINCT a.parameter_code, a.institution_id
  FROM audit_attestations a
  WHERE a.audit_cycle_id = p_cycle_id AND a.attested_at IS NOT NULL
  UNION
  SELECT DISTINCT r.parameter_code, r.institution_id
  FROM audit_parameter_results r
  WHERE r.audit_cycle_id <> p_cycle_id
    AND EXISTS (  -- only prior pairs that ever carried a finding (avoid dragging clean noise)
      SELECT 1 FROM audit_parameter_results r2
      WHERE r2.parameter_code = r.parameter_code
        AND r2.institution_id IS NOT DISTINCT FROM r.institution_id
        AND r2.finding_count > 0
    );

  DELETE FROM audit_parameter_results WHERE audit_cycle_id = p_cycle_id;

  INSERT INTO audit_parameter_results (
    audit_cycle_id, parameter_code, institution_id, finding_count, open_finding_count,
    attested, verdict, measured_value, prior_result_id, delta, recurrence_count
  )
  SELECT
    p_cycle_id,
    pr.parameter_code,
    pr.institution_id,
    fc.finding_count,
    fc.open_finding_count,
    att.attested,
    CASE
      WHEN fc.finding_count = 0 THEN CASE WHEN att.attested THEN 'pass' ELSE 'partial' END
      WHEN fc.open_finding_count = 0 THEN 'partial'
      ELSE 'fail'
    END AS verdict,
    jsonb_build_object(
      'finding_count', fc.finding_count,
      'open_finding_count', fc.open_finding_count,
      'attested', att.attested
    ) AS measured_value,
    prior.id AS prior_result_id,
    jsonb_build_object(
      'finding_count_change', fc.finding_count - COALESCE(prior.finding_count, 0),
      'closed_from_prior', COALESCE(closure.closed_from_prior, 0),
      'still_open_from_prior', COALESCE(closure.still_open_from_prior, 0)
    ) AS delta,
    CASE
      WHEN fc.finding_count > 0 AND COALESCE(prior.finding_count, 0) > 0
        THEN COALESCE(prior.recurrence_count, 0) + 1
      WHEN fc.finding_count > 0 THEN 1
      ELSE 0
    END AS recurrence_count
  FROM _pairs pr
  -- this cycle's counts for the pair
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS finding_count,
           count(*) FILTER (WHERE f.is_open)::int AS open_finding_count
    FROM _cyc_findings f
    WHERE f.parameter_code = pr.parameter_code
      AND f.institution_id IS NOT DISTINCT FROM pr.institution_id
  ) fc ON true
  -- attested this cycle for the pair
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM audit_attestations a
      WHERE a.audit_cycle_id = p_cycle_id
        AND a.parameter_code = pr.parameter_code
        AND a.institution_id IS NOT DISTINCT FROM pr.institution_id
        AND a.attested_at IS NOT NULL
    ) AS attested
  ) att ON true
  -- most recent prior result for the pair (any earlier cycle)
  LEFT JOIN LATERAL (
    SELECT r.id, r.finding_count, r.recurrence_count, r.audit_cycle_id
    FROM audit_parameter_results r
    WHERE r.parameter_code = pr.parameter_code
      AND r.institution_id IS NOT DISTINCT FROM pr.institution_id
      AND r.audit_cycle_id <> p_cycle_id
    ORDER BY r.computed_at DESC
    LIMIT 1
  ) prior ON true
  -- closure of the prior cycle's findings for this pair (how many are now closed)
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (
             WHERE sr.status IN ('closed','fulfilled') OR sr.closed_at IS NOT NULL
           )::int AS closed_from_prior,
           count(*) FILTER (
             WHERE NOT (sr.status IN ('closed','fulfilled') OR sr.closed_at IS NOT NULL)
           )::int AS still_open_from_prior
    FROM service_requests sr
    WHERE prior.audit_cycle_id IS NOT NULL
      AND sr.service_type_id = v_service_type_id
      AND sr.form_data->>'audit_cycle_id' = prior.audit_cycle_id::text
      AND sr.form_data->>'parameter_code' = pr.parameter_code
      AND sr.institution_id IS NOT DISTINCT FROM pr.institution_id
  ) closure ON true;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_capture_cycle_results(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_capture_cycle_results(uuid) TO authenticated;
