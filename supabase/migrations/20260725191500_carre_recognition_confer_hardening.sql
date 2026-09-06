-- ============================================================================
-- 20260725191500_carre_recognition_confer_hardening.sql
-- CARRE recognition pipe hardening (follow-up to 20260725123000, Lane A):
-- belt-and-braces dedupe indexes + confer-failure isolation.
-- ============================================================================
-- Updated: 2026-07-25 — rank-5 of the CARRE evidence instrumentation arc
-- (specs/carre-evidence-instrumentation-backlog-2026-07-25.md follow-through).
--
-- WHY (two hardening gaps left open by 20260725123000):
--
--   1. DEDUPE IS ADVISORY, NOT ENFORCED. Both confer trigger functions dedupe
--      via NOT EXISTS on stable ref keys. Under concurrent writers (the
--      service-role grade cron re-firing, a backfill re-run racing a live
--      grade) two transactions can both pass NOT EXISTS before either commits,
--      conferring the same act twice. The evidence probe counts rows —
--      duplicate confers would silently inflate the R-item measure.
--      Fix: three UNIQUE partial indexes that make each confer key
--      database-enforced. Pre-checked live 2026-07-25: 0 duplicate keys and
--      0 NULL ref keys among existing rows, so index creation is safe.
--
--   2. A CONFER FAILURE ABORTS THE SOURCE WRITE. The triggers run AFTER-row
--      inside the source transaction: any unexpected error inside the confer
--      (including a unique_violation from the new indexes under a race, a
--      policy-table hiccup, a future schema drift) would bubble up and roll
--      back the GRADE WRITE or the LEARNER'S VOTE itself. Recognition is a
--      side-effect; it must never be able to break the act it recognises.
--      Fix: wrap each trigger body in BEGIN ... EXCEPTION WHEN OTHERS — on
--      any confer error, RAISE WARNING (observable in logs) and let the
--      source row commit untouched.
--
-- Both functions below are byte-identical to the live prod definitions
-- (pulled via pg_get_functiondef 2026-07-25, matching 20260725123000)
-- except for the isolation wrapper — no confer logic is changed.
--
-- DOCTRINE unchanged: acts-not-scores; recognition is conferred, never
-- claimed; append-only history; nothing auto-applies to any human's record.
--
-- NOT APPLIED via this file — validated in a BEGIN..ROLLBACK Management-API
-- transaction, then applied by the coordinator; this file is the repo record.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Unique partial indexes — database-enforced confer dedupe.
--    Each mirrors the exact NOT EXISTS key its trigger already uses.
-- ────────────────────────────────────────────────────────────────────────

-- first_prompt: once per learner, ever (module-scoped to academic).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cl_recognition_academic_first_prompt
  ON public.campus_living_recognition (learner_id)
  WHERE module = 'academic' AND event_type = 'first_prompt';

