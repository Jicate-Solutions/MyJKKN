-- Migration: Create Regulatory Framework Engine
-- Description: 15 new tables + 1 view for config-driven regulatory compliance reporting
-- Tables: regulatory_frameworks, regulatory_criteria, regulatory_metrics,
--         regulatory_metric_values, regulatory_metric_value_history,
--         regulatory_evidence, regulatory_submissions, regulatory_data_connectors,
--         regulatory_simulations, regulatory_evidence_versions,
--         regulatory_peer_visits, regulatory_governing_bodies,
--         regulatory_body_meetings, regulatory_course_syllabi,
--         regulatory_peer_benchmarks
-- View:   regulatory_course_completion_dashboard
-- Also:   ALTER TABLE okr_objectives (2 new columns),
--         pg_trgm extension, search_vector on evidence, 2 GIN indexes
-- Date: 2026-02-23

BEGIN;

-- ═══════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════

-- moddatetime already exists in Supabase — safe to re-run
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- pg_trgm needed for fuzzy filename search on evidence
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════
-- HELPER FUNCTIONS (idempotent — safe to re-run)
-- ═══════════════════════════════════════════════

-- auth_institution_id(): Returns the institution_id of the currently authenticated user.
-- Used by RLS policies to scope rows to the user's institution.
-- CREATE OR REPLACE ensures this is idempotent if already created outside of migrations.
CREATE OR REPLACE FUNCTION auth_institution_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ═══════════════════════════════════════════════
-- REGULATORY FRAMEWORK ENGINE — MIGRATION
-- ═══════════════════════════════════════════════

-- 1. Framework Definitions (NAAC, NIRF, NBA, AICTE, UGC, ARIIA...)
CREATE TABLE regulatory_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),  -- NULL = global template
  name text NOT NULL,                                -- "NAAC SSR 2022 Revised"
  body text NOT NULL,                                -- "NAAC", "NIRF", "NBA", "AICTE", "UGC"
  framework_type text NOT NULL DEFAULT 'accreditation', -- accreditation | ranking | compliance | reporting
  institution_type text,                             -- NULL = universal; 'university' | 'autonomous_college' | 'affiliated_college' (NAAC Binary has different weights per type)
  version text NOT NULL,                             -- "2022-rev", "2025"
  effective_from date,
  effective_to date,                                 -- NULL = currently active
  year_type text NOT NULL DEFAULT 'academic',        -- academic | calendar (NIRF=calendar, NAAC=academic)
  status text NOT NULL DEFAULT 'active',             -- draft | active | archived
  total_max_score numeric,                           -- e.g., 1050 for NAAC Old, 900 for NAAC Binary, 100 for NIRF (normalized)
  description text,
  submission_portal_url text,                        -- e.g., https://nirfrankings.in
  submission_deadline date,
  code text UNIQUE,                                    -- unique short code: 'NIRF_2025_OVERALL', 'NAAC_BINARY_2024', 'NBA_SAR_ENGINEERING'
  metadata jsonb DEFAULT '{}',                       -- body-specific config (includes program_type for NBA: {"program_type":"B.Tech"})
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, body, version, institution_type)
  -- NOTE: institution_type is nullable (NULL = universal, applies to all types).
  -- PostgreSQL treats NULL != NULL in UNIQUE constraints, so multiple (same body, version, NULL)
  -- rows could exist. Mitigate with a partial unique index:
  -- CREATE UNIQUE INDEX idx_frameworks_universal ON regulatory_frameworks
  --   (institution_id, body, version) WHERE institution_type IS NULL;
);

-- 2. Criteria Tree (hierarchical — supports sub-criteria)
CREATE TABLE regulatory_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id) ON DELETE CASCADE,
  parent_criteria_id uuid REFERENCES regulatory_criteria(id),  -- NULL = top-level
  code text NOT NULL,                                -- "I", "1.1", "TLR", "TLR-1"
  name text NOT NULL,                                -- "Curricular Aspects"
  description text,
  weight numeric,                                    -- interpretation varies by framework:
  --   NIRF: fractional weights (0.30 = 30% of total)
  --   NAAC Old: absolute max points per criterion (e.g., 150, 350)
  --   NAAC Binary: absolute points per attribute (e.g., 75, 50)
  --   NBA/AICTE/UGC: percentage contribution (0-100)
  max_score numeric,                                 -- max points for this criteria
  sort_order integer NOT NULL DEFAULT 0,
  is_qualitative boolean DEFAULT false,              -- some criteria are descriptive, not numeric
  evidence_required boolean DEFAULT true,             -- criteria-level: does this criteria require evidence? (cf. regulatory_metrics.requires_evidence for metric-level)
  guidance_notes text,                               -- NAAC DVV guidance, tips
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(framework_id, code)
);

