-- ============================================================================
-- ADMISSION MODULE: RLS POLICIES
-- Standard pattern: auth_institution_id() with super_admin bypass
-- Generated from live database schema - 2026-02-25
-- ============================================================================

-- Helper function (ensure exists)
CREATE OR REPLACE FUNCTION auth_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ============================================================================
-- 1. ADMISSION COUNSELORS
-- ============================================================================
CREATE POLICY "counselors_select" ON admission_counselors FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "counselors_insert" ON admission_counselors FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "counselors_update" ON admission_counselors FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "counselors_delete" ON admission_counselors FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 2. ADMISSION LEADS (special: role-based INSERT for consultants)
-- ============================================================================
CREATE POLICY "leads_select" ON admission_leads FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "leads_insert" ON admission_leads FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin', 'staff', 'institution_admin', 'administrator')
  )
  OR EXISTS (
    SELECT 1 FROM education_consultants WHERE user_id = auth.uid() AND status = 'active'
  )
);
CREATE POLICY "leads_update" ON admission_leads FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR assigned_counselor_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "leads_delete" ON admission_leads FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 3. ADMISSION LEAD ACTIVITIES
-- ============================================================================
CREATE POLICY "lead_activities_select" ON admission_lead_activities FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_activities_insert" ON admission_lead_activities FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_activities_update" ON admission_lead_activities FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_activities_delete" ON admission_lead_activities FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 4. ADMISSION LEAD STAGE HISTORY
-- Note: No institution_id column — access via lead_id join
-- ============================================================================
CREATE POLICY "stage_history_select" ON admission_lead_stage_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM admission_leads al
    WHERE al.id = admission_lead_stage_history.lead_id
    AND (al.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "stage_history_insert" ON admission_lead_stage_history FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM admission_leads al
    WHERE al.id = admission_lead_stage_history.lead_id
    AND (al.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "stage_history_update" ON admission_lead_stage_history FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM admission_leads al
    WHERE al.id = admission_lead_stage_history.lead_id
    AND (al.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "stage_history_delete" ON admission_lead_stage_history FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM admission_leads al
    WHERE al.id = admission_lead_stage_history.lead_id
    AND (al.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);

-- ============================================================================
-- 5. ADMISSION APPLICATIONS
-- ============================================================================
CREATE POLICY "applications_select" ON admission_applications FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "applications_insert" ON admission_applications FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "applications_update" ON admission_applications FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "applications_delete" ON admission_applications FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 6. ADMISSION LEAD SCORES
-- ============================================================================
CREATE POLICY "lead_scores_select" ON admission_lead_scores FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_scores_insert" ON admission_lead_scores FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_scores_update" ON admission_lead_scores FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_scores_delete" ON admission_lead_scores FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 7. ADMISSION AI INSIGHTS
-- ============================================================================
CREATE POLICY "ai_insights_select" ON admission_ai_insights FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "ai_insights_insert" ON admission_ai_insights FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "ai_insights_update" ON admission_ai_insights FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "ai_insights_delete" ON admission_ai_insights FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 8. ADMISSION ASSIGNMENT RULES
-- ============================================================================
CREATE POLICY "assignment_rules_select" ON admission_assignment_rules FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "assignment_rules_insert" ON admission_assignment_rules FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "assignment_rules_update" ON admission_assignment_rules FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "assignment_rules_delete" ON admission_assignment_rules FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 9. ADMISSION COMMUNICATION TEMPLATES
-- ============================================================================
CREATE POLICY "comm_templates_select" ON admission_communication_templates FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "comm_templates_insert" ON admission_communication_templates FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "comm_templates_update" ON admission_communication_templates FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "comm_templates_delete" ON admission_communication_templates FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 10. ADMISSION WORKFLOW CONFIGS
-- ============================================================================
CREATE POLICY "workflow_configs_select" ON admission_workflow_configs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflow_configs_insert" ON admission_workflow_configs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflow_configs_update" ON admission_workflow_configs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflow_configs_delete" ON admission_workflow_configs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 11. ADMISSION WORKFLOWS
-- ============================================================================
CREATE POLICY "workflows_select" ON admission_workflows FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflows_insert" ON admission_workflows FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflows_update" ON admission_workflows FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "workflows_delete" ON admission_workflows FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 12. ADMISSION DAILY BRIEFINGS (special: user-level access)
-- ============================================================================
CREATE POLICY "briefings_select" ON admission_daily_briefings FOR SELECT USING (
  user_id = auth.uid()
  OR institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "briefings_insert" ON admission_daily_briefings FOR INSERT WITH CHECK (true);
CREATE POLICY "briefings_update" ON admission_daily_briefings FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY "briefings_delete" ON admission_daily_briefings FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 13. ADMISSION CALL LOGS
-- ============================================================================
CREATE POLICY "call_logs_select" ON admission_call_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "call_logs_insert" ON admission_call_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "call_logs_update" ON admission_call_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "call_logs_delete" ON admission_call_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 14. ADMISSION SMS LOGS
-- ============================================================================
CREATE POLICY "sms_logs_select" ON admission_sms_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "sms_logs_insert" ON admission_sms_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "sms_logs_update" ON admission_sms_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "sms_logs_delete" ON admission_sms_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 15. ADMISSION WHATSAPP LOGS
-- ============================================================================
CREATE POLICY "whatsapp_logs_select" ON admission_whatsapp_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "whatsapp_logs_insert" ON admission_whatsapp_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "whatsapp_logs_update" ON admission_whatsapp_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "whatsapp_logs_delete" ON admission_whatsapp_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 16. ADMISSION EMAIL LOGS
-- ============================================================================
CREATE POLICY "email_logs_select" ON admission_email_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "email_logs_insert" ON admission_email_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "email_logs_update" ON admission_email_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "email_logs_delete" ON admission_email_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 17. ADMISSION CAMPAIGN QUEUE
-- ============================================================================
CREATE POLICY "campaign_queue_select" ON admission_campaign_queue FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_queue_insert" ON admission_campaign_queue FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_queue_update" ON admission_campaign_queue FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_queue_delete" ON admission_campaign_queue FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 18. ADMISSION CAMPAIGN LOGS
-- ============================================================================
CREATE POLICY "campaign_logs_select" ON admission_campaign_logs FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_logs_insert" ON admission_campaign_logs FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_logs_update" ON admission_campaign_logs FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "campaign_logs_delete" ON admission_campaign_logs FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 19. ADMISSION DRIP SEQUENCES
-- ============================================================================
CREATE POLICY "drip_sequences_select" ON admission_drip_sequences FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "drip_sequences_insert" ON admission_drip_sequences FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "drip_sequences_update" ON admission_drip_sequences FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "drip_sequences_delete" ON admission_drip_sequences FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 20. ADMISSION DRIP SCHEDULE
-- Note: No institution_id column — access via sequence_id join
-- ============================================================================
CREATE POLICY "drip_schedule_select" ON admission_drip_schedule FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_schedule.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_schedule_insert" ON admission_drip_schedule FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_schedule.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_schedule_update" ON admission_drip_schedule FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_schedule.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_schedule_delete" ON admission_drip_schedule FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_schedule.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);

-- ============================================================================
-- 21. ADMISSION DRIP EXECUTION LOGS
-- Note: No institution_id column — access via sequence_id join
-- ============================================================================
CREATE POLICY "drip_exec_logs_select" ON admission_drip_execution_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_execution_logs.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_exec_logs_insert" ON admission_drip_execution_logs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_execution_logs.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_exec_logs_update" ON admission_drip_execution_logs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_execution_logs.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "drip_exec_logs_delete" ON admission_drip_execution_logs FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM admission_drip_sequences ds
    WHERE ds.id = admission_drip_execution_logs.sequence_id
    AND (ds.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);

-- ============================================================================
-- 22. ADMISSION TASKS
-- ============================================================================
CREATE POLICY "tasks_select" ON admission_tasks FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "tasks_insert" ON admission_tasks FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "tasks_update" ON admission_tasks FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "tasks_delete" ON admission_tasks FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 23. ADMISSIONS (enrollment records)
-- ============================================================================
CREATE POLICY "admissions_select" ON admissions FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "admissions_insert" ON admissions FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "admissions_update" ON admissions FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "admissions_delete" ON admissions FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 24. CONSULTANT COMMISSION STRUCTURES
-- ============================================================================
CREATE POLICY "commission_structures_select" ON consultant_commission_structures FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_structures_insert" ON consultant_commission_structures FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_structures_update" ON consultant_commission_structures FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_structures_delete" ON consultant_commission_structures FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 25. CONSULTANT LEAD ATTRIBUTIONS
-- ============================================================================
CREATE POLICY "lead_attributions_select" ON consultant_lead_attributions FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_attributions_insert" ON consultant_lead_attributions FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_attributions_update" ON consultant_lead_attributions FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "lead_attributions_delete" ON consultant_lead_attributions FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 26. CONSULTANT COMMISSION TRANSACTIONS
-- ============================================================================
CREATE POLICY "commission_transactions_select" ON consultant_commission_transactions FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_transactions_insert" ON consultant_commission_transactions FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_transactions_update" ON consultant_commission_transactions FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "commission_transactions_delete" ON consultant_commission_transactions FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 27. CONSULTANT PAYOUT BATCHES
-- ============================================================================
CREATE POLICY "payout_batches_select" ON consultant_payout_batches FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payout_batches_insert" ON consultant_payout_batches FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payout_batches_update" ON consultant_payout_batches FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payout_batches_delete" ON consultant_payout_batches FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 28. CONSULTANT COMMUNICATIONS
-- ============================================================================
CREATE POLICY "consultant_comms_select" ON consultant_communications FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_comms_insert" ON consultant_communications FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_comms_update" ON consultant_communications FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_comms_delete" ON consultant_communications FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 29. CONSULTANT DOCUMENTS
-- ============================================================================
CREATE POLICY "consultant_docs_select" ON consultant_documents FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_docs_insert" ON consultant_documents FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_docs_update" ON consultant_documents FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "consultant_docs_delete" ON consultant_documents FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- ============================================================================
-- 30. CONSULTANT PAYMENT QUERIES
-- ============================================================================
CREATE POLICY "payment_queries_select" ON consultant_payment_queries FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payment_queries_insert" ON consultant_payment_queries FOR INSERT WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payment_queries_update" ON consultant_payment_queries FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "payment_queries_delete" ON consultant_payment_queries FOR DELETE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
