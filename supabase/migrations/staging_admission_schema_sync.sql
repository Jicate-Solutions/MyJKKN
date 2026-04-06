-- ============================================================
-- STAGING ADMISSION SCHEMA SYNC FROM PRODUCTION
-- Generated: 2026-04-06
-- Purpose: Replace staging admission_* tables with production schema
-- Target: hhprjbgknupaplivtoib (staging)
-- Source: kvizhngldtiuufknvehv (production)
-- ============================================================

-- STEP 1: Create enums (idempotent - won't fail if they exist)
DO $$ BEGIN CREATE TYPE lead_source AS ENUM ('website', 'walk_in', 'referral', 'social_media', 'newspaper', 'education_fair', 'agent', 'publisher', 'google_ads', 'facebook_ads', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lead_priority AS ENUM ('hot', 'warm', 'cold'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE funnel_stage AS ENUM ('new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled', 'engaged', 'qualified', 'application_started', 'application_submitted', 'documents_pending', 'documents_verified', 'interview_scheduled', 'interview_completed', 'offer_sent', 'offer_accepted', 'token_paid', 'applied', 'interviewed', 'offered', 'enrolled', 'confirmed', 'declined', 'withdrew', 'expired', 'lost', 'dormant'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE communication_template_type AS ENUM ('sms', 'email', 'whatsapp'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_step_type AS ENUM ('send_sms', 'send_email', 'send_whatsapp', 'update_stage', 'assign_counselor', 'add_tag', 'wait', 'wait_hours', 'wait_days'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE campaign_step_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sms_provider AS ENUM ('msg91', 'twilio', 'exotel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sms_delivery_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'undelivered', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE whatsapp_delivery_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE workflow_action_type AS ENUM ('send_sms', 'send_email', 'send_whatsapp', 'assign_counselor', 'update_stage', 'create_task', 'webhook'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE drip_sequence_status AS ENUM ('active', 'paused', 'completed', 'cancelled', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE drip_step_status AS ENUM ('pending', 'scheduled', 'executing', 'completed', 'skipped', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_type AS ENUM ('follow_up_call', 'send_document', 'schedule_interview', 'verify_documents', 'collect_payment', 'custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- STEP 2: Drop existing admission tables (CASCADE to handle FK deps)
DROP TABLE IF EXISTS admission_drip_execution_logs CASCADE;
DROP TABLE IF EXISTS admission_drip_schedule CASCADE;
DROP TABLE IF EXISTS admission_drip_sequences CASCADE;
DROP TABLE IF EXISTS admission_campaign_logs CASCADE;
DROP TABLE IF EXISTS admission_campaign_queue CASCADE;
DROP TABLE IF EXISTS admission_workflow_executions CASCADE;
DROP TABLE IF EXISTS admission_workflows CASCADE;
DROP TABLE IF EXISTS admission_workflow_configs CASCADE;
DROP TABLE IF EXISTS admission_lead_stage_history CASCADE;
DROP TABLE IF EXISTS admission_lead_scores CASCADE;
DROP TABLE IF EXISTS admission_lead_activities CASCADE;
DROP TABLE IF EXISTS admission_scoring_rules CASCADE;
DROP TABLE IF EXISTS admission_assignment_rules CASCADE;
DROP TABLE IF EXISTS admission_communication_templates CASCADE;
DROP TABLE IF EXISTS admission_daily_briefings CASCADE;
DROP TABLE IF EXISTS admission_ai_insights CASCADE;
DROP TABLE IF EXISTS admission_tasks CASCADE;
DROP TABLE IF EXISTS admission_email_logs CASCADE;
DROP TABLE IF EXISTS admission_sms_logs CASCADE;
DROP TABLE IF EXISTS admission_whatsapp_logs CASCADE;
DROP TABLE IF EXISTS admission_call_logs CASCADE;
DROP TABLE IF EXISTS admission_counselors CASCADE;
DROP TABLE IF EXISTS admission_leads CASCADE;

-- STEP 3: Create tables exactly as production

CREATE TABLE admission_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  email text,
  phone text NOT NULL,
  alternate_phone text,
  date_of_birth date,
  gender text,
  address_line1 text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India'::text,
  interested_programs text[],
  source lead_source NOT NULL DEFAULT 'website'::lead_source,
  source_detail text,
  referrer_id uuid,
  publisher_id uuid,
  funnel_stage funnel_stage NOT NULL DEFAULT 'new'::funnel_stage,
  priority lead_priority DEFAULT 'warm'::lead_priority,
  score integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  quality_score integer DEFAULT 0,
  counselor_id uuid,
  assigned_at timestamp with time zone,
  last_contact_at timestamp with time zone,
  next_followup_at timestamp with time zone,
  notes text,
  tags text[] DEFAULT '{}'::text[],
  is_duplicate boolean DEFAULT false,
  duplicate_of uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  is_hot_lead boolean DEFAULT false,
  is_priority boolean DEFAULT false,
  is_active boolean DEFAULT true,
  is_dormant boolean DEFAULT false,
  is_lost boolean DEFAULT false,
  district text,
  parent_name text,
  parent_phone text,
  parent_email text,
  parent_opted_in boolean DEFAULT false,
  assigned_counselor_id uuid,
  ownership_mode text,
  preferred_channel text,
  preferred_campus text,
  academic_year text,
  entry_date date,
  student_interest_level text,
  parent_decision_status text,
  last_activity_at timestamp with time zone,
  total_messages_sent integer DEFAULT 0,
  messages_this_week integer DEFAULT 0,
  last_message_at timestamp with time zone,
  stage text,
  stage_changed_at timestamp with time zone,
  previous_stage text,
  score_category text,
  score_updated_at timestamp with time zone,
  combined_score integer,
  score_breakdown jsonb,
  conversion_probability numeric,
  lost_reason text,
  lost_at timestamp with time zone,
  dormant_at timestamp with time zone,
  learner_profile_id uuid,
  degree_id uuid,
  department_id uuid,
  program_id uuid,
  application_number text,
  first_name text NOT NULL DEFAULT ''::text,
  last_name text,
  full_name text,
  referral_type text,
  referred_by_id uuid,
  referred_by_name text,
  expo_event_id uuid,
  captured_by uuid,
  wa_opt_in boolean DEFAULT false,
  wa_opt_in_at timestamp with time zone,
  wa_opt_in_source text,
  wa_opt_out_at timestamp with time zone,
  CONSTRAINT admission_leads_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_counselors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  institution_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_active boolean DEFAULT true,
  max_leads integer DEFAULT 50,
  current_leads integer DEFAULT 0,
  specializations text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_counselors_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_call_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  lead_id uuid,
  counselor_id uuid,
  call_sid text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound'::text,
  from_number text NOT NULL,
  to_number text NOT NULL,
  status text NOT NULL DEFAULT 'initiated'::text,
  duration_seconds integer,
  recording_url text,
  recording_duration_seconds integer,
  call_notes text,
  call_disposition text,
  follow_up_date date,
  cost_amount numeric,
  cost_currency text DEFAULT 'INR'::text,
  started_at timestamp with time zone,
  answered_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admission_call_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_lead_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  activity_type text NOT NULL,
  subject text,
  description text,
  outcome text,
  scheduled_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_lead_activities_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_lead_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  total_score integer NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  engagement_score integer NOT NULL DEFAULT 0,
  quality_score integer NOT NULL DEFAULT 0,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_category varchar(50) NOT NULL DEFAULT 'Unknown'::character varying,
  recommended_action text,
  scoring_rule_id uuid,
  expires_at timestamp with time zone,
  CONSTRAINT admission_lead_scores_pkey PRIMARY KEY (id),
  CONSTRAINT admission_lead_scores_lead_id_key UNIQUE (lead_id)
);

CREATE TABLE admission_lead_stage_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  from_stage funnel_stage,
  to_stage funnel_stage NOT NULL,
  changed_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_lead_stage_history_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_ai_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  insight_type varchar(100) NOT NULL,
  title varchar(500) NOT NULL,
  description text NOT NULL,
  severity varchar(50) NOT NULL DEFAULT 'info'::character varying,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admission_ai_insights_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_assignment_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  action jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_assignment_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_scoring_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_scoring_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_communication_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  name text NOT NULL,
  channel communication_template_type NOT NULL,
  subject text,
  content text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  description text,
  category text,
  attachment_type text,
  attachment_url text,
  CONSTRAINT admission_communication_templates_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  trigger jsonb NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_workflows_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_workflow_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  lead_id uuid,
  application_id uuid,
  trigger_data jsonb,
  actions_executed jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'completed'::text,
  error_message text,
  executed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_workflow_executions_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_workflow_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  config_name text NOT NULL,
  academic_year text NOT NULL,
  active_stages text[] NOT NULL DEFAULT ARRAY['new','contacted','interested','qualified','application_started','application_submitted','documents_pending','documents_verified','offer_sent','offer_accepted','token_paid','enrolled','lost'],
  stage_configs jsonb DEFAULT '{}'::jsonb,
  has_entrance_exam boolean DEFAULT false,
  entrance_exam_type text,
  has_gd_pi boolean DEFAULT false,
  has_merit_list boolean DEFAULT true,
  merit_criteria jsonb DEFAULT '{}'::jsonb,
  has_government_quota boolean DEFAULT false,
  government_quota_percentage numeric DEFAULT 0,
  has_management_quota boolean DEFAULT true,
  has_nri_quota boolean DEFAULT false,
  quota_config jsonb DEFAULT '{}'::jsonb,
  required_documents text[] DEFAULT ARRAY['photo','id_proof','marksheet_10th','marksheet_12th'],
  default_templates jsonb DEFAULT '{}'::jsonb,
  sla_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_workflow_configs_pkey PRIMARY KEY (id),
  CONSTRAINT admission_workflow_configs_institution_id_config_name_key UNIQUE (institution_id, config_name)
);

CREATE TABLE admission_daily_briefings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  user_id uuid NOT NULL,
  briefing_date date NOT NULL,
  user_tier varchar(50) NOT NULL DEFAULT 'counselor'::character varying,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'counselor'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admission_daily_briefings_pkey PRIMARY KEY (id),
  CONSTRAINT admission_daily_briefings_institution_id_user_id_briefing_d_key UNIQUE (institution_id, user_id, briefing_date)
);

CREATE TABLE admission_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  assigned_to uuid,
  task_type task_type NOT NULL,
  title text NOT NULL,
  description text,
  due_at timestamp with time zone NOT NULL,
  reminder_at timestamp with time zone,
  status task_status DEFAULT 'pending'::task_status,
  completed_at timestamp with time zone,
  completed_by uuid,
  outcome text,
  outcome_notes text,
  priority integer DEFAULT 50,
  created_by_system boolean DEFAULT false,
  workflow_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT admission_tasks_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  template_id uuid,
  phone_number varchar(20) NOT NULL,
  message_content text NOT NULL,
  provider sms_provider NOT NULL DEFAULT 'msg91'::sms_provider,
  provider_message_id varchar(255),
  status sms_delivery_status NOT NULL DEFAULT 'pending'::sms_delivery_status,
  error_message text,
  dlt_template_id varchar(50),
  dlt_entity_id varchar(50),
  cost numeric,
  segments integer NOT NULL DEFAULT 1,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admission_sms_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_whatsapp_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  template_id uuid,
  recipient_phone text NOT NULL,
  message_content text NOT NULL,
  delivery_status whatsapp_delivery_status DEFAULT 'pending'::whatsapp_delivery_status,
  whatsapp_message_id text,
  error_message text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  failed_at timestamp with time zone,
  campaign_id uuid,
  workflow_execution_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_whatsapp_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  lead_id uuid,
  campaign_id uuid,
  template_id uuid,
  to_email text NOT NULL,
  from_email text NOT NULL,
  subject text NOT NULL,
  resend_message_id text,
  status text NOT NULL DEFAULT 'queued'::text,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  bounced_at timestamp with time zone,
  error_message text,
  tags jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admission_email_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_campaign_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  workflow_id uuid,
  lead_id uuid,
  application_id uuid,
  step_type campaign_step_type NOT NULL,
  step_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  step_order integer DEFAULT 0,
  scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
  execute_after timestamp with time zone,
  status campaign_step_status NOT NULL DEFAULT 'pending'::campaign_step_status,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  last_attempt_at timestamp with time zone,
  execution_id uuid,
  parent_queue_id uuid,
  error_message text,
  error_details jsonb,
  priority integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT admission_campaign_queue_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_campaign_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  queue_id uuid,
  workflow_id uuid,
  lead_id uuid,
  log_type text NOT NULL,
  step_type campaign_step_type,
  action text NOT NULL,
  request_data jsonb,
  response_data jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT admission_campaign_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_drip_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  status drip_sequence_status NOT NULL DEFAULT 'active'::drip_sequence_status,
  current_step_index integer NOT NULL DEFAULT 0,
  total_steps integer NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  paused_at timestamp with time zone,
  resumed_at timestamp with time zone,
  completed_at timestamp with time zone,
  context_data jsonb DEFAULT '{}'::jsonb,
  error_message text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_drip_sequences_pkey PRIMARY KEY (id)
);

CREATE TABLE admission_drip_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL,
  step_index integer NOT NULL,
  action_id text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamp with time zone NOT NULL,
  delay_hours integer DEFAULT 0,
  delay_days integer DEFAULT 0,
  conditions jsonb DEFAULT '[]'::jsonb,
  status drip_step_status NOT NULL DEFAULT 'pending'::drip_step_status,
  executed_at timestamp with time zone,
  execution_result jsonb,
  error_message text,
  skipped_at timestamp with time zone,
  skipped_by uuid,
  skip_reason text,
  retry_count integer DEFAULT 0,
  last_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_drip_schedule_pkey PRIMARY KEY (id),
  CONSTRAINT admission_drip_schedule_sequence_id_step_index_key UNIQUE (sequence_id, step_index)
);

CREATE TABLE admission_drip_execution_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL,
  schedule_id uuid,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_drip_execution_logs_pkey PRIMARY KEY (id)
);

-- STEP 4: Enable RLS on all tables
ALTER TABLE admission_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_counselors ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_workflow_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_drip_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_drip_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_drip_execution_logs ENABLE ROW LEVEL SECURITY;

-- STEP 5: RLS Policies (standard pattern: institution_id + super_admin + admission role)
-- Using the production pattern for all admission tables

CREATE POLICY "admission_leads_select" ON admission_leads FOR SELECT TO authenticated
USING (
  institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = 'admission')
);
CREATE POLICY "admission_leads_insert" ON admission_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admission_leads_update" ON admission_leads FOR UPDATE TO authenticated
USING (
  institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = 'admission')
);
CREATE POLICY "admission_leads_delete" ON admission_leads FOR DELETE TO authenticated
USING (
  institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
  OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = 'admission')
);

