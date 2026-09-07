-- 20260917111500_onemark_wave1_schema_seeds_roles.sql
--
-- OneMark — Wave 1: schema, seeds and roles for the Tamil Nadu State Board
-- Class-12 one-mark MCQ product (Part-I of the HSC paper), built as an
-- extension of the Foundation module (`fp_*`).
--
-- Rulings of record: specs/onemark-decisions-2026-09-02.md (20 Director
-- decisions, PR #3251). Lane spec: .claude/onemark-wave1-spec.md. Source PRDs:
-- OneMark_Master_PRD_Physics_v2 / OneMark_Master_PRD_English_v2 (2026-08-21).
--
-- VERSION — 20260917111500 is a deliberately distinctive timestamp, checked on
-- 2026-09-02 against all three registers: absent from supabase/migrations/ on
-- jicate/main (the 2026091* files are 20260910100000/110000/110001/120000),
-- absent from supabase_migrations.schema_migrations (read live), and absent
-- from every open PR (scripts/ci/check-migration-version-cross-pr.sh). It is
-- NOT "one tick after the newest" — that arithmetic collided twice on 08-15.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS FILE DOES, IN ORDER
--
--   1. Two subject exam rows under the existing `tn_hsc` umbrella
--      (`tn_hsc_physics`, `tn_hsc_english`) — two rows rather than one row
--      plus a subject column because every fp_ table keys on
--      exam_definition_id. [risky — listed for the Director]
--   2. One `schools` row for Nattraja Vidhyalya CBSE (internal, institution
--      29c221d1-…). `fp_cohorts.school_id` and `fp_students.school_id` are
--      NOT NULL → schools(id) and Nattraja has 0 rows today (read live).
--      Guarded AND reversed on the same (name, institution_id) predicate —
--      `schools` has no UNIQUE beyond its PK (read live), so "any school at
--      this institution" would not have been this row's idempotency key.
--   3. 18 chapter topics in `cdc_exam_syllabus_topics` (11 Physics units,
--      6 English units, 1 cross-unit grammar bucket) + 18 `exam_topic_map`
--      rows. Tamil unit names were sliced programmatically out of PRD
--      Physics §4.1 — never retyped — and still need a native reader.
--   4. Two master tables a subject Senior Learner extends next term:
--      `onemark_item_tags` (13 Physics + 25 English category tags) and
--      `onemark_item_sources` (5 provenance classes).
--   5. Additive columns on `fp_items`: bilingual text, option layout, tags,
--      paper provenance, serve/correct counters.
--   6. `onemark_question_assets` — Physics diagrams / KaTeX blocks per item.
--   7. `onemark_category_weights` — English Q7–Q20 empirical tag frequency.
--   8. `onemark_mistake_vault` — THE table this wave exists for. Per
--      (learner, question), with the session-separated streak the PRD §6.3
--      rule needs. `fp_student_weakness` is a per-topic counter and is NOT
--      the vault; nothing here reads or writes it. RLS: read via
--      fn_fp_can_view_student, write via fn_fp_can_manage_student — the
--      20260706065000 split every sibling PII table uses (a learner never
--      writes their own performance state directly; the Wave 2 SECURITY
--      DEFINER RPC does). [risky — departs from lane spec §8's literal
--      "INSERT/UPDATE via fn_fp_can_view_student"; listed for the Director]
--   9. `fp_attempts.mode` + `session_id`; `fp_responses.skipped`.
--  10. Six `platform_policies` rows (the 20260808180000 idiom) so every
--      number the PRD hard-codes is a one-row UPDATE, not a deploy.
--  11. Two guarded role UPDATEs: `student` gains foundation.practice.take;
--      `school_faculty` gains five more foundation.* keys. No NEW permission
--      keys are minted — every key already exists in the catalog.
--  12. `user_roles` rows giving `school_faculty` to every active Nattraja
--      profile whose role is 'faculty' / 'hod' / 'principal' (30 read live).
--  13. A DO block asserting the end state, so the file cannot land
--      half-applied — including a probe that step 12 minted NO 'associate'
--      JKKN ID (user_roles carries trg_jkkn_auto_issue_associate, which
--      allocates a permanent identity for any profile with no learner_id
--      and no staff-email match and swallows its own failures; 30/30 target
--      profiles match a staff row today, so the expected count is 0).
--
-- TIER: additive + two data UPDATEs on custom_roles + user_roles INSERTs.
-- Creates 5 tables, alters 3 (ADD COLUMN IF NOT EXISTS only), drops nothing,
-- rewrites no existing row except the two role permission maps. Every step
-- is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / WHERE NOT EXISTS /
-- guarded UPDATE), so re-running is a no-op.
--
-- NOT APPLIED by this PR. Rehearsed on production inside BEGIN … ROLLBACK;
-- the orchestrator applies at merge (Chain Flow Rule 1b). This file
-- classifies ASK because of the role UPDATEs — expected.
--
-- Reversible (in this order):
--   DELETE FROM user_roles ur USING profiles p
--     WHERE ur.user_id = p.id AND ur.role_id = 'd2c74371-…' AND ur.is_primary = false
--       AND p.institution_id = '29c221d1-…' AND p.role IN ('faculty','hod','principal')
--       AND ur.assigned_at >= '<apply timestamp>';   -- spares the ONE pre-existing holder
--   DELETE FROM school_jkkn_owners WHERE school_id = (SELECT id FROM schools WHERE name = 'Nattraja Vidhyalya CBSE'
--       AND institution_id = '29c221d1-…') AND role = 'outreach_coordinator' AND assigned_at >= '<apply timestamp>';
--   UPDATE custom_roles SET permissions = permissions - 'foundation.practice.take'
--     WHERE role_key = 'student';
--   UPDATE custom_roles SET permissions = permissions - ARRAY['foundation.dashboard.view',
--     'foundation.assessments.view','foundation.assessments.manage',
--     'foundation.students.view','foundation.students.manage'] WHERE role_key = 'school_faculty';
--   DELETE FROM platform_policies WHERE policy_key LIKE 'onemark.%';
--   ALTER TABLE fp_responses DROP COLUMN skipped;
--   ALTER TABLE fp_attempts DROP COLUMN session_id, DROP COLUMN mode;
--   DROP TABLE onemark_mistake_vault, onemark_category_weights, onemark_question_assets;
--   ALTER TABLE fp_items DROP COLUMN times_correct, … DROP COLUMN stem_ta;
--   DROP TABLE onemark_item_sources, onemark_item_tags;
--   DELETE FROM exam_topic_map WHERE topic_id IN (SELECT id FROM cdc_exam_syllabus_topics WHERE config_key LIKE 'onemark_%');
--   DELETE FROM cdc_exam_syllabus_topics WHERE config_key LIKE 'onemark_%';
--   DELETE FROM schools WHERE name = 'Nattraja Vidhyalya CBSE' AND institution_id = '29c221d1-…';
--   DELETE FROM exam_definitions WHERE config_key IN ('tn_hsc_physics','tn_hsc_english');
-- ─────────────────────────────────────────────────────────────────────────────


