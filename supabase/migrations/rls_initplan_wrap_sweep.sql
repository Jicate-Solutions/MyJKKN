-- 2026-07-31 PERF: platform-wide RLS InitPlan sweep (applied to production 2026-07-31).
-- Wraps per-row-constant calls (auth.uid()/auth.jwt(), zero-arg / literal-arg helper
-- functions) in scalar sub-selects so each is evaluated once per query instead of once
-- per row. Mechanical, semantics-preserving; every applied batch passed a persona
-- visibility gate (row counts as a real student + real faculty unchanged, else the
-- batch aborted). Bare auth.uid() policies: 1,273 -> 1 (one table lock-held, parked).
-- This file reproduces the exact live expressions read back from production.
ALTER POLICY "Students can view academic years on their own bills" ON public.academic_years USING ((id IN ( SELECT b.academic_year_id
   FROM billing_student_bills b
  WHERE ((b.academic_year_id IS NOT NULL) AND (b.student_id IN ( SELECT lp.id
           FROM (learners_profiles lp
             JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text))))))));
ALTER POLICY "academic_years_delete_by_role" ON public.academic_years USING ((EXISTS ( SELECT 1
   FROM (profiles p
     LEFT JOIN custom_roles cr ON ((lower((cr.role_name)::text) = lower(p.role))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (((cr.permissions ->> 'academic.years.delete'::text))::boolean = true)) AND ((p.role = 'super_admin'::text) OR (p.institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)))))));
ALTER POLICY "academic_years_insert_by_role" ON public.academic_years WITH CHECK ((EXISTS ( SELECT 1
   FROM (profiles p
     LEFT JOIN custom_roles cr ON ((lower((cr.role_name)::text) = lower(p.role))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (((cr.permissions ->> 'academic.years.create'::text))::boolean = true)) AND ((p.role = 'super_admin'::text) OR (p.institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)))))));
ALTER POLICY "academic_years_select_permission" ON public.academic_years USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.years.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "academic_years_update_by_role" ON public.academic_years USING ((EXISTS ( SELECT 1
   FROM (profiles p
     LEFT JOIN custom_roles cr ON ((lower((cr.role_name)::text) = lower(p.role))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (((cr.permissions ->> 'academic.years.edit'::text))::boolean = true)) AND ((p.role = 'super_admin'::text) OR (p.institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)))))));
ALTER POLICY "students_view_own_academic_year" ON public.academic_years USING ((EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON ((p.learner_id = lp.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (lp.academic_year_id = academic_years.id)))));
ALTER POLICY "accommodation_types_read" ON public.accommodation_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "accommodation_types_write" ON public.accommodation_types USING (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission));
ALTER POLICY "accred_cert_kinds_manage" ON public.accreditation_certificate_kinds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "accred_cert_kinds_select" ON public.accreditation_certificate_kinds USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "accred_certs_manage" ON public.accreditation_certificates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.certificates.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.certificates.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_certs_select" ON public.accreditation_certificates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('accreditation.certificates.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('accreditation.iiqa.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('accreditation.iiqa.read_only_external'::text) AS user_has_permission)))));
ALTER POLICY "acm_select" ON public.accreditation_committee_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "acm_write" ON public.accreditation_committee_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.meetings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.meetings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "members_delete" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.committees.edit'::text) AS user_has_permission)));
ALTER POLICY "members_insert" ON public.accreditation_committee_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.committees.edit'::text) AS user_has_permission)));
ALTER POLICY "members_select" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.committees.view'::text) AS user_has_permission)));
ALTER POLICY "members_update" ON public.accreditation_committee_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('accreditation.committees.edit'::text) AS user_has_permission)));
ALTER POLICY "acr_select" ON public.accreditation_committee_resolutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "acr_write" ON public.accreditation_committee_resolutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.meetings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.meetings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_delete" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.committees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_insert" ON public.accreditation_committees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.committees.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_select" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "committees_update" ON public.accreditation_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.committees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "digest_delete_self" ON public.accreditation_digest_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "digest_insert_self" ON public.accreditation_digest_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "digest_select_own_or_admin" ON public.accreditation_digest_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "digest_update_self" ON public.accreditation_digest_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "iiqa_snapshots_delete" ON public.accreditation_iiqa_snapshots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.iiqa.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (NOT is_locked))));
ALTER POLICY "iiqa_snapshots_insert" ON public.accreditation_iiqa_snapshots WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.iiqa.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "iiqa_snapshots_select" ON public.accreditation_iiqa_snapshots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('accreditation.iiqa.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('accreditation.iiqa.read_only_external'::text) AS user_has_permission)))));
ALTER POLICY "iiqa_snapshots_update" ON public.accreditation_iiqa_snapshots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.iiqa.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND ((NOT is_locked) OR (unlocked_at IS NOT NULL))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.iiqa.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_meeting_drafts_select" ON public.accreditation_meeting_drafts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_meeting_proposals_select" ON public.accreditation_meeting_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.committees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_metric_crosswalk_manage" ON public.accreditation_metric_crosswalk USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "accred_metric_crosswalk_select" ON public.accreditation_metric_crosswalk USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "accred_narratives_select" ON public.accreditation_metric_narratives USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (owner_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('accreditation.naac.narrative.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_metric_owners_manage" ON public.accreditation_metric_owners USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('accreditation.naac.narrative.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('accreditation.naac.narrative.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_metric_owners_select" ON public.accreditation_metric_owners USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.narrative.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "accred_snapshot_kinds_manage" ON public.accreditation_snapshot_kinds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "accred_snapshot_kinds_select" ON public.accreditation_snapshot_kinds USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "stakeholder_invites_delete" ON public.accreditation_stakeholder_invites USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_invites.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_invites_insert" ON public.accreditation_stakeholder_invites WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_invites.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_invites_select" ON public.accreditation_stakeholder_invites USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_invites.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_invites_update" ON public.accreditation_stakeholder_invites USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_invites.survey_id) AND role_has_institution_access(s.institution_id))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_invites.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_responses_delete" ON public.accreditation_stakeholder_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_responses.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_responses_insert" ON public.accreditation_stakeholder_responses WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_responses.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_responses_select" ON public.accreditation_stakeholder_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM accreditation_stakeholder_surveys s
  WHERE ((s.id = accreditation_stakeholder_responses.survey_id) AND role_has_institution_access(s.institution_id)))))));
ALTER POLICY "stakeholder_surveys_delete" ON public.accreditation_stakeholder_surveys USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "stakeholder_surveys_insert" ON public.accreditation_stakeholder_surveys WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "stakeholder_surveys_select" ON public.accreditation_stakeholder_surveys USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "stakeholder_surveys_update" ON public.accreditation_stakeholder_surveys USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.naac.surveys.stakeholder.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "submissions_insert" ON public.accreditation_submissions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.submissions.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "submissions_select" ON public.accreditation_submissions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.submissions.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "submissions_update" ON public.accreditation_submissions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.submissions.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "consents_insert_self" ON public.accreditation_survey_consents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('accreditation.consents.create'::text) AS user_has_permission)));
ALTER POLICY "consents_select_own_or_admin" ON public.accreditation_survey_consents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('accreditation.consents.view'::text) AS user_has_permission)));
ALTER POLICY "consents_update_withdraw" ON public.accreditation_survey_consents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('accreditation.consents.withdraw'::text) AS user_has_permission)));
ALTER POLICY "extension_admin" ON public.action_extension_requests USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "extension_own" ON public.action_extension_requests USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "action_responses_admin" ON public.action_responses USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "action_responses_own" ON public.action_responses USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "activity_alert_history_select" ON public.activity_alert_history USING (((institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) IS TRUE)));
ALTER POLICY "activity_alert_rules_delete" ON public.activity_alert_rules USING (((institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) IS TRUE)));
ALTER POLICY "activity_alert_rules_insert" ON public.activity_alert_rules WITH CHECK (((institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) IS TRUE)));
ALTER POLICY "activity_alert_rules_select" ON public.activity_alert_rules USING (((institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) IS TRUE)));
ALTER POLICY "activity_alert_rules_update" ON public.activity_alert_rules USING (((institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) IS TRUE)));
ALTER POLICY "aatl_read" ON public.admission_account_transition_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('admission_documents.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_ai_insights_delete" ON public.admission_ai_insights USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.insights.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_ai_insights_insert" ON public.admission_ai_insights WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.insights.view'::text) AS user_has_permission)));
ALTER POLICY "adm_ai_insights_update" ON public.admission_ai_insights USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.insights.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "applications_delete" ON public.admission_applications USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "applications_insert" ON public.admission_applications WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "applications_select" ON public.admission_applications USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "applications_update" ON public.admission_applications USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "adm_assign_rules_all" ON public.admission_assignment_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.assignment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "auth_read_call_intel" ON public.admission_call_intelligence USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))));
ALTER POLICY "adm_call_logs_delete" ON public.admission_call_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_call_logs_insert" ON public.admission_call_logs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.create'::text) AS user_has_permission)));
ALTER POLICY "adm_call_logs_select" ON public.admission_call_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND (institution_id = ANY (( SELECT array_agg(i.id) AS array_agg
   FROM institutions i
  WHERE role_has_institution_access(i.id))::uuid[])) AND (NOT ( SELECT _user_is_strict_counselor(( SELECT auth.uid() AS uid)) AS _user_is_strict_counselor))) OR (( SELECT _user_is_strict_counselor(( SELECT auth.uid() AS uid)) AS _user_is_strict_counselor) AND (institution_id = ANY (( SELECT array_agg(i.id) AS array_agg
   FROM institutions i
  WHERE role_has_institution_access(i.id))::uuid[])) AND _user_can_view_lead_for_call(( SELECT auth.uid() AS uid), lead_id))));
ALTER POLICY "adm_call_logs_update" ON public.admission_call_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (NOT _user_is_strict_counselor(( SELECT auth.uid() AS uid)))) OR (_user_is_strict_counselor(( SELECT auth.uid() AS uid)) AND role_has_institution_access(institution_id) AND _user_can_view_lead_for_call(( SELECT auth.uid() AS uid), lead_id))));
ALTER POLICY "auth_read_callback_queue" ON public.admission_callback_queue USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))));
ALTER POLICY "p_clicks_select" ON public.admission_campaign_link_clicks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_campaigns c
  WHERE ((c.id = admission_campaign_link_clicks.campaign_id) AND ((c.scope = 'global'::text) OR role_has_institution_access(c.institution_id))))))));
ALTER POLICY "p_links_insert" ON public.admission_campaign_links WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.marketing.create'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_campaigns c
  WHERE ((c.id = admission_campaign_links.campaign_id) AND ((c.scope = 'global'::text) OR role_has_institution_access(c.institution_id))))))));
ALTER POLICY "p_links_select" ON public.admission_campaign_links USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.view'::text) AS user_has_permission) AND (_campaign_link_is_global(id) OR role_has_institution_access(_campaign_link_institution_id(id))))));
ALTER POLICY "p_links_update" ON public.admission_campaign_links USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND (_campaign_link_is_global(id) OR role_has_institution_access(_campaign_link_institution_id(id)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND (_campaign_link_is_global(id) OR role_has_institution_access(_campaign_link_institution_id(id))))));
ALTER POLICY "adm_campaign_logs_delete" ON public.admission_campaign_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_campaign_logs_insert" ON public.admission_campaign_logs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.marketing.create'::text) AS user_has_permission)));
ALTER POLICY "adm_campaign_logs_select" ON public.admission_campaign_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_campaign_logs_update" ON public.admission_campaign_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_campaign_queue_delete" ON public.admission_campaign_queue USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_campaign_queue_insert" ON public.admission_campaign_queue WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.marketing.create'::text) AS user_has_permission)));
ALTER POLICY "adm_campaign_queue_select" ON public.admission_campaign_queue USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_campaign_queue_update" ON public.admission_campaign_queue USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "p_campaigns_insert" ON public.admission_campaigns WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((scope = 'institution'::text) AND (( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) OR ((scope = 'global'::text) AND (( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.create'::text) AS user_has_permission) AND user_has_all_institution_access())))));
ALTER POLICY "p_campaigns_select" ON public.admission_campaigns USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.view'::text) AS user_has_permission) AND ((scope = 'global'::text) OR role_has_institution_access(institution_id)))));
ALTER POLICY "p_campaigns_update" ON public.admission_campaigns USING ((( SELECT is_super_admin() AS is_super_admin) OR ((scope = 'institution'::text) AND (( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((scope = 'institution'::text) AND (( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))))));
ALTER POLICY "admission_checklist_completions_select" ON public.admission_checklist_completions USING (( SELECT user_has_permission('admission.enquiries.checklist.view'::text) AS user_has_permission));
ALTER POLICY "admission_checklist_items_delete" ON public.admission_checklist_items USING (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "admission_checklist_items_insert" ON public.admission_checklist_items WITH CHECK (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "admission_checklist_items_select" ON public.admission_checklist_items USING ((( SELECT user_has_permission('admission.settings.checklists.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.enquiries.checklist.view'::text) AS user_has_permission)));
ALTER POLICY "admission_checklist_items_update" ON public.admission_checklist_items USING (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "admission_checklists_delete" ON public.admission_checklists USING (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "admission_checklists_insert" ON public.admission_checklists WITH CHECK (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "admission_checklists_select" ON public.admission_checklists USING ((( SELECT user_has_permission('admission.settings.checklists.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.enquiries.checklist.view'::text) AS user_has_permission)));
ALTER POLICY "admission_checklists_update" ON public.admission_checklists USING (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission.settings.checklists.manage'::text) AS user_has_permission));
ALTER POLICY "adm_templates_delete" ON public.admission_communication_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.templates.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_templates_insert" ON public.admission_communication_templates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.templates.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_templates_select" ON public.admission_communication_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.templates.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_templates_update" ON public.admission_communication_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.templates.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "duty_log_select_admin_or_perm" ON public.admission_counselor_duty_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.duty_log.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.counselors.view'::text) AS user_has_permission)));
ALTER POLICY "counselor_institutions_modify" ON public.admission_counselor_institutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.team.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.team.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "counselor_institutions_select" ON public.admission_counselor_institutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.team.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "counselor_schedules_modify" ON public.admission_counselor_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.team.manage'::text) AS user_has_permission)));
ALTER POLICY "counselor_schedules_select" ON public.admission_counselor_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.team.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_counselors c
  WHERE ((c.id = admission_counselor_schedules.counselor_id) AND role_has_institution_access(c.institution_id)))))));
ALTER POLICY "counselor_sources_modify" ON public.admission_counselor_sources USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.team.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.sources.manage'::text) AS user_has_permission)));
ALTER POLICY "counselor_sources_select" ON public.admission_counselor_sources USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('admission.counselors.team.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.sources.view'::text) AS user_has_permission)) AND (EXISTS ( SELECT 1
   FROM admission_counselors c
  WHERE ((c.id = admission_counselor_sources.counselor_id) AND role_has_institution_access(c.institution_id)))))));
ALTER POLICY "adm_counselors_delete" ON public.admission_counselors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_counselors_insert" ON public.admission_counselors WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.create'::text) AS user_has_permission)));
ALTER POLICY "adm_counselors_update" ON public.admission_counselors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_counselors_audit_log_select" ON public.admission_counselors_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.permissions_audit.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.counselors.view'::text) AS user_has_permission)));
ALTER POLICY "adm_briefings_delete" ON public.admission_daily_briefings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_briefings_insert" ON public.admission_daily_briefings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.view'::text) AS user_has_permission)));
ALTER POLICY "adm_briefings_select" ON public.admission_daily_briefings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "adm_briefings_update" ON public.admission_daily_briefings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "adm_drip_exec_delete" ON public.admission_drip_execution_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_exec_select" ON public.admission_drip_execution_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.view'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_exec_update" ON public.admission_drip_execution_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_sched_delete" ON public.admission_drip_schedule USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_sched_insert" ON public.admission_drip_schedule WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_sched_select" ON public.admission_drip_schedule USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.view'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_sched_update" ON public.admission_drip_schedule USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_seq_delete" ON public.admission_drip_sequences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_drip_seq_insert" ON public.admission_drip_sequences WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_drip_seq_select" ON public.admission_drip_sequences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_drip_seq_update" ON public.admission_drip_sequences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_email_logs_delete" ON public.admission_email_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_email_logs_insert" ON public.admission_email_logs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_email_logs_select" ON public.admission_email_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_email_logs_update" ON public.admission_email_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fee_adjustments_read" ON public.admission_fee_adjustments USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_adjustments.learner_id) AND ( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_adjustments_write" ON public.admission_fee_adjustments USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_adjustments.learner_id) AND ( SELECT user_has_permission('admission_fees.manage_adjustments'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_adjustments.learner_id) AND ( SELECT user_has_permission('admission_fees.manage_adjustments'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_change_event_lines_read" ON public.admission_fee_change_event_lines USING ((EXISTS ( SELECT 1
   FROM (admission_fee_change_events e
     JOIN learners_profiles lp ON ((lp.id = e.learner_id)))
  WHERE ((e.id = admission_fee_change_event_lines.event_id) AND ( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_change_event_lines_write" ON public.admission_fee_change_event_lines USING ((EXISTS ( SELECT 1
   FROM (admission_fee_change_events e
     JOIN learners_profiles lp ON ((lp.id = e.learner_id)))
  WHERE ((e.id = admission_fee_change_event_lines.event_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (admission_fee_change_events e
     JOIN learners_profiles lp ON ((lp.id = e.learner_id)))
  WHERE ((e.id = admission_fee_change_event_lines.event_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_change_events_read" ON public.admission_fee_change_events USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_change_events.learner_id) AND ( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_change_events_write" ON public.admission_fee_change_events USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_change_events.learner_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = admission_fee_change_events.learner_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "fee_structure_communities_read" ON public.admission_fee_structure_communities USING ((( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_communities.fee_structure_id) AND role_has_institution_access(fs.institution_id))))));
ALTER POLICY "fee_structure_communities_write" ON public.admission_fee_structure_communities USING ((( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_communities.fee_structure_id) AND role_has_institution_access(fs.institution_id)))))) WITH CHECK ((( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_communities.fee_structure_id) AND role_has_institution_access(fs.institution_id))))));
ALTER POLICY "fee_structure_items_read" ON public.admission_fee_structure_items USING ((EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_items.fee_structure_id) AND ( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(fs.institution_id)))));
ALTER POLICY "fee_structure_items_write" ON public.admission_fee_structure_items USING ((EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_items.fee_structure_id) AND ( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND role_has_institution_access(fs.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM admission_fee_structures fs
  WHERE ((fs.id = admission_fee_structure_items.fee_structure_id) AND ( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND role_has_institution_access(fs.institution_id)))));
ALTER POLICY "fee_structures_delete" ON public.admission_fee_structures USING ((( SELECT user_has_permission('admission_fees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "fee_structures_insert" ON public.admission_fee_structures WITH CHECK ((( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "fee_structures_read" ON public.admission_fee_structures USING ((( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "fee_structures_update" ON public.admission_fee_structures USING ((( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "admission_form_abandon_log_insert_deny" ON public.admission_form_abandon_log WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "admission_form_abandon_log_select" ON public.admission_form_abandon_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.applications.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.forms.view'::text) AS user_has_permission)));
ALTER POLICY "admission_form_abandon_log_update_deny" ON public.admission_form_abandon_log USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "admission_form_templates_select" ON public.admission_form_templates USING (((is_system = true) OR (( SELECT auth.uid() AS uid) IS NOT NULL)));
ALTER POLICY "adm_forms_delete" ON public.admission_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.forms.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_forms_insert" ON public.admission_forms WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.forms.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_forms_select" ON public.admission_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.forms.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_forms_update" ON public.admission_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.forms.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.forms.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "gdpi_candidates_delete" ON public.admission_gdpi_candidates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_candidates_insert" ON public.admission_gdpi_candidates WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_candidates_select" ON public.admission_gdpi_candidates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_candidates_update" ON public.admission_gdpi_candidates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_evaluators_delete" ON public.admission_gdpi_evaluators USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_evaluators_insert" ON public.admission_gdpi_evaluators WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_evaluators_select" ON public.admission_gdpi_evaluators USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_evaluators_update" ON public.admission_gdpi_evaluators USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_scores_delete" ON public.admission_gdpi_scores USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_scores_insert" ON public.admission_gdpi_scores WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_scores_select" ON public.admission_gdpi_scores USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_scores_update" ON public.admission_gdpi_scores USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_sessions_delete" ON public.admission_gdpi_sessions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_sessions_insert" ON public.admission_gdpi_sessions WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_sessions_select" ON public.admission_gdpi_sessions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "gdpi_sessions_update" ON public.admission_gdpi_sessions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "historical_pivot_delete_admin_only" ON public.admission_historical_pivot USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "historical_pivot_insert_admin_only" ON public.admission_historical_pivot WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "historical_pivot_select_permission" ON public.admission_historical_pivot USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.analytics.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_years ay
  WHERE ((ay.id = admission_historical_pivot.admission_year_id) AND role_has_institution_access(ay.institution_id)))))));
ALTER POLICY "historical_pivot_update_admin_only" ON public.admission_historical_pivot USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "adm_integ_logs_select" ON public.admission_integration_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_integrations_all" ON public.admission_integrations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_lead_activities_all" ON public.admission_lead_activities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission)));
ALTER POLICY "cascade_history_insert" ON public.admission_lead_cascade_history WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.counselors.team.manage'::text) AS user_has_permission)));
ALTER POLICY "cascade_history_select" ON public.admission_lead_cascade_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.counselors.team.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM admission_counselors c
  WHERE (((c.id = admission_lead_cascade_history.from_counselor_id) OR (c.id = admission_lead_cascade_history.to_counselor_id)) AND role_has_institution_access(c.institution_id)))))));
ALTER POLICY "adm_lead_scores_delete" ON public.admission_lead_scores USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_lead_scores_insert" ON public.admission_lead_scores WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.create'::text) AS user_has_permission)));
ALTER POLICY "adm_lead_scores_select" ON public.admission_lead_scores USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_lead_scores_update" ON public.admission_lead_scores USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "alsc_delete_permission" ON public.admission_lead_source_captures USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "alsc_insert_permission" ON public.admission_lead_source_captures WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.create'::text) AS user_has_permission)));
ALTER POLICY "alsc_update_permission" ON public.admission_lead_source_captures USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "lead_sources_master_modify" ON public.admission_lead_sources_master USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.sources.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.sources.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "lead_sources_master_select" ON public.admission_lead_sources_master USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.sources.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_stage_history_delete" ON public.admission_lead_stage_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission)));
ALTER POLICY "adm_stage_history_insert" ON public.admission_lead_stage_history WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission)));
ALTER POLICY "adm_stage_history_select" ON public.admission_lead_stage_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission)));
ALTER POLICY "adm_stage_history_update" ON public.admission_lead_stage_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission)));
ALTER POLICY "adm_leads_delete" ON public.admission_leads USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND ((institution_id IS NULL) OR (institution_id = ANY (_user_accessible_institutions()))))));
ALTER POLICY "adm_leads_insert" ON public.admission_leads WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.create'::text) AS user_has_permission)));
ALTER POLICY "adm_leads_select" ON public.admission_leads USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND ( SELECT _user_in_admission_lead_allowlist(( SELECT auth.uid() AS uid)) AS _user_in_admission_lead_allowlist) AND ((institution_id IS NULL) OR (institution_id = ANY (( SELECT _user_accessible_institutions() AS _user_accessible_institutions)::uuid[]))) AND (NOT ( SELECT _user_is_strict_counselor(( SELECT auth.uid() AS uid)) AS _user_is_strict_counselor))) OR (( SELECT _user_is_strict_counselor(( SELECT auth.uid() AS uid)) AS _user_is_strict_counselor) AND ((institution_id IS NULL) OR (institution_id = ANY (( SELECT _user_accessible_institutions() AS _user_accessible_institutions)::uuid[]))) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id))) OR (( SELECT _user_in_admission_lead_allowlist(( SELECT auth.uid() AS uid)) AS _user_in_admission_lead_allowlist) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id))) OR ((expo_event_id IS NOT NULL) AND (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids)))));
ALTER POLICY "adm_leads_update" ON public.admission_leads USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND _user_in_admission_lead_allowlist(( SELECT auth.uid() AS uid)) AND ((institution_id IS NULL) OR (institution_id = ANY (_user_accessible_institutions()))) AND (NOT _user_is_strict_counselor(( SELECT auth.uid() AS uid)))) OR (_user_is_strict_counselor(( SELECT auth.uid() AS uid)) AND ((institution_id IS NULL) OR (institution_id = ANY (_user_accessible_institutions()))) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id))) OR (_user_in_admission_lead_allowlist(( SELECT auth.uid() AS uid)) AND (source <> 'referral'::lead_source) AND ((assigned_counselor_id = ( SELECT auth.uid() AS uid)) OR _user_owns_lead_via_counselor_id(( SELECT auth.uid() AS uid), counselor_id)))));
ALTER POLICY "admission_package_communities_delete" ON public.admission_package_communities USING (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "admission_package_communities_insert" ON public.admission_package_communities WITH CHECK (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "admission_package_program_eligibility_delete" ON public.admission_package_program_eligibility USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "admission_package_program_eligibility_insert" ON public.admission_package_program_eligibility WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "admission_packages_delete" ON public.admission_packages USING ((( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "admission_packages_insert" ON public.admission_packages WITH CHECK (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "admission_packages_update" ON public.admission_packages USING ((( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "process_metrics_delete" ON public.admission_process_metrics USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "process_metrics_insert" ON public.admission_process_metrics WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "process_metrics_select" ON public.admission_process_metrics USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "process_metrics_update" ON public.admission_process_metrics USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "adm_scoring_rules_all" ON public.admission_scoring_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_settings_write" ON public.admission_settings_per_institution USING ((( SELECT user_has_permission('admission.settings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('admission.settings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "adm_sms_logs_delete" ON public.admission_sms_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_sms_logs_insert" ON public.admission_sms_logs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_sms_logs_select" ON public.admission_sms_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_sms_logs_update" ON public.admission_sms_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_statuses_delete" ON public.admission_statuses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "admission_statuses_insert" ON public.admission_statuses WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.statuses.manage'::text) AS user_has_permission)));
ALTER POLICY "admission_statuses_select" ON public.admission_statuses USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "admission_statuses_update" ON public.admission_statuses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.statuses.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.statuses.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_tasks_delete" ON public.admission_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_tasks_insert" ON public.admission_tasks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.create'::text) AS user_has_permission)));
ALTER POLICY "adm_tasks_select" ON public.admission_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_tasks_update" ON public.admission_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_wa_logs_delete" ON public.admission_whatsapp_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_wa_logs_insert" ON public.admission_whatsapp_logs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_wa_logs_update" ON public.admission_whatsapp_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.chat.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_wf_configs_all" ON public.admission_workflow_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_wf_exec_select" ON public.admission_workflow_executions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.view'::text) AS user_has_permission)));
ALTER POLICY "adm_workflows_delete" ON public.admission_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_workflows_insert" ON public.admission_workflows WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission)));
ALTER POLICY "adm_workflows_select" ON public.admission_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "adm_workflows_update" ON public.admission_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.workflows.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_years_delete" ON public.admission_years USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.years.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_years_insert" ON public.admission_years WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.years.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "admission_years_update" ON public.admission_years USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.settings.years.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_jobs_read_own" ON public.ai_jobs USING ((requested_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "ai_model_config_read_super_admin" ON public.ai_model_config USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "ai_model_config_write_super_admin" ON public.ai_model_config USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "ai_model_config_audit_insert_super_admin" ON public.ai_model_config_audit WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "ai_model_config_audit_read_super_admin" ON public.ai_model_config_audit USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "ai_model_usage_read_super_admin" ON public.ai_model_usage USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "ai_prompt_graduation_proposals_admin_read" ON public.ai_prompt_graduation_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_prompt_judgments_admin_read" ON public.ai_prompt_judgments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_prompt_versions_admin_read" ON public.ai_prompt_versions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_pulse_anomaly_flags_select_reviewer" ON public.ai_pulse_anomaly_flags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('aiPulse:anomaly.review'::text) AS user_has_permission)));
ALTER POLICY "ai_pulse_anomaly_flags_super_admin_delete" ON public.ai_pulse_anomaly_flags USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "ai_pulse_anomaly_flags_super_admin_insert" ON public.ai_pulse_anomaly_flags WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_pulse_anomaly_flags_update_reviewer" ON public.ai_pulse_anomaly_flags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('aiPulse:anomaly.review'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('aiPulse:anomaly.review'::text) AS user_has_permission)));
ALTER POLICY "apco_select" ON public.ai_pulse_cycle_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:dept.heatmap'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_featured_tools_champion_write" ON public.ai_pulse_featured_tools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:tool.feature'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:tool.feature'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_featured_tools_select_scoped" ON public.ai_pulse_featured_tools USING (((is_active = true) AND ((institution_id IS NULL) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_interventions_insert" ON public.ai_pulse_interventions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('aiPulse:dept.intervene'::text) AS user_has_permission)));
ALTER POLICY "ai_pulse_interventions_select" ON public.ai_pulse_interventions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:dept.heatmap'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_live_attendance_insert" ON public.ai_pulse_live_attendance WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('aiPulse:attendance.mark'::text) AS user_has_permission)));
ALTER POLICY "ai_pulse_live_attendance_select" ON public.ai_pulse_live_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('aiPulse:attendance.mark'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('aiPulse:anomaly.review'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_live_attendance_update" ON public.ai_pulse_live_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('aiPulse:attendance.mark'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_policies_super_admin_write" ON public.ai_pulse_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_pulse_poll_responses_insert" ON public.ai_pulse_poll_responses WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "ai_pulse_poll_responses_select" ON public.ai_pulse_poll_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'ai_pulse_champion'::text) AND (cr.is_active = true))))));
ALTER POLICY "ai_pulse_polls_insert" ON public.ai_pulse_polls WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'ai_pulse_champion'::text) AND (cr.is_active = true))))));
ALTER POLICY "ai_pulse_polls_select" ON public.ai_pulse_polls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:view.self'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_polls_update" ON public.ai_pulse_polls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'ai_pulse_champion'::text) AND (cr.is_active = true))))));
ALTER POLICY "prompt_builds_admin_read" ON public.ai_pulse_prompt_builds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_pulse_rotation_state_delete" ON public.ai_pulse_rotation_state USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:rotation.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('aiPulse:cycles.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ai_pulse_rotation_state_insert" ON public.ai_pulse_rotation_state WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('aiPulse:rotation.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('aiPulse:cycles.manage'::text) AS user_has_permission)));
ALTER POLICY "ai_pulse_rotation_state_select" ON public.ai_pulse_rotation_state USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:rotation.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('aiPulse:cycles.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = ai_pulse_rotation_state.profile_id))))));
ALTER POLICY "ai_pulse_rotation_state_update" ON public.ai_pulse_rotation_state USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('aiPulse:rotation.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('aiPulse:cycles.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "run_log_admin_select" ON public.ai_routine_run_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ai_task_queue_select_own" ON public.ai_task_queue USING ((requested_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "alumni_outcomes_delete" ON public.alumni_outcomes USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "alumni_outcomes_insert" ON public.alumni_outcomes WITH CHECK (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "alumni_outcomes_select" ON public.alumni_outcomes USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "alumni_outcomes_update" ON public.alumni_outcomes USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "anti_ragging_affidavits_delete_permission" ON public.anti_ragging_affidavits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.anti_ragging.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "anti_ragging_affidavits_insert_permission" ON public.anti_ragging_affidavits WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.anti_ragging.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "anti_ragging_affidavits_select_permission" ON public.anti_ragging_affidavits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.anti_ragging.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "anti_ragging_affidavits_update_permission" ON public.anti_ragging_affidavits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.anti_ragging.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.anti_ragging.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "peer_tags_insert" ON public.appathon_peer_tags WITH CHECK (((( SELECT auth.uid() AS uid) = tagger_profile_id) AND (EXISTS ( SELECT 1
   FROM appathon_role_cards rc
  WHERE ((rc.id = appathon_peer_tags.role_card_id) AND (rc.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "peer_tags_select" ON public.appathon_peer_tags USING (((( SELECT auth.uid() AS uid) = tagger_profile_id) OR (EXISTS ( SELECT 1
   FROM (appathon_role_cards rc
     JOIN event_team_members etm ON ((etm.registration_id = rc.team_id)))
  WHERE ((rc.id = appathon_peer_tags.role_card_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'principal'::text, 'hod'::text, 'faculty'::text]))))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "role_cards_insert" ON public.appathon_role_cards WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));
ALTER POLICY "role_cards_select" ON public.appathon_role_cards USING (((( SELECT auth.uid() AS uid) = profile_id) OR (EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text) AND (etm.registration_id = appathon_role_cards.team_id)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'principal'::text, 'hod'::text, 'faculty'::text]))))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "appathon_verifications_insert" ON public.appathon_verifications WITH CHECK (((evaluator_id = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM (event_staff_assignments esa
     JOIN staff s ON ((s.id = esa.staff_id)))
  WHERE ((esa.venue_assignment_id = appathon_verifications.venue_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)) AND (esa.role = ANY (ARRAY['judge'::text, 'panel_chair'::text, 'evaluator'::text])) AND (esa.day_type = 'demo_day'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'administrator'::text]))))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "appathon_verifications_select" ON public.appathon_verifications USING (((evaluator_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'administrator'::text]))))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "appathon_verifications_update" ON public.appathon_verifications USING (((evaluator_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'administrator'::text]))))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Enable delete for authenticated admins" ON public.applications USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text]))))));
ALTER POLICY "approval_cfg_select" ON public.approval_authority_config USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "approval_cfg_write" ON public.approval_authority_config USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "approval_chain_rules_delete" ON public.approval_chain_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_rules_insert" ON public.approval_chain_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_rules_select" ON public.approval_chain_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_rules_update" ON public.approval_chain_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_runs_insert" ON public.approval_chain_runs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_runs_select" ON public.approval_chain_runs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "approval_chain_runs_update" ON public.approval_chain_runs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.approval_chains.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "art_registry_write" ON public.assignment_rule_type_registry USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "audit_log_insert_by_role" ON public.attendance_audit_log WITH CHECK ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'hod'::text])));
ALTER POLICY "audit_log_select_super_admin" ON public.attendance_audit_log USING ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text));
ALTER POLICY "acn_select" ON public.attendance_campus_networks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "acn_write" ON public.attendance_campus_networks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "Admins can delete consolidation reports" ON public.attendance_consolidation_reports USING ((institution_id IN ( SELECT uia.institution_id
   FROM (user_institution_access uia
     JOIN profiles p ON ((p.id = uia.user_id)))
  WHERE ((uia.user_id = ( SELECT auth.uid() AS uid)) AND (uia.is_active = true) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'principal'::text])))))) WITH CHECK ((institution_id IN ( SELECT uia.institution_id
   FROM (user_institution_access uia
     JOIN profiles p ON ((p.id = uia.user_id)))
  WHERE ((uia.user_id = ( SELECT auth.uid() AS uid)) AND (uia.is_active = true) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'principal'::text]))))));
ALTER POLICY "HOD and Admins can create consolidation reports" ON public.attendance_consolidation_reports WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (institution_id IN ( SELECT uia.institution_id
   FROM (user_institution_access uia
     JOIN profiles p ON ((p.id = uia.user_id)))
  WHERE ((uia.user_id = ( SELECT auth.uid() AS uid)) AND (uia.is_active = true) AND (p.role = ANY (ARRAY['admin'::text, 'hod'::text, 'principal'::text, 'admission'::text])))))));
ALTER POLICY "Super admins can view all consolidation reports" ON public.attendance_consolidation_reports USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "Users can update their own consolidation reports" ON public.attendance_consolidation_reports USING (((generated_by = ( SELECT auth.uid() AS uid)) AND (is_deleted = false))) WITH CHECK ((generated_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Users can view consolidation reports from their institution" ON public.attendance_consolidation_reports USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))));
ALTER POLICY "audience_votes_insert" ON public.audience_votes WITH CHECK ((( SELECT auth.uid() AS uid) = voter_profile_id));
ALTER POLICY "audience_votes_select" ON public.audience_votes USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "audience_votes_update" ON public.audience_votes USING ((( SELECT auth.uid() AS uid) = voter_profile_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = voter_profile_id));
ALTER POLICY "audit_adaptations_select" ON public.audit_adaptations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.parameter.view'::text) AS user_has_permission)));
ALTER POLICY "audit_attestations_delete_permission" ON public.audit_attestations USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "audit_attestations_insert_permission" ON public.audit_attestations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.attestation.sign'::text) AS user_has_permission)));
ALTER POLICY "audit_attestations_select_permission" ON public.audit_attestations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.attestation.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "audit_attestations_update_permission" ON public.audit_attestations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.attestation.sign'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('audit.attestation.cosign'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "audit_cycles_delete_permission" ON public.audit_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ((created_by = ( SELECT auth.uid() AS uid)) AND (phase = 'draft'::text))));
ALTER POLICY "audit_cycles_insert_permission" ON public.audit_cycles WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.cycle.manage'::text) AS user_has_permission)));
ALTER POLICY "audit_cycles_select_permission" ON public.audit_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission)));
ALTER POLICY "audit_cycles_update_permission" ON public.audit_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.cycle.manage'::text) AS user_has_permission) AND ((lead_auditor_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "delegations_insert_permission" ON public.audit_finding_delegations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (delegated_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "delegations_select_permission" ON public.audit_finding_delegations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (delegated_to = ( SELECT auth.uid() AS uid)) OR (delegated_by = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('audit.finding.review'::text) AS user_has_permission)));
ALTER POLICY "delegations_update_permission" ON public.audit_finding_delegations USING ((( SELECT is_super_admin() AS is_super_admin) OR (delegated_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "finding_types_select_permission" ON public.audit_finding_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.parameter.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "finding_types_write_permission" ON public.audit_finding_types USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('audit.finding_type.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (is_system = false)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('audit.finding_type.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (is_system = false))));
ALTER POLICY "param_catalog_delete_permission" ON public.audit_parameter_catalog USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('audit.parameter.manage'::text) AS user_has_permission) AND (is_system = false) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "param_catalog_insert_permission" ON public.audit_parameter_catalog WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('audit.parameter.manage'::text) AS user_has_permission) AND (is_system = false) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "param_catalog_select_permission" ON public.audit_parameter_catalog USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.parameter.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "param_catalog_update_permission" ON public.audit_parameter_catalog USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('audit.parameter.manage'::text) AS user_has_permission) AND (is_system = false) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "audit_parameter_results_select" ON public.audit_parameter_results USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.parameter.view'::text) AS user_has_permission)));
ALTER POLICY "Admins view b2a memories" ON public.b2a_agent_memories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Admins view b2a decisions" ON public.b2a_decision_log USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "batches_delete_admin" ON public.batches USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.batches.delete'::text) AS user_has_permission))));
ALTER POLICY "batches_insert_admin" ON public.batches WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.batches.create'::text) AS user_has_permission))));
ALTER POLICY "batches_select_institution" ON public.batches USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "batches_update_admin" ON public.batches USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.batches.edit'::text) AS user_has_permission))));
ALTER POLICY "students_view_own_batch" ON public.batches USING ((EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON ((p.learner_id = lp.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (lp.batch_id = batches.id)))));
ALTER POLICY "appn_audit_select" ON public.billing_apportionment_audit USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.apportionment.view'::text) AS user_has_permission)));
ALTER POLICY "appn_rules_delete" ON public.billing_apportionment_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.apportionment.delete'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "appn_rules_insert" ON public.billing_apportionment_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.apportionment.create'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "appn_rules_select" ON public.billing_apportionment_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.apportionment.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "appn_rules_update" ON public.billing_apportionment_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.apportionment.edit'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "bill_appn_delete" ON public.billing_bill_apportionments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.apportionment.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "bill_appn_insert" ON public.billing_bill_apportionments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.apportionment.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "bill_appn_select" ON public.billing_bill_apportionments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.apportionment.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "bill_appn_update" ON public.billing_bill_apportionments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.apportionment.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_categories_delete" ON public.billing_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.categories.delete'::text) AS user_has_permission)));
ALTER POLICY "billing_categories_insert" ON public.billing_categories WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.categories.create'::text) AS user_has_permission)));
ALTER POLICY "billing_categories_update" ON public.billing_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.categories.edit'::text) AS user_has_permission)));
ALTER POLICY "billing_discounts_delete_permission" ON public.billing_discounts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.discounts.delete'::text) AS user_has_permission)));
ALTER POLICY "billing_discounts_insert_permission" ON public.billing_discounts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.discounts.create'::text) AS user_has_permission)));
ALTER POLICY "billing_discounts_select_permission" ON public.billing_discounts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.discounts.view'::text) AS user_has_permission)));
ALTER POLICY "billing_discounts_update_permission" ON public.billing_discounts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.discounts.edit'::text) AS user_has_permission)));
ALTER POLICY "billing_inv_items_permission" ON public.billing_invoice_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.invoices.view'::text) AS user_has_permission)));
ALTER POLICY "Students can view their own invoices" ON public.billing_invoices USING ((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text)))));
ALTER POLICY "billing_invoices_delete_permission" ON public.billing_invoices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.invoices.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_invoices_insert_permission" ON public.billing_invoices WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.invoices.create'::text) AS user_has_permission)));
ALTER POLICY "billing_invoices_select_permission" ON public.billing_invoices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.invoices.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "billing_invoices_update_permission" ON public.billing_invoices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.invoices.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_receipt_cancel_actions_select" ON public.billing_receipt_cancel_request_actions USING ((EXISTS ( SELECT 1
   FROM billing_receipt_cancel_requests r
  WHERE ((r.id = billing_receipt_cancel_request_actions.request_id) AND (( SELECT is_super_admin() AS is_super_admin) OR (r.requested_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('billing.receipts.view'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id)))))));
