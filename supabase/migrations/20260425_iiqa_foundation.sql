-- PR-IIQA-1: Foundation for IIQA submission workflow
-- ============================================================================
-- Closes the 15th piece of Compliance Unification by laying schema for the
-- NAAC IIQA (Institutional Information for Quality Assessment) submission
-- workflow. Idempotent: every CREATE/ALTER/INSERT is guarded.
--
-- Scope decisions (documented for reversibility):
--   • is_system flag on master tables — protects seeded defaults, follows
--     the quality_evidence_source_registry pattern from PR-A6b retrofit.
--   • Two-step sign-off on accreditation_submissions — Principal approves
--     the pack; Director (super_admin) submits to NAAC. Mirrors
--     publication-approval flow already used in Solutions Hub.
--   • Unlock-on-revision-request — when status='revision_requested',
--     unlocked_at lets the snapshot lock be released so corrections can
--     land. Locked rows stay locked otherwise.
--   • IIQA eligibility = iqac_code IS NOT NULL filter (already canonical
--     across the 8 JKKN colleges, used by PR #413's super-admin picker).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1: Static facts on institutions (one-time-then-annual fields)
-- ----------------------------------------------------------------------------

ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS year_established int,
  ADD COLUMN IF NOT EXISTS ugc_2f_status text,
  ADD COLUMN IF NOT EXISTS ugc_2f_granted_date date,
  ADD COLUMN IF NOT EXISTS ugc_12b_status text,
  ADD COLUMN IF NOT EXISTS ugc_12b_granted_date date,
  ADD COLUMN IF NOT EXISTS university_affiliation_name text,
  ADD COLUMN IF NOT EXISTS naac_cycle_number int,
  ADD COLUMN IF NOT EXISTS naac_last_grade text;

-- UGC status CHECK constraints (state-machine, not master-table — Q1 verdict).
-- Drop-then-recreate so the migration is re-runnable.
ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_ugc_2f_status_check;
ALTER TABLE institutions
  ADD CONSTRAINT institutions_ugc_2f_status_check
  CHECK (ugc_2f_status IS NULL OR ugc_2f_status IN ('granted','pending','not_applicable','deemed','withdrawn'));

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_ugc_12b_status_check;
ALTER TABLE institutions
  ADD CONSTRAINT institutions_ugc_12b_status_check
  CHECK (ugc_12b_status IS NULL OR ugc_12b_status IN ('granted','pending','not_applicable','deemed','withdrawn'));

COMMENT ON COLUMN institutions.year_established IS
  'Year college was established. Required for NAAC IIQA Section 1.';
COMMENT ON COLUMN institutions.ugc_2f_status IS
  'UGC Act 2(f) recognition status. Values: granted/pending/not_applicable/deemed/withdrawn. Cert PDF in accreditation_certificates with kind=ugc_2f.';
COMMENT ON COLUMN institutions.ugc_12b_status IS
  'UGC Act 12(B) recognition status. Same value space as 2(f). Cert PDF in accreditation_certificates with kind=ugc_12b.';

-- ----------------------------------------------------------------------------
-- Part 2: accreditation_certificate_kinds master table (Q1 verdict)
--
-- Mirrors quality_evidence_source_registry pattern from PR-A6b retrofit.
-- Admin can extend (e.g. when state SQAA emerges) without DDL.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accreditation_certificate_kinds (
  kind_key text PRIMARY KEY,
  body_code text,                        -- 'NAAC' | 'NIRF' | 'NBA' | 'UGC' | 'AICTE' | etc. NULL = body-agnostic
  display_name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE accreditation_certificate_kinds IS
  'Registry of certificate types accepted by accreditation_certificates. is_system rows are seeded defaults protected from delete in UI.';

INSERT INTO accreditation_certificate_kinds (kind_key, body_code, display_name, description, is_system, sort_order) VALUES
  ('ugc_2f',            'UGC',  'UGC 2(f) Recognition',          'University Grants Commission Act §2(f) recognition certificate.', true, 10),
  ('ugc_12b',           'UGC',  'UGC 12(B) Recognition',         'UGC Act §12(B) entitlement to receive central government grants.', true, 11),
  ('naac_prior_grade',  'NAAC', 'Prior NAAC Grade Certificate',  'Most recent NAAC accreditation grade certificate (cycle 1, 2, etc.).', true, 20),
  ('nba',               'NBA',  'NBA Accreditation Certificate', 'National Board of Accreditation program-level certificate.', true, 30),
  ('nirf_rank',         'NIRF', 'NIRF Ranking Certificate',      'National Institutional Ranking Framework annual ranking.', true, 40),
  ('aicte_eoa',         'AICTE','AICTE EoA',                      'AICTE Extension of Approval letter for current AY.', true, 50),
  ('pci_approval',      'PCI',  'PCI Approval',                   'Pharmacy Council of India approval letter.', true, 60),
  ('inc_approval',      'INC',  'INC Approval',                   'Indian Nursing Council approval letter.', true, 70),
  ('dci_approval',      'DCI',  'DCI Recognition',                'Dental Council of India recognition letter.', true, 80),
  ('ncte_recognition',  'NCTE', 'NCTE Recognition',               'National Council for Teacher Education recognition.', true, 90),
  ('iso',               NULL,   'ISO Certification',              'ISO 9001/14001/etc. quality management certification (any body).', true, 100)
ON CONFLICT (kind_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Part 3: accreditation_snapshot_kinds master table (Q1 verdict)
--
-- IIQA's 5 core snapshot types. NIRF/NBA add their own kinds in future PRs.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accreditation_snapshot_kinds (
  kind_key text PRIMARY KEY,
  body_code text,
  display_name text NOT NULL,
  description text,
  schema_template jsonb,                 -- shape of the snapshot_data jsonb for this kind
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE accreditation_snapshot_kinds IS
  'Registry of snapshot types accepted by accreditation_iiqa_snapshots. schema_template is advisory — UI uses it to render the right form.';

INSERT INTO accreditation_snapshot_kinds (kind_key, body_code, display_name, description, schema_template, is_system, sort_order) VALUES
  ('enrollment',
   'NAAC', 'Student Enrollment',
   'Per-program × per-AY enrollment with gender + category + geographic breakdowns.',
   '{"by_program": [{"program_id":"uuid","sanctioned_intake":0,"actual_enrollment":0,"gender":{"male":0,"female":0,"other":0},"category":{"general":0,"obc":0,"sc":0,"st":0,"other":0},"geographic":{"state":0,"out_of_state":0,"foreign":0}}]}'::jsonb,
   true, 10),
  ('faculty_strength',
   'NAAC', 'Faculty Strength',
   'Sanctioned vs filled by designation, qualification %, gender, age groups.',
   '{"sanctioned":0,"filled":0,"by_qualification":{"phd":0,"mphil":0,"pg":0,"other":0},"by_designation":{"professor":0,"associate":0,"assistant":0,"other":0},"gender":{"male":0,"female":0,"other":0}}'::jsonb,
   true, 20),
  ('pass_percentage',
   'NAAC', 'Pass Percentage',
   'Pass% by program, by AY. Source: COE results stream.',
   '{"by_program":[{"program_id":"uuid","total_appeared":0,"total_passed":0,"pass_percentage":0}]}'::jsonb,
   true, 30),
  ('infrastructure',
   'NAAC', 'Physical Infrastructure',
   'Classrooms, labs, library volumes, built-up sqft, computer count, sports facilities, hostel capacity.',
   '{"classrooms":0,"labs":0,"library_volumes":0,"library_journals":0,"built_up_sqft":0,"computer_count":0,"hostel_capacity":0,"sports_facilities":[]}'::jsonb,
   true, 40),
  ('finance',
   'NAAC', 'Financial Snapshot',
   'Income / expenditure / capital outlay for the AY. Audited PDF stored as cert with kind=audited_finance (future).',
   '{"income_total":0,"expenditure_total":0,"capital_expenditure":0,"income_breakdown":{},"expenditure_breakdown":{}}'::jsonb,
   true, 50)
ON CONFLICT (kind_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Part 4: accreditation_certificates data table
--
-- Mirrors pde_certificates structure (registry + verification) but
-- body-agnostic via kind_key FK. is_system on rows allows seed/import
-- protection (rare for cert rows but kept for future bulk-import flows).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accreditation_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  kind_key text NOT NULL REFERENCES accreditation_certificate_kinds(kind_key),
  reference_number text,
  issued_date date,
  valid_from date,
  valid_until date,
  storage_url text NOT NULL,             -- Supabase storage URL
  storage_bucket text NOT NULL DEFAULT 'accreditation-certificates',
  storage_path text NOT NULL,            -- relative path inside the bucket
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid REFERENCES profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES accreditation_certificates(id),  -- new cert chain, like hr_public_holidays
  is_system boolean NOT NULL DEFAULT false,
  UNIQUE (institution_id, kind_key, reference_number)
);

CREATE INDEX IF NOT EXISTS idx_accred_certs_institution_kind
  ON accreditation_certificates(institution_id, kind_key)
  WHERE superseded_by IS NULL;

COMMENT ON TABLE accreditation_certificates IS
  'Body-agnostic certificate registry. UGC 2(f), 12(B), prior NAAC grades, NBA, NIRF rank, AICTE EoA, etc. superseded_by tracks renewals — current cert per kind = WHERE superseded_by IS NULL.';

-- ----------------------------------------------------------------------------
-- Part 5: accreditation_iiqa_snapshots data table
--
-- Mirrors sh_paradigm_shift_snapshots time-series freezing pattern.
-- One row per (institution_id, ay_label, kind_key). is_locked flips true on
-- IIQA submission and stays true unless NAAC rejects (status='revision_requested')
-- which sets unlocked_at + unlocked_by, allowing edits to land.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accreditation_iiqa_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  admission_year_id uuid REFERENCES admission_years(id),
  ay_label text NOT NULL,                -- canonical '2024-25' format
  kind_key text NOT NULL REFERENCES accreditation_snapshot_kinds(kind_key),
  snapshot_data jsonb NOT NULL,          -- shape per kind's schema_template
  source text NOT NULL CHECK (source IN ('manual','csv_import','live_query','audited_pdf','registrar_excel')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid REFERENCES profiles(id),
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by_submission_id uuid REFERENCES accreditation_submissions(id),
  unlocked_at timestamptz,               -- set when status='revision_requested' on parent submission
  unlocked_by uuid REFERENCES profiles(id),
  metadata jsonb DEFAULT '{}',
  UNIQUE (institution_id, ay_label, kind_key)
);

CREATE INDEX IF NOT EXISTS idx_iiqa_snapshots_institution_ay
  ON accreditation_iiqa_snapshots(institution_id, ay_label, kind_key);
CREATE INDEX IF NOT EXISTS idx_iiqa_snapshots_submission
  ON accreditation_iiqa_snapshots(locked_by_submission_id)
  WHERE locked_by_submission_id IS NOT NULL;

COMMENT ON TABLE accreditation_iiqa_snapshots IS
  'Time-series snapshots for IIQA + future NIRF/NBA submissions. UNIQUE on (inst, ay, kind) means re-uploads UPSERT same row. Locked when included in a submitted IIQA pack.';

-- ----------------------------------------------------------------------------
-- Part 6: accreditation_submissions sign-off chain (decisions 1+2)
--
-- Two-step sign-off (Decision 2): Principal approves → Director submits.
-- Unlock-on-revision (Decision 1): when status flips to revision_requested,
-- a trigger or service-layer step releases iiqa_snapshots locks.
-- ----------------------------------------------------------------------------

ALTER TABLE accreditation_submissions
  ADD COLUMN IF NOT EXISTS principal_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS principal_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS director_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS director_submitted_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_request_note text,
  ADD COLUMN IF NOT EXISTS naac_assessor_notes text;

COMMENT ON COLUMN accreditation_submissions.principal_approved_at IS
  'IIQA two-step sign-off: Principal reviews + signs the pack before Director submits.';
COMMENT ON COLUMN accreditation_submissions.director_submitted_at IS
  'IIQA two-step sign-off: Director (super_admin) clicks Submit-to-NAAC after Principal approves.';
COMMENT ON COLUMN accreditation_submissions.revision_requested_at IS
  'When NAAC marks revision_requested, this records the timestamp. Triggers unlock of related iiqa_snapshots so corrections can land.';

-- ----------------------------------------------------------------------------
-- Part 7: RLS — modern dynamic-permission pattern (no hardcoded roles)
-- ----------------------------------------------------------------------------

ALTER TABLE accreditation_certificate_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE accreditation_snapshot_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE accreditation_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE accreditation_iiqa_snapshots ENABLE ROW LEVEL SECURITY;

-- Master tables: read open to authenticated; write super-admin only
DROP POLICY IF EXISTS "accred_cert_kinds_select" ON accreditation_certificate_kinds;
CREATE POLICY "accred_cert_kinds_select" ON accreditation_certificate_kinds FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "accred_cert_kinds_manage" ON accreditation_certificate_kinds;
CREATE POLICY "accred_cert_kinds_manage" ON accreditation_certificate_kinds FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "accred_snapshot_kinds_select" ON accreditation_snapshot_kinds;
CREATE POLICY "accred_snapshot_kinds_select" ON accreditation_snapshot_kinds FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "accred_snapshot_kinds_manage" ON accreditation_snapshot_kinds;
CREATE POLICY "accred_snapshot_kinds_manage" ON accreditation_snapshot_kinds FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- Certificates: institution-scoped read; manage gated on accreditation.certificates.manage
DROP POLICY IF EXISTS "accred_certs_select" ON accreditation_certificates;
CREATE POLICY "accred_certs_select" ON accreditation_certificates FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (
    role_has_institution_access(institution_id)
    AND (
      user_has_permission('accreditation.certificates.view')
      OR user_has_permission('accreditation.iiqa.view')
      OR user_has_permission('accreditation.iiqa.read_only_external')
    )
  )
);

DROP POLICY IF EXISTS "accred_certs_manage" ON accreditation_certificates;
CREATE POLICY "accred_certs_manage" ON accreditation_certificates FOR ALL
USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.certificates.manage')
    AND role_has_institution_access(institution_id)
  )
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.certificates.manage')
    AND role_has_institution_access(institution_id)
  )
);