-- =============================================================================
-- 1. Two subject exam rows under the `tn_hsc` umbrella.
-- =============================================================================
-- `tn_hsc` (c2d104b1-…, family state_board, level school, sort 7) stays as the
-- umbrella. Physics and English become their own exam_definitions rows because
-- fp_items, fp_assessments, fp_cohorts, fp_student_weakness and the practice
-- pools all key on exam_definition_id — a subject column would have to be
-- threaded through every one of them and every RPC that reads them.
INSERT INTO public.exam_definitions (config_key, display_name, exam_family, level, is_active, sort_order)
VALUES
  ('tn_hsc_physics', 'TN State Board — HSC Physics (Class 12)', 'state_board', 'school', true, 8),
  ('tn_hsc_english', 'TN State Board — HSC English (Class 12)', 'state_board', 'school', true, 9)
ON CONFLICT (config_key) DO NOTHING;


-- =============================================================================
-- 2. Nattraja Vidhyalya CBSE — one `schools` row.
-- =============================================================================
-- Enum label read live 2026-09-02: school_ownership = external | internal.
-- CHECK schools_internal_requires_institution: internal ⇒ institution_id NOT NULL.
-- `status` defaults to 'active', `metadata` to '{}' (read live).
-- Idempotency key = (name, institution_id), the same predicate the header's
-- reversal uses. `schools` has no UNIQUE beyond its PK (read live 2026-09-02),
-- so guarding on institution_id alone would silently bind to any other lane's
-- Nattraja row and leave the documented rollback matching nothing.
INSERT INTO public.schools (name, ownership, institution_id)
SELECT 'Nattraja Vidhyalya CBSE', 'internal'::public.school_ownership, '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.schools
  WHERE name = 'Nattraja Vidhyalya CBSE'
    AND institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
);


-- =============================================================================
-- 3. Chapters: 18 topics + 18 exam_topic_map rows.
-- =============================================================================
-- cdc_exam_syllabus_topics has NO exam column; a chapter is a topic row plus an
-- exam_topic_map row (the 20260706064000 idiom). is_system = true so the CDC
-- admin UI treats them as platform rows; is_shared = false because a Class-12
-- Physics unit belongs to exactly one exam.
--
-- display_name = the English unit title from PRD §4.1. description = the Tamil
-- unit name for Physics (sliced programmatically from the PRD file — every
-- character verified to sit in the Tamil Unicode block — and flagged for
-- native review on each row), or the Prose · Poem · Supplementary line for
-- English. PRD English §4.1 itself says unit numbering "MUST be verified
-- against the current textbook edition" — that check is still owed.
INSERT INTO public.cdc_exam_syllabus_topics (config_key, display_name, description, is_shared, is_system, is_active, sort_order)
SELECT v.config_key, v.display_name, v.description, false, true, true, v.sort_order
FROM (VALUES
  ('onemark_phy_u01', 'Unit 1: Electrostatics', 'மின்னியல் (Vol. 1)', 1),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u02', 'Unit 2: Current Electricity', 'மின்னோட்டவியல் (Vol. 1)', 2),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u03', 'Unit 3: Magnetism and Magnetic Effects of Electric Current', 'காந்தவியல் (Vol. 1)', 3),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u04', 'Unit 4: Electromagnetic Induction and Alternating Current', 'மின்காந்தத் தூண்டல் (Vol. 1)', 4),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u05', 'Unit 5: Electromagnetic Waves', 'மின்காந்த அலைகள் (Vol. 1)', 5),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u06', 'Unit 6: Ray Optics', 'ஒளிக்கதிரியல் (Vol. 2)', 6),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u07', 'Unit 7: Wave Optics', 'அலை ஒளியியல் (Vol. 2)', 7),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u08', 'Unit 8: Dual Nature of Radiation and Matter', 'இரட்டைத் தன்மை (Vol. 2)', 8),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u09', 'Unit 9: Atomic and Nuclear Physics', 'அணு மற்றும் அணுக்கரு இயற்பியல் (Vol. 2)', 9),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u10', 'Unit 10: Electronics and Communication', 'மின்னணுவியல் மற்றும் தகவல் தொடர்பு (Vol. 2)', 10),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_phy_u11', 'Unit 11: Recent Developments in Physics', 'சமீபத்திய வளர்ச்சிகள் (Vol. 2)', 11),  -- needs native review (Tamil copied programmatically from PRD Physics §4.1)
  ('onemark_eng_u01', 'Unit 1: Two Gentlemen of Verona', 'Prose: Two Gentlemen of Verona · Poem: The Castle (Edwin Muir) · Supp: The Midnight Visitor', 1),
  ('onemark_eng_u02', 'Unit 2: A Nice Cup of Tea', 'Prose: A Nice Cup of Tea (George Orwell) · Poem: All the World''s a Stage (Shakespeare) · Supp: God Sees the Truth But Waits', 2),
  ('onemark_eng_u03', 'Unit 3: In Celebration of Being Alive', 'Prose: In Celebration of Being Alive (Dr. Christiaan Barnard) · Poem: A Father to His Son (Carl Sandburg) · Supp: Remember Caesar', 3),
  ('onemark_eng_u04', 'Unit 4: The Summit', 'Prose: The Summit / Everest narrative (Tenzing & Hillary) · Poem: Incident of the French Camp (Browning) · Supp: All Summer in a Day (Ray Bradbury)', 4),
  ('onemark_eng_u05', 'Unit 5: The Chair', 'Prose: The Chair (Ki. Rajanarayanan) · Poem: Our Casuarina Tree (Toru Dutt) · Supp: Life of Pi', 5),
  ('onemark_eng_u06', 'Unit 6: On the Rule of the Road', 'Prose: On the Rule of the Road (A.G. Gardiner) · Poem: Ulysses (Tennyson) · Supp: the Baldwin–Gresham honesty narrative', 6),
  ('onemark_eng_grammar_general', 'Grammar (General) — not anchored to any lesson', 'Grammar_General — not anchored to any lesson', 99)
) AS v(config_key, display_name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cdc_exam_syllabus_topics t WHERE t.config_key = v.config_key
);