ALTER POLICY "billing_receipt_cancel_requests_select" ON public.billing_receipt_cancel_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR (requested_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('billing.receipts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "Students can view their own receipt items" ON public.billing_receipt_items USING ((receipt_id IN ( SELECT r.id
   FROM billing_receipts r
  WHERE (r.student_id IN ( SELECT lp.id
           FROM (learners_profiles lp
             JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text)))))));
ALTER POLICY "billing_rcpt_items_permission" ON public.billing_receipt_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.receipts.view'::text) AS user_has_permission)));
ALTER POLICY "Students can view their own receipts" ON public.billing_receipts USING ((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text)))));
ALTER POLICY "billing_receipts_delete_permission" ON public.billing_receipts USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.receipts.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_receipts_insert_permission" ON public.billing_receipts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.receipts.create'::text) AS user_has_permission)));
ALTER POLICY "billing_receipts_select_permission" ON public.billing_receipts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.receipts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "billing_receipts_update_permission" ON public.billing_receipts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.receipts.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_receipts_voided_select_permission" ON public.billing_receipts_voided USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.receipts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "refund_flow_configs_write" ON public.billing_refund_flow_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('billing.refunds.configure'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('billing.refunds.configure'::text) AS user_has_permission)));
ALTER POLICY "refund_requests_select" ON public.billing_refund_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.refunds.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (initiated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM jsonb_array_elements((billing_refund_requests.flow_snapshot -> 'stages'::text)) s(value)
  WHERE (((s.value -> 'assignee_users'::text) ? (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
           FROM user_roles ur
          WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((s.value -> 'assignee_roles'::text) ? (ur.role_id)::text))))))) OR (((flow_snapshot -> 'disburser'::text) -> 'assignee_users'::text) ? (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (((billing_refund_requests.flow_snapshot -> 'disburser'::text) -> 'assignee_roles'::text) ? (ur.role_id)::text)))) OR (EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((lp.id = billing_refund_requests.student_id) AND (p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text))))));
ALTER POLICY "Students can view their own refunds" ON public.billing_refunds USING ((receipt_id IN ( SELECT r.id
   FROM billing_receipts r
  WHERE (r.student_id IN ( SELECT lp.id
           FROM (learners_profiles lp
             JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text)))))));
ALTER POLICY "billing_refunds_delete_permission" ON public.billing_refunds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.refunds.delete'::text) AS user_has_permission)));
ALTER POLICY "billing_refunds_insert_permission" ON public.billing_refunds WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.refunds.create'::text) AS user_has_permission)));
ALTER POLICY "billing_refunds_select_permission" ON public.billing_refunds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.refunds.view'::text) AS user_has_permission)));
ALTER POLICY "billing_refunds_update_permission" ON public.billing_refunds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.refunds.edit'::text) AS user_has_permission)));
ALTER POLICY "Students can view their own bills" ON public.billing_student_bills USING (((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text)))) AND ((item_category_id IS NULL) OR (item_category_id IN ( SELECT billing_categories.id
   FROM billing_categories
  WHERE billing_categories.visible_to_learners)))));
ALTER POLICY "billing_bills_delete_permission" ON public.billing_student_bills USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.schedule.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "billing_bills_insert_permission" ON public.billing_student_bills WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('billing.schedule.create'::text) AS user_has_permission)));
ALTER POLICY "billing_bills_update_permission" ON public.billing_student_bills USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('billing.schedule.update'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "bills_delete_admin" ON public.billing_student_bills USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('billing.bills.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "bills_insert_admin" ON public.billing_student_bills WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('billing.bills.create'::text) AS user_has_permission))));
ALTER POLICY "bills_select_scoped" ON public.billing_student_bills USING ((( SELECT (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) OR (institution_id IN ( SELECT unnest(( SELECT _user_accessible_institutions() AS _user_accessible_institutions)) AS unnest
  WHERE (( SELECT user_has_permission('billing.bills.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('billing.schedule.view'::text) AS user_has_permission)))) OR ((student_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((p.email = lp.student_email) OR (p.email = lp.college_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND ((item_category_id IS NULL) OR (item_category_id IN ( SELECT billing_categories.id
   FROM billing_categories
  WHERE billing_categories.visible_to_learners))))));
ALTER POLICY "bills_update_admin" ON public.billing_student_bills USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('billing.bills.edit'::text) AS user_has_permission))));
ALTER POLICY "bos_agenda_delete" ON public.bos_agenda_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_agenda_items.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_agenda_insert" ON public.bos_agenda_items WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_agenda_items.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_agenda_select" ON public.bos_agenda_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_agenda_items.meeting_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_agenda_update" ON public.bos_agenda_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_agenda_items.meeting_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_board_programmes_delete" ON public.bos_board_programmes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_board_programmes_insert" ON public.bos_board_programmes WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_board_programmes_select" ON public.bos_board_programmes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id) OR ((institutions_id IS NULL) AND (( SELECT auth.uid() AS uid) IS NOT NULL))));
ALTER POLICY "bos_board_programmes_update" ON public.bos_board_programmes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_board_psos_delete" ON public.bos_board_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_board_psos_insert" ON public.bos_board_psos WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_board_psos_select" ON public.bos_board_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id)));
ALTER POLICY "bos_board_psos_update" ON public.bos_board_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_board_senders_select" ON public.bos_board_senders USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_board_senders_write" ON public.bos_board_senders USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_body_types_write" ON public.bos_body_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_committees_delete" ON public.bos_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_committees_insert" ON public.bos_committees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_committees_select" ON public.bos_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_committees_update" ON public.bos_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_composition_boards_select" ON public.bos_composition_boards USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text))))) OR (EXISTS ( SELECT 1
   FROM (bos_members m
     JOIN staff s ON ((s.id = m.staff_id)))
  WHERE ((m.composition_id = bos_composition_boards.composition_id) AND (m.is_active = true) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM bos_compositions c
  WHERE ((c.id = bos_composition_boards.composition_id) AND (c.created_by = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "bos_compositions_delete" ON public.bos_compositions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.delete'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_chairman_of(id) OR (created_by = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "bos_compositions_insert" ON public.bos_compositions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.create'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (NOT is_bos_principal_user()))));
ALTER POLICY "bos_compositions_select" ON public.bos_compositions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND ((is_bos_principal_user() AND role_has_institution_access(institutions_id)) OR is_bos_member_of(id) OR (created_by = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "bos_compositions_update" ON public.bos_compositions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_chairman_of(id) OR (created_by = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "bos_course_reviews_delete" ON public.bos_course_reviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_course_reviews_insert" ON public.bos_course_reviews WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_course_reviews_select" ON public.bos_course_reviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_course_reviews_update" ON public.bos_course_reviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_course_syllabi_delete" ON public.bos_course_syllabi USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-syllabus.delete'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR is_bos_chairman_of_board(board_id)))));
ALTER POLICY "bos_course_syllabi_insert" ON public.bos_course_syllabi WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-syllabus.create'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND is_bos_member_of_board(board_id))));
ALTER POLICY "bos_course_syllabi_select" ON public.bos_course_syllabi USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-syllabus.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR is_bos_member_of_board(board_id)))));
ALTER POLICY "bos_course_syllabi_update" ON public.bos_course_syllabi USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-syllabus.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR is_bos_chairman_of_board(board_id)))));
ALTER POLICY "bos_syllabi_delete_own_institution" ON public.bos_course_syllabi USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_syllabi_insert_own_institution" ON public.bos_course_syllabi WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_syllabi_update_own_institution" ON public.bos_course_syllabi USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_documents_delete" ON public.bos_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_documents_insert" ON public.bos_documents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_documents_select" ON public.bos_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_documents_update" ON public.bos_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_email_send_log_insert" ON public.bos_email_send_log WITH CHECK ((sent_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "bos_email_send_log_select" ON public.bos_email_send_log USING (((sent_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text)))))));
ALTER POLICY "bos_email_templates_insert" ON public.bos_email_templates WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'principal'::text, 'hod'::text])))))));
ALTER POLICY "bos_email_templates_update" ON public.bos_email_templates USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'principal'::text, 'hod'::text])))))));
ALTER POLICY "bos_experts_delete" ON public.bos_external_experts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.experts.delete'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_experts_insert" ON public.bos_external_experts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.experts.create'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_experts_select" ON public.bos_external_experts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.experts.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_experts_update" ON public.bos_external_experts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('bos.experts.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_master_pos_delete" ON public.bos_master_pos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_master_pos_insert" ON public.bos_master_pos WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_master_pos_select" ON public.bos_master_pos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id)));
ALTER POLICY "bos_master_pos_update" ON public.bos_master_pos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_master_psos_delete" ON public.bos_master_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_master_psos_insert" ON public.bos_master_psos WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_master_psos_select" ON public.bos_master_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id)));
ALTER POLICY "bos_master_psos_update" ON public.bos_master_psos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_attendees_delete" ON public.bos_meeting_attendees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_meeting_attendees.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_attendees_insert" ON public.bos_meeting_attendees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_meeting_attendees.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_attendees_select" ON public.bos_meeting_attendees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_meeting_attendees.meeting_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_attendees_update" ON public.bos_meeting_attendees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_meeting_attendees.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_meetings_delete" ON public.bos_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.delete'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND is_bos_chairman_of(composition_id))));
ALTER POLICY "bos_meetings_insert" ON public.bos_meetings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.create'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND is_bos_member_of(composition_id))));
ALTER POLICY "bos_meetings_select" ON public.bos_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR is_bos_member_of(composition_id)))));
ALTER POLICY "bos_meetings_update" ON public.bos_meetings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR is_bos_member_of(composition_id)))));
ALTER POLICY "bos_member_types_delete" ON public.bos_member_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_member_types_insert" ON public.bos_member_types WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_member_types_select" ON public.bos_member_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_member_types_update" ON public.bos_member_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_members_delete" ON public.bos_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_chairman_of(composition_id) OR (EXISTS ( SELECT 1
   FROM bos_compositions c
  WHERE ((c.id = bos_members.composition_id) AND (c.created_by = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "bos_members_insert" ON public.bos_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_chairman_of(composition_id) OR (EXISTS ( SELECT 1
   FROM bos_compositions c
  WHERE ((c.id = bos_members.composition_id) AND (c.created_by = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "bos_members_select" ON public.bos_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = bos_members.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM bos_compositions c
  WHERE ((c.id = bos_members.composition_id) AND (c.created_by = ( SELECT auth.uid() AS uid))))) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR is_bos_member_of(composition_id)))));
ALTER POLICY "bos_members_update" ON public.bos_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_chairman_of(composition_id) OR (EXISTS ( SELECT 1
   FROM bos_compositions c
  WHERE ((c.id = bos_members.composition_id) AND (c.created_by = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "bos_po_pso_mapping_delete" ON public.bos_po_pso_mapping USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_po_pso_mapping_insert" ON public.bos_po_pso_mapping WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_po_delete" ON public.bos_programme_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_po_insert" ON public.bos_programme_outcomes WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_po_select" ON public.bos_programme_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id)));
ALTER POLICY "bos_po_update" ON public.bos_programme_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_pso_delete" ON public.bos_programme_specific_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_pso_insert" ON public.bos_programme_specific_outcomes WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_pso_select" ON public.bos_programme_specific_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institutions_id)));
ALTER POLICY "bos_pso_update" ON public.bos_programme_specific_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-taxonomy.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id)) OR is_board_chairman_for_programme(institutions_id, programme_code)));
ALTER POLICY "bos_taxonomies_insert_own_institution" ON public.bos_regulation_taxonomies WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomies_read_own_institution" ON public.bos_regulation_taxonomies USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomies_update_own_institution" ON public.bos_regulation_taxonomies USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_actions_delete" ON public.bos_resolution_actions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM (bos_agenda_items a
     JOIN bos_meetings m ON ((m.id = a.meeting_id)))
  WHERE ((a.id = bos_resolution_actions.agenda_item_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_actions_insert" ON public.bos_resolution_actions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM (bos_agenda_items a
     JOIN bos_meetings m ON ((m.id = a.meeting_id)))
  WHERE ((a.id = bos_resolution_actions.agenda_item_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_actions_select" ON public.bos_resolution_actions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM (bos_agenda_items a
     JOIN bos_meetings m ON ((m.id = a.meeting_id)))
  WHERE ((a.id = bos_resolution_actions.agenda_item_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_actions_update" ON public.bos_resolution_actions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-meetings.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM (bos_agenda_items a
     JOIN bos_meetings m ON ((m.id = a.meeting_id)))
  WHERE ((a.id = bos_resolution_actions.agenda_item_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_sop_comments_read_via_parent" ON public.bos_sop_comments USING ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_comments.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bos_sop_comments_write_via_parent" ON public.bos_sop_comments USING ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_comments.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_comments.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bos_sop_documents_read_own_institution" ON public.bos_sop_documents USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_sop_documents_write_own_institution" ON public.bos_sop_documents USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_sop_versions_read_via_parent" ON public.bos_sop_versions USING ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_versions.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bos_sop_versions_write_via_parent" ON public.bos_sop_versions USING ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_versions.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (bos_sop_documents d
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((d.id = bos_sop_versions.document_id) AND ((d.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bos_tada_delete" ON public.bos_ta_da_claims USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_tada_insert" ON public.bos_ta_da_claims WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-ta-da.create'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_ta_da_claims.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_tada_select" ON public.bos_ta_da_claims USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-ta-da.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (is_bos_principal_user() OR (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_ta_da_claims.meeting_id) AND is_bos_member_of(m.composition_id))))))));
ALTER POLICY "bos_tada_update" ON public.bos_ta_da_claims USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-ta-da.edit'::text) AS user_has_permission) AND role_has_institution_access(institutions_id) AND (EXISTS ( SELECT 1
   FROM bos_meetings m
  WHERE ((m.id = bos_ta_da_claims.meeting_id) AND is_bos_member_of(m.composition_id)))))));
ALTER POLICY "bos_ta_da_rates_delete" ON public.bos_ta_da_rates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_ta_da_rates_insert" ON public.bos_ta_da_rates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_ta_da_rates_select" ON public.bos_ta_da_rates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.bos-compositions.view'::text) AS user_has_permission) AND role_has_institution_access(institutions_id))));
ALTER POLICY "bos_ta_da_rates_update" ON public.bos_ta_da_rates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bos_taxonomy_delete_own_institution" ON public.bos_taxonomy USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomy_insert_own_institution" ON public.bos_taxonomy WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomy_read_own_institution" ON public.bos_taxonomy USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomy_update_own_institution" ON public.bos_taxonomy USING (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((institutions_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR ( SELECT profiles.is_super_admin
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "bos_taxonomy_levels_read_via_parent" ON public.bos_taxonomy_levels USING ((EXISTS ( SELECT 1
   FROM (bos_taxonomy t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((t.id = bos_taxonomy_levels.taxonomy_id) AND ((t.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bos_taxonomy_levels_write_via_parent" ON public.bos_taxonomy_levels USING ((EXISTS ( SELECT 1
   FROM (bos_taxonomy t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((t.id = bos_taxonomy_levels.taxonomy_id) AND ((t.institutions_id = p.institution_id) OR p.is_super_admin))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (bos_taxonomy t
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((t.id = bos_taxonomy_levels.taxonomy_id) AND ((t.institutions_id = p.institution_id) OR p.is_super_admin)))));
ALTER POLICY "bug_fix_feedback_admin_select" ON public.bug_fix_feedback_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "bug_fix_feedback_reporter_select_own" ON public.bug_fix_feedback_requests USING (((reporter_user_id = ( SELECT auth.uid() AS uid)) AND (status <> 'pending_send'::text)));
ALTER POLICY "bug_fix_outcomes_admin_select" ON public.bug_fix_outcomes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "email_logs_select_admin" ON public.bug_report_email_logs USING ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'administrator'::text])));
ALTER POLICY "message_reads_delete_admin" ON public.bug_report_message_reads USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "message_reads_select_admin" ON public.bug_report_message_reads USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "Allow admins to manage all reports" ON public.bug_reports USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'ceo'::text]))))));
ALTER POLICY "Enhanced bug reports view access with department filtering" ON public.bug_reports USING (((reporter_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'ceo'::text])))))));
ALTER POLICY "calendar_categories_select" ON public.calendar_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('calendar.view'::text) AS user_has_permission)));
ALTER POLICY "calendar_categories_write" ON public.calendar_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('calendar.config.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('calendar.config.manage'::text) AS user_has_permission)));
ALTER POLICY "calendar_entries_select" ON public.calendar_entries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.view'::text) AS user_has_permission) AND ((scope_institution_ids IS NULL) OR (scope_institution_ids && ( SELECT _user_accessible_institutions() AS _user_accessible_institutions))))));
ALTER POLICY "calendar_entries_write" ON public.calendar_entries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.holidays.manage'::text) AS user_has_permission) AND ((scope_institution_ids IS NULL) OR (scope_institution_ids && ( SELECT _user_accessible_institutions() AS _user_accessible_institutions)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.holidays.manage'::text) AS user_has_permission) AND ((scope_institution_ids IS NULL) OR (scope_institution_ids && ( SELECT _user_accessible_institutions() AS _user_accessible_institutions))))));
ALTER POLICY "calendar_feed_settings_select" ON public.calendar_feed_settings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "calendar_feed_settings_write" ON public.calendar_feed_settings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.config.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('calendar.config.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "calendar_feed_tokens_own" ON public.calendar_feed_tokens USING ((( SELECT is_super_admin() AS is_super_admin) OR (user_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "cl_recognition_select" ON public.campus_living_recognition USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR is_public OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = campus_living_recognition.learner_id))))));
ALTER POLICY "cl_recognition_write_admin" ON public.campus_living_recognition USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "care_scores_select" ON public.care_audit_scores USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission) OR (scorer_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "care_invites_select" ON public.care_scorer_invites USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission) OR (created_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "carre_calibration_predictions_own" ON public.carre_calibration_predictions USING (((predictor_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "carre_micro_impressions_seal" ON public.carre_micro_impressions USING (COALESCE(( SELECT is_super_admin() AS is_super_admin), false));
ALTER POLICY "carre_participant_scores_seal" ON public.carre_participant_scores USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "case_alerts_insert" ON public.case_alerts WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "case_alerts_select" ON public.case_alerts USING (((user_id = ( SELECT auth.uid() AS uid)) OR (coordinator_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))));
ALTER POLICY "case_alerts_update" ON public.case_alerts USING (((user_id = ( SELECT auth.uid() AS uid)) OR (coordinator_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_batches_select" ON public.case_batches USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_batches_write" ON public.case_batches USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_graduation_requirements_select" ON public.case_graduation_requirements USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_graduation_requirements_write" ON public.case_graduation_requirements USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "case_learner_progress_select" ON public.case_learner_progress USING (((user_id = ( SELECT auth.uid() AS uid)) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_learner_progress_write" ON public.case_learner_progress USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_studies_delete_admin" ON public.case_studies USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "case_studies_insert_team_member" ON public.case_studies WITH CHECK (((EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.registration_id = case_studies.team_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = case_studies.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "case_studies_select_admin" ON public.case_studies USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))))));
ALTER POLICY "case_studies_select_own_team" ON public.case_studies USING (((EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.registration_id = case_studies.team_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = case_studies.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "case_studies_select_public_after_publish" ON public.case_studies USING (((EXISTS ( SELECT 1
   FROM startup_events se
  WHERE ((se.id = case_studies.event_id) AND (se.is_results_published = true)))) AND (( SELECT auth.role() AS role) = 'authenticated'::text)));
ALTER POLICY "case_studies_update_admin" ON public.case_studies USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "case_studies_update_team_member" ON public.case_studies USING (((EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.registration_id = case_studies.team_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = case_studies.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.registration_id = case_studies.team_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = case_studies.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "case_track_courses_select" ON public.case_track_courses USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (institution_id IS NULL) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_track_courses_write" ON public.case_track_courses USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_track_enrollments_delete" ON public.case_track_enrollments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "case_track_enrollments_insert" ON public.case_track_enrollments WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "case_track_enrollments_select" ON public.case_track_enrollments USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text])))))));
ALTER POLICY "case_track_enrollments_update" ON public.case_track_enrollments USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text])))))));
ALTER POLICY "case_tracks_select" ON public.case_tracks USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "case_tracks_write" ON public.case_tracks USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "castes_write" ON public.castes USING (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission));
ALTER POLICY "cdc_career_reports_select" ON public.cdc_career_reports USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cdc_career_reports_write" ON public.cdc_career_reports USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cdc_club_initiatives_read" ON public.cdc_club_initiatives USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_club_memberships_read" ON public.cdc_club_memberships USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_clubs_read" ON public.cdc_clubs USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_drive_attendance_read" ON public.cdc_drive_attendance USING ((is_cdc_staff() OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_drive_attendance.learner_id))))));
ALTER POLICY "cdc_drive_eligibility_read" ON public.cdc_drive_eligibility USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_drive_state_transitions_read" ON public.cdc_drive_state_transitions USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_drive_types_read" ON public.cdc_drive_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_drive_willingness_read" ON public.cdc_drive_willingness USING ((is_cdc_staff() OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_drive_willingness.learner_id))))));
ALTER POLICY "cdc_drive_willingness_write" ON public.cdc_drive_willingness USING ((is_cdc_staff() OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_drive_willingness.learner_id)))))) WITH CHECK ((is_cdc_staff() OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_drive_willingness.learner_id))))));
ALTER POLICY "cdc_drives_read" ON public.cdc_drives USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_emp_req_roles_select" ON public.cdc_employer_requirement_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR is_cdc_staff()));
ALTER POLICY "cdc_emp_req_roles_write" ON public.cdc_employer_requirement_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_cdc_staff() AND role_has_institution_access(fn_cdc_emp_req_institution(requirement_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_cdc_staff() AND role_has_institution_access(fn_cdc_emp_req_institution(requirement_id)))));
ALTER POLICY "cdc_emp_req_select" ON public.cdc_employer_requirements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR is_cdc_staff()));
ALTER POLICY "cdc_emp_req_write" ON public.cdc_employer_requirements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_cdc_staff() AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_cdc_staff() AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "cdc_exam_syllabus_topics_read" ON public.cdc_exam_syllabus_topics USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_expertise_areas_read" ON public.cdc_expertise_areas USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_external_opportunities_read" ON public.cdc_external_opportunities USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_idp_responses_learner_insert" ON public.cdc_idp_responses WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_idp_responses.learner_id)))) AND (submission_status <> 'approved'::text)));
ALTER POLICY "cdc_idp_responses_learner_update" ON public.cdc_idp_responses USING (((EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_idp_responses.learner_id)))) AND (submission_status <> 'approved'::text))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_idp_responses.learner_id)))) AND (submission_status <> 'approved'::text)));
ALTER POLICY "cdc_idp_responses_read" ON public.cdc_idp_responses USING (((is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id))) OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_idp_responses.learner_id))))));
ALTER POLICY "cdc_ind_pairings_select" ON public.cdc_industry_mentor_pairings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.industry_mentors.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cdc_ind_pairings_write" ON public.cdc_industry_mentor_pairings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.industry_mentors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.industry_mentors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cdc_industry_sectors_read" ON public.cdc_industry_sectors USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_internship_types_read" ON public.cdc_internship_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_mentor_categories_read" ON public.cdc_mentor_categories USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_mentor_sessions_select" ON public.cdc_mentor_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('cdc.mentors.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('cdc.industry_mentors.view'::text) AS user_has_permission)));
ALTER POLICY "cdc_mentor_sessions_write" ON public.cdc_mentor_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('cdc.mentors.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('cdc.industry_mentors.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('cdc.mentors.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('cdc.industry_mentors.edit'::text) AS user_has_permission)));
ALTER POLICY "cdc_mentorship_categories_read" ON public.cdc_mentorship_categories USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_offer_types_read" ON public.cdc_offer_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_placement_outcome_cycles_read" ON public.cdc_placement_outcome_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR is_cdc_staff()));
ALTER POLICY "cdc_placements_read" ON public.cdc_placements USING (((is_cdc_staff() AND role_has_institution_access(cdc_learner_institution(learner_id))) OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_placements.learner_id))))));
ALTER POLICY "cdc_recruiters_read" ON public.cdc_recruiters USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_training_enrollments_read" ON public.cdc_training_enrollments USING (((is_cdc_staff() AND role_has_institution_access(cdc_programme_institution(programme_id))) OR (EXISTS ( SELECT 1
   FROM profiles pr
  WHERE ((pr.id = ( SELECT auth.uid() AS uid)) AND (pr.learner_id = cdc_training_enrollments.learner_id))))));
ALTER POLICY "cdc_training_programmes_read" ON public.cdc_training_programmes USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_tss_read" ON public.cdc_training_semester_schedules USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_training_types_read" ON public.cdc_training_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "cdc_udyog_requirements_select" ON public.cdc_udyog_requirements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.udyog.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "cdc_udyog_requirements_write" ON public.cdc_udyog_requirements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.udyog.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('cdc.udyog.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cdc_workshop_types_read" ON public.cdc_workshop_types USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "ceo_round_attendance_select" ON public.ceo_round_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM ceo_rounds r
  WHERE (r.id = ceo_round_attendance.round_id)))));
ALTER POLICY "ceo_round_attendance_write" ON public.ceo_round_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission)));
ALTER POLICY "ceo_round_tasks_select" ON public.ceo_round_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM ceo_rounds r
  WHERE (r.id = ceo_round_tasks.round_id)))));
ALTER POLICY "ceo_round_tasks_write" ON public.ceo_round_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission)));
ALTER POLICY "ceo_rounds_insert" ON public.ceo_rounds WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ceo_rounds_select" ON public.ceo_rounds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission) OR ( SELECT user_has_permission('ceo_rounds.summary.write'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "ceo_rounds_update" ON public.ceo_rounds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('ceo_rounds.log'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "clarification_acts_lead_own" ON public.clarification_acts USING ((lead_email = ( SELECT lower(p.email) AS lower
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "clarification_acts_leadership_read" ON public.clarification_acts USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "class_incharges_delete_by_admin_access" ON public.class_incharges USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND ((user_institution_access.access_type)::text = ANY (ARRAY[('admin'::character varying)::text, ('full'::character varying)::text])) AND (user_institution_access.is_active = true))))));
ALTER POLICY "class_incharges_insert_by_access_type" ON public.class_incharges WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND ((user_institution_access.access_type)::text = ANY (ARRAY[('admin'::character varying)::text, ('write'::character varying)::text, ('full'::character varying)::text])) AND (user_institution_access.is_active = true))))));
ALTER POLICY "class_incharges_select_by_institution" ON public.class_incharges USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))));
ALTER POLICY "class_incharges_update_by_access_type" ON public.class_incharges USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND ((user_institution_access.access_type)::text = ANY (ARRAY[('admin'::character varying)::text, ('write'::character varying)::text, ('full'::character varying)::text])) AND (user_institution_access.is_active = true))))));
ALTER POLICY "cne_delete_admin" ON public.coe_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "cne_insert_admin" ON public.coe_naac_evidence WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "cne_select" ON public.coe_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "cne_update_admin" ON public.coe_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "cost_log_select" ON public.communication_cost_log USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "cost_log_update" ON public.communication_cost_log USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "community_categories_write" ON public.community_categories USING (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission));
ALTER POLICY "competency_catalog_delete" ON public.competency_catalog USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "competency_catalog_insert" ON public.competency_catalog WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "competency_catalog_select" ON public.competency_catalog USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))));
ALTER POLICY "competency_catalog_update" ON public.competency_catalog USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "competency_program_mapping_delete" ON public.competency_program_mapping USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "competency_program_mapping_insert" ON public.competency_program_mapping WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "competency_program_mapping_select" ON public.competency_program_mapping USING ((competency_id IN ( SELECT competency_catalog.id
   FROM competency_catalog
  WHERE (competency_catalog.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "competency_program_mapping_update" ON public.competency_program_mapping USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])))))));
ALTER POLICY "commission_structures_delete" ON public.consultant_commission_structures USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_structures_insert" ON public.consultant_commission_structures WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_structures_select" ON public.consultant_commission_structures USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_structures_update" ON public.consultant_commission_structures USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_transactions_delete" ON public.consultant_commission_transactions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "commission_transactions_insert" ON public.consultant_commission_transactions WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_transactions_select" ON public.consultant_commission_transactions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "commission_transactions_update" ON public.consultant_commission_transactions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_commission_trigger_config_select" ON public.consultant_commission_trigger_config USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "consultant_commission_trigger_config_write" ON public.consultant_commission_trigger_config USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "consultant_comms_delete" ON public.consultant_communications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "consultant_comms_insert" ON public.consultant_communications WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_comms_select" ON public.consultant_communications USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_comms_update" ON public.consultant_communications USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_docs_delete" ON public.consultant_documents USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_docs_insert" ON public.consultant_documents WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_docs_select" ON public.consultant_documents USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_docs_update" ON public.consultant_documents USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_institutions_delete" ON public.consultant_institutions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_institutions_select" ON public.consultant_institutions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_institutions_update" ON public.consultant_institutions USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "lead_attributions_delete" ON public.consultant_lead_attributions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "lead_attributions_insert" ON public.consultant_lead_attributions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "lead_attributions_select" ON public.consultant_lead_attributions USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "lead_attributions_update" ON public.consultant_lead_attributions USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "payment_queries_delete" ON public.consultant_payment_queries USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payment_queries_insert" ON public.consultant_payment_queries WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payment_queries_select" ON public.consultant_payment_queries USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payment_queries_update" ON public.consultant_payment_queries USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payout_batches_delete" ON public.consultant_payout_batches USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payout_batches_insert" ON public.consultant_payout_batches WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payout_batches_select" ON public.consultant_payout_batches USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "payout_batches_update" ON public.consultant_payout_batches USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "consultant_portal_access_select" ON public.consultant_portal_access_policy USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "consultant_portal_access_write" ON public.consultant_portal_access_policy USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "consultant_tier_policy_select" ON public.consultant_tier_policy USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "consultant_tier_policy_write" ON public.consultant_tier_policy USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))));
ALTER POLICY "cbts_select" ON public.copo_below_target_state USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "counselor_routing_config_admin_read" ON public.counselor_routing_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "counselor_routing_config_admin_write" ON public.counselor_routing_config USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "routing_errors_resolve" ON public.counselor_routing_errors USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "routing_errors_select" ON public.counselor_routing_errors USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'admission'::text])))))));
ALTER POLICY "strikes_admin_modify" ON public.counselor_sla_strikes USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "strikes_select" ON public.counselor_sla_strikes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (counselor_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('dashboard.leaderboard.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "counselor_tier_policy_select" ON public.counselor_tier_policy USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'admission'::text])))))));
ALTER POLICY "counselor_tier_policy_write" ON public.counselor_tier_policy USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "course_competency_mapping_delete" ON public.course_competency_mapping USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "course_competency_mapping_insert" ON public.course_competency_mapping WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text]))))));
ALTER POLICY "course_competency_mapping_select" ON public.course_competency_mapping USING ((competency_id IN ( SELECT competency_catalog.id
   FROM competency_catalog
  WHERE (competency_catalog.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "course_competency_mapping_update" ON public.course_competency_mapping USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text])))))));
ALTER POLICY "Users can view accessible course_mappings" ON public.course_mappings USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id = course_mappings.institution_id)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))));
ALTER POLICY "course_mappings_delete_admin" ON public.course_mappings USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.course.mappings.delete'::text) AS user_has_permission)));
ALTER POLICY "course_mappings_insert_admin" ON public.course_mappings WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.course.mappings.create'::text) AS user_has_permission)));
ALTER POLICY "course_mappings_select_institution" ON public.course_mappings USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "course_mappings_update_admin" ON public.course_mappings USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.course.mappings.edit'::text) AS user_has_permission)));
ALTER POLICY "courses_delete_admin" ON public.courses USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.courses.delete'::text) AS user_has_permission)));
ALTER POLICY "courses_insert_admin" ON public.courses WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.courses.create'::text) AS user_has_permission)));
ALTER POLICY "courses_select_permission" ON public.courses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('organizations.courses.view'::text) AS user_has_permission) AND (institution_id IN ( SELECT unnest(( SELECT _user_accessible_institutions() AS _user_accessible_institutions)) AS unnest)))));
ALTER POLICY "courses_update_admin" ON public.courses USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.courses.edit'::text) AS user_has_permission)));
ALTER POLICY "curriculum_lesson_select" ON public.curriculum_lesson USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (created_by = ( SELECT auth.uid() AS uid)) OR ((status = 'published'::text) AND role_has_institution_access(institution_id) AND (( SELECT get_current_user_role() AS get_current_user_role) <> 'student'::text))));
ALTER POLICY "custom_roles_delete" ON public.custom_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.delete'::text) AS user_has_permission)));
ALTER POLICY "custom_roles_insert" ON public.custom_roles WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.create'::text) AS user_has_permission)));
ALTER POLICY "custom_roles_select" ON public.custom_roles USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "custom_roles_update" ON public.custom_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.edit'::text) AS user_has_permission)));
ALTER POLICY "daily_engagement_select_admin" ON public.daily_engagement_metrics USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR ((p.role = ANY (ARRAY['principal'::text, 'hod'::text, 'faculty'::text, 'admin'::text, 'accounts'::text])) AND (p.institution_id = daily_engagement_metrics.institution_id)))))));
ALTER POLICY "dashboard_config_modify" ON public.dashboard_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "dashboard_config_select" ON public.dashboard_config USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "degrees_delete_permission" ON public.degrees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.degrees.delete'::text) AS user_has_permission))));
ALTER POLICY "degrees_insert_permission" ON public.degrees WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('organizations.degrees.create'::text) AS user_has_permission)));
ALTER POLICY "degrees_select_by_role" ON public.degrees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institution_id) OR ( SELECT user_has_permission('organizations.degrees.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.seats.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.seats.manage'::text) AS user_has_permission)));
ALTER POLICY "degrees_update_permission" ON public.degrees USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.degrees.edit'::text) AS user_has_permission))));
ALTER POLICY "students_view_own_degree" ON public.degrees USING ((EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON ((p.learner_id = lp.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (lp.degree_id = degrees.id)))));
ALTER POLICY "departments_delete_permission" ON public.departments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.departments.delete'::text) AS user_has_permission))));
ALTER POLICY "departments_insert_permission" ON public.departments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('organizations.departments.create'::text) AS user_has_permission)));
ALTER POLICY "departments_select_by_role" ON public.departments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institution_id) OR ( SELECT user_has_permission('organizations.departments.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.seats.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.seats.manage'::text) AS user_has_permission)));
ALTER POLICY "departments_update_permission" ON public.departments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.departments.edit'::text) AS user_has_permission))));
ALTER POLICY "students_view_own_department" ON public.departments USING ((EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON ((p.learner_id = lp.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (lp.department_id = departments.id)))));
ALTER POLICY "director_decisions_insert_self" ON public.director_decisions WITH CHECK ((( SELECT auth.uid() AS uid) = director_user_id));
ALTER POLICY "director_decisions_select_self" ON public.director_decisions USING ((( SELECT auth.uid() AS uid) = director_user_id));
ALTER POLICY "director_decisions_update_self" ON public.director_decisions USING ((( SELECT auth.uid() AS uid) = director_user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = director_user_id));
ALTER POLICY "doctrines_percentile_cache_select_own" ON public.doctrines_percentile_cache USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Super admins can manage doc settings" ON public.document_institution_settings USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "Users can read own institution doc settings" ON public.document_institution_settings USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Super admins can manage templates" ON public.document_templates USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "Users can read own institution templates" ON public.document_templates USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "consultants_global_select" ON public.education_consultants USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "edu_consultants_delete" ON public.education_consultants USING (((auth_institution_id() IS NOT NULL) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "edu_consultants_insert" ON public.education_consultants WITH CHECK (((auth_institution_id() IS NOT NULL) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "edu_consultants_update" ON public.education_consultants USING (((auth_institution_id() IS NOT NULL) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((auth_institution_id() IS NOT NULL) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "Users can manage their own preferences" ON public.email_notification_preferences USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Service role can manage notifications" ON public.email_notifications USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "email_notifications_insert" ON public.email_notifications WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "email_notifications_select" ON public.email_notifications USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text)))))));
ALTER POLICY "email_notifications_update" ON public.email_notifications USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text))))));
ALTER POLICY "employment_categories_delete" ON public.employment_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('staff.categories.delete'::text) AS user_has_permission)));
ALTER POLICY "employment_categories_insert" ON public.employment_categories WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('staff.categories.create'::text) AS user_has_permission)));
ALTER POLICY "employment_categories_select" ON public.employment_categories USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "employment_categories_update" ON public.employment_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('staff.categories.edit'::text) AS user_has_permission)));
ALTER POLICY "marathon_budget_auth_all" ON public.event_budget_items USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "event_categories_auth_all" ON public.event_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "event_checklist_completions_delete" ON public.event_checklist_completions USING (((completed_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text]))))))));
ALTER POLICY "event_checklist_completions_delete_own" ON public.event_checklist_completions USING ((completed_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "event_checklist_completions_insert" ON public.event_checklist_completions WITH CHECK (((completed_by = ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))) OR (EXISTS ( SELECT 1
   FROM (((event_staff_assignments esa
     JOIN staff s ON ((s.id = esa.staff_id)))
     JOIN profiles p ON ((p.id = s.profile_id)))
     JOIN event_team_venue_allocations etva ON ((etva.venue_assignment_id = esa.venue_assignment_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (etva.registration_id = event_checklist_completions.registration_id)))))));
ALTER POLICY "event_checklist_items_delete_admin" ON public.event_checklist_items USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_checklist_items_insert_admin" ON public.event_checklist_items WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_checklist_items_update_admin" ON public.event_checklist_items USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_checklists_delete_admin" ON public.event_checklists USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_checklists_insert_admin" ON public.event_checklists WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_checklists_update_admin" ON public.event_checklists USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "marathon_committees_auth_all" ON public.event_committees USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "marathon_committees_member_read" ON public.event_committees USING (((lead_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (member_ids)) OR (lead_name IN ( SELECT profiles.full_name
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.full_name IS NOT NULL)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL) AND (p.full_name = ANY (event_committees.member_names)))))));
ALTER POLICY "event_date_requests_select" ON public.event_date_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (requested_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM event_proposals p
  WHERE ((p.id = event_date_requests.proposal_id) AND (p.proposer_id = ( SELECT auth.uid() AS uid))))) OR (( SELECT user_has_permission('events.proposals.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "event_day_feedback_admin" ON public.event_day_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "event_demo_slots_delete_admin" ON public.event_demo_slots USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_demo_slots_insert_admin" ON public.event_demo_slots WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_demo_slots_update_admin" ON public.event_demo_slots USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "efne_select" ON public.event_feedback_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "marathon_incidents_auth_all" ON public.event_incidents USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "Service role can insert event payments" ON public.event_payment_transactions WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "Service role can update event payments" ON public.event_payment_transactions USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "event_payments_auth_read" ON public.event_payment_transactions USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "event_presets_select" ON public.event_presets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (scope = 'official'::text) OR (owner_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "event_presets_write_official" ON public.event_presets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('events.presets.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('events.presets.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "event_presets_write_personal" ON public.event_presets USING (((scope = 'personal'::text) AND (owner_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((scope = 'personal'::text) AND (owner_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "event_program_feedback_admin" ON public.event_program_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "event_proposals_insert" ON public.event_proposals WITH CHECK ((proposer_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "event_proposals_select" ON public.event_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (proposer_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('events.proposals.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "event_proposals_update" ON public.event_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((proposer_id = ( SELECT auth.uid() AS uid)) AND ((status)::text = ANY (ARRAY[('submitted'::character varying)::text, ('reviewing'::character varying)::text])))));
ALTER POLICY "event_registration_form_fields_manage" ON public.event_registration_form_fields USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_fields.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_fields.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registration_form_fields_select" ON public.event_registration_form_fields USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_fields.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registration_form_sections_manage" ON public.event_registration_form_sections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_sections.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_sections.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registration_form_sections_select" ON public.event_registration_form_sections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_form_sections.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registration_forms_manage" ON public.event_registration_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_forms.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fn_is_event_incharge(event_id) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_forms.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registration_forms_select" ON public.event_registration_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_registration_forms.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "event_registrations_delete" ON public.event_registrations USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))));
ALTER POLICY "event_registrations_insert" ON public.event_registrations WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "event_registrations_select" ON public.event_registrations USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['admin'::text, 'administrator'::text, 'staff'::text, 'faculty'::text, 'hod'::text, 'principal'::text])))))) OR
CASE
    WHEN (( SELECT auth.uid() AS uid) IS NULL) THEN false
    ELSE ((( SELECT user_has_permission('startup_studio.sf100.team.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('startup_studio.registrations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))
END));
ALTER POLICY "event_registrations_update" ON public.event_registrations USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text]))))))));
ALTER POLICY "esa_manage" ON public.event_session_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "esa_view" ON public.event_session_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "event_session_feedback_admin" ON public.event_session_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ess_select" ON public.event_session_speakers USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (event_sessions es
     JOIN induction_programs ip ON ((ip.event_id = es.event_id)))
  WHERE ((es.id = event_session_speakers.session_id) AND (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('induction.manage'::text) AS user_has_permission)) AND role_has_institution_access(ip.institution_id))))));
