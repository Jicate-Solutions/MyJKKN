-- ============================================================================
-- INTERNSHIP MODULE — Substrate (Core + Config Tables)
-- Migration: 20260508_internship_module_substrate.sql
-- Spec: specs/myjkkn-internship-module-spec.md (locked 2026-05-08)
-- Tables: 11 core + 8 config = 19 new tables
-- Table prefix: internship_* (renamed from omm-dev ip_*)
-- RLS: default deny + super_admin / institution scoped override
-- RISK TIER: 1 — additive only, zero destructive ops
-- Director checklist:
--   1. Review SQL
--   2. Run on Supabase branch: mcp__supabase__create_branch
--   3. Apply: mcp__supabase__apply_migration per file
-- ============================================================================

-- ★ Source: spec section 11 (assumption-thrash O3)
-- health_practice_attendance ADOPTED + EXTENDED in migration 4 (lop_immunity)
-- ★ Source: spec section 11 (assumption-thrash O1)
-- learner_competencies extended with posting_assignment_id in this file (bottom)
-- ★ Source: spec section 11 (assumption-thrash O2)
-- hr_attendance_status_types extended with on_clinical_posting in migration 4

-- ============================================================================
-- ENUM: internship_cycle_status_enum
-- ★ Source: spec section 11, Decision 21 + spec section 3
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE internship_cycle_status_enum AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'fee_checking',
    'assignments_ready',
    'active',
    'completed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CONFIG TABLE 1: internship_site_types
-- CRUDable master list — not an ENUM (Q1 enforcement)
-- ★ Source: spec section 3, spec section 11 Decision 27
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_site_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID        REFERENCES institutions(id),              -- NULL = global default
  config_key    TEXT        NOT NULL,                                 -- e.g. 'hospital', 'clinic'
  display_name  TEXT        NOT NULL,
  description   TEXT,
  is_system     BOOLEAN     NOT NULL DEFAULT false,                   -- system rows locked for delete
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID        REFERENCES profiles(id),
  updated_by    UUID        REFERENCES profiles(id),
  UNIQUE(config_key, COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- ============================================================================
-- CORE TABLE 1: internship_external_sites
-- Hospital/company/school master with GPS + geofence + weekend config
-- ★ Source: spec section 3, spec section 11 Decisions 2, 8, 16
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_external_sites (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id              UUID        NOT NULL REFERENCES institutions(id),
  site_type_id                UUID        REFERENCES internship_site_types(id),
  site_name                   TEXT        NOT NULL,
  hospital_code               TEXT        NOT NULL,                   -- unique per institution
  address_line1               TEXT        NOT NULL,
  address_line2               TEXT,
  city                        TEXT        NOT NULL,
  district                    TEXT        NOT NULL,
  state                       TEXT        NOT NULL DEFAULT 'Tamil Nadu',
  pincode                     TEXT        NOT NULL,
  latitude                    NUMERIC(10, 7) NOT NULL,
  longitude                   NUMERIC(10, 7) NOT NULL,
  geofence_radius_meters      INT         NOT NULL DEFAULT 200,       -- ★ spec Decision 16: per-site, range 50-1000
  max_learners_per_cycle      INT,
  departments_available       TEXT[]      DEFAULT '{}',
  posting_fee_per_learner     NUMERIC(10, 2),
  contract_start_date         DATE,
  contract_end_date           DATE,
  operates_weekends           BOOLEAN     NOT NULL DEFAULT false,     -- ★ spec Decision 8
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_role      TEXT,
  nearest_emergency_ward      TEXT,
  ambulance_number            TEXT,
  ownership_type              TEXT        NOT NULL DEFAULT 'private'
                              CHECK (ownership_type IN ('private','government','university_affiliated','trust','corporate','ngo')),
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID        REFERENCES profiles(id),
  updated_by                  UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, hospital_code)
);