INSERT INTO public.exam_topic_map (exam_definition_id, topic_id, sort_order)
SELECT e.id, t.id, t.sort_order
FROM (VALUES
  ('tn_hsc_physics', 'onemark_phy_u01'),
  ('tn_hsc_physics', 'onemark_phy_u02'),
  ('tn_hsc_physics', 'onemark_phy_u03'),
  ('tn_hsc_physics', 'onemark_phy_u04'),
  ('tn_hsc_physics', 'onemark_phy_u05'),
  ('tn_hsc_physics', 'onemark_phy_u06'),
  ('tn_hsc_physics', 'onemark_phy_u07'),
  ('tn_hsc_physics', 'onemark_phy_u08'),
  ('tn_hsc_physics', 'onemark_phy_u09'),
  ('tn_hsc_physics', 'onemark_phy_u10'),
  ('tn_hsc_physics', 'onemark_phy_u11'),
  ('tn_hsc_english', 'onemark_eng_u01'),
  ('tn_hsc_english', 'onemark_eng_u02'),
  ('tn_hsc_english', 'onemark_eng_u03'),
  ('tn_hsc_english', 'onemark_eng_u04'),
  ('tn_hsc_english', 'onemark_eng_u05'),
  ('tn_hsc_english', 'onemark_eng_u06'),
  ('tn_hsc_english', 'onemark_eng_grammar_general')
) AS m(exam_key, topic_key)
JOIN public.exam_definitions e         ON e.config_key = m.exam_key
JOIN public.cdc_exam_syllabus_topics t ON t.config_key = m.topic_key
ON CONFLICT (exam_definition_id, topic_id) DO NOTHING;


-- =============================================================================
-- 4. Two master tables — the vocabulary a subject Senior Learner extends.
-- =============================================================================
-- Decision Q1: category tags and provenance classes are DATA, not enums, so a
-- new tag next term is an INSERT by the subject reviewer, not a migration.
-- Shape follows docs/architecture/config-table-pattern.md's shared mixin
-- (description / is_active / updated_by / change_reason) on top of the
-- spec's key / label / sort_order columns. The pattern's separate audit table
-- and pg_notify trigger are deliberately NOT added here: these are cold-read
-- reference rows (read once when the wizard opens), not hot config.

CREATE TABLE IF NOT EXISTS public.onemark_item_tags (
  key                        text PRIMARY KEY,
  label                      text NOT NULL,
  description                text,
  subject_exam_definition_id uuid REFERENCES public.exam_definitions(id) ON DELETE SET NULL,
  is_system                  boolean NOT NULL DEFAULT true,
  is_active                  boolean NOT NULL DEFAULT true,
  sort_order                 integer NOT NULL DEFAULT 100,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  updated_by                 uuid REFERENCES public.profiles(id),
  change_reason              text
);
COMMENT ON TABLE public.onemark_item_tags IS
  'OneMark category-tag vocabulary (PRD Physics §3.3 Category Filter, PRD English §3.3 / §4.3). One row per tag; fp_items.tags holds these keys. subject_exam_definition_id scopes a tag to one subject exam; NULL = usable by any subject. A subject Senior Learner adds rows next term — no migration. Added 2026-09-02 (OneMark Wave 1).';

CREATE TABLE IF NOT EXISTS public.onemark_item_sources (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.profiles(id),
  change_reason text
);
COMMENT ON TABLE public.onemark_item_sources IS
  'OneMark provenance classes for a question (PRD §3.3 Source Filter): where a one-mark item came from. Distinct from fp_items.source, which records licensed-vs-authored. Added 2026-09-02 (OneMark Wave 1).';

DROP TRIGGER IF EXISTS trg_onemark_item_tags_touch    ON public.onemark_item_tags;
DROP TRIGGER IF EXISTS trg_onemark_item_sources_touch ON public.onemark_item_sources;
CREATE TRIGGER trg_onemark_item_tags_touch    BEFORE UPDATE ON public.onemark_item_tags    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_onemark_item_sources_touch BEFORE UPDATE ON public.onemark_item_sources FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Seeds. Tag keys were extracted programmatically from the two PRDs' §3.3
-- "Category Filter" rows: 13 Physics, 25 English (the English §4.3 frequency
-- table lists 22 of them; synonyms / antonyms are the reserved Q1–Q6 slots and
-- negative_derivation appears only in §4.4 — all three are real tags).
INSERT INTO public.onemark_item_tags (key, label, subject_exam_definition_id, sort_order)
SELECT v.key, v.label, e.id, v.sort_order
FROM (VALUES
  ('numerical_single_step', 'Numerical (single step)', 'tn_hsc_physics', 10),
  ('dimensional_analysis', 'Dimensional analysis', 'tn_hsc_physics', 20),
  ('formula_recall', 'Formula recall', 'tn_hsc_physics', 30),
  ('graph_relationship', 'Graph relationship', 'tn_hsc_physics', 40),
  ('definition_recall', 'Definition recall', 'tn_hsc_physics', 50),
  ('application_field', 'Application field', 'tn_hsc_physics', 60),
  ('fill_in_blank', 'Fill in the blank', 'tn_hsc_physics', 70),
  ('assertion_set', 'Assertion set', 'tn_hsc_physics', 80),
  ('diagram_interpretation', 'Diagram interpretation', 'tn_hsc_physics', 90),
  ('unit_conversion', 'Unit conversion', 'tn_hsc_physics', 100),
  ('comparison_ratio', 'Comparison / ratio', 'tn_hsc_physics', 110),
  ('law_statement', 'Law statement', 'tn_hsc_physics', 120),
  ('device_principle', 'Device principle', 'tn_hsc_physics', 130),
  ('synonyms', 'Synonyms', 'tn_hsc_english', 10),
  ('antonyms', 'Antonyms', 'tn_hsc_english', 20),
  ('phrasal_verbs', 'Phrasal verbs', 'tn_hsc_english', 30),
  ('prepositions', 'Prepositions', 'tn_hsc_english', 40),
  ('prepositional_phrases', 'Prepositional phrases', 'tn_hsc_english', 50),
  ('linkers', 'Linkers', 'tn_hsc_english', 60),
  ('idioms', 'Idioms', 'tn_hsc_english', 70),
  ('abbreviations', 'Abbreviations', 'tn_hsc_english', 80),
  ('american_british_english', 'American / British English', 'tn_hsc_english', 90),
  ('compound_words', 'Compound words', 'tn_hsc_english', 100),
  ('blended_words', 'Blended words', 'tn_hsc_english', 110),
  ('clipped_words', 'Clipped words', 'tn_hsc_english', 120),
  ('prefixes_suffixes', 'Prefixes and suffixes', 'tn_hsc_english', 130),
  ('question_tags', 'Question tags', 'tn_hsc_english', 140),
  ('polite_expressions', 'Polite expressions', 'tn_hsc_english', 150),
  ('spelling', 'Spelling', 'tn_hsc_english', 160),
  ('syllabification', 'Syllabification', 'tn_hsc_english', 170),
  ('determiners_articles', 'Determiners and articles', 'tn_hsc_english', 180),
  ('word_forms', 'Word forms', 'tn_hsc_english', 190),
  ('confusable_words', 'Confusable words', 'tn_hsc_english', 200),
  ('sentence_patterns', 'Sentence patterns', 'tn_hsc_english', 210),
  ('singular_plural', 'Singular / plural', 'tn_hsc_english', 220),
  ('foreign_phrases', 'Foreign phrases', 'tn_hsc_english', 230),
  ('conjunctions', 'Conjunctions', 'tn_hsc_english', 240),
  ('negative_derivation', 'Negative derivation', 'tn_hsc_english', 250)
) AS v(key, label, exam_key, sort_order)
JOIN public.exam_definitions e ON e.config_key = v.exam_key
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.onemark_item_sources (key, label, description, sort_order)
VALUES
  ('textbook_back',   'Textbook back exercise', 'Lifted from the exercise section at the end of a prescribed textbook unit.', 10),
  ('past_board_exam', 'Past board paper',       'A question that appeared in an actual State Board paper (record year, sitting, series and question number on the item).', 20),
  ('district_revision','District revision test','From a district-level revision test paper.', 30),
  ('model_paper',     'Model paper',            'From a published model / sample paper.', 40),
  ('internal',        'Internal',               'Authored in-house (including AI drafts approved by a subject Senior Learner).', 50)
