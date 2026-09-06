-- Migration: Foundation programme — performance + diagnostic engine (PR-B2b)
-- Date: 2026-07-06
-- ADDITIVE. The MOST sensitive tables (children's test performance = PII).
-- RLS: super-admin only (NO is_admin cross-tenant bypass) + student/guardian + teacher + school mgmt,
-- via recursion-safe SECURITY DEFINER helpers. Direct student writes go through a future record-attempt
-- RPC (SECURITY DEFINER); table-level writes gated to managers.
-- Reversible: DROP TABLE fp_revision_plans, fp_baselines, fp_student_weakness, fp_responses, fp_attempts;
--             DROP the 4 fn_fp_can_* helpers.

BEGIN;

-- ---------- Tables ----------
CREATE TABLE IF NOT EXISTS public.fp_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.fp_assessments(id) ON DELETE RESTRICT,
  started_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  score         numeric,
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','abandoned')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fp_attempts IS 'A student''s attempt at an assessment (PII). Added 2026-07-06 (PR-B2b).';

CREATE TABLE IF NOT EXISTS public.fp_responses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.fp_attempts(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.fp_items(id) ON DELETE RESTRICT,
  chosen     jsonb,
  is_correct boolean,
  time_ms    integer,                    -- behavioural signal (time per question)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fp_responses_unique UNIQUE (attempt_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.fp_student_weakness (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE CASCADE,
  topic_id           uuid NOT NULL REFERENCES public.cdc_exam_syllabus_topics(id) ON DELETE CASCADE,
  mastery_score      numeric,            -- 0..1 rolling mastery (lower = weaker)
  attempts_count     integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fp_student_weakness_unique UNIQUE (student_id, exam_definition_id, topic_id)
);
COMMENT ON TABLE public.fp_student_weakness IS 'Rolling per-topic mastery/weakness per student — the diagnostic moat data (PII). Recomputed by a scheduled job from fp_responses. Added 2026-07-06 (PR-B2b).';

CREATE TABLE IF NOT EXISTS public.fp_baselines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE CASCADE,
  captured_at        timestamptz NOT NULL DEFAULT now(),
  snapshot           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- baseline per-topic competence (movement-vs-baseline)
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fp_revision_plans (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         uuid NOT NULL REFERENCES public.fp_students(id) ON DELETE CASCADE,
  exam_definition_id uuid NOT NULL REFERENCES public.exam_definitions(id) ON DELETE CASCADE,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  plan               jsonb NOT NULL DEFAULT '{}'::jsonb,   -- prioritized weak topics + recommended items
  status             text NOT NULL DEFAULT 'active',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fp_attempts_student   ON public.fp_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_fp_attempts_assess    ON public.fp_attempts (assessment_id);
CREATE INDEX IF NOT EXISTS idx_fp_attempts_status    ON public.fp_attempts (status);
CREATE INDEX IF NOT EXISTS idx_fp_responses_attempt  ON public.fp_responses (attempt_id);
CREATE INDEX IF NOT EXISTS idx_fp_responses_item     ON public.fp_responses (item_id);
CREATE INDEX IF NOT EXISTS idx_fp_weakness_student   ON public.fp_student_weakness (student_id);
CREATE INDEX IF NOT EXISTS idx_fp_weakness_topic     ON public.fp_student_weakness (topic_id);
CREATE INDEX IF NOT EXISTS idx_fp_baselines_student  ON public.fp_baselines (student_id, exam_definition_id);
CREATE INDEX IF NOT EXISTS idx_fp_revision_student   ON public.fp_revision_plans (student_id, exam_definition_id);

DROP TRIGGER IF EXISTS trg_fp_attempts_touch  ON public.fp_attempts;
DROP TRIGGER IF EXISTS trg_fp_weakness_touch   ON public.fp_student_weakness;
DROP TRIGGER IF EXISTS trg_fp_revision_touch   ON public.fp_revision_plans;
CREATE TRIGGER trg_fp_attempts_touch BEFORE UPDATE ON public.fp_attempts        FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_weakness_touch BEFORE UPDATE ON public.fp_student_weakness FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER trg_fp_revision_touch BEFORE UPDATE ON public.fp_revision_plans   FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ---------- Unified recursion-safe PII scope helpers ----------
CREATE OR REPLACE FUNCTION public.fn_fp_can_view_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
     OR public.fn_fp_is_own_or_guardian(p_student_id)
     OR public.fn_fp_teaches_student(p_student_id)
     OR EXISTS (SELECT 1 FROM public.fp_students s
          JOIN public.school_jkkn_owners o ON o.school_id = s.school_id
          WHERE s.id = p_student_id AND o.jkkn_user_id = auth.uid() AND o.is_active);
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_can_manage_student(p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
     OR (public.user_has_permission('foundation.students.manage') AND EXISTS (
          SELECT 1 FROM public.fp_students s
          JOIN public.school_jkkn_owners o ON o.school_id = s.school_id
          WHERE s.id = p_student_id AND o.jkkn_user_id = auth.uid() AND o.is_active));
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_can_view_attempt(p_attempt_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fp_attempts a WHERE a.id = p_attempt_id AND public.fn_fp_can_view_student(a.student_id));
$$;

CREATE OR REPLACE FUNCTION public.fn_fp_can_manage_attempt(p_attempt_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.fp_attempts a WHERE a.id = p_attempt_id AND public.fn_fp_can_manage_student(a.student_id));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fp_can_view_student(uuid)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_can_manage_student(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_can_view_attempt(uuid)   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_fp_can_manage_attempt(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fp_can_view_student(uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_can_manage_student(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_can_view_attempt(uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_fp_can_manage_attempt(uuid) TO authenticated;

-- ---------- RLS (all PII: super-admin + view/manage helpers, NO is_admin) ----------
ALTER TABLE public.fp_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_responses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_student_weakness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_baselines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fp_revision_plans   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fp_attempts_select ON public.fp_attempts;
DROP POLICY IF EXISTS fp_attempts_write  ON public.fp_attempts;
CREATE POLICY fp_attempts_select ON public.fp_attempts FOR SELECT USING (public.fn_fp_can_view_student(student_id));
CREATE POLICY fp_attempts_write  ON public.fp_attempts FOR ALL
  USING (public.fn_fp_can_manage_student(student_id)) WITH CHECK (public.fn_fp_can_manage_student(student_id));

DROP POLICY IF EXISTS fp_responses_select ON public.fp_responses;
DROP POLICY IF EXISTS fp_responses_write  ON public.fp_responses;
CREATE POLICY fp_responses_select ON public.fp_responses FOR SELECT USING (public.fn_fp_can_view_attempt(attempt_id));
CREATE POLICY fp_responses_write  ON public.fp_responses FOR ALL
  USING (public.fn_fp_can_manage_attempt(attempt_id)) WITH CHECK (public.fn_fp_can_manage_attempt(attempt_id));

DROP POLICY IF EXISTS fp_weakness_select ON public.fp_student_weakness;
DROP POLICY IF EXISTS fp_weakness_write  ON public.fp_student_weakness;
CREATE POLICY fp_weakness_select ON public.fp_student_weakness FOR SELECT USING (public.fn_fp_can_view_student(student_id));
CREATE POLICY fp_weakness_write  ON public.fp_student_weakness FOR ALL
  USING (public.fn_fp_can_manage_student(student_id)) WITH CHECK (public.fn_fp_can_manage_student(student_id));

DROP POLICY IF EXISTS fp_baselines_select ON public.fp_baselines;
DROP POLICY IF EXISTS fp_baselines_write  ON public.fp_baselines;
CREATE POLICY fp_baselines_select ON public.fp_baselines FOR SELECT USING (public.fn_fp_can_view_student(student_id));
CREATE POLICY fp_baselines_write  ON public.fp_baselines FOR ALL
  USING (public.fn_fp_can_manage_student(student_id)) WITH CHECK (public.fn_fp_can_manage_student(student_id));

DROP POLICY IF EXISTS fp_revision_select ON public.fp_revision_plans;
DROP POLICY IF EXISTS fp_revision_write  ON public.fp_revision_plans;
CREATE POLICY fp_revision_select ON public.fp_revision_plans FOR SELECT USING (public.fn_fp_can_view_student(student_id));
CREATE POLICY fp_revision_write  ON public.fp_revision_plans FOR ALL
  USING (public.fn_fp_can_manage_student(student_id)) WITH CHECK (public.fn_fp_can_manage_student(student_id));

COMMIT;