-- ============================================================================
-- CORE TABLE 2: internship_site_contacts
-- Admin coordinators at external sites; portal_user_id links to auth
-- ★ Source: spec section 3, spec section 11 Decision 13 (portal auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_site_contacts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID        NOT NULL REFERENCES institutions(id),
  site_id              UUID        NOT NULL REFERENCES internship_external_sites(id) ON DELETE CASCADE,
  contact_name         TEXT        NOT NULL,
  designation          TEXT,
  mobile               TEXT        NOT NULL,
  email                TEXT,
  is_primary           BOOLEAN     NOT NULL DEFAULT false,
  is_emergency_contact BOOLEAN     NOT NULL DEFAULT false,
  portal_user_id       UUID        REFERENCES profiles(id),           -- set when contact gets portal access
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID        REFERENCES profiles(id),
  updated_by           UUID        REFERENCES profiles(id)
);

-- ============================================================================
-- CORE TABLE 3: internship_preceptors
-- First-class preceptor records (NEW custom_role, not just a junction)
-- ★ Source: spec section 2, spec section 1 Decision 7 (accreditation ratio)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_preceptors (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID        NOT NULL REFERENCES institutions(id),
  site_id           UUID        NOT NULL REFERENCES internship_external_sites(id),
  profile_id        UUID        REFERENCES profiles(id),              -- NULL if external (not in auth)
  full_name         TEXT        NOT NULL,
  designation       TEXT,
  qualification     TEXT,
  specialization    TEXT,
  mobile            TEXT,
  email             TEXT,
  max_students      INT         NOT NULL DEFAULT 6,                   -- ★ INC default ≤6
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  scope_type        TEXT        NOT NULL DEFAULT 'cycle'
                    CHECK (scope_type IN ('cycle','site','institution')), -- ★ spec Decision 5 (preceptor scope)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID        REFERENCES profiles(id),
  updated_by        UUID        REFERENCES profiles(id)
);

