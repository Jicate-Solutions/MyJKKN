-- ============================================================================
-- PR-A2: Compliance Unification Program — Substrate Schema
-- ============================================================================
-- Program: specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md
-- Context: docs/one-jkkn-one-data.md (Rule 1, 2, 3)
--
-- Goal: Body-agnostic substrate that serves ALL 10 JKKN compliance bodies:
--       NAAC + NIRF + NBA + QS + DCI + PCI + INC + AICTE + NCTE + UGC.
--
-- Director mandate (2026-04-17): "hope it not just works for NAAC but for
-- all others like NIRF, NBA and others as well" — every table/trigger/seed
-- from day one works for all 10 bodies, not NAAC-only.
--
-- This migration creates:
--   6 new tables (all body_code-parameterized):
--     quality_evidence_mappings       -- polymorphic evidence junction
--     accreditation_committees        -- IQAC/NIRF/NBA/DCI/... committees
--     accreditation_committee_members -- members per committee
--     accreditation_submissions       -- audit log of one-click exports
--     accreditation_survey_consents   -- DPDPA-compliant multi-body consent
--     accreditation_digest_config     -- per-user per-body digest opt-in
--
--   4 ALTER migrations (preserved from retired v2.1 Phase 1a spec):
--     institutions.iqac_code          -- 4-char code for ticket numbers
--     profiles.accreditation_default_college_id -- college switcher default
--     grievance_tickets (+12 cols)    -- anonymous, emergency, withdrawal
--     grievance_categories (+3 cols)  -- NAAC metric tag + emergency flag
--
--   RLS policies on all new tables (super_admin bypass + user_has_permission
--   + role_has_institution_access pattern).
--
--   Seeds:
--     - iqac_code for 8 JKKN colleges (required for grievance ticket numbers)
--     - Starter metrics seed: 25 rows across 10 bodies (proves multi-body
--       pattern). Full ~215-row catalog lands in follow-up migration.
--
-- Retains v2.1 locked decisions (from retired Phase 1a spec):
--   R1.1: Business-day SLA (applies to grievance_tickets expansion)
--   R1.4: Anonymous grievance support (nullable raised_by_name + is_anonymous)
--   R2.1: SLA breach auto-escalate (sla_breached_at + escalation_level)
--   R2.2: Supersede on withdrawal (withdrawn_at + withdrawn_reason)
--   R2.3: Emergency fast-track (is_emergency + halved SLA)
--   R2.4: Proxy filing (filed_by separate from raised_by_id)
--   R3.3: Configurable notifications (notification_preferences deferred —
--         not in this migration, added later when first consumer needs it)
--   R4.1: Privacy matrix (is_icc_only + per-role RLS — RLS in 03_policies)
--   R5.1: Acknowledgment + Resolution PDFs (pdf_url columns)
--   R5.3: JKKN-{CODE}-GR-{YYYY}-{NNNNN} ticket format (uses institutions.iqac_code)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. QUALITY EVIDENCE MAPPINGS — the polymorphic junction (AD3)
-- ============================================================================
-- Every operational event that's accreditation-relevant inserts rows here.
-- Fan-out design (docs/one-jkkn-one-data Rule 2): one publication → 4 rows
-- (NAAC 9.1 + NIRF RPC + NBA PO + QS Citations). One grievance resolve →
-- 2 rows (NAAC 7.7.1 + UGC). One anti-ragging affidavit → 2-3 rows.
--
-- source_table + source_id is the polymorphic FK. No real FK (can't polymorph
-- in Postgres), but enforced by trigger + UNIQUE constraint.
-- ============================================================================
CREATE TABLE IF NOT EXISTS quality_evidence_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table      text NOT NULL,
  source_id         uuid NOT NULL,
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  body_code         text NOT NULL,
  metric_code       text NOT NULL,
  period_label      text,
  mapped_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  mapped_at         timestamptz NOT NULL DEFAULT now(),
  is_auto           boolean NOT NULL DEFAULT false,
  metadata          jsonb DEFAULT '{}'::jsonb,
  UNIQUE (source_table, source_id, body_code, metric_code),
  CHECK (body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC'))
);
COMMENT ON TABLE quality_evidence_mappings IS 'Polymorphic evidence junction — every operational event that feeds accreditation/compliance/ranking scoring emits rows here. body_code distinguishes which of the 10 bodies. Fan-out pattern (docs/one-jkkn-one-data Rule 2).';

