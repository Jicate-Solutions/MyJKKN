-- =====================================================================
-- Solutions Hub Phase C2 — Prospect follow-up reminder substrate
-- =====================================================================
-- Adds sh_get_overdue_prospects() RPC for the prospect-reminders cron.
--
-- Returns one row per active prospect (lead/qualified/proposal/negotiation)
-- whose next_action_date is in the past. Cron loops over the result and
-- creates Layer 0 work-item notifications via fn_create_dashboard_work_item().
--
-- SECURITY DEFINER + grant EXECUTE to authenticated so the API route can
-- invoke it under any authenticated session (cron uses service-role anyway,
-- but that has bypass; this guards future in-app callers).
--
-- Created 2026-05-02 — Solutions Hub PRD Phase C2.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sh_get_overdue_prospects()
RETURNS TABLE (
  id UUID,
  prospect_code TEXT,
  company_name TEXT,
  contact_person TEXT,
  assigned_to UUID,
  next_action TEXT,
  next_action_date DATE,
  days_overdue INTEGER,
  pipeline_stage TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.prospect_code,
    p.company_name,
    p.contact_person,
    p.assigned_to,
    p.next_action,
    p.next_action_date,
    (CURRENT_DATE - p.next_action_date)::INTEGER AS days_overdue,
    p.pipeline_stage::TEXT AS pipeline_stage
  FROM sh_prospects p
  WHERE p.next_action_date IS NOT NULL
    AND p.next_action_date < CURRENT_DATE
    AND p.pipeline_stage::TEXT IN ('lead','qualified','proposal','negotiation')
    AND p.is_active = TRUE
    AND p.assigned_to IS NOT NULL
  ORDER BY p.next_action_date ASC, p.company_name ASC;
$$;

REVOKE ALL ON FUNCTION public.sh_get_overdue_prospects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sh_get_overdue_prospects() TO authenticated, service_role;

COMMENT ON FUNCTION public.sh_get_overdue_prospects() IS
  'Solutions Hub C2: returns prospects whose next_action_date is overdue. Consumed by /api/cron/prospect-reminders. Active stages only.';
