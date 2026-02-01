-- Migration: Add Performance Indexes
-- Created: 2026-02-01
-- Purpose: Add indexes to prevent slow queries and N+1 problems on new modules
-- CRITICAL: These indexes prevent DoS via slow queries on large datasets

-- ============================================================================
-- STAKEHOLDER NPS INDEXES
-- ============================================================================

-- Survey queries (institution + status filtering is most common)
CREATE INDEX IF NOT EXISTS idx_nps_surveys_institution_status
  ON nps_surveys(institution_id, status)
  WHERE status IS NOT NULL;

-- Survey queries with stakeholder type filtering
CREATE INDEX IF NOT EXISTS idx_nps_surveys_institution_stakeholder_type
  ON nps_surveys(institution_id, stakeholder_type);

-- Survey queries with date range filtering
CREATE INDEX IF NOT EXISTS idx_nps_surveys_dates
  ON nps_surveys(institution_id, start_date DESC, end_date DESC);

-- Active surveys lookup (public response submission)
CREATE INDEX IF NOT EXISTS idx_nps_surveys_active
  ON nps_surveys(institution_id, stakeholder_type, status)
  WHERE status = 'active';

-- Response queries by survey (most common - counting responses)
CREATE INDEX IF NOT EXISTS idx_nps_responses_survey_created
  ON nps_responses(survey_id, submitted_at DESC);

-- Response queries by category (NPS score filtering)
CREATE INDEX IF NOT EXISTS idx_nps_responses_survey_category
  ON nps_responses(survey_id, nps_category);

-- Response queries by respondent (my responses)
CREATE INDEX IF NOT EXISTS idx_nps_responses_respondent
  ON nps_responses(respondent_id, submitted_at DESC)
  WHERE respondent_id IS NOT NULL;

-- Response search by email/name
CREATE INDEX IF NOT EXISTS idx_nps_responses_email
  ON nps_responses(respondent_email)
  WHERE respondent_email IS NOT NULL;

-- Analytics queries by institution and period
CREATE INDEX IF NOT EXISTS idx_nps_analytics_institution_period
  ON nps_analytics(institution_id, period_start DESC, period_end DESC);

-- Analytics queries by stakeholder type
CREATE INDEX IF NOT EXISTS idx_nps_analytics_stakeholder
  ON nps_analytics(institution_id, stakeholder_type, period_start DESC);

-- ============================================================================
-- PARENT PORTAL INDEXES
-- ============================================================================

-- Parent profile lookups by institution
CREATE INDEX IF NOT EXISTS idx_parent_profiles_institution
  ON parent_profiles(institution_id, created_at DESC);

-- Parent profile lookups by user (login)
CREATE INDEX IF NOT EXISTS idx_parent_profiles_user
  ON parent_profiles(user_id)
  WHERE user_id IS NOT NULL;

-- Parent profile search by phone/email
CREATE INDEX IF NOT EXISTS idx_parent_profiles_phone
  ON parent_profiles(phone_number)
  WHERE phone_number IS NOT NULL;

-- Learner links by parent (most common - show all children)
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_parent
  ON parent_learner_links(parent_id, created_at DESC);

-- Learner links by learner (reverse lookup)
CREATE INDEX IF NOT EXISTS idx_parent_learner_links_learner
  ON parent_learner_links(learner_id);

-- Communication queries by parent
CREATE INDEX IF NOT EXISTS idx_parent_communications_parent_created
  ON parent_communications(parent_id, created_at DESC);

-- Communication queries by status (unread notifications)
CREATE INDEX IF NOT EXISTS idx_parent_communications_parent_status
  ON parent_communications(parent_id, status)
  WHERE status != 'read';

-- OTP verification lookups
CREATE INDEX IF NOT EXISTS idx_parent_otps_phone
  ON parent_otps(phone_number, created_at DESC)
  WHERE verified_at IS NULL AND expires_at > NOW();

-- ============================================================================
-- GRIEVANCE INDEXES
-- ============================================================================

-- Ticket queries by institution and status (dashboard)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_institution_status
  ON grievance_tickets(institution_id, status, created_at DESC);

