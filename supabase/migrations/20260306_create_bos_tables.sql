-- ============================================================================
-- Migration: 20260306_create_bos_tables.sql
-- Description: Board of Studies (BOS) module — MyJKKN-native tables
-- Created:     2026-03-06 (COE version)
-- Updated:     2026-04-20 — Ported to MyJKKN conventions:
--                • institutions_id  → institution_id  (singular, MyJKKN standard)
--                • board_id         → bare UUID (board data from COE API, no local table)
--                • course_id        → bare UUID (courses from COE API, no local FK)
--                • staff_id         → REFERENCES staff(id)  (MyJKKN-local staff)
--                • Added RLS policies (user_has_permission + role_has_institution_access)
--                • Added updated_at triggers (update_updated_at_column)
--                • Added IF NOT EXISTS guards throughout
-- ============================================================================


-- ── bos_external_experts ────────────────────────────────────────────────────
-- Master directory of external experts reusable across departments and years.
-- Categories follow UGC BoS composition norms for autonomous colleges.

CREATE TABLE IF NOT EXISTS bos_external_experts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name                 VARCHAR(255) NOT NULL,
  title                VARCHAR(50),               -- Dr., Prof., Mr., Ms.
  designation          VARCHAR(255),
  institution_name     VARCHAR(255),              -- employing institution (if academic)
  department_name      VARCHAR(255),
  address              TEXT,
  contact_no           VARCHAR(20),
  email                VARCHAR(255),
  category             VARCHAR(50) NOT NULL CHECK (category IN (
    'university_nominee', 'subject_expert', 'industry_expert', 'alumni'
  )),
  specialization       TEXT,
  qualifications       TEXT,
  is_active            BOOLEAN DEFAULT true,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_experts_institution ON bos_external_experts(institution_id);
CREATE INDEX IF NOT EXISTS idx_bos_experts_category    ON bos_external_experts(category);
CREATE INDEX IF NOT EXISTS idx_bos_experts_is_active   ON bos_external_experts(is_active);

ALTER TABLE bos_external_experts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_experts_select" ON bos_external_experts FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-experts.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_experts_insert" ON bos_external_experts FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-experts.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_experts_update" ON bos_external_experts FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-experts.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_experts_delete" ON bos_external_experts FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-experts.delete')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_experts_updated_at
  BEFORE UPDATE ON bos_external_experts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_compositions ────────────────────────────────────────────────────────
-- Formal constitution of a BoS for a specific board and 3-year term.
-- board_id is a COE API reference — stored as bare UUID, no local FK.
-- UGC norm: must be constituted/reconstituted every 3 years.

CREATE TABLE IF NOT EXISTS bos_compositions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id            UUID NOT NULL,              -- COE API: board entity (no local FK)
  composition_title   VARCHAR(255) NOT NULL,      -- e.g., "2024-2027 Composition"
  term_start_date     DATE NOT NULL,
  term_end_date       DATE NOT NULL,              -- typically term_start + 3 years
  academic_year       VARCHAR(10) NOT NULL,       -- e.g., "2024-25"
  is_active           BOOLEAN DEFAULT true,       -- only one active per board at a time
  constituted_by      UUID REFERENCES staff(id), -- MyJKKN staff who constituted this BoS
  ratified_by_gc      BOOLEAN DEFAULT false,      -- Governing Council ratified
  ratified_date       DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, term_start_date)
);

CREATE INDEX IF NOT EXISTS idx_bos_compositions_institution ON bos_compositions(institution_id);
CREATE INDEX IF NOT EXISTS idx_bos_compositions_board       ON bos_compositions(board_id);
CREATE INDEX IF NOT EXISTS idx_bos_compositions_is_active   ON bos_compositions(is_active);

ALTER TABLE bos_compositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_compositions_select" ON bos_compositions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_compositions_insert" ON bos_compositions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_compositions_update" ON bos_compositions FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_compositions_delete" ON bos_compositions FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.delete')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_compositions_updated_at
  BEFORE UPDATE ON bos_compositions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_members ─────────────────────────────────────────────────────────────
-- Individual members of a composition.
-- Exactly one of staff_id (internal) or expert_id (external) must be set.

