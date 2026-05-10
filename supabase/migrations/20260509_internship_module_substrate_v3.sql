-- ============================================================================
-- INTERNSHIP MODULE — Substrate (Core + Config Tables) v3
-- Migration: 20260509_internship_module_substrate_v3.sql
-- Replaces: 20260508_internship_module_substrate.sql (deleted — broken FK + COALESCE-in-UNIQUE)
-- Spec: specs/myjkkn-internship-module-spec.md (locked 2026-05-08)
-- Tables: 11 core + 8 config = 19 new tables
-- Patches from v1:
--   1. FK target: institution_departments → institutions (table didn't exist in prod)
--   2. UNIQUE-with-COALESCE moved to CREATE UNIQUE INDEX (Postgres restriction)
-- RISK TIER: 1 — additive only, zero destructive ops
-- Applied to prod: 2026-05-09 (mcp__supabase__apply_migration as 'internship_module_substrate_v3')
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE internship_cycle_status_enum AS ENUM ('draft','pending_approval','approved','fee_checking','assignments_ready','active','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS internship_site_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  config_key    TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id),
  updated_by    UUID REFERENCES profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS internship_site_types_config_key_uq
  ON internship_site_types(config_key, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS internship_external_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  site_type_id UUID REFERENCES internship_site_types(id),
  site_name TEXT NOT NULL,
  hospital_code TEXT NOT NULL,
  address_line1 TEXT NOT NULL, address_line2 TEXT,
  city TEXT NOT NULL, district TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Tamil Nadu', pincode TEXT NOT NULL,
  latitude NUMERIC(10,7) NOT NULL, longitude NUMERIC(10,7) NOT NULL,
  geofence_radius_meters INT NOT NULL DEFAULT 200,
  max_learners_per_cycle INT,
  departments_available TEXT[] DEFAULT '{}',
  posting_fee_per_learner NUMERIC(10,2),
  contract_start_date DATE, contract_end_date DATE,
  operates_weekends BOOLEAN NOT NULL DEFAULT false,
  emergency_contact_name TEXT, emergency_contact_phone TEXT, emergency_contact_role TEXT,
  nearest_emergency_ward TEXT, ambulance_number TEXT,
  ownership_type TEXT NOT NULL DEFAULT 'private' CHECK (ownership_type IN ('private','government','university_affiliated','trust','corporate','ngo')),
  is_active BOOLEAN NOT NULL DEFAULT true, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, hospital_code)
);

CREATE TABLE IF NOT EXISTS internship_site_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  site_id UUID NOT NULL REFERENCES internship_external_sites(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL, designation TEXT,
  mobile TEXT NOT NULL, email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_emergency_contact BOOLEAN NOT NULL DEFAULT false,
  portal_user_id UUID REFERENCES profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS internship_preceptors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  site_id UUID NOT NULL REFERENCES internship_external_sites(id),
  profile_id UUID REFERENCES profiles(id),
  full_name TEXT NOT NULL, designation TEXT, qualification TEXT, specialization TEXT,
  mobile TEXT, email TEXT,
  max_students INT NOT NULL DEFAULT 6,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scope_type TEXT NOT NULL DEFAULT 'cycle' CHECK (scope_type IN ('cycle','site','institution')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS internship_approval_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  config_key TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT,
  posting_type TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

CREATE TABLE IF NOT EXISTS internship_posting_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID REFERENCES institutions(id),
  cycle_name TEXT NOT NULL,
  batch_id UUID REFERENCES batches(id), batch_label TEXT,
  program_ids UUID[] NOT NULL DEFAULT '{}',
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  status internship_cycle_status_enum NOT NULL DEFAULT 'draft',
  approval_chain_id UUID REFERENCES internship_approval_chains(id),
  current_approval_step INT DEFAULT 0,
  fee_compliance_threshold NUMERIC(5,2) NOT NULL DEFAULT 70.00,
  fee_check_deadline DATE,
  temporal_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (temporal_mode IN ('fixed','rolling','batch_aligned')),
  posting_type TEXT NOT NULL DEFAULT 'standard' CHECK (posting_type IN ('standard','community','industrial','research','virtual')),
  escalate_after_hours INT NOT NULL DEFAULT 72,
  delegated_to UUID REFERENCES profiles(id),
  sites_count INT DEFAULT 0, learners_count INT DEFAULT 0,
  approved_by UUID REFERENCES profiles(id), approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  CONSTRAINT internship_cycles_valid_dates CHECK (end_date > start_date),
  CONSTRAINT internship_cycles_valid_threshold CHECK (fee_compliance_threshold >= 0 AND fee_compliance_threshold <= 100)
);

CREATE TABLE IF NOT EXISTS internship_cycle_hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  cycle_id UUID NOT NULL REFERENCES internship_posting_cycles(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES internship_external_sites(id),
  allocated_learners INT NOT NULL DEFAULT 0,
  confirmed_by_hospital BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ, confirmed_by UUID REFERENCES profiles(id),
  site_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(cycle_id, site_id)
);

CREATE TABLE IF NOT EXISTS internship_program_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID REFERENCES institutions(id),
  program_id UUID REFERENCES programs(id),
  config_key TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT,
  default_duration_days INT NOT NULL DEFAULT 84,
  min_duration_days INT NOT NULL DEFAULT 7, max_duration_days INT NOT NULL DEFAULT 365,
  preceptor_ratio_max INT NOT NULL DEFAULT 6,
  warn_below_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  fail_below_pct NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  assignment_split_strategy TEXT NOT NULL DEFAULT 'single_row' CHECK (assignment_split_strategy IN ('single_row','per_department_row')),
  attachment_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  module_label TEXT NOT NULL DEFAULT 'Internship',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

CREATE TABLE IF NOT EXISTS internship_logbook_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID REFERENCES institutions(id),
  program_id UUID REFERENCES programs(id),
  config_key TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true, version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

CREATE TABLE IF NOT EXISTS internship_evaluation_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID REFERENCES institutions(id),
  program_id UUID REFERENCES programs(id),
  config_key TEXT NOT NULL, display_name TEXT NOT NULL, description TEXT,
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  scale_min INT NOT NULL DEFAULT 1, scale_max INT NOT NULL DEFAULT 5,
  weight_preceptor NUMERIC(3,2) NOT NULL DEFAULT 0.40,
  weight_facilitator NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  is_active BOOLEAN NOT NULL DEFAULT true, version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

CREATE TABLE IF NOT EXISTS internship_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  cycle_id UUID NOT NULL REFERENCES internship_posting_cycles(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id),
  site_id UUID NOT NULL REFERENCES internship_external_sites(id),
  facilitator_id UUID NOT NULL REFERENCES profiles(id),
  preceptor_id UUID REFERENCES internship_preceptors(id),
  program_id UUID REFERENCES programs(id),
  department_rotation TEXT,
  rotation_start_date DATE NOT NULL, rotation_end_date DATE NOT NULL,
  assignment_join_date DATE,
  required_attendance_pct NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  evaluation_rubric_snapshot JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled','extended')),
  fee_compliance_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (fee_compliance_status IN ('unchecked','compliant','non_compliant','exception_granted')),
  fee_compliance_checked_at TIMESTAMPTZ,
  fee_exception_reason TEXT,
  fee_exception_granted_by UUID REFERENCES profiles(id),
  superseded_by UUID REFERENCES internship_assignments(id),
  cancellation_audit JSONB DEFAULT '{}'::jsonb,
  total_days INT DEFAULT 0, days_present INT DEFAULT 0,
  attendance_percentage NUMERIC(5,2) DEFAULT 0,
  logbook_entries_count INT DEFAULT 0,
  facilitator_evaluation_score NUMERIC(5,2),
  supervisor_evaluation_score NUMERIC(5,2),
  overall_grade TEXT CHECK (overall_grade IN ('A','B','C','D','F')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(cycle_id, learner_id),
  CONSTRAINT internship_assignments_valid_dates CHECK (rotation_end_date >= rotation_start_date)
);

CREATE TABLE IF NOT EXISTS internship_logbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  assignment_id UUID NOT NULL REFERENCES internship_assignments(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id),
  site_id UUID NOT NULL REFERENCES internship_external_sites(id),
  entry_date DATE NOT NULL,
  template_id UUID REFERENCES internship_logbook_templates(id),
  entry_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewed','needs_revision','approved')),
  reviewed_by UUID REFERENCES profiles(id), reviewed_at TIMESTAMPTZ, review_comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  edit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(assignment_id, entry_date)
);

CREATE TABLE IF NOT EXISTS internship_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  assignment_id UUID NOT NULL REFERENCES internship_assignments(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners_profiles(id),
  evaluator_role TEXT NOT NULL CHECK (evaluator_role IN ('facilitator','preceptor','proxy_facilitator')),
  evaluator_id UUID NOT NULL REFERENCES profiles(id),
  evaluation_date DATE NOT NULL,
  rubric_id UUID REFERENCES internship_evaluation_rubrics(id),
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(5,2),
  strengths TEXT, areas_for_improvement TEXT, overall_comments TEXT,
  recommended_grade TEXT CHECK (recommended_grade IN ('A','B','C','D','F')),
  is_proxy BOOLEAN NOT NULL DEFAULT false,
  proxy_source TEXT CHECK (proxy_source IN ('verbal_feedback','written_form','observation')),
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(assignment_id, evaluator_role)
);

CREATE TABLE IF NOT EXISTS internship_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  assignment_id UUID REFERENCES internship_assignments(id),
  site_id UUID NOT NULL REFERENCES internship_external_sites(id),
  reported_by UUID NOT NULL REFERENCES profiles(id),
  reporter_role TEXT NOT NULL CHECK (reporter_role IN ('learner','facilitator','site_contact','preceptor')),
  incident_date DATE NOT NULL, incident_time TIME,
  incident_category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor','major','critical')),
  description TEXT NOT NULL,
  immediate_action_taken TEXT, hospital_response TEXT,
  follow_up_owner UUID REFERENCES profiles(id),
  learners_involved JSONB DEFAULT '[]'::jsonb,
  witnesses JSONB DEFAULT '[]'::jsonb,
  photo_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','under_review','action_taken','resolved','escalated')),
  escalated_at TIMESTAMPTZ, escalated_to UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id), reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  follow_up_required BOOLEAN DEFAULT false, follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS internship_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  assignment_id UUID NOT NULL REFERENCES internship_assignments(id),
  certificate_number TEXT NOT NULL UNIQUE,
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  attendance_percentage NUMERIC(5,2) NOT NULL,
  evaluation_average NUMERIC(5,2) NOT NULL,
  competencies_passed INT NOT NULL DEFAULT 0,
  competencies_total INT NOT NULL DEFAULT 0,
  certificate_pdf_url TEXT,
  verification_url TEXT NOT NULL,
  signed_by_coo UUID REFERENCES profiles(id),
  signed_by_coordinator UUID REFERENCES profiles(id),
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ, revoked_by UUID REFERENCES profiles(id),
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS internship_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  cycle_id UUID REFERENCES internship_posting_cycles(id),
  vehicle_name TEXT NOT NULL, vehicle_number TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 10,
  driver_id UUID REFERENCES profiles(id),
  route_from TEXT NOT NULL, route_to TEXT NOT NULL,
  departure_time TIME NOT NULL, return_time TIME,
  request_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','in_progress','completed','cancelled')),
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id), approved_at TIMESTAMPTZ,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS internship_cycle_status_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID REFERENCES institutions(id),
  status_enum internship_cycle_status_enum NOT NULL,
  label_text TEXT NOT NULL,
  config_key TEXT, display_name TEXT, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS internship_cycle_status_labels_status_uq
  ON internship_cycle_status_labels(institution_id, COALESCE(college_id, '00000000-0000-0000-0000-000000000000'::uuid), status_enum);

