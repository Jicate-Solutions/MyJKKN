# Admission CRM — Database Schemas (Live from Staging)

> **Source**: Supabase Staging (`hhprjbgknupaplivtoib`) | **Queried**: 2026-03-27
> **Tables**: 32 | **Columns**: 574 | **Foreign Keys**: 73

## Table Index

| Table | Columns | Key Relationships |
|-------|---------|-------------------|
| `admission_ai_insights` | 12 | → institutions |
| `admission_applications` | 37 | → admission_leads, institutions, learners_profiles, profiles |
| `admission_assignment_rules` | 10 | → institutions |
| `admission_call_logs` | 22 | → institutions, profiles, admission_leads |
| `admission_campaign_logs` | 15 | → admission_campaign_queue, admission_workflows, admission_leads, institutions |
| `admission_campaign_queue` | 22 | → institutions, admission_leads, admission_applications, admission_workflows, self |
| `admission_communication_templates` | 12 | → institutions |
| `admission_counselors` | 9 | → institutions |
| `admission_daily_briefings` | 10+ | → institutions |
| `admission_drip_execution_logs` | varies | → drip tables |
| `admission_drip_schedule` | varies | → drip sequences |
| `admission_drip_sequences` | varies | → institutions |
| `admission_email_logs` | varies | → institutions, admission_leads |
| `admission_lead_activities` | 9 | → admission_leads |
| `admission_lead_scores` | varies | → admission_leads |
| `admission_lead_stage_history` | varies | → admission_leads |
| `admission_leads` | 61 | → institutions, admission_counselors |
| `admission_process_metrics` | varies | → institutions |
| `admission_sms_logs` | varies | → institutions, admission_leads |
| `admission_tasks` | varies | → institutions |
| `admission_whatsapp_logs` | varies | → institutions, admission_leads |
| `admission_workflow_configs` | varies | → institutions |
| `admission_workflows` | varies | → institutions |
| `admissions` | varies | Legacy table |
| `chatbot_configs` | varies | → institutions |
| `chatbot_knowledge_base` | varies | → institutions |
| `chatbot_messages` | varies | → chatbot_sessions |
| `chatbot_sessions` | varies | → institutions |
| `education_consultants` | 57 | → institutions |
| `lead_activity_log` | 11 | NO institution_id (security gap) |
| `lead_sources` | varies | → institutions |
| `lead_stage_history` | varies | Legacy duplicate |

## Schema Details