-- IIQA snapshots: institution-scoped read; manage requires accreditation.iiqa.manage
-- + locked rows refuse UPDATE/DELETE in WITH CHECK
DROP POLICY IF EXISTS "iiqa_snapshots_select" ON accreditation_iiqa_snapshots;
CREATE POLICY "iiqa_snapshots_select" ON accreditation_iiqa_snapshots FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR (
    role_has_institution_access(institution_id)
    AND (
      user_has_permission('accreditation.iiqa.view')
      OR user_has_permission('accreditation.iiqa.read_only_external')
    )
  )
);

DROP POLICY IF EXISTS "iiqa_snapshots_insert" ON accreditation_iiqa_snapshots;
CREATE POLICY "iiqa_snapshots_insert" ON accreditation_iiqa_snapshots FOR INSERT
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.iiqa.manage')
    AND role_has_institution_access(institution_id)
  )
);

DROP POLICY IF EXISTS "iiqa_snapshots_update" ON accreditation_iiqa_snapshots;
CREATE POLICY "iiqa_snapshots_update" ON accreditation_iiqa_snapshots FOR UPDATE
USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.iiqa.manage')
    AND role_has_institution_access(institution_id)
    AND (NOT is_locked OR unlocked_at IS NOT NULL)  -- locked rows refuse writes unless explicitly unlocked
  )
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.iiqa.manage')
    AND role_has_institution_access(institution_id)
  )
);

