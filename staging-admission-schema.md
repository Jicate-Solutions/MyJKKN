# Admission-Related Tables - STAGING DB Schema
# Project: hhprjbgknupaplivtoib (MyJKKN-Staging)
# Generated: 2026-04-06
# Total tables: 55
# Total columns: 1071

## Table of Contents

1. activity_alert_rules (10 columns)
2. admission_ai_insights (12 columns)
3. admission_applications (37 columns)
4. admission_assignment_rules (10 columns)
5. admission_call_intelligence (21 columns)
6. admission_call_logs (32 columns)
7. admission_callback_queue (23 columns)
8. admission_campaign_logs (15 columns)
9. admission_campaign_queue (22 columns)
10. admission_communication_templates (14 columns)
11. admission_counselors (13 columns)
12. admission_daily_briefings (11 columns)
13. admission_drip_execution_logs (6 columns)
14. admission_drip_schedule (21 columns)
15. admission_drip_sequences (18 columns)
16. admission_email_logs (18 columns)
17. admission_lead_activities (14 columns)
18. admission_lead_scores (16 columns)
19. admission_lead_stage_history (7 columns)
20. admission_leads (81 columns)
21. admission_process_metrics (9 columns)
22. admission_scoring_rules (10 columns)
23. admission_sms_logs (18 columns)
24. admission_tasks (20 columns)
25. admission_whatsapp_logs (18 columns)
26. admission_workflow_configs (22 columns)
27. admission_workflow_executions (10 columns)
28. admission_workflows (10 columns)
29. admissions (23 columns)
30. consultant_commission_structures (28 columns)
31. consultant_commission_transactions (33 columns)
32. consultant_communications (31 columns)
33. consultant_documents (25 columns)
34. consultant_lead_attributions (26 columns)
35. consultant_payment_queries (26 columns)
36. consultant_payout_batches (29 columns)
37. education_consultants (59 columns)
38. expo_daily_reports (23 columns)
39. expo_event_team_members (9 columns)
40. expo_events (21 columns)
41. expo_lead_capture_links (8 columns)
42. expo_masters (13 columns)
43. referral_reward_configs (26 columns)
44. referral_rewards (28 columns)
45. telephony_health_events (8 columns)
46. wa_audience_segments (14 columns)
47. wa_consent_log (9 columns)
48. wa_conversations (17 columns)
49. wa_document_catalog (14 columns)
50. wa_message_logs (18 columns)
51. wa_messages (11 columns)
52. wa_phone_numbers (13 columns)
53. wa_quick_replies (10 columns)
54. wa_settings (16 columns)
55. waste_incidents (15 columns)

---