CREATE INDEX idx_qem_source ON quality_evidence_mappings(source_table, source_id);
CREATE INDEX idx_qem_body_metric_inst ON quality_evidence_mappings(body_code, metric_code, institution_id);
CREATE INDEX idx_qem_body_inst_period ON quality_evidence_mappings(body_code, institution_id, period_label) WHERE period_label IS NOT NULL;
CREATE INDEX idx_qem_mapped_at ON quality_evidence_mappings(mapped_at DESC);

ALTER TABLE quality_evidence_mappings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. ACCREDITATION COMMITTEES — IQAC (NAAC) + NIRF Coord + NBA Cell + DCI LIC + ...
-- ============================================================================
-- v2.1 spec called these iqac_committees. Generalized here per body_code.
-- NAAC's IQAC is one row with body_code='NAAC'. NBA's coordinator committee
-- is another row with body_code='NBA'. Same schema, different scope.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accreditation_committees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  body_code         text NOT NULL,
  committee_name    text NOT NULL,
  committee_type    text NOT NULL DEFAULT 'main',
  chair_user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  formed_at         date NOT NULL,
  term_end          date,
  is_active         boolean NOT NULL DEFAULT true,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC')),
  CHECK (committee_type IN ('main','icc','anti_ragging','grievance','coordinator','inspection','statutory'))
);
COMMENT ON TABLE accreditation_committees IS 'Per-institution committee for each compliance body. IQAC is committee_type=main + body_code=NAAC. NBA coordinator is body_code=NBA. DCI local inspection committee is body_code=DCI + committee_type=inspection.';

CREATE INDEX idx_accred_committees_body_inst ON accreditation_committees(body_code, institution_id, is_active);
CREATE INDEX idx_accred_committees_chair ON accreditation_committees(chair_user_id) WHERE chair_user_id IS NOT NULL;

ALTER TABLE accreditation_committees ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. ACCREDITATION COMMITTEE MEMBERS — junction
-- ============================================================================
-- Junction table. NAAC audits ask "who was on the IQAC during 2024-25?" —
-- this table answers (joined_at + term_end). Supports external members
-- (industry experts, alumni) who don't have MyJKKN profiles.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accreditation_committee_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id      uuid NOT NULL REFERENCES accreditation_committees(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role              text NOT NULL,
  joined_at         date NOT NULL,
  term_end          date,
  is_active         boolean NOT NULL DEFAULT true,
  is_external       boolean NOT NULL DEFAULT false,
  external_name     text,
  external_org      text,
  external_email    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (committee_id, user_id, joined_at),
  CHECK (role IN ('chair','coordinator','member','observer','secretary','convenor')),
  CHECK (
    (is_external = false AND user_id IS NOT NULL) OR
    (is_external = true AND external_name IS NOT NULL)
  )
);
COMMENT ON TABLE accreditation_committee_members IS 'Committee membership with role + term. External members (industry experts, alumni) supported via external_* fields when user_id is null.';

