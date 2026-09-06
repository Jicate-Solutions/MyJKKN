-- ============================================================================
-- EKSAQ RCLTP — Phase A: Foundation Schema
-- ============================================================================
-- Module: Reading Comprehension Learning & Teaching Proficiency (RCLTP)
-- Spec: specs/eksaq-rcltp-prd.md  +  specs/eksaq-rcltp-assumption-thrash.md
--
-- Scope (Phase A): tables + enums + indexes + updated_at triggers + baseline RLS
-- (admin / school-head / teacher / student branches). DEFERRED to follow-ups:
--   - reading-competency seed into competency_catalog (needs competency_type value)
--   - rcltp.* permission + parent_guardian role seed
--   - parent-facing RLS (depends on parent_learner_links — has NO migration file
--     in this repo; production drift, see PRD §correction)
--   - rcltp-audio storage bucket
--
-- v1 = English only; `language` is a column (default 'en') so other languages
-- are data, not a migration. Bands are an enum (fixed ladder); their score
-- cutoffs live in rcltp_band_config (per-tenant CRUDable).
--
-- Reuses (FKs): learners_profiles, competency_catalog, institutions,
-- academic_years, sections, profiles. RLS helpers: is_super_admin(),
-- is_admin(uuid default null), user_has_permission(text),
-- role_has_institution_access(uuid), get_my_learner_id().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE rcltp_band AS ENUM ('emergent','transitional','proficient','super_proficient');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_dimension AS ENUM ('reading','comprehension','overall','vocabulary');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_assessment_type AS ENUM ('baseline','cycle','practice');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_assessment_status AS ENUM
    ('scheduled','in_progress','recorded','queued_for_scoring','scored','needs_review','published','not_attempted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_passage_source AS ENUM ('curated','ai_generated','teacher_uploaded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_passage_status AS ENUM ('draft','approved','retired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_sync_status AS ENUM ('local','queued','uploaded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_scoring_status AS ENUM ('pending','scored','low_confidence_review','overridden');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_schedule_status AS ENUM ('proposed','confirmed','open','closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE rcltp_practice_status AS ENUM ('assigned','in_progress','completed','missed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger helper (RCLTP-owned to avoid cross-module dependency)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rcltp_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3. TABLES
--    Convention: institution_id scopes tenancy; audit columns on every table.
--    NULLABLE institution_id = shared/global library (passages, vbb_words).
-- ---------------------------------------------------------------------------

-- 3.1 Passage bank (content library — institution_id NULL = global/shared)
CREATE TABLE IF NOT EXISTS rcltp_passages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid REFERENCES institutions(id) ON DELETE CASCADE,
  language        text NOT NULL DEFAULT 'en',
  grade_level     smallint CHECK (grade_level BETWEEN 1 AND 10),
  title           text NOT NULL,
  body            text NOT NULL,
  source          rcltp_passage_source NOT NULL DEFAULT 'curated',
  word_count      integer,
  difficulty      smallint,
  status          rcltp_passage_status NOT NULL DEFAULT 'draft',
  ai_meta         jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  updated_by      uuid REFERENCES profiles(id)
);

-- 3.2 Comprehension questions per passage (each tagged to a reading competency)
CREATE TABLE IF NOT EXISTS rcltp_part_b_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id      uuid NOT NULL REFERENCES rcltp_passages(id) ON DELETE CASCADE,
  institution_id  uuid REFERENCES institutions(id) ON DELETE CASCADE,
  competency_id   uuid REFERENCES competency_catalog(id) ON DELETE SET NULL,
  question_text   text NOT NULL,
  question_type   text NOT NULL,
  options         jsonb,
  correct_answer  text,
  max_score       numeric NOT NULL DEFAULT 1,
  order_index     integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  updated_by      uuid REFERENCES profiles(id)
);

-- 3.3 Assessment instance (one sitting)
CREATE TABLE IF NOT EXISTS rcltp_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id        uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  academic_year_id  uuid REFERENCES academic_years(id),
  section_id        uuid REFERENCES sections(id),
  grade_level       smallint CHECK (grade_level BETWEEN 1 AND 10),
  language          text NOT NULL DEFAULT 'en',
  assessment_type   rcltp_assessment_type NOT NULL DEFAULT 'cycle',
  cycle_no          smallint CHECK (cycle_no BETWEEN 1 AND 6),
  passage_id        uuid REFERENCES rcltp_passages(id),
  status            rcltp_assessment_status NOT NULL DEFAULT 'scheduled',
  proctored         boolean NOT NULL DEFAULT false,
  administered_by   uuid REFERENCES staff(id),
  attempt_no        smallint NOT NULL DEFAULT 1,
  is_official       boolean NOT NULL DEFAULT true,
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  opened_at         timestamptz,
  submitted_at      timestamptz,
  scored_at         timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id),
  updated_by        uuid REFERENCES profiles(id)
);

