-- ============================================================================
-- INTERNSHIP MODULE — Seeds v4
-- Migration: 20260509_internship_module_seeds_v4.sql
-- Replaces: 20260508_internship_module_seeds.sql (deleted — placeholder UUID, missing institution_id, scope_type='platform')
-- Patches from v1:
--   1. Real JKKN institution UUIDs (was placeholder 0000-...-0000001)
--   2. 8 program_configs (was 7 — Arts split into Aided + Self per Director)
--   3. 64 status labels (8 statuses x 8 colleges per Director: per-college labels)
--   4. INSERT includes institution_id (was missing — would fail NOT NULL)
--   5. scope_type = 'global' (was 'platform' — rejected by check constraint)
-- Applied to prod: 2026-05-09 (mcp__supabase__apply_migration as 'internship_module_seeds_v4')
-- ============================================================================

-- 1. internship_site_types — 12 system rows (global)
INSERT INTO internship_site_types (institution_id, config_key, display_name, description, is_system, sort_order)
VALUES
  (NULL, 'tertiary_hospital', 'Tertiary Hospital', 'Multi-specialty hospital with advanced facilities', true, 10),
  (NULL, 'community_hospital', 'Community Hospital', 'Local hospital serving a specific community', true, 20),
  (NULL, 'clinic', 'Clinic', 'Outpatient clinic or specialty practice', true, 30),
  (NULL, 'pharmacy', 'Pharmacy', 'Retail or hospital pharmacy', true, 40),
  (NULL, 'lab', 'Diagnostic Lab', 'Pathology / diagnostic imaging center', true, 50),
  (NULL, 'dental_surgery', 'Dental Surgery', 'Dental clinic or oral surgery center', true, 60),
  (NULL, 'vet_hospital', 'Veterinary Hospital', 'Animal healthcare facility', true, 70),
  (NULL, 'educational_institution', 'Educational Institution', 'School / college for teaching practice', true, 80),
  (NULL, 'industrial_site', 'Industrial Site', 'Manufacturing or process plant', true, 90),
  (NULL, 'research_lab', 'Research Lab', 'R&D facility or research center', true, 100),
  (NULL, 'corporate_office', 'Corporate Office', 'Business / consultancy / IT firm', true, 110),
  (NULL, 'ngo', 'NGO / Trust', 'Non-profit or social-sector organization', true, 120)
ON CONFLICT DO NOTHING;

