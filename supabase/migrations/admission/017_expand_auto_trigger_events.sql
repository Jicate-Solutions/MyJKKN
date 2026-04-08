-- 017: Expand auto-trigger event types from 4 to 20
-- Part of Unified WhatsApp Automation Engine

-- Drop existing constraint and add expanded event types
ALTER TABLE wa_auto_trigger_rules DROP CONSTRAINT IF EXISTS wa_auto_trigger_rules_event_type_check;
ALTER TABLE wa_auto_trigger_rules ADD CONSTRAINT wa_auto_trigger_rules_event_type_check
  CHECK (event_type IN (
    'lead_created', 'stage_changed', 'followup_due', 'expo_lead_captured',
    'missed_call', 'after_hours_call', 'repeat_caller',
    'application_started', 'application_submitted', 'documents_pending',
    'documents_verified', 'interview_scheduled', 'offer_sent', 'offer_accepted',
    'enrolled', 'visit_scheduled', 'visit_reminder',
    'dormant_lead', 'fee_reminder', 'welcome_message'
  ));

-- Add scheduled_at for delayed triggers if not exists
ALTER TABLE wa_personal_message_queue ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
