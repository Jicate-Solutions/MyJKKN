-- ============================================================================
-- Migration: 20270115090000_pde_clinical_case_stages
-- Staged clinical cases + stage locking for the PDE clinical-reasoning module.
-- ============================================================================
-- WHY
--   Today a clinical case is ONE flat patient scenario followed by a list of
--   questions. Prof. P.K. Meena Priya's Oral Medicine & Radiology case set is
--   written as PROGRESSIVE VIGNETTES: 3 cases x 3 stages, where each stage
--   carries its own scenario text, its own figure, and its own questions, and a
--   later stage REVEALS what an earlier stage asked. Her Stage 3 literally opens
--   "The patient is confirmed to have Pemphigus Vulgaris" — which is the answer
--   to Stage 1's question.
--
--   That is why the stages LOCK (Director decision, 2026-09-18). Shipping a
--   later stage's scenario text to the browser before the learner has passed the
--   earlier stage would hand over the answer, exactly like shipping the answer
--   key did before the 2026-07-22 hardening. So unlocking is decided in the
--   database, and a locked stage's title / scenario / image never leave it.
--
-- BACKWARD COMPATIBILITY (hard requirement)
--   A case with NO stage rows behaves exactly as it does today:
--     * pde_assessment_questions.stage_id is nullable and defaults to NULL;
--     * fn_pde_get_case_questions returns every stage_id IS NULL question with
--       no gating at all;
--     * fn_pde_get_case_stages returns an empty array, and the learner UI falls
--       back to the flat single-scenario flow.
--   The oral lichen planus seed case is untouched by this migration.
--
-- Migrations are FILES ONLY in this repo — this is NOT applied here.
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stages
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pde_case_stages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES public.pde_assessments(id) ON DELETE CASCADE,
  stage_order    integer NOT NULL,
  title          text NOT NULL,
  scenario_text  text NOT NULL DEFAULT '',
  image_url      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pde_case_stages_order_positive CHECK (stage_order >= 1),
  CONSTRAINT pde_case_stages_assessment_order_key UNIQUE (assessment_id, stage_order)
);

COMMENT ON TABLE public.pde_case_stages IS
  'Ordered stages of a staged clinical case. Each stage carries its own scenario text and figure. A case with no rows here is a flat single-scenario case and behaves as it did before this migration.';
COMMENT ON COLUMN public.pde_case_stages.scenario_text IS
  'The stage''s own clinical narrative. MAY CONTAIN THE ANSWER to an earlier stage, so it is only ever released through fn_pde_get_case_stages once the previous stage is passed.';

CREATE INDEX IF NOT EXISTS idx_pde_case_stages_assessment
  ON public.pde_case_stages (assessment_id, stage_order);