-- 2. platform_policies — 30 internship.policy.* rows (scope_type='global')
INSERT INTO platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
VALUES
  ('internship.policy.fee_compliance_threshold_pct', 'global', NULL, '70'::jsonb, 'Minimum % of fees paid for posting eligibility', 'number', true, true),
  ('internship.policy.fee_compliance_check_window_days', 'global', NULL, '14'::jsonb, 'Days before cycle start to check fee compliance', 'number', true, true),
  ('internship.policy.fee_exception_allowed', 'global', NULL, 'true'::jsonb, 'Whether COO can grant fee compliance exceptions', 'boolean', true, true),
  ('internship.policy.fee_exception_requires_reason', 'global', NULL, 'true'::jsonb, 'Require text reason on fee exception', 'boolean', true, true),
  ('internship.policy.gps_geofence_strict_block', 'global', NULL, 'true'::jsonb, 'Block attendance if GPS outside geofence', 'boolean', true, true),
  ('internship.policy.gps_default_radius_meters', 'global', NULL, '200'::jsonb, 'Default geofence radius for new sites', 'number', true, true),
  ('internship.policy.gps_fallback_proxy_allowed', 'global', NULL, 'true'::jsonb, 'Allow facilitator proxy mark when GPS unavailable', 'boolean', true, true),
  ('internship.policy.gps_emergency_bypass_allowed', 'global', NULL, 'true'::jsonb, 'Allow geofence bypass for emergency incidents', 'boolean', true, true),
  ('internship.policy.attendance_marking_window_minutes', 'global', NULL, '30'::jsonb, 'Minutes before/after start time to mark attendance', 'number', true, true),
  ('internship.policy.attendance_warn_below_pct', 'global', NULL, '80'::jsonb, 'Warn if attendance drops below this %', 'number', true, true),
  ('internship.policy.attendance_fail_below_pct', 'global', NULL, '75'::jsonb, 'Auto-fail if attendance drops below this %', 'number', true, true),
  ('internship.policy.attendance_lop_immunity_status_key', 'global', NULL, '"on_clinical_posting"'::jsonb, 'hr_attendance_status_types key for LOP-immune posting days', 'string', true, true),
  ('internship.policy.evaluation_dual_required', 'global', NULL, 'true'::jsonb, 'Require both preceptor + facilitator evaluation', 'boolean', true, true),
  ('internship.policy.evaluation_preceptor_weight', 'global', NULL, '0.40'::jsonb, 'Weight of preceptor score in final grade', 'number', true, true),
  ('internship.policy.evaluation_facilitator_weight', 'global', NULL, '0.60'::jsonb, 'Weight of facilitator score in final grade', 'number', true, true),
  ('internship.policy.preceptor_scope_default', 'global', NULL, '"cycle"'::jsonb, 'Default preceptor scope: cycle / site / institution', 'enum', true, true),
  ('internship.policy.preceptor_ratio_max_default', 'global', NULL, '6'::jsonb, 'Default max learners per preceptor (INC=6, DCI=8, PCI=10)', 'number', true, true),
  ('internship.policy.cascade_preview_enabled', 'global', NULL, 'true'::jsonb, 'Show consequences before policy save', 'boolean', true, true),
  ('internship.policy.realtime_invalidation_on_policy_edit', 'global', NULL, 'true'::jsonb, 'Invalidate React Query caches on policy edit', 'boolean', true, true),
  ('internship.policy.vehicle_booking_enabled', 'global', NULL, 'true'::jsonb, 'Enable vehicle booking surface', 'boolean', true, true),
  ('internship.policy.vehicle_default_capacity', 'global', NULL, '10'::jsonb, 'Default seat capacity for new vehicles', 'number', true, true),
  ('internship.policy.certificate_auto_generate_on_complete', 'global', NULL, 'true'::jsonb, 'Auto-issue certificate when assignment completes', 'boolean', true, true),
  ('internship.policy.certificate_verification_url_required', 'global', NULL, 'true'::jsonb, 'Require public verification URL on certificates', 'boolean', true, true),
  ('internship.policy.incident_escalation_tier1_hours', 'global', NULL, '24'::jsonb, 'Tier-1 (minor) incident escalation window', 'number', true, true),
  ('internship.policy.incident_escalation_tier2_hours', 'global', NULL, '48'::jsonb, 'Tier-2 (major) incident escalation window', 'number', true, true),
  ('internship.policy.incident_severity_default', 'global', NULL, '"minor"'::jsonb, 'Default severity for new incident reports', 'enum', true, true),
  ('internship.policy.cycle_min_duration_days', 'global', NULL, '7'::jsonb, 'Minimum cycle duration in days', 'number', true, true),
  ('internship.policy.cycle_max_duration_days', 'global', NULL, '365'::jsonb, 'Maximum cycle duration in days', 'number', true, true),
  ('internship.policy.cycle_allow_extensions', 'global', NULL, 'true'::jsonb, 'Allow cycle date extensions post-activation', 'boolean', true, true),
  ('internship.policy.logbook_late_edit_window_hours', 'global', NULL, '24'::jsonb, 'Hours after submission to allow logbook edits', 'number', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- 3. internship_program_config — 8 JKKN college defaults (Arts and Science split per Director)
INSERT INTO internship_program_config
  (institution_id, college_id, config_key, display_name, description,
   default_duration_days, preceptor_ratio_max, warn_below_pct, fail_below_pct,
   assignment_split_strategy, module_label, is_active)
VALUES
  ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid, 'default',
   'JKKN AHS — Default Clinical Posting Config',
   'Allied Health Sciences default: 12-week clinical posting, INC ratio ≤6',
   84, 6, 85.0, 80.0, 'per_department_row', 'Clinical Posting', true),
  ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'a33138b6-4eea-4675-941f-1071bf88b127'::uuid, 'default',
   'JKKN Arts & Science (Aided) — Default Internship Config',
   'Arts & Science Aided: general internship, flexible placement',
   28, 10, 75.0, 65.0, 'single_row', 'Internship', true),
  ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid, 'default',
   'JKKN Arts & Science (Self) — Default Internship Config',
   'Arts & Science Self-Financed: general internship, flexible placement',
   28, 10, 75.0, 65.0, 'single_row', 'Internship', true),
  ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, '9380358f-7020-4c23-89c3-e9538b47cf33'::uuid, 'default',
   'JKKN Education — Default Teaching Practice Config',
   'Education: teaching practice / field placement',
   30, 6, 80.0, 75.0, 'single_row', 'Teaching Practice', true),
  ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'default',
   'JKKN Engineering — Default Internship Config',
   'Engineering: AICTE 75% attendance, industrial/research internship',
   56, 10, 75.0, 65.0, 'single_row', 'Internship', true),
  ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, '70e54e51-9b98-4e07-9534-a85310609bfd'::uuid, 'default',
   'JKKN Nursing — Default Clinical Posting Config',
   'Nursing: INC 90% attendance, dual-department rotation tracking',
   168, 6, 90.0, 85.0, 'per_department_row', 'Clinical Posting', true),
  ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid, 'default',
   'JKKN Pharmacy — Default Pharmacy Practice Config',
   'Pharmacy: PCI accreditation, preceptor ratio ≤10, industrial placement',
   42, 10, 75.0, 65.0, 'single_row', 'Pharmacy Practice', true),
  ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid, 'default',
   'JKKN Dental — Default Clinical Posting Config',
   'Dental: DCI accreditation, preceptor ratio ≤8',
   84, 8, 80.0, 75.0, 'single_row', 'Clinical Posting', true)