ON CONFLICT (key) DO NOTHING;

-- RLS: reference data — any signed-in user reads; item managers write.
ALTER TABLE public.onemark_item_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onemark_item_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onemark_item_tags_read  ON public.onemark_item_tags;
DROP POLICY IF EXISTS onemark_item_tags_write ON public.onemark_item_tags;
CREATE POLICY onemark_item_tags_read  ON public.onemark_item_tags FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY onemark_item_tags_write ON public.onemark_item_tags FOR ALL
  USING      (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

DROP POLICY IF EXISTS onemark_item_sources_read  ON public.onemark_item_sources;
DROP POLICY IF EXISTS onemark_item_sources_write ON public.onemark_item_sources;
CREATE POLICY onemark_item_sources_read  ON public.onemark_item_sources FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY onemark_item_sources_write ON public.onemark_item_sources FOR ALL
  USING      (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

-- Supabase's default privileges hand `anon` a direct table grant on every new
-- table (read live: anon holds INSERT..TRIGGER on all fp_* tables). Lock it.
REVOKE ALL ON TABLE public.onemark_item_tags    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.onemark_item_sources FROM anon, PUBLIC;


-- =============================================================================
-- 5. fp_items — additive columns. All nullable or defaulted.
-- =============================================================================
-- difficulty (1..5 CHECK) is left in place: decision 6 drops it for OneMark by
-- POLICY (JABT only), not by schema. bloom_level / advanced_dimension were
-- applied 2026-09-02 (20260908034127) and are not touched.
ALTER TABLE public.fp_items
  ADD COLUMN IF NOT EXISTS stem_ta        text,
  ADD COLUMN IF NOT EXISTS options_ta     jsonb,
  ADD COLUMN IF NOT EXISTS explanation_ta text,
  ADD COLUMN IF NOT EXISTS option_layout  text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS tags           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_key     text REFERENCES public.onemark_item_sources(key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_year    integer,
  ADD COLUMN IF NOT EXISTS source_sitting text,
  ADD COLUMN IF NOT EXISTS source_series  text,
  ADD COLUMN IF NOT EXISTS source_qno     integer,
  ADD COLUMN IF NOT EXISTS times_served   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS times_correct  integer NOT NULL DEFAULT 0;

ALTER TABLE public.fp_items DROP CONSTRAINT IF EXISTS chk_fp_items_option_layout;
ALTER TABLE public.fp_items ADD CONSTRAINT chk_fp_items_option_layout
  CHECK (option_layout IN ('auto', 'inline_4', 'inline_2x2', 'stacked'));

COMMENT ON COLUMN public.fp_items.stem_ta        IS 'Tamil rendering of the stem (decision 5: each person picks English or Tamil). NULL = not yet translated.';
COMMENT ON COLUMN public.fp_items.options_ta     IS 'Tamil rendering of the options, same shape and order as options. NULL = not yet translated.';
COMMENT ON COLUMN public.fp_items.explanation_ta IS 'Tamil rendering of the explanation. NULL = not yet translated.';
COMMENT ON COLUMN public.fp_items.option_layout  IS 'How the four options are laid out on paper (PRD Physics §4.3 / English §4.5): auto = compute from the longest option at render time; inline_4 = four across; inline_2x2 = two rows of two; stacked = one per line.';
COMMENT ON COLUMN public.fp_items.tags           IS 'Category tags — keys from onemark_item_tags. Array, so not FK-enforced; the item editor validates against the master table.';
COMMENT ON COLUMN public.fp_items.source_key     IS 'Provenance class — key from onemark_item_sources. Distinct from fp_items.source (licensed-vs-authored).';
COMMENT ON COLUMN public.fp_items.source_year    IS 'Board paper year the item was lifted from (PRD Appendix B.4: provenance is mandatory for past_board_exam).';
COMMENT ON COLUMN public.fp_items.source_sitting IS 'Board sitting, e.g. March / June / September.';
COMMENT ON COLUMN public.fp_items.source_series  IS 'Paper series letter (A / B / C / D) when the source paper had series variants.';
COMMENT ON COLUMN public.fp_items.source_qno     IS 'Question number in the source paper.';
COMMENT ON COLUMN public.fp_items.times_served   IS 'How many times this item has been served to a learner (least-served ordering for the generator top-up pass, PRD §3.4).';
COMMENT ON COLUMN public.fp_items.times_correct  IS 'How many of those serves were answered correctly.';

CREATE INDEX IF NOT EXISTS idx_fp_items_tags_gin ON public.fp_items USING gin (tags);

-- No RLS change: fp_items stays staff-only (fp_items_read / fp_items_write);
-- table-level grants cover columns added later.


-- =============================================================================
-- 6. onemark_question_assets — a diagram or KaTeX block attached to an item.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.onemark_question_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE CASCADE,
  asset_type   text NOT NULL CHECK (asset_type IN ('svg', 'png', 'katex_block')),
  storage_path text,
  alt_text     text,
  sort_order   integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.onemark_question_assets IS
  'A figure (svg / png in storage) or a KaTeX block that renders with a one-mark item — the Physics gate-combination and circuit diagrams (PRD Physics §4.1 Unit 10, C.3). Added 2026-09-02 (OneMark Wave 1).';

CREATE INDEX IF NOT EXISTS idx_onemark_question_assets_item ON public.onemark_question_assets (item_id, sort_order);

DROP TRIGGER IF EXISTS trg_onemark_question_assets_touch ON public.onemark_question_assets;
CREATE TRIGGER trg_onemark_question_assets_touch BEFORE UPDATE ON public.onemark_question_assets FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS mirrors fp_items exactly (predicates copied from pg_policies, read live
-- 2026-09-02): read = super admin OR items.view OR items.manage; write = super
-- admin OR items.manage. An asset is part of the question and carries the
-- same "holds the answer" sensitivity.
ALTER TABLE public.onemark_question_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onemark_question_assets_read  ON public.onemark_question_assets;
DROP POLICY IF EXISTS onemark_question_assets_write ON public.onemark_question_assets;
CREATE POLICY onemark_question_assets_read ON public.onemark_question_assets FOR SELECT USING (
  public.is_super_admin() OR public.user_has_permission('foundation.items.view') OR public.user_has_permission('foundation.items.manage'));
CREATE POLICY onemark_question_assets_write ON public.onemark_question_assets FOR ALL
  USING      (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

REVOKE ALL ON TABLE public.onemark_question_assets FROM anon, PUBLIC;


-- =============================================================================
-- 7. onemark_category_weights — English Q7–Q20 empirical tag frequency.
-- =============================================================================
-- PRD English §4.3: the generator's default proportional mode MUST be seeded
-- from this table, not from a uniform draw over the tag vocabulary. weight =
-- "papers appearing (of 8)" from that table, taken as-is.
CREATE TABLE IF NOT EXISTS public.onemark_category_weights (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE CASCADE,
  tag_key            text NOT NULL REFERENCES public.onemark_item_tags(key) ON DELETE CASCADE,
  weight             numeric NOT NULL CHECK (weight >= 0),
  description        text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES public.profiles(id),
  change_reason      text,
  CONSTRAINT onemark_category_weights_unique UNIQUE (exam_definition_id, tag_key)
);
COMMENT ON TABLE public.onemark_category_weights IS
  'Per-subject empirical weight of each category tag for the proportional generator (PRD English §4.3, Q7–Q20 pool). Seeded with papers-appearing-of-8; a subject Senior Learner re-weights as more papers are ingested. Carries the config-table mixin (description / is_active / updated_by / change_reason) like the two masters — the generator draws only is_active rows. Added 2026-09-02 (OneMark Wave 1).';

DROP TRIGGER IF EXISTS trg_onemark_category_weights_touch ON public.onemark_category_weights;
CREATE TRIGGER trg_onemark_category_weights_touch BEFORE UPDATE ON public.onemark_category_weights FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

INSERT INTO public.onemark_category_weights (exam_definition_id, tag_key, weight)
SELECT e.id, v.tag_key, v.weight
FROM (VALUES
  ('phrasal_verbs', 8),
  ('idioms', 8),
  ('american_british_english', 8),
  ('compound_words', 7),
  ('spelling', 7),
  ('prefixes_suffixes', 7),
  ('abbreviations', 6),
  ('prepositions', 6),
  ('linkers', 6),
  ('polite_expressions', 6),
  ('blended_words', 5),
  ('question_tags', 5),
  ('prepositional_phrases', 5),
  ('confusable_words', 4),
  ('determiners_articles', 3),
  ('word_forms', 3),
  ('clipped_words', 3),
  ('syllabification', 2),
  ('sentence_patterns', 1),
  ('singular_plural', 1),
  ('foreign_phrases', 1),
  ('conjunctions', 1)
) AS v(tag_key, weight)
JOIN public.exam_definitions e ON e.config_key = 'tn_hsc_english'
ON CONFLICT (exam_definition_id, tag_key) DO NOTHING;

-- RLS: same as the tag master.
ALTER TABLE public.onemark_category_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onemark_category_weights_read  ON public.onemark_category_weights;
DROP POLICY IF EXISTS onemark_category_weights_write ON public.onemark_category_weights;
CREATE POLICY onemark_category_weights_read  ON public.onemark_category_weights FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY onemark_category_weights_write ON public.onemark_category_weights FOR ALL
  USING      (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

REVOKE ALL ON TABLE public.onemark_category_weights FROM anon, PUBLIC;


-- =============================================================================
-- 8. onemark_mistake_vault — THE table this wave exists for.
-- =============================================================================
-- One row per (learner, question) the learner has ever got wrong. PRD §6.3 +
-- decisions 9 / 10 / 13 / 18:
--   · a wrong answer inserts the row (or resets an existing one to active,
--     consecutive_correct_count = 0);
--   · a correct answer in a review session bumps consecutive_correct_count
--     ONLY if session_id <> last_correct_session_id AND now() >=
--     next_eligible_at (twice in one sitting counts once — decision 9);
--   · reaching onemark.vault.mastery_streak (policy row, default 2) flips
--     status to mastered and stamps mastered_at — revocable: a later wrong
--     answer puts it back (decision 10);
--   · a SKIPPED item never enters the vault (decision 18).
-- The write path (Wave 2 RPC) enforces those rules; this table only holds the
-- state they need. fp_student_weakness is a per-topic counter and is NOT this.
CREATE TABLE IF NOT EXISTS public.onemark_mistake_vault (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  item_id                   uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE CASCADE,
  consecutive_correct_count integer NOT NULL DEFAULT 0,
  last_correct_session_id   uuid,
  total_wrong               integer NOT NULL DEFAULT 0,
  status                    text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'mastered')),
  mastered_at               timestamptz,
  next_eligible_at          timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onemark_mistake_vault_unique UNIQUE (student_id, item_id)
);
COMMENT ON TABLE public.onemark_mistake_vault IS
  'Spaced-repetition Mistake Vault: per (learner, question) state for PRD §6.3 — session-separated streak (last_correct_session_id), revocable mastery (status / mastered_at), earliest next review (next_eligible_at). Learner performance = PII: read via fn_fp_can_view_student, written via fn_fp_can_manage_student or the Wave 2 SECURITY DEFINER RPC (20260706065000 pattern). NOT fp_student_weakness (a per-topic counter, unrelated). Added 2026-09-02 (OneMark Wave 1).';
COMMENT ON COLUMN public.onemark_mistake_vault.consecutive_correct_count IS 'Correct answers in DISTINCT review sessions since the last wrong answer. Reset to 0 on any wrong answer.';
COMMENT ON COLUMN public.onemark_mistake_vault.last_correct_session_id   IS 'fp_attempts.session_id of the most recent counted correct answer — a second correct in the same session must not count (decision 9).';
COMMENT ON COLUMN public.onemark_mistake_vault.next_eligible_at          IS 'Earliest time the item may be drawn for review again: last counted answer + onemark.vault.min_gap_days.';

CREATE INDEX IF NOT EXISTS idx_onemark_mistake_vault_draw ON public.onemark_mistake_vault (student_id, status, next_eligible_at);
CREATE INDEX IF NOT EXISTS idx_onemark_mistake_vault_item ON public.onemark_mistake_vault (item_id);

DROP TRIGGER IF EXISTS trg_onemark_mistake_vault_touch ON public.onemark_mistake_vault;
CREATE TRIGGER trg_onemark_mistake_vault_touch BEFORE UPDATE ON public.onemark_mistake_vault FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS: READ via fn_fp_can_view_student — it already encodes all four readers:
-- the learner themself, their guardian, the Senior Learner who facilitates
-- their cohort, and the school owner (20260706065000). Reused, not re-derived.
-- WRITE via fn_fp_can_manage_student — the split every sibling PII table in
-- this family uses (fp_attempts / fp_student_weakness / fp_baselines /
-- fp_revision_plans, 20260706065000). The vault's columns (status, streak,
-- mastered_at, next_eligible_at) are DERIVED state the PRD §6.3 rules
-- compute; the learner's own answers reach them only through the Wave 2
-- SECURITY DEFINER RPC (as fn_fp_record_attempt already does for attempts),
-- never by a direct PATCH — otherwise a learner holding only their own JWT
-- could set status='mastered' on every question they got wrong and erase
-- the remediation signal their Senior Learner's dashboard reads. The lane
-- spec's §8 literally said INSERT/UPDATE via fn_fp_can_view_student; this
-- is the deliberate, listed departure (Reviewer B, 2026-09-02). No DELETE
-- policy on purpose: a vault row is reset, never removed, by any client.
ALTER TABLE public.onemark_mistake_vault ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onemark_mistake_vault_select ON public.onemark_mistake_vault;
DROP POLICY IF EXISTS onemark_mistake_vault_insert ON public.onemark_mistake_vault;
DROP POLICY IF EXISTS onemark_mistake_vault_update ON public.onemark_mistake_vault;
CREATE POLICY onemark_mistake_vault_select ON public.onemark_mistake_vault FOR SELECT
  USING (public.fn_fp_can_view_student(student_id));
CREATE POLICY onemark_mistake_vault_insert ON public.onemark_mistake_vault FOR INSERT
  WITH CHECK (public.fn_fp_can_manage_student(student_id));
CREATE POLICY onemark_mistake_vault_update ON public.onemark_mistake_vault FOR UPDATE
  USING (public.fn_fp_can_manage_student(student_id))
  WITH CHECK (public.fn_fp_can_manage_student(student_id));

REVOKE ALL ON TABLE public.onemark_mistake_vault FROM anon, PUBLIC;


-- =============================================================================
-- 9. fp_attempts.mode + session_id · fp_responses.skipped
-- =============================================================================
-- mode: decision 17 — an absent learner sitting the hall paper digitally later
-- is the same fp_assessments row, flagged by mode so the report shows paper vs
-- device. session_id groups one sitting's attempts for the vault's
-- session-separation rule. skipped: decision 18 — an unanswered item at
-- time-out is NOT wrong and must never enter the vault.
ALTER TABLE public.fp_attempts
  ADD COLUMN IF NOT EXISTS mode       text,
  ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE public.fp_attempts DROP CONSTRAINT IF EXISTS chk_fp_attempts_mode;
ALTER TABLE public.fp_attempts ADD CONSTRAINT chk_fp_attempts_mode
  CHECK (mode IS NULL OR mode IN ('practice', 'timed', 'live', 'vault_review'));
COMMENT ON COLUMN public.fp_attempts.mode       IS 'How the attempt was taken: practice (self-paced), timed (clock, auto-submit), live (single-submission hall test taken digitally), vault_review (Mistake Vault draw). NULL on rows that predate OneMark.';
COMMENT ON COLUMN public.fp_attempts.session_id IS 'Groups the attempts of one sitting. The vault compares it with last_correct_session_id so two corrects in one sitting count once (decision 9).';

CREATE INDEX IF NOT EXISTS idx_fp_attempts_session ON public.fp_attempts (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE public.fp_responses
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.fp_responses.skipped IS 'true = the learner did not answer (time ran out or moved on). Not wrong, not right; excluded from the vault and from score (decision 18, PR #2736).';


-- =============================================================================
-- 10. Policies — every number the PRD hard-codes becomes a config row.
-- =============================================================================
-- Global, operational, read server-side via fn_get_policy_int(key, default).
-- Shape copied from 20260808180000_fp_practice_pools.sql.
INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, description,
  data_type, is_system, is_active, classification, publication_state
)
SELECT v.policy_key, 'global', NULL, to_jsonb(v.value), v.description,
       'number', false, true, 'operational', 'published'
FROM (VALUES
  ('onemark.vault.mastery_streak', 2,
   'How many correct answers, each in a SEPARATE review session, retire a question from a learner''s Mistake Vault. Raising it keeps a question in review longer; lowering it lets it out sooner. Default 2 (PRD §6.3, decision 9).'),
  ('onemark.vault.min_gap_days', 2,
   'Minimum days between two review sessions of the same vault question before the second correct answer counts. Raising it spaces reviews further apart. Default 2 (PRD §6.3, decision 9).'),
  ('onemark.vault.max_single_chapter_pct', 60,
   'Cap, as a percentage, on how much of one vault review session may come from a single chapter. When the cap binds the session gets shorter rather than lopsided. Default 60 (decision 13).'),
  ('onemark.timed.default_minutes', 20,
   'Default clock, in minutes, offered when a Senior Learner publishes a timed digital test. The wizard may still override per test (5–180). Default 20 (PRD §3.3).'),
  ('onemark.paper.question_count', 15,
   'Default number of one-mark questions in a generated paper. The board standard is 15 for Physics and 20 for English; the wizard offers 10/15/20/25/50 per paper. Default 15 (PRD §3.3).'),
  ('onemark.paper.max_series', 4,
   'Most series variants (A/B/C/D) a Senior Learner may generate for one hall paper. Default 4 (PRD §3.3, decision 16).')
) AS v(policy_key, value, description)
WHERE NOT EXISTS (
  SELECT 1 FROM platform_policies p
  WHERE p.policy_key = v.policy_key
    AND p.scope_type = 'global'
    AND p.scope_id IS NULL
);


-- =============================================================================
-- 11. Roles — guarded UPDATEs. Director-approved 2026-09-02; still [risky].
-- =============================================================================
-- No new permission KEYS: every key below already exists in the catalog
-- (lib/constants/permissions.ts) and on the school_faculty / student rows as
-- true/false. Only the boolean flips.

-- 11a. `student` (bc56769d-…, 6,643 holders, own-institution scope) may take
--      practice. The practice page shows only the caller's own enrolment;
--      a learner who is not enrolled in a cohort sees an empty page.
UPDATE public.custom_roles
SET permissions = permissions || '{"foundation.practice.take": true}'::jsonb
WHERE role_key = 'student'
  AND NOT ((permissions ->> 'foundation.practice.take')::boolean IS TRUE);

-- 11b. `school_faculty` (d2c74371-…) gains dashboard, assessments (view +
--      manage) and learners (view + manage) so a Senior Learner can build a
--      paper and enrol their own learners. NOT cohorts.manage — that stays
--      with the programme manager.
UPDATE public.custom_roles
SET permissions = permissions || '{
  "foundation.dashboard.view": true,
  "foundation.assessments.view": true,
  "foundation.assessments.manage": true,
  "foundation.students.view": true,
  "foundation.students.manage": true
}'::jsonb
WHERE role_key = 'school_faculty'
  AND NOT (
        (permissions ->> 'foundation.dashboard.view')::boolean     IS TRUE
    AND (permissions ->> 'foundation.assessments.view')::boolean   IS TRUE
    AND (permissions ->> 'foundation.assessments.manage')::boolean IS TRUE
    AND (permissions ->> 'foundation.students.view')::boolean      IS TRUE
    AND (permissions ->> 'foundation.students.manage')::boolean    IS TRUE
  );


-- =============================================================================
-- 12. Senior Learner assignments at Nattraja.
-- =============================================================================
-- Population = active profiles at institution 29c221d1-… whose profiles.role is
-- 'faculty' / 'hod' / 'principal' (24 + 5 + 1 = 30, read live 2026-09-02; 0 of
-- them hold school_faculty today). NOT staff.designation — staff.email matches
-- a profile for only 6 of 44 rows, so the staff table is not the login roster.
-- is_primary = false keeps clear of idx_user_roles_primary_unique (one primary
-- per user); user_roles_unique_assignment UNIQUE (user_id, role_id) is the
-- idempotency key.
INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
SELECT p.id, 'd2c74371-6091-4f9e-b15a-9a5204dbd745'::uuid, false, now()
FROM public.profiles p
WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
  AND p.role IN ('faculty', 'hod', 'principal')
  AND p.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role_id = 'd2c74371-6091-4f9e-b15a-9a5204dbd745'::uuid
  );