-- A question belongs to a stage. NULL = the case is not staged (today's shape).
ALTER TABLE public.pde_assessment_questions
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.pde_case_stages(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.pde_assessment_questions.stage_id IS
  'Owning pde_case_stages row, or NULL for an unstaged (flat) case. Deleting a stage deletes its questions.';

CREATE INDEX IF NOT EXISTS idx_pde_assessment_questions_stage
  ON public.pde_assessment_questions (stage_id)
  WHERE stage_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Per-learner, per-attempt stage progress
-- ----------------------------------------------------------------------------
-- A learner works through the stages of ONE attempt over possibly several
-- sittings, and pde_submissions only gets a row when the whole attempt is
-- finished. So "which stages have I cleared in the attempt I am currently on"
-- has to live somewhere of its own — here, keyed by attempt_number. A learner
-- who closes the tab mid-case comes back to the same stage, still locked.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pde_case_stage_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES public.pde_assessments(id) ON DELETE CASCADE,
  stage_id       uuid NOT NULL REFERENCES public.pde_case_stages(id) ON DELETE CASCADE,
  learner_id     uuid NOT NULL,
  attempt_number integer NOT NULL,
  score_pct      numeric,
  threshold_pct  numeric,
  passed         boolean NOT NULL DEFAULT false,
  answers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pde_case_stage_progress_attempt_positive CHECK (attempt_number >= 1),
  CONSTRAINT pde_case_stage_progress_unique UNIQUE (stage_id, learner_id, attempt_number)
);

COMMENT ON TABLE public.pde_case_stage_progress IS
  'One row per (stage, learner, attempt). Written only by fn_pde_submit_stage, which marks against the answer key server-side. score_pct/threshold_pct are stored as-evaluated so a later policy change cannot retroactively re-open or re-close a stage a learner already cleared.';

CREATE INDEX IF NOT EXISTS idx_pde_case_stage_progress_lookup
  ON public.pde_case_stage_progress (assessment_id, learner_id, attempt_number);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
-- pde_case_stages mirrors the post-hardening pde_assessment_questions policy:
-- staff / creator / admin read the base table, learners get NOTHING directly
-- and reach stages only through fn_pde_get_case_stages, which withholds a
-- locked stage's title, scenario and image.
-- ----------------------------------------------------------------------------

ALTER TABLE public.pde_case_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pde_case_stage_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pde_case_stages_staff_read ON public.pde_case_stages;
CREATE POLICY pde_case_stages_staff_read ON public.pde_case_stages
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.pde_assessments a
    WHERE a.id = pde_case_stages.assessment_id AND a.created_by = auth.uid()
  )
  OR (
    user_has_permission('pde.faculty.view')
    AND EXISTS (
      SELECT 1 FROM public.pde_assessments a
      JOIN public.vac_courses c ON c.id = a.course_id
      WHERE a.id = pde_case_stages.assessment_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

-- Write: the creator of the parent case, or an admin — mirroring
-- pde_questions_write in 20260721234500_pde_assessment_write_rls.sql exactly.
-- A stage and the questions inside it are authored together, so the same people
-- should be able to edit both.
--
-- An earlier draft of this policy gated on `pde.faculty.manage`. That key is not
-- registered in lib/constants/permissions.ts and exists nowhere else in the
-- codebase — it was invented here. A permission nobody can be granted is not a
-- stricter policy, it is a branch that is always false, so the OR arm would
-- simply never have fired. Reusing the module's real predicate is both
-- grantable and consistent with the sibling table.
DROP POLICY IF EXISTS pde_case_stages_staff_write ON public.pde_case_stages;
CREATE POLICY pde_case_stages_staff_write ON public.pde_case_stages
FOR ALL USING (
  (select is_super_admin()) OR (select is_admin())
  OR EXISTS (
    SELECT 1 FROM public.pde_assessments a
    WHERE a.id = pde_case_stages.assessment_id AND a.created_by = (select auth.uid())
  )
) WITH CHECK (
  (select is_super_admin()) OR (select is_admin())
  OR EXISTS (
    SELECT 1 FROM public.pde_assessments a
    WHERE a.id = pde_case_stages.assessment_id AND a.created_by = (select auth.uid())
  )
);

-- Progress: a learner may READ their own rows (it is their own score, and the
-- UI needs it to say "you scored 55%, the bar is 60%"). Nobody writes directly —
-- inserts and updates go through fn_pde_submit_stage, which owns the marking.
DROP POLICY IF EXISTS pde_case_stage_progress_own_read ON public.pde_case_stage_progress;
CREATE POLICY pde_case_stage_progress_own_read ON public.pde_case_stage_progress
FOR SELECT USING (
  learner_id = auth.uid()
  OR is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.pde_assessments a
    WHERE a.id = pde_case_stage_progress.assessment_id AND a.created_by = auth.uid()
  )
  OR (
    user_has_permission('pde.faculty.view')
    AND EXISTS (
      SELECT 1 FROM public.pde_assessments a
      JOIN public.vac_courses c ON c.id = a.course_id
      WHERE a.id = pde_case_stage_progress.assessment_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

-- ----------------------------------------------------------------------------
-- 3b. Anon lock-out — table grants, NOT a restatement of RLS
-- ----------------------------------------------------------------------------
-- Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`, so
-- a newly created table is readable by the anon key embedded in every page of
-- the public site unless the migration says otherwise. RLS being enabled is not
-- a substitute: a policy written TO PUBLIC applies to anon too, and both of the
-- policies above are unrestricted-role policies.
--
-- For THIS pair of tables that would have undone the whole feature.
-- pde_case_stages stores the locked stage's title, scenario text and image —
-- precisely the content fn_pde_get_case_stages exists to withhold until the
-- learner has earned it. Leaving the default grant in place would let anyone
-- read every stage of every case straight off the table, without logging in,
-- and the careful gating in the RPCs would be decoration.
--
-- Grants are therefore stated explicitly rather than inherited:
--   pde_case_stages          — faculty author these through the API using their
--                              OWN client (createClient()), so `authenticated`
--                              needs full DML; the RLS policy above narrows it
--                              to the case creator or an admin.
--   pde_case_stage_progress  — written ONLY by fn_pde_submit_stage, which is
--                              SECURITY DEFINER and runs as the function owner,
--                              so `authenticated` needs no write grant at all.
--                              SELECT only, narrowed by RLS to the learner's own
--                              rows plus staff. Marking stays unforgeable.
-- ----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.pde_case_stages FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pde_case_stages TO authenticated;

REVOKE ALL ON TABLE public.pde_case_stage_progress FROM anon, PUBLIC, authenticated;
GRANT SELECT ON TABLE public.pde_case_stage_progress TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Helpers
-- ----------------------------------------------------------------------------

-- The attempt the learner is currently on = completed attempts + 1. Stage
-- progress is keyed by this, so finishing an attempt starts every stage locked
-- again for the next one.
CREATE OR REPLACE FUNCTION public.fn_pde_current_attempt_number(p_assessment_id uuid, p_learner_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(count(*), 0)::int + 1
  FROM pde_submissions s
  WHERE s.assessment_id = p_assessment_id AND s.learner_id = p_learner_id;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_current_attempt_number(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_current_attempt_number(uuid, uuid) TO authenticated;

-- May this caller attempt (or author) this case? Same predicate the answer-key
-- RPCs use, factored out so the stage RPCs cannot drift from it.
CREATE OR REPLACE FUNCTION public.fn_pde_case_access(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_staff boolean; v_learner boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('allowed', false, 'is_staff', false); END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id = p_assessment_id AND a.created_by = v_uid)
    OR (user_has_permission('pde.faculty.view') AND EXISTS (
          SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id = a.course_id
          WHERE a.id = p_assessment_id AND role_has_institution_access(c.institution_id)))
  INTO v_staff;
  SELECT EXISTS (SELECT 1 FROM pde_assessments a JOIN vac_enrollments e ON e.course_id = a.course_id
          WHERE a.id = p_assessment_id AND a.is_active AND a.status = 'published' AND e.user_id = v_uid)
  INTO v_learner;
  RETURN jsonb_build_object('allowed', coalesce(v_staff, false) OR coalesce(v_learner, false),
                            'is_staff', coalesce(v_staff, false));
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_case_access(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_case_access(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Objective marking, one answer at a time
-- ----------------------------------------------------------------------------
-- Marks a single answer against the key that lives in the row. Created here for
-- the two objective types that exist today; the companion migration
-- 20270115090100 REPLACES it to add multi_select / matching / sequencing.
--
-- Returns NULL for a question that cannot be objectively marked (free_text_socratic),
-- so the caller can exclude it from the denominator rather than score it zero.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_score_clinical_answer(p_question_id uuid, p_answer jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_q            record;
  v_correct_id   text;
  v_best         numeric := 0;
  v_region       jsonb;
  v_px           numeric; v_py numeric; v_iw numeric; v_ih numeric;
  v_rw numeric; v_rh numeric; v_cx numeric; v_cy numeric; v_dist numeric; v_tol numeric; v_s numeric;
BEGIN
  SELECT question_type, options, correct_answer, expected_regions, metadata
    INTO v_q FROM pde_assessment_questions WHERE id = p_question_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_q.question_type = 'mcq_warmup' THEN
    v_correct_id := nullif(v_q.correct_answer, '');
    IF v_correct_id IS NULL THEN
      SELECT elem->>'id' INTO v_correct_id
      FROM jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) elem
      WHERE (elem->>'is_correct')::boolean IS TRUE LIMIT 1;
    END IF;
    IF v_correct_id IS NULL THEN RETURN NULL; END IF;
    RETURN CASE WHEN (p_answer->>'selected_option_id') = v_correct_id THEN 100 ELSE 0 END;

  ELSIF v_q.question_type = 'image_tag' THEN
    -- Mirrors scoreRegions() in app/api/pde/clinical-reasoning/mark-image-tag/route.ts.
    -- Kept in SQL so a stage gate cannot be cleared by POSTing a made-up score.
    -- KEEP THE TWO IN SYNC.
    IF v_q.expected_regions IS NULL OR jsonb_array_length(coalesce(v_q.expected_regions, '[]'::jsonb)) = 0 THEN
      RETURN 100; -- no regions defined → full credit, same as the route
    END IF;
    v_px := (p_answer#>>'{click_point,x}')::numeric;
    v_py := (p_answer#>>'{click_point,y}')::numeric;
    v_iw := (p_answer#>>'{click_point,imgWidth}')::numeric;
    v_ih := (p_answer#>>'{click_point,imgHeight}')::numeric;
    IF v_px IS NULL OR v_py IS NULL OR v_iw IS NULL OR v_ih IS NULL OR v_iw <= 0 OR v_ih <= 0 THEN
      RETURN 0;
    END IF;
    FOR v_region IN SELECT * FROM jsonb_array_elements(v_q.expected_regions) LOOP
      v_rw := (v_region->>'w')::numeric * v_iw;
      v_rh := (v_region->>'h')::numeric * v_ih;
      v_cx := (v_region->>'x')::numeric * v_iw + v_rw / 2;
      v_cy := (v_region->>'y')::numeric * v_ih + v_rh / 2;
      v_dist := sqrt(power(v_px - v_cx, 2) + power(v_py - v_cy, 2));
      v_tol := coalesce((v_region->>'tolerance_px')::numeric, greatest(v_rw, v_rh) / 2);
      IF v_tol <= 0 THEN v_tol := 1; END IF;
      v_s := greatest(0, least(100, (1 - v_dist / (v_tol * 2)) * 100));
      IF v_s > v_best THEN v_best := v_s; END IF;
    END LOOP;
    RETURN round(v_best);
  END IF;

  -- free_text_socratic (and anything not objectively markable) → not scorable.
  RETURN NULL;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_score_clinical_answer(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_score_clinical_answer(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. The pass bar
-- ----------------------------------------------------------------------------
-- Reads the platform policy, never a literal — a Senior Learner changes
-- clinical_reasoning.scoring.passing_threshold_pct and every stage gate moves
-- with it. 60 is the last-resort fallback and matches both the policy seed and
-- getPassingThresholdPct() in app/api/pde/clinical-reasoning/score/route.ts.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_stage_threshold_pct()
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_raw jsonb; v_n numeric;
BEGIN
  BEGIN
    v_raw := fn_get_policy_clinical_reasoning('scoring.passing_threshold_pct', '60'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RETURN 60;
  END;
  IF v_raw IS NULL OR jsonb_typeof(v_raw) = 'null' THEN RETURN 60; END IF;
  BEGIN
    v_n := (v_raw #>> '{}')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN 60;
  END;
  IF v_n IS NULL OR v_n <= 0 OR v_n > 100 THEN RETURN 60; END IF;
  RETURN v_n;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_stage_threshold_pct() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_stage_threshold_pct() TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Stage delivery — the lock lives here
-- ----------------------------------------------------------------------------
-- Stage 1 is always open. Stage N>1 opens only once stage N-1 is PASSED in the
-- learner's current attempt. A locked stage returns its id and its position and
-- nothing else: no title, no scenario, no image. That is deliberate — a stage
-- title such as "Stage 3 — Confirmed Pemphigus Vulgaris" would give away Stage 1.
-- Staff and the case author see every stage unlocked, for authoring and preview.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_get_case_stages(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_access   jsonb;
  v_attempt  integer;
  v_threshold numeric;
  v_rows     jsonb := '[]'::jsonb;
  v_stage    record;
  v_prev_passed boolean := true;   -- stage 1 has no predecessor
  v_unlocked boolean;
  v_prog     record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  v_access := fn_pde_case_access(p_assessment_id);
  IF NOT (v_access->>'allowed')::boolean THEN
    RAISE EXCEPTION 'not authorized for this case' USING ERRCODE = '42501';
  END IF;

  v_attempt := fn_pde_current_attempt_number(p_assessment_id, v_uid);
  v_threshold := fn_pde_stage_threshold_pct();

  FOR v_stage IN
    SELECT * FROM pde_case_stages WHERE assessment_id = p_assessment_id ORDER BY stage_order
  LOOP
    SELECT * INTO v_prog FROM pde_case_stage_progress
     WHERE stage_id = v_stage.id AND learner_id = v_uid AND attempt_number = v_attempt;

    v_unlocked := (v_access->>'is_staff')::boolean OR v_prev_passed;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id',            v_stage.id,
      'stage_order',   v_stage.stage_order,
      'is_unlocked',   v_unlocked,
      'is_passed',     coalesce(v_prog.passed, false),
      'score_pct',     v_prog.score_pct,
      'threshold_pct', v_threshold,
      -- Withheld while locked. This is the whole point of the feature.
      'title',         CASE WHEN v_unlocked THEN v_stage.title ELSE NULL END,
      'scenario_text', CASE WHEN v_unlocked THEN v_stage.scenario_text ELSE NULL END,
      'image_url',     CASE WHEN v_unlocked THEN v_stage.image_url ELSE NULL END
    ));

    v_prev_passed := coalesce(v_prog.passed, false);
  END LOOP;

  RETURN v_rows;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_get_case_stages(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_case_stages(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Stage submission — marks, scores, and decides whether the next stage opens
-- ----------------------------------------------------------------------------
-- p_answers is the learner's raw answers for THIS stage only:
--   [{ "question_id": uuid, "selected_option_id": "...", "selected_option_ids": [...],
--      "match_selections": {...}, "sequence_order": [...], "click_point": {...} }]
-- Nothing in there is trusted as a score. Every objective answer is re-marked
-- here against the key in the row, which is why a learner cannot POST their way
-- past a stage.
--
-- A stage whose questions are ALL free-text (nothing objectively markable) has
-- no score to compare against the bar. It passes once submitted, rather than
-- becoming a dead end the learner can never leave.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_submit_stage(p_stage_id uuid, p_answers jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_stage      record;
  v_access     jsonb;
  v_attempt    integer;
  v_threshold  numeric;
  v_prev       record;
  v_q          record;
  v_answer     jsonb;
  v_score      numeric;
  v_sum        numeric := 0;
  v_count      integer := 0;
  v_total_q    integer := 0;
  v_pct        numeric;
  v_passed     boolean;
  v_next_order integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_stage FROM pde_case_stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stage not found' USING ERRCODE = 'P0002'; END IF;

  v_access := fn_pde_case_access(v_stage.assessment_id);
  IF NOT (v_access->>'allowed')::boolean THEN
    RAISE EXCEPTION 'not authorized for this case' USING ERRCODE = '42501';
  END IF;

  v_attempt := fn_pde_current_attempt_number(v_stage.assessment_id, v_uid);

  -- The gate, enforced on the WRITE path too: a learner cannot submit stage N
  -- until stage N-1 is passed in this attempt, no matter what the client does.
  IF v_stage.stage_order > 1 AND NOT (v_access->>'is_staff')::boolean THEN
    SELECT p.passed INTO v_prev
    FROM pde_case_stages s
    LEFT JOIN pde_case_stage_progress p
      ON p.stage_id = s.id AND p.learner_id = v_uid AND p.attempt_number = v_attempt
    WHERE s.assessment_id = v_stage.assessment_id AND s.stage_order = v_stage.stage_order - 1;
    IF v_prev IS NULL OR v_prev.passed IS NOT TRUE THEN
      RAISE EXCEPTION 'previous stage not passed' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_threshold := fn_pde_stage_threshold_pct();

  -- Score every question that BELONGS to this stage. A question the learner
  -- skipped has no answer and scores zero; it is not quietly dropped.
  FOR v_q IN
    SELECT id, question_type FROM pde_assessment_questions
    WHERE stage_id = p_stage_id ORDER BY order_index
  LOOP
    v_total_q := v_total_q + 1;
    SELECT elem INTO v_answer
    FROM jsonb_array_elements(p_answers) elem
    WHERE elem->>'question_id' = v_q.id::text
    LIMIT 1;

    v_score := fn_pde_score_clinical_answer(v_q.id, coalesce(v_answer, '{}'::jsonb));
    IF v_score IS NOT NULL THEN
      v_count := v_count + 1;
      v_sum := v_sum + v_score;
    END IF;
    v_answer := NULL;
  END LOOP;

  IF v_count > 0 THEN
    v_pct := round(v_sum / v_count, 2);
    v_passed := v_pct >= v_threshold;
  ELSE
    -- Nothing objectively markable in this stage. Scoring it would be inventing
    -- a number; blocking on it would be a dead end. Submitting clears it.
    v_pct := NULL;
    v_passed := true;
  END IF;

  INSERT INTO pde_case_stage_progress
    (assessment_id, stage_id, learner_id, attempt_number, score_pct, threshold_pct, passed, answers)
  VALUES
    (v_stage.assessment_id, p_stage_id, v_uid, v_attempt, v_pct, v_threshold, v_passed, p_answers)
  ON CONFLICT (stage_id, learner_id, attempt_number) DO UPDATE
    SET score_pct = EXCLUDED.score_pct,
        threshold_pct = EXCLUDED.threshold_pct,
        -- Once cleared, a stage stays cleared for this attempt. A re-submission
        -- can raise a score but must never re-lock what the learner already
        -- opened — they may have read the next stage's scenario by then.
        passed = pde_case_stage_progress.passed OR EXCLUDED.passed,
        answers = EXCLUDED.answers,
        updated_at = now();

  SELECT min(stage_order) INTO v_next_order
  FROM pde_case_stages
  WHERE assessment_id = v_stage.assessment_id AND stage_order > v_stage.stage_order;

  RETURN jsonb_build_object(
    'stage_id',       p_stage_id,
    'attempt_number', v_attempt,
    'score_pct',      v_pct,
    'threshold_pct',  v_threshold,
    'passed',         v_passed,
    'scored_count',   v_count,
    'question_count', v_total_q,
    'has_next_stage', v_next_order IS NOT NULL,
    'next_unlocked',  v_next_order IS NOT NULL AND v_passed
  );
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_pde_submit_stage(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_submit_stage(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Question delivery, now stage-aware
-- ----------------------------------------------------------------------------
-- Replaces the function from pde_answer_key_secdef_rpcs.sql. Two changes, both
-- additive for an unstaged case:
--   * stage_id rides along in the payload, so the client can group by stage;
--   * a learner is served ONLY the questions of stages that are open to them.
-- Everything the original stripped is still stripped: options[].is_correct,
-- metadata.ground_truth, metadata.key_concepts, and correct_answer /
-- expected_regions are still absent entirely.
--
-- stage_id IS NULL questions (every case that exists today) are always returned.
-- The companion migration 20270115090100 replaces this again to widen the
-- question_type list; this body is the stage half of that final shape.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pde_get_case_questions(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_uid uuid := auth.uid(); v_allowed boolean; v_is_staff boolean; v_attempt integer; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  SELECT is_super_admin() OR is_admin()
    OR EXISTS (SELECT 1 FROM pde_assessments a WHERE a.id=p_assessment_id AND a.created_by=v_uid)
    OR (user_has_permission('pde.faculty.view') AND EXISTS (
          SELECT 1 FROM pde_assessments a JOIN vac_courses c ON c.id=a.course_id
          WHERE a.id=p_assessment_id AND role_has_institution_access(c.institution_id)))
  INTO v_is_staff;
  SELECT v_is_staff
    OR EXISTS (SELECT 1 FROM pde_assessments a JOIN vac_enrollments e ON e.course_id=a.course_id
          WHERE a.id=p_assessment_id AND a.is_active AND a.status='published' AND e.user_id=v_uid)
  INTO v_allowed;
  IF NOT v_allowed THEN RAISE EXCEPTION 'not authorized for this case' USING ERRCODE='42501'; END IF;

  v_attempt := fn_pde_current_attempt_number(p_assessment_id, v_uid);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id, 'assessment_id', q.assessment_id, 'question_type', q.question_type,
      'question_text', q.question_text, 'question_media_url', q.question_media_url,
      'points', q.points, 'order_index', q.order_index, 'finks_dimension', q.finks_dimension,
      'difficulty', q.difficulty, 'stage_id', q.stage_id,
      'options', (SELECT coalesce(jsonb_agg((elem - 'is_correct') ORDER BY ord), '[]'::jsonb)
                  FROM jsonb_array_elements(coalesce(q.options,'[]'::jsonb)) WITH ORDINALITY AS o(elem, ord)),
      'metadata', (coalesce(q.metadata,'{}'::jsonb) - 'ground_truth' - 'key_concepts')
    ) ORDER BY q.order_index
  ), '[]'::jsonb) INTO v_result
  FROM pde_assessment_questions q
  WHERE q.assessment_id=p_assessment_id
    AND q.question_type IN ('free_text_socratic','mcq_warmup','image_tag')
    AND (
      -- Unstaged question: always served, exactly as before this migration.
      q.stage_id IS NULL
      OR v_is_staff
      -- Staged: served only while its stage is open to this learner.
      OR EXISTS (
        SELECT 1 FROM pde_case_stages s
        WHERE s.id = q.stage_id
          AND (
            s.stage_order = 1
            OR EXISTS (
              SELECT 1 FROM pde_case_stages prev
              JOIN pde_case_stage_progress pr
                ON pr.stage_id = prev.id AND pr.learner_id = v_uid AND pr.attempt_number = v_attempt
              WHERE prev.assessment_id = s.assessment_id
                AND prev.stage_order = s.stage_order - 1
                AND pr.passed IS TRUE
            )
          )
      )
    );
  RETURN v_result;
END; $fn$;

-- SECURITY DEFINER replaced above → re-assert the anon lock-out.
REVOKE EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_pde_get_case_questions(uuid) TO authenticated;