ALTER POLICY "event_sessions_admin" ON public.event_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "marathon_sponsors_auth_all" ON public.event_sponsors USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "event_staff_assignments_delete_admin" ON public.event_staff_assignments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_staff_assignments_insert_admin" ON public.event_staff_assignments WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_staff_assignments_update_admin" ON public.event_staff_assignments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_submissions_insert" ON public.event_submissions WITH CHECK ((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_submissions.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "event_submissions_member_select" ON public.event_submissions USING ((EXISTS ( SELECT 1
   FROM event_team_members m
  WHERE ((m.registration_id = event_submissions.registration_id) AND (m.profile_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'accepted'::text)))));
ALTER POLICY "event_submissions_select" ON public.event_submissions USING (((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_submissions.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text, 'staff'::text, 'faculty'::text, 'hod'::text, 'principal'::text, 'lecturer'::text]))))))));
ALTER POLICY "event_submissions_update" ON public.event_submissions USING (((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_submissions.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text]))))))));
ALTER POLICY "marathon_tasks_auth_all" ON public.event_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (event_id IN ( SELECT events.id
   FROM events
  WHERE (events.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "marathon_tasks_committee_member_read" ON public.event_tasks USING ((committee_id IN ( SELECT event_committees.id
   FROM event_committees
  WHERE ((event_committees.lead_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (event_committees.member_ids)) OR (event_committees.lead_name IN ( SELECT profiles.full_name
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.full_name IS NOT NULL)))) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL) AND (p.full_name = ANY (event_committees.member_names)))))))));
ALTER POLICY "marathon_tasks_lead_manage" ON public.event_tasks USING ((committee_id IN ( SELECT event_committees.id
   FROM event_committees
  WHERE (event_committees.lead_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "marathon_tasks_member_update_own" ON public.event_tasks USING (((assigned_to = ( SELECT auth.uid() AS uid)) OR (assigned_to_name IN ( SELECT profiles.full_name
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.full_name IS NOT NULL)))) OR (committee_id IN ( SELECT event_committees.id
   FROM event_committees
  WHERE ((event_committees.lead_id = ( SELECT auth.uid() AS uid)) OR (event_committees.lead_name IN ( SELECT profiles.full_name
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.full_name IS NOT NULL)))))))));
ALTER POLICY "event_team_attendance_delete" ON public.event_team_attendance USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "event_team_attendance_insert" ON public.event_team_attendance WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])) OR (profiles.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'principal'::text, 'staff'::text, 'lecturer'::text])))))) OR (EXISTS ( SELECT 1
   FROM ((event_staff_assignments esa
     JOIN staff s ON ((esa.staff_id = s.id)))
     JOIN profiles p ON ((p.email = s.email)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (esa.venue_assignment_id = event_team_attendance.venue_assignment_id) AND (esa.event_id = event_team_attendance.event_id))))));
ALTER POLICY "event_team_attendance_update" ON public.event_team_attendance USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])) OR (profiles.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'principal'::text, 'staff'::text, 'lecturer'::text])))))) OR (EXISTS ( SELECT 1
   FROM ((event_staff_assignments esa
     JOIN staff s ON ((esa.staff_id = s.id)))
     JOIN profiles p ON ((p.email = s.email)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (esa.venue_assignment_id = event_team_attendance.venue_assignment_id) AND (esa.event_id = event_team_attendance.event_id))))));
ALTER POLICY "event_team_members_delete" ON public.event_team_members USING ((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_team_members.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "event_team_members_insert" ON public.event_team_members WITH CHECK ((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_team_members.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "event_team_members_member_self_select" ON public.event_team_members USING ((profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "event_team_members_member_self_update" ON public.event_team_members USING ((profile_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "event_team_members_owner_update" ON public.event_team_members USING ((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_team_members.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM event_registrations
  WHERE ((event_registrations.id = event_team_members.registration_id) AND (event_registrations.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "event_team_members_select" ON public.event_team_members USING ((EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = event_team_members.registration_id) AND ((er.owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['admin'::text, 'administrator'::text, 'staff'::text, 'faculty'::text, 'hod'::text, 'principal'::text])))))))))));
ALTER POLICY "event_team_venue_allocations_delete_admin" ON public.event_team_venue_allocations USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_team_venue_allocations_insert_admin" ON public.event_team_venue_allocations WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_team_venue_allocations_update_admin" ON public.event_team_venue_allocations USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_venue_assignments_delete_admin" ON public.event_venue_assignments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_venue_assignments_insert_admin" ON public.event_venue_assignments WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "event_venue_assignments_update_admin" ON public.event_venue_assignments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "events_auth_delete" ON public.events USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "events_auth_insert" ON public.events WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text])) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "events_auth_read" ON public.events USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "events_auth_update" ON public.events USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text])) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "events_reg_admin_read" ON public.events_registrations USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text]))));
ALTER POLICY "events_reg_admin_update" ON public.events_registrations USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'event_coordinator'::text]))));
ALTER POLICY "events_reg_committee_member_read" ON public.events_registrations USING ((event_id IN ( SELECT mc.event_id
   FROM event_committees mc
  WHERE ((mc.lead_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (mc.member_ids)) OR (mc.lead_name IN ( SELECT p.full_name
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL)))) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL) AND (p.full_name = ANY (mc.member_names)))))))));
ALTER POLICY "events_reg_committee_member_update" ON public.events_registrations USING ((event_id IN ( SELECT mc.event_id
   FROM event_committees mc
  WHERE ((mc.lead_id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (mc.member_ids)) OR (mc.lead_name IN ( SELECT p.full_name
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL)))) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.full_name IS NOT NULL) AND (p.full_name = ANY (mc.member_names)))))))));
ALTER POLICY "events_reg_institution_read" ON public.events_registrations USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "events_reg_self_read" ON public.events_registrations USING ((profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "events_stalls_delete" ON public.events_stalls USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "events_stalls_insert" ON public.events_stalls WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "events_stalls_update" ON public.events_stalls USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "exam_definitions_read" ON public.exam_definitions USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "exam_definitions_write" ON public.exam_definitions USING ((( SELECT is_super_admin() AS is_super_admin) OR is_cdc_head_or_super())) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR is_cdc_head_or_super()));
ALTER POLICY "exam_ia_audit_verdicts_select" ON public.exam_ia_audit_verdicts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('audit.parameter.view'::text) AS user_has_permission)));
ALTER POLICY "exam_topic_map_read" ON public.exam_topic_map USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "exam_topic_map_write" ON public.exam_topic_map USING ((( SELECT is_super_admin() AS is_super_admin) OR is_cdc_head_or_super() OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR is_cdc_head_or_super() OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission)));
ALTER POLICY "exophone_institution_map_read" ON public.exophone_institution_map USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "exophone_institution_map_write" ON public.exophone_institution_map USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "expo_reports_delete" ON public.expo_daily_reports USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_reports_insert" ON public.expo_daily_reports WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_reports_select" ON public.expo_daily_reports USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_reports_update" ON public.expo_daily_reports USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_event_stalls_delete" ON public.expo_event_stalls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_event_stalls_insert" ON public.expo_event_stalls WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_event_stalls_select" ON public.expo_event_stalls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_event_stalls_update" ON public.expo_event_stalls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_team_delete" ON public.expo_event_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.delete'::text) AS user_has_permission) AND role_has_institution_access(_expo_event_institution_id(expo_event_id))) OR (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids))));
ALTER POLICY "expo_team_insert" ON public.expo_event_team_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.create'::text) AS user_has_permission) AND role_has_institution_access(_expo_event_institution_id(expo_event_id))) OR (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids))));
ALTER POLICY "expo_team_select" ON public.expo_event_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(_expo_event_institution_id(expo_event_id))) OR (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids))));
ALTER POLICY "expo_team_update" ON public.expo_event_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.edit'::text) AS user_has_permission) AND role_has_institution_access(_expo_event_institution_id(expo_event_id))) OR (expo_event_id IN ( SELECT get_my_expo_team_event_ids() AS get_my_expo_team_event_ids))));
ALTER POLICY "expo_events_delete" ON public.expo_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_events_insert" ON public.expo_events WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_events_select" ON public.expo_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_events_select_team_member" ON public.expo_events USING ((id IN ( SELECT expo_event_team_members.expo_event_id
   FROM expo_event_team_members
  WHERE ((expo_event_team_members.staff_id = ( SELECT auth.uid() AS uid)) OR (expo_event_team_members.student_id = ( SELECT auth.uid() AS uid)) OR (expo_event_team_members.student_id = get_my_learner_id())))));
ALTER POLICY "expo_events_update" ON public.expo_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_masters_delete" ON public.expo_masters USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_masters_insert" ON public.expo_masters WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_masters_select" ON public.expo_masters USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_masters_update" ON public.expo_masters USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "expo_wa_queue_select" ON public.expo_wa_message_queue USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.marketing.expos.view'::text) AS user_has_permission) AND role_has_institution_access(_expo_event_institution_id(expo_event_id))) OR (expo_event_id = ANY (get_my_expo_event_ids()))));
ALTER POLICY "facilitator_dev_delete" ON public.facilitator_development USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "facilitator_dev_insert" ON public.facilitator_development WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "facilitator_dev_select" ON public.facilitator_development USING (((staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "facilitator_dev_update" ON public.facilitator_development USING (((staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "facilitator_immersion_delete" ON public.facilitator_industry_immersion USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "facilitator_immersion_insert" ON public.facilitator_industry_immersion WITH CHECK (((staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "facilitator_immersion_select" ON public.facilitator_industry_immersion USING (((is_public = true) OR (staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "facilitator_immersion_update" ON public.facilitator_industry_immersion USING (((staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "ftne_manage_admin" ON public.facility_teaching_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ftne_select" ON public.facility_teaching_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fad_select" ON public.faculty_attendance_days USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "farp_select" ON public.faculty_attendance_reconcile_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "fi_audit_insert" ON public.faculty_initiative_audit_log WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (actor_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "fi_audit_select" ON public.faculty_initiative_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM faculty_initiatives fi
  WHERE ((fi.id = faculty_initiative_audit_log.initiative_id) AND ((fi.inventor_id = ( SELECT auth.uid() AS uid)) OR (fi.original_inventor_id = ( SELECT auth.uid() AS uid)) OR (fi.current_approver_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['director'::text, 'dean'::text])) OR ( SELECT user_has_permission('faculty_innovation.ip.view'::text) AS user_has_permission)))))));
ALTER POLICY "fi_coinventors_select" ON public.faculty_initiative_coinventors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (coinventor_user_id = ( SELECT auth.uid() AS uid)) OR fi_is_initiative_owner_or_authority(initiative_id)));
ALTER POLICY "fi_coinventors_write" ON public.faculty_initiative_coinventors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fi_is_initiative_owner_or_authority(initiative_id))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR fi_is_initiative_owner_or_authority(initiative_id)));
ALTER POLICY "fi_transfers_insert" ON public.faculty_initiative_inventor_transfers WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "fi_transfers_select" ON public.faculty_initiative_inventor_transfers USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "faculty_initiatives_insert" ON public.faculty_initiatives WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('faculty_innovation.initiative.submit'::text) AS user_has_permission) AND ((inventor_id = ( SELECT auth.uid() AS uid)) OR (original_inventor_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "faculty_initiatives_select" ON public.faculty_initiatives USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (inventor_id = ( SELECT auth.uid() AS uid)) OR (original_inventor_id = ( SELECT auth.uid() AS uid)) OR (((approval_authority)::text = 'director'::text) AND (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)) OR (((approval_authority)::text = 'dean'::text) AND (( SELECT get_current_user_role() AS get_current_user_role) = 'dean'::text) AND role_has_institution_access(institution_id)) OR (((approval_authority)::text = 'ip_cell'::text) AND ( SELECT user_has_permission('faculty_innovation.ip.view'::text) AS user_has_permission)) OR (((category)::text <> 'ip_bearing'::text) AND (( SELECT get_current_user_role() AS get_current_user_role) = 'hod'::text) AND role_has_institution_access(institution_id)) OR fi_is_coinventor(id)));
ALTER POLICY "faculty_initiatives_update" ON public.faculty_initiatives USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (inventor_id = ( SELECT auth.uid() AS uid)) OR (current_approver_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "fin_insert" ON public.faculty_innovation_notifications WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "fin_select" ON public.faculty_innovation_notifications USING ((( SELECT is_super_admin() AS is_super_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "fin_update" ON public.faculty_innovation_notifications USING ((( SELECT is_super_admin() AS is_super_admin) OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "fm_moments_delete_permission" ON public.family_moments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.campaigns.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_moments_insert_permission" ON public.family_moments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.campaigns.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_moments_select_permission" ON public.family_moments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('moments.campaigns.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('moments.submissions.create'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_moments_update_permission" ON public.family_moments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.submissions.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_campaigns_delete_permission" ON public.family_moments_campaigns USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.campaigns.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_campaigns_insert_permission" ON public.family_moments_campaigns WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.campaigns.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_campaigns_select_permission" ON public.family_moments_campaigns USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('moments.campaigns.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('moments.submissions.create'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "fm_campaigns_update_permission" ON public.family_moments_campaigns USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('moments.campaigns.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fb_page_metrics_select" ON public.fb_page_metrics USING ((EXISTS ( SELECT 1
   FROM fb_pages a
  WHERE ((a.id = fb_page_metrics.page_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "fb_page_metrics_social_perm_read" ON public.fb_page_metrics USING (( SELECT user_has_permission('social.facebook.view'::text) AS user_has_permission));
ALTER POLICY "fb_pages_select" ON public.fb_pages USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))));
ALTER POLICY "fb_pages_social_perm_read" ON public.fb_pages USING ((( SELECT user_has_permission('social.facebook.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "fb_post_metrics_select" ON public.fb_post_metrics USING ((EXISTS ( SELECT 1
   FROM (fb_posts pst
     JOIN fb_pages a ON ((a.id = pst.page_id)))
  WHERE ((pst.id = fb_post_metrics.post_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "fb_post_metrics_social_perm_read" ON public.fb_post_metrics USING (( SELECT user_has_permission('social.facebook.view'::text) AS user_has_permission));
ALTER POLICY "fb_posts_select" ON public.fb_posts USING ((EXISTS ( SELECT 1
   FROM fb_pages a
  WHERE ((a.id = fb_posts.page_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "fb_posts_social_perm_read" ON public.fb_posts USING (( SELECT user_has_permission('social.facebook.view'::text) AS user_has_permission));
ALTER POLICY "Institution admin can view own feature_usage_summary" ON public.feature_usage_summary USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Super admin can view all feature_usage_summary" ON public.feature_usage_summary USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "feedback_events_select" ON public.feedback_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('feedback.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "fp_assessment_items_read" ON public.fp_assessment_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_assessment_items_write" ON public.fp_assessment_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_assessments_read" ON public.fp_assessments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission) OR ((cohort_id IS NOT NULL) AND fn_fp_manages_cohort_school(cohort_id))));
ALTER POLICY "fp_assessments_write" ON public.fp_assessments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.assessments.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_cohorts_select" ON public.fp_cohorts USING ((( SELECT is_super_admin() AS is_super_admin) OR (resource_person_id = ( SELECT auth.uid() AS uid)) OR fn_fp_manages_school(school_id) OR (( SELECT user_has_permission('foundation.cohorts.view'::text) AS user_has_permission) AND fn_fp_manages_school(school_id))));
ALTER POLICY "fp_cohorts_write" ON public.fp_cohorts USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.cohorts.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.cohorts.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id))));
ALTER POLICY "fp_enrollments_select" ON public.fp_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR fn_fp_manages_cohort_school(cohort_id) OR fn_fp_teaches_student(student_id) OR fn_fp_is_own_or_guardian(student_id)));
ALTER POLICY "fp_enrollments_write" ON public.fp_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_cohort_school(cohort_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_cohort_school(cohort_id))));
ALTER POLICY "fp_item_flags_delete" ON public.fp_item_flags USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "fp_item_flags_raise" ON public.fp_item_flags WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (flagged_by = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text) AND (resolved_by IS NULL) AND (resolved_at IS NULL)));
ALTER POLICY "fp_item_flags_read" ON public.fp_item_flags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission) OR (flagged_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "fp_item_flags_resolve" ON public.fp_item_flags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_items_read" ON public.fp_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_items_write" ON public.fp_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('foundation.items.manage'::text) AS user_has_permission)));
ALTER POLICY "fp_students_delete" ON public.fp_students USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id))));
ALTER POLICY "fp_students_insert" ON public.fp_students WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id))));
ALTER POLICY "fp_students_select" ON public.fp_students USING ((( SELECT is_super_admin() AS is_super_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (parent_profile_id = ( SELECT auth.uid() AS uid)) OR fn_fp_manages_school(school_id) OR fn_fp_teaches_student(id)));
ALTER POLICY "fp_students_update" ON public.fp_students USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('foundation.students.manage'::text) AS user_has_permission) AND fn_fp_manages_school(school_id))));
ALTER POLICY "gemba_observations_read" ON public.gemba_observations USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (observed_by = ( SELECT auth.uid() AS uid)) OR COALESCE(( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission), false) OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false) OR (EXISTS ( SELECT 1
   FROM hr_additional_roles h
  WHERE ((h.improvement_area_id = gemba_observations.area_id) AND h.is_current AND (h.staff_id IN ( SELECT s.id
           FROM staff s
          WHERE (s.profile_id = ( SELECT auth.uid() AS uid))))))) OR (EXISTS ( SELECT 1
   FROM mba_associate_postings p
  WHERE ((p.area_id = gemba_observations.area_id) AND (p.associate_user_id = ( SELECT auth.uid() AS uid)) AND p.is_active)))));
ALTER POLICY "Authenticated users can generate docs" ON public.generated_documents WITH CHECK ((generated_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Super admins can manage generated docs" ON public.generated_documents USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "Users can read own institution generated docs" ON public.generated_documents USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "gps_alerts_select" ON public.gps_alerts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.tracking.view'::text) AS user_has_permission)));
ALTER POLICY "gps_alerts_write" ON public.gps_alerts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission)));
ALTER POLICY "gps_devices_select" ON public.gps_devices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.tracking.view'::text) AS user_has_permission)));
ALTER POLICY "gps_devices_write" ON public.gps_devices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission)));
ALTER POLICY "gps_location_history_select" ON public.gps_location_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.tracking.view'::text) AS user_has_permission)));
ALTER POLICY "gps_location_history_write" ON public.gps_location_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission)));
ALTER POLICY "gps_sync_logs_select" ON public.gps_sync_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.tracking.view'::text) AS user_has_permission)));
ALTER POLICY "gps_sync_logs_write" ON public.gps_sync_logs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.settings.manage'::text) AS user_has_permission)));
ALTER POLICY "grievance_categories_manage" ON public.grievance_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('grievance.categories.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('grievance.categories.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "grievance_categories_select" ON public.grievance_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('grievance.categories.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('grievance.tickets.create'::text) AS user_has_permission)))));
ALTER POLICY "grievance_comments_insert" ON public.grievance_comments WITH CHECK ((EXISTS ( SELECT 1
   FROM grievance_tickets gt
  WHERE ((gt.id = grievance_comments.ticket_id) AND ((gt.raised_by_id = ( SELECT auth.uid() AS uid)) OR (gt.assigned_to = ( SELECT auth.uid() AS uid)) OR (gt.filed_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(gt.institution_id)))))));
ALTER POLICY "grievance_comments_select" ON public.grievance_comments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM grievance_tickets gt
  WHERE ((gt.id = grievance_comments.ticket_id) AND ((gt.raised_by_id = ( SELECT auth.uid() AS uid)) OR (gt.assigned_to = ( SELECT auth.uid() AS uid)) OR (gt.filed_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('grievance.tickets.view'::text) AS user_has_permission) AND role_has_institution_access(gt.institution_id))) AND ((NOT grievance_comments.is_internal) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(gt.institution_id))))))));
ALTER POLICY "grievance_history_select" ON public.grievance_history USING (((EXISTS ( SELECT 1
   FROM grievance_tickets gt
  WHERE ((gt.id = grievance_history.ticket_id) AND ((gt.raised_by_id = ( SELECT auth.uid() AS uid)) OR (gt.assigned_to = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM (grievance_tickets gt
     JOIN profiles up ON ((up.institution_id = gt.institution_id)))
  WHERE ((gt.id = grievance_history.ticket_id) AND (up.id = ( SELECT auth.uid() AS uid)) AND (up.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'staff'::text, 'hod'::text, 'principal'::text])))))));
ALTER POLICY "grievance_tickets_delete" ON public.grievance_tickets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "grievance_tickets_insert" ON public.grievance_tickets WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "grievance_tickets_select" ON public.grievance_tickets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (raised_by_id = ( SELECT auth.uid() AS uid)) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR (filed_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('grievance.tickets.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "grievance_tickets_update" ON public.grievance_tickets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((raised_by_id = ( SELECT auth.uid() AS uid)) AND ((status)::text = 'open'::text)) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR (raised_by_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('grievance.tickets.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "guide_events_own_insert" ON public.guide_events WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR (user_id IS NULL)));
ALTER POLICY "guide_progress_own_delete" ON public.guide_progress USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "guide_progress_own_insert" ON public.guide_progress WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "guide_progress_own_select" ON public.guide_progress USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "health_assessments_counselor" ON public.health_assessments USING (((EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'health_counselor'::text)))) AND (learner_id IN ( SELECT health_escalations.learner_id
   FROM health_escalations
  WHERE (health_escalations.counselor_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "health_assessments_self" ON public.health_assessments USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_consents_admin" ON public.health_consents USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text]))));
ALTER POLICY "health_consents_self" ON public.health_consents USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_daily_logs_self" ON public.health_daily_logs USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_escalations_counselor" ON public.health_escalations USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('health_counselor'::character varying)::text, ('health_supervisor'::character varying)::text])))))));
ALTER POLICY "health_escalations_self_read" ON public.health_escalations USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_fitness_tests_self" ON public.health_fitness_tests USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_fitness_tests_staff" ON public.health_fitness_tests USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text]))));
ALTER POLICY "health_peer_support_create" ON public.health_peer_support WITH CHECK ((author_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_peer_support_moderate" ON public.health_peer_support USING ((EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('health_counselor'::character varying)::text, ('health_supervisor'::character varying)::text]))))));
ALTER POLICY "health_practice_attendance_self" ON public.health_practice_attendance USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_practice_attendance_staff" ON public.health_practice_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text]))));
ALTER POLICY "health_practice_sessions_manage" ON public.health_practice_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text]))));
ALTER POLICY "health_profiles_admin" ON public.health_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text])) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('health_counselor'::character varying)::text, ('health_supervisor'::character varying)::text])))))));
ALTER POLICY "health_profiles_self" ON public.health_profiles USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hpc_insert" ON public.health_program_consents WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "hpc_select" ON public.health_program_consents USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission)));
ALTER POLICY "hpc_update" ON public.health_program_consents USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "health_program_days_select" ON public.health_program_days USING ((EXISTS ( SELECT 1
   FROM health_programs p
  WHERE ((p.id = health_program_days.program_id) AND (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('health.programs.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission))))));
ALTER POLICY "health_program_days_write" ON public.health_program_days USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission)));
ALTER POLICY "hpp_insert" ON public.health_program_participation WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "hpp_select" ON public.health_program_participation USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission)));
ALTER POLICY "hpp_update" ON public.health_program_participation USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "health_programs_select" ON public.health_programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('health.programs.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))) OR (( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "health_programs_write" ON public.health_programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('health.programs.manage'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "health_sports_achievements_self_delete" ON public.health_sports_achievements USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_achievements_self_insert" ON public.health_sports_achievements WITH CHECK (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND (COALESCE(verified, false) = false) AND (verified_by IS NULL)));
ALTER POLICY "health_sports_achievements_self_select" ON public.health_sports_achievements USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_achievements_self_update" ON public.health_sports_achievements USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_credits_self" ON public.health_sports_credits USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_credits_staff" ON public.health_sports_credits USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text]))));
ALTER POLICY "health_sports_injuries_self" ON public.health_sports_injuries USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_injuries_staff" ON public.health_sports_injuries USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text])) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('health_counselor'::character varying)::text, ('health_supervisor'::character varying)::text])))))));
ALTER POLICY "health_sports_profiles_admin" ON public.health_sports_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text]))));
ALTER POLICY "health_sports_profiles_self" ON public.health_sports_profiles USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_sports_scholarships_admin" ON public.health_sports_scholarships USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text]))));
ALTER POLICY "health_sports_scholarships_self" ON public.health_sports_scholarships USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_streaks_self" ON public.health_streaks USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "health_tournament_permissions_admin_all" ON public.health_tournament_permissions USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false))) WITH CHECK ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false)));
ALTER POLICY "health_tournament_permissions_filer_insert" ON public.health_tournament_permissions WITH CHECK ((COALESCE(( SELECT user_has_permission('health.sports.file_request'::text) AS user_has_permission), false) AND (filed_by_profile_id = ( SELECT auth.uid() AS uid)) AND (overall_status = 'pending'::text) AND (step3_principal_status = 'pending'::text) AND (step3_approved_by IS NULL) AND (step3_approved_at IS NULL) AND (step3_notes IS NULL) AND (step1_sports_coordinator_status <> 'approved'::text) AND (step2_hod_status <> 'approved'::text) AND (step4_pe_director_status <> 'approved'::text) AND (step1_approved_by IS NULL) AND (step2_approved_by IS NULL) AND (step4_approved_by IS NULL) AND (cancelled_at IS NULL) AND (cancelled_by IS NULL)));
ALTER POLICY "health_tournament_permissions_filer_update" ON public.health_tournament_permissions USING ((COALESCE(( SELECT user_has_permission('health.sports.file_request'::text) AS user_has_permission), false) AND (filed_by_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((COALESCE(( SELECT user_has_permission('health.sports.file_request'::text) AS user_has_permission), false) AND (filed_by_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "health_training_logs_self" ON public.health_training_logs USING ((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON (((lp.id = p.id) OR (p.id = ( SELECT auth.uid() AS uid)))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_access_log_delete_permission" ON public.hostel_access_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_access_log_insert_permission" ON public.hostel_access_log WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_access_log_select_permission" ON public.hostel_access_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_access_log_update_permission" ON public.hostel_access_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_alert_rules_delete_permission" ON public.hostel_alert_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_alert_rules_insert_permission" ON public.hostel_alert_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_alert_rules_select_permission" ON public.hostel_alert_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_alert_rules_update_permission" ON public.hostel_alert_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_alloc_batches_select" ON public.hostel_allocation_batches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.allocations.approve'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_alloc_batches_write" ON public.hostel_allocation_batches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_allocations_delete_permission" ON public.hostel_allocations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_allocations_insert_permission" ON public.hostel_allocations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_allocations_premium_override" ON public.hostel_allocations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.override_pick'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.override_pick'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id) AND (override_reason IS NOT NULL) AND (length(TRIM(BOTH FROM override_reason)) > 0))));
ALTER POLICY "hostel_allocations_select_permission" ON public.hostel_allocations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)) OR (( SELECT user_has_permission('campus_living.allocations.view_own'::text) AS user_has_permission) AND (learner_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_allocations_update_permission" ON public.hostel_allocations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_allocations_warden_review_select" ON public.hostel_allocations USING ((( SELECT user_has_permission('campus_living.allocations.approve'::text) AS user_has_permission) AND role_has_block_access(block_id)));
ALTER POLICY "hostel_amc_contracts_delete_permission" ON public.hostel_amc_contracts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_amc_contracts_insert_permission" ON public.hostel_amc_contracts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_amc_contracts_select_permission" ON public.hostel_amc_contracts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_amc_contracts_update_permission" ON public.hostel_amc_contracts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_amenity_tags_delete_permission" ON public.hostel_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_amenity_tags_insert_permission" ON public.hostel_amenity_tags WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_amenity_tags_select_permission" ON public.hostel_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_amenity_tags_update_permission" ON public.hostel_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_attendance_delete_permission" ON public.hostel_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_attendance_insert_permission" ON public.hostel_attendance WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.mark'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_attendance_select_permission" ON public.hostel_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.view'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_attendance_update_marker" ON public.hostel_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.mark'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.mark'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_attendance_update_permission" ON public.hostel_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.edit'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.attendance.edit'::text) AS user_has_permission) AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_beds_delete_permission" ON public.hostel_beds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.beds.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_beds_insert_permission" ON public.hostel_beds WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.beds.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_beds_select_permission" ON public.hostel_beds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.beds.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_beds_update_permission" ON public.hostel_beds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.beds.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.beds.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_billable_amenities_delete_permission" ON public.hostel_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_billable_amenities_insert_permission" ON public.hostel_billable_amenities WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_billable_amenities_select_permission" ON public.hostel_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_billable_amenities_update_permission" ON public.hostel_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_amenity_tags_delete_permission" ON public.hostel_block_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_amenity_tags_insert_permission" ON public.hostel_block_amenity_tags WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_amenity_tags_select_permission" ON public.hostel_block_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_block_amenity_tags_update_permission" ON public.hostel_block_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_billable_amenities_delete_permission" ON public.hostel_block_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_billable_amenities_insert_permission" ON public.hostel_block_billable_amenities WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_billable_amenities_select_permission" ON public.hostel_block_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_block_billable_amenities_update_permission" ON public.hostel_block_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_block_economics_entries_read" ON public.hostel_block_economics_entries USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "hostel_block_economics_entries_write" ON public.hostel_block_economics_entries USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hostel_block_economics_entries_audit_read" ON public.hostel_block_economics_entries_audit USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hostel_block_institutions_delete_permission" ON public.hostel_block_institutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.delete'::text) AS user_has_permission) AND role_has_hostel_block_scope(block_id, institution_id))));
ALTER POLICY "hostel_block_institutions_insert_permission" ON public.hostel_block_institutions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.create'::text) AS user_has_permission) AND role_has_hostel_block_scope(block_id, institution_id))));
ALTER POLICY "hostel_block_institutions_select_permission" ON public.hostel_block_institutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.view'::text) AS user_has_permission) AND role_has_hostel_block_scope(block_id, institution_id))));
ALTER POLICY "hostel_block_institutions_update_permission" ON public.hostel_block_institutions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.edit'::text) AS user_has_permission) AND role_has_hostel_block_scope(block_id, institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.edit'::text) AS user_has_permission) AND role_has_hostel_block_scope(block_id, institution_id))));
ALTER POLICY "hostel_blocks_delete_permission" ON public.hostel_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.delete'::text) AS user_has_permission) AND role_has_hostel_block_scope(id, NULL::uuid))));
ALTER POLICY "hostel_blocks_insert_permission" ON public.hostel_blocks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.blocks.create'::text) AS user_has_permission)));
ALTER POLICY "hostel_blocks_select_permission" ON public.hostel_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.view'::text) AS user_has_permission) AND role_has_hostel_block_scope(id, NULL::uuid))));
ALTER POLICY "hostel_blocks_update_permission" ON public.hostel_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.blocks.edit'::text) AS user_has_permission) AND role_has_hostel_block_scope(id, NULL::uuid))));
ALTER POLICY "hostel_categories_delete" ON public.hostel_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_categories_insert" ON public.hostel_categories WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_categories_update" ON public.hostel_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_category_upgrade_fees_delete" ON public.hostel_category_upgrade_fees USING (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_category_upgrade_fees_insert" ON public.hostel_category_upgrade_fees WITH CHECK (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_category_upgrade_fees_update" ON public.hostel_category_upgrade_fees USING (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_cleaning_bookings_select" ON public.hostel_cleaning_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = hostel_cleaning_bookings.learner_id)))) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_cleaning_bookings_update" ON public.hostel_cleaning_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.mark_done'::text) AS user_has_permission)) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.mark_done'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_cleaning_schedules_delete_permission" ON public.hostel_cleaning_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_cleaning_schedules_insert_permission" ON public.hostel_cleaning_schedules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_cleaning_schedules_select_permission" ON public.hostel_cleaning_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_cleaning_schedules_update_permission" ON public.hostel_cleaning_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_cleaning_tasks_delete_permission" ON public.hostel_cleaning_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_cleaning_tasks_insert_permission" ON public.hostel_cleaning_tasks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_cleaning_tasks_select_permission" ON public.hostel_cleaning_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_cleaning_tasks_update_permission" ON public.hostel_cleaning_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('campus_living.housekeeping.mark_done'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission)) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('campus_living.housekeeping.mark_done'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.schedule'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "hci_insert_permission" ON public.hostel_clearance_items WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_clearance_items.vacate_request_id) AND ( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id))))));
ALTER POLICY "hci_select_permission" ON public.hostel_clearance_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_clearance_items.vacate_request_id) AND ((( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id)) OR (( SELECT user_has_permission('campus_living.vacate_requests.view_own'::text) AS user_has_permission) AND ((r.submitted_by_id = ( SELECT auth.uid() AS uid)) OR (r.learner_id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "hci_update_permission" ON public.hostel_clearance_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_clearance_items.vacate_request_id) AND ( SELECT user_has_permission('campus_living.vacate_requests.mark_clearance'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_clearance_items.vacate_request_id) AND ( SELECT user_has_permission('campus_living.vacate_requests.mark_clearance'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id))))));
ALTER POLICY "hostel_community_config_delete_permission" ON public.hostel_community_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.community.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_community_config_insert_permission" ON public.hostel_community_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.community.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_community_config_select_permission" ON public.hostel_community_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.community.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_community_config_update_permission" ON public.hostel_community_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.community.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.community.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hcp_delete_admin" ON public.hostel_community_posts USING ((EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('administrator'::character varying)::text]))))));
ALTER POLICY "hcp_insert_same_inst" ON public.hostel_community_posts WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('administrator'::character varying)::text])))))));
ALTER POLICY "hcp_read_same_inst" ON public.hostel_community_posts USING (((is_published = true) AND ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('administrator'::character varying)::text]))))))));
ALTER POLICY "hcp_update_author_or_admin" ON public.hostel_community_posts USING (((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((cr.id = ur.role_id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('administrator'::character varying)::text])))))));
ALTER POLICY "hostel_curfew_exceptions_delete_permission" ON public.hostel_curfew_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_curfew_exceptions_insert_permission" ON public.hostel_curfew_exceptions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_curfew_exceptions_select_permission" ON public.hostel_curfew_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_curfew_exceptions_update_permission" ON public.hostel_curfew_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_curfew_policies_delete" ON public.hostel_curfew_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_curfew_policies_insert" ON public.hostel_curfew_policies WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_curfew_policies_select" ON public.hostel_curfew_policies USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "hostel_curfew_policies_update" ON public.hostel_curfew_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_deposits_delete_permission" ON public.hostel_deposits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.deposits.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_deposits_insert_permission" ON public.hostel_deposits WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.deposits.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_deposits_select_permission" ON public.hostel_deposits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.deposits.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_deposits_update_permission" ON public.hostel_deposits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.deposits.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.deposits.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_emergency_contacts_delete_permission" ON public.hostel_emergency_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_emergency_contacts_insert_permission" ON public.hostel_emergency_contacts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_emergency_contacts_select_permission" ON public.hostel_emergency_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_emergency_contacts_update_permission" ON public.hostel_emergency_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_fee_config_delete_permission" ON public.hostel_fee_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.fees.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_fee_config_insert_permission" ON public.hostel_fee_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.fees.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_fee_config_select_permission" ON public.hostel_fee_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.fees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_fee_config_update_permission" ON public.hostel_fee_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.fees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.fees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_fees_delete" ON public.hostel_fees USING (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_fees_insert" ON public.hostel_fees WITH CHECK (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_fees_update" ON public.hostel_fees USING (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission));
ALTER POLICY "hostel_gate_passes_delete_permission" ON public.hostel_gate_passes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_gate_passes_insert_permission" ON public.hostel_gate_passes WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.approve'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.gate_passes.create'::text) AS user_has_permission) AND (learner_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_gate_passes_select_permission" ON public.hostel_gate_passes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.gate_passes.view_own'::text) AS user_has_permission) AND (learner_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_gate_passes_update_permission" ON public.hostel_gate_passes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.gate_passes.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_general_settings_delete_permission" ON public.hostel_general_settings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_general_settings_insert_permission" ON public.hostel_general_settings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_general_settings_select_permission" ON public.hostel_general_settings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_general_settings_update_permission" ON public.hostel_general_settings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_health_cases_delete_permission" ON public.hostel_health_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.health.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_health_cases_insert_permission" ON public.hostel_health_cases WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.health.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_health_cases_select_permission" ON public.hostel_health_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.health.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_health_cases_update_permission" ON public.hostel_health_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.health.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.health.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_incident_parties_delete_permission" ON public.hostel_incident_parties USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_incident_parties_insert_permission" ON public.hostel_incident_parties WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_incident_parties_select_permission" ON public.hostel_incident_parties USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_incident_parties_update_permission" ON public.hostel_incident_parties USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_incidents_delete_permission" ON public.hostel_incidents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_incidents_insert_permission" ON public.hostel_incidents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_incidents_select_permission" ON public.hostel_incidents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_incidents_update_permission" ON public.hostel_incidents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_inspections_delete_permission" ON public.hostel_inspections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_inspections_insert_permission" ON public.hostel_inspections WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_inspections_select_permission" ON public.hostel_inspections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_inspections_update_permission" ON public.hostel_inspections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_known_visitors_delete_permission" ON public.hostel_known_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_known_visitors_insert_permission" ON public.hostel_known_visitors WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_known_visitors_select_permission" ON public.hostel_known_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_known_visitors_update_permission" ON public.hostel_known_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_laundry_configs_delete_permission" ON public.hostel_laundry_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_laundry_configs_insert_permission" ON public.hostel_laundry_configs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_laundry_configs_select_permission" ON public.hostel_laundry_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_laundry_configs_update_permission" ON public.hostel_laundry_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_laundry_orders_delete_permission" ON public.hostel_laundry_orders USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_laundry_orders_insert_permission" ON public.hostel_laundry_orders WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_laundry_orders_select_permission" ON public.hostel_laundry_orders USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_laundry_orders_update_permission" ON public.hostel_laundry_orders USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.laundry.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_requests_delete_permission" ON public.hostel_leave_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_leave_requests_insert_permission" ON public.hostel_leave_requests WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)) OR (( SELECT user_has_permission('campus_living.leave.request'::text) AS user_has_permission) AND (learner_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_leave_requests_select_permission" ON public.hostel_leave_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)) OR (( SELECT user_has_permission('campus_living.leave.view_own'::text) AS user_has_permission) AND (learner_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "hostel_leave_requests_update_permission" ON public.hostel_leave_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_leave_type_config_delete_permission" ON public.hostel_leave_type_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_type_config_insert_permission" ON public.hostel_leave_type_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_type_config_select_permission" ON public.hostel_leave_type_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_type_config_update_permission" ON public.hostel_leave_type_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_types_delete_permission" ON public.hostel_leave_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave_types.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (NOT is_system))));
ALTER POLICY "hostel_leave_types_insert_permission" ON public.hostel_leave_types WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave_types.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_types_select_permission" ON public.hostel_leave_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave_types.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_leave_types_update_permission" ON public.hostel_leave_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave_types.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.leave_types.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_maintenance_requests_delete_permission" ON public.hostel_maintenance_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_maintenance_requests_insert_permission" ON public.hostel_maintenance_requests WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_maintenance_requests_select_permission" ON public.hostel_maintenance_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_maintenance_requests_update_permission" ON public.hostel_maintenance_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_maintenance_sla_config_delete_permission" ON public.hostel_maintenance_sla_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_maintenance_sla_config_insert_permission" ON public.hostel_maintenance_sla_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_maintenance_sla_config_select_permission" ON public.hostel_maintenance_sla_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_maintenance_sla_config_update_permission" ON public.hostel_maintenance_sla_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_notification_rules_delete_permission" ON public.hostel_notification_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_notification_rules_insert_permission" ON public.hostel_notification_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_notification_rules_select_permission" ON public.hostel_notification_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_notification_rules_update_permission" ON public.hostel_notification_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.settings.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_occupancy_snapshots_select" ON public.hostel_occupancy_snapshots USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "hostel_onboarding_checklists_delete_permission" ON public.hostel_onboarding_checklists USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_checklists_insert_permission" ON public.hostel_onboarding_checklists WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_checklists_select_permission" ON public.hostel_onboarding_checklists USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_checklists_update_permission" ON public.hostel_onboarding_checklists USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_templates_delete_permission" ON public.hostel_onboarding_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_templates_insert_permission" ON public.hostel_onboarding_templates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_templates_select_permission" ON public.hostel_onboarding_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_onboarding_templates_update_permission" ON public.hostel_onboarding_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pending_premium_entitlements_delete" ON public.hostel_pending_premium_entitlements USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_pending_premium_entitlements_insert" ON public.hostel_pending_premium_entitlements WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_pending_premium_entitlements_update" ON public.hostel_pending_premium_entitlements USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_pm_schedules_delete_permission" ON public.hostel_pm_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_pm_schedules_insert_permission" ON public.hostel_pm_schedules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_pm_schedules_select_permission" ON public.hostel_pm_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_pm_schedules_update_permission" ON public.hostel_pm_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_pm_tasks_delete_permission" ON public.hostel_pm_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pm_tasks_insert_permission" ON public.hostel_pm_tasks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pm_tasks_select_permission" ON public.hostel_pm_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pm_tasks_update_permission" ON public.hostel_pm_tasks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.maintenance.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_premium_audit_log_select" ON public.hostel_premium_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.view_dashboard'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.premium.override_pick'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_premium_invites_select_party_or_warden" ON public.hostel_premium_invites USING (((inviter_learner_id = ( SELECT auth.uid() AS uid)) OR (invited_learner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.institution_id = hostel_premium_invites.institution_id)))))));
ALTER POLICY "hostel_premium_vacancies_delete" ON public.hostel_premium_vacancies USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_premium_vacancies_insert" ON public.hostel_premium_vacancies WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_premium_vacancies_update" ON public.hostel_premium_vacancies USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_premium_vacancy_notif_delete" ON public.hostel_premium_vacancy_notifications USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_premium_vacancy_notif_insert" ON public.hostel_premium_vacancy_notifications WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_program_eligibility_delete" ON public.hostel_program_eligibility USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_program_eligibility_insert" ON public.hostel_program_eligibility WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_program_eligibility_update" ON public.hostel_program_eligibility USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_pulse_configs_delete_permission" ON public.hostel_pulse_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_configs_insert_permission" ON public.hostel_pulse_configs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_configs_select_permission" ON public.hostel_pulse_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_configs_update_permission" ON public.hostel_pulse_configs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_responses_delete_permission" ON public.hostel_pulse_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_responses_insert_permission" ON public.hostel_pulse_responses WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_responses_select_permission" ON public.hostel_pulse_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_pulse_responses_update_permission" ON public.hostel_pulse_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.pulse.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_residents_delete_permission" ON public.hostel_residents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.residents.delete'::text) AS user_has_permission) AND ((EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE ((a.resident_id = hostel_residents.id) AND role_has_hostel_block_scope(a.block_id, NULL::uuid)))) OR (NOT (EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE (a.resident_id = hostel_residents.id))))))));
ALTER POLICY "hostel_residents_insert_permission" ON public.hostel_residents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.residents.create'::text) AS user_has_permission)));
ALTER POLICY "hostel_residents_select_permission" ON public.hostel_residents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.residents.view'::text) AS user_has_permission) AND ((EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE ((a.resident_id = hostel_residents.id) AND role_has_hostel_block_scope(a.block_id, NULL::uuid)))) OR (NOT (EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE (a.resident_id = hostel_residents.id))))))));
ALTER POLICY "hostel_residents_update_permission" ON public.hostel_residents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.residents.edit'::text) AS user_has_permission) AND ((EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE ((a.resident_id = hostel_residents.id) AND role_has_hostel_block_scope(a.block_id, NULL::uuid)))) OR (NOT (EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE (a.resident_id = hostel_residents.id))))))));
ALTER POLICY "hostel_risk_alerts_delete_permission" ON public.hostel_risk_alerts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_risk_alerts_insert_permission" ON public.hostel_risk_alerts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_risk_alerts_select_permission" ON public.hostel_risk_alerts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_risk_alerts_update_permission" ON public.hostel_risk_alerts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.alerts.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_room_amenity_tags_delete_permission" ON public.hostel_room_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_amenity_tags_insert_permission" ON public.hostel_room_amenity_tags WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_amenity_tags_select_permission" ON public.hostel_room_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_room_amenity_tags_update_permission" ON public.hostel_room_amenity_tags USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_billable_amenities_delete_permission" ON public.hostel_room_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_billable_amenities_insert_permission" ON public.hostel_room_billable_amenities WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_billable_amenities_select_permission" ON public.hostel_room_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission)));
ALTER POLICY "hostel_room_billable_amenities_update_permission" ON public.hostel_room_billable_amenities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hrcp_delete_permission" ON public.hostel_room_condition_photos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_rooms r
  WHERE ((r.id = hostel_room_condition_photos.room_id) AND ( SELECT user_has_permission('campus_living.rooms.edit'::text) AS user_has_permission) AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id)))))));