-- 3.4 Part A — Read & Record (voice + scores). expression/modulation nullable
--     until local-language/prosody scoring lands (PRD §future).
CREATE TABLE IF NOT EXISTS rcltp_part_a_recordings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       uuid NOT NULL REFERENCES rcltp_assessments(id) ON DELETE CASCADE,
  institution_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  audio_path          text,                       -- storage path, NOT a URL
  sync_status         rcltp_sync_status NOT NULL DEFAULT 'local',
  scoring_status      rcltp_scoring_status NOT NULL DEFAULT 'pending',
  engine              text,
  engine_response     jsonb,
  accuracy_score      numeric,
  fluency_score       numeric,
  completeness_score  numeric,
  pron_score          numeric,
  wpm                 numeric,
  expression_score    numeric,                    -- nullable: future
  modulation_score    numeric,                    -- nullable: future
  chunking_flags      jsonb,
  confidence          numeric,
  reviewed_by         uuid REFERENCES staff(id),
  review_status       text,
  purge_after         date,                       -- clock starts at scored_at/sync
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES profiles(id),
  updated_by          uuid REFERENCES profiles(id)
);

-- 3.5 Part B — responses
CREATE TABLE IF NOT EXISTS rcltp_part_b_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   uuid NOT NULL REFERENCES rcltp_assessments(id) ON DELETE CASCADE,
  question_id     uuid NOT NULL REFERENCES rcltp_part_b_questions(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  competency_id   uuid REFERENCES competency_catalog(id) ON DELETE SET NULL,
  response        text,
  is_correct      boolean,
  score           numeric,
  auto_graded     boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.6 Composite result per assessment (the 67->85 prev-vs-current)
CREATE TABLE IF NOT EXISTS rcltp_assessment_results (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id          uuid NOT NULL UNIQUE REFERENCES rcltp_assessments(id) ON DELETE CASCADE,
  institution_id         uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id             uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  reading_band           rcltp_band,
  comprehension_band     rcltp_band,
  overall_band           rcltp_band,
  reading_score          numeric,
  comprehension_score    numeric,
  overall_score          numeric,
  previous_overall_score numeric,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 3.7 Per-tenant band cutoffs (CRUDable — rule #15)
CREATE TABLE IF NOT EXISTS rcltp_band_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  dimension       rcltp_dimension NOT NULL,
  band            rcltp_band NOT NULL,
  min_score       numeric NOT NULL,
  max_score       numeric NOT NULL,
  is_system       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES profiles(id),
  updated_by      uuid REFERENCES profiles(id),
  UNIQUE (institution_id, dimension, band)
);

-- 3.8 Student Learning Journey (current band per dimension + progression log)
CREATE TABLE IF NOT EXISTS rcltp_student_journey (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id           uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  dimension            rcltp_dimension NOT NULL,
  current_band         rcltp_band,
  since                date,
  exercises_completed  integer NOT NULL DEFAULT 0,
  progression_log      jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, dimension)
);

-- 3.9 Adaptive practice assignments (5/3/1 by band)
CREATE TABLE IF NOT EXISTS rcltp_practice_assignments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id           uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  week_of              date NOT NULL,
  exercises_assigned   smallint NOT NULL DEFAULT 0,
  exercises_completed  smallint NOT NULL DEFAULT 0,
  status               rcltp_practice_status NOT NULL DEFAULT 'assigned',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 3.10 No-repeat passage exposure (guarantees "unseen")
CREATE TABLE IF NOT EXISTS rcltp_passage_exposure (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  passage_id     uuid NOT NULL REFERENCES rcltp_passages(id) ON DELETE CASCADE,
  assessment_id  uuid REFERENCES rcltp_assessments(id) ON DELETE SET NULL,
  seen_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, passage_id)
);

