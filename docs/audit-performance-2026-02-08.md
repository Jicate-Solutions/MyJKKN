# MyJKKN Staging Supabase Performance Audit

**Date:** 2026-02-08
**Project:** hhprjbgknupaplivtoib (Staging)
**Auditor:** Claude Code (automated)
**Status:** Report Only -- No changes applied

---

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Unindexed Foreign Keys | 198 | INFO |
| RLS Policy InitPlan Issues | 416 across 176 tables | WARN |
| Tables Missing Primary Key | 5 | INFO |
| Unused Indexes | 814 across ~200 tables | INFO |
| Multiple Permissive RLS Policies | 748 across 114 tables | WARN |
| Duplicate Indexes | 10 | WARN |
| Auth DB Connection Strategy | 1 | INFO |
| Tables Missing institution_id Index | 25 | HIGH |

**Key takeaway:** The database has significant index bloat (814 unused indexes) while simultaneously lacking indexes on 198 foreign key columns. RLS policies on 176 tables use suboptimal `auth.<function>()` calls that re-evaluate per row.

---

## 1. Tables Missing `institution_id` Index (HIGH PRIORITY)

Every query in MyJKKN filters by `institution_id`. These 25 tables have the column but NO index on it, meaning every query does a full table scan for institution filtering.

| Table | Remediation |
|-------|-------------|
| admission_counselors | `CREATE INDEX idx_admission_counselors_institution_id ON public.admission_counselors (institution_id);` |
| admission_payments | `CREATE INDEX idx_admission_payments_institution_id ON public.admission_payments (institution_id);` |
| admission_process_metrics | `CREATE INDEX idx_admission_process_metrics_institution_id ON public.admission_process_metrics (institution_id);` |
| admission_tasks | `CREATE INDEX idx_admission_tasks_institution_id ON public.admission_tasks (institution_id);` |
| admission_workflows | `CREATE INDEX idx_admission_workflows_institution_id ON public.admission_workflows (institution_id);` |
| communication_channels | `CREATE INDEX idx_communication_channels_institution_id ON public.communication_channels (institution_id);` |
| communication_log | `CREATE INDEX idx_communication_log_institution_id ON public.communication_log (institution_id);` |
| contact_phone_lookup | `CREATE INDEX idx_contact_phone_lookup_institution_id ON public.contact_phone_lookup (institution_id);` |
| counselor_daily_metrics | `CREATE INDEX idx_counselor_daily_metrics_institution_id ON public.counselor_daily_metrics (institution_id);` |
| counselor_targets | `CREATE INDEX idx_counselor_targets_institution_id ON public.counselor_targets (institution_id);` |
| distribution_rules | `CREATE INDEX idx_distribution_rules_institution_id ON public.distribution_rules (institution_id);` |
| escalation_log | `CREATE INDEX idx_escalation_log_institution_id ON public.escalation_log (institution_id);` |
| hostel_complaints | `CREATE INDEX idx_hostel_complaints_institution_id ON public.hostel_complaints (institution_id);` |
| hostel_fee_structure | `CREATE INDEX idx_hostel_fee_structure_institution_id ON public.hostel_fee_structure (institution_id);` |
| industry_projects | `CREATE INDEX idx_industry_projects_institution_id ON public.industry_projects (institution_id);` |
| interview_bookings | `CREATE INDEX idx_interview_bookings_institution_id ON public.interview_bookings (institution_id);` |
| learner_core_okrs | `CREATE INDEX idx_learner_core_okrs_institution_id ON public.learner_core_okrs (institution_id);` |
| offer_letters | `CREATE INDEX idx_offer_letters_institution_id ON public.offer_letters (institution_id);` |
| okr_abcd_analysis | `CREATE INDEX idx_okr_abcd_analysis_institution_id ON public.okr_abcd_analysis (institution_id);` |
| outcome_program_correlation | `CREATE INDEX idx_outcome_program_correlation_institution_id ON public.outcome_program_correlation (institution_id);` |
| rejection_feedback | `CREATE INDEX idx_rejection_feedback_institution_id ON public.rejection_feedback (institution_id);` |
| scholarship_applications | `CREATE INDEX idx_scholarship_applications_institution_id ON public.scholarship_applications (institution_id);` |
| scoring_rules | `CREATE INDEX idx_scoring_rules_institution_id ON public.scoring_rules (institution_id);` |
| screening_exams | `CREATE INDEX idx_screening_exams_institution_id ON public.screening_exams (institution_id);` |
| workflow_executions | `CREATE INDEX idx_workflow_executions_institution_id ON public.workflow_executions (institution_id);` |