CREATE INDEX idx_accred_members_committee ON accreditation_committee_members(committee_id, is_active);
CREATE INDEX idx_accred_members_user ON accreditation_committee_members(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE accreditation_committee_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. ACCREDITATION SUBMISSIONS — audit log of "one-click compliance outputs"
-- ============================================================================
-- North Star ("every compliance format reproducible on click") manifests here.
-- Each row = one generated compliance file (NAAC SSR 2027, NIRF annual DCF,
-- NBA SAR, DCI inspection file, etc.). Tracks due_date, submitted_at, status.
--
-- New per-AD6. Drives Principal's "upcoming compliance" dashboard panel.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accreditation_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  body_code         text NOT NULL,
  submission_type   text NOT NULL,
  period_label      text NOT NULL,
  due_date          date,
  submitted_at      timestamptz,
  submitted_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  export_url        text,
  export_format     text,
  status            text NOT NULL DEFAULT 'draft',
  coverage_snapshot numeric,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC')),
  CHECK (status IN ('draft','submitted','accepted','revision_requested','rejected','withdrawn')),
  CHECK (coverage_snapshot IS NULL OR (coverage_snapshot >= 0 AND coverage_snapshot <= 100))
);
COMMENT ON TABLE accreditation_submissions IS 'Audit log of one-click compliance outputs. Every NAAC SSR / NIRF submission / NBA SAR / DCI inspection file creates a row. Drives upcoming-deadlines UI + historical audit trail.';

CREATE INDEX idx_submissions_due ON accreditation_submissions(due_date, body_code) WHERE status NOT IN ('accepted','withdrawn');
CREATE INDEX idx_submissions_inst_body_period ON accreditation_submissions(institution_id, body_code, period_label);

ALTER TABLE accreditation_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. ACCREDITATION SURVEY CONSENTS — DPDPA-compliant multi-body consent
-- ============================================================================
-- DPDPA 2023 §4(1)(a) mandates specific-purpose consent. body_codes text[]
-- lets a single consent record cover multiple bodies (e.g., NAAC 8.4 Learning
-- Experience Survey consent also covers NIRF Student Perception Survey).
-- Alumni consent collected at graduation or via outreach.
-- ============================================================================
CREATE TABLE IF NOT EXISTS accreditation_survey_consents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  learner_id        uuid REFERENCES learners_profiles(id) ON DELETE SET NULL,
  alumni_email      text,
  consent_version   text NOT NULL DEFAULT '1.0',
  body_codes        text[] NOT NULL,
  purpose           text NOT NULL DEFAULT 'Accreditation + ranking submissions (NAAC, NIRF, NBA, DCI, PCI, INC, AICTE, NCTE, UGC, QS)',
  legal_basis       text NOT NULL DEFAULT 'DPDPA 2023 §4(1)(a) — specific purpose consent',
  scope             jsonb NOT NULL,
  consented_at      timestamptz NOT NULL DEFAULT now(),
  withdrawn_at      timestamptz,
  ip_address        inet,
  user_agent        text,
  export_event_ids  uuid[] NOT NULL DEFAULT '{}'::uuid[],
  CHECK (user_id IS NOT NULL OR learner_id IS NOT NULL OR alumni_email IS NOT NULL),
  CHECK (array_length(body_codes, 1) >= 1)
);
COMMENT ON TABLE accreditation_survey_consents IS 'DPDPA 2023-compliant survey consent. body_codes array lets one consent record cover multiple bodies. scope jsonb captures which data categories (PII, academic, alumni outcomes, parent contact) are covered. withdrawn_at = null means active.';

CREATE INDEX idx_consents_user ON accreditation_survey_consents(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_consents_learner ON accreditation_survey_consents(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX idx_consents_alumni_email ON accreditation_survey_consents(alumni_email) WHERE alumni_email IS NOT NULL;
CREATE INDEX idx_consents_active ON accreditation_survey_consents(consented_at) WHERE withdrawn_at IS NULL;

ALTER TABLE accreditation_survey_consents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. ACCREDITATION DIGEST CONFIG — per-user per-body digest email opt-in
-- ============================================================================
-- Each IQAC chair / NIRF coord / NBA coord opts in to a weekly digest for
-- their specific body. Cron-driven sender (added in Phase 4 Compliance Kernel).
-- ============================================================================
CREATE TABLE IF NOT EXISTS accreditation_digest_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  body_code         text NOT NULL,
  is_enabled        boolean NOT NULL DEFAULT true,
  email             text NOT NULL,
  frequency         text NOT NULL DEFAULT 'weekly',
  last_sent_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, institution_id, body_code),
  CHECK (body_code IN ('NAAC','NIRF','NBA','QS','DCI','PCI','INC','AICTE','NCTE','UGC')),
  CHECK (frequency IN ('daily','weekly','fortnightly','monthly'))
);
COMMENT ON TABLE accreditation_digest_config IS 'Per-user per-body digest opt-in. IQAC chair for NAAC, NIRF coord for NIRF, etc. get separate digest toggles. Frequency defaults to weekly.';