DROP POLICY IF EXISTS "iiqa_snapshots_delete" ON accreditation_iiqa_snapshots;
CREATE POLICY "iiqa_snapshots_delete" ON accreditation_iiqa_snapshots FOR DELETE
USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('accreditation.iiqa.manage')
    AND role_has_institution_access(institution_id)
    AND NOT is_locked
  )
);

-- ----------------------------------------------------------------------------
-- Part 8: verification block (best-effort RAISE NOTICE)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cert_kinds INT;
  v_snapshot_kinds INT;
  v_certs INT;
  v_snapshots INT;
  v_inst_cols INT;
BEGIN
  SELECT COUNT(*) INTO v_cert_kinds FROM accreditation_certificate_kinds;
  SELECT COUNT(*) INTO v_snapshot_kinds FROM accreditation_snapshot_kinds;
  SELECT COUNT(*) INTO v_certs FROM accreditation_certificates;
  SELECT COUNT(*) INTO v_snapshots FROM accreditation_iiqa_snapshots;
  SELECT COUNT(*) INTO v_inst_cols FROM information_schema.columns
    WHERE table_name='institutions'
    AND column_name IN ('year_established','ugc_2f_status','ugc_12b_status','university_affiliation_name','naac_cycle_number','naac_last_grade');

  RAISE NOTICE 'IIQA-1 Foundation: cert_kinds=% snapshot_kinds=% certs=% snapshots=% iiqa_inst_cols=%/8',
    v_cert_kinds, v_snapshot_kinds, v_certs, v_snapshots, v_inst_cols;
END $$;