-- gold_prompt: once per graded build (the build id is the act's identity).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cl_recognition_academic_gold_prompt
  ON public.campus_living_recognition ((ref->>'build_id'))
  WHERE module = 'academic' AND event_type = 'gold_prompt';

-- voice_confirmed_better: once per (learner, suggestion) pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cl_recognition_academic_voice_better
  ON public.campus_living_recognition (learner_id, (ref->>'suggestion_id'))
  WHERE module = 'academic' AND event_type = 'voice_confirmed_better';

-- ────────────────────────────────────────────────────────────────────────
-- 2. fn_recognition_from_prompt_build — same logic, isolation-wrapped.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recognition_from_prompt_build()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass boolean;
  v_score numeric;
  v_gold_threshold numeric;
BEGIN
  BEGIN
    -- Only graded, non-disqualified builds with a grade payload confer anything.
    IF NEW.grade_status <> 'graded' OR NEW.grade IS NULL OR NEW.disqualified_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- The 4-part quality gate (same gate the leaderboard scores against).
    v_pass := COALESCE((NEW.grade->>'has_role')::boolean,    false)
          AND COALESCE((NEW.grade->>'has_context')::boolean, false)
          AND COALESCE((NEW.grade->>'has_task')::boolean,    false)
          AND COALESCE((NEW.grade->>'has_format')::boolean,  false);
    IF NOT v_pass THEN
      RETURN NEW;
    END IF;

    -- FK guard: recognition rows reference learners_profiles.
    IF NOT EXISTS (SELECT 1 FROM public.learners_profiles lp WHERE lp.id = NEW.learner_id) THEN
      RETURN NEW;
    END IF;

    -- first_prompt: once per learner, ever (mirrors the leaderboard badge).
    INSERT INTO public.campus_living_recognition
      (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
    SELECT
      NEW.learner_id, 'academic', 'first_prompt',
      'Your first quality-gated prompt build passed all four checks',
      'Role, context, task and output format were all present',
      jsonb_build_object('build_id', NEW.id, 'cycle_id', NEW.cycle_id),
      true, COALESCE(NEW.graded_at, now())
    WHERE NOT EXISTS (
      SELECT 1 FROM public.campus_living_recognition r
      WHERE r.learner_id = NEW.learner_id
        AND r.module = 'academic' AND r.event_type = 'first_prompt'
    );

    -- gold_prompt: per gold-grade build (Director-tunable threshold, default 80).
    v_score := COALESCE((NEW.grade->>'score')::numeric, 0);
    SELECT COALESCE((p.value_jsonb#>>'{}')::numeric, 80) INTO v_gold_threshold
    FROM public.ai_pulse_policies p
    WHERE p.config_key = 'leaderboard_gold_score_threshold' AND p.is_active;
    v_gold_threshold := COALESCE(v_gold_threshold, 80);

    IF v_score >= v_gold_threshold THEN
      INSERT INTO public.campus_living_recognition
        (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
      SELECT
        NEW.learner_id, 'academic', 'gold_prompt',
        'Your prompt build earned the Gold Prompt badge',
        format('Scored %s/100 on the four-part quality check', v_score::int),
        jsonb_build_object('build_id', NEW.id, 'cycle_id', NEW.cycle_id, 'score', v_score),
        true, COALESCE(NEW.graded_at, now())
      WHERE NOT EXISTS (
        SELECT 1 FROM public.campus_living_recognition r
        WHERE r.module = 'academic' AND r.event_type = 'gold_prompt'
          AND r.ref->>'build_id' = NEW.id::text
      );
    END IF;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Confer isolation: recognition is a side-effect and must never abort the
    -- grade write. A racing duplicate lands here via unique_violation from the
    -- partial indexes above — the confer already exists, so skipping is
    -- correct. Everything else is logged for observability, never re-raised.
    RAISE WARNING 'fn_recognition_from_prompt_build: confer skipped for build % (learner %): %',
      NEW.id, NEW.learner_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE resets nothing, but the CI secdef gate treats a replaced
-- fn as new — re-assert the full lock set in the same migration.
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() TO service_role;

COMMENT ON FUNCTION public.fn_recognition_from_prompt_build() IS
'CARRE recognition pipe (lane A, hardened 2026-07-25): confers academic recognition (first_prompt once per learner; gold_prompt per gold-grade build at the leaderboard_gold_score_threshold) when an AI Pulse prompt build is graded through the 4-part quality gate. Dedupe is database-enforced by unique partial indexes; the confer body is exception-isolated so a recognition failure can never abort the grade write. Append-only: later disqualification stops future confers, never deletes history.';

-- ────────────────────────────────────────────────────────────────────────
-- 3. fn_recognition_from_scf_resolution_vote — same logic, isolation-wrapped.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recognition_from_scf_resolution_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_code text;
BEGIN
  BEGIN
    IF NEW.vote <> 'better' THEN
      RETURN NEW;
    END IF;

    SELECT s.course_code INTO v_course_code
    FROM public.scf_ai_suggestions s
    WHERE s.id = NEW.suggestion_id;

    -- PRIVATE by design (is_public=false): the SCF two-contract model keeps
    -- feedback anonymous to the facilitator; a public feed row would leak who
    -- flagged the class. The learner still gets the private ping and the CARRE
    -- evidence probe still counts the row.
    INSERT INTO public.campus_living_recognition
      (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
    SELECT
      NEW.learner_id, 'academic', 'voice_confirmed_better',
      'A change you flagged made the class better',
      CASE WHEN v_course_code IS NOT NULL
           THEN format('You confirmed the improvement in %s', v_course_code)
           ELSE 'You confirmed the improvement' END,
      jsonb_build_object('suggestion_id', NEW.suggestion_id),
      false, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.campus_living_recognition r
      WHERE r.learner_id = NEW.learner_id
        AND r.module = 'academic' AND r.event_type = 'voice_confirmed_better'
        AND r.ref->>'suggestion_id' = NEW.suggestion_id::text
    );

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Confer isolation: a recognition failure must never abort the learner's
    -- vote. Racing duplicates land here via unique_violation (already
    -- conferred — skipping is correct); everything else is logged.
    RAISE WARNING 'fn_recognition_from_scf_resolution_vote: confer skipped for vote % (learner %): %',
      NEW.id, NEW.learner_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() TO service_role;

COMMENT ON FUNCTION public.fn_recognition_from_scf_resolution_vote() IS
'CARRE recognition pipe (lane A, hardened 2026-07-25): confers PRIVATE academic recognition (voice_confirmed_better, is_public=false — SCF anonymity contract) when a learner votes better on the suggestion their own flag triggered. Dedupe is database-enforced by a unique partial index; the confer body is exception-isolated so a recognition failure can never abort the vote.';