-- 3.11 VBB vocabulary list (content library — institution_id NULL = global)
CREATE TABLE IF NOT EXISTS rcltp_vbb_words (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid REFERENCES institutions(id) ON DELETE CASCADE,
  language         text NOT NULL DEFAULT 'en',
  word             text NOT NULL,
  stage            text,
  difficulty_rank  integer,
  definition       text,
  context_example  text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES profiles(id),
  updated_by       uuid REFERENCES profiles(id)
);

-- 3.12 VBB progress per student
CREATE TABLE IF NOT EXISTS rcltp_vbb_progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id       uuid NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,
  stage            text,
  score            numeric,
  completion_rate  numeric,
  week_of          date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3.13 Assessment schedule (6 cycles; system proposes, teacher confirms)
CREATE TABLE IF NOT EXISTS rcltp_assessment_schedule (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year_id    uuid NOT NULL REFERENCES academic_years(id),
  cycle_no            smallint NOT NULL CHECK (cycle_no BETWEEN 1 AND 6),
  window_start        date,
  window_end          date,
  status              rcltp_schedule_status NOT NULL DEFAULT 'proposed',
  proposed_by_system  boolean NOT NULL DEFAULT true,
  confirmed_by        uuid REFERENCES staff(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, academic_year_id, cycle_no)
);

