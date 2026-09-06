-- Gate ④ (adapt) — the audit gets sharper each cycle by reading audit_parameter_results history.
-- Recommend-only + human-gated apply (IQAC/Director stays in control; no silent rigor changes).
-- 2026-07-15

-- 1. check_frequency on the catalog — the one durable state Rule 1 mutates.
ALTER TABLE public.audit_parameter_catalog
  ADD COLUMN IF NOT EXISTS check_frequency smallint NOT NULL DEFAULT 1;
COMMENT ON COLUMN public.audit_parameter_catalog.check_frequency IS
  'Gate ④: sample this parameter once every N cycles (1 = every cycle). Raised for long-clean params.';

-- 2. audit_adaptations — one row per recommendation, with apply/dismiss trail.
CREATE TABLE IF NOT EXISTS public.audit_adaptations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN ('reduce_frequency','escalate_recurring','add_discovery','tune_threshold')),
  parameter_code text NOT NULL,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('high','medium','low')),
  title text NOT NULL,
  detail text NOT NULL,
  suggested_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','dismissed')),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_adaptations_uniq
  ON public.audit_adaptations (audit_cycle_id, rule, parameter_code,
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS audit_adaptations_cycle_status
  ON public.audit_adaptations (audit_cycle_id, status);

ALTER TABLE public.audit_adaptations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_adaptations_select ON public.audit_adaptations;
CREATE POLICY audit_adaptations_select ON public.audit_adaptations
  FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view'));
-- No INSERT/UPDATE/DELETE policies: all writes go through the SECURITY DEFINER RPCs below.

DROP TRIGGER IF EXISTS trg_audit_adaptations_updated_at ON public.audit_adaptations;
CREATE TRIGGER trg_audit_adaptations_updated_at BEFORE UPDATE ON public.audit_adaptations
  FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_set_updated_at();

GRANT SELECT ON public.audit_adaptations TO authenticated;
REVOKE ALL ON public.audit_adaptations FROM anon;

-- 3. The engine: read history + findings + catalog, (re)propose recommendations for the 4 rules.
CREATE OR REPLACE FUNCTION public.fn_audit_compute_adaptations(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ft uuid; v_n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.view')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.view required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_cycles WHERE id = p_cycle_id) THEN
    RAISE EXCEPTION 'audit cycle % not found', p_cycle_id USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_ft FROM service_types WHERE slug = 'audit_finding' LIMIT 1;

  -- Re-propose from scratch each run, but never disturb human-resolved rows.
  DELETE FROM audit_adaptations WHERE audit_cycle_id = p_cycle_id AND status = 'proposed';

  -- helper predicate: (rule,param,institution) not already applied/dismissed this cycle
  -- RULE 2 — escalate recurring (recurrence_count >= 2 in this cycle's results)
  INSERT INTO audit_adaptations (audit_cycle_id, rule, parameter_code, institution_id, severity, title, detail, suggested_action)
  SELECT p_cycle_id, 'escalate_recurring', r.parameter_code, r.institution_id, 'high',
    'Escalate — ' || r.parameter_code || ' keeps failing',
    format('Found in %s consecutive cycles at this college; remediation is not working. Escalate ownership to %s and halve the SLA.',
           r.recurrence_count, COALESCE(c.escalation_role, 'principal')),
    jsonb_build_object('kind','escalate','new_owner_role', c.escalation_role,
      'new_p1_sla', GREATEST(1, (c.p1_sla_days/2)::int), 'new_p2_sla', GREATEST(2, (c.p2_sla_days/2)::int),
      'prev_owner_role', c.default_owner_role, 'prev_p1_sla', c.p1_sla_days, 'prev_p2_sla', c.p2_sla_days)
  FROM audit_parameter_results r
  JOIN audit_parameter_catalog c ON c.code = r.parameter_code
  WHERE r.audit_cycle_id = p_cycle_id AND r.recurrence_count >= 2 AND c.escalation_role IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM audit_adaptations a WHERE a.audit_cycle_id = p_cycle_id
       AND a.rule = 'escalate_recurring' AND a.parameter_code = r.parameter_code
       AND a.institution_id IS NOT DISTINCT FROM r.institution_id AND a.status IN ('applied','dismissed'));

  -- RULE 3 — add discovery (param has hand-logged findings but no discovery query)
  INSERT INTO audit_adaptations (audit_cycle_id, rule, parameter_code, institution_id, severity, title, detail, suggested_action)
  SELECT p_cycle_id, 'add_discovery', c.code, NULL, 'medium',
    'Automate — teach the audit to find ' || c.code,
    format('This gap was found by hand (%s finding(s) logged) but the audit has no automatic check for it. Add a discovery query so future cycles catch it without manual logging.', f.total),
    jsonb_build_object('kind','add_discovery','parameter_code', c.code, 'finding_count', f.total)
  FROM (SELECT form_data->>'parameter_code' AS pc, count(*) AS total
        FROM service_requests WHERE service_type_id = v_ft AND form_data->>'parameter_code' IS NOT NULL
        GROUP BY 1) f
  JOIN audit_parameter_catalog c ON c.code = f.pc
  WHERE c.discovery_query_sql IS NULL AND c.is_active
    AND NOT EXISTS (SELECT 1 FROM audit_adaptations a WHERE a.audit_cycle_id = p_cycle_id
       AND a.rule = 'add_discovery' AND a.parameter_code = c.code
       AND a.institution_id IS NULL AND a.status IN ('applied','dismissed'));

  -- RULE 1 — reduce frequency (latest 2 results for a pair both clean, still at freq 1)
  INSERT INTO audit_adaptations (audit_cycle_id, rule, parameter_code, institution_id, severity, title, detail, suggested_action)
  SELECT p_cycle_id, 'reduce_frequency', pair.parameter_code, pair.institution_id, 'low',
    'Sample less — ' || pair.parameter_code || ' has stayed clean',
    format('Clean %s cycles running at this college. Sample once every %s cycles to focus effort where gaps actually recur.',
           pair.clean_streak, c.check_frequency + 1),
    jsonb_build_object('kind','reduce_frequency','new_frequency', c.check_frequency + 1, 'prev_frequency', c.check_frequency)
  FROM (
    SELECT parameter_code, institution_id, count(*) AS clean_streak
    FROM (
      SELECT parameter_code, institution_id, finding_count,
             row_number() OVER (PARTITION BY parameter_code, institution_id ORDER BY computed_at DESC) AS rn
      FROM audit_parameter_results
    ) x WHERE rn <= 2 AND finding_count = 0
    GROUP BY parameter_code, institution_id HAVING count(*) >= 2
  ) pair
  JOIN audit_parameter_catalog c ON c.code = pair.parameter_code
  WHERE c.check_frequency = 1 AND c.is_active
    AND NOT EXISTS (SELECT 1 FROM audit_adaptations a WHERE a.audit_cycle_id = p_cycle_id
       AND a.rule = 'reduce_frequency' AND a.parameter_code = pair.parameter_code
       AND a.institution_id IS NOT DISTINCT FROM pair.institution_id AND a.status IN ('applied','dismissed'));

  -- RULE 4 — tune thresholds from dismissed vs actioned rate (advisory; needs >= 3 findings)
  INSERT INTO audit_adaptations (audit_cycle_id, rule, parameter_code, institution_id, severity, title, detail, suggested_action)
  SELECT p_cycle_id, 'tune_threshold', f.pc, NULL,
    CASE WHEN f.dismiss_rate >= 0.5 THEN 'medium' ELSE 'low' END,
    CASE WHEN f.dismiss_rate >= 0.5 THEN 'Noisy check — ' || f.pc || ' is often dismissed'
         ELSE 'High-signal check — ' || f.pc || ' is always actioned' END,
    CASE WHEN f.dismiss_rate >= 0.5
      THEN format('%s%% of this parameter''s findings were dismissed as false positives (%s of %s). The check may be too broad — review its bar or evidence rule.',
                  round(f.dismiss_rate*100), f.dismissed, f.total)
      ELSE format('All %s findings for this parameter were actioned, none dismissed — a high-signal check. Keep it; consider tightening the bar.', f.total)
    END,
    jsonb_build_object('kind','tune_threshold','dismiss_rate', round(f.dismiss_rate, 2), 'total', f.total, 'dismissed', f.dismissed)
  FROM (SELECT form_data->>'parameter_code' AS pc, count(*) AS total,
               count(*) FILTER (WHERE status IN ('rejected','cancelled')) AS dismissed,
               (count(*) FILTER (WHERE status IN ('rejected','cancelled')))::numeric / NULLIF(count(*),0) AS dismiss_rate
        FROM service_requests WHERE service_type_id = v_ft AND form_data->>'parameter_code' IS NOT NULL
        GROUP BY 1 HAVING count(*) >= 3) f
  WHERE NOT EXISTS (SELECT 1 FROM audit_adaptations a WHERE a.audit_cycle_id = p_cycle_id
     AND a.rule = 'tune_threshold' AND a.parameter_code = f.pc
     AND a.institution_id IS NULL AND a.status IN ('applied','dismissed'));

  SELECT count(*) INTO v_n FROM audit_adaptations WHERE audit_cycle_id = p_cycle_id AND status = 'proposed';
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_compute_adaptations(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_compute_adaptations(uuid) TO authenticated;

-- 4. Apply an adaptation (human-gated; mutates catalog for reduce_frequency/escalate).
CREATE OR REPLACE FUNCTION public.fn_audit_apply_adaptation(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a public.audit_adaptations; v_kind text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.manage')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM audit_adaptations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'adaptation % not found', p_id USING ERRCODE = 'P0002'; END IF;
  IF a.status <> 'proposed' THEN RAISE EXCEPTION 'adaptation already %', a.status USING ERRCODE = '22023'; END IF;
  v_kind := a.suggested_action->>'kind';

  IF v_kind = 'reduce_frequency' THEN
    UPDATE audit_parameter_catalog
       SET check_frequency = GREATEST(1, (a.suggested_action->>'new_frequency')::smallint), updated_at = now()
     WHERE code = a.parameter_code;
  ELSIF v_kind = 'escalate' THEN
    UPDATE audit_parameter_catalog
       SET default_owner_role = COALESCE(a.suggested_action->>'new_owner_role', default_owner_role),
           p1_sla_days = (a.suggested_action->>'new_p1_sla')::smallint,
           p2_sla_days = (a.suggested_action->>'new_p2_sla')::smallint,
           updated_at = now()
     WHERE code = a.parameter_code;
  -- add_discovery / tune_threshold: acknowledge only (no auto-mutation; UI deep-links for discovery).
  END IF;

  UPDATE audit_adaptations
     SET status = 'applied', resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note, updated_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', 'applied', 'kind', v_kind);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_apply_adaptation(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_apply_adaptation(uuid, text) TO authenticated;

-- 5. Dismiss an adaptation (human-gated; no catalog change).
CREATE OR REPLACE FUNCTION public.fn_audit_dismiss_adaptation(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE a public.audit_adaptations;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.parameter.manage')) THEN
    RAISE EXCEPTION 'permission denied: audit.parameter.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM audit_adaptations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'adaptation % not found', p_id USING ERRCODE = 'P0002'; END IF;
  IF a.status <> 'proposed' THEN RAISE EXCEPTION 'adaptation already %', a.status USING ERRCODE = '22023'; END IF;
  UPDATE audit_adaptations
     SET status = 'dismissed', resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note, updated_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', 'dismissed');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_dismiss_adaptation(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_audit_dismiss_adaptation(uuid, text) TO authenticated;
