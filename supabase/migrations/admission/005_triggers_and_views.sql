-- ============================================================================
-- ADMISSION MODULE: TRIGGERS & VIEWS
-- Generated from live database schema - 2026-02-25
-- ============================================================================

-- ============================================================================
-- TRIGGERS ON admission_leads
-- ============================================================================

-- Auto-compute score_category
CREATE TRIGGER trg_sync_score_category
  BEFORE INSERT OR UPDATE OF score, is_hot_lead ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_score_category();

-- Track stage transitions → insert into stage_history
CREATE TRIGGER trg_track_stage_transition
  BEFORE UPDATE OF funnel_stage ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION track_lead_stage_transition();

-- Log counselor activity on assignment/stage changes
CREATE TRIGGER trigger_log_counselor_activity
  AFTER INSERT OR UPDATE OF assigned_counselor_id, funnel_stage ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION log_counselor_activity();

-- Auto-trigger workflows on lead creation
CREATE TRIGGER trigger_lead_created_workflows
  AFTER INSERT ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION auto_trigger_lead_workflows();

-- Auto-trigger workflows on stage change
CREATE TRIGGER trigger_lead_stage_changed_workflows
  AFTER UPDATE OF funnel_stage ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION auto_trigger_stage_change_workflows();

-- COPQ: Log incident when hot lead is lost
CREATE TRIGGER trg_admission_copq_lead_lost
  AFTER UPDATE OF is_lost ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION log_admission_copq_on_lead_lost();

-- NPS: Schedule survey after enrollment
CREATE TRIGGER trg_admission_nps_enrollment
  AFTER UPDATE OF funnel_stage ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION schedule_admission_nps();

-- Updated_at
CREATE TRIGGER trg_admission_leads_updated
  BEFORE UPDATE ON admission_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS ON admission_applications
-- ============================================================================

-- Auto-generate application number
CREATE TRIGGER trigger_generate_app_number
  BEFORE INSERT ON admission_applications
  FOR EACH ROW EXECUTE FUNCTION generate_application_number();

-- Sync lead stage from application status
CREATE TRIGGER trigger_sync_lead_stage
  AFTER UPDATE OF status ON admission_applications
  FOR EACH ROW EXECUTE FUNCTION sync_lead_stage_from_application();

-- Updated_at
CREATE TRIGGER trg_applications_updated
  BEFORE UPDATE ON admission_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS ON other admission tables (updated_at)
-- ============================================================================

CREATE TRIGGER trg_lead_scores_updated
  BEFORE UPDATE ON admission_lead_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_assignment_rules_updated
  BEFORE UPDATE ON admission_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_communication_templates_updated
  BEFORE UPDATE ON admission_communication_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_workflow_configs_updated
  BEFORE UPDATE ON admission_workflow_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_workflows_updated
  BEFORE UPDATE ON admission_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_daily_briefings_updated
  BEFORE UPDATE ON admission_daily_briefings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_call_logs_updated
  BEFORE UPDATE ON admission_call_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_sms_logs_updated
  BEFORE UPDATE ON admission_sms_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_whatsapp_logs_updated
  BEFORE UPDATE ON admission_whatsapp_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_email_logs_updated
  BEFORE UPDATE ON admission_email_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_campaign_queue_updated
  BEFORE UPDATE ON admission_campaign_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_drip_sequences_updated
  BEFORE UPDATE ON admission_drip_sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_drip_schedule_updated
  BEFORE UPDATE ON admission_drip_schedule
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_tasks_updated
  BEFORE UPDATE ON admission_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_admissions_updated
  BEFORE UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGERS ON consultant tables
-- ============================================================================

-- Auto-generate transaction number
CREATE TRIGGER trg_set_transaction_number
  BEFORE INSERT ON consultant_commission_transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_transaction_number();

-- Update commission totals on education_consultants
CREATE TRIGGER trg_update_consultant_commission_totals
  AFTER INSERT OR UPDATE OR DELETE ON consultant_commission_transactions
  FOR EACH ROW EXECUTE FUNCTION update_consultant_commission_totals();

-- Auto-generate batch number
CREATE TRIGGER trg_set_batch_number
  BEFORE INSERT ON consultant_payout_batches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_batch_number();

-- Auto-generate query number
CREATE TRIGGER trg_set_query_number
  BEFORE INSERT ON consultant_payment_queries
  FOR EACH ROW EXECUTE FUNCTION trigger_set_query_number();

-- Update lead stats on attribution changes
CREATE TRIGGER trg_update_consultant_lead_stats
  AFTER INSERT OR DELETE ON consultant_lead_attributions
  FOR EACH ROW EXECUTE FUNCTION update_consultant_stats();

-- Updated_at triggers for all consultant tables
CREATE TRIGGER trg_commission_structures_updated
  BEFORE UPDATE ON consultant_commission_structures
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_commission_transactions_updated
  BEFORE UPDATE ON consultant_commission_transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_payout_batches_updated
  BEFORE UPDATE ON consultant_payout_batches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_communications_updated
  BEFORE UPDATE ON consultant_communications
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_documents_updated
  BEFORE UPDATE ON consultant_documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_payment_queries_updated
  BEFORE UPDATE ON consultant_payment_queries
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_lead_attributions_updated
  BEFORE UPDATE ON consultant_lead_attributions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================================
-- VIEW: admission_process_metrics
-- ============================================================================
CREATE OR REPLACE VIEW admission_process_metrics AS
WITH lead_cycle AS (
  SELECT
    l.id AS lead_id,
    l.institution_id,
    l.counselor_id,
    l.funnel_stage,
    l.is_lost,
    l.is_hot_lead,
    l.created_at AS lead_created_at,
    (SELECT MIN(a.created_at) FROM admission_lead_activities a
     WHERE a.lead_id = l.id AND a.activity_type IN ('call','email','whatsapp','meeting')
    ) AS first_contact_at,
    (SELECT h.created_at FROM admission_lead_stage_history h
     WHERE h.lead_id = l.id AND h.to_stage = 'enrolled'
     ORDER BY h.created_at DESC LIMIT 1
    ) AS enrolled_at
  FROM admission_leads l
  WHERE l.created_at >= date_trunc('month', CURRENT_DATE - interval '6 months')
)
SELECT
  institution_id,
  date_trunc('month', lead_created_at)::date AS month,
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') AS enrolled_count,
  ROUND(AVG(EXTRACT(epoch FROM (enrolled_at - lead_created_at)) / 3600) FILTER (WHERE enrolled_at IS NOT NULL)) AS avg_cycle_time_hours,
  ROUND(AVG(EXTRACT(epoch FROM (first_contact_at - lead_created_at)) / 3600) FILTER (WHERE first_contact_at IS NOT NULL)) AS avg_first_response_hours,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE first_contact_at IS NOT NULL AND EXTRACT(epoch FROM (first_contact_at - lead_created_at)) / 3600 <= 24)
    / NULLIF(COUNT(*), 0)
  ) AS first_contact_sla_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_lost = true) / NULLIF(COUNT(*), 0)) AS lost_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') / NULLIF(COUNT(*), 0)) AS conversion_rate_pct
FROM lead_cycle
GROUP BY institution_id, date_trunc('month', lead_created_at)
ORDER BY month DESC;