-- ---------------------------------------------------------------------------
-- 4. INDEXES (tenancy + common lookups)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rcltp_passages_inst_lang_grade ON rcltp_passages(institution_id, language, grade_level);
CREATE INDEX IF NOT EXISTS idx_rcltp_pbq_passage              ON rcltp_part_b_questions(passage_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_pbq_competency           ON rcltp_part_b_questions(competency_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_assess_inst              ON rcltp_assessments(institution_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_assess_learner           ON rcltp_assessments(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_assess_status            ON rcltp_assessments(status);
CREATE INDEX IF NOT EXISTS idx_rcltp_assess_year_cycle        ON rcltp_assessments(academic_year_id, cycle_no);
CREATE INDEX IF NOT EXISTS idx_rcltp_parta_assess             ON rcltp_part_a_recordings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_parta_scoring            ON rcltp_part_a_recordings(scoring_status);
CREATE INDEX IF NOT EXISTS idx_rcltp_parta_purge              ON rcltp_part_a_recordings(purge_after);
CREATE INDEX IF NOT EXISTS idx_rcltp_pbr_assess               ON rcltp_part_b_responses(assessment_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_results_learner          ON rcltp_assessment_results(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_bandcfg_inst             ON rcltp_band_config(institution_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_journey_learner          ON rcltp_student_journey(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_practice_learner_week    ON rcltp_practice_assignments(learner_id, week_of);
CREATE INDEX IF NOT EXISTS idx_rcltp_exposure_learner         ON rcltp_passage_exposure(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_vbb_words_inst_lang      ON rcltp_vbb_words(institution_id, language);
CREATE INDEX IF NOT EXISTS idx_rcltp_vbb_progress_learner     ON rcltp_vbb_progress(learner_id);
CREATE INDEX IF NOT EXISTS idx_rcltp_schedule_inst            ON rcltp_assessment_schedule(institution_id);

-- ---------------------------------------------------------------------------
-- 5. updated_at TRIGGERS
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rcltp_passages','rcltp_part_b_questions','rcltp_assessments','rcltp_part_a_recordings',
    'rcltp_part_b_responses','rcltp_assessment_results','rcltp_band_config','rcltp_student_journey',
    'rcltp_practice_assignments','rcltp_vbb_words','rcltp_vbb_progress','rcltp_assessment_schedule'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s
                    FOR EACH ROW EXECUTE FUNCTION rcltp_set_updated_at();', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--    Enable on all tables, then baseline policies.
--    Posture (v1):
--      - super_admin / admin .................. full bypass
--      - staff w/ rcltp.report.view_all ....... institution-scoped read (principals;
--        teachers also use this in v1 — class-level narrowing via class_incharges
--        is a documented follow-up before go-live)
--      - student .............................. own rows (learner_id = get_my_learner_id())
--      - PARENT branch DEFERRED (parent_learner_links has no migration here)
--    Writes: staff w/ rcltp.config.manage / rcltp.assessment.manage; students may
--    insert their own responses/recordings. Refined in a follow-up migration.
-- ---------------------------------------------------------------------------

-- Library tables (passages, vbb_words): readable by any authenticated user in an
-- institution OR global rows; writable by managers.
ALTER TABLE rcltp_passages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_part_b_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_assessments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_part_a_recordings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_part_b_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_band_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_student_journey    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_practice_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_passage_exposure   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_vbb_words          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_vbb_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rcltp_assessment_schedule ENABLE ROW LEVEL SECURITY;

-- Idempotency: drop any pre-existing RCLTP policies before (re)creating (CREATE POLICY has no IF NOT EXISTS)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'rcltp\_%' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', r.policyname, r.tablename);
  END LOOP;
END $$;

-- SECURITY MODEL (v1) — from pre-ship adversarial review:
--   * super_admin / admin .... full bypass.
--   * staff (perm + role_has_institution_access) .... institution-scoped.
--   * STUDENTS ARE READ-ONLY on their OWN rows. They have NO write policies anywhere.
--     ALL student-affecting writes (start/submit assessment, upload recording, record
--     answers, log passage exposure, practice & VBB progress) MUST go through server-side
--     service-role code (which bypasses RLS) with validation — never a direct client
--     write — so scores and integrity fields (is_official, attempt_no, status, score)
--     cannot be self-fabricated by a student.
--   * GLOBAL library rows (institution_id IS NULL) are writable by ADMINS ONLY.
--   * reviewers (rcltp.review) may UPDATE recordings, not INSERT them.
--   * PARENT branch deferred (parent_learner_links has no migration here).

-- 6.1 Library content: passages
CREATE POLICY rcltp_passages_read ON rcltp_passages FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR institution_id IS NULL
  OR role_has_institution_access(institution_id)
);
CREATE POLICY rcltp_passages_write ON rcltp_passages FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
);

-- 6.2 Library content: vbb_words (same posture)
CREATE POLICY rcltp_vbb_words_read ON rcltp_vbb_words FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR institution_id IS NULL
  OR role_has_institution_access(institution_id)
);
CREATE POLICY rcltp_vbb_words_write ON rcltp_vbb_words FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
);

-- 6.3 Questions: readable by staff (institution) + the student taking it is gated
--     at the assessment layer; managers write.
-- Student question access is NOT granted here: questions are delivered to the student
-- by server-side service-role code when an assessment is opened (prevents pre-exam
-- enumeration of all institution questions). Staff/global read only.
CREATE POLICY rcltp_pbq_read ON rcltp_part_b_questions FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR institution_id IS NULL
  OR role_has_institution_access(institution_id)
);
CREATE POLICY rcltp_pbq_write ON rcltp_part_b_questions FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
);

-- 6.4 Assessments: staff (institution) read all; student reads own; managers/students write own.
CREATE POLICY rcltp_assess_read ON rcltp_assessments FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.report.view_all') AND role_has_institution_access(institution_id))
  OR (user_has_permission('rcltp.report.view_class') AND role_has_institution_access(institution_id))
  OR (user_has_permission('rcltp.review') AND role_has_institution_access(institution_id))
  OR learner_id = get_my_learner_id()
);
CREATE POLICY rcltp_assess_staff_write ON rcltp_assessments FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);
-- NO student write policy on rcltp_assessments. Start/submit status transitions go
-- through server-side service-role code that sets only permitted columns after verifying
-- learner_id = get_my_learner_id(). A direct student UPDATE would let them flip
-- is_official / attempt_no / status / scores. (Integrity blocker fix.)

-- Helper predicate inlined per table: "is this assessment mine, or do I have staff access to its institution"
-- 6.5 Part A recordings (scoped via parent assessment)
CREATE POLICY rcltp_parta_read ON rcltp_part_a_recordings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.review')))
  OR EXISTS (SELECT 1 FROM rcltp_assessments a WHERE a.id = rcltp_part_a_recordings.assessment_id AND a.learner_id = get_my_learner_id())
);
-- Managers create/manage recordings; reviewers may only UPDATE (review fields), not INSERT.
-- Student audio upload goes through server-side service-role code (no student write policy).
CREATE POLICY rcltp_parta_manage ON rcltp_part_a_recordings FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);
CREATE POLICY rcltp_parta_review_update ON rcltp_part_a_recordings FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.review') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.review') AND role_has_institution_access(institution_id))
);