-- Apply same standard pattern to remaining tables via DO block
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'admission_counselors', 'admission_call_logs', 'admission_lead_scores',
    'admission_ai_insights', 'admission_assignment_rules', 'admission_scoring_rules',
    'admission_communication_templates', 'admission_workflows', 'admission_workflow_configs',
    'admission_tasks', 'admission_sms_logs', 'admission_whatsapp_logs',
    'admission_email_logs', 'admission_campaign_queue', 'admission_campaign_logs',
    'admission_drip_sequences'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (
      institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ''super_admin'' OR is_super_admin = true))
      OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = ''admission'')
    )', tbl || '_select', tbl);

    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl || '_insert', tbl);

    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (
      institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ''super_admin'' OR is_super_admin = true))
      OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = ''admission'')
    )', tbl || '_update', tbl);

    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (
      institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ''super_admin'' OR is_super_admin = true))
      OR EXISTS (SELECT 1 FROM public.custom_roles WHERE user_id = auth.uid() AND role_key = ''admission'')
    )', tbl || '_delete', tbl);
  END LOOP;
END $$;

-- Special policies for tables without institution_id (use join to parent)
CREATE POLICY "lead_activities_all" ON admission_lead_activities FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM admission_leads al WHERE al.id = lead_id
    AND (al.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))))
);