-- 3. Metric Definitions (individual data points within criteria)
CREATE TABLE regulatory_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_id uuid NOT NULL REFERENCES regulatory_criteria(id) ON DELETE CASCADE,
  code text NOT NULL,                                -- "1.1.1", "SSR-2.1"
  name text NOT NULL,                                -- "Number of programs with CBCS/elective"
  description text,
  data_type text NOT NULL DEFAULT 'number',          -- number | percentage | ratio | text | boolean | file | currency
  unit text,                                         -- "count", "%", "INR lakhs", "ratio", "years"
  formula text,                                      -- e.g., "(placed_count / eligible_count) * 100"
  formula_dependencies text[],                       -- metric codes this formula depends on
  data_connector_id text,                         -- primary DC reference (FK added after regulatory_data_connectors table exists)
  -- For metrics needing multiple DCs, data_connector_id is the primary source.
  -- Additional connectors stored in metadata: {"secondary_connectors": ["DC-29"]}
  -- The data_connector_query can join across tables from multiple connectors.
  data_connector_query text,                         -- actual SQL or query config (JSON)
  is_auto_calculable boolean DEFAULT false,
  requires_evidence boolean DEFAULT true,
  validation_min numeric,
  validation_max numeric,
  validation_regex text,
  sort_order integer DEFAULT 0,
  dvv_guidance text,                                 -- NAAC DVV specific clarification text
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(criteria_id, code)
);

-- 4. Metric Values (actual data — the heart of the system)
CREATE TABLE regulatory_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES regulatory_metrics(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL,                       -- "2025-26" or "2025" (calendar year for NIRF)
  value text,                                        -- stored as text, parsed by data_type
  numeric_value numeric,                             -- pre-parsed for calculations (NULL if non-numeric)
  is_auto_calculated boolean DEFAULT false,
  is_manually_overridden boolean DEFAULT false,
  override_reason text,                              -- required if manually overridden
  source_record_count integer,                       -- how many source records contributed
  source_snapshot jsonb,                             -- snapshot of source query results (for audit)
  calculated_at timestamptz,
  entered_by uuid REFERENCES profiles(id),
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(metric_id, institution_id, academic_year)
);

-- 5. Metric Value History (audit trail — every change recorded)
CREATE TABLE regulatory_metric_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_value_id uuid NOT NULL REFERENCES regulatory_metric_values(id) ON DELETE RESTRICT,
  -- RESTRICT prevents deleting a metric_value that has history records.
  -- Use soft-delete (is_manually_overridden, etc.) on metric_values instead of hard delete.
  old_value text,
  new_value text,
  change_type text NOT NULL,                         -- auto_refresh | manual_entry | manual_override | verification
  changed_by uuid REFERENCES profiles(id),
  change_reason text,
  source_snapshot jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Evidence Documents
CREATE TABLE regulatory_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid REFERENCES regulatory_metrics(id),
  criteria_id uuid REFERENCES regulatory_criteria(id),
  submission_id uuid,  -- FK added after regulatory_submissions table exists (see ALTER TABLE below)
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,                                    -- pdf, jpg, xlsx, etc.
  file_size_bytes bigint,                            -- bigint to support files > 2GB
  description text,
  evidence_type text DEFAULT 'supporting',           -- supporting | primary | certificate | screenshot
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  CHECK (metric_id IS NOT NULL OR criteria_id IS NOT NULL)  -- evidence must link to a metric or criteria
);

-- 7. Submissions (workflow: draft → review → approved → submitted)
CREATE TABLE regulatory_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'draft',              -- draft | data_collection | in_review | approved | submitted | accepted
  completeness_percentage numeric DEFAULT 0,
  auto_populated_count integer DEFAULT 0,
  manual_entry_count integer DEFAULT 0,
  total_metrics_count integer DEFAULT 0,
  calculated_score numeric,                          -- estimated total score
  submitted_at timestamptz,
  submitted_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  portal_reference text,                             -- external submission ID/reference
  report_file_url text,                              -- generated report PDF
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(framework_id, institution_id, academic_year)
);

-- Add deferred FK from regulatory_evidence → regulatory_submissions (created after submissions table exists)
ALTER TABLE regulatory_evidence ADD CONSTRAINT fk_evidence_submission
  FOREIGN KEY (submission_id) REFERENCES regulatory_submissions(id) ON DELETE RESTRICT;