CREATE TABLE IF NOT EXISTS bos_members (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  composition_id       UUID NOT NULL REFERENCES bos_compositions(id) ON DELETE CASCADE,
  member_type          VARCHAR(30) NOT NULL CHECK (member_type IN (
    'chairman', 'internal_member', 'university_nominee',
    'subject_expert', 'industry_expert', 'alumni'
  )),
  -- Internal members (staff from MyJKKN staff table)
  staff_id             UUID REFERENCES staff(id),
  staff_name           VARCHAR(255),              -- denormalized for display
  staff_designation    VARCHAR(255),
  -- External members
  expert_id            UUID REFERENCES bos_external_experts(id),
  -- Display fields (denormalized to avoid joins in listing views)
  display_name         VARCHAR(255) NOT NULL,
  display_designation  VARCHAR(255),
  display_institution  VARCHAR(255),
  address              TEXT,
  contact_no           VARCHAR(20),
  email                VARCHAR(255),
  sort_order           INTEGER DEFAULT 0,
  is_active            BOOLEAN DEFAULT true,
  joined_date          DATE,
  left_date            DATE,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT bos_members_source_check CHECK (
    (staff_id IS NOT NULL AND expert_id IS NULL) OR
    (staff_id IS NULL     AND expert_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_bos_members_composition ON bos_members(composition_id);
CREATE INDEX IF NOT EXISTS idx_bos_members_institution  ON bos_members(institution_id);
CREATE INDEX IF NOT EXISTS idx_bos_members_expert       ON bos_members(expert_id);
CREATE INDEX IF NOT EXISTS idx_bos_members_staff        ON bos_members(staff_id);
CREATE INDEX IF NOT EXISTS idx_bos_members_member_type  ON bos_members(member_type);

ALTER TABLE bos_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_members_select" ON bos_members FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_members_insert" ON bos_members FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_members_update" ON bos_members FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_members_delete" ON bos_members FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_members_updated_at
  BEFORE UPDATE ON bos_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_meetings ─────────────────────────────────────────────────────────────
-- Core meeting record with 8-state machine workflow.
-- board_id is a COE API reference — stored as bare UUID, no local FK.
-- draft → principal_approved → noticed → expert_invited
--       → completed → minutes_drafted → minutes_approved → ratified

CREATE TABLE IF NOT EXISTS bos_meetings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id             UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id                   UUID NOT NULL,              -- COE API reference (no local FK)
  composition_id             UUID NOT NULL REFERENCES bos_compositions(id),
  meeting_number             INTEGER NOT NULL,           -- sequential per board per academic_year
  academic_year              VARCHAR(10) NOT NULL,       -- e.g., "2024-25"
  meeting_title              VARCHAR(255),
  meeting_type               VARCHAR(30) NOT NULL DEFAULT 'regular' CHECK (meeting_type IN (
    'regular', 'special', 'emergency', 'online'
  )),
  status                     VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'principal_approved', 'noticed', 'expert_invited',
    'completed', 'minutes_drafted', 'minutes_approved', 'ratified'
  )),
  -- Scheduling
  scheduled_date             DATE,
  scheduled_time             TIME,
  venue                      VARCHAR(255),
  -- Conduct
  actual_date                DATE,
  actual_start_time          TIME,
  actual_end_time            TIME,
  quorum_met                 BOOLEAN,
  -- Approval trail
  submitted_for_approval_at  TIMESTAMPTZ,
  principal_approved_at      TIMESTAMPTZ,
  principal_approved_by      UUID REFERENCES staff(id),
  -- Ratification
  ratified_by_ac             BOOLEAN DEFAULT false,
  ratified_date              DATE,
  -- Agenda & minutes
  agenda_text                TEXT,
  minutes_summary            TEXT,
  minutes_drafted_at         TIMESTAMPTZ,
  minutes_approved_at        TIMESTAMPTZ,
  minutes_approved_by        UUID REFERENCES staff(id),
  -- Document
  signature_page_url         TEXT,
  notes                      TEXT,
  created_by                 UUID REFERENCES staff(id),
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now(),

  UNIQUE(board_id, academic_year, meeting_number)
);

CREATE INDEX IF NOT EXISTS idx_bos_meetings_institution   ON bos_meetings(institution_id);
CREATE INDEX IF NOT EXISTS idx_bos_meetings_board         ON bos_meetings(board_id);
CREATE INDEX IF NOT EXISTS idx_bos_meetings_composition   ON bos_meetings(composition_id);
CREATE INDEX IF NOT EXISTS idx_bos_meetings_status        ON bos_meetings(status);
CREATE INDEX IF NOT EXISTS idx_bos_meetings_academic_year ON bos_meetings(academic_year);