-- Ticket queries by assigned user (my tickets)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_assigned
  ON grievance_tickets(assigned_to, status, created_at DESC)
  WHERE assigned_to IS NOT NULL;

-- Ticket queries by raised by (my complaints)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_raised_by
  ON grievance_tickets(raised_by_id, created_at DESC);

-- Ticket number lookup (unique tracking)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_ticket_number
  ON grievance_tickets(ticket_number);

-- SLA monitoring (at-risk and breached tickets)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_sla
  ON grievance_tickets(institution_id, sla_status, sla_deadline)
  WHERE status NOT IN ('resolved', 'closed');

-- Category-based filtering
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_category
  ON grievance_tickets(category_id, status, created_at DESC);

-- Priority-based filtering
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_priority
  ON grievance_tickets(institution_id, priority, status);

-- Search optimization (composite for common filters)
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_search
  ON grievance_tickets(institution_id, status, priority, created_at DESC);

-- Comments by ticket (conversation thread)
CREATE INDEX IF NOT EXISTS idx_grievance_comments_ticket
  ON grievance_comments(ticket_id, created_at ASC);

-- History by ticket (audit trail)
CREATE INDEX IF NOT EXISTS idx_grievance_history_ticket
  ON grievance_history(ticket_id, performed_at DESC);

-- Category tree queries
CREATE INDEX IF NOT EXISTS idx_grievance_categories_parent
  ON grievance_categories(parent_id, sort_order)
  WHERE parent_id IS NOT NULL;

-- ============================================================================
-- MATURITY ASSESSMENT INDEXES
-- ============================================================================

-- Assessment queries by institution
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_institution
  ON maturity_assessments(institution_id, assessment_date DESC);

-- Assessment queries by status
CREATE INDEX IF NOT EXISTS idx_maturity_assessments_status
  ON maturity_assessments(institution_id, status, assessment_date DESC);

-- Progress tracking by assessment
CREATE INDEX IF NOT EXISTS idx_maturity_progress_assessment
  ON maturity_progress(assessment_id, domain);

-- Progress tracking by status
CREATE INDEX IF NOT EXISTS idx_maturity_progress_status
  ON maturity_progress(assessment_id, status);

-- ============================================================================
-- BILLING COPQ INDEXES
-- ============================================================================

-- Incident queries by institution and date (dashboard)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_institution_date
  ON billing_copq_incidents(institution_id, incident_date DESC);

-- Incident queries by status
CREATE INDEX IF NOT EXISTS idx_copq_incidents_status
  ON billing_copq_incidents(status, institution_id);

-- Incident queries by category (COPQ breakdown)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_category
  ON billing_copq_incidents(category, institution_id);

-- Top incidents by cost (dashboard widget)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_visible_cost
  ON billing_copq_incidents(institution_id, visible_cost DESC)
  WHERE visible_cost > 0;

-- Incident queries by bill (linking to billing)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_bill
  ON billing_copq_incidents(bill_id)
  WHERE bill_id IS NOT NULL;

-- Incident queries by learner (student-specific)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_learner
  ON billing_copq_incidents(learner_id)
  WHERE learner_id IS NOT NULL;

-- Dashboard composite index (most common query)
CREATE INDEX IF NOT EXISTS idx_copq_incidents_dashboard
  ON billing_copq_incidents(institution_id, category, status, incident_date DESC);

-- ============================================================================
-- PROCESS EXCELLENCE INDEXES
-- ============================================================================

-- Process definition lookups by institution
CREATE INDEX IF NOT EXISTS idx_process_definitions_institution
  ON process_definitions(institution_id, is_active, category);

-- Process definition category filtering
CREATE INDEX IF NOT EXISTS idx_process_definitions_category
  ON process_definitions(category)
  WHERE is_active = true;

-- Process instance queries by definition (tracking all runs)
CREATE INDEX IF NOT EXISTS idx_process_instances_definition
  ON process_instances(definition_id, started_at DESC);

-- Process instance queries by reference (link to business objects)
CREATE INDEX IF NOT EXISTS idx_process_instances_reference
  ON process_instances(reference_type, reference_id);