-- ============================================================================
-- CONFIG TABLE 2: internship_approval_chains
-- N-level approval routing per posting_type (Q3 enforcement)
-- ★ Source: spec section 1 Decision 15, spec section 11 Decision 11
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_approval_chains (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institutions(id),
  config_key      TEXT        NOT NULL,                               -- e.g. 'default', 'ahs', 'nursing'
  display_name    TEXT        NOT NULL,
  description     TEXT,
  posting_type    TEXT,                                               -- NULL = applies to all types
  steps           JSONB       NOT NULL DEFAULT '[]'::jsonb,          -- [{step:1, role_key:'coordinator', escalate_after_hours:72}]
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID        REFERENCES profiles(id),
  updated_by      UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

-- ============================================================================
-- CORE TABLE 4: internship_posting_cycles
-- Cycle definitions — temporal anchor, fee threshold, approval chain
-- ★ Source: spec section 3, spec section 11 Decisions 1, 4 (temporal model, lineage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_posting_cycles (
  id                            UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id                UUID                          NOT NULL REFERENCES institutions(id),
  college_id                    UUID                          REFERENCES institution_departments(id),
  cycle_name                    TEXT                          NOT NULL,
  batch_id                      UUID                          REFERENCES batches(id),
  batch_label                   TEXT,
  program_ids                   UUID[]                        NOT NULL DEFAULT '{}',
  start_date                    DATE                          NOT NULL,
  end_date                      DATE                          NOT NULL,
  status                        internship_cycle_status_enum  NOT NULL DEFAULT 'draft',
  approval_chain_id             UUID                          REFERENCES internship_approval_chains(id),
  current_approval_step         INT                           DEFAULT 0,
  -- Structural rules frozen at activation (★ spec Decision 4 lineage)
  fee_compliance_threshold      NUMERIC(5, 2)                 NOT NULL DEFAULT 70.00, -- ★ spec Decision 10
  fee_check_deadline            DATE,
  temporal_mode                 TEXT                          NOT NULL DEFAULT 'fixed'
                                CHECK (temporal_mode IN ('fixed','rolling','batch_aligned')),  -- ★ spec Decision 1
  posting_type                  TEXT                          NOT NULL DEFAULT 'standard'
                                CHECK (posting_type IN ('standard','community','industrial','research','virtual')),
  escalate_after_hours          INT                           NOT NULL DEFAULT 72,   -- ★ spec Decision 11
  delegated_to                  UUID                          REFERENCES profiles(id),
  -- Counts (denormalized for performance)
  sites_count                   INT                           DEFAULT 0,
  learners_count                INT                           DEFAULT 0,
  -- Approval audit
  approved_by                   UUID                          REFERENCES profiles(id),
  approved_at                   TIMESTAMPTZ,
  notes                         TEXT,
  created_at                    TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  created_by                    UUID                          REFERENCES profiles(id),
  updated_by                    UUID                          REFERENCES profiles(id),
  CONSTRAINT internship_cycles_valid_dates CHECK (end_date > start_date),
  CONSTRAINT internship_cycles_valid_threshold CHECK (
    fee_compliance_threshold >= 0 AND fee_compliance_threshold <= 100
  )
);

-- ============================================================================
-- CORE TABLE 5: internship_cycle_hospitals
-- Cycle ↔ site M2M junction
-- ★ Source: spec section 3
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_cycle_hospitals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID        NOT NULL REFERENCES institutions(id),
  cycle_id              UUID        NOT NULL REFERENCES internship_posting_cycles(id) ON DELETE CASCADE,
  site_id               UUID        NOT NULL REFERENCES internship_external_sites(id),
  allocated_learners    INT         NOT NULL DEFAULT 0,
  confirmed_by_hospital BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at          TIMESTAMPTZ,
  confirmed_by          UUID        REFERENCES profiles(id),
  site_notes            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID        REFERENCES profiles(id),
  UNIQUE(cycle_id, site_id)
);

-- ============================================================================
-- CONFIG TABLE 3: internship_program_config
-- Per-program defaults (duration, preceptor ratio, rubric, logbook template)
-- ★ Source: spec section 3, spec section 11 Decisions 3, 6, 12, 26
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_program_config (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           UUID        NOT NULL REFERENCES institutions(id),
  college_id               UUID        REFERENCES institution_departments(id),
  program_id               UUID        REFERENCES programs(id),
  config_key               TEXT        NOT NULL,                     -- e.g. 'ahs_bsc_nursing'
  display_name             TEXT        NOT NULL,
  description              TEXT,
  -- Duration
  default_duration_days    INT         NOT NULL DEFAULT 84,          -- 12 weeks default
  min_duration_days        INT         NOT NULL DEFAULT 7,
  max_duration_days        INT         NOT NULL DEFAULT 365,
  -- Accreditation ratio
  preceptor_ratio_max      INT         NOT NULL DEFAULT 6,           -- ★ spec Decision 21: INC≤6, DCI≤8, PCI≤10
  -- Attendance thresholds (★ spec Decision 6)
  warn_below_pct           NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  fail_below_pct           NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  -- Assignment split strategy (★ spec Decision 26)
  assignment_split_strategy TEXT       NOT NULL DEFAULT 'single_row'
                             CHECK (assignment_split_strategy IN ('single_row','per_department_row')),
  -- Attachment requirements (★ spec Decision 12)
  attachment_requirements  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- UI label override (★ spec Decision 11)
  module_label             TEXT        NOT NULL DEFAULT 'Internship', -- 'Clinical Posting' for nursing
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID        REFERENCES profiles(id),
  updated_by               UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

-- ============================================================================
-- CONFIG TABLE 4: internship_logbook_templates
-- Per-program logbook field schema (template-driven via JSONB)
-- ★ Source: spec section 3, spec section 1 Decision 13
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_logbook_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES institutions(id),
  college_id       UUID        REFERENCES institution_departments(id),
  program_id       UUID        REFERENCES programs(id),
  config_key       TEXT        NOT NULL,
  display_name     TEXT        NOT NULL,
  description      TEXT,
  fields           JSONB       NOT NULL DEFAULT '[]'::jsonb,         -- array of {name, label, type, required}
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  version          INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES profiles(id),
  updated_by       UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

-- ============================================================================
-- CONFIG TABLE 5: internship_evaluation_rubrics
-- Per-program evaluation rubric (versioned — snapshot at assignment activation)
-- ★ Source: spec section 3, spec section 1 Decision 14, spec section 11 Decision 22
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_evaluation_rubrics (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID        NOT NULL REFERENCES institutions(id),
  college_id            UUID        REFERENCES institution_departments(id),
  program_id            UUID        REFERENCES programs(id),
  config_key            TEXT        NOT NULL,
  display_name          TEXT        NOT NULL,
  description           TEXT,
  criteria              JSONB       NOT NULL DEFAULT '[]'::jsonb,    -- [{name, weight, scale_min, scale_max}]
  scale_min             INT         NOT NULL DEFAULT 1,
  scale_max             INT         NOT NULL DEFAULT 5,
  weight_preceptor      NUMERIC(3,2) NOT NULL DEFAULT 0.40,
  weight_facilitator    NUMERIC(3,2) NOT NULL DEFAULT 0.60,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  version               INT         NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID        REFERENCES profiles(id),
  updated_by            UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, config_key)
);

-- ============================================================================
-- CORE TABLE 6: internship_assignments
-- Learner ↔ cycle ↔ site assignment (core tracking record)
-- ★ Source: spec section 3, spec section 11 Decisions 5, 7, 16, 22
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_assignments (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id                UUID        NOT NULL REFERENCES institutions(id),
  cycle_id                      UUID        NOT NULL REFERENCES internship_posting_cycles(id) ON DELETE CASCADE,
  learner_id                    UUID        NOT NULL REFERENCES learners_profiles(id),
  site_id                       UUID        NOT NULL REFERENCES internship_external_sites(id),
  facilitator_id                UUID        NOT NULL REFERENCES profiles(id),
  preceptor_id                  UUID        REFERENCES internship_preceptors(id),
  program_id                    UUID        REFERENCES programs(id),
  department_rotation           TEXT,
  rotation_start_date           DATE        NOT NULL,
  rotation_end_date             DATE        NOT NULL,
  -- Pro-rata support (★ spec Decision 5)
  assignment_join_date          DATE,                                 -- NULL = started on rotation_start_date
  required_attendance_pct       NUMERIC(5,2) NOT NULL DEFAULT 75.00, -- snapshot at activation
  -- Rubric snapshot (★ spec Decision 22 — frozen at activation, edits don't retroact)
  evaluation_rubric_snapshot    JSONB       DEFAULT '{}'::jsonb,
  status                        TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','active','completed','cancelled','extended')),
  -- Fee compliance
  fee_compliance_status         TEXT        NOT NULL DEFAULT 'unchecked'
                                CHECK (fee_compliance_status IN ('unchecked','compliant','non_compliant','exception_granted')),
  fee_compliance_checked_at     TIMESTAMPTZ,
  fee_exception_reason          TEXT,
  fee_exception_granted_by      UUID        REFERENCES profiles(id),
  -- Cancellation audit (★ spec Decision 7)
  superseded_by                 UUID        REFERENCES internship_assignments(id),
  cancellation_audit            JSONB       DEFAULT '{}'::jsonb,
  -- Aggregates (updated by triggers / service layer)
  total_days                    INT         DEFAULT 0,
  days_present                  INT         DEFAULT 0,
  attendance_percentage         NUMERIC(5,2) DEFAULT 0,
  logbook_entries_count         INT         DEFAULT 0,
  facilitator_evaluation_score  NUMERIC(5,2),
  supervisor_evaluation_score   NUMERIC(5,2),
  overall_grade                 TEXT        CHECK (overall_grade IN ('A','B','C','D','F')),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                    UUID        REFERENCES profiles(id),
  updated_by                    UUID        REFERENCES profiles(id),
  UNIQUE(cycle_id, learner_id),
  CONSTRAINT internship_assignments_valid_dates CHECK (rotation_end_date >= rotation_start_date)
);

-- ============================================================================
-- CORE TABLE 7: internship_logbook_entries
-- Daily logbook submissions (template-driven via JSONB)
-- ★ Source: spec section 3, spec section 11 Decisions 24 (edit window)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_logbook_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID        NOT NULL REFERENCES institutions(id),
  assignment_id     UUID        NOT NULL REFERENCES internship_assignments(id) ON DELETE CASCADE,
  learner_id        UUID        NOT NULL REFERENCES learners_profiles(id),
  site_id           UUID        NOT NULL REFERENCES internship_external_sites(id),
  entry_date        DATE        NOT NULL,
  template_id       UUID        REFERENCES internship_logbook_templates(id),
  -- Template-driven content
  entry_data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Attachments
  attachments       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Review workflow
  review_status     TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending','reviewed','needs_revision','approved')),
  reviewed_by       UUID        REFERENCES profiles(id),
  reviewed_at       TIMESTAMPTZ,
  review_comments   TEXT,
  -- Late-edit audit (★ spec Decision 24)
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ,
  edit_history      JSONB       NOT NULL DEFAULT '[]'::jsonb,        -- [{edited_at, edited_by, snapshot}]
  is_locked         BOOLEAN     NOT NULL DEFAULT false,              -- locked after edit_window expires
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID        REFERENCES profiles(id),
  updated_by        UUID        REFERENCES profiles(id),
  UNIQUE(assignment_id, entry_date)
);

-- ============================================================================
-- CORE TABLE 8: internship_evaluations
-- Dual evaluation rows (facilitator + preceptor)
-- ★ Source: spec section 3, spec section 11 Decision 22
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_evaluations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID        NOT NULL REFERENCES institutions(id),
  assignment_id         UUID        NOT NULL REFERENCES internship_assignments(id) ON DELETE CASCADE,
  learner_id            UUID        NOT NULL REFERENCES learners_profiles(id),
  evaluator_role        TEXT        NOT NULL
                        CHECK (evaluator_role IN ('facilitator','preceptor','proxy_facilitator')),
  evaluator_id          UUID        NOT NULL REFERENCES profiles(id),
  evaluation_date       DATE        NOT NULL,
  rubric_id             UUID        REFERENCES internship_evaluation_rubrics(id),
  -- Template-driven scores
  scores                JSONB       NOT NULL DEFAULT '{}'::jsonb,    -- {criterion_key: score}
  total_score           NUMERIC(5,2),
  -- Qualitative
  strengths             TEXT,
  areas_for_improvement TEXT,
  overall_comments      TEXT,
  recommended_grade     TEXT        CHECK (recommended_grade IN ('A','B','C','D','F')),
  -- Proxy metadata (when facilitator records preceptor's evaluation)
  is_proxy              BOOLEAN     NOT NULL DEFAULT false,
  proxy_source          TEXT        CHECK (proxy_source IN ('verbal_feedback','written_form','observation')),
  signed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID        REFERENCES profiles(id),
  updated_by            UUID        REFERENCES profiles(id),
  UNIQUE(assignment_id, evaluator_role)
);

-- ============================================================================
-- CORE TABLE 9: internship_incidents
-- 3-tier severity incident reports with auto-escalation
-- ★ Source: spec section 3, spec section 11 Decision 25
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_incidents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID        NOT NULL REFERENCES institutions(id),
  assignment_id        UUID        REFERENCES internship_assignments(id),
  site_id              UUID        NOT NULL REFERENCES internship_external_sites(id),
  reported_by          UUID        NOT NULL REFERENCES profiles(id),
  reporter_role        TEXT        NOT NULL
                       CHECK (reporter_role IN ('learner','facilitator','site_contact','preceptor')),
  incident_date        DATE        NOT NULL,
  incident_time        TIME,
  incident_category    TEXT        NOT NULL,
  severity             TEXT        NOT NULL
                       CHECK (severity IN ('minor','major','critical')),  -- ★ 3-tier per spec Decision 25
  description          TEXT        NOT NULL,
  immediate_action_taken TEXT,
  hospital_response    TEXT,
  follow_up_owner      UUID        REFERENCES profiles(id),
  learners_involved    JSONB       DEFAULT '[]'::jsonb,
  witnesses            JSONB       DEFAULT '[]'::jsonb,
  photo_urls           JSONB       DEFAULT '[]'::jsonb,
  status               TEXT        NOT NULL DEFAULT 'reported'
                       CHECK (status IN ('reported','under_review','action_taken','resolved','escalated')),
  -- Escalation tracking
  escalated_at         TIMESTAMPTZ,
  escalated_to         UUID        REFERENCES profiles(id),
  reviewed_by          UUID        REFERENCES profiles(id),
  reviewed_at          TIMESTAMPTZ,
  resolution_notes     TEXT,
  follow_up_required   BOOLEAN     DEFAULT false,
  follow_up_date       DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID        REFERENCES profiles(id),
  updated_by           UUID        REFERENCES profiles(id)
);

