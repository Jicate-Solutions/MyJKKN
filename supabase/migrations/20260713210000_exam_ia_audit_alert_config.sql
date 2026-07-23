-- =============================================================================
-- 20260713210000_exam_ia_audit_alert_config.sql
-- Date: 2026-07-13
-- Reason: config rows for the weekly Exam IA Audit alert cron
--         (app/api/cron/exam-audit-alerts/route.ts). Director decision
--         2026-07-13: "Build the lever" — when a program sits at operator-dump
--         / missing / no-rubric with an exam date approaching, notify the
--         Registrar and that college's Principal(s) weekly, so the audit runs
--         itself instead of waiting for someone to open the page.
--
-- No new tables / functions. The alert itself is code (cron route + the shared
-- fanoutNotification helper + the SAME lib/services/exam-audit/compute.ts the
-- page uses); its Director-tunable levers are these policy rows — "every
-- policy decision = a config row".
-- =============================================================================

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('exam_ia_audit.alerts_enabled', 'global', 'true'::jsonb, 'boolean', 'major', 'published', true,
   'Master switch for the weekly Exam IA Audit alert cron. When true, each weekly run checks every '
   || 'COE-mapped college with an exam session starting within exam_ia_audit.alert_lead_days and, if any '
   || 'program shows operator-dump / missing CIA / no-rubric, sends ONE in-app notification per college per '
   || 'ISO week to the Registrar (role_key=registrar) and that college''s active Principal(s). '
   || 'Director decision 2026-07-13: "Build the lever".'),
  ('exam_ia_audit.alert_lead_days', 'global', '21'::jsonb, 'number', 'major', 'published', true,
   'How many days before an exam session''s exam_start_date the weekly Exam IA Audit alert starts firing '
   || 'for that session (sessions already underway keep alerting until exam_end_date passes). Default 21 — '
   || 'three weekly nudges before the exams begin.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