-- Active process instances (in-progress tracking)
CREATE INDEX IF NOT EXISTS idx_process_instances_active
  ON process_instances(definition_id, current_stage, sla_status)
  WHERE completed_at IS NULL;

-- Completed instances for analytics
CREATE INDEX IF NOT EXISTS idx_process_instances_completed
  ON process_instances(definition_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- SLA monitoring
CREATE INDEX IF NOT EXISTS idx_process_instances_sla
  ON process_instances(definition_id, sla_status)
  WHERE completed_at IS NULL;

-- Waste incident queries by institution
CREATE INDEX IF NOT EXISTS idx_process_waste_institution_category
  ON process_waste(institution_id, waste_category, reported_at DESC);

-- Waste incident queries by process
CREATE INDEX IF NOT EXISTS idx_process_waste_process
  ON process_waste(process_id, status, reported_at DESC);

-- Waste incident queries by instance (specific run)
CREATE INDEX IF NOT EXISTS idx_process_waste_instance
  ON process_waste(instance_id, created_at DESC)
  WHERE instance_id IS NOT NULL;

-- Waste incident queries by status (open incidents)
CREATE INDEX IF NOT EXISTS idx_process_waste_status
  ON process_waste(institution_id, status)
  WHERE status = 'open';

-- Waste analytics composite
CREATE INDEX IF NOT EXISTS idx_process_waste_analytics
  ON process_waste(institution_id, waste_category, status, reported_at DESC);

-- Process audit queries by institution
CREATE INDEX IF NOT EXISTS idx_process_audits_institution_date
  ON process_audits(institution_id, audit_date DESC);

-- Process audit queries by process
CREATE INDEX IF NOT EXISTS idx_process_audits_process
  ON process_audits(process_id, status, audit_date DESC);

-- Process audit queries by auditor
CREATE INDEX IF NOT EXISTS idx_process_audits_auditor
  ON process_audits(auditor_id, audit_date DESC)
  WHERE auditor_id IS NOT NULL;

-- ============================================================================
-- OKR ABCD MATRIX INDEXES (Extension)
-- ============================================================================

-- OKR key result process rating queries
CREATE INDEX IF NOT EXISTS idx_okr_key_results_process_rating
  ON okr_key_results(objective_id, process_rating, abcd_category)
  WHERE process_rating IS NOT NULL;

-- ABCD distribution queries by objective
CREATE INDEX IF NOT EXISTS idx_okr_key_results_abcd
  ON okr_key_results(objective_id, abcd_category)
  WHERE abcd_category IS NOT NULL;

-- ============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- NPS dashboard: institution + stakeholder + date range
CREATE INDEX IF NOT EXISTS idx_nps_dashboard_composite
  ON nps_surveys(institution_id, stakeholder_type, status, start_date DESC, end_date DESC);

-- Grievance SLA report: institution + status + SLA
CREATE INDEX IF NOT EXISTS idx_grievance_sla_report
  ON grievance_tickets(institution_id, status, sla_status, created_at DESC, resolved_at DESC);

-- Process excellence dashboard: institution + category + completion
CREATE INDEX IF NOT EXISTS idx_process_excellence_dashboard
  ON process_instances(definition_id, sla_status, completed_at DESC, started_at DESC);

-- COPQ trend analysis: institution + category + date + status
CREATE INDEX IF NOT EXISTS idx_copq_trend_analysis
  ON billing_copq_incidents(institution_id, category, incident_date DESC, status);

-- ============================================================================
-- ANALYZE TABLES FOR QUERY OPTIMIZER
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE nps_surveys;
ANALYZE nps_responses;
ANALYZE nps_analytics;
ANALYZE parent_profiles;
ANALYZE parent_learner_links;
ANALYZE parent_communications;
ANALYZE grievance_tickets;
ANALYZE grievance_comments;
ANALYZE grievance_history;
ANALYZE maturity_assessments;
ANALYZE maturity_progress;
ANALYZE billing_copq_incidents;
ANALYZE process_definitions;
ANALYZE process_instances;
ANALYZE process_waste;
ANALYZE process_audits;
ANALYZE okr_key_results;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify indexes were created (uncomment to check)
-- SELECT schemaname, tablename, indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