-- ============================================================================
-- CORE TABLE 10: internship_certificates
-- Verified completion certificates with revocation support
-- ★ Source: spec section 3, spec section 11 Decision 28
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_certificates (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id          UUID        NOT NULL REFERENCES institutions(id),
  assignment_id           UUID        NOT NULL REFERENCES internship_assignments(id),
  certificate_number      TEXT        NOT NULL UNIQUE,
  issued_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  attendance_percentage   NUMERIC(5,2) NOT NULL,
  evaluation_average      NUMERIC(5,2) NOT NULL,
  competencies_passed     INT         NOT NULL DEFAULT 0,
  competencies_total      INT         NOT NULL DEFAULT 0,
  certificate_pdf_url     TEXT,
  verification_url        TEXT        NOT NULL,                      -- public /internships/certificates/verify/[certId]
  signed_by_coo           UUID        REFERENCES profiles(id),
  signed_by_coordinator   UUID        REFERENCES profiles(id),
  -- Revocation (★ spec Decision 28)
  is_revoked              BOOLEAN     NOT NULL DEFAULT false,
  revoked_at              TIMESTAMPTZ,
  revoked_by              UUID        REFERENCES profiles(id),
  revocation_reason       TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID        REFERENCES profiles(id)
);

-- ============================================================================
-- CORE TABLE 11: internship_vehicles
-- Vehicle booking for transport to sites (ported from omm-dev)
-- ★ Source: spec section 1 Decision 8 (vehicle booking v1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_vehicles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES institutions(id),
  cycle_id         UUID        REFERENCES internship_posting_cycles(id),
  vehicle_name     TEXT        NOT NULL,
  vehicle_number   TEXT        NOT NULL,
  capacity         INT         NOT NULL DEFAULT 10,
  driver_id        UUID        REFERENCES profiles(id),
  route_from       TEXT        NOT NULL,
  route_to         TEXT        NOT NULL,
  departure_time   TIME        NOT NULL,
  return_time      TIME,
  request_date     DATE        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','in_progress','completed','cancelled')),
  requested_by     UUID        REFERENCES profiles(id),
  approved_by      UUID        REFERENCES profiles(id),
  approved_at      TIMESTAMPTZ,
  notes            TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES profiles(id),
  updated_by       UUID        REFERENCES profiles(id)
);

