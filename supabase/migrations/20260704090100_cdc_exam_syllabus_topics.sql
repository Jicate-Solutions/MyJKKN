-- =====================================================================
-- CDC Government-Job-Readiness Track — PR-4: shared-syllabus grouping
-- =====================================================================
-- Date: 2026-07-04
-- Source spec: specs/cdc-govt-jobs-readiness-2026-07-04.md
--   (Director decision #2 — LOCKED: build BOTH label AND group.
--    Option B is COMMITTED, not contingent.)
--
-- Additive + idempotent. NOT applied to prod by this build (draft PR).
--
-- WHAT THIS MIGRATION DOES (PR-4, Option B — the grouping mechanism):
--   1. cdc_exam_syllabus_topics — a NEW config-master (shape mirrors
--      cdc_offer_types / the 20260621T0100Z masters EXACTLY) carrying one
--      extra flag: is_shared boolean. A topic with is_shared=true is part
--      of the syllabus common to multiple government exams; is_shared=false
--      is domain-specific. The CDC head curates these rows via the generic
--      /cdc/admin master UI.
--   2. cdc_exam_topic_map — the ONE genuinely-new relational table: a light
--      many-to-many junction (exam_training_type_id → cdc_training_types,
--      topic_id → cdc_exam_syllabus_topics). A M:N topic↔exam mapping
--      cannot be expressed as a flat config value-list, which is what
--      justifies this table (spec §4b). It is what makes "one coaching
--      cohort provably serves multiple exams" a COMPUTED fact (shared
--      topics span multiple exams) rather than a claim.
--   3. Seed a starter topic set + topic↔exam map so the cohort-overlap
--      view has data on day one.
--
-- ⚠️ NO literal 60/40 anywhere. The shared-vs-domain split is derived at
--    read time from the is_shared flags on the mapped topics — it moves
--    when the CDC head edits the rows. This migration hardcodes no
--    percentage. (spec §1 — the ~60/40 is an unverified transcript
--    estimate; only the DATA, never a constant, expresses the split.)
--
-- RLS: authenticated read (auth.uid() IS NOT NULL); write restricted to
--   public.is_cdc_head_or_super() — identical to every other CDC master.
--   Both tables are platform-global config (no institution_id), like the
--   existing masters. Anon is inherently excluded (no auth.uid()).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Config-master: syllabus topics. Shape mirrors cdc_offer_types + one flag.
CREATE TABLE IF NOT EXISTS public.cdc_exam_syllabus_topics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,
  display_name  text NOT NULL,
  description   text,
  -- is_shared: TRUE = topic common across government exams (the "shared
  -- syllabus"); FALSE = domain-specific. Drives the data-driven overlap
  -- computation in the cohort-overlap view. No % is stored — the split is
  -- COUNT(is_shared) vs COUNT(*) over the mapped topics.
  is_shared     boolean NOT NULL DEFAULT false,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id),
  updated_by    uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_exam_syllabus_topics_config_key_unique UNIQUE (config_key)
);

COMMENT ON TABLE public.cdc_exam_syllabus_topics IS
  'CDC config-master: government-exam syllabus topics. is_shared marks topics common across exams (drives the data-driven overlap view). Added 2026-07-04 (govt-job-readiness PR-4 / Option B).';

-- Light junction: which topics belong to which government-exam type.
-- The only genuinely-new relational table in the track (M:N cannot be a
-- flat config value-list). ON DELETE CASCADE so removing a topic or a
-- training-type cleans up its mappings automatically.
CREATE TABLE IF NOT EXISTS public.cdc_exam_topic_map (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_training_type_id  uuid NOT NULL REFERENCES public.cdc_training_types(id) ON DELETE CASCADE,
  topic_id               uuid NOT NULL REFERENCES public.cdc_exam_syllabus_topics(id) ON DELETE CASCADE,
  sort_order             integer NOT NULL DEFAULT 100,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id),
  updated_by             uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_exam_topic_map_unique UNIQUE (exam_training_type_id, topic_id)
);