-- 6.6 Part B responses (scoped via parent assessment)
CREATE POLICY rcltp_pbr_read ON rcltp_part_b_responses FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.review')))
  OR EXISTS (SELECT 1 FROM rcltp_assessments a WHERE a.id = rcltp_part_b_responses.assessment_id AND a.learner_id = get_my_learner_id())
);
-- Student answers are recorded by server-side service-role code (no student write policy),
-- so a student cannot fabricate is_correct/score. Managers manage; reviewers do not INSERT.
CREATE POLICY rcltp_pbr_write ON rcltp_part_b_responses FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.7 Results: staff (institution) + own student read; system/staff write.
CREATE POLICY rcltp_results_read ON rcltp_assessment_results FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')))
  OR learner_id = get_my_learner_id()
);
CREATE POLICY rcltp_results_write ON rcltp_assessment_results FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.8 Band config: staff (institution) read; config managers write.
-- Staff only: students must not read band cutoffs (coaching/gaming vector). Their own
-- band result is in rcltp_assessment_results.
CREATE POLICY rcltp_bandcfg_read ON rcltp_band_config FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.config.manage')))
);
CREATE POLICY rcltp_bandcfg_write ON rcltp_band_config FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.config.manage') AND role_has_institution_access(institution_id))
);

-- 6.9 Student journey: staff (institution) + own student read; staff/system write.
CREATE POLICY rcltp_journey_read ON rcltp_student_journey FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')))
  OR learner_id = get_my_learner_id()
);
CREATE POLICY rcltp_journey_write ON rcltp_student_journey FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.10 Practice assignments: staff (institution) + own student read; student updates own completion.
CREATE POLICY rcltp_practice_read ON rcltp_practice_assignments FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')))
  OR learner_id = get_my_learner_id()
);
-- Managers/system write practice rows. Practice COMPLETION is recorded server-side
-- (service-role) so a student cannot self-mark exercises_completed (drives band progression).
CREATE POLICY rcltp_practice_write ON rcltp_practice_assignments FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.11 Passage exposure: staff (via... ) + own student read; staff/student write own.
CREATE POLICY rcltp_exposure_read ON rcltp_passage_exposure FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR learner_id = get_my_learner_id()
  OR ((user_has_permission('rcltp.report.view_all') OR user_has_permission('rcltp.assessment.manage')) AND role_has_institution_access(institution_id))
);
-- Exposure rows are written server-side when a passage is served (no student write policy).
CREATE POLICY rcltp_exposure_write ON rcltp_passage_exposure FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.12 VBB progress: staff (institution) + own student read; staff/student write.
CREATE POLICY rcltp_vbb_progress_read ON rcltp_vbb_progress FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')))
  OR learner_id = get_my_learner_id()
);
-- VBB progress (score/completion) written server-side (service-role) so students cannot
-- fabricate vocabulary scores that drive band progression.
CREATE POLICY rcltp_vbb_progress_write ON rcltp_vbb_progress FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- 6.13 Schedule: staff (institution) read; assessment managers write.
-- Staff only: students don't read the cycle schedule directly (minor gaming vector).
CREATE POLICY rcltp_schedule_read ON rcltp_assessment_schedule FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (role_has_institution_access(institution_id) AND (
        user_has_permission('rcltp.report.view_all')
     OR user_has_permission('rcltp.report.view_class')
     OR user_has_permission('rcltp.assessment.manage')))
);
CREATE POLICY rcltp_schedule_write ON rcltp_assessment_schedule FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
) WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('rcltp.assessment.manage') AND role_has_institution_access(institution_id))
);