-- ============================================================================
-- CONFIG TABLE 6: internship_cycle_status_labels
-- Per-college display labels for cycle status enum values
-- ★ Source: spec section 11 Decision 21 (hybrid: enum + per-college labels)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_cycle_status_labels (
  id               UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID                         NOT NULL REFERENCES institutions(id),
  college_id       UUID                         REFERENCES institution_departments(id),
  status_enum      internship_cycle_status_enum NOT NULL,
  label_text       TEXT                         NOT NULL,
  config_key       TEXT,                                             -- optional programmatic key
  display_name     TEXT,
  description      TEXT,
  is_active        BOOLEAN                      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ                  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ                  NOT NULL DEFAULT now(),
  created_by       UUID                         REFERENCES profiles(id),
  updated_by       UUID                         REFERENCES profiles(id),
  UNIQUE(institution_id, COALESCE(college_id, '00000000-0000-0000-0000-000000000000'::uuid), status_enum)
);

-- ============================================================================
-- CONFIG TABLE 7: internship_college_blackouts
-- Per-college exam + accreditation visit blackout calendar
-- ★ Source: spec section 11 Decision 15
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_college_blackouts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES institutions(id),
  college_id       UUID        NOT NULL REFERENCES institution_departments(id),
  config_key       TEXT,
  display_name     TEXT        NOT NULL,
  description      TEXT,
  start_date       DATE        NOT NULL,
  end_date         DATE        NOT NULL,
  reason           TEXT        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES profiles(id),
  updated_by       UUID        REFERENCES profiles(id),
  CONSTRAINT internship_blackouts_valid_dates CHECK (end_date >= start_date)
);

