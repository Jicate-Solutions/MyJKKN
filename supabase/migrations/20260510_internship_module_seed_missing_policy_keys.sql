-- ============================================================================
-- INTERNSHIP MODULE — Seed Missing Policy Keys
-- Migration: 20260510_internship_module_seed_missing_policy_keys.sql
-- Purpose: seed the 11 `internship.policy.*` keys referenced by INTERNSHIP_POLICY_KEYS
--   in lib/services/admin/internship-policy-service.ts that the seeds_v4
--   migration (20260509_internship_module_seeds_v4.sql) didn't include.
--
-- Impact: Adds 11 rows to platform_policies; no existing rows touched.
--   All 11 keys are referenced by /admin/internship-policy/* PolicyField
--   components — the admin UI currently renders empty + "Default: …" hint
--   for these because no DB row exists.
--
-- Idempotency: ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, …))
--   DO NOTHING — safe to re-run; will not overwrite values a Director has
--   tweaked manually after first apply.
--
-- Tier: TIER-0 (safe-additive, no DDL, no destructive ops)
-- ============================================================================

INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('internship.policy.registration_cutoff_days',                 'global', NULL, '7'::jsonb,  'Days before cycle start when registrations close',                                  'number', true, true),
  ('internship.policy.logbook_late_penalty_pct',                 'global', NULL, '10'::jsonb, '% penalty applied to logbook scores submitted after deadline',                      'number', true, true),
  ('internship.policy.approval_escalate_after_hours',            'global', NULL, '48'::jsonb, 'Hours before stale approval auto-escalates to next role',                            'number', true, true),
  ('internship.policy.logbook_submit_within_hours',              'global', NULL, '24'::jsonb, 'Hours after shift-end window for learner to submit logbook',                         'number', true, true),
  ('internship.policy.roster_reminder_d_minus',                  'global', NULL, '3'::jsonb,  'Days before cycle start to send roster confirmation reminder',                       'number', true, true),
  ('internship.policy.vehicle_lead_time_days',                   'global', NULL, '2'::jsonb,  'Days before cycle start to lock vehicle bookings',                                   'number', true, true),
  ('internship.policy.notify_roster_reminder_d_minus',           'global', NULL, '3'::jsonb,  'Days before cycle start to push roster reminder notifications',                      'number', true, true),
  ('internship.policy.notify_faculty_schedule_d_minus',          'global', NULL, '5'::jsonb,  'Days before cycle start to notify faculty of their schedule',                        'number', true, true),
  ('internship.policy.notify_logbook_reminder_after_hours',      'global', NULL, '12'::jsonb, 'Hours after submit window before reminder fires',                                    'number', true, true),
  ('internship.policy.notify_evaluation_reminder_after_hours',   'global', NULL, '48'::jsonb, 'Hours after cycle-end before evaluation reminder',                                   'number', true, true),
  ('internship.policy.incident_escalation_critical_hours',       'global', NULL, '4'::jsonb,  'Hours before critical-tier incident escalates to director',                          'number', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