CREATE TABLE IF NOT EXISTS internship_college_blackouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID NOT NULL REFERENCES institutions(id),
  config_key TEXT, display_name TEXT NOT NULL, description TEXT,
  start_date DATE NOT NULL, end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  CONSTRAINT internship_blackouts_valid_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS internship_college_notification_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  college_id UUID NOT NULL REFERENCES institutions(id),
  policy_key TEXT NOT NULL,
  config_key TEXT, display_name TEXT, description TEXT,
  override_value JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id), updated_by UUID REFERENCES profiles(id),
  UNIQUE(institution_id, college_id, policy_key)
);

ALTER TABLE learner_competencies ADD COLUMN IF NOT EXISTS posting_assignment_id UUID REFERENCES internship_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_learner_competencies_posting ON learner_competencies(posting_assignment_id) WHERE posting_assignment_id IS NOT NULL;

ALTER TABLE health_practice_attendance
  ADD COLUMN IF NOT EXISTS gps_lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS gps_lng NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geofence_pass BOOLEAN,
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES internship_external_sites(id),
  ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS posting_assignment_id UUID REFERENCES internship_assignments(id),
  ADD COLUMN IF NOT EXISTS is_proxy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_reason TEXT,
  ADD COLUMN IF NOT EXISTS marked_for UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_reason TEXT,
  ADD COLUMN IF NOT EXISTS emergency_photo_url TEXT;