ALTER TABLE bos_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_meetings_select" ON bos_meetings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_meetings_insert" ON bos_meetings FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_meetings_update" ON bos_meetings FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_meetings_delete" ON bos_meetings FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.delete')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_meetings_updated_at
  BEFORE UPDATE ON bos_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_meeting_attendees ────────────────────────────────────────────────────
-- Attendance per member per meeting.
-- ta_da_eligible drives TA/DA claim creation for external experts.

CREATE TABLE IF NOT EXISTS bos_meeting_attendees (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id         UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id          UUID NOT NULL REFERENCES bos_members(id),
  attendance_status  VARCHAR(20) NOT NULL DEFAULT 'absent' CHECK (attendance_status IN (
    'present', 'absent', 'leave_of_absence'
  )),
  absence_reason     TEXT,
  ta_da_eligible     BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_bos_attendees_meeting ON bos_meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_bos_attendees_member  ON bos_meeting_attendees(member_id);

ALTER TABLE bos_meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_attendees_select" ON bos_meeting_attendees FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_attendees_insert" ON bos_meeting_attendees FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_attendees_update" ON bos_meeting_attendees FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_attendees_delete" ON bos_meeting_attendees FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_attendees_updated_at
  BEFORE UPDATE ON bos_meeting_attendees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_agenda_items ─────────────────────────────────────────────────────────
-- Individual agenda items, their resolutions, and follow-up responsibility.

CREATE TABLE IF NOT EXISTS bos_agenda_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id         UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  item_number        INTEGER NOT NULL,
  item_title         VARCHAR(255) NOT NULL,
  item_description   TEXT,
  discussion_notes   TEXT,
  resolution_text    TEXT,
  resolution_status  VARCHAR(20) CHECK (resolution_status IN (
    'pending', 'in_progress', 'completed', 'deferred', 'not_applicable'
  )),
  responsible_person VARCHAR(255),
  target_date        DATE,
  sort_order         INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_bos_agenda_meeting ON bos_agenda_items(meeting_id);

ALTER TABLE bos_agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_agenda_select" ON bos_agenda_items FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_agenda_insert" ON bos_agenda_items FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_agenda_update" ON bos_agenda_items FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_agenda_delete" ON bos_agenda_items FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_agenda_updated_at
  BEFORE UPDATE ON bos_agenda_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_resolution_actions ───────────────────────────────────────────────────
-- Follow-up actions per agenda item (powers Action Taken Report).

CREATE TABLE IF NOT EXISTS bos_resolution_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  agenda_item_id      UUID NOT NULL REFERENCES bos_agenda_items(id) ON DELETE CASCADE,
  action_description  TEXT NOT NULL,
  action_date         DATE,
  action_by           VARCHAR(255),
  remarks             TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed'
  )),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_resolution_actions_agenda ON bos_resolution_actions(agenda_item_id);

ALTER TABLE bos_resolution_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_actions_select" ON bos_resolution_actions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_actions_insert" ON bos_resolution_actions FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_actions_update" ON bos_resolution_actions FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_actions_delete" ON bos_resolution_actions FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_resolution_actions_updated_at
  BEFORE UPDATE ON bos_resolution_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_course_reviews ───────────────────────────────────────────────────────
-- Courses reviewed/approved in a meeting — NAAC syllabus approval audit trail.
-- course_id is a COE API reference — stored as bare UUID, no local FK.
-- course_code and course_name are denormalized for historical stability
-- (the COE course record may be renamed after the fact; the review must not change).

CREATE TABLE IF NOT EXISTS bos_course_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id        UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  agenda_item_id    UUID REFERENCES bos_agenda_items(id),
  course_id         UUID,                          -- COE API reference (no local FK)
  course_code       VARCHAR(50) NOT NULL,          -- denormalized for historical stability
  course_name       VARCHAR(255) NOT NULL,         -- denormalized
  review_action     VARCHAR(30) NOT NULL CHECK (review_action IN (
    'approved', 'approved_with_changes', 'rejected', 'deferred', 'noted'
  )),
  changes_suggested TEXT,
  remarks           TEXT,
  regulation_code   VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_course_reviews_meeting ON bos_course_reviews(meeting_id);