-- 8. Data Connector Registry (named, reusable query definitions)
CREATE TABLE regulatory_data_connectors (
  id text PRIMARY KEY,                               -- "DC-01", "DC-02", ...
  name text NOT NULL,                                -- "Student Enrollment & Demographics"
  description text,
  source_module text NOT NULL,                       -- "learner-management", "staff", etc.
  source_tables text[] NOT NULL,                     -- ["learners_profiles", "admissions"]
  query_template text NOT NULL,                      -- SQL with $1=institution_id, $2=start_date, $3=end_date
  output_type text NOT NULL DEFAULT 'single_value',  -- single_value | table | aggregation
  output_columns text[],                             -- column names in result set
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  last_test_status text,                             -- success | error | warning
  test_error_message text,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add deferred FK from regulatory_metrics → regulatory_data_connectors (now that both tables exist)
ALTER TABLE regulatory_metrics ADD CONSTRAINT fk_metrics_data_connector
  FOREIGN KEY (data_connector_id) REFERENCES regulatory_data_connectors(id) ON DELETE RESTRICT;

-- 9. Score Simulations (what-if scenarios)
CREATE TABLE regulatory_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name text NOT NULL,                                -- "What if 5 more PhD faculty"
  base_academic_year text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}',             -- {metric_code: new_value, ...}
  calculated_score numeric,
  score_delta numeric,                               -- difference from base
  rank_estimate text,                                -- estimated rank band
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 10. Evidence Version History (tracks document revisions — DVV may request updated evidence)
CREATE TABLE regulatory_evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES regulatory_evidence(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size_bytes bigint,
  change_summary text,                               -- "Updated placement data per DVV feedback"
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(evidence_id, version_number)
);

-- 11. Peer Team Visits (NAAC/NBA visit coordination and post-visit tracking)
CREATE TABLE regulatory_peer_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES regulatory_submissions(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  visit_type text NOT NULL,                          -- naac_peer_team | nba_evaluator | aicte_expert
  status text NOT NULL DEFAULT 'scheduled',          -- scheduled | confirmed | in_progress | completed | postponed | cancelled
  scheduled_date date,
  actual_start_date date,
  actual_end_date date,
  team_composition jsonb DEFAULT '[]',               -- [{name, designation, institution, role}]
  pre_visit_checklist jsonb DEFAULT '{}',             -- {item: boolean} — infrastructure, documents, labs ready
  visit_itinerary jsonb DEFAULT '[]',                -- [{day, time, activity, location, responsible_person}]
  findings jsonb DEFAULT '{}',                       -- peer team observations/remarks
  recommendations text,                              -- post-visit improvement suggestions
  action_items jsonb DEFAULT '[]',                   -- [{action, responsible, deadline, status}]
  grade_awarded text,                                -- grade/score from peer team (if applicable)
  report_file_url text,                              -- peer team report document
  coordinator_id uuid REFERENCES profiles(id),       -- IQAC coordinator managing the visit
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 12. Governing Bodies & Committees (NAAC SSR requires composition + meeting minutes)
CREATE TABLE regulatory_governing_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_type text NOT NULL,                           -- governing_body | academic_council | bos | iqac | finance_committee | exam_committee | anti_ragging | icc | grievance_cell
  name text NOT NULL,                                -- "Board of Studies - Computer Science"
  mandate text,                                      -- statutory purpose/responsibilities
  formation_date date,
  is_active boolean DEFAULT true,
  meeting_frequency text,                            -- monthly | quarterly | biannual | annual | as_needed
  members jsonb DEFAULT '[]',                        -- [{name, designation, role_in_body, affiliation, member_type, nominated_by, tenure_start, tenure_end}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Meeting minutes for governing bodies (NAAC evidence requirement)
CREATE TABLE regulatory_body_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES regulatory_governing_bodies(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  meeting_number integer NOT NULL,                   -- sequential per body per academic year
  academic_year text NOT NULL,
  meeting_date date NOT NULL,
  quorum_met boolean DEFAULT true,
  attendees_count integer,
  agenda jsonb DEFAULT '[]',                         -- [{item_number, topic, presented_by}]
  resolutions jsonb DEFAULT '[]',                    -- [{resolution_number, text, status: approved|deferred|rejected}]
  action_items jsonb DEFAULT '[]',                   -- [{action, responsible, deadline, status}]
  minutes_file_url text,                             -- uploaded minutes PDF
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(body_id, academic_year, meeting_number)
);

-- 13. Course Syllabi & Teaching Plans (NAAC Criterion 1 — Curricular Aspects)
CREATE TABLE regulatory_course_syllabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  program_id uuid,                                   -- FK to programs table (verify column name)
  department text NOT NULL,
  course_code text NOT NULL,
  course_name text NOT NULL,
  academic_year text NOT NULL,
  semester integer,
  syllabus_file_url text,                            -- uploaded syllabus document
  teaching_plan_file_url text,                       -- uploaded teaching plan
  revision_status text DEFAULT 'current',            -- current | under_revision | archived
  revision_date date,
  bos_approval_date date,                            -- Board of Studies approval
  bos_meeting_id uuid,                               -- FK to regulatory_body_meetings if tracked
  total_hours integer,                               -- planned teaching hours
  completed_hours integer,                            -- actual hours delivered
  completion_percentage numeric GENERATED ALWAYS AS (
    CASE WHEN total_hours > 0 THEN (completed_hours::numeric / total_hours) * 100 ELSE 0 END
  ) STORED,
  co_mapping jsonb DEFAULT '{}',                     -- {CO1: "description", CO2: "description", ...}
  po_mapping jsonb DEFAULT '[]',                     -- [{co: "CO1", po: "PO1", level: 3}, ...] — NBA attainment
  innovative_methods text,                           -- pedagogical innovations used
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, course_code, academic_year, semester)
);