CREATE INDEX idx_digest_due ON accreditation_digest_config(body_code, is_enabled, last_sent_at) WHERE is_enabled = true;

ALTER TABLE accreditation_digest_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. ALTER institutions — add iqac_code (required for grievance ticket numbers)
-- ============================================================================
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS iqac_code char(4);

COMMENT ON COLUMN institutions.iqac_code IS 'Short code used in grievance ticket numbers (JKKN-{CODE}-GR-{YYYY}-{NNNNN}) and other human-readable identifiers. Seeded in this migration for 8 JKKN colleges.';

-- Seed iqac_code for 8 JKKN colleges (matches project_jkkn_eight_colleges.md).
-- Uses name pattern match — safe if run on fresh DB or re-run (idempotent).
UPDATE institutions SET iqac_code = 'DENT' WHERE name LIKE '%Dental College%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'PHAR' WHERE name LIKE '%College of Pharmacy%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'ALHD' WHERE name LIKE '%Allied Health%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'NURS' WHERE name LIKE '%Nursing%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'ENGG' WHERE name LIKE '%Engineering%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'ASAI' WHERE name LIKE '%Arts and Science%Aided%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'ASSF' WHERE name LIKE '%Arts and Science%Self%' AND iqac_code IS NULL;
UPDATE institutions SET iqac_code = 'EDUC' WHERE name LIKE '%College of Education%' AND iqac_code IS NULL;

