-- Migration: exam_definitions — shared exam-readiness spine (Foundation PR-A / Stage 1)
-- Date: 2026-07-05
-- ADDITIVE ONLY. Creates the neutral shared exam entity referenced by BOTH
-- CDC govt-readiness (college -> govt-jobs) and the Foundation programme (school -> NEET/JEE).
-- Touches NO existing cdc_* table (reads cdc_training_types for backfill only).
-- Realizes Decision #1 (fully shared exam system) — Stage 1 of the safe merge plan.
-- Reversible: DROP TABLE public.exam_definitions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_definitions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key            text NOT NULL,
  display_name          text NOT NULL,
  exam_family           text NOT NULL,
  level                 text NOT NULL CHECK (level IN ('school','college')),
  cdc_training_type_id  uuid REFERENCES public.cdc_training_types(id) ON DELETE SET NULL,
  is_active             boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 100,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.profiles(id),
  updated_by            uuid REFERENCES public.profiles(id),
  CONSTRAINT exam_definitions_config_key_unique UNIQUE (config_key)
);

COMMENT ON TABLE public.exam_definitions IS
  'Shared exam-readiness spine. Neutral exam entity referenced by BOTH CDC govt-readiness (level=college, linked to cdc_training_types) and the Foundation programme (level=school: NEET/JEE/CUET). Added 2026-07-05 (Foundation PR-A / Stage 1 of the shared-spine merge). Additive — does not modify cdc_* tables.';

CREATE INDEX IF NOT EXISTS idx_exam_definitions_family ON public.exam_definitions (exam_family);
CREATE INDEX IF NOT EXISTS idx_exam_definitions_level  ON public.exam_definitions (level);

-- Reuse the existing shared touch trigger (confirmed present in prod)
DROP TRIGGER IF EXISTS trg_exam_definitions_touch ON public.exam_definitions;
CREATE TRIGGER trg_exam_definitions_touch BEFORE UPDATE ON public.exam_definitions
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Seed: school exams (Foundation funnel tracks)
INSERT INTO public.exam_definitions (config_key, display_name, exam_family, level, sort_order) VALUES
  ('neet_ug',      'NEET (UG)',     'medical',     'school', 10),
  ('jee_main',     'JEE Main',      'engineering', 'school', 20),
  ('jee_advanced', 'JEE Advanced',  'engineering', 'school', 30),
  ('cuet_ug',      'CUET (UG)',     'university',  'school', 40)
ON CONFLICT (config_key) DO NOTHING;

-- Backfill: college exams from existing CDC govt-readiness config (READ-ONLY on cdc_training_types)
INSERT INTO public.exam_definitions (config_key, display_name, exam_family, level, cdc_training_type_id, sort_order)
SELECT tt.config_key, tt.display_name, tt.exam_family, 'college', tt.id, 100
FROM public.cdc_training_types tt
WHERE tt.exam_family IS NOT NULL
ON CONFLICT (config_key) DO NOTHING;

-- RLS: reference data — any authenticated user may READ (matches CDC pattern; anon blocked).
-- WRITE gated to super-admin or CDC head; Foundation-admin gate added when those roles land.
ALTER TABLE public.exam_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exam_definitions_read"  ON public.exam_definitions;
DROP POLICY IF EXISTS "exam_definitions_write" ON public.exam_definitions;

CREATE POLICY "exam_definitions_read" ON public.exam_definitions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "exam_definitions_write" ON public.exam_definitions
  FOR ALL USING (public.is_super_admin() OR public.is_cdc_head_or_super())
  WITH CHECK (public.is_super_admin() OR public.is_cdc_head_or_super());

COMMIT;