ALTER POLICY "hrcp_insert_permission" ON public.hostel_room_condition_photos WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_rooms r
  WHERE ((r.id = hostel_room_condition_photos.room_id) AND ( SELECT user_has_permission('campus_living.rooms.edit'::text) AS user_has_permission) AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id)))))));
ALTER POLICY "hrcp_select_permission" ON public.hostel_room_condition_photos USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_rooms r
  WHERE ((r.id = hostel_room_condition_photos.room_id) AND ( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission) AND (fn_user_can_access_room(r.id) OR role_has_block_access(r.block_id)))))));
ALTER POLICY "hostel_room_elig_rule_rooms_delete" ON public.hostel_room_eligibility_rule_rooms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_elig_rule_rooms_insert" ON public.hostel_room_eligibility_rule_rooms WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_elig_rules_delete" ON public.hostel_room_eligibility_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_elig_rules_insert" ON public.hostel_room_eligibility_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_room_elig_rules_update" ON public.hostel_room_eligibility_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_roommate_preferences_delete_permission" ON public.hostel_roommate_preferences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_roommate_preferences_insert_permission" ON public.hostel_roommate_preferences WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_roommate_preferences_select_permission" ON public.hostel_roommate_preferences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_roommate_preferences_update_permission" ON public.hostel_roommate_preferences USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_rooms_delete_permission" ON public.hostel_rooms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.rooms.delete'::text) AS user_has_permission) AND (fn_user_can_access_room(id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_rooms_insert_permission" ON public.hostel_rooms WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.rooms.create'::text) AS user_has_permission) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_rooms_select_permission" ON public.hostel_rooms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.rooms.view'::text) AS user_has_permission) AND (fn_user_can_access_room(id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_rooms_update_permission" ON public.hostel_rooms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.rooms.edit'::text) AS user_has_permission) AND (fn_user_can_access_room(id) OR role_has_block_access(block_id)))));
ALTER POLICY "hostel_safety_equipment_delete_permission" ON public.hostel_safety_equipment USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_safety_equipment_insert_permission" ON public.hostel_safety_equipment WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_safety_equipment_select_permission" ON public.hostel_safety_equipment USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_safety_equipment_update_permission" ON public.hostel_safety_equipment USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.safety.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_tier_policy_delete" ON public.hostel_tier_policy USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hostel_tier_policy_insert" ON public.hostel_tier_policy WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.premium.configure_tier'::text) AS user_has_permission)));
ALTER POLICY "hostel_tier_policy_select" ON public.hostel_tier_policy USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.view_dashboard'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.settings.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_tier_policy_update" ON public.hostel_tier_policy USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.configure_tier'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.premium.configure_tier'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hvd_delete_permission" ON public.hostel_vacate_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_vacate_documents.vacate_request_id) AND (r.submitted_by_id = ( SELECT auth.uid() AS uid)) AND (r.status = 'draft'::vacate_request_status_enum))))));
ALTER POLICY "hvd_insert_permission" ON public.hostel_vacate_documents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_vacate_documents.vacate_request_id) AND ((( SELECT user_has_permission('campus_living.vacate_requests.submit'::text) AS user_has_permission) AND (r.submitted_by_id = ( SELECT auth.uid() AS uid))) OR (( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id))))))));
ALTER POLICY "hvd_select_permission" ON public.hostel_vacate_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hostel_vacate_requests r
  WHERE ((r.id = hostel_vacate_documents.vacate_request_id) AND ((( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(r.institution_id)) OR (( SELECT user_has_permission('campus_living.vacate_requests.view_own'::text) AS user_has_permission) AND ((r.submitted_by_id = ( SELECT auth.uid() AS uid)) OR (r.learner_id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "hvr_delete_permission" ON public.hostel_vacate_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hvr_insert_permission" ON public.hostel_vacate_requests WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.vacate_requests.submit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.vacate_requests.submit_on_behalf'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND (submitted_on_behalf_of_id IS NOT NULL))));
ALTER POLICY "hvr_select_permission" ON public.hostel_vacate_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('campus_living.vacate_requests.view_own'::text) AS user_has_permission) AND ((submitted_by_id = ( SELECT auth.uid() AS uid)) OR (learner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "hvr_update_permission" ON public.hostel_vacate_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR ((submitted_by_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::vacate_request_status_enum)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.vacate_requests.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR ((submitted_by_id = ( SELECT auth.uid() AS uid)) AND (status = 'draft'::vacate_request_status_enum))));
ALTER POLICY "hostel_visitors_delete_permission" ON public.hostel_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_visitors_insert_permission" ON public.hostel_visitors WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_visitors_select_permission" ON public.hostel_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_visitors_update_permission" ON public.hostel_visitors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.visitors.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_waitlist_delete_permission" ON public.hostel_waitlist USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_waitlist_insert_permission" ON public.hostel_waitlist WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_waitlist_select_permission" ON public.hostel_waitlist USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_waitlist_update_permission" ON public.hostel_waitlist USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.allocations.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hostel_wardens_delete_permission" ON public.hostel_wardens USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.wardens.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_wardens_insert_permission" ON public.hostel_wardens WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.wardens.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_wardens_select_permission" ON public.hostel_wardens USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.wardens.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_wardens_update_permission" ON public.hostel_wardens USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.wardens.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.wardens.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_block_access(block_id))));
ALTER POLICY "hostel_years_delete" ON public.hostel_years USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_years_insert" ON public.hostel_years WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hostel_years_update" ON public.hostel_years USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "hr_add_role_types_tenant_isolation" ON public.hr_additional_role_types USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_add_roles_read" ON public.hr_additional_roles USING ((((hr_organization_id IS NOT NULL) AND (hr_organization_id = auth_hr_organization_id())) OR ((improvement_area_id IS NOT NULL) AND (( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission) OR ( SELECT is_admin() AS is_admin))) OR COALESCE(( SELECT is_super_admin() AS is_super_admin), false)));
ALTER POLICY "hr_add_roles_write_delete" ON public.hr_additional_roles USING ((((hr_organization_id IS NOT NULL) AND (hr_organization_id = auth_hr_organization_id())) OR ((improvement_area_id IS NOT NULL) AND ( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission)) OR COALESCE(( SELECT is_super_admin() AS is_super_admin), false)));
ALTER POLICY "hr_add_roles_write_insert" ON public.hr_additional_roles WITH CHECK ((((hr_organization_id IS NOT NULL) AND (hr_organization_id = auth_hr_organization_id())) OR ((improvement_area_id IS NOT NULL) AND ( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission)) OR COALESCE(( SELECT is_super_admin() AS is_super_admin), false)));
ALTER POLICY "hr_add_roles_write_update" ON public.hr_additional_roles USING ((((hr_organization_id IS NOT NULL) AND (hr_organization_id = auth_hr_organization_id())) OR ((improvement_area_id IS NOT NULL) AND ( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission)) OR COALESCE(( SELECT is_super_admin() AS is_super_admin), false))) WITH CHECK ((((hr_organization_id IS NOT NULL) AND (hr_organization_id = auth_hr_organization_id())) OR ((improvement_area_id IS NOT NULL) AND ( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission)) OR COALESCE(( SELECT is_super_admin() AS is_super_admin), false)));
ALTER POLICY "hr_allowances_tenant_isolation" ON public.hr_allowances USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_approval_flows_tenant_isolation" ON public.hr_approval_flows USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_hr_admin())) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_hr_admin()));
ALTER POLICY "hr_attendance_audit_delete" ON public.hr_attendance_audit_log USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hr_attendance_audit_insert" ON public.hr_attendance_audit_log WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.mark_self'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.regularize_approve'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.approve_team'::text) AS user_has_permission)));
ALTER POLICY "hr_attendance_audit_select" ON public.hr_attendance_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('hr.attendance.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.audit_export'::text) AS user_has_permission)) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "hr_attendance_excs_delete" ON public.hr_attendance_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))));
ALTER POLICY "hr_attendance_excs_insert" ON public.hr_attendance_exceptions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission)));
ALTER POLICY "hr_attendance_excs_select" ON public.hr_attendance_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.view_all'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_attendance_excs_update" ON public.hr_attendance_exceptions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_attendance_records_delete" ON public.hr_attendance_records USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))));
ALTER POLICY "hr_attendance_records_update" ON public.hr_attendance_records USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_attendance_regs_delete" ON public.hr_attendance_regularizations USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission))));
ALTER POLICY "hr_attendance_regs_update" ON public.hr_attendance_regularizations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.attendance.regularize_approve'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.approve_team'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission)));
ALTER POLICY "hr_status_types_delete" ON public.hr_attendance_status_types USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND (is_system = false))));
ALTER POLICY "hr_status_types_insert" ON public.hr_attendance_status_types WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_status_types_select" ON public.hr_attendance_status_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_system = true) OR (( SELECT user_has_permission('hr.attendance.view_all'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))) OR (( SELECT user_has_permission('hr.attendance.view_self'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "hr_status_types_update" ON public.hr_attendance_status_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hbc_read" ON public.hr_benefits_catalog USING ((( SELECT is_super_admin() AS is_super_admin) OR (institution_id IN ( SELECT hr_benefits_catalog.institution_id
   FROM user_hr_access
  WHERE (user_hr_access.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "hbe_read" ON public.hr_benefits_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR (staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.institution_id IN ( SELECT staff.institution_id
           FROM user_hr_access
          WHERE (user_hr_access.user_id = ( SELECT auth.uid() AS uid))))))));
ALTER POLICY "hr_biometric_devices_delete" ON public.hr_biometric_devices USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))));
ALTER POLICY "hr_biometric_devices_insert" ON public.hr_biometric_devices WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_biometric_devices_select" ON public.hr_biometric_devices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.view_all'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_biometric_devices_update" ON public.hr_biometric_devices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_biometric_punches_delete" ON public.hr_biometric_punches USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hr_biometric_punches_insert" ON public.hr_biometric_punches WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission)));
ALTER POLICY "hr_biometric_punches_update" ON public.hr_biometric_punches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission)));
ALTER POLICY "hr_cadres_tenant_isolation" ON public.hr_cadres USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hcoc_delete" ON public.hr_comp_off_credits USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hcoc_insert_claim" ON public.hr_comp_off_credits WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) AND ((source)::text = 'claim'::text) AND ((status)::text = 'pending'::text) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)) AND (NOT (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest))))));
ALTER POLICY "hcoc_select" ON public.hr_comp_off_credits USING ((( SELECT is_super_admin() AS is_super_admin) OR (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hcoc_update" ON public.hr_comp_off_credits USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)) AND (NOT (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest))))));
ALTER POLICY "hr_conduct_rules_tenant_isolation" ON public.hr_conduct_rules USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hdal_insert" ON public.hr_dashboard_access_log WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "hdal_own_select" ON public.hr_dashboard_access_log USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "hdal_super_admin_select" ON public.hr_dashboard_access_log USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hr_designations_tenant_isolation" ON public.hr_designations USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "p_hr_disc_cases_staff_read_own" ON public.hr_disciplinary_cases USING ((staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "p_hr_disc_cases_super_admin_all" ON public.hr_disciplinary_cases USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "p_hr_disc_events_staff_read_own" ON public.hr_disciplinary_events USING ((case_id IN ( SELECT hr_disciplinary_cases.id
   FROM hr_disciplinary_cases
  WHERE (hr_disciplinary_cases.staff_id IN ( SELECT staff.id
           FROM staff
          WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "p_hr_disc_events_super_admin_all" ON public.hr_disciplinary_events USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "hr_disciplinary_penalties_tenant_isolation" ON public.hr_disciplinary_penalties USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "p_hr_disc_witnesses_staff_read_own" ON public.hr_disciplinary_witnesses USING ((case_id IN ( SELECT hr_disciplinary_cases.id
   FROM hr_disciplinary_cases
  WHERE (hr_disciplinary_cases.staff_id IN ( SELECT staff.id
           FROM staff
          WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "p_hr_disc_witnesses_super_admin_all" ON public.hr_disciplinary_witnesses USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "hr_employee_documents_delete_permission" ON public.hr_employee_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_employee_documents_insert_permission" ON public.hr_employee_documents WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('hr.onboarding.execute'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_employee_documents.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_employee_documents.institution_id)))))));
ALTER POLICY "hr_employee_documents_select_permission" ON public.hr_employee_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_employee_documents.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_employee_documents_update_permission" ON public.hr_employee_documents USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "workload_select" ON public.hr_faculty_workload USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_faculty_workload.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.institution_id = hr_faculty_workload.institution_id) OR ((a.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('cao'::character varying)::text])))))));
ALTER POLICY "workload_write" ON public.hr_faculty_workload USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text]))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "hr_feedback_dimensions_tenant_isolation" ON public.hr_feedback_dimensions USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_fnf_calculations_delete" ON public.hr_fnf_calculations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_fnf_calculations_insert" ON public.hr_fnf_calculations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (hr_offboarding_cases c
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = hr_fnf_calculations.case_id) AND (acting.institution_id = c.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_fnf_calculations_update" ON public.hr_fnf_calculations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (hr_offboarding_cases c
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = hr_fnf_calculations.case_id) AND (acting.institution_id = c.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_form_submissions_delete" ON public.hr_form_submissions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_form_submissions_insert" ON public.hr_form_submissions WITH CHECK ((submitted_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "hr_form_submissions_select" ON public.hr_form_submissions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_form_submissions.institution_id))))));
ALTER POLICY "hr_form_submissions_update" ON public.hr_form_submissions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_form_submissions.institution_id)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_form_submissions.institution_id))))));
ALTER POLICY "hr_forms_delete" ON public.hr_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_forms_insert" ON public.hr_forms WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_forms_select" ON public.hr_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_published = true) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_forms.institution_id))))));
ALTER POLICY "hr_forms_update" ON public.hr_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_incentive_schemes_tenant_isolation" ON public.hr_incentive_schemes USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "Applicant can view own application" ON public.hr_job_applications USING ((applicant_user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Authenticated users can submit job applications" ON public.hr_job_applications WITH CHECK (((applicant_user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)));
ALTER POLICY "HR can update application status" ON public.hr_job_applications USING ((( SELECT user_has_permission('hr.recruitment.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('hr.recruitment.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "HR can view applications for their institution jobs" ON public.hr_job_applications USING ((( SELECT user_has_permission('hr.recruitment.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "hlac_delete" ON public.hr_leave_application_comments USING ((( SELECT is_super_admin() AS is_super_admin) OR (commenter_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "hlac_insert" ON public.hr_leave_application_comments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((commenter_id = ( SELECT auth.uid() AS uid)) AND (application_id IN ( SELECT hr_leave_applications.id
   FROM hr_leave_applications)))));
ALTER POLICY "hlac_select" ON public.hr_leave_application_comments USING ((( SELECT is_super_admin() AS is_super_admin) OR (application_id IN ( SELECT hr_leave_applications.id
   FROM hr_leave_applications))));
ALTER POLICY "hlac_update" ON public.hr_leave_application_comments USING ((( SELECT is_super_admin() AS is_super_admin) OR (commenter_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (commenter_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "hla_delete" ON public.hr_leave_applications USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hla_insert" ON public.hr_leave_applications WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.apply'::text) AS user_has_permission) AND (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hla_select" ON public.hr_leave_applications USING ((( SELECT is_super_admin() AS is_super_admin) OR (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR (applied_by = ( SELECT auth.uid() AS uid)) OR (final_approver_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))) OR (( SELECT user_has_permission('hr.leave.view'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hla_update" ON public.hr_leave_applications USING ((( SELECT is_super_admin() AS is_super_admin) OR (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ((status)::text <> ALL (ARRAY[('approved'::character varying)::text, ('rejected'::character varying)::text])) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlb_select" ON public.hr_leave_balances USING ((( SELECT is_super_admin() AS is_super_admin) OR (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR (( SELECT user_has_permission('hr.leave.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlb_write" ON public.hr_leave_balances USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlbo_select" ON public.hr_leave_blackouts USING ((( SELECT is_super_admin() AS is_super_admin) OR (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))));
ALTER POLICY "hlbo_write" ON public.hr_leave_blackouts USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlen_delete" ON public.hr_leave_encashments USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hlen_insert" ON public.hr_leave_encashments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.encashment.view'::text) AS user_has_permission) AND (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlen_select" ON public.hr_leave_encashments USING ((( SELECT is_super_admin() AS is_super_admin) OR (employee_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)) OR (( SELECT user_has_permission('hr.leave.encashment.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlen_update" ON public.hr_leave_encashments USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.encashment.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.encashment.approve'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hr_leave_policies_tenant_isolation" ON public.hr_leave_policies USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hlta_select" ON public.hr_leave_type_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))) OR (((scope_kind)::text = ANY (ARRAY[('organization'::character varying)::text, ('department'::character varying)::text])) AND (hr_organization_id IN ( SELECT unnest(hr_staff_visible_org_ids()) AS unnest))) OR (((scope_kind)::text = 'staff'::text) AND (staff_id IN ( SELECT unnest(fn_my_staff_ids()) AS unnest)))));
ALTER POLICY "hlta_write" ON public.hr_leave_type_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlte_select" ON public.hr_leave_type_entitlements USING ((( SELECT is_super_admin() AS is_super_admin) OR (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))));
ALTER POLICY "hlte_write" ON public.hr_leave_type_entitlements USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('hr.leave.policies.write'::text) AS user_has_permission) AND (hr_organization_id IN ( SELECT unnest(fn_my_hr_organization_ids()) AS unnest)))));
ALTER POLICY "hlt_select" ON public.hr_leave_types USING (((hr_organization_id IN ( SELECT unnest(hr_staff_visible_org_ids()) AS unnest)) OR ( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission)));
ALTER POLICY "hlt_write" ON public.hr_leave_types USING (( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('hr.leave.types.manage'::text) AS user_has_permission));
ALTER POLICY "p_hr_memo_events_super_admin_all" ON public.hr_memo_eligibility_events USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "hr_memo_rules_tenant_isolation" ON public.hr_memo_rules USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "p_hr_memo_transitions_staff_read_own" ON public.hr_memo_state_transitions USING ((memo_id IN ( SELECT hr_memos.id
   FROM hr_memos
  WHERE (hr_memos.staff_id IN ( SELECT staff.id
           FROM staff
          WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "p_hr_memo_transitions_super_admin_read" ON public.hr_memo_state_transitions USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "p_hr_memos_staff_read_own" ON public.hr_memos USING ((staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "p_hr_memos_staff_update_own" ON public.hr_memos USING ((staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.profile_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "p_hr_memos_super_admin_all" ON public.hr_memos USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "hr_naac_evidence_select" ON public.hr_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_offboarding_cases_delete" ON public.hr_offboarding_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_offboarding_cases_insert" ON public.hr_offboarding_cases WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_offboarding_cases.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_offboarding_cases.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_offboarding_cases_select" ON public.hr_offboarding_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_offboarding_cases.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_offboarding_cases.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_offboarding_cases_update" ON public.hr_offboarding_cases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_offboarding_cases.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_offboarding_step_completions_delete" ON public.hr_offboarding_step_completions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_offboarding_step_completions_insert" ON public.hr_offboarding_step_completions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (hr_offboarding_cases c
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = hr_offboarding_step_completions.case_id) AND (acting.institution_id = c.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_offboarding_step_completions_update" ON public.hr_offboarding_step_completions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (hr_offboarding_cases c
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = hr_offboarding_step_completions.case_id) AND (acting.institution_id = c.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))));
ALTER POLICY "hr_onboarding_checklists_tenant_isolation" ON public.hr_onboarding_checklists USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_orgs_tenant_isolation" ON public.hr_organizations USING (((id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_pay_components_delete" ON public.hr_pay_components USING (((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)) AND (is_system = false)));
ALTER POLICY "hr_pay_components_insert" ON public.hr_pay_components WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_pay_components.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_pay_components_select" ON public.hr_pay_components USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_pay_components.institution_id))))));
ALTER POLICY "hr_pay_components_update" ON public.hr_pay_components USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_pay_components.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_pay_scales_tenant_isolation" ON public.hr_pay_scales USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_payroll_period_approvals_delete" ON public.hr_payroll_period_approvals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_payroll_period_approvals_insert" ON public.hr_payroll_period_approvals WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('cao'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_payroll_period_approvals_select" ON public.hr_payroll_period_approvals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (hr_payroll_periods p
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((p.id = hr_payroll_period_approvals.period_id) AND (((acting.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('chairperson'::character varying)::text, ('trust_secretary'::character varying)::text])) OR ((acting.institution_id = p.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('cao'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))))));
ALTER POLICY "hr_payroll_periods_delete" ON public.hr_payroll_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_payroll_periods_insert" ON public.hr_payroll_periods WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND (acting.institution_id = hr_payroll_periods.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "hr_payroll_periods_select" ON public.hr_payroll_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('cao'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text, ('trust_secretary'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])) AND ((acting.institution_id = hr_payroll_periods.institution_id) OR ((acting.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))))))));
ALTER POLICY "hr_payroll_periods_update" ON public.hr_payroll_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('cao'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])) AND ((acting.institution_id = hr_payroll_periods.institution_id) OR ((acting.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('chairperson'::character varying)::text]))))))));
ALTER POLICY "hr_payslip_line_items_delete" ON public.hr_payslip_line_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_payslip_line_items_insert" ON public.hr_payslip_line_items WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_payslip_line_items_select" ON public.hr_payslip_line_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text, ('trust_secretary'::character varying)::text])))))));
ALTER POLICY "hr_payslip_line_items_update" ON public.hr_payslip_line_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('director'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_payslips_delete" ON public.hr_payslips USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_payslips_insert" ON public.hr_payslips WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "hr_payslips_select" ON public.hr_payslips USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_payslips.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (hr_payroll_periods p
     JOIN staff acting ON ((acting.profile_id = ( SELECT auth.uid() AS uid))))
  WHERE ((p.id = hr_payslips.period_id) AND (((acting.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])) OR ((acting.institution_id = p.institution_id) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('accounts'::character varying)::text, ('accountant'::character varying)::text, ('cao'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('registrar'::character varying)::text])))))))));
ALTER POLICY "hr_payslips_update" ON public.hr_payslips USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "hr_peer_benchmarks_write" ON public.hr_peer_benchmarks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_performance_review_cycles_select" ON public.hr_performance_review_cycles USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "hr_performance_review_cycles_write" ON public.hr_performance_review_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_performance_reviews_select" ON public.hr_performance_reviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (staff_id IN ( SELECT staff.id
   FROM staff
  WHERE (staff.profile_id = ( SELECT auth.uid() AS uid)))) OR (staff_id IN ( SELECT s.id
   FROM (staff s
     JOIN departments d ON ((d.id = s.department_id)))
  WHERE (d.head_of_department_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "hr_performance_reviews_write" ON public.hr_performance_reviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_policy_audit_log_insert" ON public.hr_policy_audit_log WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hr_policy_audit_log_select" ON public.hr_policy_audit_log USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_super_admin() AS is_super_admin) OR (scope_id IS NULL) OR (scope_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_policy_promotion_suggestions_delete" ON public.hr_policy_promotion_suggestions USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "hr_policy_promotion_suggestions_select" ON public.hr_policy_promotion_suggestions USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "hr_policy_promotion_suggestions_update" ON public.hr_policy_promotion_suggestions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_promotion_applications_delete" ON public.hr_promotion_applications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_promotion_applications_insert" ON public.hr_promotion_applications WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_promotion_applications.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)) AND (s.institution_id = hr_promotion_applications.institution_id))))));
ALTER POLICY "hr_promotion_applications_select" ON public.hr_promotion_applications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_promotion_applications.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_promotion_applications_update" ON public.hr_promotion_applications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_promotion_applications.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_promotion_applications.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_promotion_criteria_tenant_isolation" ON public.hr_promotion_criteria USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_promotion_decisions_insert" ON public.hr_promotion_decisions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hr_promotion_applications a
  WHERE ((a.id = hr_promotion_decisions.application_id) AND ((( SELECT user_has_permission('hr.employees.edit'::text) AS user_has_permission) AND role_has_institution_access(a.institution_id)) OR (EXISTS ( SELECT 1
           FROM staff s
          WHERE ((s.id = a.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))))))));
ALTER POLICY "hr_promotion_decisions_select" ON public.hr_promotion_decisions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM hr_promotion_applications a
  WHERE ((a.id = hr_promotion_decisions.application_id) AND ((( SELECT user_has_permission('hr.employees.view'::text) AS user_has_permission) AND role_has_institution_access(a.institution_id)) OR (EXISTS ( SELECT 1
           FROM staff s
          WHERE ((s.id = a.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))))))));
ALTER POLICY "hr_public_holidays_tenant_isolation" ON public.hr_public_holidays USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_rec_cand_comments_insert" ON public.hr_recruitment_candidate_comments WITH CHECK (((commenter_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM hr_recruitment_candidates c
  WHERE (c.id = hr_recruitment_candidate_comments.candidate_id)))));
ALTER POLICY "hr_recruitment_packages_delete_permission" ON public.hr_recruitment_candidate_packages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_recruitment_packages_insert_permission" ON public.hr_recruitment_candidate_packages WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.packages.propose'::text) AS user_has_permission)));
ALTER POLICY "hr_recruitment_packages_select_permission" ON public.hr_recruitment_candidate_packages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.packages.view'::text) AS user_has_permission) OR (proposed_by = ( SELECT auth.uid() AS uid)) OR (approved_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM hr_recruitment_candidates c
  WHERE ((c.id = hr_recruitment_candidate_packages.candidate_id) AND (c.submitted_by = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_recruitment_packages_update_permission" ON public.hr_recruitment_candidate_packages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.packages.approve'::text) AS user_has_permission) OR (proposed_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "hr_recruitment_candidates_delete_permission" ON public.hr_recruitment_candidates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_recruitment_candidates_insert_permission" ON public.hr_recruitment_candidates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.create'::text) AS user_has_permission)));
ALTER POLICY "hr_recruitment_candidates_select_permission" ON public.hr_recruitment_candidates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (submitted_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "hr_recruitment_candidates_update_permission" ON public.hr_recruitment_candidates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "escalations_insert" ON public.hr_recruitment_escalations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = ANY (ARRAY[('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "escalations_select" ON public.hr_recruitment_escalations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (escalated_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.institution_id = hr_recruitment_escalations.institution_id) OR ((a.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('cao'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "escalations_update" ON public.hr_recruitment_escalations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "hr_recruitment_interviews_delete_permission" ON public.hr_recruitment_interviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.delete'::text) AS user_has_permission)));
ALTER POLICY "hr_recruitment_interviews_insert_permission" ON public.hr_recruitment_interviews WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.create'::text) AS user_has_permission)));
ALTER POLICY "hr_recruitment_interviews_select_permission" ON public.hr_recruitment_interviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.view'::text) AS user_has_permission) OR (( SELECT auth.uid() AS uid) = ANY (panel_member_ids))));
ALTER POLICY "hr_recruitment_interviews_update_permission" ON public.hr_recruitment_interviews USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.edit'::text) AS user_has_permission)));
ALTER POLICY "hr_rec_job_notes_insert" ON public.hr_recruitment_job_notes WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM hr_recruitment_jobs j
  WHERE (j.id = hr_recruitment_job_notes.job_id)))));
ALTER POLICY "hr_recruitment_jobs_delete_permission" ON public.hr_recruitment_jobs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_recruitment_jobs_insert_permission" ON public.hr_recruitment_jobs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.create'::text) AS user_has_permission)));
ALTER POLICY "hr_recruitment_jobs_select_permission" ON public.hr_recruitment_jobs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_recruitment_jobs_update_permission" ON public.hr_recruitment_jobs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.recruitment.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_recruitment_scorecards_delete_permission" ON public.hr_recruitment_scorecards USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_recruitment_scorecards_insert_permission" ON public.hr_recruitment_scorecards WITH CHECK (((interviewer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_recruitment_scorecards_select_permission" ON public.hr_recruitment_scorecards USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.recruitment.scorecards.view'::text) AS user_has_permission) OR (interviewer_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "hr_recruitment_scorecards_update_permission" ON public.hr_recruitment_scorecards USING (((interviewer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "signal_cache_select" ON public.hr_recruitment_signal_cache USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.institution_id = hr_recruitment_signal_cache.institution_id) OR ((a.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('cao'::character varying)::text, ('registrar'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "signal_cache_write" ON public.hr_recruitment_signal_cache USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "signal_inputs_write" ON public.hr_recruitment_signal_inputs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "snapshots_select" ON public.hr_recruitment_signal_snapshots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('cao'::character varying)::text, ('registrar'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "snapshots_write" ON public.hr_recruitment_signal_snapshots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "suppressions_select" ON public.hr_recruitment_signal_suppressions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.institution_id = hr_recruitment_signal_suppressions.institution_id) OR ((a.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))) AND ((a.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('vice_principal'::character varying)::text, ('cao'::character varying)::text, ('registrar'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text])))))));
ALTER POLICY "suppressions_write" ON public.hr_recruitment_signal_suppressions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = 'director'::text)))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff a
  WHERE ((a.profile_id = ( SELECT auth.uid() AS uid)) AND ((a.role_key)::text = 'director'::text))))));