### Batch SQL (copy-paste ready)

```sql
-- Missing institution_id indexes (25 tables)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_counselors_institution_id ON public.admission_counselors (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_payments_institution_id ON public.admission_payments (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_process_metrics_institution_id ON public.admission_process_metrics (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_tasks_institution_id ON public.admission_tasks (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_workflows_institution_id ON public.admission_workflows (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_channels_institution_id ON public.communication_channels (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_institution_id ON public.communication_log (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contact_phone_lookup_institution_id ON public.contact_phone_lookup (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_daily_metrics_institution_id ON public.counselor_daily_metrics (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_targets_institution_id ON public.counselor_targets (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_distribution_rules_institution_id ON public.distribution_rules (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_institution_id ON public.escalation_log (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_institution_id ON public.hostel_complaints (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_fee_structure_institution_id ON public.hostel_fee_structure (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_industry_projects_institution_id ON public.industry_projects (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_bookings_institution_id ON public.interview_bookings (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_core_okrs_institution_id ON public.learner_core_okrs (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offer_letters_institution_id ON public.offer_letters (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_abcd_analysis_institution_id ON public.okr_abcd_analysis (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outcome_program_correlation_institution_id ON public.outcome_program_correlation (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rejection_feedback_institution_id ON public.rejection_feedback (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarship_applications_institution_id ON public.scholarship_applications (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scoring_rules_institution_id ON public.scoring_rules (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_screening_exams_institution_id ON public.screening_exams (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_institution_id ON public.workflow_executions (institution_id);
```

---

## 2. Unindexed Foreign Keys (198 Issues)

Foreign key columns without covering indexes cause slow JOIN operations and cascade deletes. Grouped by module.

### Admission Module (19 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_applications_learner_profile_id ON public.admission_applications (learner_profile_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_applications_reviewer_id ON public.admission_applications (reviewer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_campaign_logs_created_by ON public.admission_campaign_logs (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_campaign_queue_application_id ON public.admission_campaign_queue (application_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_campaign_queue_parent_queue_id ON public.admission_campaign_queue (parent_queue_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_drip_execution_logs_schedule_id ON public.admission_drip_execution_logs (schedule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_drip_schedule_skipped_by ON public.admission_drip_schedule (skipped_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_drip_sequences_created_by ON public.admission_drip_sequences (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_lead_activities_performed_by ON public.admission_lead_activities (performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_lead_scores_scoring_rule_id ON public.admission_lead_scores (scoring_rule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_lead_stage_history_changed_by ON public.admission_lead_stage_history (changed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_leads_created_by ON public.admission_leads (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_sms_logs_template_id ON public.admission_sms_logs (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_tasks_created_by ON public.admission_tasks (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_tasks_completed_by ON public.admission_tasks (completed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_whatsapp_logs_template_id ON public.admission_whatsapp_logs (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_documents_document_type_id ON public.application_documents (document_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_documents_verified_by ON public.application_documents (verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_workflows_institution_id ON public.admission_workflows (institution_id);
```

### Hostel Module (18 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocation_requests_allocated_bed_id ON public.hostel_allocation_requests (allocated_bed_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocation_requests_allocation_id ON public.hostel_allocation_requests (allocation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocation_requests_preferred_hostel_id ON public.hostel_allocation_requests (preferred_hostel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocation_requests_processed_by ON public.hostel_allocation_requests (processed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocations_approved_by ON public.hostel_allocations (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocations_created_by ON public.hostel_allocations (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocations_hostel_id ON public.hostel_allocations (hostel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_allocations_room_id ON public.hostel_allocations (room_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_attendance_marked_by ON public.hostel_attendance (marked_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_allocation_id ON public.hostel_complaints (allocation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_assigned_to ON public.hostel_complaints (assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_reported_by ON public.hostel_complaints (reported_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_resolved_by ON public.hostel_complaints (resolved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_complaints_room_id ON public.hostel_complaints (room_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_floors_floor_warden_id ON public.hostel_floors (floor_warden_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_wardens_floor_id ON public.hostel_wardens (floor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostel_wardens_warden_id ON public.hostel_wardens (warden_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostels_chief_warden_id ON public.hostels (chief_warden_id);
```