-- =============================================================================
-- 12b. School owners — the key to the roster that step 11 alone does not turn.
--      fp_students_insert (20260706063000) requires fn_fp_manages_school(school_id),
--      which is ONLY a school_jkkn_owners row; fn_fp_can_manage_student (the vault's
--      write gate) reads the same table. With no row, only a super admin could enrol
--      at Nattraja and the vault would be unwritable. Seeded: EVERY Nattraja profile
--      with role faculty / hod / principal and is_active — the same 30 people step 12
--      gives school_faculty to — so each Senior Learner can enrol their own learners
--      (Director tap, 2026-09-03 00:1x IST: "All 30 teachers can enrol"). Role
--      outreach_coordinator — program_lead demands a partner id.
--      BLAST RADIUS (read live 2026-09-02, disclosed as [risky] #9): school_jkkn_owners
--      is Schools-Network substrate, not Foundation-local. An owner row also makes
--      user_owns_school(nattraja_school_id) true for these two profiles, which is
--      the predicate on 15 policies over school_contacts / school_contributions /
--      school_sessions / program_partner_schools / schools — scoped to THIS school
--      row by argument, so it is read/write on Nattraja's own school record only,
--      now for all 30 Senior Learners rather than two.
--      It does NOT widen the outreach assignment picker
--      (fn_schools_network_list_assignable_owners): that already admits every
--      faculty / school_faculty / staff holder (Director 2026-07-06), so step 12
--      places all 30 Nattraja Senior Learners there with or without these rows.
INSERT INTO public.school_jkkn_owners (school_id, jkkn_user_id, role, is_active, assigned_at)
SELECT s.id, p.id, 'outreach_coordinator'::public.school_owner_role, true, now()
FROM public.schools s
JOIN public.profiles p ON p.institution_id = s.institution_id AND p.is_active
  AND p.role IN ('faculty', 'hod', 'principal')
  -- school_jkkn_owners.jkkn_user_id REFERENCES auth.users, not profiles. A
  -- PRE-REGISTERED profile (no auth row until first Google sign-in — 13 of
  -- the 30 today, read live 2026-09-03) would raise 23503 and abort the whole
  -- apply. Those Senior Learners still receive school_faculty (user_roles keys
  -- on profiles); their owner row is a follow-up after first sign-in.
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
WHERE s.name = 'Nattraja Vidhyalya CBSE'
  AND s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.school_jkkn_owners o
    WHERE o.school_id = s.id AND o.jkkn_user_id = p.id
  );