ALTER POLICY "user_visits_select" ON public.hr_recruitment_user_visits USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "user_visits_write" ON public.hr_recruitment_user_visits USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_reg_reasons_delete" ON public.hr_regularization_reasons USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT is_admin() AS is_admin) AND (is_system = false))));
ALTER POLICY "hr_reg_reasons_insert" ON public.hr_regularization_reasons WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_reg_reasons_select" ON public.hr_regularization_reasons USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_system = true) OR ((( SELECT user_has_permission('hr.attendance.view_self'::text) AS user_has_permission) OR ( SELECT user_has_permission('hr.attendance.view_all'::text) AS user_has_permission)) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "hr_reg_reasons_update" ON public.hr_regularization_reasons USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.attendance.override'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_regulatory_bodies_delete" ON public.hr_regulatory_bodies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_regulatory_bodies_insert" ON public.hr_regulatory_bodies WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_regulatory_bodies_update" ON public.hr_regulatory_bodies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_regulatory_norms_write" ON public.hr_regulatory_norms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_required_documents_tenant_isolation" ON public.hr_required_documents USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_role_descriptions_tenant_isolation" ON public.hr_role_descriptions USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_shift_assignments_delete_permission" ON public.hr_shift_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_assignments_insert_permission" ON public.hr_shift_assignments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_assignments_select_permission" ON public.hr_shift_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_assignments.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_shift_assignments_update_permission" ON public.hr_shift_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_swap_requests_delete" ON public.hr_shift_swap_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_swap_requests_insert" ON public.hr_shift_swap_requests WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_swap_requests.requester_staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_shift_swap_requests_select" ON public.hr_shift_swap_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_swap_requests.requester_staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_swap_requests.counterparty_staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_shift_swap_requests_update" ON public.hr_shift_swap_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_swap_requests.requester_staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_shift_swap_requests.counterparty_staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_shift_templates_delete_permission" ON public.hr_shift_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_templates_insert_permission" ON public.hr_shift_templates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_shift_templates_select_permission" ON public.hr_shift_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (is_global = true) OR ((institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_shift_templates_update_permission" ON public.hr_shift_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_specializations_write" ON public.hr_specializations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "hr_staff_details_tenant_isolation" ON public.hr_staff_details USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_staff_inst_alloc_select" ON public.hr_staff_institution_allocation USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('cao'::character varying)::text])))))));
ALTER POLICY "hr_staff_inst_alloc_write" ON public.hr_staff_institution_allocation USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text]))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "hr_termination_rules_tenant_isolation" ON public.hr_termination_rules USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_training_enrollments_delete" ON public.hr_training_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.training.delete'::text) AS user_has_permission)));
ALTER POLICY "hr_training_enrollments_insert" ON public.hr_training_enrollments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.training.enroll'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_training_enrollments.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_training_enrollments_select" ON public.hr_training_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.training.view'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_training_enrollments.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_training_enrollments_update" ON public.hr_training_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.training.edit'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_training_enrollments.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "hr_training_programs_tenant_isolation" ON public.hr_training_programs USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_training_sessions_delete" ON public.hr_training_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.training.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "hr_training_sessions_insert" ON public.hr_training_sessions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('hr.training.create'::text) AS user_has_permission)));
ALTER POLICY "hr_training_sessions_select" ON public.hr_training_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.training.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND (status = ANY (ARRAY['open'::text, 'in_progress'::text])))));
ALTER POLICY "hr_training_sessions_update" ON public.hr_training_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.training.edit'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "hr_welfare_events_tenant_isolation" ON public.hr_welfare_events USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "hr_work_schedules_tenant_isolation" ON public.hr_work_schedules USING (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "id_card_agent_status_view" ON public.id_card_agent_status USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.jobs.view'::text) AS user_has_permission)));
ALTER POLICY "id_card_print_jobs_admin_insert" ON public.id_card_print_jobs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.jobs.manage'::text) AS user_has_permission)));
ALTER POLICY "id_card_print_jobs_admin_update" ON public.id_card_print_jobs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.jobs.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.jobs.manage'::text) AS user_has_permission)));
ALTER POLICY "id_card_print_jobs_admin_view" ON public.id_card_print_jobs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.jobs.view'::text) AS user_has_permission)));
ALTER POLICY "id_card_print_jobs_self_view" ON public.id_card_print_jobs USING ((( SELECT user_has_permission('id_cards.my-cards.view'::text) AS user_has_permission) AND (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "id_card_templates_create" ON public.id_card_templates WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.templates.create'::text) AS user_has_permission)));
ALTER POLICY "id_card_templates_delete" ON public.id_card_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.templates.delete'::text) AS user_has_permission)));
ALTER POLICY "id_card_templates_edit" ON public.id_card_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.templates.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.templates.edit'::text) AS user_has_permission)));
ALTER POLICY "id_card_templates_view" ON public.id_card_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('id_cards.templates.view'::text) AS user_has_permission)));
ALTER POLICY "ig_account_connections_select" ON public.ig_account_connections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ig_account_connections_social_perm_read" ON public.ig_account_connections USING ((( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('social.departments.view'::text) AS user_has_permission)));
ALTER POLICY "ig_account_metrics_select" ON public.ig_account_metrics USING ((EXISTS ( SELECT 1
   FROM ig_accounts a
  WHERE ((a.id = ig_account_metrics.account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "ig_account_metrics_social_perm_read" ON public.ig_account_metrics USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "ig_accounts_select" ON public.ig_accounts USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))));
ALTER POLICY "ig_accounts_social_perm_read" ON public.ig_accounts USING ((( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "ig_dm_conversations_read" ON public.ig_dm_conversations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.institution_id = ig_dm_conversations.institution_id))))));
ALTER POLICY "ig_dm_conversations_social_perm_read" ON public.ig_dm_conversations USING ((( SELECT user_has_permission('social.messenger.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "ig_dm_messages_read" ON public.ig_dm_messages USING ((EXISTS ( SELECT 1
   FROM (ig_dm_conversations c
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = ig_dm_messages.conversation_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = c.institution_id))))));
ALTER POLICY "ig_dm_messages_social_perm_read" ON public.ig_dm_messages USING (( SELECT user_has_permission('social.messenger.view'::text) AS user_has_permission));
ALTER POLICY "ig_monthly_audit_select" ON public.ig_monthly_audit USING ((EXISTS ( SELECT 1
   FROM ig_accounts a
  WHERE ((a.id = ig_monthly_audit.ig_account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "ig_monthly_audit_social_perm_read" ON public.ig_monthly_audit USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "ig_post_metrics_select" ON public.ig_post_metrics USING ((EXISTS ( SELECT 1
   FROM (ig_posts pst
     JOIN ig_accounts a ON ((a.id = pst.account_id)))
  WHERE ((pst.id = ig_post_metrics.post_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "ig_post_metrics_social_perm_read" ON public.ig_post_metrics USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "ig_posts_select" ON public.ig_posts USING ((EXISTS ( SELECT 1
   FROM ig_accounts a
  WHERE ((a.id = ig_posts.account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "ig_posts_social_perm_read" ON public.ig_posts USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "ig_stories_read" ON public.ig_stories USING (((EXISTS ( SELECT 1
   FROM (ig_accounts a
     JOIN profiles p ON ((p.institution_id = a.institution_id)))
  WHERE ((a.id = ig_stories.ig_account_id) AND (p.id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))));
ALTER POLICY "ig_stories_social_perm_read" ON public.ig_stories USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "ig_story_insights_read" ON public.ig_story_insights USING (((EXISTS ( SELECT 1
   FROM ((ig_stories s
     JOIN ig_accounts a ON ((a.id = s.ig_account_id)))
     JOIN profiles p ON ((p.institution_id = a.institution_id)))
  WHERE ((s.story_id = ig_story_insights.story_id) AND (p.id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))));
ALTER POLICY "ig_story_insights_social_perm_read" ON public.ig_story_insights USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "improvement_areas_manage_insert" ON public.improvement_areas WITH CHECK ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false)));
ALTER POLICY "improvement_areas_manage_update" ON public.improvement_areas USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false))) WITH CHECK ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false)));
ALTER POLICY "improvement_areas_select" ON public.improvement_areas USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR COALESCE(( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission), false) OR COALESCE(( SELECT user_has_permission('improvement.area_role.assign'::text) AS user_has_permission), false) OR COALESCE(( SELECT user_has_permission('improvement.area_policy.approve'::text) AS user_has_permission), false) OR (is_active AND COALESCE(( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission), false))));
ALTER POLICY "improvement_activity_select" ON public.improvement_idea_activity USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM improvement_ideas i
  WHERE ((i.id = improvement_idea_activity.idea_id) AND ((i.author_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission) OR ((i.visibility = 'open'::improvement_idea_visibility) AND ( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission))))))));
ALTER POLICY "improvement_rankings_select" ON public.improvement_idea_rankings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM improvement_ideas i
  WHERE (i.id = improvement_idea_rankings.idea_id)))));
ALTER POLICY "improvement_ideas_insert" ON public.improvement_ideas WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) AND ( SELECT user_has_permission('improvement.ideas.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "improvement_ideas_select" ON public.improvement_ideas USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (author_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR ((visibility = 'open'::improvement_idea_visibility) AND ( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "improvement_ideas_update" ON public.improvement_ideas USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((author_id = ( SELECT auth.uid() AS uid)) AND (status = 'logged'::improvement_idea_status)) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((author_id = ( SELECT auth.uid() AS uid)) AND (status = 'logged'::improvement_idea_status)) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "ims_department_consumption_delete" ON public.ims_department_consumption USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_department_consumption_insert" ON public.ims_department_consumption WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_department_consumption_select" ON public.ims_department_consumption USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_department_consumption_update" ON public.ims_department_consumption USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_financial_transactions_delete" ON public.ims_financial_transactions USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_financial_transactions_insert" ON public.ims_financial_transactions WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_financial_transactions_select" ON public.ims_financial_transactions USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_financial_transactions_update" ON public.ims_financial_transactions USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_gateway_payments_select" ON public.ims_gateway_payments USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids))));
ALTER POLICY "ims_goods_received_notes_delete" ON public.ims_goods_received_notes USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_goods_received_notes_insert" ON public.ims_goods_received_notes WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_goods_received_notes_select" ON public.ims_goods_received_notes USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_goods_received_notes_update" ON public.ims_goods_received_notes USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_grn_items_delete" ON public.ims_grn_items USING ((EXISTS ( SELECT 1
   FROM ims_goods_received_notes g
  WHERE ((g.id = ims_grn_items.grn_id) AND ((g.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_grn_items_insert" ON public.ims_grn_items WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_goods_received_notes g
  WHERE ((g.id = ims_grn_items.grn_id) AND ((g.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_grn_items_select" ON public.ims_grn_items USING ((EXISTS ( SELECT 1
   FROM ims_goods_received_notes g
  WHERE ((g.id = ims_grn_items.grn_id) AND ((g.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_grn_items_update" ON public.ims_grn_items USING ((EXISTS ( SELECT 1
   FROM ims_goods_received_notes g
  WHERE ((g.id = ims_grn_items.grn_id) AND ((g.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_indent_request_items_delete" ON public.ims_indent_request_items USING ((EXISTS ( SELECT 1
   FROM ims_indent_requests ir
  WHERE ((ir.id = ims_indent_request_items.indent_id) AND ((ir.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (ir.department_id = ims_indent_dept_scope()))))));
ALTER POLICY "ims_indent_request_items_insert" ON public.ims_indent_request_items WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_indent_requests ir
  WHERE ((ir.id = ims_indent_request_items.indent_id) AND ((ir.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (ir.department_id = ims_indent_dept_scope()))))));
ALTER POLICY "ims_indent_request_items_select" ON public.ims_indent_request_items USING ((EXISTS ( SELECT 1
   FROM ims_indent_requests ir
  WHERE ((ir.id = ims_indent_request_items.indent_id) AND ((ir.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (ir.department_id = ims_indent_dept_scope()))))));
ALTER POLICY "ims_indent_request_items_update" ON public.ims_indent_request_items USING ((EXISTS ( SELECT 1
   FROM ims_indent_requests ir
  WHERE ((ir.id = ims_indent_request_items.indent_id) AND ((ir.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (ir.department_id = ims_indent_dept_scope()))))));
ALTER POLICY "ims_indent_requests_delete" ON public.ims_indent_requests USING ((((institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (department_id = ims_indent_dept_scope()))));
ALTER POLICY "ims_indent_requests_insert" ON public.ims_indent_requests WITH CHECK ((((institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (department_id = ims_indent_dept_scope()))));
ALTER POLICY "ims_indent_requests_select" ON public.ims_indent_requests USING ((((institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (department_id = ims_indent_dept_scope()))));
ALTER POLICY "ims_indent_requests_update" ON public.ims_indent_requests USING ((((institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (department_id = ims_indent_dept_scope())))) WITH CHECK ((((institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)) AND ((ims_indent_dept_scope() IS NULL) OR (department_id = ims_indent_dept_scope()))));
ALTER POLICY "ims_item_categories_delete" ON public.ims_item_categories USING ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'store_admin'::text])));
ALTER POLICY "ims_item_categories_insert" ON public.ims_item_categories WITH CHECK ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'store_admin'::text])));
ALTER POLICY "ims_item_categories_update" ON public.ims_item_categories USING ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'store_admin'::text])));
ALTER POLICY "ims_item_change_requests_insert" ON public.ims_item_change_requests WITH CHECK (((requested_by = ( SELECT auth.uid() AS uid)) AND ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)))));
ALTER POLICY "ims_item_change_requests_select" ON public.ims_item_change_requests USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (requested_by = ( SELECT auth.uid() AS uid)) OR (institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids))));
ALTER POLICY "ims_items_delete" ON public.ims_items USING (((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'store_admin'::text])) OR ((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) AND ( SELECT user_has_permission('ims.inventory.delete'::text) AS user_has_permission))));
ALTER POLICY "ims_items_insert" ON public.ims_items WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'store_admin'::text]))));
ALTER POLICY "ims_items_select" ON public.ims_items USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_items_update" ON public.ims_items USING (((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'store_admin'::text])) OR ((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) AND ( SELECT user_has_permission('ims.inventory.edit'::text) AS user_has_permission))));
ALTER POLICY "ims_kit_collection_windows_select" ON public.ims_kit_collection_windows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_collection_windows_write" ON public.ims_kit_collection_windows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_collections_select" ON public.ims_kit_collections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM ims_kit_entitlements e
  WHERE ((e.id = ims_kit_collections.entitlement_id) AND ((( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) AND role_has_institution_access(e.institution_id)) OR (( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission) AND role_has_institution_access(e.institution_id)) OR (e.learner_id = ( SELECT p.learner_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (e.staff_id IN ( SELECT s.id
           FROM staff s
          WHERE (s.profile_id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "ims_kit_collections_write" ON public.ims_kit_collections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ims_kit_entitlements_select" ON public.ims_kit_entitlements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.profile_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "ims_kit_entitlements_write" ON public.ims_kit_entitlements USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "ims_kit_rule_items_select" ON public.ims_kit_rule_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_rule_items_write" ON public.ims_kit_rule_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_rule_members_select" ON public.ims_kit_rule_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_rule_members_write" ON public.ims_kit_rule_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_rules_select" ON public.ims_kit_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('ims.kits.handover'::text) AS user_has_permission)));
ALTER POLICY "ims_kit_rules_write" ON public.ims_kit_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('ims.kits.manage'::text) AS user_has_permission)));
ALTER POLICY "ims_sale_items_delete" ON public.ims_sale_items USING ((EXISTS ( SELECT 1
   FROM ims_sales s
  WHERE ((s.id = ims_sale_items.sale_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_sale_items_insert" ON public.ims_sale_items WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_sales s
  WHERE ((s.id = ims_sale_items.sale_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_sale_items_select" ON public.ims_sale_items USING ((EXISTS ( SELECT 1
   FROM ims_sales s
  WHERE ((s.id = ims_sale_items.sale_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_sale_items_update" ON public.ims_sale_items USING ((EXISTS ( SELECT 1
   FROM ims_sales s
  WHERE ((s.id = ims_sale_items.sale_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_sale_number_counters_select" ON public.ims_sale_number_counters USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_sale_number_counters.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_sales_delete" ON public.ims_sales USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_sales_insert" ON public.ims_sales WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_sales_select" ON public.ims_sales USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_sales_update" ON public.ims_sales USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_shifts_delete" ON public.ims_shifts USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_shifts.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_shifts_insert" ON public.ims_shifts WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_shifts.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_shifts_select" ON public.ims_shifts USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_shifts.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_shifts_update" ON public.ims_shifts USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_shifts.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_stock_batches_delete" ON public.ims_stock_batches USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_batches_insert" ON public.ims_stock_batches WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_batches_select" ON public.ims_stock_batches USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_batches_update" ON public.ims_stock_batches USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_issues_delete" ON public.ims_stock_issues USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_issues_insert" ON public.ims_stock_issues WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_issues_select" ON public.ims_stock_issues USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_issues_update" ON public.ims_stock_issues USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_movements_insert" ON public.ims_stock_movements WITH CHECK (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (institution_id = ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "ims_stock_movements_select" ON public.ims_stock_movements USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "ims_stock_summary_delete" ON public.ims_stock_summary USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_summary_insert" ON public.ims_stock_summary WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_summary_select" ON public.ims_stock_summary USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stock_summary_update" ON public.ims_stock_summary USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stores_delete" ON public.ims_stores USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stores_insert" ON public.ims_stores WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_stores_select" ON public.ims_stores USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "ims_stores_update" ON public.ims_stores USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_suppliers_delete" ON public.ims_suppliers USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_suppliers_insert" ON public.ims_suppliers WITH CHECK (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_suppliers_select" ON public.ims_suppliers USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_suppliers_update" ON public.ims_suppliers USING (((institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_supply_shipment_item_batches_select" ON public.ims_supply_shipment_item_batches USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (EXISTS ( SELECT 1
   FROM ((ims_supply_shipment_items sit
     JOIN ims_supply_shipments sh ON ((sh.id = sit.shipment_id)))
     JOIN ims_stores s ON (((s.id = sh.source_store_id) OR (s.id = sh.destination_store_id))))
  WHERE ((sit.id = ims_supply_shipment_item_batches.shipment_item_id) AND (s.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "ims_supply_shipments_delete" ON public.ims_supply_shipments USING ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text));
ALTER POLICY "ims_supply_shipments_insert" ON public.ims_supply_shipments WITH CHECK (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ANY (ARRAY[ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id])) AND (s.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "ims_supply_shipments_select" ON public.ims_supply_shipments USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ANY (ARRAY[ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id])) AND (s.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "ims_supply_shipments_update" ON public.ims_supply_shipments USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ANY (ARRAY[ims_supply_shipments.source_store_id, ims_supply_shipments.destination_store_id])) AND (s.institution_id = ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "ims_unit_conversions_delete" ON public.ims_unit_conversions USING ((EXISTS ( SELECT 1
   FROM ims_items i
  WHERE ((i.id = ims_unit_conversions.item_id) AND ((i.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_unit_conversions_insert" ON public.ims_unit_conversions WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_items i
  WHERE ((i.id = ims_unit_conversions.item_id) AND ((i.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_unit_conversions_select" ON public.ims_unit_conversions USING ((EXISTS ( SELECT 1
   FROM ims_items i
  WHERE ((i.id = ims_unit_conversions.item_id) AND ((i.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_unit_conversions_update" ON public.ims_unit_conversions USING ((EXISTS ( SELECT 1
   FROM ims_items i
  WHERE ((i.id = ims_unit_conversions.item_id) AND ((i.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_units_delete" ON public.ims_units USING ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text])));
ALTER POLICY "ims_units_insert" ON public.ims_units WITH CHECK ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text])));
ALTER POLICY "ims_units_update" ON public.ims_units USING ((( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'admin'::text])));
ALTER POLICY "ims_upi_qr_payments_delete" ON public.ims_upi_qr_payments USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_upi_qr_payments.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_upi_qr_payments_insert" ON public.ims_upi_qr_payments WITH CHECK ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_upi_qr_payments.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_upi_qr_payments_select" ON public.ims_upi_qr_payments USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_upi_qr_payments.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_upi_qr_payments_update" ON public.ims_upi_qr_payments USING ((EXISTS ( SELECT 1
   FROM ims_stores s
  WHERE ((s.id = ims_upi_qr_payments.store_id) AND ((s.institution_id IN ( SELECT ims_accessible_institution_ids() AS ims_accessible_institution_ids)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text))))));
ALTER POLICY "ims_user_store_grants_delete" ON public.ims_user_store_grants USING ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text));
ALTER POLICY "ims_user_store_grants_insert" ON public.ims_user_store_grants WITH CHECK ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text));
ALTER POLICY "ims_user_store_grants_select" ON public.ims_user_store_grants USING (((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text)));
ALTER POLICY "ims_user_store_grants_update" ON public.ims_user_store_grants USING ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text));
ALTER POLICY "induction_batches_manage" ON public.induction_batches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_batches_view" ON public.induction_batches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_completion_manage" ON public.induction_completion USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_completion_view" ON public.induction_completion USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_enrollment_manage" ON public.induction_enrollment USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_enrollment_view" ON public.induction_enrollment USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_event_coordinators_admin" ON public.induction_event_coordinators USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "induction_feedback_volunteer_group_admin" ON public.induction_feedback_volunteer_group USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "induction_feedback_volunteers_admin" ON public.induction_feedback_volunteers USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "induction_mentor_month_feedback_admin" ON public.induction_mentor_month_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "imts_select" ON public.induction_mentor_training_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "induction_programs_manage" ON public.induction_programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.manage'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "induction_programs_view" ON public.induction_programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "ise_super_admin" ON public.induction_session_effectiveness USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "induction_session_poll_super_admin" ON public.induction_session_poll USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "induction_session_poll_option_super_admin" ON public.induction_session_poll_option USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "induction_session_poll_question_super_admin" ON public.induction_session_poll_question USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "induction_session_poll_vote_super_admin" ON public.induction_session_poll_vote USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "induction_session_pulse_super_admin" ON public.induction_session_pulse USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "catalog_select" ON public.induction_topic_catalog USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('induction.view'::text) AS user_has_permission)));
ALTER POLICY "catalog_link_select" ON public.induction_topic_catalog_live_link USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('induction.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "industry_mentors_delete" ON public.industry_mentors USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "industry_mentors_insert" ON public.industry_mentors WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (is_cdc_staff() AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "industry_mentors_select" ON public.industry_mentors USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))));
ALTER POLICY "industry_mentors_update" ON public.industry_mentors USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])))))));
ALTER POLICY "industry_partners_delete" ON public.industry_partners USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "industry_partners_insert" ON public.industry_partners WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "industry_partners_select" ON public.industry_partners USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))));
ALTER POLICY "industry_partners_update" ON public.industry_partners USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text])))))));
ALTER POLICY "industry_projects_delete" ON public.industry_projects USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "industry_projects_insert" ON public.industry_projects WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text]))))));
ALTER POLICY "industry_projects_select" ON public.industry_projects USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true))))));
ALTER POLICY "industry_projects_update" ON public.industry_projects USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text])))))));
ALTER POLICY "auth_read_call_settings" ON public.institution_call_settings USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))));
ALTER POLICY "ic_delete" ON public.institution_collaborations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.collaborations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ic_insert" ON public.institution_collaborations WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.collaborations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ic_select" ON public.institution_collaborations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.collaborations.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ic_update" ON public.institution_collaborations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.collaborations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.collaborations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "Institution admin can view own health_scores" ON public.institution_health_scores USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Super admin can view all health_scores" ON public.institution_health_scores USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "institution_leaves_delete_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "institution_leaves_insert_policy" ON public.institution_leaves WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "institution_leaves_select_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "institution_leaves_update_policy" ON public.institution_leaves USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "institution_off_days_select" ON public.institution_off_days USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "institution_off_days_write" ON public.institution_off_days USING (((EXISTS ( SELECT 1
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.institution_id = institution_off_days.institution_id) AND ((user_institution_access.access_type)::text = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.institution_id = institution_off_days.institution_id) AND ((user_institution_access.access_type)::text = 'admin'::text)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "inst_prog_approvals_select" ON public.institution_program_approvals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.institution_id = institution_program_approvals.institution_id) OR ((acting.role_key)::text = ANY (ARRAY[('director'::character varying)::text, ('trust_secretary'::character varying)::text, ('chairperson'::character varying)::text]))))))));
ALTER POLICY "inst_prog_approvals_write" ON public.institution_program_approvals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "institutions_delete_admin" ON public.institutions USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "institutions_insert_admin" ON public.institutions WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "institutions_update_admin" ON public.institutions USING (((id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "imic_select" ON public.internal_marks_insight_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.internal-marks.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "imic_write" ON public.internal_marks_insight_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.internal-marks.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.internal-marks.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "internship_approval_chains_institution_access" ON public.internship_approval_chains USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_assignments_institution_access" ON public.internship_assignments USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_certificates_institution_access" ON public.internship_certificates USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_college_blackouts_institution_access" ON public.internship_college_blackouts USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_college_notification_overrides_institution_access" ON public.internship_college_notification_overrides USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_cycle_hospitals_institution_access" ON public.internship_cycle_hospitals USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_cycle_status_labels_institution_access" ON public.internship_cycle_status_labels USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_evaluation_rubrics_institution_access" ON public.internship_evaluation_rubrics USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_evaluations_institution_access" ON public.internship_evaluations USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_external_sites_institution_access" ON public.internship_external_sites USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_incidents_institution_access" ON public.internship_incidents USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_logbook_entries_institution_access" ON public.internship_logbook_entries USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_logbook_templates_institution_access" ON public.internship_logbook_templates USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_posting_cycles_institution_access" ON public.internship_posting_cycles USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_preceptors_institution_access" ON public.internship_preceptors USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_program_config_institution_access" ON public.internship_program_config USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_site_contacts_institution_access" ON public.internship_site_contacts USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "internship_site_types_modify" ON public.internship_site_types USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((institution_id IS NOT NULL) AND (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "internship_site_types_select" ON public.internship_site_types USING (((institution_id IS NULL) OR (institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "internship_vehicles_institution_access" ON public.internship_vehicles USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "ip_filings_insert" ON public.ip_filings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('faculty_innovation.ip.register'::text) AS user_has_permission) AND (inventor_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "ip_filings_select" ON public.ip_filings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (inventor_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "ip_filings_update" ON public.ip_filings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (inventor_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = 'director'::text)));
ALTER POLICY "lc_announcement_reads_insert" ON public.lc_announcement_reads WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_announcement_reads_select" ON public.lc_announcement_reads USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_announcements_insert" ON public.lc_announcements WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (((status)::text = 'draft'::text) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive())));
ALTER POLICY "lc_announcements_select" ON public.lc_announcements USING ((((status)::text = 'published'::text) OR (created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive()));
ALTER POLICY "lc_announcements_update" ON public.lc_announcements USING (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive())) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive()));
ALTER POLICY "lc_chat_channels_insert" ON public.lc_chat_channels WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_chat_channels_select" ON public.lc_chat_channels USING (((created_by = ( SELECT auth.uid() AS uid)) OR fn_is_lc_chat_member(id)));
ALTER POLICY "lc_chat_members_select" ON public.lc_chat_members USING (((user_id = ( SELECT auth.uid() AS uid)) OR fn_is_lc_chat_member(channel_id)));
ALTER POLICY "lc_chat_messages_insert" ON public.lc_chat_messages WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND fn_is_lc_chat_member(channel_id)));
ALTER POLICY "lc_chat_messages_update" ON public.lc_chat_messages USING ((sender_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "committee_members_delete_super" ON public.lc_committee_members USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "committee_members_insert_super" ON public.lc_committee_members WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "committee_members_update_super" ON public.lc_committee_members USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "lc_election_votes_insert" ON public.lc_election_votes WITH CHECK ((voter_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_election_votes_select" ON public.lc_election_votes USING ((voter_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_elections_insert" ON public.lc_elections WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_elections_update" ON public.lc_elections USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_event_approvals_insert" ON public.lc_event_approvals WITH CHECK ((approver_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_event_approvals_update" ON public.lc_event_approvals USING ((approver_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_event_participants_insert" ON public.lc_event_participants WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_event_participants_update" ON public.lc_event_participants USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_events_insert" ON public.lc_events WITH CHECK ((proposed_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_events_update" ON public.lc_events USING (((proposed_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_forum_posts_insert" ON public.lc_forum_posts WITH CHECK ((author_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_forum_posts_update" ON public.lc_forum_posts USING (((author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_forum_reactions_delete" ON public.lc_forum_reactions USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_forum_reactions_insert" ON public.lc_forum_reactions WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_forum_topics_insert" ON public.lc_forum_topics WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_interviews_select" ON public.lc_interviews USING (((interviewer_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_nominations n
  WHERE ((n.id = lc_interviews.nomination_id) AND (n.nominee_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_interviews_update" ON public.lc_interviews USING ((interviewer_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_nominations_insert" ON public.lc_nominations WITH CHECK ((nominee_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_nominations_update" ON public.lc_nominations USING (((nominee_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_notification_prefs_insert" ON public.lc_notification_preferences WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_notification_prefs_select" ON public.lc_notification_preferences USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_notification_prefs_update" ON public.lc_notification_preferences USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_notifications_select" ON public.lc_notifications USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_notifications_update" ON public.lc_notifications USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_od_chains_insert" ON public.lc_od_approval_chains WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive())));
ALTER POLICY "lc_od_chains_update" ON public.lc_od_approval_chains USING ((( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive())) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive()));
ALTER POLICY "lc_od_approvals_insert" ON public.lc_od_approvals WITH CHECK ((approver_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_od_requests_insert" ON public.lc_od_requests WITH CHECK ((requester_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_od_requests_select" ON public.lc_od_requests USING (((requester_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_od_requests_update" ON public.lc_od_requests USING (((requester_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM lc_members
  WHERE ((lc_members.user_id = ( SELECT auth.uid() AS uid)) AND ((lc_members.status)::text = 'active'::text))))));
ALTER POLICY "lc_poll_votes_insert" ON public.lc_poll_votes WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_poll_votes_select" ON public.lc_poll_votes USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_polls_insert" ON public.lc_polls WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "lc_polls_select" ON public.lc_polls USING ((((status)::text = ANY (ARRAY[('active'::character varying)::text, ('closed'::character varying)::text])) OR (created_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "lc_polls_update" ON public.lc_polls USING (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive())) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR fn_is_lc_executive()));
ALTER POLICY "committees_delete_super" ON public.lc_portfolio_committees USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "committees_insert_super" ON public.lc_portfolio_committees WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "committees_update_super" ON public.lc_portfolio_committees USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))));
ALTER POLICY "lead_active_stage_policy_write_super_admin" ON public.lead_active_stage_policy USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "learner_admission_documents_read" ON public.learner_admission_documents USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_admission_documents.learner_id) AND (( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission_documents.manage'::text) AS user_has_permission)) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "learner_admission_documents_write" ON public.learner_admission_documents USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_admission_documents.learner_id) AND ( SELECT user_has_permission('admission_documents.manage'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_admission_documents.learner_id) AND ( SELECT user_has_permission('admission_documents.manage'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "learner_competencies_delete" ON public.learner_competencies USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "learner_competencies_insert" ON public.learner_competencies WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text]))))));
ALTER POLICY "learner_competencies_select" ON public.learner_competencies USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learner_competencies_update" ON public.learner_competencies USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "lcs_admin_select" ON public.learner_contribution_scores USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (COALESCE(( SELECT user_has_permission('learners.contribution.view'::text) AS user_has_permission), false) AND COALESCE(role_has_institution_access(institution_id), false))));
ALTER POLICY "learner_core_okrs_select" ON public.learner_core_okrs USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "learner_core_okrs_update" ON public.learner_core_okrs USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text))))));
ALTER POLICY "learner_elective_okrs_delete" ON public.learner_elective_okrs USING (((learner_id = ( SELECT auth.uid() AS uid)) AND (status = 'not_started'::kr_status)));
ALTER POLICY "learner_elective_okrs_select" ON public.learner_elective_okrs USING (((learner_id = ( SELECT auth.uid() AS uid)) OR (approved_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'faculty'::text])))))));
ALTER POLICY "learner_elective_okrs_update" ON public.learner_elective_okrs USING (((learner_id = ( SELECT auth.uid() AS uid)) OR (approved_by = ( SELECT auth.uid() AS uid))));
ALTER POLICY "lhp_delete_permission" ON public.learner_hostel_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "lhp_insert_permission" ON public.learner_hostel_profiles WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_hostel_profiles.learner_id) AND ( SELECT user_has_permission('campus_living.residents.edit'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))) OR (( SELECT user_has_permission('campus_living.profile.edit_own'::text) AS user_has_permission) AND (learner_id = get_my_learner_id()))));
ALTER POLICY "lhp_select_permission" ON public.learner_hostel_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_hostel_profiles.learner_id) AND ( SELECT user_has_permission('campus_living.residents.view'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))) OR (( SELECT user_has_permission('campus_living.profile.view_own'::text) AS user_has_permission) AND (learner_id = get_my_learner_id()))));
ALTER POLICY "lhp_update_permission" ON public.learner_hostel_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_hostel_profiles.learner_id) AND ( SELECT user_has_permission('campus_living.residents.edit'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))) OR (( SELECT user_has_permission('campus_living.profile.edit_own'::text) AS user_has_permission) AND (learner_id = get_my_learner_id())))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = learner_hostel_profiles.learner_id) AND ( SELECT user_has_permission('campus_living.residents.edit'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))) OR (( SELECT user_has_permission('campus_living.profile.edit_own'::text) AS user_has_permission) AND (learner_id = get_my_learner_id()))));
ALTER POLICY "learner_engagements_delete" ON public.learner_industry_engagements USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "learner_engagements_insert" ON public.learner_industry_engagements WITH CHECK (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learner_engagements_select" ON public.learner_industry_engagements USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learner_engagements_update" ON public.learner_industry_engagements USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "Service role manages learner_interventions" ON public.learner_interventions USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "Staff can create interventions" ON public.learner_interventions WITH CHECK (((intervener_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_interventions.institution_id) AND (p.role = ANY (ARRAY['principal'::text, 'admin'::text, 'hod'::text, 'faculty'::text])))))));
ALTER POLICY "Staff can update interventions" ON public.learner_interventions USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_interventions.institution_id) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['principal'::text, 'admin'::text, 'hod'::text, 'faculty'::text])))))));
ALTER POLICY "Staff can view interventions" ON public.learner_interventions USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_interventions.institution_id) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['principal'::text, 'admin'::text, 'hod'::text, 'faculty'::text])))))));
ALTER POLICY "learner_okr_assignments_select" ON public.learner_okr_assignments USING (((learner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'manager'::text, 'faculty'::text])))))));
ALTER POLICY "learner_okr_assignments_update" ON public.learner_okr_assignments USING (((learner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'system'::text])))))));
ALTER POLICY "learner_package_assignment_delete" ON public.learner_package_assignment USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "learner_package_assignment_insert" ON public.learner_package_assignment WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "learner_package_assignment_update" ON public.learner_package_assignment USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Learner can insert own pulse response" ON public.learner_pulse_responses WITH CHECK ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Learner can view own pulse responses" ON public.learner_pulse_responses USING ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Service role manages learner_pulse_responses" ON public.learner_pulse_responses USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "Staff can view pulse responses" ON public.learner_pulse_responses USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_pulse_responses.institution_id) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['principal'::text, 'admin'::text, 'hod'::text, 'faculty'::text])))))));
ALTER POLICY "Faculty can view department risk assessments" ON public.learner_risk_assessments USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = learner_risk_assessments.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_risk_assessments.institution_id) AND (p.department_id = lp.department_id) AND (p.role = ANY (ARRAY['hod'::text, 'faculty'::text]))))));
ALTER POLICY "Institution admins can view risk assessments" ON public.learner_risk_assessments USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = learner_risk_assessments.institution_id) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['principal'::text, 'admin'::text])))))));
ALTER POLICY "Learner can view own risk assessment" ON public.learner_risk_assessments USING ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Service role manages learner_risk_assessments" ON public.learner_risk_assessments USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "learner_self_fill_tokens_read" ON public.learner_self_fill_tokens USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('admission.leads.student_form.generate'::text) AS user_has_permission)));
ALTER POLICY "fee_backfill_failures_select_admin" ON public.learners_profile_fee_backfill_failures USING (( SELECT user_has_permission('admission_fees.manage_adjustments'::text) AS user_has_permission));
ALTER POLICY "lpsh_select" ON public.learners_profile_status_history USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('learners.profiles.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('admission.settings.statuses.manage'::text) AS user_has_permission)));
ALTER POLICY "learners_profiles_delete_policy" ON public.learners_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('learners.admissions.delete'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.profiles.delete'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.delete'::text) AS user_has_permission)))));
ALTER POLICY "learners_profiles_insert_policy" ON public.learners_profiles WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('learners.admissions.create'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.profiles.create'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.create'::text) AS user_has_permission)))));
ALTER POLICY "learners_profiles_select_policy" ON public.learners_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ((institution_id = ANY (( SELECT array_agg(i.id) AS array_agg
   FROM institutions i
  WHERE role_has_institution_access(i.id))::uuid[])) AND (( SELECT user_has_permission('learners.admissions.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.profiles.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.view'::text) AS user_has_permission))) OR (student_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (college_email = ( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "learners_profiles_update_policy" ON public.learners_profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('learners.admissions.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.profiles.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.edit'::text) AS user_has_permission)))));