### OKR Module (20 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_check_ins_blocker_assigned_to ON public.okr_check_ins (blocker_assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_compliance_logs_performed_by ON public.okr_compliance_logs (performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_dependencies_objective_id ON public.okr_dependencies (objective_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_dependencies_owner_department_id ON public.okr_dependencies (owner_department_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_dependencies_owner_user_id ON public.okr_dependencies (owner_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_kr_updates_check_in_id ON public.okr_kr_updates (check_in_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_kr_updates_key_result_id ON public.okr_kr_updates (key_result_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_kr_updates_updated_by ON public.okr_kr_updates (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_milestones_key_result_id ON public.okr_milestones (key_result_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_milestones_objective_id ON public.okr_milestones (objective_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_milestones_user_id ON public.okr_milestones (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_objectives_approved_by ON public.okr_objectives (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_objectives_created_by ON public.okr_objectives (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_risks_objective_id ON public.okr_risks (objective_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_risks_owner_id ON public.okr_risks (owner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_tasks_accountable_id ON public.okr_tasks (accountable_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_tasks_key_result_id ON public.okr_tasks (key_result_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_tasks_objective_id ON public.okr_tasks (objective_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_tasks_responsible_id ON public.okr_tasks (responsible_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_okr_user_status_unblocked_by ON public.okr_user_status (unblocked_by);
```

### Billing Module (1 FK missing index)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_copq_incidents_reported_by ON public.billing_copq_incidents (reported_by);
```

### Communication / Escalation (10 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_template_id ON public.communication_log (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communication_log_sent_by ON public.communication_log (sent_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_acknowledged_by ON public.escalation_log (acknowledged_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_escalated_from ON public.escalation_log (escalated_from);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_resolved_by ON public.escalation_log (resolved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_log_rule_id ON public.escalation_log (rule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_rules_created_by ON public.escalation_rules (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_escalation_rules_escalate_to ON public.escalation_rules (escalate_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sla_configurations_escalation_rule_id ON public.sla_configurations (escalation_rule_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_templates_approved_by ON public.message_templates (approved_by);
```

### Learner / Academic Module (15 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_competencies_verified_by ON public.learner_competencies (verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_core_okrs_created_by ON public.learner_core_okrs (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_core_okrs_department_id ON public.learner_core_okrs (department_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_core_okrs_program_id ON public.learner_core_okrs (program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_elective_okrs_approved_by ON public.learner_elective_okrs (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_elective_okrs_learner_id ON public.learner_elective_okrs (learner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_industry_engagements_mentor_id ON public.learner_industry_engagements (mentor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learner_industry_engagements_partner_id ON public.learner_industry_engagements (partner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learners_profiles_created_by ON public.learners_profiles (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_learners_profiles_updated_by ON public.learners_profiles (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_competency_catalog_created_by ON public.competency_catalog (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_competency_program_mapping_created_by ON public.competency_program_mapping (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_competency_program_mapping_semester_expected ON public.competency_program_mapping (semester_expected);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_course_competency_mapping_created_by ON public.course_competency_mapping (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leave_approvals_approval_chain_id ON public.leave_approvals (approval_chain_id);
```