### `admission_ai_insights` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| insight_type | character varying(100) | NO |  |
| title | character varying(500) | NO |  |
| description | text | NO |  |
| severity | character varying(50) | NO | 'info'::character varying |
| data | jsonb | NO | '{}'::jsonb |
| actions | jsonb | NO | '[]'::jsonb |
| is_read | boolean | NO | false |
| is_dismissed | boolean | NO | false |
| expires_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `admission_applications` (37 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| lead_id | uuid | NO |  |
| learner_profile_id | uuid | YES |  |
| program_id | uuid | NO |  |
| campus_id | uuid | YES |  |
| academic_year | text | NO |  |
| application_number | text | YES |  |
| form_data | jsonb | YES | '{}'::jsonb |
| current_step | integer | YES | 1 |
| total_steps | integer | YES | 6 |
| completion_percentage | numeric | YES | 0 |
| steps_completed | jsonb | YES | '[]'::jsonb |
| status | USER-DEFINED | YES | 'draft'::application_status |
| status_changed_at | timestamp with time zone | YES |  |
| status_history | jsonb | YES | '[]'::jsonb |
| submitted_at | timestamp with time zone | YES |  |
| last_saved_at | timestamp with time zone | YES | now() |
| reviewer_id | uuid | YES |  |
| reviewed_at | timestamp with time zone | YES |  |
| review_notes | text | YES |  |
| rejection_reason | text | YES |  |
| can_reapply | boolean | YES | true |
| expires_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| quota_type | text | YES |  |
| seat_type | text | YES |  |
| marks_10th_percentage | numeric | YES |  |
| marks_10th_board | text | YES |  |
| marks_12th_percentage | numeric | YES |  |
| marks_12th_board | text | YES |  |
| marks_ug_percentage | numeric | YES |  |
| marks_ug_university | text | YES |  |
| entrance_exam_name | text | YES |  |
| entrance_exam_score | numeric | YES |  |
| entrance_exam_rank | integer | YES |  |

**Foreign Keys:**
- `lead_id` → `admission_leads.id`
- `learner_profile_id` → `learners_profiles.id`
- `reviewer_id` → `profiles.id`
- `institution_id` → `institutions.id`

### `admission_assignment_rules` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| name | character varying(255) | NO |  |
| description | text | YES |  |
| priority | integer | NO | 10 |
| is_active | boolean | NO | true |
| criteria | jsonb | NO | '[]'::jsonb |
| action | jsonb | NO | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `admission_call_logs` (22 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| lead_id | uuid | YES |  |
| counselor_id | uuid | NO |  |
| call_sid | text | NO |  |
| direction | text | NO | 'outbound'::text |
| from_number | text | NO |  |
| to_number | text | NO |  |
| status | text | NO | 'initiated'::text |
| duration_seconds | integer | YES |  |
| recording_url | text | YES |  |
| recording_duration_seconds | integer | YES |  |
| call_notes | text | YES |  |
| call_disposition | text | YES |  |
| follow_up_date | date | YES |  |
| cost_amount | numeric | YES |  |
| cost_currency | text | YES | 'INR'::text |
| started_at | timestamp with time zone | YES |  |
| answered_at | timestamp with time zone | YES |  |
| ended_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`
- `counselor_id` → `profiles.id`
- `lead_id` → `admission_leads.id`

### `admission_campaign_logs` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| queue_id | uuid | YES |  |
| workflow_id | uuid | YES |  |
| lead_id | uuid | YES |  |
| log_type | text | NO |  |
| step_type | USER-DEFINED | YES |  |
| action | text | NO |  |
| request_data | jsonb | YES |  |
| response_data | jsonb | YES |  |
| started_at | timestamp with time zone | YES |  |
| completed_at | timestamp with time zone | YES |  |
| duration_ms | integer | YES |  |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES |  |

**Foreign Keys:**
- `queue_id` → `admission_campaign_queue.id`
- `workflow_id` → `admission_workflows.id`
- `lead_id` → `admission_leads.id`
- `institution_id` → `institutions.id`

### `admission_campaign_queue` (22 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| workflow_id | uuid | YES |  |
| lead_id | uuid | YES |  |
| application_id | uuid | YES |  |
| step_type | USER-DEFINED | NO |  |
| step_config | jsonb | NO | '{}'::jsonb |
| step_order | integer | YES | 0 |
| scheduled_at | timestamp with time zone | NO | now() |
| execute_after | timestamp with time zone | YES |  |
| status | USER-DEFINED | NO | 'pending'::campaign_step_status |
| attempts | integer | YES | 0 |
| max_attempts | integer | YES | 3 |
| last_attempt_at | timestamp with time zone | YES |  |
| execution_id | uuid | YES |  |
| parent_queue_id | uuid | YES |  |
| error_message | text | YES |  |
| error_details | jsonb | YES |  |
| priority | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| completed_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `institution_id` → `institutions.id`
- `lead_id` → `admission_leads.id`
- `application_id` → `admission_applications.id`
- `workflow_id` → `admission_workflows.id`
- `parent_queue_id` → `admission_campaign_queue.id`

### `admission_communication_templates` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| name | character varying(255) | NO |  |
| description | text | YES |  |
| channel | character varying(50) | NO | 'whatsapp'::character varying |
| category | character varying(100) | NO | 'general'::character varying |
| subject | character varying(500) | YES |  |
| content | text | NO |  |
| variables | jsonb | NO | '[]'::jsonb |
| is_active | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `admission_counselors` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO |  |
| email | text | YES |  |
| institution_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| user_id | uuid | YES |  |
| is_active | boolean | YES | true |
| phone | text | YES |  |
| designation | text | YES |  |

### `admission_daily_briefings` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| user_id | uuid | NO |  |
| briefing_date | date | NO |  |
| user_tier | character varying(50) | NO | 'counselor'::character varying |
| content | jsonb | NO | '{}'::jsonb |
| is_read | boolean | NO | false |
| read_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| role | text | NO | 'counselor'::text |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `user_id` → `profiles.id`
- `institution_id` → `institutions.id`

### `admission_drip_execution_logs` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| sequence_id | uuid | NO |  |
| schedule_id | uuid | YES |  |
| event_type | text | NO |  |
| event_data | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `schedule_id` → `admission_drip_schedule.id`
- `sequence_id` → `admission_drip_sequences.id`

### `admission_drip_schedule` (21 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| sequence_id | uuid | NO |  |
| step_index | integer | NO |  |
| action_id | text | NO |  |
| action_type | text | NO |  |
| action_config | jsonb | NO | '{}'::jsonb |
| scheduled_at | timestamp with time zone | NO |  |
| delay_hours | integer | YES | 0 |
| delay_days | integer | YES | 0 |
| conditions | jsonb | YES | '[]'::jsonb |
| status | USER-DEFINED | NO | 'pending'::drip_step_status |
| executed_at | timestamp with time zone | YES |  |
| execution_result | jsonb | YES |  |
| error_message | text | YES |  |
| skipped_at | timestamp with time zone | YES |  |
| skipped_by | uuid | YES |  |
| skip_reason | text | YES |  |
| retry_count | integer | YES | 0 |
| last_retry_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `sequence_id` → `admission_drip_sequences.id`

### `admission_drip_sequences` (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| workflow_id | uuid | NO |  |
| lead_id | uuid | NO |  |
| status | USER-DEFINED | NO | 'active'::drip_sequence_status |
| current_step_index | integer | NO | 0 |
| total_steps | integer | NO |  |
| started_at | timestamp with time zone | NO | now() |
| paused_at | timestamp with time zone | YES |  |
| resumed_at | timestamp with time zone | YES |  |
| completed_at | timestamp with time zone | YES |  |
| context_data | jsonb | YES | '{}'::jsonb |
| error_message | text | YES |  |
| retry_count | integer | YES | 0 |
| max_retries | integer | YES | 3 |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `workflow_id` → `admission_workflows.id`
- `lead_id` → `admission_leads.id`
- `institution_id` → `institutions.id`

### `admission_email_logs` (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| lead_id | uuid | YES |  |
| campaign_id | uuid | YES |  |
| template_id | uuid | YES |  |
| to_email | text | NO |  |
| from_email | text | NO |  |
| subject | text | NO |  |
| resend_message_id | text | YES |  |
| status | text | NO | 'queued'::text |
| opened_at | timestamp with time zone | YES |  |
| clicked_at | timestamp with time zone | YES |  |
| bounced_at | timestamp with time zone | YES |  |
| error_message | text | YES |  |
| tags | jsonb | YES | '[]'::jsonb |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `lead_id` → `admission_leads.id`
- `template_id` → `admission_communication_templates.id`
- `campaign_id` → `admission_campaign_queue.id`
- `institution_id` → `institutions.id`

### `admission_lead_activities` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| activity_type | character varying(100) | NO |  |
| title | character varying(500) | NO |  |
| description | text | YES |  |
| metadata | jsonb | NO | '{}'::jsonb |
| performed_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `performed_by` → `profiles.id`
- `lead_id` → `admission_leads.id`
- `institution_id` → `institutions.id`

### `admission_lead_scores` (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| total_score | integer | NO | 0 |
| score_breakdown | jsonb | NO | '[]'::jsonb |
| score_factors | jsonb | NO | '[]'::jsonb |
| calculated_at | timestamp with time zone | NO | now() |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| engagement_score | integer | NO | 0 |
| quality_score | integer | NO | 0 |
| factors | jsonb | NO | '{}'::jsonb |
| score_category | character varying(50) | NO | 'Unknown'::character varying |
| recommended_action | text | YES |  |
| scoring_rule_id | uuid | YES |  |
| expires_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `institution_id` → `institutions.id`
- `lead_id` → `admission_leads.id`

### `admission_lead_stage_history` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| from_stage | text | YES |  |
| to_stage | text | NO |  |
| changed_by | uuid | YES |  |
| notes | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `lead_id` → `admission_leads.id`
- `changed_by` → `profiles.id`

### `admission_leads` (65 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| learner_profile_id | uuid | YES |  |
| institution_id | uuid | NO |  |
| engagement_score | integer | YES | 0 |
| quality_score | integer | YES | 0 |
| combined_score | integer | YES |  |
| score_breakdown | jsonb | YES | '{}'::jsonb |
| conversion_probability | numeric | YES | 0.00 |
| stage | USER-DEFINED | YES | 'new'::admission_lead_stage |
| stage_changed_at | timestamp with time zone | YES | now() |
| previous_stage | USER-DEFINED | YES |  |
| assigned_counselor_id | uuid | YES |  |
| assigned_at | timestamp with time zone | YES |  |
| ownership_mode | USER-DEFINED | YES | 'permanent'::lead_ownership_mode |
| last_activity_at | timestamp with time zone | YES | now() |
| last_contact_at | timestamp with time zone | YES |  |
| total_messages_sent | integer | YES | 0 |
| messages_this_week | integer | YES | 0 |
| last_message_at | timestamp with time zone | YES |  |
| preferred_channel | USER-DEFINED | YES | 'whatsapp'::communication_channel_type |
| tags | ARRAY | YES | '{}'::text[] |
| is_hot_lead | boolean | YES | false |
| is_priority | boolean | YES | false |
| parent_name | text | YES |  |
| parent_phone | text | YES |  |
| parent_email | text | YES |  |
| parent_opted_in | boolean | YES | false |
| interested_programs | ARRAY | YES | '{}'::uuid[] |
| preferred_campus | uuid | YES |  |
| is_active | boolean | YES | true |
| is_dormant | boolean | YES | false |
| dormant_at | timestamp with time zone | YES |  |
| is_lost | boolean | YES | false |
| lost_reason | text | YES |  |
| lost_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES |  |
| funnel_stage | text | YES | 'new'::text |
| full_name | text | YES |  |
| email | text | YES |  |
| phone | text | YES |  |
| source | text | YES | 'website'::text |
| counselor_id | uuid | YES |  |
| score | integer | YES | 0 |
| score_category | character varying(50) | YES |  |
| score_updated_at | timestamp with time zone | YES |  |
| next_followup_at | timestamp with time zone | YES |  |
| alternate_phone | text | YES |  |
| date_of_birth | text | YES |  |
| gender | text | YES |  |
| address_line1 | text | YES |  |
| city | text | YES |  |
| state | text | YES |  |
| pincode | text | YES |  |
| notes | text | YES |  |
| entry_date | timestamp with time zone | YES | now() |
| district | text | YES |  |
| student_interest_level | text | YES |  |
| parent_decision_status | text | YES |  |
| academic_year | text | YES |  |
| wa_opt_in | boolean | NO | false |
| wa_opt_in_at | timestamp with time zone | YES |  |
| wa_opt_in_source | text | YES |  |
| wa_opt_out_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `counselor_id` → `admission_counselors.id`
- `assigned_counselor_id` → `profiles.id`
- `created_by` → `profiles.id`
- `institution_id` → `institutions.id`
- `learner_profile_id` → `learners_profiles.id`

### `admission_process_metrics` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| institution_id | uuid | YES |  |
| month | timestamp with time zone | YES |  |
| total_leads | bigint | YES |  |
| enrolled_count | bigint | YES |  |
| avg_cycle_time_hours | numeric | YES |  |
| avg_first_response_hours | numeric | YES |  |
| first_contact_sla_pct | numeric | YES |  |
| lost_rate_pct | numeric | YES |  |
| conversion_rate_pct | numeric | YES |  |

### `admission_sms_logs` (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| lead_id | uuid | NO |  |
| template_id | uuid | YES |  |
| phone_number | character varying(20) | NO |  |
| message_content | text | NO |  |
| provider | USER-DEFINED | NO | 'msg91'::sms_provider |
| provider_message_id | character varying(255) | YES |  |
| status | USER-DEFINED | NO | 'pending'::sms_delivery_status |
| error_message | text | YES |  |
| dlt_template_id | character varying(50) | YES |  |
| dlt_entity_id | character varying(50) | YES |  |
| cost | numeric | YES |  |
| segments | integer | NO | 1 |
| sent_at | timestamp with time zone | YES |  |
| delivered_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`
- `template_id` → `admission_communication_templates.id`

### `admission_tasks` (20 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| assigned_to | uuid | YES |  |
| task_type | USER-DEFINED | NO |  |
| title | text | NO |  |
| description | text | YES |  |
| due_at | timestamp with time zone | NO |  |
| reminder_at | timestamp with time zone | YES |  |
| status | USER-DEFINED | YES | 'pending'::task_status |
| completed_at | timestamp with time zone | YES |  |
| completed_by | uuid | YES |  |
| outcome | text | YES |  |
| outcome_notes | text | YES |  |
| priority | integer | YES | 50 |
| created_by_system | boolean | YES | false |
| workflow_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES |  |

**Foreign Keys:**
- `lead_id` → `admission_leads.id`
- `created_by` → `profiles.id`
- `completed_by` → `profiles.id`
- `assigned_to` → `profiles.id`
- `institution_id` → `institutions.id`

### `admission_whatsapp_logs` (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| lead_id | uuid | NO |  |
| template_id | uuid | YES |  |
| recipient_phone | text | NO |  |
| message_content | text | NO |  |
| delivery_status | USER-DEFINED | NO | 'pending'::whatsapp_delivery_status |
| whatsapp_message_id | text | YES |  |
| error_message | text | YES |  |
| sent_at | timestamp with time zone | YES |  |
| delivered_at | timestamp with time zone | YES |  |
| read_at | timestamp with time zone | YES |  |
| failed_at | timestamp with time zone | YES |  |
| campaign_id | uuid | YES |  |
| workflow_execution_id | uuid | YES |  |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`
- `lead_id` → `admission_leads.id`
- `template_id` → `admission_communication_templates.id`

### `admission_workflow_configs` (22 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| config_name | text | NO |  |
| academic_year | text | NO |  |
| active_stages | ARRAY | NO | ARRAY['new'::text, 'contacted'::text,... |
| stage_configs | jsonb | NO | '{}'::jsonb |
| has_entrance_exam | boolean | YES | false |
| entrance_exam_type | text | YES |  |
| has_gd_pi | boolean | YES | false |
| has_merit_list | boolean | YES | true |
| merit_criteria | jsonb | YES | '{}'::jsonb |
| has_government_quota | boolean | YES | false |
| government_quota_percentage | numeric | YES | 0 |
| has_management_quota | boolean | YES | true |
| has_nri_quota | boolean | YES | false |
| quota_config | jsonb | YES | '{}'::jsonb |
| required_documents | ARRAY | YES | ARRAY['photo'::text, 'id_proof'::text... |
| default_templates | jsonb | YES | '{}'::jsonb |
| sla_config | jsonb | YES | '{}'::jsonb |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `admission_workflows` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| name | character varying(255) | NO |  |
| description | text | YES |  |
| trigger_type | character varying(100) | NO | 'manual'::character varying |
| trigger_conditions | jsonb | NO | '{}'::jsonb |
| steps | jsonb | NO | '[]'::jsonb |
| is_active | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `admissions` (23 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | YES |  |
| student_id | uuid | YES |  |
| program_id | uuid | YES |  |
| admission_number | text | YES |  |
| admission_date | date | YES |  |
| admission_type | text | YES | 'regular'::text |
| academic_year | text | YES |  |
| status | text | YES | 'active'::text |
| fee_structure | jsonb | YES | '{}'::jsonb |
| documents | jsonb | YES | '[]'::jsonb |
| notes | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| roll_number | text | YES |  |
| section_allocation | text | YES |  |
| department_allocation | text | YES |  |
| student_portal_login_created | boolean | YES | false |
| student_portal_login_created_at | timestamp with time zone | YES |  |
| id_card_generated | boolean | YES | false |
| id_card_generated_at | timestamp with time zone | YES |  |
| lms_access_given | boolean | YES | false |
| lms_access_given_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `student_id` → `students.id`
- `program_id` → `programs.id`
- `institution_id` → `institutions.id`

### `chatbot_configs` (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| name | text | NO |  |
| welcome_message | text | NO | 'Hello! I''m the JKKN Admissions Assi... |
| system_prompt | text | YES |  |
| enabled_channels | ARRAY | YES | '{website,whatsapp}'::text[] |
| languages | ARRAY | YES | '{en}'::text[] |
| business_hours | jsonb | YES | '{"end": "18:00", "start": "09:00", "... |
| handoff_triggers | ARRAY | YES | '{"speak to human","talk to counselor... |
| max_turns_before_handoff | integer | NO | 10 |
| collect_contact_info | boolean | NO | true |
| is_active | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `chatbot_knowledge_base` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| chatbot_id | uuid | NO |  |
| title | text | NO |  |
| source_type | text | NO |  |
| source_url | text | YES |  |
| content | text | NO |  |
| content_embedding | text | YES |  |
| status | text | NO | 'active'::text |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `chatbot_id` → `chatbot_configs.id`

### `chatbot_messages` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| session_id | uuid | NO |  |
| role | text | NO |  |
| content | text | NO |  |
| metadata | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `session_id` → `chatbot_sessions.id`

### `chatbot_sessions` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| chatbot_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| channel | text | NO |  |
| visitor_id | text | YES |  |
| lead_id | uuid | YES |  |
| wa_conversation_id | uuid | YES |  |
| context | jsonb | NO | '{}'::jsonb |
| status | text | NO | 'active'::text |
| handed_off_to | uuid | YES |  |
| handoff_reason | text | YES |  |
| message_count | integer | NO | 0 |
| started_at | timestamp with time zone | NO | now() |
| last_activity_at | timestamp with time zone | NO | now() |
| ended_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `chatbot_id` → `chatbot_configs.id`
- `handed_off_to` → `profiles.id`
- `lead_id` → `admission_leads.id`
- `institution_id` → `institutions.id`
- `wa_conversation_id` → `wa_conversations.id`

### `education_consultants` (59 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| consultant_type | character varying(20) | NO | 'external'::character varying |
| code | character varying(30) | YES |  |
| name | character varying(255) | NO |  |
| email | character varying(255) | YES |  |
| phone | character varying(20) | YES |  |
| alternate_phone | character varying(20) | YES |  |
| profile_photo_url | text | YES |  |
| learner_profile_id | uuid | YES |  |
| company_name | character varying(255) | YES |  |
| company_registration_no | character varying(100) | YES |  |
| gst_number | character varying(20) | YES |  |
| pan_number | character varying(20) | YES |  |
| address_line1 | text | YES |  |
| address_line2 | text | YES |  |
| city | character varying(100) | YES |  |
| state | character varying(100) | YES |  |
| pincode | character varying(10) | YES |  |
| country | character varying(100) | YES | 'India'::character varying |
| bank_name | character varying(100) | YES |  |
| bank_account_number | character varying(30) | YES |  |
| bank_ifsc | character varying(15) | YES |  |
| bank_branch | character varying(100) | YES |  |
| upi_id | character varying(100) | YES |  |
| payment_preference | character varying(20) | YES | 'bank'::character varying |
| covered_states | jsonb | YES | '[]'::jsonb |
| covered_cities | jsonb | YES | '[]'::jsonb |
| covered_regions | jsonb | YES | '[]'::jsonb |
| specialized_degrees | ARRAY | YES |  |
| specialized_programs | ARRAY | YES |  |
| specialized_departments | ARRAY | YES |  |
| relationship_score | integer | YES | 50 |
| performance_rating | numeric | YES |  |
| total_leads_referred | integer | YES | 0 |
| total_conversions | integer | YES | 0 |
| conversion_rate | numeric | YES |  |
| total_commission_earned | numeric | YES | 0 |
| total_commission_paid | numeric | YES | 0 |
| pending_commission | numeric | YES |  |
| contract_start_date | date | YES |  |
| contract_end_date | date | YES |  |
| contract_status | character varying(20) | YES | 'active'::character varying |
| contract_document_url | text | YES |  |
| contract_terms | jsonb | YES |  |
| status | character varying(20) | YES | 'active'::character varying |
| onboarded_at | timestamp with time zone | YES |  |
| onboarded_by | uuid | YES |  |
| internal_notes | text | YES |  |
| tags | jsonb | YES | '[]'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES |  |
| updated_by | uuid | YES |  |
| referrer_user_id | uuid | YES |  |
| contact_person | character varying(255) | YES |  |
| tier | USER-DEFINED | NO | 'bronze'::consultant_tier |
| website | character varying | YES |  |
| bank_account_holder | character varying | YES |  |

**Foreign Keys:**
- `institution_id` → `institutions.id`

### `lead_activity_log` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| activity_type | text | NO |  |
| activity_description | text | YES |  |
| score_change | integer | YES | 0 |
| score_type | text | YES |  |
| channel | USER-DEFINED | YES |  |
| metadata | jsonb | YES | '{}'::jsonb |
| performed_by | uuid | YES |  |
| is_system_generated | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `performed_by` → `profiles.id`
- `lead_id` → `admission_leads.id`

### `lead_sources` (18 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| source_type | USER-DEFINED | NO |  |
| source_name | text | NO |  |
| utm_medium | text | YES |  |
| utm_campaign | text | YES |  |
| utm_content | text | YES |  |
| utm_term | text | YES |  |
| landing_page | text | YES |  |
| referrer | text | YES |  |
| referral_code | text | YES |  |
| touch_number | integer | YES | 1 |
| is_first_touch | boolean | YES | false |
| is_last_touch | boolean | YES | false |
| partner_id | text | YES |  |
| partner_name | text | YES |  |
| touched_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `lead_id` → `admission_leads.id`

### `lead_stage_history` (11 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| lead_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| from_stage | text | YES |  |
| to_stage | text | NO |  |
| transitioned_at | timestamp with time zone | YES | now() |
| time_in_previous_stage | interval | YES |  |
| triggered_by | text | YES | 'manual'::text |
| trigger_reason | text | YES |  |
| changed_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `changed_by` → `profiles.id`
- `institution_id` → `institutions.id`
- `lead_id` → `admission_leads.id`