ON CONFLICT (institution_id, config_key) DO NOTHING;

-- 4. internship_cycle_status_labels — 64 rows (8 statuses x 8 colleges)
INSERT INTO internship_cycle_status_labels
  (institution_id, college_id, status_enum, label_text)
SELECT
  college.id::uuid,
  NULL::uuid,
  s.status_enum,
  s.label_text
FROM (VALUES
  ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid),
  ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid),
  ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid),
  ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid),
  ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid),
  ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid),
  ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid),
  ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid)
) AS college(id),
LATERAL (VALUES
  ('draft'::internship_cycle_status_enum,            'Draft'),
  ('pending_approval'::internship_cycle_status_enum, 'Pending Approval'),
  ('approved'::internship_cycle_status_enum,         'Approved'),
  ('fee_checking'::internship_cycle_status_enum,     'Fee Verification'),
  ('assignments_ready'::internship_cycle_status_enum,'Assignments Ready'),
  ('active'::internship_cycle_status_enum,           'Active'),
  ('completed'::internship_cycle_status_enum,        'Completed'),
  ('cancelled'::internship_cycle_status_enum,        'Cancelled')
) AS s(status_enum, label_text)
ON CONFLICT DO NOTHING;

-- 5. internship_approval_chains — 1 default per college
INSERT INTO internship_approval_chains
  (institution_id, config_key, display_name, description, steps, is_default, is_active)
SELECT
  id::uuid,
  'default',
  'Standard 2-Step Approval',
  'Coordinator → HoD approval chain (default for all posting types)',
  '[
    {"step": 1, "role_key": "coordinator", "label": "Coordinator Review", "escalate_after_hours": 72, "escalate_to_role": "hod"},
    {"step": 2, "role_key": "hod", "label": "HoD Approval", "escalate_after_hours": 72, "escalate_to_role": "super_admin"}
  ]'::jsonb,
  true,
  true
FROM (VALUES
  ('9c1554e8-12a2-4b76-a9d6-8242bb05eba1'::uuid),
  ('a33138b6-4eea-4675-941f-1071bf88b127'::uuid),
  ('b0b8a724-7c65-4f07-8047-2a38e8100ad5'::uuid),
  ('9380358f-7020-4c23-89c3-e9538b47cf33'::uuid),
  ('5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid),
  ('70e54e51-9b98-4e07-9534-a85310609bfd'::uuid),
  ('5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334'::uuid),
  ('e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'::uuid)
) AS college(id)
ON CONFLICT (institution_id, config_key) DO NOTHING;
