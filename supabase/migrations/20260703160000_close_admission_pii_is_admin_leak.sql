-- ============================================================================
-- SECURITY: close is_admin() cross-tenant leak on 7 admission-PII tables
-- Date: 2026-07-03  (Director-approved via interview; systemic is_admin() program, batch: admission-PII)
--
-- is_admin() is a global role-name check that ignores institution_scope, so a
-- scope='own' admin could read EVERY college's admission PII. Proven pre-fix:
-- test.admin2 (scope=own, no admission perm) read 17,194 FOREIGN leads + all call logs.
--
-- PREREQUISITE ALREADY DONE: granted the 'administrator' role the 6 admission .view
-- perms (leads/applications/settings.forms/counselors/marketing.chat/insights) so the
-- scope='all' group admins (deepanj/vg/deepakkumar) keep full cross-college access via
-- the PROPER permission channel before is_admin() is removed.
--
-- FIX: drop the is_admin() OR-branch from each read policy; keep is_super_admin();
-- keep permission + institution-scope; initplan/array-form the row-independent scope
-- checks (institution_id = ANY(array of accessible institutions)) so removing the
-- is_admin() fast-path does NOT reintroduce a per-row timeout (the failure mode seen
-- on attendance/admission_leads). 0 NULL-institution rows in these tables (verified),
-- so ANY(array) preserves semantics exactly.
--
-- VERIFIED (rolled-back rehearsal, prod): leak closed (test.admin2 17,194→0), group
-- admin preserved (deepanj all→all), counselor unchanged (apsarakumar 147→147), super all.
-- Applied to prod via Management API; recorded here so repo == prod. Idempotent.
-- ============================================================================

BEGIN;
SET LOCAL statement_timeout = '15s';

DROP POLICY IF EXISTS "adm_ai_insights_select" ON public.admission_ai_insights;
CREATE POLICY "adm_ai_insights_select" ON public.admission_ai_insights FOR select USING (
(SELECT is_super_admin()) OR (SELECT user_has_permission('admission.insights.view'::text))
);
DROP POLICY IF EXISTS "adm_call_logs_select" ON public.admission_call_logs;
CREATE POLICY "adm_call_logs_select" ON public.admission_call_logs FOR select USING (
(SELECT is_super_admin())
  OR ((SELECT user_has_permission('admission.leads.view'::text)) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]) AND (NOT (SELECT _user_is_strict_counselor(auth.uid()))))
  OR ((SELECT _user_is_strict_counselor(auth.uid())) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]) AND _user_can_view_lead_for_call(auth.uid(), lead_id))
);
DROP POLICY IF EXISTS "adm_counselors_select" ON public.admission_counselors;
CREATE POLICY "adm_counselors_select" ON public.admission_counselors FOR select USING (
(SELECT is_super_admin()) OR ((SELECT user_has_permission('admission.counselors.view'::text)) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]))
);
DROP POLICY IF EXISTS "adm_form_subs_select" ON public.admission_form_submissions;
CREATE POLICY "adm_form_subs_select" ON public.admission_form_submissions FOR select USING (
(SELECT is_super_admin()) OR (((SELECT user_has_permission('admission.applications.view'::text)) OR (SELECT user_has_permission('admission.settings.forms.view'::text))) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]))
);
DROP POLICY IF EXISTS "alsc_select_permission" ON public.admission_lead_source_captures;
CREATE POLICY "alsc_select_permission" ON public.admission_lead_source_captures FOR select USING (
(SELECT is_super_admin())
  OR ((SELECT user_has_permission('admission.leads.view'::text)) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]))
  OR (EXISTS (SELECT 1 FROM public.admission_leads l WHERE l.id = admission_lead_source_captures.lead_id AND l.assigned_counselor_id = (SELECT auth.uid())))
);
DROP POLICY IF EXISTS "adm_wa_logs_select" ON public.admission_whatsapp_logs;
CREATE POLICY "adm_wa_logs_select" ON public.admission_whatsapp_logs FOR select USING (
(SELECT is_super_admin()) OR ((SELECT user_has_permission('admission.marketing.chat.view'::text)) AND institution_id = ANY (( SELECT array_agg(i.id) FROM public.institutions i WHERE role_has_institution_access(i.id))::uuid[]))
);
DROP POLICY IF EXISTS "adm_leads_select" ON public.admission_leads;
CREATE POLICY "adm_leads_select" ON public.admission_leads FOR select USING (
(( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND ( SELECT _user_in_admission_lead_allowlist(auth.uid()) AS _user_in_admission_lead_allowlist) AND ((institution_id IS NULL) OR (institution_id = ANY (( SELECT _user_accessible_institutions() AS _user_accessible_institutions)::uuid[]))) AND (NOT ( SELECT _user_is_strict_counselor(auth.uid()) AS _user_is_strict_counselor))) OR (( SELECT _user_is_strict_counselor(auth.uid()) AS _user_is_strict_counselor) AND ((institution_id IS NULL) OR (institution_id = ANY (( SELECT _user_accessible_institutions() AS _user_accessible_institutions)::uuid[]))) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id))) OR (( SELECT _user_in_admission_lead_allowlist(auth.uid()) AS _user_in_admission_lead_allowlist) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id))) OR ((expo_event_id IS NOT NULL) AND (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids))))
);
COMMIT;