-- =============================================================================
-- 13. End-state assertion — raise on any miss so the file cannot land half-applied.
-- =============================================================================
DO $$
DECLARE
  v_exams      int;
  v_schools    int;
  v_topics     int;
  v_maps       int;
  v_tags       int;
  v_sources    int;
  v_weights    int;
  v_policies   int;
  v_vault_uq   int;
  v_student_ok boolean;
  v_sf_ok      boolean;
  v_unassigned int;
  v_associates int;
  v_owners int;
  v_owner_eligible int;
BEGIN
  SELECT count(*) INTO v_exams FROM public.exam_definitions WHERE config_key IN ('tn_hsc_physics', 'tn_hsc_english');
  SELECT count(*) INTO v_schools FROM public.schools
   WHERE name = 'Nattraja Vidhyalya CBSE' AND institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid;
  SELECT count(*) INTO v_topics FROM public.cdc_exam_syllabus_topics WHERE config_key LIKE 'onemark\_%';
  SELECT count(*) INTO v_maps
    FROM public.exam_topic_map m
    JOIN public.cdc_exam_syllabus_topics t ON t.id = m.topic_id
    JOIN public.exam_definitions e ON e.id = m.exam_definition_id
   WHERE t.config_key LIKE 'onemark\_%' AND e.config_key IN ('tn_hsc_physics', 'tn_hsc_english');
  SELECT count(*) INTO v_tags FROM public.onemark_item_tags;
  SELECT count(*) INTO v_sources FROM public.onemark_item_sources;
  SELECT count(*) INTO v_weights FROM public.onemark_category_weights;
  SELECT count(*) INTO v_policies FROM platform_policies
   WHERE scope_type = 'global' AND scope_id IS NULL AND policy_key IN (
     'onemark.vault.mastery_streak', 'onemark.vault.min_gap_days', 'onemark.vault.max_single_chapter_pct',
     'onemark.timed.default_minutes', 'onemark.paper.question_count', 'onemark.paper.max_series');
  SELECT count(*) INTO v_vault_uq FROM pg_constraint
   WHERE conrelid = 'public.onemark_mistake_vault'::regclass AND conname = 'onemark_mistake_vault_unique' AND contype = 'u';
  SELECT (permissions ->> 'foundation.practice.take')::boolean IS TRUE INTO v_student_ok
    FROM public.custom_roles WHERE role_key = 'student';
  SELECT (permissions ->> 'foundation.cohorts.view')::boolean       IS TRUE
     AND (permissions ->> 'foundation.items.view')::boolean         IS TRUE
     AND (permissions ->> 'foundation.items.manage')::boolean       IS TRUE
     AND (permissions ->> 'foundation.practice.take')::boolean      IS TRUE
     AND (permissions ->> 'foundation.dashboard.view')::boolean     IS TRUE
     AND (permissions ->> 'foundation.assessments.view')::boolean   IS TRUE
     AND (permissions ->> 'foundation.assessments.manage')::boolean IS TRUE
     AND (permissions ->> 'foundation.students.view')::boolean      IS TRUE
     AND (permissions ->> 'foundation.students.manage')::boolean    IS TRUE
    INTO v_sf_ok
    FROM public.custom_roles WHERE role_key = 'school_faculty';
  SELECT count(*) INTO v_unassigned
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p.id AND ur.role_id = 'd2c74371-6091-4f9e-b15a-9a5204dbd745'::uuid);
  -- Step 12 fires trg_jkkn_auto_issue_associate (20260827110000) once per
  -- user_roles row. It mints a PERMANENT 'associate' JKKN ID for any profile
  -- with no learner_id and no staff-email match, and swallows its own errors.
  -- Read live 2026-09-02: 30/30 target profiles match a staff row and 0 hold
  -- any identity → expected 0. Raising here rolls the mint back with the
  -- rest of the file; the header's reversal alone would not undo it.
  SELECT count(*) INTO v_associates
    FROM public.profiles p
    JOIN public.jkkn_identities i ON i.profile_id = p.id AND i.person_kind = 'associate'
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND i.issued_at >= transaction_timestamp();   -- ONLY identities minted by THIS apply (P4)
  SELECT count(*) INTO v_owner_eligible
    FROM public.profiles p
   WHERE p.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND p.role IN ('faculty', 'hod', 'principal') AND p.is_active
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  SELECT count(*) INTO v_owners
    FROM public.school_jkkn_owners o
    JOIN public.schools s ON s.id = o.school_id
   WHERE s.name = 'Nattraja Vidhyalya CBSE' AND s.institution_id = '29c221d1-b918-4c46-9d67-857273b0b553'::uuid
     AND o.is_active;

  IF v_owners < v_owner_eligible OR v_owners < 2 THEN RAISE EXCEPTION 'onemark wave1: expected an active school_jkkn_owners row for each of the % signed-in Senior Learner logins at Nattraja (and at least 2), found %', v_owner_eligible, v_owners; END IF;
  IF v_exams <> 2      THEN RAISE EXCEPTION 'onemark wave1: expected 2 subject exam rows, found %', v_exams; END IF;
  IF v_schools < 1     THEN RAISE EXCEPTION 'onemark wave1: no ''Nattraja Vidhyalya CBSE'' schools row at institution 29c221d1'; END IF;
  IF v_topics < 18     THEN RAISE EXCEPTION 'onemark wave1: expected >= 18 onemark_ topics, found %', v_topics; END IF;
  IF v_maps < 18       THEN RAISE EXCEPTION 'onemark wave1: expected >= 18 exam_topic_map rows, found %', v_maps; END IF;
  IF v_tags < 38       THEN RAISE EXCEPTION 'onemark wave1: expected >= 38 item tags, found %', v_tags; END IF;
  IF v_sources < 5     THEN RAISE EXCEPTION 'onemark wave1: expected >= 5 item sources, found %', v_sources; END IF;
  IF v_weights < 22    THEN RAISE EXCEPTION 'onemark wave1: expected >= 22 category weights, found %', v_weights; END IF;
  IF v_policies <> 6   THEN RAISE EXCEPTION 'onemark wave1: expected 6 onemark.* policies, found %', v_policies; END IF;
  IF v_vault_uq <> 1   THEN RAISE EXCEPTION 'onemark wave1: onemark_mistake_vault UNIQUE (student_id, item_id) missing'; END IF;
  IF NOT COALESCE(v_student_ok, false) THEN RAISE EXCEPTION 'onemark wave1: student role lacks foundation.practice.take'; END IF;
  IF NOT COALESCE(v_sf_ok, false)      THEN RAISE EXCEPTION 'onemark wave1: school_faculty lacks one of the 9 foundation.* keys'; END IF;
  IF v_unassigned <> 0 THEN RAISE EXCEPTION 'onemark wave1: % Nattraja profiles still lack school_faculty', v_unassigned; END IF;
  IF v_associates <> 0 THEN RAISE EXCEPTION 'onemark wave1: step 12 would leave % Nattraja faculty/hod/principal profile(s) holding an ''associate'' JKKN ID (trg_jkkn_auto_issue_associate) — a profile has no staff-email match; fix the staff row first', v_associates; END IF;

  RAISE NOTICE 'onemark wave1 end state OK: exams=% schools=% topics=% maps=% tags=% sources=% weights=% policies=% associates_minted=%',
    v_exams, v_schools, v_topics, v_maps, v_tags, v_sources, v_weights, v_policies, v_associates;
END $$;
