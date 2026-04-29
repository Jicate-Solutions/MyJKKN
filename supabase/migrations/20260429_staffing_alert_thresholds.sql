-- Created: 2026-04-29 — Staffing-imbalance alert thresholds (config-row pattern)
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write.
--
-- Replaces hardcoded constants in components/admission/counselor-staffing-alert.tsx
-- (specifically OVERLOAD_RATIO_THRESHOLD = 3 and the implicit "orphan_count > 0" check).
--
-- Companion service: lib/services/admin/staffing-alert-thresholds-service.ts
-- Companion admin UI: app/(routes)/admin/counselors/alert-thresholds/page.tsx
--
-- Applied via Supabase MCP `apply_migration` 2026-04-29.

CREATE TABLE IF NOT EXISTS public.staffing_alert_thresholds (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES auth.users
);

COMMENT ON TABLE public.staffing_alert_thresholds IS
  'Director-tunable thresholds for the counselor staffing-imbalance alert widget. One row per threshold key.';

ALTER TABLE public.staffing_alert_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saht_admin_read" ON public.staffing_alert_thresholds;
CREATE POLICY "saht_admin_read" ON public.staffing_alert_thresholds
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key = 'admission'
    )
  );

DROP POLICY IF EXISTS "saht_admin_write" ON public.staffing_alert_thresholds;
CREATE POLICY "saht_admin_write" ON public.staffing_alert_thresholds
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE OR REPLACE FUNCTION public.get_staffing_threshold(p_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT value FROM public.staffing_alert_thresholds WHERE key = p_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_staffing_threshold(text) TO authenticated;

-- Seed defaults to MATCH current hardcoded behaviour in
-- components/admission/counselor-staffing-alert.tsx (OVERLOAD_RATIO_THRESHOLD = 3).
-- max_open_leads_alert and orphan_institution_alert are new threshold rows but
-- match the widget's existing implicit "any > 0" check for orphan_count and a
-- conservative single-counselor overload guardrail seeded at 1000.
INSERT INTO public.staffing_alert_thresholds (key, value, description) VALUES
  ('max_to_median_ratio',     '{"ratio": 3.0}'::jsonb,        'Trigger imbalance alert if max_open_leads / median_open_leads > this'),
  ('max_open_leads_alert',    '{"threshold": 1000}'::jsonb,   'Trigger overload alert if any single counselor has more than this'),
  ('orphan_institution_alert','{"min_unassigned": 1}'::jsonb, 'Trigger orphan-institution alert if at least this many institutions have unassigned leads + 0 active counselors')
ON CONFLICT (key) DO NOTHING;
