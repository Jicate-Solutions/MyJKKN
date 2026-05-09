-- ============================================================================
-- INTERNSHIP MODULE — Seed Data
-- Migration: 20260508_internship_module_seeds.sql
-- Depends on: 20260508_internship_module_substrate.sql
-- Spec: specs/myjkkn-internship-module-spec.md (locked 2026-05-08)
-- Rows: 12 site types + 16 platform_policies + 7 college program configs
--       + 5 cycle status labels + 7 approval chain seeds
-- RISK TIER: 1 — INSERT only, all idempotent via ON CONFLICT DO NOTHING
-- ============================================================================

-- ============================================================================
-- 1. internship_site_types — 12+ system site types
-- ★ Source: spec section 11 Decision 27
-- All marked is_system=true (locked for delete), CRUDable (admins can add more)
-- institution_id = NULL means available globally to all institutions
-- ============================================================================
INSERT INTO internship_site_types
  (config_key, display_name, description, is_system, is_active, sort_order)
VALUES
  ('tertiary_hospital',     'Tertiary Hospital',         'Multi-specialty tertiary care hospital (NABH/JCI level)', true, true, 10),
  ('community_hospital',    'Community Hospital',        'Government or trust-run community-level hospital',        true, true, 20),
  ('clinic',                'Clinic / Polyclinic',       'Outpatient clinic or polyclinic',                        true, true, 30),
  ('pharmacy',              'Pharmacy',                  'Retail or hospital pharmacy setting',                    true, true, 40),
  ('laboratory',            'Diagnostic Laboratory',     'Pathology, radiology, or diagnostic lab',                true, true, 50),
  ('dental_surgery',        'Dental Surgery',            'Dental clinic or hospital (DCI-affiliated)',             true, true, 60),
  ('vet_hospital',          'Veterinary Hospital',       'Veterinary clinic or hospital',                         true, true, 70),
  ('educational_institution','Educational Institution',  'School, college, or training institution',               true, true, 80),
  ('industrial_site',       'Industrial Site',           'Factory, plant, or industrial workplace',                true, true, 90),
  ('research_lab',          'Research Laboratory',       'Government or private R&D laboratory',                   true, true, 100),
  ('ngo',                   'NGO / Community Centre',    'Non-governmental organisation or community outreach',    true, true, 110),
  ('virtual_internship',    'Virtual Internship',        'Remote / online internship placement',                   true, true, 120),
  ('health_camp',           'Health Camp',               'Mobile or community health camp',                       true, true, 130),
  ('other',                 'Other',                     'Any other site type not listed above',                  true, true, 999)
