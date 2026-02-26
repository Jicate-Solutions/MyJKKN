-- ============================================================================
-- ADMISSION MODULE: CORE TABLES
-- Generated from live database schema - 2026-02-25
-- ============================================================================

-- ============================================================================
-- 1. ADMISSION COUNSELORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_counselors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  institution_id uuid REFERENCES institutions(id),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true,
  phone text,
  designation text
);
ALTER TABLE admission_counselors ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. ADMISSION LEADS (65 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_profile_id uuid UNIQUE REFERENCES learners_profiles(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  engagement_score integer DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 100),
  quality_score integer DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  combined_score integer,
  score_breakdown jsonb DEFAULT '{}',
  conversion_probability numeric DEFAULT 0.00,
  stage admission_lead_stage DEFAULT 'new',
  stage_changed_at timestamptz DEFAULT now(),
  previous_stage admission_lead_stage,
  assigned_counselor_id uuid REFERENCES profiles(id),
  assigned_at timestamptz,
  ownership_mode lead_ownership_mode DEFAULT 'permanent',
  last_activity_at timestamptz DEFAULT now(),
  last_contact_at timestamptz,
  total_messages_sent integer DEFAULT 0,
  messages_this_week integer DEFAULT 0,
  last_message_at timestamptz,
  preferred_channel communication_channel_type DEFAULT 'whatsapp',
  tags text[] DEFAULT '{}',
  is_hot_lead boolean DEFAULT false,
  is_priority boolean DEFAULT false,
  parent_name text,
  parent_phone text,
  parent_email text,
  parent_opted_in boolean DEFAULT false,
  interested_programs uuid[] DEFAULT '{}',
  preferred_campus uuid,
  is_active boolean DEFAULT true,
  is_dormant boolean DEFAULT false,
  dormant_at timestamptz,
  is_lost boolean DEFAULT false,
  lost_reason text,
  lost_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  funnel_stage text DEFAULT 'new',
  full_name text,
  email text,
  phone text,
  source text DEFAULT 'website',
  counselor_id uuid REFERENCES admission_counselors(id),
  score integer DEFAULT 0,
  score_category varchar(50),
  score_updated_at timestamptz,
  next_followup_at timestamptz,
  alternate_phone text,
  date_of_birth text,
  gender text,
  address_line1 text,
  city text,
  state text,
  pincode text,
  notes text,
  entry_date timestamptz DEFAULT now(),
  district text,
  student_interest_level text CHECK (student_interest_level IN ('very_high', 'high', 'medium', 'low', 'none') OR student_interest_level IS NULL),
  parent_decision_status text CHECK (parent_decision_status IN ('supportive', 'considering', 'against', 'not_involved', 'unknown') OR parent_decision_status IS NULL),
  academic_year text,
  wa_opt_in boolean NOT NULL DEFAULT false,
  wa_opt_in_at timestamptz,
  wa_opt_in_source text,
  wa_opt_out_at timestamptz
);
ALTER TABLE admission_leads ENABLE ROW LEVEL SECURITY;