CREATE INDEX IF NOT EXISTS idx_bos_course_reviews_course  ON bos_course_reviews(course_id);

ALTER TABLE bos_course_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_course_reviews_select" ON bos_course_reviews FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_course_reviews_insert" ON bos_course_reviews FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_course_reviews_update" ON bos_course_reviews FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_course_reviews_delete" ON bos_course_reviews FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);

CREATE TRIGGER update_bos_course_reviews_updated_at
  BEFORE UPDATE ON bos_course_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_ta_da_claims ─────────────────────────────────────────────────────────
-- TA/DA reimbursement tracking for external experts per meeting.
-- total_amount is GENERATED (PostgreSQL computes it from components automatically).

CREATE TABLE IF NOT EXISTS bos_ta_da_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id          UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  member_id           UUID NOT NULL REFERENCES bos_members(id),
  expert_id           UUID NOT NULL REFERENCES bos_external_experts(id),
  -- Travel
  travel_mode         VARCHAR(50),                 -- bus, train, air, own_vehicle
  travel_from         VARCHAR(255),
  travel_to           VARCHAR(255),
  travel_amount       NUMERIC(10,2) DEFAULT 0,
  -- Daily allowance
  da_days             NUMERIC(4,1) DEFAULT 1,
  da_rate             NUMERIC(8,2) DEFAULT 0,
  da_amount           NUMERIC(10,2) DEFAULT 0,
  -- Other
  other_amount        NUMERIC(10,2) DEFAULT 0,
  other_description   TEXT,
  -- Computed: database keeps this in sync — never trust client-submitted total
  total_amount        NUMERIC(10,2) GENERATED ALWAYS AS (
    travel_amount + da_amount + other_amount
  ) STORED,
  -- Status
  claim_status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (claim_status IN (
    'draft', 'submitted', 'approved', 'paid'
  )),
  bill_number         VARCHAR(50),
  payment_date        DATE,
  payment_reference   VARCHAR(100),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE(meeting_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_bos_ta_da_meeting ON bos_ta_da_claims(meeting_id);
CREATE INDEX IF NOT EXISTS idx_bos_ta_da_expert  ON bos_ta_da_claims(expert_id);

ALTER TABLE bos_ta_da_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_tada_select" ON bos_ta_da_claims FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-tada.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_tada_insert" ON bos_ta_da_claims FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-tada.create')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_tada_update" ON bos_ta_da_claims FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-tada.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_tada_delete" ON bos_ta_da_claims FOR DELETE USING (
  is_super_admin() OR is_admin()
);

CREATE TRIGGER update_bos_ta_da_claims_updated_at
  BEFORE UPDATE ON bos_ta_da_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── bos_documents ────────────────────────────────────────────────────────────
-- Generated NAAC document metadata (notices, call letters, minutes PDFs).
-- Actual files in Supabase Storage; this table stores metadata + URL.

CREATE TABLE IF NOT EXISTS bos_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  meeting_id           UUID NOT NULL REFERENCES bos_meetings(id) ON DELETE CASCADE,
  document_type        VARCHAR(50) NOT NULL CHECK (document_type IN (
    'meeting_notice', 'call_letter', 'minutes_of_meeting',
    'composition_certificate', 'syllabus_approval_certificate',
    'ta_da_bill', 'action_taken_report'
  )),
  file_name            VARCHAR(255) NOT NULL,
  file_url             TEXT NOT NULL,
  file_format          VARCHAR(10) NOT NULL CHECK (file_format IN ('pdf', 'docx')),
  recipient_member_id  UUID REFERENCES bos_members(id),  -- NULL = general document
  generated_at         TIMESTAMPTZ DEFAULT now(),
  generated_by         UUID REFERENCES staff(id),
  is_latest            BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_documents_meeting ON bos_documents(meeting_id);
CREATE INDEX IF NOT EXISTS idx_bos_documents_type    ON bos_documents(document_type);

ALTER TABLE bos_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_documents_select" ON bos_documents FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.view')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_documents_insert" ON bos_documents FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_documents_update" ON bos_documents FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-meetings.edit')
      AND role_has_institution_access(institution_id))
);
CREATE POLICY "bos_documents_delete" ON bos_documents FOR DELETE USING (
  is_super_admin() OR is_admin()
);

CREATE TRIGGER update_bos_documents_updated_at
  BEFORE UPDATE ON bos_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