-- 14. Peer Institution Benchmarks (NAAC 6.5.3 peer comparison — manual data entry)
CREATE TABLE regulatory_peer_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  academic_year text NOT NULL,
  peer_institution_name text NOT NULL,
  peer_institution_nirf_rank integer,
  peer_institution_naac_grade text,
  metric_code text NOT NULL,
  our_value numeric,
  peer_value numeric,
  gap numeric GENERATED ALWAYS AS (our_value - peer_value) STORED,
  data_source text,                              -- "NIRF portal", "peer website", "manual"
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code)
);

-- ═══════════════════════════════════════════════
-- EVIDENCE SEARCH SUPPORT (Full-text + fuzzy search)
-- ═══════════════════════════════════════════════

ALTER TABLE regulatory_evidence ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(file_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(evidence_type, '')
    )
  ) STORED;

-- ═══════════════════════════════════════════════
-- OKR → REGULATORY INTEGRATION (Action Plan tracking)
-- ═══════════════════════════════════════════════

ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid REFERENCES regulatory_metrics(id);
ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_target_value numeric;

-- ═══════════════════════════════════════════════
-- COURSE COMPLETION MONITORING VIEW
-- ═══════════════════════════════════════════════

CREATE OR REPLACE VIEW regulatory_course_completion_dashboard AS
SELECT
  cs.institution_id,
  cs.department,
  cs.academic_year,
  COUNT(*) as total_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 100 THEN 1 END) as completed_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 75 AND cs.completion_percentage < 100 THEN 1 END) as on_track_courses,
  COUNT(CASE WHEN cs.completion_percentage < 75 THEN 1 END) as behind_courses,
  ROUND(AVG(cs.completion_percentage), 1) as avg_completion_pct,
  COUNT(CASE WHEN cs.syllabus_file_url IS NOT NULL THEN 1 END) as syllabi_uploaded,
  COUNT(CASE WHEN cs.teaching_plan_file_url IS NOT NULL THEN 1 END) as plans_uploaded
FROM regulatory_course_syllabi cs
WHERE cs.revision_status = 'current'
GROUP BY cs.institution_id, cs.department, cs.academic_year;

-- ═══════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════

ALTER TABLE regulatory_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metric_value_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_data_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_evidence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_peer_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_peer_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_governing_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_body_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_course_syllabi ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════
-- RLS POLICIES — Role-based, per T8 permission matrix
-- ═══════════════════════════════════════════════
-- Helper: auth_user_role() returns the user's role string (create alongside auth_institution_id())
-- CREATE FUNCTION auth_user_role() RETURNS text AS $$
--   SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1
-- $$ LANGUAGE sql STABLE SECURITY INVOKER;