ALTER POLICY "students_view_own_learner_profile" ON public.learners_profiles USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = learners_profiles.id) AND (p.role = 'student'::text)))));
ALTER POLICY "fee_backfill_snapshot_select_admin" ON public.learners_profiles_fee_backfill_snapshot_20260516 USING (( SELECT user_has_permission('admission_fees.manage_adjustments'::text) AS user_has_permission));
ALTER POLICY "learning_path_steps_delete" ON public.learning_path_steps USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "learning_path_steps_insert" ON public.learning_path_steps WITH CHECK (((path_id IN ( SELECT lp.id
   FROM learning_paths lp
  WHERE (lp.learner_id IN ( SELECT lpr.id
           FROM (learners_profiles lpr
             JOIN profiles p ON ((lower(p.email) = lower(lpr.student_email))))
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learning_path_steps_select" ON public.learning_path_steps USING (((path_id IN ( SELECT lp.id
   FROM learning_paths lp
  WHERE (lp.learner_id IN ( SELECT lpr.id
           FROM (learners_profiles lpr
             JOIN profiles p ON ((lower(p.email) = lower(lpr.student_email))))
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learning_path_steps_update" ON public.learning_path_steps USING (((path_id IN ( SELECT lp.id
   FROM learning_paths lp
  WHERE (lp.learner_id IN ( SELECT lpr.id
           FROM (learners_profiles lpr
             JOIN profiles p ON ((lower(p.email) = lower(lpr.student_email))))
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learning_paths_delete" ON public.learning_paths USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "learning_paths_insert" ON public.learning_paths WITH CHECK (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learning_paths_select" ON public.learning_paths USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "learning_paths_update" ON public.learning_paths USING (((learner_id IN ( SELECT lp.id
   FROM (learners_profiles lp
     JOIN profiles p ON ((lower(p.email) = lower(lp.student_email))))
  WHERE (p.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "leave_approval_chains_delete_policy" ON public.leave_approval_chains USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_approval_chains_insert_policy" ON public.leave_approval_chains WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_approval_chains_select_policy" ON public.leave_approval_chains USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_approval_chains_update_policy" ON public.leave_approval_chains USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_approvals_insert_policy" ON public.leave_approvals WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (EXISTS ( SELECT 1
   FROM institution_leaves il
  WHERE ((il.id = leave_approvals.leave_id) AND (il.institution_id = ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "leave_approvals_select_policy" ON public.leave_approvals USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (EXISTS ( SELECT 1
   FROM institution_leaves il
  WHERE ((il.id = leave_approvals.leave_id) AND (il.institution_id = ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "leave_approvals_update_policy" ON public.leave_approvals USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR ((approver_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM institution_leaves il
  WHERE ((il.id = leave_approvals.leave_id) AND (il.institution_id = ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "admins_update_applications" ON public.leave_onduty_applications USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text]))))));
ALTER POLICY "admins_view_all_institution" ON public.leave_onduty_applications USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text, 'hod'::text, 'principal'::text, 'faculty'::text])))))));
ALTER POLICY "learners_create_applications" ON public.leave_onduty_applications WITH CHECK ((learner_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "learners_delete_own_cancelled" ON public.leave_onduty_applications USING (((status = 'cancelled'::application_status) AND (learner_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))));
ALTER POLICY "learners_update_own_pending" ON public.leave_onduty_applications USING (((learner_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))) AND (status = 'pending'::application_status))) WITH CHECK ((learner_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "learners_view_own_applications" ON public.leave_onduty_applications USING ((learner_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sponsors_update_own_pending" ON public.leave_onduty_applications USING (((sponsor_id = ( SELECT auth.uid() AS uid)) AND (sponsor_approval_status = 'pending'::text))) WITH CHECK ((sponsor_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sponsors_view_assigned" ON public.leave_onduty_applications USING ((sponsor_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "academic_staff_view_flows" ON public.leave_onduty_approval_flows USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))) OR ((p.role = ANY (ARRAY['hod'::text, 'principal'::text, 'faculty'::text, 'staff'::text])) AND (p.institution_id = leave_onduty_approval_flows.institution_id)))))));
ALTER POLICY "admins_and_hod_manage_flows" ON public.leave_onduty_approval_flows USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))) OR ((p.role = ANY (ARRAY['hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_approval_flows.institution_id))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid))))) OR ((p.role = ANY (ARRAY['hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_approval_flows.institution_id)))))));
ALTER POLICY "admins_insert_approvals" ON public.leave_onduty_approvals WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text]))))) OR (approver_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "admins_view_all" ON public.leave_onduty_approvals USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text]))))));
ALTER POLICY "approvers_update_own" ON public.leave_onduty_approvals USING (((approver_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::approval_status))) WITH CHECK ((approver_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "approvers_view_own" ON public.leave_onduty_approvals USING ((approver_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "view_approvals_for_chain" ON public.leave_onduty_approvals USING (((approver_id = ( SELECT auth.uid() AS uid)) OR can_see_leave_onduty_application(application_id)));
ALTER POLICY "admins_delete_attendance_updates" ON public.leave_onduty_attendance_updates USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text]))))));
ALTER POLICY "admins_insert_attendance_updates" ON public.leave_onduty_attendance_updates WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text]))))));
ALTER POLICY "admins_view_updates" ON public.leave_onduty_attendance_updates USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text, 'staff'::text]))))));
ALTER POLICY "learners_view_own_updates" ON public.leave_onduty_attendance_updates USING ((student_id IN ( SELECT learners_profiles.id
   FROM learners_profiles
  WHERE (learners_profiles.id = ( SELECT profiles.learner_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sub_categories_delete" ON public.leave_onduty_sub_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true) OR ((p.role = ANY (ARRAY['administrator'::text, 'admin'::text, 'hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_sub_categories.institution_id)))))));
ALTER POLICY "sub_categories_insert" ON public.leave_onduty_sub_categories WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true) OR ((p.role = ANY (ARRAY['administrator'::text, 'admin'::text, 'hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_sub_categories.institution_id)))))));
ALTER POLICY "sub_categories_select" ON public.leave_onduty_sub_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true) OR (p.institution_id = leave_onduty_sub_categories.institution_id))))));
ALTER POLICY "sub_categories_update" ON public.leave_onduty_sub_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true) OR ((p.role = ANY (ARRAY['administrator'::text, 'admin'::text, 'hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_sub_categories.institution_id))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true) OR ((p.role = ANY (ARRAY['administrator'::text, 'admin'::text, 'hod'::text, 'principal'::text])) AND (p.institution_id = leave_onduty_sub_categories.institution_id)))))));
ALTER POLICY "team_members_delete" ON public.leave_onduty_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM (leave_onduty_applications a
     JOIN learners_profiles lp ON ((lp.id = a.learner_id)))
  WHERE ((a.id = leave_onduty_team_members.application_id) AND (lp.student_email = auth.email()) AND (a.status = 'pending'::application_status))))));
ALTER POLICY "team_members_insert" ON public.leave_onduty_team_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM (leave_onduty_applications a
     JOIN learners_profiles lp ON ((lp.id = a.learner_id)))
  WHERE ((a.id = leave_onduty_team_members.application_id) AND (lp.student_email = auth.email()) AND (a.status = 'pending'::application_status))))));
ALTER POLICY "team_members_select" ON public.leave_onduty_team_members USING ((EXISTS ( SELECT 1
   FROM leave_onduty_applications a
  WHERE ((a.id = leave_onduty_team_members.application_id) AND (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (a.learner_id IN ( SELECT lp.id
           FROM learners_profiles lp
          WHERE (lp.student_email = auth.email()))) OR (leave_onduty_team_members.learner_id IN ( SELECT lp.id
           FROM learners_profiles lp
          WHERE (lp.student_email = auth.email()))) OR role_has_institution_access(a.institution_id))))));
ALTER POLICY "leave_types_delete_policy" ON public.leave_types USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_types_insert_policy" ON public.leave_types WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_types_select_policy" ON public.leave_types USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "leave_types_update_policy" ON public.leave_types USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))) OR (institution_id = ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "loop_audits_select_admin" ON public.loop_audits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "loop_conflicts_select_admin" ON public.loop_conflicts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "loop_edges_select_admin" ON public.loop_edges USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "loop_registry_select_admin" ON public.loop_registry USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "Institution-based grade access" ON public.lti_grades USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Users see own grades" ON public.lti_grades USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))));
ALTER POLICY "Institution-based launch access" ON public.lti_launches USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Users see own launches" ON public.lti_launches USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'administrator'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))));
ALTER POLICY "Admins manage LTI tools" ON public.lti_tools USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = ANY (ARRAY['super_admin'::text, 'administrator'::text])));
ALTER POLICY "marketing_leads_db_delete" ON public.marketing_leads_database USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "marketing_leads_db_insert" ON public.marketing_leads_database WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "marketing_leads_db_select" ON public.marketing_leads_database USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "marketing_leads_db_update" ON public.marketing_leads_database USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "Staff can manage assessments" ON public.maturity_assessments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'hod'::text]))))));
ALTER POLICY "Users can view assessments for their institution" ON public.maturity_assessments USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Staff can manage evidence" ON public.maturity_evidence USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'hod'::text]))))));
ALTER POLICY "Users can view evidence" ON public.maturity_evidence USING ((EXISTS ( SELECT 1
   FROM (maturity_assessments ma
     JOIN profiles up ON ((up.institution_id = ma.institution_id)))
  WHERE ((ma.id = maturity_evidence.assessment_id) AND (up.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "Admins can manage frameworks" ON public.maturity_frameworks USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Users can view frameworks for their institution" ON public.maturity_frameworks USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Staff can manage progress" ON public.maturity_progress USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'hod'::text]))))));
ALTER POLICY "Users can view progress for their assessments" ON public.maturity_progress USING ((EXISTS ( SELECT 1
   FROM (maturity_assessments ma
     JOIN profiles up ON ((up.institution_id = ma.institution_id)))
  WHERE ((ma.id = maturity_progress.assessment_id) AND (up.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "mba_area_views_manage_all" ON public.mba_area_analyst_views USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_area_views_read" ON public.mba_area_analyst_views USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_postings_associate_read_own" ON public.mba_associate_postings USING ((associate_user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "mba_postings_manage_all" ON public.mba_associate_postings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_data_gaps_associate_read_own" ON public.mba_data_gaps USING ((filed_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "mba_data_gaps_manage" ON public.mba_data_gaps USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_dept_artifact_versions_select" ON public.mba_dept_artifact_versions USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('improvement.area_policy.approve'::text) AS user_has_permission) OR (( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM mba_associate_postings p
  WHERE ((p.area_id = mba_dept_artifact_versions.area_id) AND (p.associate_user_id = ( SELECT auth.uid() AS uid))))))));
ALTER POLICY "mba_dept_artifacts_select" ON public.mba_dept_artifacts USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('improvement.area_policy.approve'::text) AS user_has_permission) OR (( SELECT user_has_permission('improvement.ideas.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM mba_associate_postings p
  WHERE ((p.area_id = mba_dept_artifacts.area_id) AND (p.associate_user_id = ( SELECT auth.uid() AS uid))))))));
ALTER POLICY "mba_rotation_blackouts_manage_all" ON public.mba_rotation_blackouts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_rotation_blackouts_read" ON public.mba_rotation_blackouts USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_rotation_cycle_departments_manage_all" ON public.mba_rotation_cycle_departments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_rotation_cycle_departments_read" ON public.mba_rotation_cycle_departments USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_rotation_cycles_manage_all" ON public.mba_rotation_cycles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_rotation_cycles_read" ON public.mba_rotation_cycles USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_rotation_slots_manage_all" ON public.mba_rotation_slots USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_rotation_slots_read" ON public.mba_rotation_slots USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_team_members_manage_all" ON public.mba_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_team_members_read" ON public.mba_team_members USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mba_teams_manage_all" ON public.mba_teams USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "mba_teams_read" ON public.mba_teams USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "meeting_action_items_select" ON public.meeting_action_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_agenda_items_select" ON public.meeting_agenda_items USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_agendas a
  WHERE ((a.id = meeting_agenda_items.agenda_id) AND (a.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_agendas_select" ON public.meeting_agendas USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mb_host_select" ON public.meeting_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_contacts_delete" ON public.meeting_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_contacts_insert" ON public.meeting_contacts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_contacts_select" ON public.meeting_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND (( SELECT user_has_permission('meetings.contacts.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('meetings.view'::text) AS user_has_permission)))));
ALTER POLICY "meeting_contacts_update" ON public.meeting_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mccm_admin" ON public.meeting_counselor_cal_mapping USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "mhd_delete" ON public.meeting_host_delegates USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhd_insert" ON public.meeting_host_delegates WITH CHECK ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhd_select" ON public.meeting_host_delegates USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (host_profile_id = ( SELECT auth.uid() AS uid)) OR (delegate_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhd_update" ON public.meeting_host_delegates USING ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((COALESCE(( SELECT is_super_admin() AS is_super_admin), false) OR COALESCE(( SELECT is_admin() AS is_admin), false) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhgc_host_select" ON public.meeting_host_google_connections USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhip_host_all" ON public.meeting_host_integration_prefs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhp_host_all" ON public.meeting_host_pages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mhs_host_all" ON public.meeting_host_schedules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_poll_options_host_all" ON public.meeting_poll_options USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_polls p
  WHERE ((p.id = meeting_poll_options.poll_id) AND (p.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_polls p
  WHERE ((p.id = meeting_poll_options.poll_id) AND (p.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_poll_options_perm_select" ON public.meeting_poll_options USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.polls.view'::text) AS user_has_permission)));
ALTER POLICY "meeting_poll_votes_host_all" ON public.meeting_poll_votes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_polls p
  WHERE ((p.id = meeting_poll_votes.poll_id) AND (p.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_polls p
  WHERE ((p.id = meeting_poll_votes.poll_id) AND (p.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_poll_votes_perm_select" ON public.meeting_poll_votes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.polls.view'::text) AS user_has_permission)));
ALTER POLICY "meeting_polls_host_all" ON public.meeting_polls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_polls_perm_select" ON public.meeting_polls USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('meetings.polls.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mrc_admin" ON public.meeting_routing_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "mrc_select_admin" ON public.meeting_routing_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mrl_select_staff" ON public.meeting_routing_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('admission.leads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (counselor_user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mso_host_all" ON public.meeting_schedule_overrides USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_host_schedules s
  WHERE ((s.id = meeting_schedule_overrides.schedule_id) AND (s.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_host_schedules s
  WHERE ((s.id = meeting_schedule_overrides.schedule_id) AND (s.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "msw_host_all" ON public.meeting_schedule_windows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_host_schedules s
  WHERE ((s.id = meeting_schedule_windows.schedule_id) AND (s.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_host_schedules s
  WHERE ((s.id = meeting_schedule_windows.schedule_id) AND (s.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_trigger_events_admin_all" ON public.meeting_trigger_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meeting_trigger_rules_admin_all" ON public.meeting_trigger_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "mtc_host_all" ON public.meeting_type_cohosts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_types mt
  WHERE ((mt.id = meeting_type_cohosts.meeting_type_id) AND (mt.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_types mt
  WHERE ((mt.id = meeting_type_cohosts.meeting_type_id) AND (mt.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "mt_host_all" ON public.meeting_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_webhook_deliveries_select" ON public.meeting_webhook_deliveries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.webhooks.view'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM meeting_webhooks w
  WHERE ((w.id = meeting_webhook_deliveries.webhook_id) AND (w.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_webhooks_delete" ON public.meeting_webhooks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_webhooks_insert" ON public.meeting_webhooks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT user_has_permission('meetings.webhooks.manage'::text) AS user_has_permission)) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_webhooks_select" ON public.meeting_webhooks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('meetings.webhooks.view'::text) AS user_has_permission)));
ALTER POLICY "meeting_webhooks_update" ON public.meeting_webhooks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_workflow_actions_select" ON public.meeting_workflow_actions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM meeting_workflows w
  WHERE ((w.id = meeting_workflow_actions.workflow_id) AND (w.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_workflow_actions_write" ON public.meeting_workflow_actions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_workflows w
  WHERE ((w.id = meeting_workflow_actions.workflow_id) AND (w.host_profile_id = ( SELECT auth.uid() AS uid))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM meeting_workflows w
  WHERE ((w.id = meeting_workflow_actions.workflow_id) AND (w.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_workflow_runs_select" ON public.meeting_workflow_runs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM meeting_workflows w
  WHERE ((w.id = meeting_workflow_runs.workflow_id) AND (w.host_profile_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meeting_workflows_delete" ON public.meeting_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND (( SELECT user_has_permission('meetings.workflows.delete'::text) AS user_has_permission) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission)))));
ALTER POLICY "meeting_workflows_insert" ON public.meeting_workflows WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND (( SELECT user_has_permission('meetings.workflows.create'::text) AS user_has_permission) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission)))));
ALTER POLICY "meeting_workflows_select" ON public.meeting_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "meeting_workflows_update" ON public.meeting_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND (( SELECT user_has_permission('meetings.workflows.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('meetings.workflows.view'::text) AS user_has_permission)))));
ALTER POLICY "mentor_signal_snapshot_select" ON public.mentor_signal_snapshot USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mps_select" ON public.menu_permissions_seed USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "mps_write" ON public.menu_permissions_seed USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "mess_billing_periods_delete_permission" ON public.mess_billing_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_billing_periods_insert_permission" ON public.mess_billing_periods WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_billing_periods_select_permission" ON public.mess_billing_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_billing_periods_update_permission" ON public.mess_billing_periods USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_categories_delete" ON public.mess_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "mess_categories_insert" ON public.mess_categories WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "mess_categories_update" ON public.mess_categories USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "mess_caterer_blocks_delete_permission" ON public.mess_caterer_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.cancel'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_caterer_blocks_insert_permission" ON public.mess_caterer_blocks WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.book'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_caterer_blocks_select_permission" ON public.mess_caterer_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_caterer_blocks_update_permission" ON public.mess_caterer_blocks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_caterers_delete_permission" ON public.mess_caterers USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_caterers_insert_permission" ON public.mess_caterers WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_caterers_select_permission" ON public.mess_caterers USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_caterers_update_permission" ON public.mess_caterers USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.caterers.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_dish_votes_owner_all" ON public.mess_dish_votes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = mess_dish_votes.learner_id)))) OR ( SELECT user_has_permission('campus_living.mess.menu.view'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = mess_dish_votes.learner_id))))));
ALTER POLICY "mess_feedback_delete_permission" ON public.mess_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.feedback.cancel'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_feedback_insert_permission" ON public.mess_feedback WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.feedback.book'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_feedback_select_permission" ON public.mess_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.feedback.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_feedback_update_permission" ON public.mess_feedback USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.feedback.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.feedback.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_meal_alternatives_read_auth" ON public.mess_meal_alternatives USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "mess_meal_alternatives_write_staff" ON public.mess_meal_alternatives USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission)));
ALTER POLICY "mess_meal_bookings_delete_permission" ON public.mess_meal_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_bookings_insert_permission" ON public.mess_meal_bookings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_bookings_select_permission" ON public.mess_meal_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_bookings_update_permission" ON public.mess_meal_bookings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_choices_owner_all" ON public.mess_meal_choices USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = mess_meal_choices.learner_id)))) OR ( SELECT user_has_permission('campus_living.mess.menu.view'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.learner_id = mess_meal_choices.learner_id))))));
ALTER POLICY "mess_meal_ratings_delete" ON public.mess_meal_ratings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "mess_meal_ratings_insert" ON public.mess_meal_ratings WITH CHECK (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mess_meal_ratings_select" ON public.mess_meal_ratings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('campus_living.mess.feedback.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_ratings_update" ON public.mess_meal_ratings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "mess_meal_records_delete_permission" ON public.mess_meal_records USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_records_insert_permission" ON public.mess_meal_records WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_records_select_permission" ON public.mess_meal_records USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_meal_records_update_permission" ON public.mess_meal_records USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.meals.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_menu_item_library_write" ON public.mess_menu_item_library USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'administrator'::text]))))));
ALTER POLICY "mmr_select" ON public.mess_menu_recommendations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_menus_delete_permission" ON public.mess_menus USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.cancel'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_menus_insert_permission" ON public.mess_menus WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.book'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_menus_select_permission" ON public.mess_menus USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_menus_update_permission" ON public.mess_menus USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_special_day_proposals_read_auth" ON public.mess_special_day_proposals USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "mess_special_day_proposals_write_staff" ON public.mess_special_day_proposals USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('campus_living.mess.menu.publish'::text) AS user_has_permission)));
ALTER POLICY "mess_student_billing_delete_permission" ON public.mess_student_billing USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_student_billing_insert_permission" ON public.mess_student_billing WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_student_billing_select_permission" ON public.mess_student_billing USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_student_billing_update_permission" ON public.mess_student_billing USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.billing.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "mess_waste_log_delete_permission" ON public.mess_waste_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.waste.cancel'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_waste_log_insert_permission" ON public.mess_waste_log WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.waste.book'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_waste_log_select_permission" ON public.mess_waste_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.waste.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "mess_waste_log_update_permission" ON public.mess_waste_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.waste.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('campus_living.mess.waste.publish'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND role_has_contract_access(caterer_id, 'caterer'::text))));
ALTER POLICY "messenger_conversations_select" ON public.messenger_conversations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.institution_id = messenger_conversations.institution_id))))));
ALTER POLICY "messenger_conversations_service_all" ON public.messenger_conversations USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "messenger_conversations_social_perm_read" ON public.messenger_conversations USING ((( SELECT user_has_permission('social.messenger.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "messenger_messages_select" ON public.messenger_messages USING ((EXISTS ( SELECT 1
   FROM (messenger_conversations c
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((c.id = messenger_messages.conversation_id) AND ((p.is_super_admin = true) OR (p.institution_id = c.institution_id))))));
ALTER POLICY "messenger_messages_service_all" ON public.messenger_messages USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "messenger_messages_social_perm_read" ON public.messenger_messages USING (( SELECT user_has_permission('social.messenger.view'::text) AS user_has_permission));
ALTER POLICY "meta_ad_accounts_select" ON public.meta_ad_accounts USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))));
ALTER POLICY "meta_ad_accounts_social_perm_read" ON public.meta_ad_accounts USING ((( SELECT user_has_permission('social.ads.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_ad_insights_select" ON public.meta_ad_insights USING ((EXISTS ( SELECT 1
   FROM meta_ad_accounts a
  WHERE ((a.id = meta_ad_insights.account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "meta_ad_insights_social_perm_read" ON public.meta_ad_insights USING (( SELECT user_has_permission('social.ads.view'::text) AS user_has_permission));
ALTER POLICY "meta_audience_rules_delete" ON public.meta_audience_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_audience_rules_insert" ON public.meta_audience_rules WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_audience_rules_select" ON public.meta_audience_rules USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (institution_id IN ( SELECT p.institution_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "meta_audience_rules_social_perm_delete" ON public.meta_audience_rules USING ((( SELECT user_has_permission('social.meta_audiences.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_audience_rules_social_perm_insert" ON public.meta_audience_rules WITH CHECK (( SELECT user_has_permission('social.meta_audiences.manage'::text) AS user_has_permission));
ALTER POLICY "meta_audience_rules_social_perm_read" ON public.meta_audience_rules USING ((( SELECT user_has_permission('social.meta_audiences.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_audience_rules_social_perm_update" ON public.meta_audience_rules USING ((( SELECT user_has_permission('social.meta_audiences.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('social.meta_audiences.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_audience_rules_update" ON public.meta_audience_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_audience_sync_history_select" ON public.meta_audience_sync_history USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (rule_id IN ( SELECT r.id
   FROM meta_audience_rules r
  WHERE (r.institution_id IN ( SELECT p.institution_id
           FROM profiles p
          WHERE (p.id = ( SELECT auth.uid() AS uid)))))))));
ALTER POLICY "meta_audience_sync_history_social_perm_read" ON public.meta_audience_sync_history USING (( SELECT user_has_permission('social.meta_audiences.view'::text) AS user_has_permission));
ALTER POLICY "meta_business_accounts_select" ON public.meta_business_accounts USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "meta_business_accounts_social_perm_read" ON public.meta_business_accounts USING ((( SELECT user_has_permission('social.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_campaigns_select" ON public.meta_campaigns USING ((EXISTS ( SELECT 1
   FROM meta_ad_accounts a
  WHERE ((a.id = meta_campaigns.account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))))));
ALTER POLICY "meta_campaigns_social_perm_read" ON public.meta_campaigns USING (( SELECT user_has_permission('social.ads.view'::text) AS user_has_permission));
ALTER POLICY "meta_capi_events_delete" ON public.meta_capi_events USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "meta_capi_events_insert" ON public.meta_capi_events WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_capi_events_select" ON public.meta_capi_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_capi_events_social_perm_read" ON public.meta_capi_events USING ((( SELECT user_has_permission('social.meta_pixel.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_capi_events_update" ON public.meta_capi_events USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "meta_lead_field_mappings_mutate" ON public.meta_lead_field_mappings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_lead_field_mappings_select" ON public.meta_lead_field_mappings USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "meta_lead_field_mappings_social_perm_write" ON public.meta_lead_field_mappings USING (( SELECT user_has_permission('social.lead_ads.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('social.lead_ads.manage'::text) AS user_has_permission));
ALTER POLICY "meta_lead_forms_mutate" ON public.meta_lead_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_lead_forms_select" ON public.meta_lead_forms USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "meta_lead_forms_social_perm_write" ON public.meta_lead_forms USING ((( SELECT user_has_permission('social.lead_ads.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('social.lead_ads.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "meta_leadgen_events_mutate" ON public.meta_leadgen_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_leadgen_events_select" ON public.meta_leadgen_events USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "meta_leadgen_events_social_perm_read" ON public.meta_leadgen_events USING (( SELECT user_has_permission('social.lead_ads.view'::text) AS user_has_permission));
ALTER POLICY "meta_subscription_audit_select" ON public.meta_subscription_audit USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'administrator'::text])))))));
ALTER POLICY "meta_subscription_audit_social_perm_read" ON public.meta_subscription_audit USING (( SELECT user_has_permission('social.view'::text) AS user_has_permission));
ALTER POLICY "service_role_only_migration_log" ON public.migration_log USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "mission_pillars_write" ON public.mission_pillars USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "model_switch_comparisons_read" ON public.model_switch_comparisons USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "model_switch_evaluations_read" ON public.model_switch_evaluations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "model_switch_replays_read" ON public.model_switch_replays USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "Institution admin can view own module_usage_daily" ON public.module_usage_daily USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Super admin can view all module_usage_daily" ON public.module_usage_daily USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "super_admin_all_audiences" ON public.notification_audiences USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "notif_gen_cfg_delete" ON public.notification_generator_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission)));
ALTER POLICY "notif_gen_cfg_insert" ON public.notification_generator_config WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission)));
ALTER POLICY "notif_gen_cfg_select" ON public.notification_generator_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission)));
ALTER POLICY "notif_gen_cfg_update" ON public.notification_generator_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission)));
ALTER POLICY "notif_gen_cfg_audit_select" ON public.notification_generator_config_audit USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission)));
ALTER POLICY "nrp_admin_read" ON public.notification_recipient_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "nrp_admin_write" ON public.notification_recipient_policies USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "notifications_delete_admins" ON public.notifications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin)));
ALTER POLICY "notifications_insert_admins" ON public.notifications WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin)));
ALTER POLICY "notifications_select_own" ON public.notifications USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND fn_notification_is_for_user(targeting, ( SELECT auth.uid() AS uid))));
ALTER POLICY "notifications_select_super_admin" ON public.notifications USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "notifications_update_admins" ON public.notifications USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin)));
ALTER POLICY "Staff can view analytics for their institution" ON public.nps_analytics USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'faculty'::text, 'hod'::text])))))));
ALTER POLICY "Staff can view responses for their institution surveys" ON public.nps_responses USING ((EXISTS ( SELECT 1
   FROM (nps_surveys s
     JOIN profiles up ON ((up.institution_id = s.institution_id)))
  WHERE ((s.id = nps_responses.survey_id) AND (up.id = ( SELECT auth.uid() AS uid)) AND (up.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'faculty'::text, 'hod'::text]))))));
ALTER POLICY "Admins can delete surveys for their institution" ON public.nps_surveys USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))));
ALTER POLICY "Staff can create surveys for their institution" ON public.nps_surveys WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'faculty'::text, 'hod'::text])))))));
ALTER POLICY "Staff can update surveys for their institution" ON public.nps_surveys USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'faculty'::text, 'hod'::text])))))));
ALTER POLICY "Users can view surveys for their institution" ON public.nps_surveys USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "ocar_select" ON public.obe_course_attainment_rollup USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "okr_auto_track_sources_insert" ON public.okr_auto_track_sources WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "okr_metric_execution_log_select" ON public.okr_metric_execution_log USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));
ALTER POLICY "okr_metric_registry_admin" ON public.okr_metric_registry USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "outcome_correlation_delete" ON public.outcome_program_correlation USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "outcome_correlation_insert" ON public.outcome_program_correlation WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "outcome_correlation_select" ON public.outcome_program_correlation USING (((is_published = true) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "outcome_correlation_update" ON public.outcome_program_correlation USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'super_admin'::text]))))));
ALTER POLICY "Admins can manage page metadata" ON public.page_metadata USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (p.is_super_admin = true))))));
ALTER POLICY "ptd_select" ON public.page_tab_definitions USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "ptd_write" ON public.page_tab_definitions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "pto_select" ON public.page_tab_overrides USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "pto_write" ON public.page_tab_overrides USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "Parents can view own activity" ON public.parent_activity_log USING ((parent_id IN ( SELECT parent_profiles.id
   FROM parent_profiles
  WHERE (parent_profiles.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Service role creates activity logs" ON public.parent_activity_log WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));
ALTER POLICY "Staff can view activity logs" ON public.parent_activity_log USING ((EXISTS ( SELECT 1
   FROM (parent_profiles pp
     JOIN profiles up ON ((up.institution_id = pp.institution_id)))
  WHERE ((pp.id = parent_activity_log.parent_id) AND (up.id = ( SELECT auth.uid() AS uid)) AND (up.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "parent_communications_delete" ON public.parent_communications USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "parent_communications_insert" ON public.parent_communications WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text]))))));
ALTER POLICY "parent_communications_select" ON public.parent_communications USING (((parent_access_id IN ( SELECT parent_portal_access.id
   FROM parent_portal_access
  WHERE (parent_portal_access.parent_user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "parent_communications_update" ON public.parent_communications USING (((parent_access_id IN ( SELECT parent_portal_access.id
   FROM parent_portal_access
  WHERE (parent_portal_access.parent_user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "Parents can view own links" ON public.parent_learner_links USING ((EXISTS ( SELECT 1
   FROM parent_profiles
  WHERE ((parent_profiles.id = parent_learner_links.parent_id) AND (parent_profiles.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "Staff can manage learner links" ON public.parent_learner_links USING ((EXISTS ( SELECT 1
   FROM (parent_profiles pp
     JOIN profiles up ON ((up.institution_id = pp.institution_id)))
  WHERE ((pp.id = parent_learner_links.parent_id) AND (up.id = ( SELECT auth.uid() AS uid)) AND (up.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text]))))));
ALTER POLICY "Service role manages OTP tokens" ON public.parent_otp_tokens USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));
ALTER POLICY "parent_portal_access_delete" ON public.parent_portal_access USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
ALTER POLICY "parent_portal_access_insert" ON public.parent_portal_access WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text]))))));
ALTER POLICY "parent_portal_access_select" ON public.parent_portal_access USING (((parent_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "parent_portal_access_update" ON public.parent_portal_access USING (((parent_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'institution_admin'::text, 'staff'::text, 'super_admin'::text])))))));
ALTER POLICY "Parents can view own profile" ON public.parent_profiles USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Staff can manage parent profiles" ON public.parent_profiles USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id = parent_profiles.institution_id) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text]))))));
ALTER POLICY "Staff can view parent profiles" ON public.parent_profiles USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id = parent_profiles.institution_id) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'faculty'::text, 'hod'::text]))))));
ALTER POLICY "Parents can view own sessions" ON public.parent_sessions USING ((parent_id IN ( SELECT parent_profiles.id
   FROM parent_profiles
  WHERE (parent_profiles.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Service role manages sessions" ON public.parent_sessions USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text)) WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));
ALTER POLICY "Admins can view all disputes" ON public.payment_disputes USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'institution_admin'::text])))))));
ALTER POLICY "Service role can write disputes" ON public.payment_disputes USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "Service role can update payment transactions" ON public.payment_transactions USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "agency_admin_read" ON public.pde_agency_index USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'hod'::text]))))));
ALTER POLICY "agency_insert" ON public.pde_agency_index WITH CHECK (((learner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['admin'::text, 'super_admin'::text])))))));
ALTER POLICY "own_agency_select" ON public.pde_agency_index USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_questions_read" ON public.pde_assessment_questions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM pde_assessments a
  WHERE ((a.id = pde_assessment_questions.assessment_id) AND (a.created_by = ( SELECT auth.uid() AS uid))))) OR (( SELECT user_has_permission('pde.faculty.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (pde_assessments a
     JOIN vac_courses c ON ((c.id = a.course_id)))
  WHERE ((a.id = pde_assessment_questions.assessment_id) AND role_has_institution_access(c.institution_id)))))));
ALTER POLICY "pde_at_risk_log_select_by_role" ON public.pde_at_risk_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('pde.admin.at_risk.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "pde_bridge_audit_faculty_hod_select" ON public.pde_bridge_audit USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text])) AND (p.institution_id = pde_bridge_audit.institution_id)))));
ALTER POLICY "pde_bridge_audit_super_admin_all" ON public.pde_bridge_audit USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))));
ALTER POLICY "own_build_sessions" ON public.pde_build_sessions USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_build_sessions_insert" ON public.pde_build_sessions WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_build_sessions_update" ON public.pde_build_sessions USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_case_assign_read" ON public.pde_case_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM pde_assessments a
  WHERE ((a.id = pde_case_assignments.assessment_id) AND (a.created_by = ( SELECT auth.uid() AS uid))))) OR (( SELECT user_has_permission('pde.faculty.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (pde_assessments a
     JOIN vac_courses c ON ((c.id = a.course_id)))
  WHERE ((a.id = pde_case_assignments.assessment_id) AND role_has_institution_access(c.institution_id))))) OR (EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = p.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (lp.section_id = pde_case_assignments.section_id))))));
ALTER POLICY "pde_case_assign_write" ON public.pde_case_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM pde_assessments a
  WHERE ((a.id = pde_case_assignments.assessment_id) AND ((a.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('pde.faculty.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
           FROM vac_courses c
          WHERE ((c.id = a.course_id) AND role_has_institution_access(c.institution_id))))))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM pde_assessments a
  WHERE ((a.id = pde_case_assignments.assessment_id) AND ((a.created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('pde.faculty.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
           FROM vac_courses c
          WHERE ((c.id = a.course_id) AND role_has_institution_access(c.institution_id)))))))))));
ALTER POLICY "own_coach_conversations_insert" ON public.pde_coach_conversations WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_coach_conversations_select" ON public.pde_coach_conversations USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_coach_conversations_update" ON public.pde_coach_conversations USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_coord_onboard_insert" ON public.pde_coordinator_onboarding_log WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "pde_coord_onboard_read" ON public.pde_coordinator_onboarding_log USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'coordinator'::text, 'dean'::text, 'institution_admin'::text, 'administrator'::text])) AND ((p.institution_id = pde_coordinator_onboarding_log.institution_id) OR (pde_coordinator_onboarding_log.institution_id IS NULL)))))));
ALTER POLICY "pde_demonstrations_faculty_same_inst" ON public.pde_demonstrations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'coordinator'::text, 'dean'::text, 'institution_admin'::text, 'administrator'::text])) AND ((p.institution_id = pde_demonstrations.institution_id) OR (pde_demonstrations.institution_id IS NULL))))));
ALTER POLICY "pde_demonstrations_learner_own" ON public.pde_demonstrations USING ((learner_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_demonstrations_super_admin_all" ON public.pde_demonstrations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "pde_daily_own_read" ON public.pde_engagement_daily USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_events_own_insert" ON public.pde_engagement_events WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_badges_select" ON public.pde_learner_badges USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_capabilities_insert" ON public.pde_learner_capabilities WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_capabilities_select" ON public.pde_learner_capabilities USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_capabilities_update" ON public.pde_learner_capabilities USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "messages_own_insert" ON public.pde_messages WITH CHECK ((author_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_enrollments_insert" ON public.pde_quest_enrollments WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_enrollments_select" ON public.pde_quest_enrollments USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_enrollments_update" ON public.pde_quest_enrollments USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_quest_submissions_insert" ON public.pde_quest_submissions WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "own_quest_submissions_select" ON public.pde_quest_submissions USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "admin_manage_quests" ON public.pde_quests USING ((created_by = ( SELECT auth.uid() AS uid))) WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_reciprocal_credits_insert" ON public.pde_reciprocal_credits WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "pde_reciprocal_credits_read" ON public.pde_reciprocal_credits USING (((learner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'coordinator'::text, 'dean'::text, 'institution_admin'::text, 'administrator'::text])) AND ((p.institution_id = pde_reciprocal_credits.institution_id) OR (pde_reciprocal_credits.institution_id IS NULL)))))));
ALTER POLICY "pde_reciprocal_credits_update" ON public.pde_reciprocal_credits USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "own_reputation_update" ON public.pde_reputation USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_sub_own_insert" ON public.pde_submissions WITH CHECK ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "pde_sub_own_read" ON public.pde_submissions USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Users can view accessible periods" ON public.periods USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id = periods.institution_id)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text])))))));
ALTER POLICY "periods_delete_admin" ON public.periods USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.periods.delete'::text) AS user_has_permission)));
ALTER POLICY "periods_insert_admin" ON public.periods WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.periods.create'::text) AS user_has_permission)));
ALTER POLICY "periods_select_institution" ON public.periods USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "periods_update_admin" ON public.periods USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.periods.edit'::text) AS user_has_permission)));
ALTER POLICY "admin_read_pipeline_errors" ON public.pipeline_errors USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "platform_policies_delete" ON public.platform_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "platform_policies_insert" ON public.platform_policies WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "platform_policies_select" ON public.platform_policies USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "platform_policies_social_attr_insert" ON public.platform_policies WITH CHECK (((policy_key = 'ig.attribution_window_days'::text) AND ( SELECT user_has_permission('social.attribution.edit'::text) AS user_has_permission)));
ALTER POLICY "platform_policies_social_attr_update" ON public.platform_policies USING (((policy_key = 'ig.attribution_window_days'::text) AND ( SELECT user_has_permission('social.attribution.edit'::text) AS user_has_permission))) WITH CHECK (((policy_key = 'ig.attribution_window_days'::text) AND ( SELECT user_has_permission('social.attribution.edit'::text) AS user_has_permission)));
ALTER POLICY "platform_policies_update" ON public.platform_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "postal_codes_delete" ON public.postal_codes USING (( SELECT user_has_permission('learners.postal_codes.delete'::text) AS user_has_permission));
ALTER POLICY "postal_codes_insert" ON public.postal_codes WITH CHECK (( SELECT user_has_permission('learners.postal_codes.create'::text) AS user_has_permission));
ALTER POLICY "postal_codes_update" ON public.postal_codes USING (( SELECT user_has_permission('learners.postal_codes.edit'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('learners.postal_codes.edit'::text) AS user_has_permission));
ALTER POLICY "pgr_del" ON public.privilege_group_reviewers USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "pgr_ins" ON public.privilege_group_reviewers WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "pgr_sel" ON public.privilege_group_reviewers USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_group_reviewers.group_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "privilege_group_types_delete" ON public.privilege_group_types USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_group_types.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_group_types_insert" ON public.privilege_group_types WITH CHECK ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_group_types.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_group_types_select" ON public.privilege_group_types USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_group_types.group_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "privilege_group_types_update" ON public.privilege_group_types USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_group_types.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_groups_delete" ON public.privilege_groups USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_groups.institution_id)))))));
ALTER POLICY "privilege_groups_insert" ON public.privilege_groups WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_groups.institution_id)))))));
ALTER POLICY "privilege_groups_select" ON public.privilege_groups USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.institution_id = privilege_groups.institution_id))))));
ALTER POLICY "privilege_groups_update" ON public.privilege_groups USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_groups.institution_id)))))));
ALTER POLICY "privilege_members_delete" ON public.privilege_members USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_members.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_members_insert" ON public.privilege_members WITH CHECK ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_members.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_members_learner_select" ON public.privilege_members USING ((learner_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "privilege_members_select" ON public.privilege_members USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_members.group_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "privilege_members_update" ON public.privilege_members USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_members.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_progress_reports_delete" ON public.privilege_progress_reports USING ((EXISTS ( SELECT 1
   FROM ((privilege_members pm
     JOIN privilege_groups pg ON ((pg.id = pm.group_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pm.id = privilege_progress_reports.member_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_progress_reports_insert" ON public.privilege_progress_reports WITH CHECK ((EXISTS ( SELECT 1
   FROM ((privilege_members pm
     JOIN privilege_groups pg ON ((pg.id = pm.group_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pm.id = privilege_progress_reports.member_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_progress_reports_learner_insert" ON public.privilege_progress_reports WITH CHECK ((EXISTS ( SELECT 1
   FROM privilege_members pm
  WHERE ((pm.id = privilege_progress_reports.member_id) AND (pm.learner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "privilege_progress_reports_learner_select" ON public.privilege_progress_reports USING ((EXISTS ( SELECT 1
   FROM privilege_members pm
  WHERE ((pm.id = privilege_progress_reports.member_id) AND (pm.learner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "privilege_progress_reports_select" ON public.privilege_progress_reports USING ((EXISTS ( SELECT 1
   FROM ((privilege_members pm
     JOIN privilege_groups pg ON ((pg.id = pm.group_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pm.id = privilege_progress_reports.member_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "privilege_progress_reports_update" ON public.privilege_progress_reports USING ((EXISTS ( SELECT 1
   FROM ((privilege_members pm
     JOIN privilege_groups pg ON ((pg.id = pm.group_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pm.id = privilege_progress_reports.member_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "pr_ins" ON public.privilege_renewals WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "pr_learner_sel" ON public.privilege_renewals USING ((EXISTS ( SELECT 1
   FROM privilege_members pm
  WHERE ((pm.id = privilege_renewals.member_id) AND (pm.learner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "pr_sel" ON public.privilege_renewals USING ((EXISTS ( SELECT 1
   FROM ((privilege_members pm
     JOIN privilege_groups pg ON ((pg.id = pm.group_id)))
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pm.id = privilege_renewals.member_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "pr_upd" ON public.privilege_renewals USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "pr_upd_committee" ON public.privilege_renewals USING ((EXISTS ( SELECT 1
   FROM (privilege_group_reviewers pgr
     JOIN privilege_members pm ON ((pm.group_id = pgr.group_id)))
  WHERE ((pm.id = privilege_renewals.member_id) AND (pgr.reviewer_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "privilege_reviews_delete" ON public.privilege_reviews USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_reviews.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_reviews_insert" ON public.privilege_reviews WITH CHECK ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_reviews.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_reviews_select" ON public.privilege_reviews USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_reviews.group_id) AND ((p.role = 'super_admin'::text) OR (p.institution_id = pg.institution_id))))));
ALTER POLICY "privilege_reviews_update" ON public.privilege_reviews USING ((EXISTS ( SELECT 1
   FROM (privilege_groups pg
     JOIN profiles p ON ((p.id = ( SELECT auth.uid() AS uid))))
  WHERE ((pg.id = privilege_reviews.group_id) AND ((p.role = 'super_admin'::text) OR ((p.role = 'admin'::text) AND (p.institution_id = pg.institution_id)))))));
ALTER POLICY "privilege_source_types_super_admin_write" ON public.privilege_source_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK (((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)) AND (is_system = false)));
ALTER POLICY "privilege_types_delete" ON public.privilege_types USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_types.institution_id)))))));
ALTER POLICY "privilege_types_insert" ON public.privilege_types WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_types.institution_id)))))));
ALTER POLICY "privilege_types_select" ON public.privilege_types USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.institution_id = privilege_types.institution_id))))));
ALTER POLICY "privilege_types_update" ON public.privilege_types USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR ((profiles.role = 'admin'::text) AND (profiles.institution_id = privilege_types.institution_id)))))));
ALTER POLICY "Admins can manage process audits" ON public.process_audits USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Users can view process audits" ON public.process_audits USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Admins can manage process definitions" ON public.process_definitions USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Users can view process definitions" ON public.process_definitions USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Staff can manage process instances" ON public.process_instances USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'hod'::text]))))));
ALTER POLICY "Users can view process instances" ON public.process_instances USING ((EXISTS ( SELECT 1
   FROM (process_definitions pd
     JOIN profiles up ON ((up.institution_id = pd.institution_id)))
  WHERE ((pd.id = process_instances.process_id) AND (up.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "HOD can view institution audit logs" ON public.profile_change_audit_log USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = profile_change_audit_log.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = lp.institution_id) AND ((p.role = 'hod'::text) OR (EXISTS ( SELECT 1
           FROM (user_roles ur
             JOIN custom_roles cr ON ((cr.id = ur.role_id)))
          WHERE ((ur.user_id = p.id) AND ((cr.role_key)::text = 'hod'::text)))))))));
ALTER POLICY "Staff can view department audit logs" ON public.profile_change_audit_log USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = profile_change_audit_log.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'staff'::text) AND (p.department_id = lp.department_id)))));
ALTER POLICY "Students can view own audit log" ON public.profile_change_audit_log USING ((learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'student'::text)))));
ALTER POLICY "Super admin full access on audit log" ON public.profile_change_audit_log USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "Approvers can update requests" ON public.profile_change_requests USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = profile_change_requests.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.institution_id = lp.institution_id) AND ((p.role = 'hod'::text) OR (EXISTS ( SELECT 1
           FROM (user_roles ur
             JOIN custom_roles cr ON ((cr.id = ur.role_id)))
          WHERE ((ur.user_id = p.id) AND ((cr.role_key)::text = 'hod'::text)))))) OR ((p.department_id = lp.department_id) AND ((p.role = 'staff'::text) OR (EXISTS ( SELECT 1
           FROM (user_roles ur
             JOIN custom_roles cr ON ((cr.id = ur.role_id)))
          WHERE ((ur.user_id = p.id) AND ((cr.role_key)::text = 'staff'::text))))))))))) WITH CHECK ((request_status = ANY (ARRAY['approved'::text, 'rejected'::text])));