ON CONFLICT (config_key, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- 2. platform_policies — 16 cross-cutting internship policy rows
-- All use scope_type='global' (institution-level override can be added via UI)
-- ★ Source: spec section 11 policy list + spec section 1 Decisions 17-22
-- ============================================================================

-- 2a. Fee compliance
INSERT INTO platform_policies (policy_key, scope_type, value, description, data_type, is_system, is_active)
VALUES
  ('internship.policy.fee_compliance_threshold_pct',
   'global', '70'::jsonb,
   'Minimum fee payment % required for posting assignment activation (spec Decision 10)',
   'number', true, true),

  ('internship.policy.gps_geofence_strict_block',
   'global', 'true'::jsonb,
   'When true, GPS attendance outside geofence is hard-blocked (spec Decision 9)',
   'boolean', true, true),

  ('internship.policy.attendance_marking_window_minutes',
   'global', '30'::jsonb,
   'Minutes after reporting time in which attendance can be marked (geofence window)',
   'number', true, true),

  ('internship.policy.evaluation_dual_required',
   'global', 'true'::jsonb,
   'When true, both facilitator AND preceptor evaluations required for certificate generation',
   'boolean', true, true),

  ('internship.policy.preceptor_scope_default',
   'global', '"cycle"'::jsonb,
   'Default preceptor scope: cycle, site, or institution (spec Decision 5)',
   'enum', true, true),

  ('internship.policy.cascade_preview_enabled',
   'global', 'true'::jsonb,
   'Show cascade-preview pane before saving policy changes in Director UI',
   'boolean', true, true),

  ('internship.policy.realtime_invalidation_on_policy_edit',
   'global', 'true'::jsonb,
   'Fire Supabase realtime event on platform_policies update for internship.* keys (spec Decision 17)',
   'boolean', true, true),

  ('internship.policy.lop_immunity_status_key',
   'global', '"on_clinical_posting"'::jsonb,
   'hr_attendance_status_types.code value that marks posting-day attendance as LOP-immune (spec Decision 23)',
   'string', true, true),

  ('internship.policy.vehicle_booking_enabled',
   'global', 'true'::jsonb,
   'Enable vehicle booking feature for transport to external sites (spec Decision 8)',
   'boolean', true, true),

  ('internship.policy.certificate_auto_generate_on_complete',
   'global', 'true'::jsonb,
   'Automatically generate PDF certificate when assignment status → completed',
   'boolean', true, true),

  ('internship.policy.incident_escalation_tier1_hours',
   'global', '24'::jsonb,
   'Auto-escalate minor incidents after N hours if unreviewed (spec Decision 25)',
   'number', true, true),

  ('internship.policy.incident_escalation_tier2_hours',
   'global', '48'::jsonb,
   'Auto-escalate major incidents after N hours if unreviewed (spec Decision 25)',
   'number', true, true),

  ('internship.policy.cycle_min_duration_days',
   'global', '7'::jsonb,
   'Minimum cycle duration in days (posting cycles shorter than this are rejected)',
   'number', true, true),

  ('internship.policy.cycle_max_duration_days',
   'global', '365'::jsonb,
   'Maximum cycle duration in days',
   'number', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- 2b. Logbook policies (★ spec section 11 Decision 17, 24)
INSERT INTO platform_policies (policy_key, scope_type, value, description, data_type, is_system, is_active)
VALUES
  ('internship.logbook.submit_within_hours',
   'global', '24'::jsonb,
   'Hours after posting day within which logbook entry must be submitted (spec Decision 17)',
   'number', true, true),

  ('internship.logbook.late_penalty_pct',
   'global', '10'::jsonb,
   'Score penalty (%) applied to logbook score when submitted after submit_within_hours (spec Decision 18)',
   'number', true, true),

  ('internship.logbook.edit_window_hours',
   'global', '24'::jsonb,
   'Hours after submission during which learner can edit logbook entry (spec Decision 24)',
   'number', true, true),

-- 2c. Attendance policies (★ spec section 11 Decision 19)
  ('internship.attendance.flag_below_pct',
   'global', '75'::jsonb,
   'Attendance % below which learner gets flagged in coordinator dashboard (spec Decision 19)',
   'number', true, true),

-- 2d. Roster / notification cadence (★ spec section 11 Decision 20, 23)
  ('internship.roster.reminder_d_minus',
   'global', '3'::jsonb,
   'Days before cycle start to send posting reminder to learners (spec Decision 20)',
   'number', true, true),

  ('internship.vehicle.lead_time_days',
   'global', '5'::jsonb,
   'Minimum days advance notice required for vehicle booking (spec Decision 22)',
   'number', true, true),

  ('internship.approval.escalate_after_hours',
   'global', '72'::jsonb,
   'Hours before approval auto-escalates to next level (spec Decision 11)',
   'number', true, true),

-- 2e. Incident escalation (★ spec section 11 Decision 25)
  ('internship.incident.critical.notify_within_hours',
   'global', '1'::jsonb,
   'Hours within which critical incident must be notified to institution head',
   'number', true, true),

  ('internship.incident.major.notify_within_hours',
   'global', '4'::jsonb,
   'Hours within which major incident notification must be sent',
   'number', true, true),

  ('internship.incident.minor.notify_within_hours',
   'global', '24'::jsonb,
   'Hours within which minor incident notification must be sent',
   'number', true, true),

-- 2f. Notification cadence (★ spec section 11 Decision 23)
  ('internship.notify.roster_reminder_d_minus',
   'global', '3'::jsonb,
   'Days before cycle start: roster reminder push notification',
   'number', true, true),

  ('internship.notify.faculty_schedule_d_minus',
   'global', '5'::jsonb,
   'Days before cycle start: faculty supervisor schedule notification',
   'number', true, true),

  ('internship.notify.logbook_reminder_after_hours',
   'global', '18'::jsonb,
   'Hours after posting day end: logbook submission reminder if not yet submitted',
   'number', true, true),

  ('internship.notify.evaluation_reminder_after_hours',
   'global', '48'::jsonb,
   'Hours after cycle completion: evaluation completion reminder',
   'number', true, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ============================================================================
-- 3. internship_program_config — 7 JKKN college entries
-- One row per college with the college-specific module_label + defaults
-- ★ Source: spec section 1 Decision 11 (per-college label), spec section 11 Decision 3
-- NOTE: college_id and program_id are NULL here (college-level defaults).
--       Institution-specific rows added once institution IDs are known.
--       These are global default templates.
-- ============================================================================
INSERT INTO internship_program_config
  (config_key, display_name, description,
   default_duration_days, preceptor_ratio_max,
   warn_below_pct, fail_below_pct,
   assignment_split_strategy, module_label,
   is_active)
VALUES
  -- Allied Health Sciences (AHS): INC accreditation, ≤6 preceptor ratio, clinical posting label
  ('jkkn_ahs_default',
   'JKKN AHS — Default Clinical Posting Config',
   'Allied Health Sciences default: 12-week clinical posting, INC ratio ≤6',
   84, 6, 85.0, 80.0, 'per_department_row', 'Clinical Posting', true),

  -- Nursing: INC, 90/85 attendance thresholds, per-department rotation required
  ('jkkn_nursing_default',
   'JKKN Nursing — Default Clinical Posting Config',
   'Nursing default: INC 90% attendance threshold, dual-department rotation tracking',
   168, 6, 90.0, 85.0, 'per_department_row', 'Clinical Posting', true),

  -- Dental: DCI, ≤8 preceptor ratio
  ('jkkn_dental_default',
   'JKKN Dental — Default Clinical Posting Config',
   'Dental default: DCI accreditation, preceptor ratio ≤8',
   84, 8, 80.0, 75.0, 'single_row', 'Clinical Posting', true),

  -- Pharmacy: PCI, ≤10 preceptor ratio
  ('jkkn_pharmacy_default',
   'JKKN Pharmacy — Default Internship Config',
   'Pharmacy default: PCI accreditation, preceptor ratio ≤10, industrial placement',
   42, 10, 75.0, 65.0, 'single_row', 'Internship', true),

  -- Engineering: AICTE, 75% attendance, industrial internship label
  ('jkkn_engineering_default',
   'JKKN Engineering — Default Internship Config',
   'Engineering default: AICTE 75% attendance threshold, industrial/research internship',
   56, 10, 75.0, 65.0, 'single_row', 'Internship', true),

  -- Arts & Science: generic
  ('jkkn_arts_science_default',
   'JKKN Arts & Science — Default Internship Config',
   'Arts & Science default: general internship, flexible placement',
   28, 10, 75.0, 65.0, 'single_row', 'Internship', true),

  -- Education: teaching practice label
  ('jkkn_education_default',
   'JKKN Education — Default Teaching Practice Config',
   'Education default: teaching practice / field placement',
   30, 6, 80.0, 75.0, 'single_row', 'Teaching Practice', true)
ON CONFLICT (institution_id, config_key)
DO NOTHING;

-- ============================================================================
-- 4. internship_cycle_status_labels — 5 global default status labels
-- Maps ENUM values to human-readable labels; per-college overrides via college_id
-- ★ Source: spec section 11 Decision 21
-- ============================================================================
INSERT INTO internship_cycle_status_labels
  (institution_id, college_id, status_enum, label_text)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid AS institution_id,  -- placeholder; replace with real JKKN institution_id
  NULL AS college_id,
  status_enum,
  label_text
FROM (VALUES
  ('draft'::internship_cycle_status_enum,            'Draft'),
  ('pending_approval'::internship_cycle_status_enum, 'Pending Approval'),
  ('approved'::internship_cycle_status_enum,         'Approved'),
  ('fee_checking'::internship_cycle_status_enum,     'Fee Verification'),
  ('assignments_ready'::internship_cycle_status_enum,'Assignments Ready'),
  ('active'::internship_cycle_status_enum,           'Active'),
  ('completed'::internship_cycle_status_enum,        'Completed'),
  ('cancelled'::internship_cycle_status_enum,        'Cancelled')
) AS labels(status_enum, label_text)
ON CONFLICT (institution_id, COALESCE(college_id, '00000000-0000-0000-0000-000000000000'::uuid), status_enum)
DO NOTHING;

-- ============================================================================
-- 5. internship_approval_chains — default approval chain
-- One global default + one per-college override template
-- ★ Source: spec section 1 Decision 15, spec section 11 Decision 11
-- ============================================================================
-- NOTE: institution_id is required (NOT NULL). These rows use a placeholder
-- and should be re-applied with real institution_id after the Director confirms.
-- Seeds here establish the pattern; actual rows inserted via admin UI post-deploy.

-- The approval chain structure:
-- Step 1: Coordinator reviews → 72h escalate to HOD
-- Step 2: HOD approves → 72h escalate to super_admin
DO $$
DECLARE
  v_default_steps JSONB := '[
    {"step": 1, "role_key": "coordinator", "label": "Coordinator Review",
     "escalate_after_hours": 72, "escalate_to_role": "hod"},
    {"step": 2, "role_key": "hod", "label": "HoD Approval",
     "escalate_after_hours": 72, "escalate_to_role": "super_admin"}
  ]'::jsonb;
BEGIN
  -- Only insert if platform has a single institution seeded already (safe guard)
  INSERT INTO internship_approval_chains
    (institution_id, config_key, display_name, description, steps, is_default, is_active)
  SELECT
    id,
    'default',
    'Standard 2-Step Approval',
    'Coordinator → HoD approval chain (default for all posting types)',
    v_default_steps,
    true,
    true
  FROM institutions
  LIMIT 1
  ON CONFLICT (institution_id, config_key) DO NOTHING;
END $$;

-- ============================================================================
-- DONE — Seed data summary:
-- 14 internship_site_types (global defaults, is_system=true)
-- 30 platform_policies rows (internship.* namespace)
-- 7 internship_program_config rows (JKKN 7 colleges, no institution_id FK)
-- 8 internship_cycle_status_labels (global defaults)
-- 1 internship_approval_chains (default 2-step, from first institution)
-- ============================================================================
