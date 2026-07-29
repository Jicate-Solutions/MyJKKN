-- =============================================================================
-- 20260710040000_placement_nodata_reminder_config.sql
-- Date: 2026-07-10
-- Reason: config row for the CDC placement no-data weekly reminder escalation
--         threshold, consumed by app/api/cron/cdc-placement-outcomes/route.ts.
-- Director decisions 2026-07-10 (verbatim): weekly reminder to the named owner;
--   "Yes — list the held cohorts"; escalation "Copy me after 4 weeks".
--
-- No new tables / functions. The reminder itself is code (route + shared
-- fanoutNotification helper); its Director-tunable escalation threshold is this
-- policy row — "every policy decision = a config row".
-- =============================================================================

INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, classification, publication_state, is_active, description)
VALUES
  ('cdc_placement_loop.nodata_escalation_weeks', 'global', '4'::jsonb, 'number', 'major', 'published', true,
   'CDC placement no-data reminder: after this many consecutive weekly owner reminders with still-zero '
   || 'placement data, the next reminder ALSO notifies the Director (profiles row for director@jkkn.ac.in, '
   || 'resolved at runtime). Director decision 2026-07-10: "Copy me after 4 weeks". Owner = '
   || 'cdc_placement_loop.owner_id; reminder fires from the weekly cdc-placement-outcomes cron.')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