ALTER POLICY "HOD can view institution requests" ON public.profile_change_requests USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = profile_change_requests.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = lp.institution_id) AND ((p.role = 'hod'::text) OR (EXISTS ( SELECT 1
           FROM (user_roles ur
             JOIN custom_roles cr ON ((cr.id = ur.role_id)))
          WHERE ((ur.user_id = p.id) AND ((cr.role_key)::text = 'hod'::text)))))))));
ALTER POLICY "Staff can view department requests" ON public.profile_change_requests USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN learners_profiles lp ON ((lp.id = profile_change_requests.learner_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'staff'::text) AND (p.department_id = lp.department_id)))));
ALTER POLICY "Students can cancel own pending requests" ON public.profile_change_requests USING (((learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'student'::text)))) AND (request_status = 'pending'::text))) WITH CHECK (((learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'student'::text)))) AND (request_status = ANY (ARRAY['pending'::text, 'cancelled'::text]))));
ALTER POLICY "Students can create change requests" ON public.profile_change_requests WITH CHECK ((learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'student'::text)))));
ALTER POLICY "Students can view own change requests" ON public.profile_change_requests USING ((learner_id IN ( SELECT profiles.learner_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'student'::text)))));
ALTER POLICY "Super admin full access on change requests" ON public.profile_change_requests USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "profiles_delete_permission" ON public.profiles USING ((( SELECT is_super_admin() AS is_super_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('users.delete'::text) AS user_has_permission)) OR (can_user_manage_staff() AND (institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND (id <> ( SELECT auth.uid() AS uid)))));
ALTER POLICY "profiles_insert_policy" ON public.profiles WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR ((can_user_manage_staff() = true) AND ((( SELECT get_current_user_role() AS get_current_user_role) = 'super_admin'::text) OR (institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id))))));
ALTER POLICY "profiles_service_role_jwt_bypass" ON public.profiles USING ((( SELECT (( SELECT auth.jwt() AS jwt) ->> 'role'::text)) = 'service_role'::text));
ALTER POLICY "profiles_update_permission" ON public.profiles USING (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR (can_user_manage_staff() AND (( SELECT is_super_admin() AS is_super_admin) OR (institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)))) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('users.edit'::text) AS user_has_permission))));
ALTER POLICY "program_partner_grants_admin_write" ON public.program_partner_grants USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.grants.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.grants.manage'::text) AS user_has_permission)));
ALTER POLICY "program_partner_grants_select" ON public.program_partner_grants USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.grants.view'::text) AS user_has_permission)));
ALTER POLICY "program_partner_schools_delete" ON public.program_partner_schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "program_partner_schools_insert" ON public.program_partner_schools WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "program_partner_schools_select" ON public.program_partner_schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.schools.view'::text) AS user_has_permission)));
ALTER POLICY "program_partner_schools_update" ON public.program_partner_schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "program_partner_types_admin_write" ON public.program_partner_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission)));
ALTER POLICY "program_partners_admin_write" ON public.program_partners USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.partners.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.partners.manage'::text) AS user_has_permission)));
ALTER POLICY "program_partners_select" ON public.program_partners USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.partners.view'::text) AS user_has_permission)));
ALTER POLICY "programs_delete_permission" ON public.programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.programs.delete'::text) AS user_has_permission))));
ALTER POLICY "programs_insert_permission" ON public.programs WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('organizations.programs.create'::text) AS user_has_permission)));
ALTER POLICY "programs_update_permission" ON public.programs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.programs.edit'::text) AS user_has_permission))));
ALTER POLICY "progression_levels_insert_admin" ON public.progression_levels WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "progression_levels_select_admin" ON public.progression_levels USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))))));
ALTER POLICY "progression_levels_select_own" ON public.progression_levels USING ((profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "progression_levels_update_admin" ON public.progression_levels USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "project_activity_feed_select" ON public.project_activity_feed USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_activity_feed_write" ON public.project_activity_feed USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_approval_requests_select" ON public.project_approval_requests USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_approval_requests_write" ON public.project_approval_requests USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_approval_workflows_write" ON public.project_approval_workflows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_audit_log_select" ON public.project_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_budget_select" ON public.project_budget USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_budget_write" ON public.project_budget USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_budget_categories_write" ON public.project_budget_categories USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_budget_changes_select" ON public.project_budget_changes USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_budget_changes_write" ON public.project_budget_changes USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_change_requests_select" ON public.project_change_requests USING ((fn_is_project_member(project_id) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_closure_reports_select" ON public.project_closure_reports USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_closure_reports_write" ON public.project_closure_reports USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_institutions_select" ON public.project_institutions USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_institutions_write" ON public.project_institutions USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_issues_select" ON public.project_issues USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_issues_write" ON public.project_issues USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_labels_write" ON public.project_labels USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_lessons_learned_select" ON public.project_lessons_learned USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_lessons_learned_write" ON public.project_lessons_learned USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_meeting_links_select" ON public.project_meeting_links USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_meeting_links_write" ON public.project_meeting_links USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_members_select" ON public.project_members USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_members_write" ON public.project_members USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_milestones_select" ON public.project_milestones USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_milestones_write" ON public.project_milestones USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_phases_select" ON public.project_phases USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_phases_write" ON public.project_phases USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_priorities_write" ON public.project_priorities USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_risk_escalations_select" ON public.project_risk_escalations USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_risk_escalations_write" ON public.project_risk_escalations USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_risk_mitigation_steps_select" ON public.project_risk_mitigation_steps USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_risk_mitigation_steps_write" ON public.project_risk_mitigation_steps USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_risks_select" ON public.project_risks USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_risks_write" ON public.project_risks USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_stakeholders_select" ON public.project_stakeholders USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_stakeholders_write" ON public.project_stakeholders USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_status_reports_select" ON public.project_status_reports USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_status_reports_write" ON public.project_status_reports USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_statuses_write" ON public.project_statuses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_task_assignees_select" ON public.project_task_assignees USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_assignees_write" ON public.project_task_assignees USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_attachments_select" ON public.project_task_attachments USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_attachments_write" ON public.project_task_attachments USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_comments_select" ON public.project_task_comments USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_comments_write" ON public.project_task_comments USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_dependencies_select" ON public.project_task_dependencies USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_dependencies_write" ON public.project_task_dependencies USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_labels_select" ON public.project_task_labels USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_labels_write" ON public.project_task_labels USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_subtasks_select" ON public.project_task_subtasks USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_task_subtasks_write" ON public.project_task_subtasks USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_tasks_select" ON public.project_tasks USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_tasks_write" ON public.project_tasks USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "project_templates_write" ON public.project_templates USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "project_types_write" ON public.project_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "projects_select" ON public.projects USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "projects_write" ON public.projects USING ((( SELECT auth.uid() AS uid) IS NOT NULL)) WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "qem_delete" ON public.quality_evidence_mappings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "qem_insert" ON public.quality_evidence_mappings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.create'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "qem_select" ON public.quality_evidence_mappings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "qem_update" ON public.quality_evidence_mappings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.evidence.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "qesr_manage_admin" ON public.quality_evidence_source_registry USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "qesr_select_all" ON public.quality_evidence_source_registry USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "qac_modify" ON public.quick_action_ai_cache USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "qac_select" ON public.quick_action_ai_cache USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "qau_admin_read" ON public.quick_action_audit USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('attention_bar.audit.view'::text) AS user_has_permission)));
ALTER POLICY "qau_self_delete" ON public.quick_action_audit USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "qau_self_read" ON public.quick_action_audit USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "qaconf_read" ON public.quick_action_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('attention_bar.config.manage'::text) AS user_has_permission)));
ALTER POLICY "qaconf_write" ON public.quick_action_config USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "qar_modify" ON public.quick_action_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('attention_bar.rules.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "qar_select" ON public.quick_action_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('attention_bar.rules.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "qasq_modify" ON public.quick_action_state_queries USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "qasq_select" ON public.quick_action_state_queries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('attention_bar.rules.view'::text) AS user_has_permission)));
ALTER POLICY "qat_self_delete" ON public.quick_action_taps USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "qat_self_insert" ON public.quick_action_taps WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "qat_self_read" ON public.quick_action_taps USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "qauc_self" ON public.quick_action_user_consent USING (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "quotas_read" ON public.quotas USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
ALTER POLICY "quotas_write" ON public.quotas USING (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('admission_fees.manage'::text) AS user_has_permission));
ALTER POLICY "Service role manages razorpay accounts" ON public.razorpay_accounts USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "rcltp_results_read" ON public.rcltp_assessment_results USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission))) OR (learner_id = get_my_learner_id())));
ALTER POLICY "rcltp_results_write" ON public.rcltp_assessment_results USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_schedule_read" ON public.rcltp_assessment_schedule USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission)))));
ALTER POLICY "rcltp_schedule_write" ON public.rcltp_assessment_schedule USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_assess_read" ON public.rcltp_assessments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (learner_id = get_my_learner_id())));
ALTER POLICY "rcltp_assess_staff_write" ON public.rcltp_assessments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_badges_read" ON public.rcltp_badges USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (institution_id IS NULL) OR role_has_institution_access(institution_id)));
ALTER POLICY "rcltp_badges_write" ON public.rcltp_badges USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.reward.config'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.reward.config'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_bandcfg_read" ON public.rcltp_band_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission)))));
ALTER POLICY "rcltp_bandcfg_write" ON public.rcltp_band_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_learner_badges_read" ON public.rcltp_learner_badges USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (learner_id = get_my_learner_id()) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.reward.view'::text) AS user_has_permission)))));
ALTER POLICY "rcltp_parta_manage" ON public.rcltp_part_a_recordings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_parta_read" ON public.rcltp_part_a_recordings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission))) OR (EXISTS ( SELECT 1
   FROM rcltp_assessments a
  WHERE ((a.id = rcltp_part_a_recordings.assessment_id) AND (a.learner_id = get_my_learner_id()))))));
ALTER POLICY "rcltp_parta_review_update" ON public.rcltp_part_a_recordings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_pbq_read" ON public.rcltp_part_b_questions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.question.approve'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission)) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id)))));
ALTER POLICY "rcltp_pbq_update_review" ON public.rcltp_part_b_questions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.question.approve'::text) AS user_has_permission)) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.question.approve'::text) AS user_has_permission)) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_pbq_write" ON public.rcltp_part_b_questions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_pbr_read" ON public.rcltp_part_b_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission))) OR (EXISTS ( SELECT 1
   FROM rcltp_assessments a
  WHERE ((a.id = rcltp_part_b_responses.assessment_id) AND (a.learner_id = get_my_learner_id()))))));
ALTER POLICY "rcltp_pbr_write" ON public.rcltp_part_b_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_exposure_read" ON public.rcltp_passage_exposure USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (learner_id = get_my_learner_id()) OR ((( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_exposure_write" ON public.rcltp_passage_exposure USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_passages_read" ON public.rcltp_passages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (institution_id IS NULL) OR role_has_institution_access(institution_id)));
ALTER POLICY "rcltp_passages_write" ON public.rcltp_passages USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_practice_read" ON public.rcltp_practice_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission))) OR (learner_id = get_my_learner_id())));
ALTER POLICY "rcltp_practice_write" ON public.rcltp_practice_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_remedial_plans_select" ON public.rcltp_remedial_plans USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('rcltp.review'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_spotcheck_read" ON public.rcltp_review_spotchecks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (reviewer_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "rcltp_streaks_read" ON public.rcltp_streaks USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (learner_id = get_my_learner_id()) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.reward.view'::text) AS user_has_permission)))));
ALTER POLICY "rcltp_journey_read" ON public.rcltp_student_journey USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission))) OR (learner_id = get_my_learner_id())));
ALTER POLICY "rcltp_journey_write" ON public.rcltp_student_journey USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_vbb_progress_read" ON public.rcltp_vbb_progress USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (role_has_institution_access(institution_id) AND (( SELECT user_has_permission('rcltp.report.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('rcltp.report.view_class'::text) AS user_has_permission))) OR (learner_id = get_my_learner_id())));
ALTER POLICY "rcltp_vbb_progress_write" ON public.rcltp_vbb_progress USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.assessment.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rcltp_vbb_words_read" ON public.rcltp_vbb_words USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (institution_id IS NULL) OR role_has_institution_access(institution_id)));
ALTER POLICY "rcltp_vbb_words_write" ON public.rcltp_vbb_words USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('rcltp.config.manage'::text) AS user_has_permission) AND (institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "reference_catalogs_admin_all" ON public.reference_catalogs USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "reference_catalogs_select" ON public.reference_catalogs USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('reference.catalogs.view'::text) AS user_has_permission)));
ALTER POLICY "Manage categories with permission" ON public.referral_categories USING (( SELECT user_has_permission('referrals.categories.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('referrals.categories.manage'::text) AS user_has_permission));
ALTER POLICY "Manage eligibility with permission" ON public.referral_category_eligibility USING ((( SELECT user_has_permission('referrals.eligibility.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('referrals.eligibility.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "Manage form definitions with permission" ON public.referral_form_definitions USING ((( SELECT user_has_permission('referrals.forms.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))) WITH CHECK ((( SELECT user_has_permission('referrals.forms.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "Manage form fields with permission" ON public.referral_form_fields USING (( SELECT user_has_permission('referrals.forms.manage'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('referrals.forms.manage'::text) AS user_has_permission));
ALTER POLICY "referral_import_batches_all" ON public.referral_import_batches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission)));
ALTER POLICY "referral_import_rows_all" ON public.referral_import_rows USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.leads.edit'::text) AS user_has_permission)));
ALTER POLICY "referral_rate_config_read" ON public.referral_rate_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('admission.consultants.commissions.view'::text) AS user_has_permission)));
ALTER POLICY "referral_rate_config_write" ON public.referral_rate_config USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "reward_configs_delete" ON public.referral_reward_configs USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "reward_configs_insert" ON public.referral_reward_configs WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "reward_configs_select" ON public.referral_reward_configs USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "reward_configs_update" ON public.referral_reward_configs USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "rewards_delete" ON public.referral_rewards USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "rewards_insert" ON public.referral_rewards WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "rewards_select" ON public.referral_rewards USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "rewards_update" ON public.referral_rewards USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Inbox viewers see secondary referrers within scope" ON public.referral_secondary_referrers USING ((( SELECT user_has_permission('referrals.inbox.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM referrals r
  WHERE ((r.id = referral_secondary_referrers.primary_referral_id) AND role_has_institution_access(r.institution_id))))));
ALTER POLICY "Super admin can manage secondary referrers" ON public.referral_secondary_referrers USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "Users see their own attempts" ON public.referral_secondary_referrers USING ((attempted_referrer_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Inbox viewers see same-institution referrals" ON public.referrals USING ((( SELECT user_has_permission('referrals.inbox.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "Super admin can do anything on referrals" ON public.referrals USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "Users see their own referrals" ON public.referrals USING ((referrer_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "regulations_delete_admin" ON public.regulations USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.regulations.delete'::text) AS user_has_permission))));
ALTER POLICY "regulations_insert_admin" ON public.regulations WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.regulations.create'::text) AS user_has_permission))));
ALTER POLICY "regulations_select_institution" ON public.regulations USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))));
ALTER POLICY "regulations_update_admin" ON public.regulations USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))) OR ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.regulations.edit'::text) AS user_has_permission))));
ALTER POLICY "students_view_own_regulation" ON public.regulations USING ((EXISTS ( SELECT 1
   FROM (learners_profiles lp
     JOIN profiles p ON ((p.learner_id = lp.id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (lp.regulation_id = regulations.id)))));
ALTER POLICY "rescue_broadcasts_insert" ON public.rescue_broadcasts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('dashboard.broadcast.initiate'::text) AS user_has_permission)));
ALTER POLICY "rescue_broadcasts_select" ON public.rescue_broadcasts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('dashboard.broadcast.claim'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "rescue_broadcasts_update" ON public.rescue_broadcasts USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('dashboard.broadcast.claim'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('dashboard.broadcast.claim'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "resource_approvals_insert_by_requester" ON public.resource_approvals WITH CHECK (((EXISTS ( SELECT 1
   FROM resource_reservations rr
  WHERE ((rr.id = resource_approvals.reservation_id) AND (rr.user_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "resource_approvals_select" ON public.resource_approvals USING (((approver_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM resource_reservations rr
  WHERE ((rr.id = resource_approvals.reservation_id) AND (rr.user_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "parent_cat_delete_perm" ON public.resource_parent_categories USING (( SELECT user_has_permission('resources.categories.delete'::text) AS user_has_permission));
ALTER POLICY "parent_cat_insert_perm" ON public.resource_parent_categories WITH CHECK (( SELECT user_has_permission('resources.categories.create'::text) AS user_has_permission));
ALTER POLICY "parent_cat_update_perm" ON public.resource_parent_categories USING (( SELECT user_has_permission('resources.categories.edit'::text) AS user_has_permission));
ALTER POLICY "resource_reservations_delete_by_resource" ON public.resource_reservations USING (((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_reservations.resource_id) AND (r.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))) AND ( SELECT user_has_permission('resources.reservations.cancel'::text) AS user_has_permission)));
ALTER POLICY "resource_reservations_delete_super_admin" ON public.resource_reservations USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "resource_reservations_insert_by_resource" ON public.resource_reservations WITH CHECK (((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_reservations.resource_id) AND (r.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))) AND ( SELECT user_has_permission('resources.reservations.create'::text) AS user_has_permission)));
ALTER POLICY "resource_reservations_select_by_resource" ON public.resource_reservations USING ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_reservations.resource_id) AND (r.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "resource_reservations_update_by_resource" ON public.resource_reservations USING (((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_reservations.resource_id) AND (r.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))) AND ( SELECT user_has_permission('resources.reservations.edit'::text) AS user_has_permission)));
ALTER POLICY "sub_cat_delete_perm" ON public.resource_sub_categories USING (( SELECT user_has_permission('resources.subcategories.delete'::text) AS user_has_permission));
ALTER POLICY "sub_cat_insert_perm" ON public.resource_sub_categories WITH CHECK (( SELECT user_has_permission('resources.subcategories.create'::text) AS user_has_permission));
ALTER POLICY "sub_cat_update_perm" ON public.resource_sub_categories USING (( SELECT user_has_permission('resources.subcategories.edit'::text) AS user_has_permission));
ALTER POLICY "resource_usage_logs_select_by_resource" ON public.resource_usage_logs USING ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_usage_logs.resource_id) AND (r.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))))));
ALTER POLICY "resources_delete_perm" ON public.resources USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('resources.resources.delete'::text) AS user_has_permission))));
ALTER POLICY "resources_insert_perm" ON public.resources WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('resources.resources.create'::text) AS user_has_permission))));
ALTER POLICY "resources_select_institution" ON public.resources USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "resources_update_perm" ON public.resources USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('resources.resources.edit'::text) AS user_has_permission)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin(( SELECT auth.uid() AS uid)) AS is_admin) OR (role_has_institution_access(institution_id) AND ( SELECT user_has_permission('resources.resources.edit'::text) AS user_has_permission))));
ALTER POLICY "retention_policies_admin_read" ON public.retention_policies USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "retention_policies_super_admin_write" ON public.retention_policies USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "role_audit_log_select_super_admin" ON public.role_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.permissions_audit.view'::text) AS user_has_permission)));
ALTER POLICY "routing_form_responses_select" ON public.routing_form_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM routing_forms f
  WHERE ((f.id = routing_form_responses.form_id) AND ((f.host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.view'::text) AS user_has_permission) AND role_has_institution_access(f.institution_id))))))));
ALTER POLICY "routing_form_rules_select" ON public.routing_form_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM routing_forms f
  WHERE ((f.id = routing_form_rules.form_id) AND ((f.host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.view'::text) AS user_has_permission) AND role_has_institution_access(f.institution_id))))))));
ALTER POLICY "routing_form_rules_write" ON public.routing_form_rules USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM routing_forms f
  WHERE ((f.id = routing_form_rules.form_id) AND ((f.host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.manage'::text) AS user_has_permission) AND role_has_institution_access(f.institution_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM routing_forms f
  WHERE ((f.id = routing_form_rules.form_id) AND ((f.host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.manage'::text) AS user_has_permission) AND role_has_institution_access(f.institution_id))))))));
ALTER POLICY "routing_forms_delete" ON public.routing_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "routing_forms_insert" ON public.routing_forms WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((host_profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT user_has_permission('meetings.routing.manage'::text) AS user_has_permission))));
ALTER POLICY "routing_forms_select" ON public.routing_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "routing_forms_update" ON public.routing_forms USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (host_profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('meetings.routing.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "Admin users can insert service providers" ON public.saml_service_providers WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text]))))));
ALTER POLICY "Admin users can update service providers" ON public.saml_service_providers USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text]))))));
ALTER POLICY "Admin users can view service providers" ON public.saml_service_providers USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text]))))));
ALTER POLICY "Users can delete their own sessions" ON public.saml_sessions USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Users can view their own sessions" ON public.saml_sessions USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sanctioned_posts_delete" ON public.sanctioned_posts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.sanctioned_posts.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sanctioned_posts_insert" ON public.sanctioned_posts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.sanctioned_posts.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sanctioned_posts_select" ON public.sanctioned_posts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.sanctioned_posts.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sanctioned_posts_update" ON public.sanctioned_posts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.sanctioned_posts.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('hr.sanctioned_posts.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sgr_all_super_admin" ON public.sarvam_galatta_registrations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.is_super_admin = true)))));
ALTER POLICY "sgr_insert_own" ON public.sarvam_galatta_registrations WITH CHECK ((EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = sarvam_galatta_registrations.registration_id) AND (er.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "sgr_select_own" ON public.sarvam_galatta_registrations USING ((EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = sarvam_galatta_registrations.registration_id) AND (er.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "sgr_update_own" ON public.sarvam_galatta_registrations USING ((EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = sarvam_galatta_registrations.registration_id) AND (er.owner_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "scf_ai_suggestions_select" ON public.scf_ai_suggestions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id IS NOT NULL) AND role_has_institution_access(institution_id))));
ALTER POLICY "scf_live_pulse_super_admin_all" ON public.scf_live_pulse USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "scf_note_resolution_votes_select" ON public.scf_note_resolution_votes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (learner_id IN ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "scf_outage_days_select" ON public.scf_outage_days USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.attendance.dashboard.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "scf_outage_days_write_superadmin" ON public.scf_outage_days USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "school_contact_roles_admin_write" ON public.school_contact_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission)));
ALTER POLICY "school_contacts_delete" ON public.school_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "school_contacts_insert" ON public.school_contacts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contacts.create'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_contacts_select" ON public.school_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contacts.view'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))) OR is_school_portal_user_for(school_id)));
ALTER POLICY "school_contacts_update" ON public.school_contacts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contacts.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contacts.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_contributions_delete" ON public.school_contributions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "school_contributions_insert" ON public.school_contributions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contributions.create'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_contributions_select" ON public.school_contributions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contributions.view'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))) OR is_school_portal_user_for(school_id)));
ALTER POLICY "school_contributions_update" ON public.school_contributions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contributions.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.contributions.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_jkkn_owners_admin_write" ON public.school_jkkn_owners USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.owners.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.owners.manage'::text) AS user_has_permission)));
ALTER POLICY "school_jkkn_owners_select" ON public.school_jkkn_owners USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (jkkn_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT user_has_permission('schools_network.owners.view'::text) AS user_has_permission) AND user_owns_school(school_id))));
ALTER POLICY "school_master_delete" ON public.school_master USING (( SELECT user_has_permission('learners.school_master.delete'::text) AS user_has_permission));
ALTER POLICY "school_master_insert" ON public.school_master WITH CHECK (( SELECT user_has_permission('learners.school_master.create'::text) AS user_has_permission));
ALTER POLICY "school_master_update" ON public.school_master USING (( SELECT user_has_permission('learners.school_master.edit'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('learners.school_master.edit'::text) AS user_has_permission));
ALTER POLICY "school_session_types_admin_write" ON public.school_session_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.master.manage'::text) AS user_has_permission)));
ALTER POLICY "school_sessions_delete" ON public.school_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "school_sessions_insert" ON public.school_sessions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.sessions.create'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_sessions_select" ON public.school_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.sessions.view'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))) OR is_school_portal_user_for(school_id)));
ALTER POLICY "school_sessions_update" ON public.school_sessions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.sessions.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.sessions.edit'::text) AS user_has_permission) AND (user_owns_school(school_id) OR user_leads_partner_for_school(school_id)))));
ALTER POLICY "school_visit_assignments_select" ON public.school_visit_assignments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.schools.view'::text) AS user_has_permission)));
ALTER POLICY "schools_delete" ON public.schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "schools_insert" ON public.schools WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('schools_network.schools.create'::text) AS user_has_permission)));
ALTER POLICY "schools_select" ON public.schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.view'::text) AS user_has_permission) AND (user_owns_school(id) OR user_leads_partner_for_school(id) OR ((ownership = 'internal'::school_ownership) AND role_has_institution_access(institution_id)))) OR is_school_portal_user_for(id)));
ALTER POLICY "schools_update" ON public.schools USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(id) OR user_leads_partner_for_school(id))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('schools_network.schools.edit'::text) AS user_has_permission) AND (user_owns_school(id) OR user_leads_partner_for_school(id)))));
ALTER POLICY "sn_feeder_alias_select" ON public.schools_network_feeder_aliases USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "sn_feeder_split_select" ON public.schools_network_feeder_splits USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "sections_delete_admin" ON public.sections USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.sections.delete'::text) AS user_has_permission)));
ALTER POLICY "sections_insert_admin" ON public.sections WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.sections.create'::text) AS user_has_permission)));
ALTER POLICY "sections_update_admin" ON public.sections USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('organizations.sections.edit'::text) AS user_has_permission)));
ALTER POLICY "semesters_delete_permission" ON public.semesters USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.semesters.delete'::text) AS user_has_permission))));
ALTER POLICY "semesters_insert_permission" ON public.semesters WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('organizations.semesters.create'::text) AS user_has_permission)));
ALTER POLICY "semesters_update_permission" ON public.semesters USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('organizations.semesters.edit'::text) AS user_has_permission))));
ALTER POLICY "Authenticated users can view approval steps" ON public.service_request_approval_steps USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "approval_steps_manage_permission" ON public.service_request_approval_steps USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.types.create'::text) AS user_has_permission)));
ALTER POLICY "System can create approval records" ON public.service_request_approvals WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "Users can view approvals for their requests" ON public.service_request_approvals USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((approver_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = service_request_approvals.service_request_id) AND ((sr.requester_id = ( SELECT auth.uid() AS uid)) OR (( SELECT get_current_user_role() AS get_current_user_role) = ANY (ARRAY['super_admin'::text, 'administrator'::text])))))))));
ALTER POLICY "approvals_update_permission" ON public.service_request_approvals USING (((approver_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission)));
ALTER POLICY "Users can upload attachments to own requests" ON public.service_request_attachments WITH CHECK ((uploaded_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "attachments_select_permission" ON public.service_request_attachments USING ((EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = service_request_attachments.service_request_id) AND ((sr.requester_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission))))));
ALTER POLICY "Authenticated users can add timeline entries" ON public.service_request_timeline WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "timeline_select_permission" ON public.service_request_timeline USING (((EXISTS ( SELECT 1
   FROM service_requests sr
  WHERE ((sr.id = service_request_timeline.service_request_id) AND ((sr.requester_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission))))) AND ((is_internal = false) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission))));
ALTER POLICY "Approvers can view pending requests" ON public.service_requests USING (((EXISTS ( SELECT 1
   FROM service_request_approval_steps sras
  WHERE ((sras.service_type_id = service_requests.service_type_id) AND (sras.step_order = service_requests.current_approval_step) AND (((sras.approver_role)::text = ( SELECT get_current_user_role() AS get_current_user_role)) OR (( SELECT auth.uid() AS uid) = ANY (sras.approver_user_ids)))))) AND (( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institution_id))));
