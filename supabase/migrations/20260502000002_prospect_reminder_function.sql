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

-- Anon lock. `REVOKE ... FROM PUBLIC` alone is NOT enough here: Supabase ships
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`, so
-- every new function is born with a DIRECT anon grant that survives a PUBLIC
-- revoke. Without naming anon explicitly this RPC would be callable by any
-- unauthenticated client holding the public anon key, which is embedded in every
-- Next.js bundle. anon must be named. (CLAUDE.md, "Lock new RPCs from anon".)
REVOKE ALL     ON FUNCTION public.sh_get_overdue_prospects() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sh_get_overdue_prospects() FROM anon, PUBLIC;
-- Narrowed to service_role 2026-08-31: the function returns EVERY overdue
-- prospect regardless of RLS and carries no authorization check, so an
-- `authenticated` grant made the whole pipeline readable by any signed-in
-- account. Its only caller, getOverdueProspects() in
-- lib/services/solutions/prospect-reminders-service.ts, builds a
-- createServiceRoleClient(), so the cron is unaffected.
REVOKE EXECUTE ON FUNCTION public.sh_get_overdue_prospects() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.sh_get_overdue_prospects() TO service_role;

-- Guard: refuse the migration if anon can still reach it.
DO $anon_check$
BEGIN
  IF has_function_privilege('anon', 'public.sh_get_overdue_prospects()', 'EXECUTE') THEN
    RAISE EXCEPTION 'sh_get_overdue_prospects is still EXECUTE-able by anon - refusing to ship an unauthenticated RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.sh_get_overdue_prospects()', 'EXECUTE') THEN
    RAISE EXCEPTION 'sh_get_overdue_prospects is still EXECUTE-able by authenticated - it exposes the whole prospect pipeline';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.sh_get_overdue_prospects()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE sh_get_overdue_prospects - the cron would still fail';
  END IF;
END
$anon_check$;

COMMENT ON FUNCTION public.sh_get_overdue_prospects() IS
  'Solutions Hub C2: returns prospects whose next_action_date is overdue. Consumed by /api/cron/prospect-reminders. Active stages only.';
