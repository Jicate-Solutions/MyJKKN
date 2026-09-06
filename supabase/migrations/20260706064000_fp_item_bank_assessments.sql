-- Migration: Foundation programme — item bank + assessments + shared topic map (PR-B2a)
-- Date: 2026-07-06
-- ADDITIVE. Content tables (NO student PII). Generalizes the exam→topic taxonomy onto the
-- shared exam_definitions spine (Stage 3, additive — does NOT touch cdc_exam_topic_map / CDC).
-- Reversible: DROP TABLE fp_assessment_items, fp_assessments, fp_items, exam_topic_map;
--             DELETE the seeded sch_* topics + their exam_topic_map rows.

BEGIN;

-- ---------- Generalized junction: exam_definitions -> shared topic taxonomy ----------
CREATE TABLE IF NOT EXISTS public.exam_topic_map (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE CASCADE,
  topic_id           uuid NOT NULL REFERENCES public.cdc_exam_syllabus_topics(id) ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id),
  updated_by         uuid REFERENCES public.profiles(id),
  CONSTRAINT exam_topic_map_unique UNIQUE (exam_definition_id, topic_id)
);
COMMENT ON TABLE public.exam_topic_map IS 'Shared exam->topic junction keyed to exam_definitions (both school & college). Additive companion to the legacy cdc_exam_topic_map (which stays bound to cdc_training_types until Stage 2/PR-C migrates it here). Added 2026-07-06 (PR-B2a).';

-- ---------- Item bank ----------
CREATE TABLE IF NOT EXISTS public.fp_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE RESTRICT,
  topic_id           uuid REFERENCES public.cdc_exam_syllabus_topics(id) ON DELETE SET NULL,
  difficulty         smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  q_type             text NOT NULL DEFAULT 'mcq_single',
  stem               text NOT NULL,
  options            jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer             jsonb NOT NULL,
  explanation        text,
  source             text,           -- 'licensed' | 'authored' | vendor id (provenance for the hybrid sourcing decision)
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id),
  updated_by         uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.fp_items IS 'Foundation item bank (questions), tagged by exam + topic + difficulty. source marks licensed vs authored (hybrid sourcing decision). Staff-only (holds answers). Added 2026-07-06 (PR-B2a).';