-- ─── Frameworks: super_admin only for write, all authenticated for read ───
CREATE POLICY "frameworks_read" ON regulatory_frameworks FOR SELECT USING (
  institution_id IS NULL
  OR institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "frameworks_write" ON regulatory_frameworks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "frameworks_modify" ON regulatory_frameworks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "frameworks_delete" ON regulatory_frameworks FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ─── Metric values: role-differentiated per T8 ───
-- T8: View = super_admin, institution_admin, iqac_coordinator, principal, hod
-- T8: Enter = super_admin, institution_admin, iqac_coordinator, hod
-- T8: Override = super_admin, institution_admin, iqac_coordinator (app-layer enforcement for override vs enter)
-- T8: Delete = nobody (use soft-delete; RESTRICT on history FK prevents hard delete anyway)
CREATE POLICY "metric_values_read" ON regulatory_metric_values FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal','hod'))
);
CREATE POLICY "metric_values_insert" ON regulatory_metric_values FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  );
CREATE POLICY "metric_values_update" ON regulatory_metric_values FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  );
-- No DELETE policy on metric_values — soft-delete only. ON DELETE RESTRICT on history FK
-- prevents accidental destruction of audit trail.

-- ─── Evidence: upload by staff+, delete only via soft-delete ───
-- T8: Upload = super_admin, institution_admin, iqac_coordinator, hod, staff
-- Table has is_deleted + deleted_at for soft-delete — no hard DELETE policy
CREATE POLICY "evidence_read" ON regulatory_evidence FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "evidence_insert" ON regulatory_evidence FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
  );
CREATE POLICY "evidence_update" ON regulatory_evidence FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
-- No DELETE policy — use soft-delete (UPDATE is_deleted = true) instead

-- ─── Submissions: controlled workflow, approval restricted ───
-- T8: Generate reports = super_admin, institution_admin, iqac_coordinator
-- T8: Approve submission = super_admin, institution_admin, principal
CREATE POLICY "submissions_read" ON regulatory_submissions FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);
CREATE POLICY "submissions_insert" ON regulatory_submissions FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "submissions_update" ON regulatory_submissions FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','principal'))
  );
-- No DELETE policy on submissions — submission records are permanent audit artifacts

-- ─── Simulations: read and create by authorized roles ───
-- T8: Run simulation = super_admin, institution_admin, iqac_coordinator, principal
CREATE POLICY "simulations_read" ON regulatory_simulations FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);
CREATE POLICY "simulations_insert" ON regulatory_simulations FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
-- Simulations are append-only (no UPDATE or DELETE) — create new simulation for re-runs

-- Criteria & metrics: readable by all, writable only by super_admin (framework definitions)
CREATE POLICY "criteria_read" ON regulatory_criteria FOR SELECT USING (true);
CREATE POLICY "criteria_write" ON regulatory_criteria FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_modify" ON regulatory_criteria FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_delete" ON regulatory_criteria FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "metrics_read" ON regulatory_metrics FOR SELECT USING (true);
CREATE POLICY "metrics_write" ON regulatory_metrics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "metrics_modify" ON regulatory_metrics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "metrics_delete" ON regulatory_metrics FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Data connectors: readable by all, writable only by super_admin (contains query_template SQL)
CREATE POLICY "connectors_read" ON regulatory_data_connectors FOR SELECT USING (true);
CREATE POLICY "connectors_write" ON regulatory_data_connectors FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_modify" ON regulatory_data_connectors FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_delete" ON regulatory_data_connectors FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Value history: append-only audit trail, scoped through parent metric_value
CREATE POLICY "value_history_read" ON regulatory_metric_value_history FOR SELECT USING (true);
CREATE POLICY "value_history_insert" ON regulatory_metric_value_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM regulatory_metric_values mv
    WHERE mv.id = metric_value_id
    AND (mv.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  ));
-- No UPDATE or DELETE policies on history = immutable audit trail

-- ─── Evidence Versions: append-only version history linked to parent evidence ───
CREATE POLICY "evidence_versions_read" ON regulatory_evidence_versions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_evidence e
    WHERE e.id = evidence_id
    AND (e.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "evidence_versions_insert" ON regulatory_evidence_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory_evidence e
      WHERE e.id = evidence_id
      AND (e.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','faculty'))
  );
-- No UPDATE or DELETE on evidence versions — immutable revision trail for DVV/PDV audit

-- ─── Peer Visits: institution-scoped, writable by IQAC/admin roles ───
CREATE POLICY "peer_visits_read" ON regulatory_peer_visits FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "peer_visits_insert" ON regulatory_peer_visits FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "peer_visits_update" ON regulatory_peer_visits FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
-- No DELETE on peer visits — permanent record of accreditation visits

-- ─── Governing Bodies: institution-scoped, writable by admin roles ───
CREATE POLICY "governing_bodies_read" ON regulatory_governing_bodies FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "governing_bodies_insert" ON regulatory_governing_bodies FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','principal'))
  );