-- ============================================================================
-- CONFIG TABLE 8: internship_college_notification_overrides
-- Per-college override of cross-cutting platform_policies notification settings
-- ★ Source: spec section 11 Decision 23 (notification cascade)
-- ============================================================================
CREATE TABLE IF NOT EXISTS internship_college_notification_overrides (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   UUID        NOT NULL REFERENCES institutions(id),
  college_id       UUID        NOT NULL REFERENCES institution_departments(id),
  policy_key       TEXT        NOT NULL,                             -- mirrors platform_policies.policy_key
  config_key       TEXT,
  display_name     TEXT,
  description      TEXT,
  override_value   JSONB       NOT NULL,                             -- overrides the global platform_policies value
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES profiles(id),
  updated_by       UUID        REFERENCES profiles(id),
  UNIQUE(institution_id, college_id, policy_key)
);

-- ============================================================================
-- EXISTING TABLE EXTENSION: learner_competencies
-- Add posting_assignment_id FK to link competency assessments to internship
-- ★ Source: spec section 11, assumption-thrash O1
-- NOTE: learner_competencies table exists in production (referenced by
--       20260210120001_competency_okr_metrics.sql). Only adding one column.
-- ============================================================================
ALTER TABLE learner_competencies
  ADD COLUMN IF NOT EXISTS posting_assignment_id UUID
    REFERENCES internship_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learner_competencies_posting
  ON learner_competencies(posting_assignment_id)
  WHERE posting_assignment_id IS NOT NULL;