ALTER POLICY "Users can create service requests" ON public.service_requests WITH CHECK ((requester_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "Users can update own service requests" ON public.service_requests USING (((requester_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status])))) WITH CHECK (((requester_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status, 'cancelled'::service_request_status]))));
ALTER POLICY "Users can view own service requests" ON public.service_requests USING ((requester_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "service_requests_admin_view_permission" ON public.service_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('service_requests.view_all'::text) AS user_has_permission) OR ( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission)) AND role_has_institution_access(institution_id)) OR (requester_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "service_requests_approve_permission" ON public.service_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('service_requests.approve'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR ((requester_id = ( SELECT auth.uid() AS uid)) AND (status = ANY (ARRAY['draft'::service_request_status, 'returned'::service_request_status, 'submitted'::service_request_status])))));
ALTER POLICY "service_requests_delete_super_admin" ON public.service_requests USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "Authenticated users can view service type fields" ON public.service_type_fields USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "service_type_fields_manage_permission" ON public.service_type_fields USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.types.create'::text) AS user_has_permission)));
ALTER POLICY "Authenticated users can view active service types" ON public.service_types USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (is_active = true)));
ALTER POLICY "service_types_manage_permission" ON public.service_types USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('service_requests.types.create'::text) AS user_has_permission)));
ALTER POLICY "session_clarification_leadership_read" ON public.session_clarification_requests USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('audit.cycle.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "session_clarification_learner_own" ON public.session_clarification_requests USING ((student_id = ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "session_feedback_learner_own" ON public.session_feedback USING ((student_id = ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "session_feedback_super_admin_all" ON public.session_feedback USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR (p.is_super_admin = true))))));
ALTER POLICY "scf_escalations_select" ON public.session_feedback_escalations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR role_has_institution_access(institution_id)));
ALTER POLICY "sf100_audit_log_read" ON public.sf100_audit_log USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('startup_studio.sf100.audit_log.view'::text) AS user_has_permission)));
ALTER POLICY "sf100_check_ins_insert_member" ON public.sf100_check_ins WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sf100_customer_interviews_insert_member" ON public.sf100_customer_interviews WITH CHECK (((conducted_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sf100_exercise_responses_insert" ON public.sf100_exercise_responses WITH CHECK ((submitted_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_exercise_responses_update" ON public.sf100_exercise_responses USING ((submitted_by = ( SELECT auth.uid() AS uid))) WITH CHECK ((submitted_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_exercises_insert" ON public.sf100_exercises WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_exercises_update" ON public.sf100_exercises USING ((created_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_meeting_requests_insert_member" ON public.sf100_meeting_requests WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sf100_notifications_select_own" ON public.sf100_notifications USING ((recipient_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_notifications_update_own_read" ON public.sf100_notifications USING ((recipient_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((recipient_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "sf100_paid_users_insert_member" ON public.sf100_paid_users WITH CHECK (((reported_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sf100_pivots_insert_member" ON public.sf100_pivots WITH CHECK (((logged_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sf100_training_needs_insert_member" ON public.sf100_training_needs WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND sf100_can_write_enrollment(enrollment_id)));
ALTER POLICY "sh_builder_assignments_select" ON public.sh_builder_assignments USING ((sh_has_management_access() OR sh_is_staff() OR (EXISTS ( SELECT 1
   FROM sh_builders
  WHERE ((sh_builders.id = sh_builder_assignments.builder_id) AND (sh_builders.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_builder_skills_delete" ON public.sh_builder_skills USING ((sh_has_management_access() OR (EXISTS ( SELECT 1
   FROM sh_builders
  WHERE ((sh_builders.id = sh_builder_skills.builder_id) AND (sh_builders.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_builder_skills_insert" ON public.sh_builder_skills WITH CHECK ((sh_has_management_access() OR (EXISTS ( SELECT 1
   FROM sh_builders
  WHERE ((sh_builders.id = sh_builder_skills.builder_id) AND (sh_builders.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_builder_skills_select" ON public.sh_builder_skills USING ((sh_has_management_access() OR sh_is_staff() OR (EXISTS ( SELECT 1
   FROM sh_builders
  WHERE ((sh_builders.id = sh_builder_skills.builder_id) AND (sh_builders.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_builder_skills_update" ON public.sh_builder_skills USING ((sh_has_management_access() OR (EXISTS ( SELECT 1
   FROM sh_builders
  WHERE ((sh_builders.id = sh_builder_skills.builder_id) AND (sh_builders.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_builders_select" ON public.sh_builders USING ((sh_has_management_access() OR sh_is_staff() OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "sh_builders_update" ON public.sh_builders USING ((sh_has_management_access() OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "sh_cohort_assignments_select" ON public.sh_cohort_assignments USING ((sh_has_management_access() OR sh_is_staff() OR (EXISTS ( SELECT 1
   FROM sh_cohort_members
  WHERE ((sh_cohort_members.id = sh_cohort_assignments.cohort_member_id) AND (sh_cohort_members.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_cohort_members_select" ON public.sh_cohort_members USING ((sh_has_management_access() OR sh_is_staff() OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "sh_earnings_ledger_select" ON public.sh_earnings_ledger USING ((sh_has_management_access() OR sh_is_staff() OR ((recipient_type = 'builder'::sh_recipient_type) AND (builder_id = sh_get_builder_id())) OR ((recipient_type = 'cohort_member'::sh_recipient_type) AND (cohort_member_id IN ( SELECT sh_cohort_members.id
   FROM sh_cohort_members
  WHERE (sh_cohort_members.user_id = ( SELECT auth.uid() AS uid))))) OR ((recipient_type = 'production_learner'::sh_recipient_type) AND (production_learner_id IN ( SELECT sh_production_learners.id
   FROM sh_production_learners
  WHERE (sh_production_learners.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_notifications_delete" ON public.sh_notifications USING (((user_id = ( SELECT auth.uid() AS uid)) OR sh_is_admin()));
ALTER POLICY "sh_notifications_select" ON public.sh_notifications USING (((user_id = ( SELECT auth.uid() AS uid)) OR sh_has_management_access()));
ALTER POLICY "sh_notifications_update" ON public.sh_notifications USING (((user_id = ( SELECT auth.uid() AS uid)) OR sh_has_management_access()));
ALTER POLICY "sh_production_assignments_select" ON public.sh_production_assignments USING ((sh_has_management_access() OR sh_is_staff() OR (EXISTS ( SELECT 1
   FROM sh_production_learners
  WHERE ((sh_production_learners.id = sh_production_assignments.learner_id) AND (sh_production_learners.user_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "sh_production_learners_select" ON public.sh_production_learners USING ((sh_has_management_access() OR sh_is_staff() OR (user_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "sh_publication_contributors_select" ON public.sh_publication_contributors USING ((sh_has_management_access() OR sh_is_staff() OR (builder_id = sh_get_builder_id()) OR (cohort_member_id IN ( SELECT sh_cohort_members.id
   FROM sh_cohort_members
  WHERE (sh_cohort_members.user_id = ( SELECT auth.uid() AS uid)))) OR (learner_id IN ( SELECT sh_production_learners.id
   FROM sh_production_learners
  WHERE (sh_production_learners.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "smtp_configuration_delete" ON public.smtp_configuration USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = 'super_admin'::text))))));
ALTER POLICY "smtp_configuration_insert" ON public.smtp_configuration WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'principal'::text, 'hod'::text])))))));
ALTER POLICY "smtp_configuration_update" ON public.smtp_configuration USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'principal'::text, 'hod'::text]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR (p.role = ANY (ARRAY['super_admin'::text, 'principal'::text, 'hod'::text])))))));
ALTER POLICY "scn_insert" ON public.social_concern_reports WITH CHECK ((((reporter_profile_id = ( SELECT auth.uid() AS uid)) OR (reporter_profile_id IS NULL)) AND fn_social_can_contribute_to_handle(dept_account_id)));
ALTER POLICY "scn_select" ON public.social_concern_reports USING (((reporter_profile_id = ( SELECT auth.uid() AS uid)) OR fn_social_can_manage_handle(dept_account_id)));
ALTER POLICY "sc_insert" ON public.social_contributions WITH CHECK (((contributor_profile_id = ( SELECT auth.uid() AS uid)) AND fn_social_can_contribute_to_handle(dept_account_id)));
ALTER POLICY "sc_select" ON public.social_contributions USING (((contributor_profile_id = ( SELECT auth.uid() AS uid)) OR fn_social_can_manage_handle(dept_account_id)));
ALTER POLICY "sc_update_owner" ON public.social_contributions USING ((fn_social_can_manage_handle(dept_account_id) OR ((contributor_profile_id = ( SELECT auth.uid() AS uid)) AND (status = 'submitted'::text)))) WITH CHECK ((fn_social_can_manage_handle(dept_account_id) OR ((contributor_profile_id = ( SELECT auth.uid() AS uid)) AND (status = 'submitted'::text))));
ALTER POLICY "social_dept_accounts_select" ON public.social_dept_accounts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "social_dept_accounts_social_perm_read" ON public.social_dept_accounts USING ((( SELECT user_has_permission('social.departments.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)));
ALTER POLICY "social_facebook_logs_select" ON public.social_facebook_logs USING ((((page_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fb_pages a
  WHERE ((a.id = social_facebook_logs.page_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))))))) OR ((page_id IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))));
ALTER POLICY "social_facebook_logs_social_perm_read" ON public.social_facebook_logs USING (( SELECT user_has_permission('social.facebook.view'::text) AS user_has_permission));
ALTER POLICY "social_instagram_logs_select" ON public.social_instagram_logs USING ((((account_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ig_accounts a
  WHERE ((a.id = social_instagram_logs.account_id) AND ((a.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles p
          WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text))))))))) OR ((account_id IS NULL) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'super_admin'::text)))))));
ALTER POLICY "social_instagram_logs_social_perm_read" ON public.social_instagram_logs USING (( SELECT user_has_permission('social.instagram.view'::text) AS user_has_permission));
ALTER POLICY "social_loop_playbook_insert" ON public.social_loop_playbook WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('social.manage'::text) AS user_has_permission)));
ALTER POLICY "social_loop_playbook_select" ON public.social_loop_playbook USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('social.view'::text) AS user_has_permission)));
ALTER POLICY "social_loop_playbook_update" ON public.social_loop_playbook USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('social.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('social.manage'::text) AS user_has_permission)));
ALTER POLICY "social_monthly_cadence_select" ON public.social_monthly_cadence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('social.departments.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id) AND fn_social_caller_owns_dept(department_id))));
ALTER POLICY "ssf_cohorts_delete" ON public.ss_foundations_cohorts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ssf_cohorts_insert" ON public.ss_foundations_cohorts WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission)));
ALTER POLICY "ssf_cohorts_update" ON public.ss_foundations_cohorts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "ssf_enroll_delete" ON public.ss_foundations_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission)));
ALTER POLICY "ssf_enroll_insert" ON public.ss_foundations_enrollments WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) OR ((student_id = ( SELECT auth.uid() AS uid)) AND (enrolled_via = 'self'::text))));
ALTER POLICY "ssf_enroll_update" ON public.ss_foundations_enrollments USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) OR (student_id = ( SELECT auth.uid() AS uid)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission) OR (student_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "ssf_respver_insert" ON public.ss_foundations_response_versions WITH CHECK ((submitted_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "ssf_respver_select" ON public.ss_foundations_response_versions USING ((EXISTS ( SELECT 1
   FROM ss_foundations_responses r
  WHERE ((r.id = ss_foundations_response_versions.response_id) AND (r.student_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "ssf_responses_insert" ON public.ss_foundations_responses WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) AND ((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission))));
ALTER POLICY "ssf_responses_review_select" ON public.ss_foundations_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.review'::text) AS user_has_permission)));
ALTER POLICY "ssf_responses_review_update" ON public.ss_foundations_responses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.review'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM (ss_foundations_enrollments e
     JOIN ss_foundations_cohorts c ON ((c.id = e.cohort_id)))
  WHERE ((e.student_id = ss_foundations_responses.student_id) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (c.lead_mentor_id IN ( SELECT m.id
           FROM ss_mentors m
          WHERE (m.user_id = ( SELECT auth.uid() AS uid)))))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.review'::text) AS user_has_permission) OR (EXISTS ( SELECT 1
   FROM (ss_foundations_enrollments e
     JOIN ss_foundations_cohorts c ON ((c.id = e.cohort_id)))
  WHERE ((e.student_id = ss_foundations_responses.student_id) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (c.lead_mentor_id IN ( SELECT m.id
           FROM ss_mentors m
          WHERE (m.user_id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "ssf_responses_select" ON public.ss_foundations_responses USING (((student_id = ( SELECT auth.uid() AS uid)) OR (submitted_by = ( SELECT auth.uid() AS uid)) OR (reviewed_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (ss_foundations_enrollments e
     JOIN ss_foundations_cohorts c ON ((c.id = e.cohort_id)))
  WHERE ((e.student_id = ss_foundations_responses.student_id) AND ((c.created_by = ( SELECT auth.uid() AS uid)) OR (c.lead_mentor_id IN ( SELECT m.id
           FROM ss_mentors m
          WHERE (m.user_id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "ssf_responses_update" ON public.ss_foundations_responses USING (((submitted_by = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((submitted_by = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "ssf_worksheets_delete" ON public.ss_foundations_worksheets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission)));
ALTER POLICY "ssf_worksheets_insert" ON public.ss_foundations_worksheets WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission)));
ALTER POLICY "ssf_worksheets_update" ON public.ss_foundations_worksheets USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('startup_studio.foundations.manage'::text) AS user_has_permission)));
ALTER POLICY "ss_impact_reports_delete" ON public.ss_impact_reports USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_impact_reports_insert" ON public.ss_impact_reports WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_impact_reports_select" ON public.ss_impact_reports USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_impact_reports_update" ON public.ss_impact_reports USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_definitions_delete" ON public.ss_kpi_definitions USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_definitions_insert" ON public.ss_kpi_definitions WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_definitions_select" ON public.ss_kpi_definitions USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_definitions_update" ON public.ss_kpi_definitions USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_measurements_delete" ON public.ss_kpi_measurements USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_measurements_insert" ON public.ss_kpi_measurements WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_measurements_select" ON public.ss_kpi_measurements USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_kpi_measurements_update" ON public.ss_kpi_measurements USING (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((institution_id IS NULL) OR (institution_id = ( SELECT (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'institution_id'::text))::uuid AS uuid)) OR (((( SELECT auth.jwt() AS jwt) -> 'user_metadata'::text) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_marketing_activities_delete" ON public.ss_marketing_activities USING (((institution_id = ((( SELECT auth.jwt() AS jwt) ->> 'institution_id'::text))::uuid) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_marketing_activities_insert" ON public.ss_marketing_activities WITH CHECK (((institution_id = ((( SELECT auth.jwt() AS jwt) ->> 'institution_id'::text))::uuid) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_marketing_activities_select" ON public.ss_marketing_activities USING (((institution_id = ((( SELECT auth.jwt() AS jwt) ->> 'institution_id'::text))::uuid) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "ss_marketing_activities_update" ON public.ss_marketing_activities USING (((institution_id = ((( SELECT auth.jwt() AS jwt) ->> 'institution_id'::text))::uuid) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'super_admin'::text))) WITH CHECK (((institution_id = ((( SELECT auth.jwt() AS jwt) ->> 'institution_id'::text))::uuid) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'super_admin'::text)));
ALTER POLICY "staff_delete_scope_aware" ON public.staff USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('staff.delete'::text) AS user_has_permission) AND
CASE ( SELECT get_user_module_scope('staff'::text) AS get_user_module_scope)
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    ELSE false
END)));
ALTER POLICY "staff_insert_scope_aware" ON public.staff WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('staff.create'::text) AS user_has_permission) AND
CASE ( SELECT get_user_module_scope('staff'::text) AS get_user_module_scope)
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    ELSE false
END)));
ALTER POLICY "staff_select_scope_aware" ON public.staff USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('staff.view'::text) AS user_has_permission) AND
CASE ( SELECT get_user_module_scope('staff'::text) AS get_user_module_scope)
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN ((institution_id IS NULL) OR (institution_id IN ( SELECT unnest(( SELECT _user_accessible_institutions() AS _user_accessible_institutions)) AS unnest)))
    WHEN 'own_records'::text THEN (profile_id = ( SELECT auth.uid() AS uid))
    ELSE false
END)));
ALTER POLICY "staff_service_role_full_access" ON public.staff USING ((( SELECT (( SELECT auth.jwt() AS jwt) ->> 'role'::text)) = 'service_role'::text));
ALTER POLICY "staff_update_scope_aware" ON public.staff USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('staff.edit'::text) AS user_has_permission) AND
CASE ( SELECT get_user_module_scope('staff'::text) AS get_user_module_scope)
    WHEN 'all_institutions'::text THEN true
    WHEN 'own_institution'::text THEN role_has_institution_access(institution_id)
    WHEN 'own_records'::text THEN (profile_id = ( SELECT auth.uid() AS uid))
    ELSE false
END)));
ALTER POLICY "staff_imports_manage_access" ON public.staff_import_unmatched USING (( SELECT user_has_permission('staff.manage_imports'::text) AS user_has_permission)) WITH CHECK (( SELECT user_has_permission('staff.manage_imports'::text) AS user_has_permission));
ALTER POLICY "Faculty and HOD can delete staff_plan_courses" ON public.staff_plan_courses USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN staff_plans sp ON ((sp.id = staff_plan_courses.staff_plan_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = sp.institution_id) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'digital_coordinator'::text, 'super_admin'::text, 'admin'::text]))))));
ALTER POLICY "Faculty and HOD can update staff_plan_courses" ON public.staff_plan_courses USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN staff_plans sp ON ((sp.id = staff_plan_courses.staff_plan_id)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.institution_id = sp.institution_id) AND (p.role = ANY (ARRAY['faculty'::text, 'hod'::text, 'digital_coordinator'::text, 'super_admin'::text, 'admin'::text]))))));
ALTER POLICY "staff_plan_courses_select_permission" ON public.staff_plan_courses USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (staff_plan_id IN ( SELECT staff_plans.id
   FROM staff_plans
  WHERE (staff_plans.institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)))) OR ( SELECT user_has_permission('academic.staff.planning.view'::text) AS user_has_permission)));
ALTER POLICY "staff_plans_delete_permission" ON public.staff_plans USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.staff.planning.delete'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "staff_plans_insert_permission" ON public.staff_plans WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.staff.planning.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "staff_plans_select_permission" ON public.staff_plans USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.staff.planning.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "staff_plans_update_permission" ON public.staff_plans USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('academic.staff.planning.edit'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "staff_specializations_select" ON public.staff_specializations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = staff_specializations.staff_id) AND (s.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text, ('principal'::character varying)::text, ('cao'::character varying)::text])))))));
ALTER POLICY "staff_specializations_write" ON public.staff_specializations USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text]))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM staff acting
  WHERE ((acting.profile_id = ( SELECT auth.uid() AS uid)) AND ((acting.role_key)::text = ANY (ARRAY[('hr_officer'::character varying)::text, ('hr_admin'::character varying)::text, ('hr_manager'::character varying)::text, ('director'::character varying)::text])))))));
ALTER POLICY "saht_admin_read" ON public.staffing_alert_thresholds USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "saht_admin_write" ON public.staffing_alert_thresholds USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "startup_events_insert_admin" ON public.startup_events WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "startup_events_update_admin" ON public.startup_events USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['admin'::text, 'administrator'::text])))))));
ALTER POLICY "startup_events_update_lab_score" ON public.startup_events USING ((((config ->> 'kind'::text) = 'ai_pulse'::text) AND ( SELECT user_has_permission('aiPulse:lab.score'::text) AS user_has_permission))) WITH CHECK (((config ->> 'kind'::text) = 'ai_pulse'::text));
ALTER POLICY "Comprehensive attendance access by role" ON public.student_attendance USING ((( SELECT is_super_admin() AS is_super_admin) OR (institution_id = ANY (( SELECT array_agg(s.institution_id) AS array_agg
   FROM (profiles p
     JOIN staff s ON ((s.institution_email = p.email)))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((s.role_key)::text = 'faculty'::text)))::uuid[])) OR (department_id = ANY (( SELECT array_agg(p.department_id) AS array_agg
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'hod'::text)))::uuid[])) OR (department_id = ANY (( SELECT array_agg(p.department_id) AS array_agg
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'principal'::text)))::uuid[]))));
ALTER POLICY "student_attendance_delete_admin" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.attendance.delete'::text) AS user_has_permission)));
ALTER POLICY "student_attendance_insert_admin" ON public.student_attendance WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.attendance.mark'::text) AS user_has_permission)));
ALTER POLICY "student_attendance_insert_by_role" ON public.student_attendance WITH CHECK (((EXISTS ( SELECT 1
   FROM (profiles p
     LEFT JOIN custom_roles cr ON ((lower((cr.role_name)::text) = lower(p.role))))
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])) OR (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true))))) AND (institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "student_attendance_select_institution" ON public.student_attendance USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))));
ALTER POLICY "student_attendance_select_own_student" ON public.student_attendance USING (((( SELECT get_current_user_role() AS get_current_user_role) = 'student'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'student'::text) AND (p.learner_id IN ( SELECT learners_profiles.id
           FROM learners_profiles
          WHERE ((learners_profiles.section_id = student_attendance.section_id) AND (learners_profiles.lifecycle_status = ANY (ARRAY['active'::lifecycle_status, 'graduated'::lifecycle_status]))))))))));
ALTER POLICY "student_attendance_update_admin" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.attendance.edit'::text) AS user_has_permission)));
ALTER POLICY "student_attendance_update_by_role" ON public.student_attendance USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) OR ((EXISTS ( SELECT 1
           FROM custom_roles cr
          WHERE ((lower((cr.role_name)::text) = lower(p.role)) AND (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true)))) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid)))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.role = 'super_admin'::text) OR ((p.role = ANY (ARRAY['admin'::text, 'institution_admin'::text])) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))) OR ((EXISTS ( SELECT 1
           FROM custom_roles cr
          WHERE ((lower((cr.role_name)::text) = lower(p.role)) AND (((cr.permissions ->> 'academic.attendance.mark'::text))::boolean = true)))) AND (p.institution_id IN ( SELECT profiles.institution_id
           FROM profiles
          WHERE (profiles.id = ( SELECT auth.uid() AS uid))))))))));
ALTER POLICY "student_attendance_update_marker" ON public.student_attendance USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.attendance.mark'::text) AS user_has_permission))) WITH CHECK (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) AND ( SELECT user_has_permission('academic.attendance.mark'::text) AS user_has_permission)));
ALTER POLICY "student_credit_balances_read" ON public.student_credit_balances USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = student_credit_balances.student_id) AND ( SELECT user_has_permission('admission_fees.read'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "student_credit_balances_write" ON public.student_credit_balances USING ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = student_credit_balances.student_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM learners_profiles lp
  WHERE ((lp.id = student_credit_balances.student_id) AND ( SELECT user_has_permission('admission_fees.approve_change_event'::text) AS user_has_permission) AND role_has_institution_access(lp.institution_id)))));
ALTER POLICY "student_engagement_select_admin" ON public.student_engagement_scores USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR ((p.role = ANY (ARRAY['principal'::text, 'hod'::text, 'faculty'::text, 'admin'::text, 'admission_counselor'::text, 'expo_counselor'::text, 'accounts'::text])) AND (p.institution_id = student_engagement_scores.institution_id)))))));
ALTER POLICY "sustainability_readings_delete" ON public.sustainability_meter_readings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.sustainability_readings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sustainability_readings_insert" ON public.sustainability_meter_readings WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.sustainability_readings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sustainability_readings_select" ON public.sustainability_meter_readings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.sustainability_readings.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sustainability_readings_update" ON public.sustainability_meter_readings USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.sustainability_readings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id)))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.sustainability_readings.manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "sustainability_naac_evidence_select" ON public.sustainability_naac_evidence USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('accreditation.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));
ALTER POLICY "teaching_enterprise_cohorts_select" ON public.teaching_enterprise_cohorts USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('improvement.board.manage'::text) AS user_has_permission)));
ALTER POLICY "sync_metadata_select" ON public.telephony_sync_metadata USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Users can create timetables with permission" ON public.timetables WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'digital_coordinator'::text]))))));
ALTER POLICY "Users can update timetables with permission" ON public.timetables USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'digital_coordinator'::text]))))));
ALTER POLICY "timetables_delete_admin" ON public.timetables USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('academic.timetables.delete'::text) AS user_has_permission))));
ALTER POLICY "timetables_insert_admin" ON public.timetables WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('academic.timetables.create'::text) AS user_has_permission))));
ALTER POLICY "timetables_select_permission" ON public.timetables USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((( SELECT user_has_permission('academic.timetables.view'::text) AS user_has_permission) OR ( SELECT user_has_permission('learners.my-timetable.view'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));
ALTER POLICY "timetables_update_admin" ON public.timetables USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ((institution_id = ( SELECT get_current_user_institution_id() AS get_current_user_institution_id)) AND ( SELECT user_has_permission('academic.timetables.edit'::text) AS user_has_permission))));
ALTER POLICY "tms_att_learner_select" ON public.tms_attendance USING ((learner_id IN ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_booking_learner_select" ON public.tms_booking USING ((learner_id IN ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_driver_delete" ON public.tms_driver USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.drivers.manage'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_insert" ON public.tms_driver WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.drivers.manage'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_select" ON public.tms_driver USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.drivers.view'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_update" ON public.tms_driver USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.drivers.manage'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.drivers.manage'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_mobile_delete" ON public.tms_driver_mobile USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.driver_mobiles.delete'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_mobile_insert" ON public.tms_driver_mobile WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.driver_mobiles.create'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_mobile_select" ON public.tms_driver_mobile USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.driver_mobiles.view'::text) AS user_has_permission)));
ALTER POLICY "tms_driver_mobile_update" ON public.tms_driver_mobile USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.driver_mobiles.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.driver_mobiles.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_grv_learner_insert" ON public.tms_grievance WITH CHECK ((learner_id IN ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_grv_learner_select" ON public.tms_grievance USING ((learner_id IN ( SELECT lp.id
   FROM learners_profiles lp
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_grv_staff_select" ON public.tms_grievance USING ((submitter_profile_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_grvc_learner_insert" ON public.tms_grievance_comment WITH CHECK ((grievance_id IN ( SELECT g.id
   FROM (tms_grievance g
     JOIN learners_profiles lp ON ((lp.id = g.learner_id)))
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_grvc_learner_select" ON public.tms_grievance_comment USING ((grievance_id IN ( SELECT g.id
   FROM (tms_grievance g
     JOIN learners_profiles lp ON ((lp.id = g.learner_id)))
  WHERE (lp.profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_grvc_staff_select" ON public.tms_grievance_comment USING ((grievance_id IN ( SELECT g.id
   FROM tms_grievance g
  WHERE (g.submitter_profile_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "tms_notif_select_recipient" ON public.tms_notification USING ((EXISTS ( SELECT 1
   FROM tms_notification_recipient r
  WHERE ((r.notification_id = tms_notification.id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "tms_notif_recipient_select_own" ON public.tms_notification_recipient USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_notif_recipient_update_own" ON public.tms_notification_recipient USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_push_sub_delete_own" ON public.tms_push_subscription USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_push_sub_insert_own" ON public.tms_push_subscription WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_push_sub_select_own" ON public.tms_push_subscription USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_push_sub_update_own" ON public.tms_push_subscription USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tms_route_delete" ON public.tms_route USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.delete'::text) AS user_has_permission)));
ALTER POLICY "tms_route_insert" ON public.tms_route WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.create'::text) AS user_has_permission)));
ALTER POLICY "tms_route_select" ON public.tms_route USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.view'::text) AS user_has_permission)));
ALTER POLICY "tms_route_update" ON public.tms_route USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_route_possible_stop_delete" ON public.tms_route_possible_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('tms.routes.delete'::text) AS user_has_permission)));
ALTER POLICY "tms_route_possible_stop_insert" ON public.tms_route_possible_stop WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.create'::text) AS user_has_permission) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_route_possible_stop_select" ON public.tms_route_possible_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.view'::text) AS user_has_permission)));
ALTER POLICY "tms_route_possible_stop_update" ON public.tms_route_possible_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_route_stop_delete" ON public.tms_route_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission) OR ( SELECT user_has_permission('tms.routes.delete'::text) AS user_has_permission)));
ALTER POLICY "tms_route_stop_insert" ON public.tms_route_stop WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.create'::text) AS user_has_permission) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_route_stop_select" ON public.tms_route_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.view'::text) AS user_has_permission)));
ALTER POLICY "tms_route_stop_update" ON public.tms_route_stop USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.routes.edit'::text) AS user_has_permission)));
ALTER POLICY "tms_sra_staff_select" ON public.tms_staff_route_assignment USING ((lower(staff_email) = lower(( SELECT profiles.email
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))))));
ALTER POLICY "tms_vacate_req_select" ON public.tms_transport_vacate_request USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vacate.view'::text) AS user_has_permission) OR (profile_id = ( SELECT auth.uid() AS uid))));
ALTER POLICY "tms_vehicle_delete" ON public.tms_vehicle USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vehicles.delete'::text) AS user_has_permission)));
ALTER POLICY "tms_vehicle_insert" ON public.tms_vehicle WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vehicles.create'::text) AS user_has_permission)));
ALTER POLICY "tms_vehicle_select" ON public.tms_vehicle USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vehicles.view'::text) AS user_has_permission)));
ALTER POLICY "tms_vehicle_update" ON public.tms_vehicle USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vehicles.edit'::text) AS user_has_permission))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT user_has_permission('tms.vehicles.edit'::text) AS user_has_permission)));
ALTER POLICY "tournament_divisions_delete" ON public.tournament_divisions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_divisions.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_divisions_insert" ON public.tournament_divisions WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.create'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_divisions.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_divisions_select" ON public.tournament_divisions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_divisions.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_divisions_update" ON public.tournament_divisions USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.edit'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_divisions.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_entries_delete" ON public.tournament_entries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_entries.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_entries_insert" ON public.tournament_entries WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_entries.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_entries_select" ON public.tournament_entries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_entries.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_entries_update" ON public.tournament_entries USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_entries.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_matches_select" ON public.tournament_matches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_matches.event_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_matches_write" ON public.tournament_matches USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_matches.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id)))))))) WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = tournament_matches.event_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_team_members_delete" ON public.tournament_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (tournament_entries te
     JOIN events e ON ((e.id = te.event_id)))
  WHERE ((te.id = tournament_team_members.entry_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_team_members_insert" ON public.tournament_team_members WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (tournament_entries te
     JOIN events e ON ((e.id = te.event_id)))
  WHERE ((te.id = tournament_team_members.entry_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_team_members_select" ON public.tournament_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.view'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (tournament_entries te
     JOIN events e ON ((e.id = te.event_id)))
  WHERE ((te.id = tournament_team_members.entry_id) AND ((e.scope = 'all_jkkn'::text) OR (e.visibility = ANY (ARRAY['all_jkkn'::text, 'public'::text])) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "tournament_team_members_update" ON public.tournament_team_members USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (( SELECT user_has_permission('sports.tournaments.manage'::text) AS user_has_permission) AND (EXISTS ( SELECT 1
   FROM (tournament_entries te
     JOIN events e ON ((e.id = te.event_id)))
  WHERE ((te.id = tournament_team_members.entry_id) AND ((e.scope = 'all_jkkn'::text) OR role_has_institution_access(e.institution_id))))))));
ALTER POLICY "track_declarations_delete_admin" ON public.track_declarations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text]))))));
ALTER POLICY "track_declarations_insert_leader" ON public.track_declarations WITH CHECK (((declared_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = track_declarations.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM startup_events se
  WHERE ((se.id = track_declarations.event_id) AND (se.is_results_published = true))))));
ALTER POLICY "track_declarations_select_admin" ON public.track_declarations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))))));
ALTER POLICY "track_declarations_select_own_team" ON public.track_declarations USING (((EXISTS ( SELECT 1
   FROM event_team_members etm
  WHERE ((etm.registration_id = track_declarations.team_id) AND (etm.profile_id = ( SELECT auth.uid() AS uid)) AND (etm.status = 'accepted'::text)))) OR (EXISTS ( SELECT 1
   FROM event_registrations er
  WHERE ((er.id = track_declarations.team_id) AND (er.owner_id = ( SELECT auth.uid() AS uid)))))));
ALTER POLICY "track_declarations_update_admin" ON public.track_declarations USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'faculty'::text, 'hod'::text, 'principal'::text]))))));
ALTER POLICY "track_declarations_update_leader" ON public.track_declarations USING ((declared_by = ( SELECT auth.uid() AS uid))) WITH CHECK ((declared_by = ( SELECT auth.uid() AS uid)));
ALTER POLICY "tracker_comments_read" ON public.tracker_comments USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "tracker_items_read" ON public.tracker_items USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "tracker_sections_read" ON public.tracker_sections USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "Institution admin can view own institution usage_events" ON public.usage_events USING ((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Super admin can view all usage_events" ON public.usage_events USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "Super admin can view usage_events_archive" ON public.usage_events_archive USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_super_admin = true)))));
ALTER POLICY "activity_logs_insert_own" ON public.user_activity_logs WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "activity_logs_select_billing" ON public.user_activity_logs USING ((((resource_type)::text = ANY (ARRAY[('bill'::character varying)::text, ('receipt'::character varying)::text, ('invoice'::character varying)::text, ('discount'::character varying)::text, ('refund'::character varying)::text, ('category'::character varying)::text])) AND ( SELECT user_has_permission('billing.reports.view'::text) AS user_has_permission) AND ((institution_id IS NULL) OR role_has_institution_access(institution_id))));
ALTER POLICY "user_activity_logs_select_institution" ON public.user_activity_logs USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL)))) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "user_block_access_delete" ON public.user_block_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.block_access.manage'::text) AS user_has_permission)));
ALTER POLICY "user_block_access_insert" ON public.user_block_access WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.block_access.manage'::text) AS user_has_permission)));
ALTER POLICY "user_block_access_select" ON public.user_block_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('users.block_access.view'::text) AS user_has_permission)));
ALTER POLICY "user_block_access_update" ON public.user_block_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.block_access.manage'::text) AS user_has_permission)));
ALTER POLICY "user_contract_access_delete" ON public.user_contract_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.contract_access.manage'::text) AS user_has_permission)));
ALTER POLICY "user_contract_access_insert" ON public.user_contract_access WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.contract_access.manage'::text) AS user_has_permission)));
ALTER POLICY "user_contract_access_select" ON public.user_contract_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('users.contract_access.view'::text) AS user_has_permission)));
ALTER POLICY "user_contract_access_update" ON public.user_contract_access USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.contract_access.manage'::text) AS user_has_permission)));
ALTER POLICY "Users can delete own preferences" ON public.user_dashboard_preferences USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can insert own preferences" ON public.user_dashboard_preferences WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can update own preferences" ON public.user_dashboard_preferences USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can view own preferences" ON public.user_dashboard_preferences USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "user_hr_access_isolation" ON public.user_hr_access USING (((hr_organization_id = auth_hr_organization_id()) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin))) WITH CHECK (((hr_organization_id = auth_hr_organization_id()) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "service_role_full_access_institution_access" ON public.user_institution_access USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "user_learner_relationship_delete" ON public.user_learner_relationship USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.relationship.manage'::text) AS user_has_permission)));
ALTER POLICY "user_learner_relationship_insert" ON public.user_learner_relationship WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.relationship.manage'::text) AS user_has_permission)));
ALTER POLICY "user_learner_relationship_select" ON public.user_learner_relationship USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT user_has_permission('users.relationship.view'::text) AS user_has_permission)));
ALTER POLICY "user_learner_relationship_update" ON public.user_learner_relationship USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('users.relationship.manage'::text) AS user_has_permission)));
ALTER POLICY "Users can delete own page favorites" ON public.user_page_favorites USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can insert own page favorites" ON public.user_page_favorites WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can update own page favorites" ON public.user_page_favorites USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "Users can view own page favorites" ON public.user_page_favorites USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "user_roles_delete_permission" ON public.user_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.delete'::text) AS user_has_permission)));
ALTER POLICY "user_roles_insert_permission" ON public.user_roles WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.create'::text) AS user_has_permission)));
ALTER POLICY "user_roles_select_admin" ON public.user_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.edit'::text) AS user_has_permission)));
ALTER POLICY "user_roles_select_own" ON public.user_roles USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "user_roles_update_permission" ON public.user_roles USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin) OR ( SELECT user_has_permission('roles.edit'::text) AS user_has_permission)));
ALTER POLICY "user_sessions_insert_system" ON public.user_sessions WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "user_sessions_select_admin" ON public.user_sessions USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND ((p.is_super_admin = true) OR ((p.role = ANY (ARRAY['principal'::text, 'hod'::text, 'faculty'::text, 'admin'::text])) AND (p.institution_id = user_sessions.institution_id)))))));
ALTER POLICY "user_sessions_select_own" ON public.user_sessions USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "user_sessions_update_system" ON public.user_sessions USING ((( SELECT auth.uid() AS uid) = user_id));
ALTER POLICY "vac_course_programmes_select" ON public.vac_course_programmes USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "vac_course_programmes_write" ON public.vac_course_programmes USING (((EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_course_programmes.course_id) AND (vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_course_programmes.course_id) AND (vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_courses_delete" ON public.vac_courses USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "vac_courses_insert" ON public.vac_courses WITH CHECK (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_courses_select" ON public.vac_courses USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_courses_update" ON public.vac_courses USING (((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_enrollments_delete" ON public.vac_enrollments USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "vac_enrollments_insert" ON public.vac_enrollments WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_enrollments_select" ON public.vac_enrollments USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_enrollments.course_id) AND (vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_enrollments_update" ON public.vac_enrollments USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_enrollments.course_id) AND (vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_learner_progress_select" ON public.vac_learner_progress USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_learner_progress.course_id) AND (vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true))))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_learner_progress_write" ON public.vac_learner_progress USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "vac_lessons_select" ON public.vac_lessons USING ((EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_lessons.course_id) AND ((vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "vac_lessons_write" ON public.vac_lessons USING ((EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_lessons.course_id) AND ((vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM vac_courses vc
  WHERE ((vc.id = vac_lessons.course_id) AND ((vc.institution_id IN ( SELECT user_institution_access.institution_id
           FROM user_institution_access
          WHERE ((user_institution_access.user_id = ( SELECT auth.uid() AS uid)) AND (user_institution_access.is_active = true)))) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "vsr_disputes_admin" ON public.vsr_disputes USING ((( SELECT is_super_admin() AS is_super_admin) OR ( SELECT is_admin() AS is_admin)));
ALTER POLICY "vsr_disputes_own" ON public.vsr_disputes USING ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "vsr_learner_state_own" ON public.vsr_learner_state USING ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "vsr_share_tokens_own" ON public.vsr_share_tokens USING ((learner_id = ( SELECT p.learner_id
   FROM profiles p
  WHERE (p.id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_segments_access" ON public.wa_audience_segments USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_auto_trigger_rules_delete" ON public.wa_auto_trigger_rules USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_auto_trigger_rules_insert" ON public.wa_auto_trigger_rules WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_auto_trigger_rules_select" ON public.wa_auto_trigger_rules USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_auto_trigger_rules_update" ON public.wa_auto_trigger_rules USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_byow_connection_health_select_hod_of_dept" ON public.wa_byow_connection_health USING ((EXISTS ( SELECT 1
   FROM wa_personal_connections c
  WHERE ((c.id = wa_byow_connection_health.connection_id) AND fn_user_is_hod_of_department(( SELECT auth.uid() AS uid), c.department_id)))));
ALTER POLICY "wa_byow_connection_health_select_super_admin" ON public.wa_byow_connection_health USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "byow_health_log_super_admin_select" ON public.wa_byow_health_log USING (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "wa_byow_monthly_audit_results_super_admin_only" ON public.wa_byow_monthly_audit_results USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "wa_byow_synthetic_audit_log_super_admin_only" ON public.wa_byow_synthetic_audit_log USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))));
ALTER POLICY "wa_consent_log_access" ON public.wa_consent_log USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_conv_delete" ON public.wa_conversations USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "wa_conv_insert" ON public.wa_conversations WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "wa_conv_select" ON public.wa_conversations USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "wa_conv_update" ON public.wa_conversations USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "wa_doc_catalog_access" ON public.wa_document_catalog USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_form_responses_access" ON public.wa_form_responses USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_form_templates_access" ON public.wa_form_templates USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Service role has full access to wa_message_logs" ON public.wa_message_logs USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));
ALTER POLICY "Users can delete own institution message logs" ON public.wa_message_logs USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Users can insert own institution message logs" ON public.wa_message_logs WITH CHECK ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Users can update own institution message logs" ON public.wa_message_logs USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "Users can view own institution message logs" ON public.wa_message_logs USING ((institution_id IN ( SELECT user_institution_access.institution_id
   FROM user_institution_access
  WHERE (user_institution_access.user_id = ( SELECT auth.uid() AS uid)))));
ALTER POLICY "wa_msg_delete" ON public.wa_messages USING ((EXISTS ( SELECT 1
   FROM wa_conversations c
  WHERE ((c.id = wa_messages.conversation_id) AND ((c.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "wa_msg_insert" ON public.wa_messages WITH CHECK ((EXISTS ( SELECT 1
   FROM wa_conversations c
  WHERE ((c.id = wa_messages.conversation_id) AND ((c.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "wa_msg_select" ON public.wa_messages USING ((EXISTS ( SELECT 1
   FROM wa_conversations c
  WHERE ((c.id = wa_messages.conversation_id) AND ((c.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "wa_msg_update" ON public.wa_messages USING ((EXISTS ( SELECT 1
   FROM wa_conversations c
  WHERE ((c.id = wa_messages.conversation_id) AND ((c.institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text)))))))));
ALTER POLICY "wa_personal_conn_delete" ON public.wa_personal_connections USING (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_conn_select" ON public.wa_personal_connections USING (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_conn_update" ON public.wa_personal_connections USING (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_connections_insert_hod_only" ON public.wa_personal_connections WITH CHECK (((connected_by = ( SELECT auth.uid() AS uid)) AND (fn_user_is_hod_of_department(( SELECT auth.uid() AS uid), department_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))))));
ALTER POLICY "wa_personal_msg_insert" ON public.wa_personal_message_logs WITH CHECK (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_msg_select" ON public.wa_personal_message_logs USING (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_msg_update" ON public.wa_personal_message_logs USING (((department_id = ( SELECT profiles.department_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_queue_insert" ON public.wa_personal_message_queue WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_queue_select" ON public.wa_personal_message_queue USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_queue_update" ON public.wa_personal_message_queue USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_templates_delete" ON public.wa_personal_message_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_templates_insert" ON public.wa_personal_message_templates WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_templates_select" ON public.wa_personal_message_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_personal_templates_update" ON public.wa_personal_message_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true))))) OR (EXISTS ( SELECT 1
   FROM (user_roles ur
     JOIN custom_roles cr ON ((ur.role_id = cr.id)))
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND ((cr.role_key)::text = 'admission'::text))))));
ALTER POLICY "wa_templates_select" ON public.wa_templates USING (((institution_id IN ( SELECT wa_templates.institution_id
   FROM user_roles
  WHERE (user_roles.user_id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "Staff can manage waste incidents" ON public.waste_incidents USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'staff'::text, 'hod'::text]))))));
ALTER POLICY "Users can view waste incidents" ON public.waste_incidents USING (((institution_id IN ( SELECT profiles.institution_id
   FROM profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'super_admin'::text))))));
ALTER POLICY "service_role_only_webhook_logs" ON public.webhook_logs USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "whatsapp_send_limits_select" ON public.whatsapp_send_limits USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "whatsapp_send_limits_super_admin_write" ON public.whatsapp_send_limits USING (( SELECT is_super_admin() AS is_super_admin)) WITH CHECK (( SELECT is_super_admin() AS is_super_admin));
ALTER POLICY "whatsapp_templates_delete" ON public.whatsapp_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true)))))));
ALTER POLICY "whatsapp_templates_insert" ON public.whatsapp_templates WITH CHECK (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true)))))));
ALTER POLICY "whatsapp_templates_select" ON public.whatsapp_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true)))))));
ALTER POLICY "whatsapp_templates_service_role" ON public.whatsapp_templates USING (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text));
ALTER POLICY "whatsapp_templates_update" ON public.whatsapp_templates USING (((institution_id = auth_institution_id()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND ((profiles.role = 'super_admin'::text) OR (profiles.is_super_admin = true)))))));
ALTER POLICY "work_signal_suggestions_own" ON public.work_signal_suggestions USING (((subject_profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_super_admin() AS is_super_admin)));
ALTER POLICY "wp_impact_admin_write" ON public.wp_agent_impact USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text]))))));
ALTER POLICY "wp_impact_read_all" ON public.wp_agent_impact USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "wp_impact_service_write" ON public.wp_agent_impact USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "wp_micro_select_own" ON public.wp_micro_interviews USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "wp_micro_service_write" ON public.wp_micro_interviews USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "wp_micro_update_own" ON public.wp_micro_interviews USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "wp_patterns_admin_write" ON public.wp_patterns USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text]))))));
ALTER POLICY "wp_patterns_read_all" ON public.wp_patterns USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
ALTER POLICY "wp_patterns_service_write" ON public.wp_patterns USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "wp_pulse_entries_insert_own" ON public.wp_pulse_entries WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "wp_pulse_entries_select_own" ON public.wp_pulse_entries USING ((user_id = ( SELECT auth.uid() AS uid)));
ALTER POLICY "wp_pulse_entries_service_read" ON public.wp_pulse_entries USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "wp_pulse_entries_service_update" ON public.wp_pulse_entries USING ((( SELECT auth.role() AS role) = 'service_role'::text));
ALTER POLICY "wp_pulse_entries_update_own" ON public.wp_pulse_entries USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