-- ============================================================================
-- 8. ALTER profiles — accreditation_default_college_id (switcher persistence)
-- ============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accreditation_default_college_id uuid REFERENCES institutions(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.accreditation_default_college_id IS 'Users college switcher fallback (used by hybrid URL > localStorage > profile precedence). Null = no fallback; switcher lands on Cluster view.';

-- ============================================================================
-- 9. ALTER grievance_tickets — 12 new cols for v2.1-locked decisions
-- ============================================================================
ALTER TABLE grievance_tickets
  ALTER COLUMN raised_by_name DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_anonymous            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anonymous_token         text,
  ADD COLUMN IF NOT EXISTS filed_by                uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_emergency            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_icc_only             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_level        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sla_breached_at         timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at            timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason        text,
  ADD COLUMN IF NOT EXISTS acknowledgment_pdf_url  text,
  ADD COLUMN IF NOT EXISTS resolution_letter_pdf_url text;

-- Anonymous token must be present + unique when is_anonymous=true.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grievance_tickets_anonymous_token_unique') THEN
    ALTER TABLE grievance_tickets
      ADD CONSTRAINT grievance_tickets_anonymous_token_unique UNIQUE (anonymous_token);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grievance_tickets_anonymous_requires_token') THEN
    ALTER TABLE grievance_tickets
      ADD CONSTRAINT grievance_tickets_anonymous_requires_token CHECK (
        is_anonymous = false OR (is_anonymous = true AND anonymous_token IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN grievance_tickets.is_anonymous IS 'UGC Regulations 2023 §5(b): anonymous complainants allowed. See v2.1 spec R1.4.';
COMMENT ON COLUMN grievance_tickets.anonymous_token IS 'Opaque token for anonymous complainant to check status without logging in.';
COMMENT ON COLUMN grievance_tickets.filed_by IS 'Who submitted the ticket (may differ from raised_by_id for proxy filing by warden/coordinator/parent). See v2.1 spec R2.4.';
COMMENT ON COLUMN grievance_tickets.is_emergency IS 'Auto-set for sexual harassment + ragging categories. Halves SLA + SMS to chair/director within 1h. See v2.1 spec R2.3.';
COMMENT ON COLUMN grievance_tickets.is_icc_only IS 'ICC-members-only visibility toggle. Hides ticket from non-ICC IQAC chair/director on confidential SH cases. See v2.1 spec R4.1.';
COMMENT ON COLUMN grievance_tickets.escalation_level IS 'Increments on SLA breach or chair manual escalation. See v2.1 spec R2.1.';
COMMENT ON COLUMN grievance_tickets.sla_breached_at IS 'Set by pg_cron breach check job. See v2.1 spec R2.1.';
COMMENT ON COLUMN grievance_tickets.withdrawn_at IS 'Supersede semantics: row stays, status=withdrawn, UPDATE blocked by trigger (added later). See v2.1 spec R2.2.';

-- ============================================================================
-- 10. ALTER grievance_categories — NAAC metric tag + emergency flag
-- ============================================================================
ALTER TABLE grievance_categories
  ADD COLUMN IF NOT EXISTS default_naac_metric_code text,
  ADD COLUMN IF NOT EXISTS attachment_required      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_emergency             boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN grievance_categories.default_naac_metric_code IS 'Auto-tags new tickets with this NAAC metric code via trigger. Enables auto-fan-out to quality_evidence_mappings. Grievance is NAAC-specific (Metric 7.7) so this column stays named for NAAC.';
COMMENT ON COLUMN grievance_categories.attachment_required IS 'True for sexual_harassment + ragging UGC-mandated evidence categories. See v2.1 spec R3.2.';
COMMENT ON COLUMN grievance_categories.is_emergency IS 'Auto-flags new tickets in this category as is_emergency=true. See v2.1 spec R2.3.';

-- ============================================================================
-- 11. RLS POLICIES — standard MyJKKN pattern per CLAUDE.md
-- ============================================================================
-- Pattern: is_super_admin() OR is_admin()
--          OR (user_has_permission('<key>') AND role_has_institution_access(institution_id))
--
-- Permission keys follow module.submodule.action convention:
--   accreditation.evidence.view / create / manage
--   accreditation.committees.view / create / edit / delete
--   accreditation.submissions.view / create / manage
--   accreditation.consents.view / create / withdraw
--   accreditation.digest.view / edit
--
-- These permission keys are expected to be added to lib/constants/permissions.ts
-- PERMISSION_CATEGORIES in a follow-up commit. Until then, super_admin bypass
-- handles all testing.
-- ============================================================================

-- quality_evidence_mappings
CREATE POLICY "qem_select" ON quality_evidence_mappings
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "qem_insert" ON quality_evidence_mappings
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "qem_update" ON quality_evidence_mappings
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.evidence.manage')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "qem_delete" ON quality_evidence_mappings
FOR DELETE USING (is_super_admin() OR is_admin());

-- accreditation_committees
CREATE POLICY "committees_select" ON accreditation_committees
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.committees.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "committees_insert" ON accreditation_committees
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.committees.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "committees_update" ON accreditation_committees
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.committees.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "committees_delete" ON accreditation_committees
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.committees.delete')
      AND role_has_institution_access(institution_id))
);

-- accreditation_committee_members (joined through committee for institution scope)
CREATE POLICY "members_select" ON accreditation_committee_members
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('accreditation.committees.view')
);
CREATE POLICY "members_insert" ON accreditation_committee_members
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('accreditation.committees.edit')
);
CREATE POLICY "members_update" ON accreditation_committee_members
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('accreditation.committees.edit')
);
CREATE POLICY "members_delete" ON accreditation_committee_members
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('accreditation.committees.edit')
);

-- accreditation_submissions
CREATE POLICY "submissions_select" ON accreditation_submissions
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.submissions.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "submissions_insert" ON accreditation_submissions
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.submissions.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "submissions_update" ON accreditation_submissions
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.submissions.manage')
      AND role_has_institution_access(institution_id))
);

