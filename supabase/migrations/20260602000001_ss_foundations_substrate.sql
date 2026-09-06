-- ============================================================================
-- Startup Studio — Foundations (Level 0) substrate  [PR-1]
-- Spec:  specs/startup-studio-foundations-level0-spec-2026-06-01.md  (incl. §16 assumption-thrash)
-- Date:  2026-06-02
--
-- Extends the EXISTING sf100 worksheet engine pattern (sf100_exercises.fields JSONB +
-- sf100_exercise_responses.response_data JSONB + the sf100-exercise-form renderer) into a
-- studio-native Level-0 on-ramp. No parallel mechanism invented.
--
-- ✓ STEP-0 VERIFIED against live prod (kvizhngldtiuufknvehv) 2026-06-22 via Supabase Management API:
--   1. ✓ sf100_exercises.fields JSONB + sf100_exercise_responses.response_data JSONB shapes match.
--   2. ✓ institutions(id), profiles(id), ss_mentors(id) all PK = id.
--   3. ✓ fn_get_policy_int(p_key text, p_default int, p_scope_id uuid DEFAULT NULL) exists — 2-arg call valid.
--   4. platform_policies real shape = (policy_key, value JSONB, scope_type, scope_id, data_type).
--      Graduation % NOT seeded — fn_get_policy_int returns its p_default (80) when no row exists, so the
--      default applies at runtime with zero seed. Set a custom threshold later via the policy admin UI.
--   5. updated_at maintained by the service layer (BaseService) — no DB trigger added (keeps migration minimal).
--   FIX applied: RLS join used ss_mentors.profile_id (nonexistent) → corrected to ss_mentors.user_id (→ profiles.id).
--
-- Decisions encoded (spec §16): #1 studio-native · #2 one canon set (cohort override) · #3 submit=complete
-- (review=quality flag) · #4 both enrol paths · #5 snapshot field-schema · #6 versioned resubmit ·
-- #7 best-effort review status · #8 private RLS · #9 facilitator proxy-fill · #12 per-student-GLOBAL completion.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COHORTS — a group running Foundations (a class, a club, a college intake)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_foundations_cohorts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  academic_year   TEXT,
  lead_mentor_id  UUID REFERENCES ss_mentors(id),
  enrollment_mode TEXT NOT NULL DEFAULT 'both'   CHECK (enrollment_mode IN ('facilitator','self','both')), -- #4
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  starts_on       DATE,
  ends_on         DATE,
  created_by      UUID REFERENCES profiles(id),  -- the facilitator (used by RLS facilitator-scope)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. ENROLLMENTS — one row per (cohort, student). A student MAY join several cohorts (#4);
--    completion is computed per-student-GLOBAL (#12), NOT derived from a single enrollment row.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_foundations_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id    UUID NOT NULL REFERENCES ss_foundations_cohorts(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_via TEXT NOT NULL DEFAULT 'facilitator' CHECK (enrolled_via IN ('facilitator','self')), -- #4
  status       TEXT NOT NULL DEFAULT 'active'      CHECK (status IN ('active','completed','withdrawn')),
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by  UUID REFERENCES profiles(id),       -- facilitator who added them (NULL for self-enrol)
  UNIQUE (cohort_id, student_id)
);

-- ----------------------------------------------------------------------------
-- 3. WORKSHEETS — twin of sf100_exercises (#1). cohort_id NULL = global canon (the 18 book worksheets);
--    a non-null cohort_id = a cohort-specific override (#2). fields JSONB EXTENDS the sf100 type union
--    with matrix / markdown / image (#11 — renderer support lands in PR-2).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_foundations_worksheets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id   UUID REFERENCES ss_foundations_cohorts(id) ON DELETE CASCADE,   -- NULL = canon
  session_no  INTEGER NOT NULL,
  strand      TEXT NOT NULL CHECK (strand IN ('mindset','ideation','evaluation','model','pitch','reflection')),
  title       TEXT NOT NULL,
  description TEXT,
  fields      JSONB NOT NULL DEFAULT '[]',
  -- field schema (superset of sf100_exercises.fields):
  -- [{ id, type: 'text'|'textarea'|'select'|'radio'|'number'|'scale'|'matrix'|'markdown'|'image',
  --    label, required, options?, placeholder?, columns? (matrix), content? (markdown), scale_max? }]
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. RESPONSES — keyed to the STUDENT, not the enrollment (#12 → global completion).
--    fields_snapshot freezes the worksheet's questions at submit-time (#5).
--    status: submit ⇒ counts for completion; reviewed = separate quality flag (#3,#7).
--    submitted_by may differ from student_id when a facilitator proxies (#9).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_foundations_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id    UUID NOT NULL REFERENCES ss_foundations_worksheets(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES ss_foundations_cohorts(id) ON DELETE SET NULL, -- context where done (nullable)
  response_data   JSONB NOT NULL DEFAULT '{}',
  fields_snapshot JSONB NOT NULL DEFAULT '[]',  -- #5 questions as-answered
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed')),
  current_version INTEGER NOT NULL DEFAULT 1,    -- #6
  submitted_by    UUID REFERENCES profiles(id),  -- actual typer (proxy-aware, #9)
  submitted_at    TIMESTAMPTZ,
  -- mentor quality flag (#3,#7) — does NOT gate completion or progression
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  mentor_feedback TEXT,
  mentor_rating   INTEGER CHECK (mentor_rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worksheet_id, student_id)   -- #12: one canonical response per student per worksheet
);

-- ----------------------------------------------------------------------------
-- 5. RESPONSE VERSIONS — append-only history of resubmits (#6). Latest lives on the response row.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ss_foundations_response_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id     UUID NOT NULL REFERENCES ss_foundations_responses(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  response_data   JSONB NOT NULL,
  fields_snapshot JSONB NOT NULL DEFAULT '[]',
  submitted_by    UUID REFERENCES profiles(id),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (response_id, version)
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ssf_enroll_cohort     ON ss_foundations_enrollments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_ssf_enroll_student    ON ss_foundations_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_ssf_worksheets_cohort ON ss_foundations_worksheets(cohort_id);
CREATE INDEX IF NOT EXISTS idx_ssf_worksheets_canon  ON ss_foundations_worksheets(session_no) WHERE cohort_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ssf_resp_student      ON ss_foundations_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_ssf_resp_worksheet    ON ss_foundations_responses(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_ssf_resp_status       ON ss_foundations_responses(status);
CREATE INDEX IF NOT EXISTS idx_ssf_respver_response  ON ss_foundations_response_versions(response_id);

-- ----------------------------------------------------------------------------
-- RLS  (#8 private: student + their mentor/reviewer + cohort facilitator)
-- Convention note: sf100_exercise_responses uses `SELECT TO authenticated USING(true)` and enforces
-- scope in the service layer. Foundations TIGHTENS this for responses per decision #8. Worksheets/cohorts
-- stay broadly readable (canon content is not sensitive). service_role retains ALL for server routes.
-- ⚠ Step 0: confirm a SQL-side permission helper exists (e.g. fn_has_permission(uid,key)); if the module
--   relies on service-layer permission checks instead, keep the owner/cohort policies below and gate
--   manage/review in the API routes (matches existing startup-studio convention).
-- ----------------------------------------------------------------------------
ALTER TABLE ss_foundations_cohorts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_foundations_enrollments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_foundations_worksheets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_foundations_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_foundations_response_versions  ENABLE ROW LEVEL SECURITY;

-- service_role: full access (server API routes run as service_role)
CREATE POLICY ssf_cohorts_service     ON ss_foundations_cohorts           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ssf_enroll_service      ON ss_foundations_enrollments       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ssf_worksheets_service  ON ss_foundations_worksheets        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ssf_responses_service   ON ss_foundations_responses         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ssf_respver_service     ON ss_foundations_response_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- cohorts + worksheets + enrollments: authenticated may read (catalog/roster); writes via service_role/manage perm
CREATE POLICY ssf_cohorts_select      ON ss_foundations_cohorts     FOR SELECT TO authenticated USING (true);
CREATE POLICY ssf_worksheets_select   ON ss_foundations_worksheets  FOR SELECT TO authenticated USING (true);
CREATE POLICY ssf_enroll_select       ON ss_foundations_enrollments FOR SELECT TO authenticated USING (true);

-- responses: PRIVATE (#8). Student sees own; proxy typer sees own; reviewer sees what they reviewed;
-- facilitator sees responses of students enrolled in a cohort they created.
CREATE POLICY ssf_responses_select ON ss_foundations_responses
  FOR SELECT TO authenticated
  USING (
    student_id   = auth.uid()
    OR submitted_by = auth.uid()
    OR reviewed_by  = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM ss_foundations_enrollments e
      JOIN ss_foundations_cohorts c ON c.id = e.cohort_id
      WHERE e.student_id = ss_foundations_responses.student_id
        AND (c.created_by = auth.uid() OR c.lead_mentor_id IN (
              SELECT m.id FROM ss_mentors m WHERE m.user_id = auth.uid()  -- Step-0 verified 2026-06-22: ss_mentors.user_id → profiles(id); profiles.id == auth.uid()
            ))
    )
  );

-- student (or facilitator proxy) writes own response
CREATE POLICY ssf_responses_insert ON ss_foundations_responses
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY ssf_responses_update ON ss_foundations_responses
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR student_id = auth.uid())
  WITH CHECK (submitted_by = auth.uid() OR student_id = auth.uid());

-- version history readable by whoever can read the parent response (mirrors via EXISTS); insert via service_role
CREATE POLICY ssf_respver_select ON ss_foundations_response_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ss_foundations_responses r WHERE r.id = response_id AND r.student_id = auth.uid()));

-- ============================================================================
-- SEED — 8 Phase-1 canon worksheets (cohort_id NULL). Idempotent (skip if title already canon-seeded).
-- Uses only field types in the sf100 union for now; matrix/markdown/image arrive with PR-2 renderer +
-- the P2 worksheets that need them. Graduation threshold read at runtime via
-- fn_get_policy_int('startup_studio.foundations_graduation_pct', 80) — NOT seeded here (platform_policies
-- column-shape drift; seed via policy admin UI after Step-0 confirmation; default 80 applies meanwhile).
-- ============================================================================
DO $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM ss_foundations_worksheets WHERE cohort_id IS NULL) INTO v_exists;
  IF v_exists THEN
    RAISE NOTICE 'Foundations canon worksheets already present — skipping seed.';
    RETURN;
  END IF;

  INSERT INTO ss_foundations_worksheets (cohort_id, session_no, strand, title, description, sort_order, is_required, fields) VALUES

  (NULL, 1, 'mindset', 'About Me', 'Who are you as a builder? Be honest — there are no wrong answers.', 1, true,
   '[{"id":"name","type":"text","label":"Your name","required":true},
     {"id":"class_year","type":"text","label":"Your class / year","required":true},
     {"id":"school","type":"text","label":"Your school / college","required":true},
     {"id":"good_at","type":"textarea","label":"I am good at...","required":true,"placeholder":"e.g. building, designing, talking to people, coding"},
     {"id":"want_to_learn","type":"textarea","label":"3 things I want to learn here","required":true},
     {"id":"hobbies","type":"text","label":"My hobbies","required":false}]'::jsonb),

  (NULL, 3, 'mindset', 'What Kind of Founder Are You?', 'Two forces shape every founder: the urge to CREATE and the urge to SCALE. Rate yourself, then place yourself.', 2, true,
   '[{"id":"passion_to_create","type":"scale","label":"How strong is your urge to BUILD/CREATE new things? (1-10)","required":true,"scale_max":10},
     {"id":"love_for_scale","type":"scale","label":"How strong is your urge to GROW something big? (1-10)","required":true,"scale_max":10},
     {"id":"belong","type":"radio","label":"Where do you belong right now?","required":true,"options":["Innovator / Designer (high create, low scale)","Team Leader (low create, high scale)","Innovative Institution Builder (high create, high scale)","Normal CEO (low create, low scale)"]},
     {"id":"why","type":"textarea","label":"Why did you place yourself there?","required":true}]'::jsonb),

  (NULL, 4, 'ideation', 'The 5 Whys', 'Pick a problem you care about. Ask WHY five times to reach its real root.', 3, true,
   '[{"id":"problem","type":"textarea","label":"The problem","required":true},
     {"id":"why1","type":"textarea","label":"Why? (1)","required":true},
     {"id":"why2","type":"textarea","label":"Why? (2)","required":true},
     {"id":"why3","type":"textarea","label":"Why? (3)","required":true},
     {"id":"why4","type":"textarea","label":"Why? (4)","required":true},
     {"id":"why5","type":"textarea","label":"Why? (5)","required":true},
     {"id":"revealed","type":"textarea","label":"What did the 5 Whys reveal that you did not see before?","required":true}]'::jsonb),

  (NULL, 4, 'ideation', '6 Thinking Hats', 'Look at your idea through six different hats — one at a time.', 4, true,
   '[{"id":"white","type":"textarea","label":"WHITE hat — the facts. What do we actually know?","required":true},
     {"id":"red","type":"textarea","label":"RED hat — feelings. What is your gut reaction?","required":true},
     {"id":"black","type":"textarea","label":"BLACK hat — caution. What could go wrong?","required":true},
     {"id":"yellow","type":"textarea","label":"YELLOW hat — benefits. Why might this work?","required":true},
     {"id":"green","type":"textarea","label":"GREEN hat — new ideas. What else could you try?","required":true},
     {"id":"blue","type":"textarea","label":"BLUE hat — the plan. What is your next step?","required":true}]'::jsonb),

  (NULL, 4, 'ideation', 'SCAMPER Your Idea', 'Improve your idea by running it through seven lenses.', 5, true,
   '[{"id":"substitute","type":"textarea","label":"SUBSTITUTE — what could you swap out?","required":true},
     {"id":"combine","type":"textarea","label":"COMBINE — what could you merge together?","required":true},
     {"id":"adapt","type":"textarea","label":"ADAPT — what could you borrow from elsewhere?","required":true},
     {"id":"modify","type":"textarea","label":"MODIFY — what could you make bigger or smaller?","required":true},
     {"id":"put_to_use","type":"textarea","label":"PUT TO OTHER USE — where else could this work?","required":true},
     {"id":"eliminate","type":"textarea","label":"ELIMINATE — what could you remove?","required":true},
     {"id":"reverse","type":"textarea","label":"REVERSE — what if you did the opposite?","required":true}]'::jsonb),

  (NULL, 5, 'evaluation', 'Is It a Good Idea? (DFV)', 'Score your idea on three things: do people WANT it, CAN you build it, will it LAST?', 6, true,
   '[{"id":"desirability","type":"scale","label":"DESIRABILITY — do people really want this? (1-5)","required":true,"scale_max":5},
     {"id":"desirability_why","type":"textarea","label":"Why that score?","required":true},
     {"id":"feasibility","type":"scale","label":"FEASIBILITY — can you actually build it? (1-5)","required":true,"scale_max":5},
     {"id":"feasibility_why","type":"textarea","label":"Why that score?","required":true},
     {"id":"viability","type":"scale","label":"VIABILITY — can it survive long-term? (1-5)","required":true,"scale_max":5},
     {"id":"viability_why","type":"textarea","label":"Why that score?","required":true}]'::jsonb),

  (NULL, 6, 'model', 'Your Core Value Proposition', 'Say what your idea does in one clear sentence.', 7, true,
   '[{"id":"who","type":"text","label":"We help [WHO]...","required":true,"placeholder":"e.g. small clinics"},
     {"id":"do_what","type":"text","label":"...do [WHAT]...","required":true,"placeholder":"e.g. fill empty appointment slots"},
     {"id":"by_doing","type":"text","label":"...by doing [HOW].","required":true,"placeholder":"e.g. sending patients to nearby open clinics"}]'::jsonb),

  (NULL, 18, 'reflection', 'My Growth in Foundations', 'Look back at your journey through Foundations.', 8, true,
   '[{"id":"learned","type":"textarea","label":"What did you learn that you did not know before?","required":true},
     {"id":"grown","type":"textarea","label":"How have you grown as a founder?","required":true}]'::jsonb);

  RAISE NOTICE 'Seeded 8 Foundations canon worksheets.';
END $$;

-- ============================================================================
-- COMPANION CHANGES (not SQL — PR-1 also includes, per chain gates):
--   • lib/constants/permissions.ts  → add under the Startup Studio category:
--       startup_studio.foundations.view  / .manage / .review   (catalog-sync gate)
--   • lib/constants/table-module-map.ts → map the 5 ss_foundations_* tables to 'Startup Studio'
--       (permission-audit-coverage gate, runs inside npm run build)
-- ============================================================================