CREATE POLICY "lead_stage_history_select" ON admission_lead_stage_history FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM admission_leads al WHERE al.id = lead_id
    AND (al.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))))
);
CREATE POLICY "lead_stage_history_insert" ON admission_lead_stage_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "workflow_executions_select" ON admission_workflow_executions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM admission_workflows aw WHERE aw.id = workflow_id
    AND (aw.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))))
);
CREATE POLICY "workflow_executions_insert" ON admission_workflow_executions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "daily_briefings_select" ON admission_daily_briefings FOR SELECT TO authenticated
USING (
  institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
);
CREATE POLICY "daily_briefings_insert" ON admission_daily_briefings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "daily_briefings_update" ON admission_daily_briefings FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))
);

-- Drip schedule/execution logs via parent join
CREATE POLICY "drip_schedule_all" ON admission_drip_schedule FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM admission_drip_sequences ds WHERE ds.id = sequence_id
    AND (ds.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))))
);

CREATE POLICY "drip_exec_logs_all" ON admission_drip_execution_logs FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM admission_drip_sequences ds WHERE ds.id = sequence_id
    AND (ds.institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'super_admin' OR is_super_admin = true))))
);

-- ============================================================
-- DONE: 23 tables created with production-exact schema
-- 15 enums created/verified
-- RLS enabled on all tables with standard policies
-- ============================================================