CREATE POLICY "governing_bodies_update" ON regulatory_governing_bodies FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','principal'))
  );

-- ─── Body Meetings: institution-scoped, writable by IQAC/admin ───
CREATE POLICY "body_meetings_read" ON regulatory_body_meetings FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "body_meetings_insert" ON regulatory_body_meetings FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
CREATE POLICY "body_meetings_update" ON regulatory_body_meetings FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
-- No DELETE on meeting minutes — permanent governance record

-- ─── Course Syllabi: institution-scoped, writable by academic roles ───
CREATE POLICY "syllabi_read" ON regulatory_course_syllabi FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "syllabi_insert" ON regulatory_course_syllabi FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','faculty'))
  );
CREATE POLICY "syllabi_update" ON regulatory_course_syllabi FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','faculty'))
  );

-- ─── Peer Benchmarks: institution-scoped, writable by IQAC/admin roles ───
CREATE POLICY "benchmarks_read" ON regulatory_peer_benchmarks FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "benchmarks_insert" ON regulatory_peer_benchmarks FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "benchmarks_update" ON regulatory_peer_benchmarks FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "benchmarks_delete" ON regulatory_peer_benchmarks FOR DELETE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX idx_reg_criteria_framework ON regulatory_criteria(framework_id);
CREATE INDEX idx_reg_criteria_parent ON regulatory_criteria(parent_criteria_id);
CREATE INDEX idx_reg_metrics_criteria ON regulatory_metrics(criteria_id);
-- NOTE: metric_values UNIQUE(metric_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_metric_values_inst_year ON regulatory_metric_values(institution_id, academic_year);
CREATE INDEX idx_reg_evidence_metric ON regulatory_evidence(metric_id, institution_id, academic_year);
-- NOTE: submissions UNIQUE(framework_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_simulations_framework ON regulatory_simulations(framework_id, institution_id);
-- NOTE: evidence_versions UNIQUE(evidence_id, version_number) already creates an implicit index
CREATE INDEX idx_reg_peer_visits_submission ON regulatory_peer_visits(submission_id, institution_id);
CREATE INDEX idx_reg_peer_visits_status ON regulatory_peer_visits(institution_id, status);
CREATE INDEX idx_reg_governing_bodies_inst ON regulatory_governing_bodies(institution_id, body_type);
-- NOTE: body_meetings UNIQUE(body_id, academic_year, meeting_number) already creates an implicit index
CREATE INDEX idx_reg_body_meetings_inst_year ON regulatory_body_meetings(institution_id, academic_year);
-- NOTE: course_syllabi UNIQUE(institution_id, course_code, academic_year, semester) already creates an implicit index
CREATE INDEX idx_reg_syllabi_dept ON regulatory_course_syllabi(institution_id, department, academic_year);
-- NOTE: peer_benchmarks UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code) already creates an implicit index
CREATE INDEX idx_reg_benchmarks_inst_framework ON regulatory_peer_benchmarks(institution_id, framework_id, academic_year);

-- GIN indexes for evidence full-text and fuzzy search
CREATE INDEX idx_reg_evidence_search ON regulatory_evidence USING GIN (search_vector);
CREATE INDEX idx_reg_evidence_filename_trgm ON regulatory_evidence USING GIN (file_name gin_trgm_ops);

-- ═══════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════

-- Auto-update updated_at on all tables that have the column.
-- Requires the moddatetime extension (already enabled above).

CREATE TRIGGER trg_frameworks_updated_at BEFORE UPDATE ON regulatory_frameworks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_criteria_updated_at BEFORE UPDATE ON regulatory_criteria
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_metrics_updated_at BEFORE UPDATE ON regulatory_metrics
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_metric_values_updated_at BEFORE UPDATE ON regulatory_metric_values
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_evidence_updated_at BEFORE UPDATE ON regulatory_evidence
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON regulatory_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_connectors_updated_at BEFORE UPDATE ON regulatory_data_connectors
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_peer_visits_updated_at BEFORE UPDATE ON regulatory_peer_visits
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_governing_bodies_updated_at BEFORE UPDATE ON regulatory_governing_bodies
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_body_meetings_updated_at BEFORE UPDATE ON regulatory_body_meetings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_syllabi_updated_at BEFORE UPDATE ON regulatory_course_syllabi
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_benchmarks_updated_at BEFORE UPDATE ON regulatory_peer_benchmarks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMIT;