### LTI Module (7 FKs missing indexes)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_grades_tool_id ON public.lti_grades (tool_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_launches_program_id ON public.lti_launches (program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_launches_section_id ON public.lti_launches (section_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_launches_semester_id ON public.lti_launches (semester_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_launches_created_by ON public.lti_launches (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_launches_academic_year_id ON public.lti_launches (academic_year_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_tools_created_by ON public.lti_tools (created_by);
```

### Remaining Tables (assorted modules)

```sql
-- Consultant module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consultant_lead_attributions_commission_structure_id ON public.consultant_lead_attributions (commission_structure_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consultant_payment_queries_payout_batch_id ON public.consultant_payment_queries (payout_batch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consultant_payment_queries_transaction_id ON public.consultant_payment_queries (transaction_id);

-- Counselor module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_activities_lead_id ON public.counselor_activities (lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_counselor_targets_counselor_id ON public.counselor_targets (counselor_id);

-- Grievance module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grievance_history_performed_by ON public.grievance_history (performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grievance_tickets_resolved_by ON public.grievance_tickets (resolved_by);

-- Maturity module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_assessments_created_by ON public.maturity_assessments (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_assessments_reviewed_by ON public.maturity_assessments (reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_assessments_updated_by ON public.maturity_assessments (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_evidence_created_by ON public.maturity_evidence (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_frameworks_created_by ON public.maturity_frameworks (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_frameworks_updated_by ON public.maturity_frameworks (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_progress_created_by ON public.maturity_progress (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maturity_progress_updated_by ON public.maturity_progress (updated_by);

-- Parent module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_communications_learner_id ON public.parent_communications (learner_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_communications_sender_id ON public.parent_communications (sender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_parent_learner_links_verified_by ON public.parent_learner_links (verified_by);

-- Process module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_process_audits_auditor_id ON public.process_audits (auditor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_process_definitions_created_by ON public.process_definitions (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_process_definitions_updated_by ON public.process_definitions (updated_by);

-- Lateral entry
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lateral_entry_applications_admission_id ON public.lateral_entry_applications (admission_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lateral_entry_applications_reviewed_by ON public.lateral_entry_applications (reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lateral_entry_applications_student_id ON public.lateral_entry_applications (student_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lateral_entry_documents_verified_by ON public.lateral_entry_documents (verified_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lateral_entry_eligibility_rules_created_by ON public.lateral_entry_eligibility_rules (created_by);

-- Other
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_child_app_access_logs_session_id ON public.child_app_access_logs (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_child_app_auth_codes_user_id ON public.child_app_auth_codes (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_child_app_sessions_revoked_by ON public.child_app_sessions (revoked_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_distribution_rules_created_by ON public.distribution_rules (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hostels_created_by ON public.hostels (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_industry_projects_mentor_id ON public.industry_projects (mentor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_leaves_academic_year_id ON public.institution_leaves (academic_year_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institution_leaves_approved_by ON public.institution_leaves (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_bookings_booked_by ON public.interview_bookings (booked_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_slots_created_by ON public.interview_slots (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_activity_log_performed_by ON public.lead_activity_log (performed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_stage_history_changed_by ON public.lead_stage_history (changed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lti_tools_updated_by ON public.lti_tools (updated_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_merit_lists_created_by ON public.merit_lists (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_templates_created_by ON public.message_templates (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nps_surveys_created_by ON public.nps_surveys (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_offer_letters_created_by ON public.offer_letters (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_re_engagement_campaigns_created_by ON public.re_engagement_campaigns (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referral_rewards_attribution_id ON public.referral_rewards (attribution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referral_rewards_reward_config_id ON public.referral_rewards (reward_config_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registered_child_apps_created_by ON public.registered_child_apps (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rejection_feedback_collected_by ON public.rejection_feedback (collected_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rejection_feedback_follow_up_by ON public.rejection_feedback (follow_up_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rejection_feedback_offer_id ON public.rejection_feedback (offer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scholarship_applications_reviewed_by ON public.scholarship_applications (reviewed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scoring_rules_created_by ON public.scoring_rules (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_child_app_permissions_child_app_id ON public.user_child_app_permissions (child_app_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_child_app_permissions_granted_by ON public.user_child_app_permissions (granted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vac_learner_progress_lesson_id ON public.vac_learner_progress (lesson_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waste_incidents_reported_by ON public.waste_incidents (reported_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_waste_incidents_resolved_by ON public.waste_incidents (resolved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_connections_connected_by ON public.whatsapp_connections (connected_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_shared_access_granted_by ON public.whatsapp_shared_access (granted_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_templates_created_by ON public.whatsapp_templates (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_executions_institution_id ON public.workflow_executions (institution_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_created_by ON public.workflows (created_by);

-- SH module
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_bug_reports_reported_by ON public.sh_bug_reports (reported_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_builder_assignments_approved_by ON public.sh_builder_assignments (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_builder_skills_assessed_by ON public.sh_builder_skills (assessed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_client_communications_created_by ON public.sh_client_communications (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_cohort_assignments_approved_by ON public.sh_cohort_assignments (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_content_orders_created_by ON public.sh_content_orders (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_discovery_visits_created_by ON public.sh_discovery_visits (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_discovery_visits_department_id ON public.sh_discovery_visits (department_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_earnings_ledger_approved_by ON public.sh_earnings_ledger (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_implementation_users_trained_by ON public.sh_implementation_users (trained_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_jicate_sessions_booked_by_user_id ON public.sh_jicate_sessions (booked_by_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_payments_created_by ON public.sh_payments (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_payments_mou_id ON public.sh_payments (mou_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_payments_split_model_id ON public.sh_payments (split_model_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_phase_deployments_deployed_by ON public.sh_phase_deployments (deployed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_production_assignments_approved_by ON public.sh_production_assignments (approved_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_prototype_iterations_created_by ON public.sh_prototype_iterations (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_publications_created_by ON public.sh_publications (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_revenue_split_models_created_by ON public.sh_revenue_split_models (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_solution_mous_created_by ON public.sh_solution_mous (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_solutions_created_by ON public.sh_solutions (created_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sh_training_programs_created_by ON public.sh_training_programs (created_by);
```

---

## 3. Duplicate Indexes (10 Issues -- Drop One From Each Pair)

These are identical indexes wasting storage and slowing writes.

```sql
-- admission_daily_briefings: keep idx_daily_briefings_user_briefing_date (more specific)
DROP INDEX CONCURRENTLY IF EXISTS idx_daily_briefings_user;

-- admission_lead_scores: keep idx_lead_scores_total_score
DROP INDEX CONCURRENTLY IF EXISTS idx_lead_scores_total;

-- applications: keep applications_name_unique
DROP INDEX CONCURRENTLY IF EXISTS applications_name_key;

-- billing_student_bills: keep idx_billing_student_bills_student_id
DROP INDEX CONCURRENTLY IF EXISTS idx_billing_bills_student_id;

-- degrees: keep idx_degrees_institution_id
DROP INDEX CONCURRENTLY IF EXISTS idx_degrees_institution;

-- departments: keep departments_institution_id_idx
DROP INDEX CONCURRENTLY IF EXISTS idx_departments_institution;

-- programs: keep programs_institution_id_idx
DROP INDEX CONCURRENTLY IF EXISTS idx_programs_institution;

-- staff: keep idx_staff_auth_user_id
DROP INDEX CONCURRENTLY IF EXISTS idx_staff_auth_user;

-- students: keep idx_students_institution_id
DROP INDEX CONCURRENTLY IF EXISTS idx_students_institution;

-- user_institution_access: keep unique_user_institution_access
DROP INDEX CONCURRENTLY IF EXISTS uk_user_institution_access_user_institution;
```

---

## 4. Tables Without Primary Key (5 Issues)

All are backup tables. Low priority but noted for completeness.

| Table | Notes |
|-------|-------|
| students_backup_20251223 | Backup table -- consider dropping if no longer needed |
| profiles_backup_bpharm_sem8_active | Backup table |
| learners_profiles_backup_bpharm_sem8_active | Backup table |
| student_attendance_backup_20251223 | Backup table |
| learners_profiles_backup_20251223 | Backup table |

**Recommendation:** If these backups are no longer needed (data has been verified), drop them to free storage and reduce advisory noise.

```sql
-- Only run after confirming backups are no longer needed
-- DROP TABLE IF EXISTS public.students_backup_20251223;
-- DROP TABLE IF EXISTS public.profiles_backup_bpharm_sem8_active;
-- DROP TABLE IF EXISTS public.learners_profiles_backup_bpharm_sem8_active;
-- DROP TABLE IF EXISTS public.student_attendance_backup_20251223;
-- DROP TABLE IF EXISTS public.learners_profiles_backup_20251223;
```

---

## 5. RLS Policy InitPlan Issues (416 across 176 tables)

RLS policies using `auth.uid()`, `auth.role()`, or `current_setting()` directly cause per-row re-evaluation. Wrapping in `(SELECT ...)` makes them evaluate once per query.

**Top affected tables:**

| Table | Policies Affected |
|-------|-------------------|
| student_attendance | 7 |
| okr_objectives | 7 |
| grievance_tickets | 7 |
| course_mappings | 6 |
| timetables | 6 |
| admission_daily_briefings | 6 |
| periods | 5 |
| learners_profiles | 5 |
| okr_key_results | 5 |
| whatsapp_message_logs | 5 |

**Fix pattern (apply to all 416 policies):**

```sql
-- BEFORE (slow -- re-evaluates per row):
CREATE POLICY "example_policy" ON public.some_table
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- AFTER (fast -- evaluates once):
CREATE POLICY "example_policy" ON public.some_table
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = (SELECT auth.uid())
  ));
```

**This is the single highest-impact performance fix.** Every query on these 176 tables pays the cost of re-evaluating auth functions per row.

---

## 6. Multiple Permissive Policies (748 across 114 tables)

When multiple permissive policies exist for the same role+action, PostgreSQL evaluates ALL of them with OR logic. This is slower than a single policy.

**Recommendation:** For each table, combine permissive policies for the same role+action into a single policy using OR conditions.

**Tables with most overlap (sample):**

| Table | Issue |
|-------|-------|
| admission_applications | Multiple SELECT policies for anon role |
| okr_objectives | Multiple SELECT/UPDATE policies |
| student_attendance | Multiple SELECT policies |
| learners_profiles | Multiple SELECT policies |
| billing_student_bills | Multiple SELECT policies |

**Fix pattern:**

```sql
-- BEFORE: Two separate policies
CREATE POLICY "policy_a" ON table FOR SELECT USING (condition_a);
CREATE POLICY "policy_b" ON table FOR SELECT USING (condition_b);

-- AFTER: Single combined policy
CREATE POLICY "combined_select" ON table FOR SELECT
  USING (condition_a OR condition_b);
```

---

## 7. Unused Indexes (814 Total)

**Top tables with most unused indexes:**

| Table | Unused Indexes |
|-------|----------------|
| student_attendance | 18 |
| learners_profiles | 18 |
| timetables | 17 |
| applications | 12 |
| user_activity_logs | 10 |
| education_consultants | 10 |
| sh_publications | 10 |
| staff | 9 |
| resources | 9 |
| sh_payments | 9 |
| sh_earnings_ledger | 9 |
| lti_launches | 8 |
| payment_transactions | 8 |
| admission_lead_scores | 8 |
| admission_whatsapp_logs | 8 |

**Important note:** This is a staging database with minimal data (largest table has 391 rows). Unused indexes may simply reflect features not yet tested at scale. Do NOT drop these without verifying against production query patterns.

**Recommendation:** Review after production has been running for 30+ days. Only drop indexes confirmed unused in production.

---

## 8. Auth DB Connection Strategy (1 Issue)

The Auth server is configured with an absolute connection limit of 10. Switching to percentage-based allocation would auto-scale with instance size upgrades.

**Fix:** In Supabase Dashboard > Settings > Auth > Connection Pool, change from absolute (10) to percentage-based.

---

## Current Table Sizes (Staging)

For context, the staging database has very small tables:

| Table | Rows | Size |
|-------|------|------|
| sections | 391 | 400 kB |
| semesters | 347 | 336 kB |
| programs | 94 | 224 kB |
| departments | 79 | 160 kB |
| admission_leads | 55 | 272 kB |
| batches | 49 | 72 kB |
| profiles | 23 | 216 kB |
| degrees | 19 | 104 kB |
| institutions | 11 | 80 kB |
| billing_student_bills | 10 | 160 kB |

**Note:** With these small row counts, performance issues will not be noticeable yet. These fixes are preventive for production scale.

---

## Priority Action Plan

### Phase 1 -- Immediate (prevents issues at scale)
1. Add 25 missing `institution_id` indexes
2. Fix 416 RLS InitPlan policies (wrap `auth.*()` in `(SELECT ...)`)
3. Drop 10 duplicate indexes

### Phase 2 -- Soon (improves JOIN performance)
4. Add indexes on 198 unindexed foreign keys
5. Combine multiple permissive policies into single policies per role+action

### Phase 3 -- Maintenance (cleanup)
6. Consider dropping backup tables (5 without PKs)
7. Switch Auth connection strategy to percentage-based
8. Review unused indexes after 30 days of production usage

---

## Total Index Statements Generated

| Category | Count |
|----------|-------|
| Missing institution_id indexes | 25 |
| Missing FK indexes | ~170 (deduplicated from 198) |
| Duplicate indexes to drop | 10 |
| **Total SQL statements** | **~205** |

All CREATE INDEX statements use `CONCURRENTLY` to avoid locking tables during creation.
All statements use `IF NOT EXISTS` for idempotent execution.

---

*Report generated: 2026-02-08 by automated Supabase performance audit*
*Remediation link: https://supabase.com/docs/guides/database/database-linter*