-- ---------------------------------------------------------------------------
-- 7. TABLE COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TABLE rcltp_passages IS 'EKSAQ RCLTP: reading passage bank (institution_id NULL = global/shared). language=v1 english.';
COMMENT ON TABLE rcltp_assessments IS 'EKSAQ RCLTP: one assessment sitting (Part A voice + Part B comprehension).';
COMMENT ON TABLE rcltp_part_a_recordings IS 'EKSAQ RCLTP: Read & Record voice scoring. expression/modulation nullable until prosody/local-language scoring lands.';
COMMENT ON TABLE rcltp_band_config IS 'EKSAQ RCLTP: per-tenant band score cutoffs (CRUDable). Band names are a fixed enum; cutoffs configurable.';
COMMENT ON TABLE rcltp_assessment_results IS 'EKSAQ RCLTP: composite per-sitting result (reading/comprehension/overall bands + prev-vs-current score).';

-- ============================================================================
-- REVIEWER NOTE (BLOCKER from pre-ship review): RLS policies here call the 1-arg
-- user_has_permission(text) overload — the convention used across MyJKKN's existing
-- RLS. That overload lives in supabase/setup/02_functions.sql (NOT a migration), so it
-- exists in production but a CLEAN `supabase db reset` env lacks it. This is a
-- pre-existing platform condition affecting ALL existing RLS, not RCLTP-specific. If a
-- clean-env rebuild (or the standalone Jicate product) is needed, backfill the 1-arg
-- overload as its own migration (precedent: 20260531085000_get_my_learner_id_fn.sql).
-- Deliberately NOT redefining a platform-wide auth function inside this feature migration.
--
-- SPEC GAP (from conformance review): rcltp_consent (voice consent gating Part A, DPDP)
-- is intentionally NOT created here — the assumption-thrash left it OPEN: ride existing
-- parent infra (parent_learner_links.can_view_grades) vs a dedicated table. Decide before
-- the parent/voice phase; tracked as follow-up 20260614000005.
--
-- END Phase A. Follow-ups (separate migrations, same PR series):
--   * 20260614000001 — seed reading competencies into competency_catalog
--   * 20260614000002 — seed rcltp.* permissions + parent_guardian custom_role
--   * 20260614000003 — parent-facing RLS (after parent_learner_links migration backfill)
--   * 20260614000004 — rcltp-audio storage bucket + signed-URL policy
-- ============================================================================
