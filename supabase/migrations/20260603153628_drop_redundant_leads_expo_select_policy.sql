-- Drop the redundant permissive SELECT policy leads_select_expo_team_member on
-- admission_leads. adm_leads_select already contains an identical expo branch
--   ((expo_event_id IS NOT NULL) AND (expo_event_id IN (SELECT get_my_expo_team_event_ids())))
-- so this standalone policy only adds a second permissive-policy evaluation +
-- a duplicate get_my_expo_team_event_ids() call per SELECT (flagged by the
-- performance advisor as multiple_permissive_policies). Expo team members keep
-- access via adm_leads_select's expo branch.
DROP POLICY IF EXISTS "leads_select_expo_team_member" ON public.admission_leads;