COMMENT ON TABLE public.cdc_exam_topic_map IS
  'CDC junction: maps government-exam training types (cdc_training_types where exam_family IS NOT NULL) to syllabus topics (cdc_exam_syllabus_topics). Powers the cohort-overlap view. Added 2026-07-04 (govt-job-readiness PR-4 / Option B).';

CREATE INDEX IF NOT EXISTS idx_cdc_exam_topic_map_exam  ON public.cdc_exam_topic_map (exam_training_type_id);
CREATE INDEX IF NOT EXISTS idx_cdc_exam_topic_map_topic ON public.cdc_exam_topic_map (topic_id);

-- ---------------------------------------------------------------------
-- 2. TRIGGERS — canonical updated_at touch (same _touch_updated_at fn).
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_cdc_exam_syllabus_topics_touch ON public.cdc_exam_syllabus_topics;
DROP TRIGGER IF EXISTS trg_cdc_exam_topic_map_touch       ON public.cdc_exam_topic_map;

CREATE TRIGGER trg_cdc_exam_syllabus_topics_touch BEFORE UPDATE ON public.cdc_exam_syllabus_topics FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_cdc_exam_topic_map_touch       BEFORE UPDATE ON public.cdc_exam_topic_map       FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. SEED — starter topic set. config_keys stable; display_names editable.
--    Shared topics (is_shared=true) are the cross-exam common syllabus;
--    domain topics (is_shared=false) are exam-family-specific.
-- ---------------------------------------------------------------------

INSERT INTO public.cdc_exam_syllabus_topics (config_key, display_name, is_shared, is_system, sort_order) VALUES
  -- Shared across government exams
  ('general_knowledge',    'General Knowledge & Current Affairs', true,  true, 10),
  ('quantitative_aptitude','Quantitative Aptitude',               true,  true, 20),
  ('logical_reasoning',    'Logical Reasoning',                   true,  true, 30),
  ('general_english',      'General English',                     true,  true, 40),
  ('general_science',      'General Science',                     true,  true, 50),
  ('indian_polity',        'Indian Polity & Constitution',        true,  true, 60),
  ('indian_history',       'Indian History',                      true,  true, 70),
  ('geography',            'Indian & World Geography',            true,  true, 80),
  -- Domain-specific
  ('tamil_language',       'Tamil Language & Eligibility Test',   false, true, 110),
  ('tn_history_polity',    'Tamil Nadu History, Polity & Schemes',false, true, 120),
  ('banking_awareness',    'Banking & Financial Awareness',       false, true, 130),
  ('computer_aptitude',    'Computer Aptitude',                   false, true, 140),
  ('railway_gk',           'Railways General Awareness',          false, true, 150),
  ('physical_efficiency',  'Physical Efficiency & Police Law',    false, true, 160)