-- ---------- Assessments (tests / practice sets / mocks) ----------
CREATE TABLE IF NOT EXISTS public.fp_assessments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE RESTRICT,
  cohort_id          uuid REFERENCES public.fp_cohorts(id) ON DELETE SET NULL,
  title              text NOT NULL,
  kind               text NOT NULL DEFAULT 'practice' CHECK (kind IN ('diagnostic','practice','mock')),
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id),
  updated_by         uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.fp_assessment_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE RESTRICT,
  position      integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fp_assessment_items_unique UNIQUE (assessment_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_topic_map_exam    ON public.exam_topic_map (exam_definition_id);
CREATE INDEX IF NOT EXISTS idx_exam_topic_map_topic   ON public.exam_topic_map (topic_id);
CREATE INDEX IF NOT EXISTS idx_fp_items_exam          ON public.fp_items (exam_definition_id);
CREATE INDEX IF NOT EXISTS idx_fp_items_topic         ON public.fp_items (topic_id);
CREATE INDEX IF NOT EXISTS idx_fp_items_active        ON public.fp_items (is_active);
CREATE INDEX IF NOT EXISTS idx_fp_assessments_exam    ON public.fp_assessments (exam_definition_id);
CREATE INDEX IF NOT EXISTS idx_fp_assessments_cohort  ON public.fp_assessments (cohort_id);
CREATE INDEX IF NOT EXISTS idx_fp_assessment_items_a  ON public.fp_assessment_items (assessment_id);
CREATE INDEX IF NOT EXISTS idx_fp_assessment_items_i  ON public.fp_assessment_items (item_id);

DROP TRIGGER IF EXISTS trg_exam_topic_map_touch  ON public.exam_topic_map;
DROP TRIGGER IF EXISTS trg_fp_items_touch        ON public.fp_items;
DROP TRIGGER IF EXISTS trg_fp_assessments_touch  ON public.fp_assessments;
CREATE TRIGGER trg_exam_topic_map_touch  BEFORE UPDATE ON public.exam_topic_map  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_items_touch        BEFORE UPDATE ON public.fp_items        FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_assessments_touch  BEFORE UPDATE ON public.fp_assessments  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------- Seed: school subject topics into the SHARED taxonomy + map to school exams ----------
INSERT INTO public.cdc_exam_syllabus_topics (config_key, display_name, is_shared, is_system, sort_order) VALUES
  ('sch_physics',     'Physics',     true,  true, 210),
  ('sch_chemistry',   'Chemistry',   true,  true, 220),
  ('sch_biology',     'Biology',     false, true, 230),
  ('sch_mathematics', 'Mathematics', false, true, 240)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.exam_topic_map (exam_definition_id, topic_id, sort_order)
SELECT e.id, t.id, t.sort_order
FROM (VALUES
  ('neet_ug','sch_physics'), ('neet_ug','sch_chemistry'), ('neet_ug','sch_biology'),
  ('jee_main','sch_physics'), ('jee_main','sch_chemistry'), ('jee_main','sch_mathematics'),
  ('jee_advanced','sch_physics'), ('jee_advanced','sch_chemistry'), ('jee_advanced','sch_mathematics')
) AS m(exam_key, topic_key)
JOIN public.exam_definitions e          ON e.config_key = m.exam_key
JOIN public.cdc_exam_syllabus_topics t  ON t.config_key = m.topic_key
ON CONFLICT (exam_definition_id, topic_id) DO NOTHING;

-- ---------- RLS: content tables — permission-gated (no student PII here) ----------
ALTER TABLE public.exam_topic_map       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_assessment_items  ENABLE ROW LEVEL SECURITY;

-- exam_topic_map: reference data — any authed reads; content managers write
DROP POLICY IF EXISTS exam_topic_map_read  ON public.exam_topic_map;
DROP POLICY IF EXISTS exam_topic_map_write ON public.exam_topic_map;
CREATE POLICY exam_topic_map_read  ON public.exam_topic_map FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY exam_topic_map_write ON public.exam_topic_map FOR ALL
  USING (public.is_super_admin() OR public.is_cdc_head_or_super() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.is_cdc_head_or_super() OR public.user_has_permission('foundation.items.manage'));

-- fp_items: holds answers — staff only
DROP POLICY IF EXISTS fp_items_read  ON public.fp_items;
DROP POLICY IF EXISTS fp_items_write ON public.fp_items;
CREATE POLICY fp_items_read  ON public.fp_items FOR SELECT USING (
  public.is_super_admin() OR public.user_has_permission('foundation.items.view') OR public.user_has_permission('foundation.items.manage'));
CREATE POLICY fp_items_write ON public.fp_items FOR ALL
  USING (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.items.manage'));

-- fp_assessments
DROP POLICY IF EXISTS fp_assessments_read  ON public.fp_assessments;
DROP POLICY IF EXISTS fp_assessments_write ON public.fp_assessments;
CREATE POLICY fp_assessments_read  ON public.fp_assessments FOR SELECT USING (
  public.is_super_admin() OR public.user_has_permission('foundation.assessments.view') OR public.user_has_permission('foundation.assessments.manage')
  OR (cohort_id IS NOT NULL AND public.fn_fp_manages_cohort_school(cohort_id)));
CREATE POLICY fp_assessments_write ON public.fp_assessments FOR ALL
  USING (public.is_super_admin() OR public.user_has_permission('foundation.assessments.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.assessments.manage'));

-- fp_assessment_items
DROP POLICY IF EXISTS fp_assessment_items_read  ON public.fp_assessment_items;
DROP POLICY IF EXISTS fp_assessment_items_write ON public.fp_assessment_items;
CREATE POLICY fp_assessment_items_read  ON public.fp_assessment_items FOR SELECT USING (
  public.is_super_admin() OR public.user_has_permission('foundation.assessments.view') OR public.user_has_permission('foundation.assessments.manage'));
CREATE POLICY fp_assessment_items_write ON public.fp_assessment_items FOR ALL
  USING (public.is_super_admin() OR public.user_has_permission('foundation.assessments.manage'))
  WITH CHECK (public.is_super_admin() OR public.user_has_permission('foundation.assessments.manage'));

COMMIT;
