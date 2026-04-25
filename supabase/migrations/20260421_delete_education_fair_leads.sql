-- Migration: Hard-delete all education_fair source leads
-- Date: 2026-04-21
-- Scope:
--   DELETE FROM admission_leads WHERE source = 'education_fair'  → 2,743 rows
--   CASCADE auto-removes:
--     - admission_lead_activities     (~3 rows)
--     - admission_lead_stage_history  (~5 rows)
--     - expo_wa_message_queue (by lead) (~2,705 rows)
--   SET NULL on: activity_alert_history, admission_form_submissions,
--               admission_integration_logs, admission_workflow_executions,
--               wa_conversations, wa_form_responses
-- Preserved: expo_events, expo_masters, expo_event_team_members,
--           expo_daily_reports, expo_wa_message_queue rows NOT tied to a lead,
--           admission_leads with any other source.
-- Blockers verified: all NO-ACTION child tables (applications, call logs,
--   sms/email/whatsapp logs, consultant attributions, commission txns) have
--   zero matching rows, so nothing will block the delete.

BEGIN;

-- Before snapshot
DO $$
DECLARE
  before_count integer;
BEGIN
  SELECT COUNT(*) INTO before_count FROM admission_leads WHERE source::text = 'education_fair';
  RAISE NOTICE 'education_fair leads before delete: %', before_count;
END $$;

DELETE FROM admission_leads WHERE source::text = 'education_fair';

-- After verification
DO $$
DECLARE
  after_count integer;
BEGIN
  SELECT COUNT(*) INTO after_count FROM admission_leads WHERE source::text = 'education_fair';
  RAISE NOTICE 'education_fair leads after delete: %', after_count;
  IF after_count <> 0 THEN
    RAISE EXCEPTION 'Delete incomplete: % education_fair leads remain', after_count;
  END IF;
END $$;

COMMIT;