ALTER TABLE internship_site_types                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_external_sites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_site_contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_preceptors                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_approval_chains                ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_posting_cycles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_cycle_hospitals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_program_config                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_logbook_templates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_evaluation_rubrics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_assignments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_logbook_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_evaluations                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_incidents                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_certificates                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_vehicles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_cycle_status_labels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_college_blackouts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE internship_college_notification_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "internship_site_types_institution_access" ON internship_site_types FOR ALL
    USING (institution_id IS NULL OR institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_external_sites_institution_access" ON internship_external_sites FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_site_contacts_institution_access" ON internship_site_contacts FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_preceptors_institution_access" ON internship_preceptors FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_approval_chains_institution_access" ON internship_approval_chains FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_posting_cycles_institution_access" ON internship_posting_cycles FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_cycle_hospitals_institution_access" ON internship_cycle_hospitals FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_program_config_institution_access" ON internship_program_config FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_logbook_templates_institution_access" ON internship_logbook_templates FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_evaluation_rubrics_institution_access" ON internship_evaluation_rubrics FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_assignments_institution_access" ON internship_assignments FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_logbook_entries_institution_access" ON internship_logbook_entries FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_evaluations_institution_access" ON internship_evaluations FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_incidents_institution_access" ON internship_incidents FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_certificates_institution_access" ON internship_certificates FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_vehicles_institution_access" ON internship_vehicles FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_cycle_status_labels_institution_access" ON internship_cycle_status_labels FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_college_blackouts_institution_access" ON internship_college_blackouts FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
  CREATE POLICY "internship_college_notification_overrides_institution_access" ON internship_college_notification_overrides FOR ALL
    USING (institution_id IN (SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN null; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON internship_site_types                     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_external_sites                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_site_contacts                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_preceptors                     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_approval_chains                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_posting_cycles                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_cycle_hospitals                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_program_config                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_logbook_templates              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_evaluation_rubrics             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_assignments                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_logbook_entries                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_evaluations                    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_incidents                      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_certificates                   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_vehicles                       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_cycle_status_labels            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_college_blackouts              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internship_college_notification_overrides TO authenticated;

CREATE INDEX IF NOT EXISTS idx_internship_sites_institution ON internship_external_sites(institution_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_sites_type ON internship_external_sites(site_type_id);
CREATE INDEX IF NOT EXISTS idx_internship_sites_geo ON internship_external_sites(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_internship_site_contacts_site ON internship_site_contacts(site_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_preceptors_site ON internship_preceptors(site_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_cycles_status ON internship_posting_cycles(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_cycles_dates ON internship_posting_cycles(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_internship_cycle_hospitals_cycle ON internship_cycle_hospitals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_cycle ON internship_assignments(cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_learner ON internship_assignments(learner_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_site ON internship_assignments(site_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_facilitator ON internship_assignments(facilitator_id);
CREATE INDEX IF NOT EXISTS idx_internship_logbook_assignment ON internship_logbook_entries(assignment_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_internship_evaluations_assignment ON internship_evaluations(assignment_id);
CREATE INDEX IF NOT EXISTS idx_internship_incidents_severity ON internship_incidents(severity, status);
CREATE INDEX IF NOT EXISTS idx_internship_incidents_assignment ON internship_incidents(assignment_id);
CREATE INDEX IF NOT EXISTS idx_internship_certificates_number ON internship_certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_internship_certificates_assignment ON internship_certificates(assignment_id);
CREATE INDEX IF NOT EXISTS idx_internship_vehicles_date ON internship_vehicles(request_date, status);
CREATE INDEX IF NOT EXISTS idx_internship_program_config_college ON internship_program_config(college_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_blackouts_college_dates ON internship_college_blackouts(college_id, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_notif_overrides_college_key ON internship_college_notification_overrides(college_id, policy_key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_assignments_metric ON internship_assignments(status, attendance_percentage, logbook_entries_count, facilitator_evaluation_score, supervisor_evaluation_score);