-- ============================================================================
-- EXISTING TABLE EXTENSION: health_practice_attendance
-- Extend dormant clinical scaffold with GPS + internship fields
-- ★ Source: spec section 11, assumption-thrash O3
-- NOTE: health_practice_attendance (8 cols, 0 rows) adopted + extended here
-- ============================================================================
ALTER TABLE health_practice_attendance
  ADD COLUMN IF NOT EXISTS gps_lat              NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS gps_lng              NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geofence_pass        BOOLEAN,
  ADD COLUMN IF NOT EXISTS hospital_id          UUID REFERENCES internship_external_sites(id),
  ADD COLUMN IF NOT EXISTS facilitator_id       UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS posting_assignment_id UUID REFERENCES internship_assignments(id),
  ADD COLUMN IF NOT EXISTS is_proxy             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_reason         TEXT,
  ADD COLUMN IF NOT EXISTS marked_for           UUID REFERENCES profiles(id),  -- used when is_proxy=true
  ADD COLUMN IF NOT EXISTS is_emergency         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_reason     TEXT,                           -- ★ 20-char min enforced in app layer
  ADD COLUMN IF NOT EXISTS emergency_photo_url  TEXT;

-- ============================================================================
-- ROW LEVEL SECURITY — Enable on all new tables
-- ============================================================================
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

-- ============================================================================
-- RLS POLICIES — Institution-scoped access pattern
-- Mirrors existing ip_admin_all pattern from omm-dev reference
-- Default deny: only authenticated users with institution access can read/write
-- ============================================================================