ON CONFLICT (config_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. SEED — topic↔exam mapping. Data-driven, idempotent.
--    (a) Every SHARED topic maps to every government-exam type — this is
--        what makes a single coaching cohort provably serve multiple exams.
--    (b) DOMAIN topics map only to the exams that need them.
--    The seed references PR-1's govt-exam types by config_key (stable).
--    Safe to run before/after PR-1: if the types are absent, the joins
--    simply insert nothing.
-- ---------------------------------------------------------------------

-- (a) shared topics → all government-exam training types
INSERT INTO public.cdc_exam_topic_map (exam_training_type_id, topic_id, sort_order)
SELECT tt.id, tp.id, tp.sort_order
FROM public.cdc_training_types tt
JOIN public.cdc_exam_syllabus_topics tp ON tp.is_shared = true
WHERE tt.exam_family IS NOT NULL
ON CONFLICT (exam_training_type_id, topic_id) DO NOTHING;

-- (b) domain topics → selected exams (explicit pairs by config_key)
INSERT INTO public.cdc_exam_topic_map (exam_training_type_id, topic_id, sort_order)
SELECT tt.id, tp.id, tp.sort_order
FROM (VALUES
  ('tnpsc_group2',  'tamil_language'),
  ('tnpsc_group2',  'tn_history_polity'),
  ('tnpsc_group4',  'tamil_language'),
  ('tnpsc_group4',  'tn_history_polity'),
  ('tnusrb_police', 'tamil_language'),
  ('tnusrb_police', 'tn_history_polity'),
  ('tnusrb_police', 'physical_efficiency'),
  ('ibps_po_clerk', 'banking_awareness'),
  ('ibps_po_clerk', 'computer_aptitude'),
  ('sbi_po_clerk',  'banking_awareness'),
  ('sbi_po_clerk',  'computer_aptitude'),
  ('rrb_ntpc',      'railway_gk')
) AS m(exam_key, topic_key)
JOIN public.cdc_training_types       tt ON tt.config_key = m.exam_key
JOIN public.cdc_exam_syllabus_topics tp ON tp.config_key = m.topic_key
ON CONFLICT (exam_training_type_id, topic_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. RLS — authenticated read, write restricted to CDC Head / super-admin.
-- ---------------------------------------------------------------------
-- READ SCOPE (intentional): SELECT USING (auth.uid() IS NOT NULL) grants read
-- to any authenticated user. This is DELIBERATE and matches the canonical CDC
-- config-master public-read pattern — cdc_drive_types / cdc_offer_types /
-- cdc_training_types / cdc_workshop_types all use the identical
-- `auth.uid() IS NOT NULL` read policy (see
-- 20260518_cdc_substrate_01_masters_enums_roles_policies.sql lines 442-446 and
-- 20260621T0100Z_cdc_config_masters.sql). Both tables here hold platform-global
-- config (no institution_id, no learner PII) — the syllabus topic catalogue and
-- its topic↔exam map — so there is no cross-tenant data to leak; scoping reads
-- to a permission would only diverge from the four sibling masters for no
-- security gain. Write is the real boundary and is gated to is_cdc_head_or_super().
-- ---------------------------------------------------------------------

ALTER TABLE public.cdc_exam_syllabus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_exam_topic_map       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_exam_syllabus_topics_read"  ON public.cdc_exam_syllabus_topics;
DROP POLICY IF EXISTS "cdc_exam_syllabus_topics_write" ON public.cdc_exam_syllabus_topics;
DROP POLICY IF EXISTS "cdc_exam_topic_map_read"        ON public.cdc_exam_topic_map;
DROP POLICY IF EXISTS "cdc_exam_topic_map_write"       ON public.cdc_exam_topic_map;

-- Intended config-master public-read (see block comment above); anon is
-- inherently excluded (no auth.uid()).
CREATE POLICY "cdc_exam_syllabus_topics_read"  ON public.cdc_exam_syllabus_topics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_exam_topic_map_read"        ON public.cdc_exam_topic_map       FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cdc_exam_syllabus_topics_write" ON public.cdc_exam_syllabus_topics FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());
CREATE POLICY "cdc_exam_topic_map_write"       ON public.cdc_exam_topic_map       FOR ALL USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());

-- ---------------------------------------------------------------------
-- 6. VERIFY
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_topics   integer;
  v_shared   integer;
  v_map_rows integer;
BEGIN
  SELECT count(*) INTO v_topics FROM public.cdc_exam_syllabus_topics;
  SELECT count(*) INTO v_shared FROM public.cdc_exam_syllabus_topics WHERE is_shared = true;
  SELECT count(*) INTO v_map_rows FROM public.cdc_exam_topic_map;

  IF v_topics < 14 THEN RAISE EXCEPTION 'topic seed incomplete (found %, need >= 14)', v_topics; END IF;
  IF v_shared < 8  THEN RAISE EXCEPTION 'shared-topic seed incomplete (found %, need >= 8)', v_shared; END IF;
  -- Map rows only exist if PR-1 govt-exam types are present; tolerate 0
  -- (migrations may apply out of order) but log the count for verification.
  RAISE NOTICE 'CDC govt-readiness PR-4 verified: % topics (% shared), % topic-map rows', v_topics, v_shared, v_map_rows;
END $$;

COMMIT;