## activity_alert_rules (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | event_type | text | text |  | NO |  |
| 4 | is_enabled | boolean | bool | true | NO |  |
| 5 | notify_assigned_counselor | boolean | bool | true | NO |  |
| 6 | notify_additional_users | ARRAY | _uuid | '{}'::uuid[] | YES |  |
| 7 | notification_channels | ARRAY | _text | '{PUSH,IN_APP}'::text[] | YES |  |
| 8 | conditions | jsonb | jsonb | '{}'::jsonb | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_ai_insights (12 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | insight_type | character varying | varchar |  | NO | 100 |
| 4 | title | character varying | varchar |  | NO | 500 |
| 5 | description | text | text |  | NO |  |
| 6 | severity | character varying | varchar | 'info'::character varying | NO | 50 |
| 7 | data | jsonb | jsonb | '{}'::jsonb | NO |  |
| 8 | actions | jsonb | jsonb | '[]'::jsonb | NO |  |
| 9 | is_read | boolean | bool | false | NO |  |
| 10 | is_dismissed | boolean | bool | false | NO |  |
| 11 | expires_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_applications (37 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | NO |  |
| 4 | learner_profile_id | uuid | uuid |  | YES |  |
| 5 | program_id | uuid | uuid |  | NO |  |
| 6 | campus_id | uuid | uuid |  | YES |  |
| 7 | academic_year | text | text |  | NO |  |
| 8 | application_number | text | text |  | YES |  |
| 9 | form_data | jsonb | jsonb | '{}'::jsonb | YES |  |
| 10 | current_step | integer | int4 | 1 | YES |  |
| 11 | total_steps | integer | int4 | 6 | YES |  |
| 12 | completion_percentage | numeric | numeric | 0 | YES |  |
| 13 | steps_completed | jsonb | jsonb | '[]'::jsonb | YES |  |
| 14 | status | USER-DEFINED | application_status | 'draft'::application_status | YES |  |
| 15 | status_changed_at | timestamp with time zone | timestamptz |  | YES |  |
| 16 | status_history | jsonb | jsonb | '[]'::jsonb | YES |  |
| 17 | submitted_at | timestamp with time zone | timestamptz |  | YES |  |
| 18 | last_saved_at | timestamp with time zone | timestamptz | now() | YES |  |
| 19 | reviewer_id | uuid | uuid |  | YES |  |
| 20 | reviewed_at | timestamp with time zone | timestamptz |  | YES |  |
| 21 | review_notes | text | text |  | YES |  |
| 22 | rejection_reason | text | text |  | YES |  |
| 23 | can_reapply | boolean | bool | true | YES |  |
| 24 | expires_at | timestamp with time zone | timestamptz |  | YES |  |
| 25 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 26 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 27 | quota_type | text | text |  | YES |  |
| 28 | seat_type | text | text |  | YES |  |
| 29 | marks_10th_percentage | numeric | numeric |  | YES |  |
| 30 | marks_10th_board | text | text |  | YES |  |
| 31 | marks_12th_percentage | numeric | numeric |  | YES |  |
| 32 | marks_12th_board | text | text |  | YES |  |
| 33 | marks_ug_percentage | numeric | numeric |  | YES |  |
| 34 | marks_ug_university | text | text |  | YES |  |
| 35 | entrance_exam_name | text | text |  | YES |  |
| 36 | entrance_exam_score | numeric | numeric |  | YES |  |
| 37 | entrance_exam_rank | integer | int4 |  | YES |  |

## admission_assignment_rules (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | character varying | varchar |  | NO | 255 |
| 4 | description | text | text |  | YES |  |
| 5 | priority | integer | int4 | 10 | NO |  |
| 6 | is_active | boolean | bool | true | NO |  |
| 7 | criteria | jsonb | jsonb | '[]'::jsonb | NO |  |
| 8 | action | jsonb | jsonb | '{}'::jsonb | NO |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_call_intelligence (21 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | call_log_id | uuid | uuid |  | NO |  |
| 4 | call_sid | text | text |  | NO |  |
| 5 | analyze_job_id | text | text |  | YES |  |
| 6 | analyze_status | text | text | 'pending'::text | NO |  |
| 7 | analyze_submitted_at | timestamp with time zone | timestamptz |  | YES |  |
| 8 | analyze_completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 9 | transcription | text | text |  | YES |  |
| 10 | transcription_language | text | text |  | YES |  |
| 11 | sentiment | text | text |  | YES |  |
| 12 | sentiment_score | numeric | numeric |  | YES |  |
| 13 | summary | text | text |  | YES |  |
| 14 | categories | ARRAY | _text |  | YES |  |
| 15 | extracted_name | text | text |  | YES |  |
| 16 | extracted_location | text | text |  | YES |  |
| 17 | extracted_course | text | text |  | YES |  |
| 18 | enrichment_applied | boolean | bool | false | YES |  |
| 19 | enrichment_applied_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 21 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_call_logs (32 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | YES |  |
| 4 | counselor_id | uuid | uuid |  | YES |  |
| 5 | call_sid | text | text |  | NO |  |
| 6 | direction | text | text | 'outbound'::text | NO |  |
| 7 | from_number | text | text |  | NO |  |
| 8 | to_number | text | text |  | NO |  |
| 9 | status | text | text | 'initiated'::text | NO |  |
| 10 | duration_seconds | integer | int4 |  | YES |  |
| 11 | recording_url | text | text |  | YES |  |
| 12 | recording_duration_seconds | integer | int4 |  | YES |  |
| 13 | call_notes | text | text |  | YES |  |
| 14 | call_disposition | text | text |  | YES |  |
| 15 | follow_up_date | date | date |  | YES |  |
| 16 | cost_amount | numeric | numeric |  | YES |  |
| 17 | cost_currency | text | text | 'INR'::text | YES |  |
| 18 | started_at | timestamp with time zone | timestamptz |  | YES |  |
| 19 | answered_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | ended_at | timestamp with time zone | timestamptz |  | YES |  |
| 21 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 22 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |
| 23 | pipeline_stage | text | text | 'captured'::text | YES |  |
| 24 | intelligence_id | uuid | uuid |  | YES |  |
| 25 | auto_sms_sent | boolean | bool | false | YES |  |
| 26 | auto_sms_sid | text | text |  | YES |  |
| 27 | callback_queued | boolean | bool | false | YES |  |
| 28 | callback_queue_id | uuid | uuid |  | YES |  |
| 29 | caller_location | text | text |  | YES |  |
| 30 | caller_attempt_number | integer | int4 | 1 | YES |  |
| 31 | caller_journey_context | text | text |  | YES |  |
| 32 | auto_sms_skipped_reason | text | text |  | YES |  |

## admission_callback_queue (23 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | call_log_id | uuid | uuid |  | NO |  |
| 4 | lead_id | uuid | uuid |  | YES |  |
| 5 | assigned_counselor_id | uuid | uuid |  | YES |  |
| 6 | caller_number | text | text |  | NO |  |
| 7 | priority | text | text | 'normal'::text | NO |  |
| 8 | status | text | text | 'pending'::text | NO |  |
| 9 | missed_count_7d | integer | int4 | 1 | YES |  |
| 10 | ever_connected | boolean | bool | false | YES |  |
| 11 | escalated | boolean | bool | false | YES |  |
| 12 | escalated_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | callback_call_id | uuid | uuid |  | YES |  |
| 14 | resolved_at | timestamp with time zone | timestamptz |  | YES |  |
| 15 | resolved_by | uuid | uuid |  | YES |  |
| 16 | resolution_notes | text | text |  | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 18 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 19 | callback_due_by | timestamp with time zone | timestamptz |  | YES |  |
| 20 | sla_breached | boolean | bool | false | YES |  |
| 21 | sla_breached_at | timestamp with time zone | timestamptz |  | YES |  |
| 22 | escalation_level | integer | int4 | 0 | YES |  |
| 23 | last_sms_sent_at | timestamp with time zone | timestamptz |  | YES |  |

## admission_campaign_logs (15 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | queue_id | uuid | uuid |  | YES |  |
| 4 | workflow_id | uuid | uuid |  | YES |  |
| 5 | lead_id | uuid | uuid |  | YES |  |
| 6 | log_type | text | text |  | NO |  |
| 7 | step_type | USER-DEFINED | campaign_step_type |  | YES |  |
| 8 | action | text | text |  | NO |  |
| 9 | request_data | jsonb | jsonb |  | YES |  |
| 10 | response_data | jsonb | jsonb |  | YES |  |
| 11 | started_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | duration_ms | integer | int4 |  | YES |  |
| 14 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 15 | created_by | uuid | uuid |  | YES |  |

## admission_campaign_queue (22 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | workflow_id | uuid | uuid |  | YES |  |
| 4 | lead_id | uuid | uuid |  | YES |  |
| 5 | application_id | uuid | uuid |  | YES |  |
| 6 | step_type | USER-DEFINED | campaign_step_type |  | NO |  |
| 7 | step_config | jsonb | jsonb | '{}'::jsonb | NO |  |
| 8 | step_order | integer | int4 | 0 | YES |  |
| 9 | scheduled_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | execute_after | timestamp with time zone | timestamptz |  | YES |  |
| 11 | status | USER-DEFINED | campaign_step_status | 'pending'::campaign_step_status | NO |  |
| 12 | attempts | integer | int4 | 0 | YES |  |
| 13 | max_attempts | integer | int4 | 3 | YES |  |
| 14 | last_attempt_at | timestamp with time zone | timestamptz |  | YES |  |
| 15 | execution_id | uuid | uuid |  | YES |  |
| 16 | parent_queue_id | uuid | uuid |  | YES |  |
| 17 | error_message | text | text |  | YES |  |
| 18 | error_details | jsonb | jsonb |  | YES |  |
| 19 | priority | integer | int4 | 0 | YES |  |
| 20 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 21 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 22 | completed_at | timestamp with time zone | timestamptz |  | YES |  |

## admission_communication_templates (14 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | character varying | varchar |  | NO | 255 |
| 4 | description | text | text |  | YES |  |
| 5 | channel | character varying | varchar | 'whatsapp'::character varying | NO | 50 |
| 6 | category | character varying | varchar | 'general'::character varying | NO | 100 |
| 7 | subject | character varying | varchar |  | YES | 500 |
| 8 | content | text | text |  | NO |  |
| 9 | variables | jsonb | jsonb | '[]'::jsonb | NO |  |
| 10 | is_active | boolean | bool | true | NO |  |
| 11 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 12 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |
| 13 | attachment_type | text | text |  | YES |  |
| 14 | attachment_url | text | text |  | YES |  |

## admission_counselors (13 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | name | text | text |  | NO |  |
| 3 | email | text | text |  | YES |  |
| 4 | institution_id | uuid | uuid |  | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 6 | user_id | uuid | uuid |  | YES |  |
| 7 | is_active | boolean | bool | true | YES |  |
| 8 | phone | text | text |  | YES |  |
| 9 | designation | text | text |  | YES |  |
| 10 | current_leads | integer | int4 | 0 | YES |  |
| 11 | max_leads | integer | int4 | 50 | YES |  |
| 12 | specializations | ARRAY | _text |  | YES |  |
| 13 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_daily_briefings (11 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | user_id | uuid | uuid |  | NO |  |
| 4 | briefing_date | date | date |  | NO |  |
| 5 | user_tier | character varying | varchar | 'counselor'::character varying | NO | 50 |
| 6 | content | jsonb | jsonb | '{}'::jsonb | NO |  |
| 7 | is_read | boolean | bool | false | NO |  |
| 8 | read_at | timestamp with time zone | timestamptz |  | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | role | text | text | 'counselor'::text | NO |  |
| 11 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_drip_execution_logs (6 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | sequence_id | uuid | uuid |  | NO |  |
| 3 | schedule_id | uuid | uuid |  | YES |  |
| 4 | event_type | text | text |  | NO |  |
| 5 | event_data | jsonb | jsonb | '{}'::jsonb | YES |  |
| 6 | created_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_drip_schedule (21 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | sequence_id | uuid | uuid |  | NO |  |
| 3 | step_index | integer | int4 |  | NO |  |
| 4 | action_id | text | text |  | NO |  |
| 5 | action_type | text | text |  | NO |  |
| 6 | action_config | jsonb | jsonb | '{}'::jsonb | NO |  |
| 7 | scheduled_at | timestamp with time zone | timestamptz |  | NO |  |
| 8 | delay_hours | integer | int4 | 0 | YES |  |
| 9 | delay_days | integer | int4 | 0 | YES |  |
| 10 | conditions | jsonb | jsonb | '[]'::jsonb | YES |  |
| 11 | status | USER-DEFINED | drip_step_status | 'pending'::drip_step_status | NO |  |
| 12 | executed_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | execution_result | jsonb | jsonb |  | YES |  |
| 14 | error_message | text | text |  | YES |  |
| 15 | skipped_at | timestamp with time zone | timestamptz |  | YES |  |
| 16 | skipped_by | uuid | uuid |  | YES |  |
| 17 | skip_reason | text | text |  | YES |  |
| 18 | retry_count | integer | int4 | 0 | YES |  |
| 19 | last_retry_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 21 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_drip_sequences (18 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | workflow_id | uuid | uuid |  | NO |  |
| 4 | lead_id | uuid | uuid |  | NO |  |
| 5 | status | USER-DEFINED | drip_sequence_status | 'active'::drip_sequence_status | NO |  |
| 6 | current_step_index | integer | int4 | 0 | NO |  |
| 7 | total_steps | integer | int4 |  | NO |  |
| 8 | started_at | timestamp with time zone | timestamptz | now() | NO |  |
| 9 | paused_at | timestamp with time zone | timestamptz |  | YES |  |
| 10 | resumed_at | timestamp with time zone | timestamptz |  | YES |  |
| 11 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | context_data | jsonb | jsonb | '{}'::jsonb | YES |  |
| 13 | error_message | text | text |  | YES |  |
| 14 | retry_count | integer | int4 | 0 | YES |  |
| 15 | max_retries | integer | int4 | 3 | YES |  |
| 16 | created_by | uuid | uuid |  | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 18 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_email_logs (18 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | YES |  |
| 4 | campaign_id | uuid | uuid |  | YES |  |
| 5 | template_id | uuid | uuid |  | YES |  |
| 6 | to_email | text | text |  | NO |  |
| 7 | from_email | text | text |  | NO |  |
| 8 | subject | text | text |  | NO |  |
| 9 | resend_message_id | text | text |  | YES |  |
| 10 | status | text | text | 'queued'::text | NO |  |
| 11 | opened_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | clicked_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | bounced_at | timestamp with time zone | timestamptz |  | YES |  |
| 14 | error_message | text | text |  | YES |  |
| 15 | tags | jsonb | jsonb | '[]'::jsonb | YES |  |
| 16 | metadata | jsonb | jsonb | '{}'::jsonb | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 18 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_lead_activities (14 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | lead_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | activity_type | character varying | varchar |  | NO | 100 |
| 5 | title | character varying | varchar |  | NO | 500 |
| 6 | description | text | text |  | YES |  |
| 7 | metadata | jsonb | jsonb | '{}'::jsonb | NO |  |
| 8 | performed_by | uuid | uuid |  | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | subject | text | text |  | YES |  |
| 11 | outcome | text | text |  | YES |  |
| 12 | scheduled_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 14 | created_by | uuid | uuid |  | YES |  |

## admission_lead_scores (16 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | lead_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | total_score | integer | int4 | 0 | NO |  |
| 5 | score_breakdown | jsonb | jsonb | '[]'::jsonb | NO |  |
| 6 | score_factors | jsonb | jsonb | '[]'::jsonb | NO |  |
| 7 | calculated_at | timestamp with time zone | timestamptz | now() | NO |  |
| 8 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 9 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | engagement_score | integer | int4 | 0 | NO |  |
| 11 | quality_score | integer | int4 | 0 | NO |  |
| 12 | factors | jsonb | jsonb | '{}'::jsonb | NO |  |
| 13 | score_category | character varying | varchar | 'Unknown'::character varying | NO | 50 |
| 14 | recommended_action | text | text |  | YES |  |
| 15 | scoring_rule_id | uuid | uuid |  | YES |  |
| 16 | expires_at | timestamp with time zone | timestamptz |  | YES |  |

## admission_lead_stage_history (7 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | lead_id | uuid | uuid |  | NO |  |
| 3 | from_stage | text | text |  | YES |  |
| 4 | to_stage | text | text |  | NO |  |
| 5 | changed_by | uuid | uuid |  | YES |  |
| 6 | notes | text | text |  | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_leads (81 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | learner_profile_id | uuid | uuid |  | YES |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | engagement_score | integer | int4 | 0 | YES |  |
| 5 | quality_score | integer | int4 | 0 | YES |  |
| 6 | combined_score | integer | int4 |  | YES |  |
| 7 | score_breakdown | jsonb | jsonb | '{}'::jsonb | YES |  |
| 8 | conversion_probability | numeric | numeric | 0.00 | YES |  |
| 9 | stage | USER-DEFINED | admission_lead_stage | 'new'::admission_lead_stage | YES |  |
| 10 | stage_changed_at | timestamp with time zone | timestamptz | now() | YES |  |
| 11 | previous_stage | USER-DEFINED | admission_lead_stage |  | YES |  |
| 12 | assigned_counselor_id | uuid | uuid |  | YES |  |
| 13 | assigned_at | timestamp with time zone | timestamptz |  | YES |  |
| 14 | ownership_mode | USER-DEFINED | lead_ownership_mode | 'permanent'::lead_ownership_mode | YES |  |
| 15 | last_activity_at | timestamp with time zone | timestamptz | now() | YES |  |
| 16 | last_contact_at | timestamp with time zone | timestamptz |  | YES |  |
| 17 | total_messages_sent | integer | int4 | 0 | YES |  |
| 18 | messages_this_week | integer | int4 | 0 | YES |  |
| 19 | last_message_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | preferred_channel | USER-DEFINED | communication_channel_type | 'whatsapp'::communication_channel_type | YES |  |
| 21 | tags | ARRAY | _text | '{}'::text[] | YES |  |
| 22 | is_hot_lead | boolean | bool | false | YES |  |
| 23 | is_priority | boolean | bool | false | YES |  |
| 24 | parent_name | text | text |  | YES |  |
| 25 | parent_phone | text | text |  | YES |  |
| 26 | parent_email | text | text |  | YES |  |
| 27 | parent_opted_in | boolean | bool | false | YES |  |
| 28 | interested_programs | ARRAY | _uuid | '{}'::uuid[] | YES |  |
| 29 | preferred_campus | uuid | uuid |  | YES |  |
| 30 | is_active | boolean | bool | true | YES |  |
| 31 | is_dormant | boolean | bool | false | YES |  |
| 32 | dormant_at | timestamp with time zone | timestamptz |  | YES |  |
| 33 | is_lost | boolean | bool | false | YES |  |
| 34 | lost_reason | text | text |  | YES |  |
| 35 | lost_at | timestamp with time zone | timestamptz |  | YES |  |
| 36 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 37 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 38 | created_by | uuid | uuid |  | YES |  |
| 39 | funnel_stage | text | text | 'new'::text | YES |  |
| 40 | full_name | text | text |  | YES |  |
| 41 | email | text | text |  | YES |  |
| 42 | phone | text | text |  | YES |  |
| 43 | source | text | text | 'website'::text | YES |  |
| 44 | counselor_id | uuid | uuid |  | YES |  |
| 45 | score | integer | int4 | 0 | YES |  |
| 46 | score_category | character varying | varchar |  | YES | 50 |
| 47 | score_updated_at | timestamp with time zone | timestamptz |  | YES |  |
| 48 | next_followup_at | timestamp with time zone | timestamptz |  | YES |  |
| 49 | alternate_phone | text | text |  | YES |  |
| 50 | date_of_birth | text | text |  | YES |  |
| 51 | gender | text | text |  | YES |  |
| 52 | address_line1 | text | text |  | YES |  |
| 53 | city | text | text |  | YES |  |
| 54 | state | text | text |  | YES |  |
| 55 | pincode | text | text |  | YES |  |
| 56 | notes | text | text |  | YES |  |
| 57 | entry_date | timestamp with time zone | timestamptz | now() | YES |  |
| 58 | district | text | text |  | YES |  |
| 59 | student_interest_level | text | text |  | YES |  |
| 60 | parent_decision_status | text | text |  | YES |  |
| 61 | academic_year | text | text |  | YES |  |
| 62 | wa_opt_in | boolean | bool | false | NO |  |
| 63 | wa_opt_in_at | timestamp with time zone | timestamptz |  | YES |  |
| 64 | wa_opt_in_source | text | text |  | YES |  |
| 65 | wa_opt_out_at | timestamp with time zone | timestamptz |  | YES |  |
| 66 | expo_event_id | uuid | uuid |  | YES |  |
| 67 | referral_type | text | text |  | YES |  |
| 68 | referred_by_id | uuid | uuid |  | YES |  |
| 69 | referred_by_name | text | text |  | YES |  |
| 70 | referrer_id | uuid | uuid |  | YES |  |
| 71 | first_name | text | text |  | YES |  |
| 72 | last_name | text | text |  | YES |  |
| 73 | degree_id | uuid | uuid |  | YES |  |
| 74 | department_id | uuid | uuid |  | YES |  |
| 75 | program_id | uuid | uuid |  | YES |  |
| 76 | publisher_id | uuid | uuid |  | YES |  |
| 77 | application_number | text | text |  | YES |  |
| 78 | source_detail | text | text |  | YES |  |
| 79 | is_duplicate | boolean | bool | false | YES |  |
| 80 | duplicate_of | uuid | uuid |  | YES |  |
| 81 | country | text | text |  | YES |  |

## admission_process_metrics (9 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | institution_id | uuid | uuid |  | YES |  |
| 2 | month | timestamp with time zone | timestamptz |  | YES |  |
| 3 | total_leads | bigint | int8 |  | YES |  |
| 4 | enrolled_count | bigint | int8 |  | YES |  |
| 5 | avg_cycle_time_hours | numeric | numeric |  | YES |  |
| 6 | avg_first_response_hours | numeric | numeric |  | YES |  |
| 7 | first_contact_sla_pct | numeric | numeric |  | YES |  |
| 8 | lost_rate_pct | numeric | numeric |  | YES |  |
| 9 | conversion_rate_pct | numeric | numeric |  | YES |  |

## admission_scoring_rules (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | text | text |  | NO |  |
| 4 | description | text | text |  | YES |  |
| 5 | category | text | text |  | NO |  |
| 6 | criteria | jsonb | jsonb | '[]'::jsonb | NO |  |
| 7 | points | integer | int4 | 0 | NO |  |
| 8 | is_active | boolean | bool | true | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 10 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_sms_logs (18 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | NO |  |
| 4 | template_id | uuid | uuid |  | YES |  |
| 5 | phone_number | character varying | varchar |  | NO | 20 |
| 6 | message_content | text | text |  | NO |  |
| 7 | provider | USER-DEFINED | sms_provider | 'msg91'::sms_provider | NO |  |
| 8 | provider_message_id | character varying | varchar |  | YES | 255 |
| 9 | status | USER-DEFINED | sms_delivery_status | 'pending'::sms_delivery_status | NO |  |
| 10 | error_message | text | text |  | YES |  |
| 11 | dlt_template_id | character varying | varchar |  | YES | 50 |
| 12 | dlt_entity_id | character varying | varchar |  | YES | 50 |
| 13 | cost | numeric | numeric |  | YES |  |
| 14 | segments | integer | int4 | 1 | NO |  |
| 15 | sent_at | timestamp with time zone | timestamptz |  | YES |  |
| 16 | delivered_at | timestamp with time zone | timestamptz |  | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 18 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admission_tasks (20 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | lead_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | assigned_to | uuid | uuid |  | YES |  |
| 5 | task_type | USER-DEFINED | task_type |  | NO |  |
| 6 | title | text | text |  | NO |  |
| 7 | description | text | text |  | YES |  |
| 8 | due_at | timestamp with time zone | timestamptz |  | NO |  |
| 9 | reminder_at | timestamp with time zone | timestamptz |  | YES |  |
| 10 | status | USER-DEFINED | task_status | 'pending'::task_status | YES |  |
| 11 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | completed_by | uuid | uuid |  | YES |  |
| 13 | outcome | text | text |  | YES |  |
| 14 | outcome_notes | text | text |  | YES |  |
| 15 | priority | integer | int4 | 50 | YES |  |
| 16 | created_by_system | boolean | bool | false | YES |  |
| 17 | workflow_id | uuid | uuid |  | YES |  |
| 18 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 19 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 20 | created_by | uuid | uuid |  | YES |  |

## admission_whatsapp_logs (18 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | NO |  |
| 4 | template_id | uuid | uuid |  | YES |  |
| 5 | recipient_phone | text | text |  | NO |  |
| 6 | message_content | text | text |  | NO |  |
| 7 | delivery_status | USER-DEFINED | whatsapp_delivery_status | 'pending'::whatsapp_delivery_status | NO |  |
| 8 | whatsapp_message_id | text | text |  | YES |  |
| 9 | error_message | text | text |  | YES |  |
| 10 | sent_at | timestamp with time zone | timestamptz |  | YES |  |
| 11 | delivered_at | timestamp with time zone | timestamptz |  | YES |  |
| 12 | read_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | failed_at | timestamp with time zone | timestamptz |  | YES |  |
| 14 | campaign_id | uuid | uuid |  | YES |  |
| 15 | workflow_execution_id | uuid | uuid |  | YES |  |
| 16 | metadata | jsonb | jsonb | '{}'::jsonb | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 18 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_workflow_configs (22 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | config_name | text | text |  | NO |  |
| 4 | academic_year | text | text |  | NO |  |
| 5 | active_stages | ARRAY | _text | ARRAY['new'::text, 'contacted'::text, 'qualifie... | NO |  |
| 6 | stage_configs | jsonb | jsonb | '{}'::jsonb | NO |  |
| 7 | has_entrance_exam | boolean | bool | false | YES |  |
| 8 | entrance_exam_type | text | text |  | YES |  |
| 9 | has_gd_pi | boolean | bool | false | YES |  |
| 10 | has_merit_list | boolean | bool | true | YES |  |
| 11 | merit_criteria | jsonb | jsonb | '{}'::jsonb | YES |  |
| 12 | has_government_quota | boolean | bool | false | YES |  |
| 13 | government_quota_percentage | numeric | numeric | 0 | YES |  |
| 14 | has_management_quota | boolean | bool | true | YES |  |
| 15 | has_nri_quota | boolean | bool | false | YES |  |
| 16 | quota_config | jsonb | jsonb | '{}'::jsonb | YES |  |
| 17 | required_documents | ARRAY | _text | ARRAY['photo'::text, 'id_proof'::text, 'markshe... | YES |  |
| 18 | default_templates | jsonb | jsonb | '{}'::jsonb | YES |  |
| 19 | sla_config | jsonb | jsonb | '{}'::jsonb | YES |  |
| 20 | is_active | boolean | bool | true | YES |  |
| 21 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 22 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_workflow_executions (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | workflow_id | uuid | uuid |  | YES |  |
| 4 | lead_id | uuid | uuid |  | YES |  |
| 5 | status | text | text | 'pending'::text | NO |  |
| 6 | started_at | timestamp with time zone | timestamptz |  | YES |  |
| 7 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 8 | error_message | text | text |  | YES |  |
| 9 | execution_data | jsonb | jsonb |  | YES |  |
| 10 | created_at | timestamp with time zone | timestamptz | now() | YES |  |

## admission_workflows (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | character varying | varchar |  | NO | 255 |
| 4 | description | text | text |  | YES |  |
| 5 | trigger_type | character varying | varchar | 'manual'::character varying | NO | 100 |
| 6 | trigger_conditions | jsonb | jsonb | '{}'::jsonb | NO |  |
| 7 | steps | jsonb | jsonb | '[]'::jsonb | NO |  |
| 8 | is_active | boolean | bool | true | NO |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## admissions (23 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | YES |  |
| 3 | student_id | uuid | uuid |  | YES |  |
| 4 | program_id | uuid | uuid |  | YES |  |
| 5 | admission_number | text | text |  | YES |  |
| 6 | admission_date | date | date |  | YES |  |
| 7 | admission_type | text | text | 'regular'::text | YES |  |
| 8 | academic_year | text | text |  | YES |  |
| 9 | status | text | text | 'active'::text | YES |  |
| 10 | fee_structure | jsonb | jsonb | '{}'::jsonb | YES |  |
| 11 | documents | jsonb | jsonb | '[]'::jsonb | YES |  |
| 12 | notes | text | text |  | YES |  |
| 13 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 14 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |
| 15 | roll_number | text | text |  | YES |  |
| 16 | section_allocation | text | text |  | YES |  |
| 17 | department_allocation | text | text |  | YES |  |
| 18 | student_portal_login_created | boolean | bool | false | YES |  |
| 19 | student_portal_login_created_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | id_card_generated | boolean | bool | false | YES |  |
| 21 | id_card_generated_at | timestamp with time zone | timestamptz |  | YES |  |
| 22 | lms_access_given | boolean | bool | false | YES |  |
| 23 | lms_access_given_at | timestamp with time zone | timestamptz |  | YES |  |

## consultant_commission_structures (28 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_id | uuid | uuid |  | NO |  |
| 4 | name | character varying | varchar |  | NO | 100 |
| 5 | description | text | text |  | YES |  |
| 6 | applies_to_all_programs | boolean | bool | true | YES |  |
| 7 | program_id | uuid | uuid |  | YES |  |
| 8 | degree_id | uuid | uuid |  | YES |  |
| 9 | department_id | uuid | uuid |  | YES |  |
| 10 | commission_type | character varying | varchar | 'percentage'::character varying | NO | 20 |
| 11 | base_rate | numeric | numeric |  | YES |  |
| 12 | base_amount | numeric | numeric |  | YES |  |
| 13 | milestones | jsonb | jsonb | '[]'::jsonb | NO |  |
| 14 | volume_tiers_enabled | boolean | bool | false | YES |  |
| 15 | volume_tiers | jsonb | jsonb | '[]'::jsonb | YES |  |
| 16 | clawback_enabled | boolean | bool | false | YES |  |
| 17 | clawback_period_days | integer | int4 |  | YES |  |
| 18 | clawback_percentage | numeric | numeric |  | YES |  |
| 19 | clawback_conditions | jsonb | jsonb |  | YES |  |
| 20 | commission_basis | character varying | varchar | 'total_fees'::character varying | YES | 50 |
| 21 | effective_from | date | date | CURRENT_DATE | NO |  |
| 22 | effective_to | date | date |  | YES |  |
| 23 | is_active | boolean | bool | true | YES |  |
| 24 | priority | integer | int4 | 0 | YES |  |
| 25 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 26 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 27 | created_by | uuid | uuid |  | YES |  |
| 28 | updated_by | uuid | uuid |  | YES |  |

## consultant_commission_transactions (33 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_id | uuid | uuid |  | NO |  |
| 4 | transaction_number | character varying | varchar |  | YES | 30 |
| 5 | attribution_id | uuid | uuid |  | YES |  |
| 6 | learner_profile_id | uuid | uuid |  | YES |  |
| 7 | admission_id | uuid | uuid |  | YES |  |
| 8 | transaction_type | character varying | varchar |  | NO | 20 |
| 9 | milestone_stage | character varying | varchar |  | YES | 50 |
| 10 | milestone_description | text | text |  | YES |  |
| 11 | commission_basis_amount | numeric | numeric |  | YES |  |
| 12 | commission_rate | numeric | numeric |  | YES |  |
| 13 | gross_amount | numeric | numeric |  | NO |  |
| 14 | tds_percentage | numeric | numeric | 0 | YES |  |
| 15 | tds_amount | numeric | numeric | 0 | YES |  |
| 16 | other_deductions | numeric | numeric | 0 | YES |  |
| 17 | net_amount | numeric | numeric |  | NO |  |
| 18 | volume_tier_multiplier | numeric | numeric | 1.0 | YES |  |
| 19 | payout_batch_id | uuid | uuid |  | YES |  |
| 20 | payment_reference | character varying | varchar |  | YES | 100 |
| 21 | payment_mode | character varying | varchar |  | YES | 20 |
| 22 | payment_date | date | date |  | YES |  |
| 23 | status | character varying | varchar | 'pending'::character varying | YES | 20 |
| 24 | status_history | jsonb | jsonb | '[]'::jsonb | YES |  |
| 25 | approved_by | uuid | uuid |  | YES |  |
| 26 | approved_at | timestamp with time zone | timestamptz |  | YES |  |
| 27 | rejection_reason | text | text |  | YES |  |
| 28 | original_transaction_id | uuid | uuid |  | YES |  |
| 29 | clawback_reason | text | text |  | YES |  |
| 30 | notes | text | text |  | YES |  |
| 31 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 32 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 33 | created_by | uuid | uuid |  | YES |  |

## consultant_communications (31 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_id | uuid | uuid |  | NO |  |
| 4 | communication_type | character varying | varchar |  | NO | 20 |
| 5 | direction | character varying | varchar |  | YES | 10 |
| 6 | subject | character varying | varchar |  | YES | 255 |
| 7 | content | text | text |  | YES |  |
| 8 | content_html | text | text |  | YES |  |
| 9 | meeting_date | timestamp with time zone | timestamptz |  | YES |  |
| 10 | meeting_end_date | timestamp with time zone | timestamptz |  | YES |  |
| 11 | meeting_location | text | text |  | YES |  |
| 12 | meeting_type | character varying | varchar |  | YES | 20 |
| 13 | meeting_attendees | jsonb | jsonb | '[]'::jsonb | YES |  |
| 14 | meeting_outcome | text | text |  | YES |  |
| 15 | call_duration_seconds | integer | int4 |  | YES |  |
| 16 | call_outcome | character varying | varchar |  | YES | 50 |
| 17 | call_recording_url | text | text |  | YES |  |
| 18 | email_thread_id | character varying | varchar |  | YES | 100 |
| 19 | email_message_id | character varying | varchar |  | YES | 100 |
| 20 | attachments | jsonb | jsonb | '[]'::jsonb | YES |  |
| 21 | follow_up_required | boolean | bool | false | YES |  |
| 22 | follow_up_date | date | date |  | YES |  |
| 23 | follow_up_type | character varying | varchar |  | YES | 20 |
| 24 | follow_up_notes | text | text |  | YES |  |
| 25 | follow_up_completed | boolean | bool | false | YES |  |
| 26 | follow_up_completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 27 | linked_lead_id | uuid | uuid |  | YES |  |
| 28 | linked_transaction_id | uuid | uuid |  | YES |  |
| 29 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 30 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 31 | created_by | uuid | uuid |  | YES |  |

## consultant_documents (25 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_id | uuid | uuid |  | NO |  |
| 4 | document_type | character varying | varchar |  | NO | 50 |
| 5 | document_name | character varying | varchar |  | NO | 255 |
| 6 | document_description | text | text |  | YES |  |
| 7 | document_url | text | text |  | NO |  |
| 8 | file_size_bytes | bigint | int8 |  | YES |  |
| 9 | mime_type | character varying | varchar |  | YES | 100 |
| 10 | version | integer | int4 | 1 | YES |  |
| 11 | previous_version_id | uuid | uuid |  | YES |  |
| 12 | valid_from | date | date |  | YES |  |
| 13 | valid_to | date | date |  | YES |  |
| 14 | is_mandatory | boolean | bool | false | YES |  |
| 15 | status | character varying | varchar | 'active'::character varying | YES | 20 |
| 16 | requires_verification | boolean | bool | false | YES |  |
| 17 | is_verified | boolean | bool | false | YES |  |
| 18 | verified_by | uuid | uuid |  | YES |  |
| 19 | verified_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | verification_notes | text | text |  | YES |  |
| 21 | expiry_notification_days | integer | int4 | 30 | YES |  |
| 22 | expiry_notification_sent | boolean | bool | false | YES |  |
| 23 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 24 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 25 | uploaded_by | uuid | uuid |  | YES |  |

## consultant_lead_attributions (26 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | learner_profile_id | uuid | uuid |  | YES |  |
| 4 | admission_id | uuid | uuid |  | YES |  |
| 5 | consultant_id | uuid | uuid |  | NO |  |
| 6 | attribution_type | character varying | varchar | 'primary'::character varying | YES | 20 |
| 7 | attribution_percentage | numeric | numeric | 100 | NO |  |
| 8 | commission_structure_id | uuid | uuid |  | YES |  |
| 9 | referral_code | character varying | varchar |  | YES | 50 |
| 10 | referral_source | character varying | varchar |  | YES | 50 |
| 11 | utm_source | text | text |  | YES |  |
| 12 | utm_medium | text | text |  | YES |  |
| 13 | utm_campaign | text | text |  | YES |  |
| 14 | referral_url | text | text |  | YES |  |
| 15 | current_stage | character varying | varchar | 'lead_registered'::character varying | YES | 50 |
| 16 | stage_history | jsonb | jsonb | '[]'::jsonb | YES |  |
| 17 | is_verified | boolean | bool | false | YES |  |
| 18 | verified_at | timestamp with time zone | timestamptz |  | YES |  |
| 19 | verified_by | uuid | uuid |  | YES |  |
| 20 | verification_notes | text | text |  | YES |  |
| 21 | is_disputed | boolean | bool | false | YES |  |
| 22 | dispute_reason | text | text |  | YES |  |
| 23 | dispute_resolved_at | timestamp with time zone | timestamptz |  | YES |  |
| 24 | notes | text | text |  | YES |  |
| 25 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 26 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## consultant_payment_queries (26 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_id | uuid | uuid |  | NO |  |
| 4 | query_number | character varying | varchar |  | YES | 30 |
| 5 | query_type | character varying | varchar |  | NO | 50 |
| 6 | subject | character varying | varchar |  | NO | 255 |
| 7 | description | text | text |  | NO |  |
| 8 | transaction_id | uuid | uuid |  | YES |  |
| 9 | payout_batch_id | uuid | uuid |  | YES |  |
| 10 | status | character varying | varchar | 'open'::character varying | YES | 20 |
| 11 | priority | character varying | varchar | 'normal'::character varying | YES | 10 |
| 12 | assigned_to | uuid | uuid |  | YES |  |
| 13 | assigned_at | timestamp with time zone | timestamptz |  | YES |  |
| 14 | resolution_notes | text | text |  | YES |  |
| 15 | resolved_by | uuid | uuid |  | YES |  |
| 16 | resolved_at | timestamp with time zone | timestamptz |  | YES |  |
| 17 | is_escalated | boolean | bool | false | YES |  |
| 18 | escalated_to | uuid | uuid |  | YES |  |
| 19 | escalated_at | timestamp with time zone | timestamptz |  | YES |  |
| 20 | escalation_reason | text | text |  | YES |  |
| 21 | messages | jsonb | jsonb | '[]'::jsonb | YES |  |
| 22 | attachments | jsonb | jsonb | '[]'::jsonb | YES |  |
| 23 | expected_resolution_date | date | date |  | YES |  |
| 24 | sla_breached | boolean | bool | false | YES |  |
| 25 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 26 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## consultant_payout_batches (29 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | batch_number | character varying | varchar |  | YES | 30 |
| 4 | batch_name | character varying | varchar |  | YES | 100 |
| 5 | batch_period_start | date | date |  | YES |  |
| 6 | batch_period_end | date | date |  | YES |  |
| 7 | total_consultants | integer | int4 | 0 | YES |  |
| 8 | total_transactions | integer | int4 | 0 | YES |  |
| 9 | total_gross_amount | numeric | numeric | 0 | YES |  |
| 10 | total_tds_amount | numeric | numeric | 0 | YES |  |
| 11 | total_deductions | numeric | numeric | 0 | YES |  |
| 12 | total_net_amount | numeric | numeric | 0 | YES |  |
| 13 | status | character varying | varchar | 'draft'::character varying | YES | 20 |
| 14 | status_history | jsonb | jsonb | '[]'::jsonb | YES |  |
| 15 | prepared_by | uuid | uuid |  | YES |  |
| 16 | prepared_at | timestamp with time zone | timestamptz |  | YES |  |
| 17 | reviewed_by | uuid | uuid |  | YES |  |
| 18 | reviewed_at | timestamp with time zone | timestamptz |  | YES |  |
| 19 | approved_by | uuid | uuid |  | YES |  |
| 20 | approved_at | timestamp with time zone | timestamptz |  | YES |  |
| 21 | processed_by | uuid | uuid |  | YES |  |
| 22 | processed_at | timestamp with time zone | timestamptz |  | YES |  |
| 23 | completed_at | timestamp with time zone | timestamptz |  | YES |  |
| 24 | payment_mode | character varying | varchar |  | YES | 20 |
| 25 | bank_reference | character varying | varchar |  | YES | 100 |
| 26 | notes | text | text |  | YES |  |
| 27 | rejection_reason | text | text |  | YES |  |
| 28 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 29 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## education_consultants (59 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | consultant_type | character varying | varchar | 'external'::character varying | NO | 20 |
| 4 | code | character varying | varchar |  | YES | 30 |
| 5 | name | character varying | varchar |  | NO | 255 |
| 6 | email | character varying | varchar |  | YES | 255 |
| 7 | phone | character varying | varchar |  | YES | 20 |
| 8 | alternate_phone | character varying | varchar |  | YES | 20 |
| 9 | profile_photo_url | text | text |  | YES |  |
| 10 | learner_profile_id | uuid | uuid |  | YES |  |
| 11 | company_name | character varying | varchar |  | YES | 255 |
| 12 | company_registration_no | character varying | varchar |  | YES | 100 |
| 13 | gst_number | character varying | varchar |  | YES | 20 |
| 14 | pan_number | character varying | varchar |  | YES | 20 |
| 15 | address_line1 | text | text |  | YES |  |
| 16 | address_line2 | text | text |  | YES |  |
| 17 | city | character varying | varchar |  | YES | 100 |
| 18 | state | character varying | varchar |  | YES | 100 |
| 19 | pincode | character varying | varchar |  | YES | 10 |
| 20 | country | character varying | varchar | 'India'::character varying | YES | 100 |
| 21 | bank_name | character varying | varchar |  | YES | 100 |
| 22 | bank_account_number | character varying | varchar |  | YES | 30 |
| 23 | bank_ifsc | character varying | varchar |  | YES | 15 |
| 24 | bank_branch | character varying | varchar |  | YES | 100 |
| 25 | upi_id | character varying | varchar |  | YES | 100 |
| 26 | payment_preference | character varying | varchar | 'bank'::character varying | YES | 20 |
| 27 | covered_states | jsonb | jsonb | '[]'::jsonb | YES |  |
| 28 | covered_cities | jsonb | jsonb | '[]'::jsonb | YES |  |
| 29 | covered_regions | jsonb | jsonb | '[]'::jsonb | YES |  |
| 30 | specialized_degrees | ARRAY | _uuid |  | YES |  |
| 31 | specialized_programs | ARRAY | _uuid |  | YES |  |
| 32 | specialized_departments | ARRAY | _uuid |  | YES |  |
| 33 | relationship_score | integer | int4 | 50 | YES |  |
| 34 | performance_rating | numeric | numeric |  | YES |  |
| 35 | total_leads_referred | integer | int4 | 0 | YES |  |
| 36 | total_conversions | integer | int4 | 0 | YES |  |
| 37 | conversion_rate | numeric | numeric |  | YES |  |
| 38 | total_commission_earned | numeric | numeric | 0 | YES |  |
| 39 | total_commission_paid | numeric | numeric | 0 | YES |  |
| 40 | pending_commission | numeric | numeric |  | YES |  |
| 41 | contract_start_date | date | date |  | YES |  |
| 42 | contract_end_date | date | date |  | YES |  |
| 43 | contract_status | character varying | varchar | 'active'::character varying | YES | 20 |
| 44 | contract_document_url | text | text |  | YES |  |
| 45 | contract_terms | jsonb | jsonb |  | YES |  |
| 46 | status | character varying | varchar | 'active'::character varying | YES | 20 |
| 47 | onboarded_at | timestamp with time zone | timestamptz |  | YES |  |
| 48 | onboarded_by | uuid | uuid |  | YES |  |
| 49 | internal_notes | text | text |  | YES |  |
| 50 | tags | jsonb | jsonb | '[]'::jsonb | YES |  |
| 51 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 52 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 53 | created_by | uuid | uuid |  | YES |  |
| 54 | updated_by | uuid | uuid |  | YES |  |
| 55 | referrer_user_id | uuid | uuid |  | YES |  |
| 56 | contact_person | character varying | varchar |  | YES | 255 |
| 57 | tier | USER-DEFINED | consultant_tier | 'bronze'::consultant_tier | NO |  |
| 58 | website | character varying | varchar |  | YES |  |
| 59 | bank_account_holder | character varying | varchar |  | YES |  |

## expo_daily_reports (23 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | expo_event_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | report_date | date | date |  | NO |  |
| 5 | stall_fee | numeric | numeric | 0 | YES |  |
| 6 | travel_expense | numeric | numeric | 0 | YES |  |
| 7 | accommodation_expense | numeric | numeric | 0 | YES |  |
| 8 | food_expense | numeric | numeric | 0 | YES |  |
| 9 | printing_materials | numeric | numeric | 0 | YES |  |
| 10 | miscellaneous_expense | numeric | numeric | 0 | YES |  |
| 11 | total_expense | numeric | numeric |  | YES |  |
| 12 | total_visitors | integer | int4 | 0 | YES |  |
| 13 | counselling_done | integer | int4 | 0 | YES |  |
| 14 | brochures_distributed | integer | int4 | 0 | YES |  |
| 15 | interested_students | integer | int4 | 0 | YES |  |
| 16 | leads_collected | integer | int4 | 0 | YES |  |
| 17 | stall_photos | ARRAY | _text | ARRAY[]::text[] | YES |  |
| 18 | event_photos | ARRAY | _text | ARRAY[]::text[] | YES |  |
| 19 | visitor_photos | ARRAY | _text | ARRAY[]::text[] | YES |  |
| 20 | notes | text | text |  | YES |  |
| 21 | submitted_by | uuid | uuid |  | YES |  |
| 22 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 23 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## expo_event_team_members (9 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | expo_event_id | uuid | uuid |  | NO |  |
| 3 | member_type | text | text |  | NO |  |
| 4 | staff_id | uuid | uuid |  | YES |  |
| 5 | student_id | uuid | uuid |  | YES |  |
| 6 | name | text | text |  | NO |  |
| 7 | phone | text | text |  | YES |  |
| 8 | role | text | text | 'volunteer'::text | NO |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | YES |  |

## expo_events (21 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | expo_master_id | uuid | uuid |  | YES |  |
| 4 | event_name | text | text |  | NO |  |
| 5 | organizer_name | text | text |  | YES |  |
| 6 | city | text | text |  | NO |  |
| 7 | venue_name | text | text |  | YES |  |
| 8 | start_date | date | date |  | NO |  |
| 9 | end_date | date | date |  | NO |  |
| 10 | travel_mode | text | text |  | YES |  |
| 11 | accommodation_details | text | text |  | YES |  |
| 12 | team_leader_id | uuid | uuid |  | YES |  |
| 13 | approved_by_id | uuid | uuid |  | YES |  |
| 14 | event_status | text | text | 'planned'::text | NO |  |
| 15 | notes | text | text |  | YES |  |
| 16 | total_team_members | integer | int4 | 0 | YES |  |
| 17 | total_expenses | numeric | numeric | 0 | YES |  |
| 18 | total_leads_collected | integer | int4 | 0 | YES |  |
| 19 | created_by | uuid | uuid |  | YES |  |
| 20 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 21 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## expo_lead_capture_links (8 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | expo_event_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | short_code | text | text |  | NO |  |
| 5 | is_active | boolean | bool | true | YES |  |
| 6 | scan_count | integer | int4 | 0 | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 8 | expires_at | timestamp with time zone | timestamptz |  | YES |  |

## expo_masters (13 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | event_name | text | text |  | NO |  |
| 4 | organizer_name | text | text |  | YES |  |
| 5 | city | text | text |  | YES |  |
| 6 | venue_name | text | text |  | YES |  |
| 7 | description | text | text |  | YES |  |
| 8 | frequency | text | text |  | YES |  |
| 9 | tags | ARRAY | _text |  | YES |  |
| 10 | is_active | boolean | bool | true | YES |  |
| 11 | created_by | uuid | uuid |  | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 13 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## referral_reward_configs (26 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | character varying | varchar |  | NO | 100 |
| 4 | description | text | text |  | YES |  |
| 5 | referrer_type | character varying | varchar |  | NO | 20 |
| 6 | reward_type | character varying | varchar |  | NO | 20 |
| 7 | reward_value_type | character varying | varchar |  | NO | 20 |
| 8 | reward_value | numeric | numeric |  | NO |  |
| 9 | max_reward_amount | numeric | numeric |  | YES |  |
| 10 | min_reward_amount | numeric | numeric |  | YES |  |
| 11 | min_referrals_required | integer | int4 | 1 | YES |  |
| 12 | max_referrals_per_year | integer | int4 |  | YES |  |
| 13 | applicable_programs | ARRAY | _uuid |  | YES |  |
| 14 | applicable_degrees | ARRAY | _uuid |  | YES |  |
| 15 | trigger_stage | character varying | varchar | 'enrolled'::character varying | NO | 50 |
| 16 | trigger_conditions | jsonb | jsonb |  | YES |  |
| 17 | stackable | boolean | bool | false | YES |  |
| 18 | max_stacking_count | integer | int4 |  | YES |  |
| 19 | valid_from | date | date | CURRENT_DATE | YES |  |
| 20 | valid_to | date | date |  | YES |  |
| 21 | is_active | boolean | bool | true | YES |  |
| 22 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 23 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |
| 24 | created_by | uuid | uuid |  | YES |  |
| 25 | updated_by | uuid | uuid |  | YES |  |
| 26 | terms_conditions | text | text |  | YES |  |

## referral_rewards (28 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | reward_number | character varying | varchar |  | YES | 30 |
| 4 | referrer_learner_id | uuid | uuid |  | NO |  |
| 5 | referrer_consultant_id | uuid | uuid |  | YES |  |
| 6 | referred_learner_id | uuid | uuid |  | NO |  |
| 7 | attribution_id | uuid | uuid |  | YES |  |
| 8 | reward_config_id | uuid | uuid |  | YES |  |
| 9 | reward_type | character varying | varchar |  | NO | 20 |
| 10 | reward_amount | numeric | numeric |  | NO |  |
| 11 | reward_description | text | text |  | YES |  |
| 12 | status | character varying | varchar | 'pending'::character varying | YES | 20 |
| 13 | status_history | jsonb | jsonb | '[]'::jsonb | YES |  |
| 14 | applied_to_bill_id | uuid | uuid |  | YES |  |
| 15 | discount_applied_at | timestamp with time zone | timestamptz |  | YES |  |
| 16 | payment_reference | character varying | varchar |  | YES | 100 |
| 17 | payment_mode | character varying | varchar |  | YES | 20 |
| 18 | paid_at | timestamp with time zone | timestamptz |  | YES |  |
| 19 | credits_awarded | numeric | numeric |  | YES |  |
| 20 | credits_used | numeric | numeric | 0 | YES |  |
| 21 | credits_balance | numeric | numeric |  | YES |  |
| 22 | credits_expiry_date | date | date |  | YES |  |
| 23 | approved_by | uuid | uuid |  | YES |  |
| 24 | approved_at | timestamp with time zone | timestamptz |  | YES |  |
| 25 | rejection_reason | text | text |  | YES |  |
| 26 | notes | text | text |  | YES |  |
| 27 | created_at | timestamp with time zone | timestamptz | now() | YES |  |
| 28 | updated_at | timestamp with time zone | timestamptz | now() | YES |  |

## telephony_health_events (8 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | status_type | text | text |  | NO |  |
| 3 | connectivity_status | text | text |  | YES |  |
| 4 | incoming_affected | ARRAY | _text |  | YES |  |
| 5 | outgoing_affected | ARRAY | _text |  | YES |  |
| 6 | alternate_exophones | jsonb | jsonb |  | YES |  |
| 7 | raw_payload | jsonb | jsonb |  | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | now() | YES |  |

## wa_audience_segments (14 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | name | text | text |  | NO |  |
| 4 | description | text | text |  | YES |  |
| 5 | criteria | jsonb | jsonb | '[]'::jsonb | NO |  |
| 6 | logic | text | text | 'AND'::text | NO |  |
| 7 | cached_count | integer | int4 |  | YES |  |
| 8 | cached_at | timestamp with time zone | timestamptz |  | YES |  |
| 9 | last_used_at | timestamp with time zone | timestamptz |  | YES |  |
| 10 | use_count | integer | int4 | 0 | NO |  |
| 11 | is_active | boolean | bool | true | NO |  |
| 12 | created_by | uuid | uuid |  | YES |  |
| 13 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 14 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_consent_log (9 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | NO |  |
| 4 | action | text | text |  | NO |  |
| 5 | source | text | text |  | NO |  |
| 6 | ip_address | text | text |  | YES |  |
| 7 | user_agent | text | text |  | YES |  |
| 8 | performed_by | uuid | uuid |  | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_conversations (17 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | lead_id | uuid | uuid |  | YES |  |
| 4 | contact_phone | text | text |  | NO |  |
| 5 | contact_name | text | text |  | YES |  |
| 6 | contact_wa_id | text | text |  | YES |  |
| 7 | contact_profile_pic_url | text | text |  | YES |  |
| 8 | assigned_to | uuid | uuid |  | YES |  |
| 9 | status | text | text | 'open'::text | NO |  |
| 10 | last_message_at | timestamp with time zone | timestamptz | now() | NO |  |
| 11 | last_message_preview | text | text |  | YES |  |
| 12 | last_inbound_at | timestamp with time zone | timestamptz |  | YES |  |
| 13 | unread_count | integer | int4 | 0 | NO |  |
| 14 | tags | ARRAY | _text | '{}'::text[] | YES |  |
| 15 | metadata | jsonb | jsonb | '{}'::jsonb | YES |  |
| 16 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 17 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_document_catalog (14 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | title | text | text |  | NO |  |
| 4 | description | text | text |  | YES |  |
| 5 | category | text | text |  | NO |  |
| 6 | document_type | text | text |  | NO |  |
| 7 | url | text | text |  | NO |  |
| 8 | thumbnail_url | text | text |  | YES |  |
| 9 | file_size_bytes | integer | int4 |  | YES |  |
| 10 | share_count | integer | int4 | 0 | NO |  |
| 11 | is_active | boolean | bool | true | NO |  |
| 12 | created_by | uuid | uuid |  | YES |  |
| 13 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 14 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_message_logs (18 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | connection_id | uuid | uuid |  | NO |  |
| 3 | institution_id | uuid | uuid |  | NO |  |
| 4 | recipient_type | text | text | 'individual'::text | NO |  |
| 5 | recipient_jid | text | text |  | NO |  |
| 6 | recipient_name | text | text |  | YES |  |
| 7 | recipient_count | integer | int4 | 1 | NO |  |
| 8 | message_type | text | text | 'text'::text | NO |  |
| 9 | message_preview | text | text |  | YES |  |
| 10 | template_id | uuid | uuid |  | YES |  |
| 11 | status | text | text | 'pending'::text | NO |  |
| 12 | error_message | text | text |  | YES |  |
| 13 | whatsapp_message_id | text | text |  | YES |  |
| 14 | sent_by | uuid | uuid |  | NO |  |
| 15 | sent_at | timestamp with time zone | timestamptz |  | YES |  |
| 16 | delivered_at | timestamp with time zone | timestamptz |  | YES |  |
| 17 | read_at | timestamp with time zone | timestamptz |  | YES |  |
| 18 | created_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_messages (11 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | conversation_id | uuid | uuid |  | NO |  |
| 3 | wa_message_id | text | text |  | YES |  |
| 4 | direction | text | text |  | NO |  |
| 5 | sender_type | text | text |  | NO |  |
| 6 | sender_id | uuid | uuid |  | YES |  |
| 7 | message_type | text | text | 'text'::text | NO |  |
| 8 | content | jsonb | jsonb | '{}'::jsonb | NO |  |
| 9 | status | text | text | 'sent'::text | NO |  |
| 10 | error_message | text | text |  | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_phone_numbers (13 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | phone_number_id | text | text |  | NO |  |
| 4 | business_account_id | text | text |  | NO |  |
| 5 | display_number | text | text |  | NO |  |
| 6 | verified_name | text | text |  | YES |  |
| 7 | quality_rating | text | text | 'GREEN'::text | YES |  |
| 8 | messaging_limit | text | text | 'TIER_1K'::text | YES |  |
| 9 | is_primary | boolean | bool | false | NO |  |
| 10 | is_active | boolean | bool | true | NO |  |
| 11 | access_token_encrypted | text | text |  | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 13 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_quick_replies (10 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | title | text | text |  | NO |  |
| 4 | content | text | text |  | NO |  |
| 5 | shortcut | text | text |  | YES |  |
| 6 | category | text | text |  | YES |  |
| 7 | usage_count | integer | int4 | 0 | NO |  |
| 8 | created_by | uuid | uuid |  | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 10 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## wa_settings (16 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | service_url | text | text |  | YES |  |
| 4 | api_key | text | text |  | YES |  |
| 5 | messages_per_minute | integer | int4 | 20 | NO |  |
| 6 | bulk_delay_ms | integer | int4 | 3000 | NO |  |
| 7 | max_bulk_recipients | integer | int4 | 100 | NO |  |
| 8 | enable_bulk_messaging | boolean | bool | false | NO |  |
| 9 | enable_templates | boolean | bool | true | NO |  |
| 10 | enable_scheduled_messages | boolean | bool | false | NO |  |
| 11 | enable_auto_replies | boolean | bool | false | NO |  |
| 12 | notify_on_disconnect | boolean | bool | true | NO |  |
| 13 | notify_email | text | text |  | YES |  |
| 14 | message_log_retention_days | integer | int4 | 30 | NO |  |
| 15 | created_at | timestamp with time zone | timestamptz | now() | NO |  |
| 16 | updated_at | timestamp with time zone | timestamptz | now() | NO |  |

## waste_incidents (15 columns)

| # | Column | Data Type | UDT Name | Default | Nullable | Max Length |
|---|--------|-----------|----------|---------|----------|------------|
| 1 | id | uuid | uuid | gen_random_uuid() | NO |  |
| 2 | institution_id | uuid | uuid |  | NO |  |
| 3 | process_instance_id | uuid | uuid |  | YES |  |
| 4 | process_id | uuid | uuid |  | YES |  |
| 5 | waste_category | character varying | varchar |  | NO | 5 |
| 6 | description | text | text |  | NO |  |
| 7 | estimated_time_lost_hours | numeric | numeric |  | YES |  |
| 8 | estimated_cost_impact | numeric | numeric |  | YES |  |
| 9 | root_cause | text | text |  | YES |  |
| 10 | corrective_action | text | text |  | YES |  |
| 11 | reported_by | uuid | uuid |  | YES |  |
| 12 | reported_at | timestamp with time zone | timestamptz | now() | YES |  |
| 13 | status | character varying | varchar | 'open'::character varying | YES | 20 |
| 14 | resolved_at | timestamp with time zone | timestamptz |  | YES |  |
| 15 | resolved_by | uuid | uuid |  | YES |  |