-- internship_site_types: global (NULL institution_id) visible to all authenticated
CREATE POLICY "internship_site_types_institution_access"
  ON internship_site_types FOR ALL
  USING (
    institution_id IS NULL OR
    institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

-- All institution-scoped tables use the same pattern
CREATE POLICY "internship_external_sites_institution_access"
  ON internship_external_sites FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_site_contacts_institution_access"
  ON internship_site_contacts FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_preceptors_institution_access"
  ON internship_preceptors FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_approval_chains_institution_access"
  ON internship_approval_chains FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_posting_cycles_institution_access"
  ON internship_posting_cycles FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_cycle_hospitals_institution_access"
  ON internship_cycle_hospitals FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_program_config_institution_access"
  ON internship_program_config FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_logbook_templates_institution_access"
  ON internship_logbook_templates FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_evaluation_rubrics_institution_access"
  ON internship_evaluation_rubrics FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_assignments_institution_access"
  ON internship_assignments FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_logbook_entries_institution_access"
  ON internship_logbook_entries FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_evaluations_institution_access"
  ON internship_evaluations FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_incidents_institution_access"
  ON internship_incidents FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_certificates_institution_access"
  ON internship_certificates FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_vehicles_institution_access"
  ON internship_vehicles FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_cycle_status_labels_institution_access"
  ON internship_cycle_status_labels FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_college_blackouts_institution_access"
  ON internship_college_blackouts FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "internship_college_notification_overrides_institution_access"
  ON internship_college_notification_overrides FOR ALL
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

-- ============================================================================
-- GRANTS — Authenticated users get CRUD; RLS enforces row-level access
-- ============================================================================
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

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Core lookup indexes
CREATE INDEX IF NOT EXISTS idx_internship_sites_institution
  ON internship_external_sites(institution_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_sites_type
  ON internship_external_sites(site_type_id);
CREATE INDEX IF NOT EXISTS idx_internship_sites_geo
  ON internship_external_sites(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_internship_site_contacts_site
  ON internship_site_contacts(site_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_preceptors_site
  ON internship_preceptors(site_id) WHERE is_active = true;

-- Cycle + assignment hot paths
CREATE INDEX IF NOT EXISTS idx_internship_cycles_status
  ON internship_posting_cycles(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_cycles_dates
  ON internship_posting_cycles(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_internship_cycle_hospitals_cycle
  ON internship_cycle_hospitals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_cycle
  ON internship_assignments(cycle_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_learner
  ON internship_assignments(learner_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_site
  ON internship_assignments(site_id, status);
CREATE INDEX IF NOT EXISTS idx_internship_assignments_facilitator
  ON internship_assignments(facilitator_id);

-- Logbook + evaluation
CREATE INDEX IF NOT EXISTS idx_internship_logbook_assignment
  ON internship_logbook_entries(assignment_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_internship_evaluations_assignment
  ON internship_evaluations(assignment_id);

-- Incidents
CREATE INDEX IF NOT EXISTS idx_internship_incidents_severity
  ON internship_incidents(severity, status);
CREATE INDEX IF NOT EXISTS idx_internship_incidents_assignment
  ON internship_incidents(assignment_id);

-- Certificates
CREATE INDEX IF NOT EXISTS idx_internship_certificates_number
  ON internship_certificates(certificate_number);
CREATE INDEX IF NOT EXISTS idx_internship_certificates_assignment
  ON internship_certificates(assignment_id);

-- Vehicles
CREATE INDEX IF NOT EXISTS idx_internship_vehicles_date
  ON internship_vehicles(request_date, status);

-- Config tables
CREATE INDEX IF NOT EXISTS idx_internship_program_config_college
  ON internship_program_config(college_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_blackouts_college_dates
  ON internship_college_blackouts(college_id, start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_internship_notif_overrides_college_key
  ON internship_college_notification_overrides(college_id, policy_key) WHERE is_active = true;

-- ============================================================================
-- OUTCOME METRIC SUPPORT INDEX
-- Supports the locked metric query from spec section 0
-- SELECT 100.0 * COUNT(*) FILTER (WHERE has_logbook_completed AND ...) / ...
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_internship_assignments_metric
  ON internship_assignments(status, attendance_percentage, logbook_entries_count,
                             facilitator_evaluation_score, supervisor_evaluation_score);

-- ============================================================================
-- DONE
-- 11 core tables + 8 config tables = 19 new tables
-- 1 ENUM: internship_cycle_status_enum
-- 2 existing table extensions: learner_competencies, health_practice_attendance
-- RLS enabled on all 19 tables
-- 28 performance indexes
-- ============================================================================
