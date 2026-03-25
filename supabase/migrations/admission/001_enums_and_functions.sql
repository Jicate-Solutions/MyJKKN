-- ============================================================================
-- ADMISSION MODULE: ENUMS & FUNCTIONS
-- Generated from live database schema - 2026-02-25
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE admission_lead_stage AS ENUM (
    'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
    'engaged', 'qualified', 'application_started', 'application_submitted',
    'documents_pending', 'documents_verified', 'interview_scheduled',
    'interview_completed', 'offer_sent', 'offer_accepted', 'token_paid',
    'applied', 'interviewed', 'offered', 'enrolled', 'lost', 'dormant'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'draft', 'submitted', 'under_review', 'documents_pending',
    'interview_scheduled', 'interviewed', 'approved', 'waitlisted',
    'rejected', 'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE admission_payment_type AS ENUM (
    'application_fee', 'token_fee', 'full_fee', 'hostel_fee', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE admission_insight_type AS ENUM (
    'follow_up_reminder', 'conversion_opportunity', 'engagement_alert',
    'trend_insight', 'anomaly_detection', 'recommendation', 'performance_insight'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE admission_insight_priority AS ENUM (
    'critical', 'high', 'medium', 'low'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE admission_insight_action AS ENUM (
    'contact_lead', 'schedule_followup', 'send_campaign', 'assign_counselor',
    'review_leads', 'update_strategy', 'view_report', 'no_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_step_type AS ENUM (
    'send_sms', 'send_email', 'send_whatsapp', 'update_stage',
    'assign_counselor', 'add_tag', 'wait', 'wait_hours', 'wait_days'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_step_status AS ENUM (
    'pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE communication_channel_type AS ENUM (
    'whatsapp', 'sms', 'email', 'voice', 'push'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sms_delivery_status AS ENUM (
    'pending', 'queued', 'sent', 'delivered', 'failed', 'undelivered', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sms_provider AS ENUM ('msg91', 'twilio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_delivery_status AS ENUM (
    'pending', 'sent', 'delivered', 'read', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE drip_sequence_status AS ENUM (
    'active', 'paused', 'completed', 'cancelled', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE drip_step_status AS ENUM (
    'pending', 'scheduled', 'executing', 'completed', 'skipped', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM (
    'follow_up_call', 'send_document', 'schedule_interview',
    'verify_documents', 'collect_payment', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'pending', 'in_progress', 'completed', 'overdue', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lead_ownership_mode AS ENUM (
    'permanent', 'flexible', 'stage_based', 'pool'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workflow_trigger_type AS ENUM (
    'lead.created', 'lead.stage_changed', 'lead.score_changed', 'lead.assigned',
    'message.sent', 'message.delivered', 'message.read', 'message.replied',
    'task.created', 'task.completed', 'task.overdue',
    'application.started', 'application.submitted',
    'document.uploaded', 'payment.received', 'interview.scheduled', 'schedule'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consultant_status AS ENUM ('draft', 'active', 'inactive', 'blacklisted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consultant_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum', 'diamond');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consultant_type AS ENUM ('external', 'student', 'alumni');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Helper: Get current user's institution_id
CREATE OR REPLACE FUNCTION auth_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- Helper: Update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Also create alternate names used by various tables
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Score category auto-computation
CREATE OR REPLACE FUNCTION sync_lead_score_category()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_hot_lead = true THEN
    NEW.score_category := 'hot';
  ELSIF NEW.score >= 70 THEN
    NEW.score_category := 'hot';
  ELSIF NEW.score >= 40 THEN
    NEW.score_category := 'warm';
  ELSIF NEW.score > 0 THEN
    NEW.score_category := 'cold';
  ELSE
    NEW.score_category := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Track stage transitions
CREATE OR REPLACE FUNCTION track_lead_stage_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.funnel_stage IS DISTINCT FROM NEW.funnel_stage THEN
    INSERT INTO admission_lead_stage_history (lead_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.funnel_stage, NEW.funnel_stage, auth.uid());
    NEW.stage_changed_at := now();
    NEW.previous_stage := OLD.stage;
  END IF;
  RETURN NEW;
END;
$$;

-- Sync lead stage from application status change
CREATE OR REPLACE FUNCTION sync_lead_stage_from_application()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status::text
      WHEN 'submitted' THEN
        UPDATE admission_leads SET funnel_stage = 'application_submitted' WHERE id = NEW.lead_id;
      WHEN 'under_review' THEN
        UPDATE admission_leads SET funnel_stage = 'application_submitted' WHERE id = NEW.lead_id;
      WHEN 'documents_pending' THEN
        UPDATE admission_leads SET funnel_stage = 'documents_pending' WHERE id = NEW.lead_id;
      WHEN 'approved' THEN
        UPDATE admission_leads SET funnel_stage = 'offer_sent' WHERE id = NEW.lead_id;
      WHEN 'rejected' THEN
        UPDATE admission_leads SET funnel_stage = 'lost', is_lost = true, lost_reason = 'Application rejected', lost_at = now() WHERE id = NEW.lead_id;
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

-- Auto-generate application number (JKKNYY000001 format)
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  year_suffix TEXT;
  next_seq INTEGER;
BEGIN
  IF NEW.application_number IS NULL THEN
    year_suffix := to_char(CURRENT_DATE, 'YY');
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(application_number, '[^0-9]', '', 'g'), '')::integer
    ), 0) + 1
    INTO next_seq
    FROM admission_applications
    WHERE institution_id = NEW.institution_id
    AND application_number LIKE 'JKKN' || year_suffix || '%';
    NEW.application_number := 'JKKN' || year_suffix || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Log counselor activity on lead events
CREATE OR REPLACE FUNCTION log_counselor_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Log assignment changes
  IF TG_OP = 'UPDATE' AND OLD.assigned_counselor_id IS DISTINCT FROM NEW.assigned_counselor_id THEN
    INSERT INTO admission_lead_activities (lead_id, institution_id, activity_type, title, metadata, performed_by)
    VALUES (NEW.id, NEW.institution_id, 'assignment', 'Lead assigned', jsonb_build_object('from', OLD.assigned_counselor_id, 'to', NEW.assigned_counselor_id), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Auto-trigger workflows on lead creation
CREATE OR REPLACE FUNCTION auto_trigger_lead_workflows()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Placeholder for workflow execution on lead.created
  RETURN NEW;
END;
$$;

-- Auto-trigger workflows on stage change
CREATE OR REPLACE FUNCTION auto_trigger_stage_change_workflows()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.funnel_stage IS DISTINCT FROM NEW.funnel_stage THEN
    -- Placeholder for workflow execution on lead.stage_changed
    NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Log COPQ incident when hot lead is lost
CREATE OR REPLACE FUNCTION log_admission_copq_on_lead_lost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_lost = true AND OLD.is_lost = false AND NEW.is_hot_lead = true THEN
    INSERT INTO billing_copq_incidents (
      institution_id, incident_type, severity, title, description,
      financial_impact, root_cause, metadata
    ) VALUES (
      NEW.institution_id, 'lost_lead', 'high',
      'Hot lead lost: ' || COALESCE(NEW.full_name, 'Unknown'),
      'A hot lead was marked as lost. Reason: ' || COALESCE(NEW.lost_reason, 'No reason provided'),
      0, NEW.lost_reason,
      jsonb_build_object('lead_id', NEW.id, 'lead_name', NEW.full_name, 'lead_phone', NEW.phone)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Schedule NPS survey after enrollment
CREATE OR REPLACE FUNCTION schedule_admission_nps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.funnel_stage = 'enrolled' AND OLD.funnel_stage != 'enrolled' THEN
    -- Schedule NPS survey 7 days after enrollment
    INSERT INTO notifications (user_id, type, title, message, metadata, scheduled_for)
    SELECT NEW.assigned_counselor_id, 'nps_survey', 'NPS Survey Due',
           'Send NPS survey to ' || COALESCE(NEW.full_name, 'student'),
           jsonb_build_object('lead_id', NEW.id), now() + interval '7 days'
    WHERE NEW.assigned_counselor_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Calculate engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(p_lead_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_score integer := 0;
  v_activity RECORD;
  v_decay_factor numeric;
  v_days_ago integer;
BEGIN
  FOR v_activity IN
    SELECT activity_type, created_at,
           EXTRACT(DAY FROM now() - created_at)::integer AS days_ago
    FROM admission_lead_activities
    WHERE lead_id = p_lead_id
    ORDER BY created_at DESC
    LIMIT 50
  LOOP
    v_days_ago := GREATEST(v_activity.days_ago, 0);
    v_decay_factor := GREATEST(1.0 - (v_days_ago::numeric / 90.0), 0.1);
    CASE v_activity.activity_type
      WHEN 'call' THEN v_score := v_score + ROUND(10 * v_decay_factor);
      WHEN 'email' THEN v_score := v_score + ROUND(5 * v_decay_factor);
      WHEN 'whatsapp' THEN v_score := v_score + ROUND(8 * v_decay_factor);
      WHEN 'meeting' THEN v_score := v_score + ROUND(15 * v_decay_factor);
      WHEN 'sms' THEN v_score := v_score + ROUND(3 * v_decay_factor);
      ELSE v_score := v_score + ROUND(2 * v_decay_factor);
    END CASE;
  END LOOP;
  RETURN LEAST(v_score, 100);
END;
$$;

-- Calculate quality score
CREATE OR REPLACE FUNCTION calculate_quality_score(p_lead_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_score integer := 0;
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM admission_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  -- Basic completeness
  IF v_lead.full_name IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF v_lead.email IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF v_lead.phone IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF v_lead.interested_programs IS NOT NULL AND array_length(v_lead.interested_programs, 1) > 0 THEN v_score := v_score + 15; END IF;
  IF v_lead.preferred_campus IS NOT NULL THEN v_score := v_score + 10; END IF;
  -- Engagement signals
  IF v_lead.is_hot_lead THEN v_score := v_score + 20; END IF;
  IF v_lead.is_priority THEN v_score := v_score + 10; END IF;
  IF v_lead.wa_opt_in THEN v_score := v_score + 5; END IF;
  IF v_lead.parent_phone IS NOT NULL THEN v_score := v_score + 10; END IF;
  RETURN LEAST(v_score, 100);
END;
$$;

-- Consultant: auto-generate transaction number
CREATE OR REPLACE FUNCTION trigger_set_transaction_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  IF NEW.transaction_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(transaction_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    INTO next_seq FROM consultant_commission_transactions WHERE institution_id = NEW.institution_id;
    NEW.transaction_number := 'TXN-' || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Consultant: auto-generate batch number
CREATE OR REPLACE FUNCTION trigger_set_batch_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  IF NEW.batch_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(batch_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    INTO next_seq FROM consultant_payout_batches WHERE institution_id = NEW.institution_id;
    NEW.batch_number := 'PAY-' || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Consultant: auto-generate query number
CREATE OR REPLACE FUNCTION trigger_set_query_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  IF NEW.query_number IS NULL THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(query_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    INTO next_seq FROM consultant_payment_queries WHERE institution_id = NEW.institution_id;
    NEW.query_number := 'QRY-' || LPAD(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Consultant: update commission totals on education_consultants
CREATE OR REPLACE FUNCTION update_consultant_commission_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE education_consultants SET
    total_commission_earned = COALESCE((
      SELECT SUM(gross_amount) FROM consultant_commission_transactions
      WHERE consultant_id = COALESCE(NEW.consultant_id, OLD.consultant_id)
      AND status IN ('approved', 'paid')
    ), 0),
    total_commission_paid = COALESCE((
      SELECT SUM(net_amount) FROM consultant_commission_transactions
      WHERE consultant_id = COALESCE(NEW.consultant_id, OLD.consultant_id)
      AND status = 'paid'
    ), 0)
  WHERE id = COALESCE(NEW.consultant_id, OLD.consultant_id);
  RETURN NEW;
END;
$$;

-- Consultant: update lead stats
CREATE OR REPLACE FUNCTION update_consultant_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE education_consultants SET
    total_leads_referred = COALESCE((
      SELECT COUNT(*) FROM consultant_lead_attributions
      WHERE consultant_id = COALESCE(NEW.consultant_id, OLD.consultant_id)
    ), 0)
  WHERE id = COALESCE(NEW.consultant_id, OLD.consultant_id);
  RETURN NEW;
END;
$$;