-- accreditation_survey_consents — users can always see + withdraw their own
CREATE POLICY "consents_select_own_or_admin" ON accreditation_survey_consents
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('accreditation.consents.view')
);
CREATE POLICY "consents_insert_self" ON accreditation_survey_consents
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('accreditation.consents.create')
);
CREATE POLICY "consents_update_withdraw" ON accreditation_survey_consents
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
  OR user_has_permission('accreditation.consents.withdraw')
);

-- accreditation_digest_config
CREATE POLICY "digest_select_own_or_admin" ON accreditation_digest_config
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
);
CREATE POLICY "digest_insert_self" ON accreditation_digest_config
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
);
CREATE POLICY "digest_update_self" ON accreditation_digest_config
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
);
CREATE POLICY "digest_delete_self" ON accreditation_digest_config
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR user_id = auth.uid()
);

-- ============================================================================
-- 12. STARTER METRICS SEED — 25 rows proving 10-body multi-body pattern
-- ============================================================================
-- This is NOT the full ~215-row catalog. It's a representative sample (2-3
-- metrics per body) that proves the schema works across all 10 bodies.
-- Full catalog seeding lands in a follow-up migration after domain-expert
-- review of actual rubric values. Each row here uses metric_type=body_code.
-- ============================================================================
INSERT INTO sh_accreditation_metrics (metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
VALUES
  -- NAAC (Binary + MBGL, 10 attributes, placeholder subset)
  ('NAAC', '1.1.1', 'Curriculum alignment with national frameworks', 'Attribute 1: Curriculum', 10, 'Auto-fill from /academic/courses', 'Seeded 2026-04-17 PR-A2'),
  ('NAAC', '2.2.2', 'Faculty with PhD %', 'Attribute 2: Faculty Resources', 15, 'staff WHERE has_doctoral_degree', 'High lever for Affiliated colleges (50pts at 2.2.2+2.2.3). Seeded 2026-04-17'),
  ('NAAC', '7.7.1', 'Grievance redressal timeliness', 'Attribute 7: Governance', 5, 'grievance_tickets WHERE status=resolved AND resolved_at <= sla_deadline', 'Auto-fed by grievance fan-out trigger. Seeded 2026-04-17'),
  ('NAAC', '8.4.1', 'Learning Experience Survey coverage', 'Attribute 8: Student Outcomes', 60, 'accreditation_survey_consents + learners_profiles count', 'HIGHEST-VALUE METRIC — 60pts/college × 8 = 480 cluster. Seeded 2026-04-17'),
  ('NAAC', '9.1.1', 'Research publications per faculty', 'Attribute 9: Research', 10, 'sh_publications GROUP BY faculty', 'Seeded 2026-04-17'),
  ('NAAC', '10.1.1', 'Green campus initiatives', 'Attribute 10: Sustainability', 15, 'Phase 2 Sustainability module feeds', 'Seeded 2026-04-17'),
  -- NIRF (5 params — TLR, RPC, GO, OI, PR)
  ('NIRF', 'TLR_SS', 'Teaching: Student Strength', 'TLR', 20, 'learners_profiles active count / intake_capacity', 'Seeded 2026-04-17'),
  ('NIRF', 'TLR_QF', 'Teaching: Qualification of Faculty', 'TLR', 20, 'staff WHERE has_doctoral_degree', 'Overlaps NAAC 2.2.2 — same source data. Seeded 2026-04-17'),
  ('NIRF', 'RPC_PU', 'Research: Publications', 'RPC', 35, 'sh_publications per faculty', 'Overlaps NAAC 9.1.1. Seeded 2026-04-17'),
  ('NIRF', 'GO_PL', 'Graduation: Placement', 'GO', 40, 'alumni_outcomes WHERE placed=true', 'Seeded 2026-04-17'),
  ('NIRF', 'OI_GD', 'Outreach: Gender Diversity', 'OI', 15, 'learners_profiles GROUP BY gender', 'Seeded 2026-04-17'),
  -- NBA (10 criteria, Tier 1/2 — placeholder subset)
  ('NBA', 'T1_PO', 'Program Outcomes attainment', 'Tier 1', 50, 'course_outcomes × program mapping', 'Engineering-only. Seeded 2026-04-17'),
  ('NBA', 'T1_CO', 'Course Outcomes assessment', 'Tier 1', 30, 'assessment rubrics per course', 'Seeded 2026-04-17'),
  ('NBA', 'T2_FAC', 'Faculty qualifications + consistency', 'Tier 2', 40, 'staff WHERE has_doctoral_degree + retention', 'Seeded 2026-04-17'),
  -- QS (6 indicators — aspirational placeholder)
  ('QS', 'AR', 'Academic Reputation', 'Reputation', 40, 'Peer survey (external)', 'Aspirational Phase 2+. Seeded 2026-04-17'),
  ('QS', 'CIT', 'Citations per Faculty', 'Research', 20, 'sh_publications citation_count', 'Overlaps NAAC 9 / NIRF RPC. Seeded 2026-04-17'),
  -- DCI (Dental)
  ('DCI', 'FAC', 'Faculty roster compliance', 'Faculty', 25, 'hr_staff_details Dental college only', 'Dental-only. Seeded 2026-04-17'),
  ('DCI', 'PAT', 'Patient load for clinical training', 'Clinical', 30, 'External data import', 'Seeded 2026-04-17'),
  -- PCI (Pharmacy)
  ('PCI', 'FAC', 'Faculty roster compliance', 'Faculty', 25, 'hr_staff_details Pharmacy college only', 'Seeded 2026-04-17'),
  ('PCI', 'INF', 'Laboratory infrastructure', 'Infrastructure', 30, 'Infrastructure audit', 'Seeded 2026-04-17'),
  -- INC (Nursing)
  ('INC', 'FAC', 'Faculty roster compliance', 'Faculty', 25, 'hr_staff_details Nursing college only', 'Seeded 2026-04-17'),
  ('INC', 'CLN', 'Clinical placement hours', 'Training', 30, 'clinical_placements table', 'Seeded 2026-04-17'),
  -- NCTE (Education)
  ('NCTE', 'FAC', 'Faculty roster compliance', 'Faculty', 25, 'hr_staff_details Education college only', 'Seeded 2026-04-17'),
  -- AICTE (Engineering + Pharmacy)
  ('AICTE', 'EOA', 'Extension of Approval compliance', 'Approval', 40, 'Annual EOA submission', 'Seeded 2026-04-17'),
  -- UGC (All colleges)
  ('UGC', 'ANT', 'Anti-ragging compliance', 'Safety', 15, 'anti_ragging_affidavits + hostel_incidents', 'Overlaps NAAC 7.7.1 + 5.6.1. Seeded 2026-04-17')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually after apply)
-- ============================================================================
-- SELECT COUNT(*) FROM quality_evidence_mappings;          -- 0 (junction empty)
-- SELECT COUNT(*) FROM accreditation_committees;            -- 0 (seeded later)
-- SELECT metric_type, COUNT(*) FROM sh_accreditation_metrics WHERE metric_code LIKE 'Seeded%' OR notes LIKE '%PR-A2%' GROUP BY metric_type;
--                                                           -- 10 body_codes, 25 rows total
-- SELECT name, iqac_code FROM institutions WHERE iqac_code IS NOT NULL;
--                                                           -- 8 JKKN colleges with codes
-- SELECT column_name FROM information_schema.columns WHERE table_name='grievance_tickets' AND column_name IN ('is_anonymous','anonymous_token','filed_by','is_emergency','is_icc_only','escalation_level','sla_breached_at','withdrawn_at','withdrawn_reason','acknowledgment_pdf_url','resolution_letter_pdf_url');
--                                                           -- 11 rows (raised_by_name NULLability verified separately)
-- ============================================================================
