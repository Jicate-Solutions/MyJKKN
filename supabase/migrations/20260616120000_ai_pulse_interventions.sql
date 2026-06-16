-- ============================================================================
-- AI Pulse — department intervention audit (2026-06-16)
--
-- The HOD heatmap "Intervene" action (dept-heatmap-service.intervene) only
-- fired a notifications row — leaving NO durable record. The heatmap then
-- recomputed each dept's tier on every load and a recorded HOD-chat was not
-- tracked as "actioned". This table persists one row per intervention so the
-- grid can show a "last intervened {date}" hint and so governance has an
-- auditable trail.
--
-- RLS follows the project's standardized pattern (is_super_admin/is_admin
-- bypass + user_has_permission). Read gate mirrors the heatmap page
-- (aiPulse:dept.heatmap); write gate mirrors the intervene action
-- (aiPulse:dept.intervene). House style: see
-- 20260611220000_ai_pulse_lab_score_update_policy.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_pulse_interventions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_id         UUID,
  institution_id  UUID,
  cycle_id        UUID,
  tier            TEXT,
  requested_by    UUID,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Latest-intervention-per-dept read is the hot path (the grid hint).
CREATE INDEX IF NOT EXISTS ai_pulse_interventions_dept_created_idx
  ON public.ai_pulse_interventions (dept_id, created_at DESC);

ALTER TABLE public.ai_pulse_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_pulse_interventions_select" ON public.ai_pulse_interventions;
CREATE POLICY "ai_pulse_interventions_select" ON public.ai_pulse_interventions
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:dept.heatmap')
  );

DROP POLICY IF EXISTS "ai_pulse_interventions_insert" ON public.ai_pulse_interventions;
CREATE POLICY "ai_pulse_interventions_insert" ON public.ai_pulse_interventions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('aiPulse:dept.intervene')
  );

-- This is a TABLE — lock anon/PUBLIC and grant only the authenticated reads
-- + writes the policies above gate (no UPDATE/DELETE; rows are append-only).
REVOKE ALL ON public.ai_pulse_interventions FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.ai_pulse_interventions TO authenticated;

NOTIFY pgrst, 'reload schema';