-- Indexes for admission_leads
CREATE INDEX IF NOT EXISTS idx_admission_leads_institution ON admission_leads(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_leads_funnel_stage ON admission_leads(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_admission_leads_counselor ON admission_leads(counselor_id);
CREATE INDEX IF NOT EXISTS idx_admission_leads_phone ON admission_leads(phone);
CREATE INDEX IF NOT EXISTS idx_admission_leads_email ON admission_leads(email);
CREATE INDEX IF NOT EXISTS idx_admission_leads_created ON admission_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admission_leads_next_followup ON admission_leads(counselor_id, next_followup_at) WHERE funnel_stage NOT IN ('enrolled', 'lost');
CREATE INDEX IF NOT EXISTS idx_admission_leads_score ON admission_leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_admission_leads_source ON admission_leads(source);
CREATE INDEX IF NOT EXISTS idx_admission_leads_assigned_counselor ON admission_leads(assigned_counselor_id);
CREATE INDEX IF NOT EXISTS idx_admission_leads_stage ON admission_leads(stage);

-- ============================================================================
-- 3. ADMISSION LEAD ACTIVITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  activity_type varchar(100) NOT NULL,
  title varchar(500) NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  performed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON admission_lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_institution ON admission_lead_activities(institution_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON admission_lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created ON admission_lead_activities(created_at DESC);

-- ============================================================================
-- 4. ADMISSION LEAD STAGE HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admission_lead_stage_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stage_history_lead ON admission_lead_stage_history(lead_id);

-- ============================================================================
-- 5. ADMISSION APPLICATIONS (37 columns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  lead_id uuid NOT NULL REFERENCES admission_leads(id),
  learner_profile_id uuid REFERENCES learners_profiles(id),
  program_id uuid NOT NULL REFERENCES programs(id),
  campus_id uuid,
  academic_year text NOT NULL,
  application_number text UNIQUE,
  form_data jsonb DEFAULT '{}',
  current_step integer DEFAULT 1,
  total_steps integer DEFAULT 6,
  completion_percentage numeric DEFAULT 0,
  steps_completed jsonb DEFAULT '[]',
  status application_status DEFAULT 'draft',
  status_changed_at timestamptz,
  status_history jsonb DEFAULT '[]',
  submitted_at timestamptz,
  last_saved_at timestamptz DEFAULT now(),
  reviewer_id uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  rejection_reason text,
  can_reapply boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  quota_type text CHECK (quota_type IN ('government', 'management', 'nri', 'merit', 'sports', 'lateral') OR quota_type IS NULL),
  seat_type text,
  marks_10th_percentage numeric,
  marks_10th_board text,
  marks_12th_percentage numeric,
  marks_12th_board text,
  marks_ug_percentage numeric,
  marks_ug_university text,
  entrance_exam_name text,
  entrance_exam_score numeric,
  entrance_exam_rank integer,
  UNIQUE(lead_id, program_id, academic_year)
);
ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_applications_institution ON admission_applications(institution_id);
CREATE INDEX IF NOT EXISTS idx_applications_lead ON admission_applications(lead_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON admission_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_program ON admission_applications(program_id);

-- ============================================================================
-- 6. ADMISSION LEAD SCORES
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_lead_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  total_score integer NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '[]',
  score_factors jsonb NOT NULL DEFAULT '[]',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  engagement_score integer NOT NULL DEFAULT 0,
  quality_score integer NOT NULL DEFAULT 0,
  factors jsonb NOT NULL DEFAULT '{}',
  score_category varchar(50) NOT NULL DEFAULT 'Unknown',
  recommended_action text,
  scoring_rule_id uuid,
  expires_at timestamptz
);
ALTER TABLE admission_lead_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_lead_scores_institution ON admission_lead_scores(institution_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_total ON admission_lead_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_category ON admission_lead_scores(score_category);

-- ============================================================================
-- 7. ADMISSION AI INSIGHTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  insight_type varchar(100) NOT NULL,
  title varchar(500) NOT NULL,
  description text NOT NULL,
  severity varchar(50) NOT NULL DEFAULT 'info',
  data jsonb NOT NULL DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '[]',
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_insights_institution ON admission_ai_insights(institution_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON admission_ai_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_unread ON admission_ai_insights(institution_id) WHERE is_read = false AND is_dismissed = false;

-- ============================================================================
-- 8. ADMISSION ASSIGNMENT RULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name varchar(255) NOT NULL,
  description text,
  priority integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  criteria jsonb NOT NULL DEFAULT '[]',
  action jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_assignment_rules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. ADMISSION COMMUNICATION TEMPLATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name varchar(255) NOT NULL,
  description text,
  channel varchar(50) NOT NULL DEFAULT 'whatsapp',
  category varchar(100) NOT NULL DEFAULT 'general',
  subject varchar(500),
  content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_communication_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. ADMISSION WORKFLOW CONFIGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_workflow_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  config_name text NOT NULL,
  academic_year text NOT NULL,
  active_stages text[] NOT NULL DEFAULT ARRAY['new','contacted','interested','qualified','application_started','application_submitted','documents_pending','documents_verified','offer_sent','offer_accepted','token_paid','enrolled','lost'],
  stage_configs jsonb DEFAULT '{}',
  has_entrance_exam boolean DEFAULT false,
  entrance_exam_type text,
  has_gd_pi boolean DEFAULT false,
  has_merit_list boolean DEFAULT true,
  merit_criteria jsonb DEFAULT '{}',
  has_government_quota boolean DEFAULT false,
  government_quota_percentage numeric DEFAULT 0,
  has_management_quota boolean DEFAULT true,
  has_nri_quota boolean DEFAULT false,
  quota_config jsonb DEFAULT '{}',
  required_documents text[] DEFAULT ARRAY['photo','id_proof','marksheet_10th','marksheet_12th'],
  default_templates jsonb DEFAULT '{}',
  sla_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, config_name),
  UNIQUE(institution_id, academic_year) -- partial: WHERE is_active = true
);
ALTER TABLE admission_workflow_configs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. ADMISSION WORKFLOWS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name varchar(255) NOT NULL,
  description text,
  trigger_type varchar(100) NOT NULL DEFAULT 'manual',
  trigger_conditions jsonb NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_workflows ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 12. ADMISSION DAILY BRIEFINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  briefing_date date NOT NULL,
  user_tier varchar(50) NOT NULL DEFAULT 'counselor',
  content jsonb NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'counselor',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id, user_id, briefing_date)
);
ALTER TABLE admission_daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_briefings_user ON admission_daily_briefings(user_id);
CREATE INDEX IF NOT EXISTS idx_briefings_institution ON admission_daily_briefings(institution_id);
CREATE INDEX IF NOT EXISTS idx_briefings_date ON admission_daily_briefings(briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_unread ON admission_daily_briefings(user_id) WHERE is_read = false;

-- ============================================================================
-- 13. ADMISSION CALL LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  lead_id uuid REFERENCES admission_leads(id),
  counselor_id uuid NOT NULL REFERENCES profiles(id),
  call_sid text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  from_number text NOT NULL,
  to_number text NOT NULL,
  status text NOT NULL DEFAULT 'initiated',
  duration_seconds integer,
  recording_url text,
  recording_duration_seconds integer,
  call_notes text,
  call_disposition text,
  follow_up_date date,
  cost_amount numeric,
  cost_currency text DEFAULT 'INR',
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_call_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_call_logs_institution ON admission_call_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON admission_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_counselor ON admission_call_logs(counselor_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON admission_call_logs(created_at DESC);

-- ============================================================================
-- 14. ADMISSION SMS LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  lead_id uuid NOT NULL REFERENCES admission_leads(id),
  template_id uuid REFERENCES admission_communication_templates(id),
  phone_number varchar(20) NOT NULL,
  message_content text NOT NULL,
  provider sms_provider NOT NULL DEFAULT 'msg91',
  provider_message_id varchar(255),
  status sms_delivery_status NOT NULL DEFAULT 'pending',
  error_message text,
  dlt_template_id varchar(50),
  dlt_entity_id varchar(50),
  cost numeric,
  segments integer NOT NULL DEFAULT 1,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_sms_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sms_logs_institution ON admission_sms_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_lead ON admission_sms_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON admission_sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created ON admission_sms_logs(created_at DESC);

-- ============================================================================
-- 15. ADMISSION WHATSAPP LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  lead_id uuid NOT NULL REFERENCES admission_leads(id),
  template_id uuid REFERENCES admission_communication_templates(id),
  recipient_phone text NOT NULL,
  message_content text NOT NULL,
  delivery_status whatsapp_delivery_status DEFAULT 'pending',
  whatsapp_message_id text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  campaign_id uuid,
  workflow_execution_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE admission_whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wa_logs_institution ON admission_whatsapp_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_logs_lead ON admission_whatsapp_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_logs_status ON admission_whatsapp_logs(delivery_status);

-- ============================================================================
-- 16. ADMISSION EMAIL LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  lead_id uuid REFERENCES admission_leads(id),
  campaign_id uuid REFERENCES admission_campaign_queue(id),
  template_id uuid REFERENCES admission_communication_templates(id),
  to_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,
  resend_message_id text,
  status text NOT NULL DEFAULT 'queued',
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  error_message text,
  tags jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admission_email_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 17. ADMISSION CAMPAIGN QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_campaign_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  workflow_id uuid REFERENCES admission_workflows(id),
  lead_id uuid REFERENCES admission_leads(id),
  application_id uuid REFERENCES admission_applications(id),
  step_type campaign_step_type NOT NULL,
  step_config jsonb NOT NULL DEFAULT '{}',
  step_order integer DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  execute_after timestamptz,
  status campaign_step_status NOT NULL DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  last_attempt_at timestamptz,
  execution_id uuid,
  parent_queue_id uuid REFERENCES admission_campaign_queue(id),
  error_message text,
  error_details jsonb,
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE admission_campaign_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_campaign_queue_pending ON admission_campaign_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_queue_institution ON admission_campaign_queue(institution_id);
CREATE INDEX IF NOT EXISTS idx_campaign_queue_workflow ON admission_campaign_queue(workflow_id);

-- ============================================================================
-- 18. ADMISSION CAMPAIGN LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  queue_id uuid REFERENCES admission_campaign_queue(id),
  workflow_id uuid REFERENCES admission_workflows(id),
  lead_id uuid REFERENCES admission_leads(id),
  log_type text NOT NULL,
  step_type campaign_step_type,
  action text NOT NULL,
  request_data jsonb,
  response_data jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE admission_campaign_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 19. ADMISSION DRIP SEQUENCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_drip_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  workflow_id uuid NOT NULL REFERENCES admission_workflows(id),
  lead_id uuid NOT NULL REFERENCES admission_leads(id),
  status drip_sequence_status NOT NULL DEFAULT 'active',
  current_step_index integer NOT NULL DEFAULT 0,
  total_steps integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  resumed_at timestamptz,
  completed_at timestamptz,
  context_data jsonb DEFAULT '{}',
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workflow_id, lead_id) -- partial: WHERE status IN ('active', 'paused')
);
ALTER TABLE admission_drip_sequences ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 20. ADMISSION DRIP SCHEDULE
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_drip_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES admission_drip_sequences(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  action_id text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}',
  scheduled_at timestamptz NOT NULL,
  delay_hours integer DEFAULT 0,
  delay_days integer DEFAULT 0,
  conditions jsonb DEFAULT '[]',
  status drip_step_status NOT NULL DEFAULT 'pending',
  executed_at timestamptz,
  execution_result jsonb,
  error_message text,
  skipped_at timestamptz,
  skipped_by uuid REFERENCES profiles(id),
  skip_reason text,
  retry_count integer DEFAULT 0,
  last_retry_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sequence_id, step_index)
);
ALTER TABLE admission_drip_schedule ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_drip_schedule_pending ON admission_drip_schedule(scheduled_at) WHERE status = 'pending';

-- ============================================================================
-- 21. ADMISSION DRIP EXECUTION LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_drip_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES admission_drip_sequences(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES admission_drip_schedule(id),
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admission_drip_execution_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 22. ADMISSION TASKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS admission_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  assigned_to uuid REFERENCES profiles(id),
  task_type task_type NOT NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  reminder_at timestamptz,
  status task_status DEFAULT 'pending',
  completed_at timestamptz,
  completed_by uuid REFERENCES profiles(id),
  outcome text,
  outcome_notes text,
  priority integer DEFAULT 50,
  created_by_system boolean DEFAULT false,
  workflow_id uuid REFERENCES admission_workflows(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);
ALTER TABLE admission_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tasks_institution ON admission_tasks(institution_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON admission_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON admission_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON admission_tasks(due_at) WHERE status IN ('pending', 'in_progress');

-- ============================================================================
-- 23. ADMISSIONS TABLE — REMOVED (2026-02-25)
-- Reason: Dead code. LearnerProfileService replaced AdmissionService.
-- All enquiry/application data uses learners_profiles table.
-- AdmissionService had 0 imports in the codebase.
-- ============================================================================
