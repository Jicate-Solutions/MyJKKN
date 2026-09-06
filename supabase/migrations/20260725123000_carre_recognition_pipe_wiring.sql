-- ============================================================================
-- 20260725123000_carre_recognition_pipe_wiring.sql
-- CARRE instrumentation backlog #4 — Recognition pipe: wire real event sources
-- into the campus_living_recognition stream (module-tagged).
-- ============================================================================
-- Updated: 2026-07-25 — Lane A of the CARRE evidence instrumentation backlog
-- (specs/carre-evidence-instrumentation-backlog-2026-07-25.md, item 4).
--
-- PROBLEM: campus_living_recognition (keystone 20260612003000) has ZERO rows in
-- 90 days for every module, so fn_carre_item_evidence caps ALL R-items at 2
-- everywhere ("recognition exists in design only"). Recognition-generating
-- events already happen elsewhere — only the pipe is missing.
--
-- SURVEY (2026-07-25, live prod probes):
--   * campus_living_recognition: 0 rows total. Existing writers are the mess
--     Mode-B/Mode-C SECURITY DEFINER RPCs (20260622234500 / 20260623001000),
--     which INSERT inline at the moment of the event with a NOT EXISTS dedupe
--     on ref keys. This migration mirrors that exact pattern — no parallel
--     recognition mechanism is invented.
--   * ai_pulse_prompt_builds: 7 graded builds, 1 gold (score>=80, 4/4 parts).
--     Badges (first_prompt / gold_prompt) are computed on the fly by
--     fn_ai_pulse_scored_learners (20260724120000) — the discrete DB event that
--     EARNS a badge is a build row reaching grade_status='graded'. The grade is
--     written by fn_ai_pulse_record_prompt_grade (service-role cron).
--   * scf_note_resolution_votes: 3 rows, all vote='better' — the learner's own
--     confirmation that the class improved after their flag (the SCF loop's
--     fourth witness, 20260708190000). learner_id references learners_profiles
--     directly.
--
-- THE TWO WIRED SOURCES (both REAL, both already occurring):
--   1. AI Pulse badge awards → module 'academic' (public, mirrors the
--      leaderboard which is already name-visible to authenticated learners):
--        - event_type 'first_prompt': a learner's FIRST graded build that
--          passes the 4-part quality gate (role+context+task+format).
--        - event_type 'gold_prompt': any non-disqualified graded build whose
--          score reaches the Director-tunable leaderboard_gold_score_threshold
--          (ai_pulse_policies, default 80) with all 4 parts present.
--   2. SCF voice→confirmed-better → module 'academic' (PRIVATE, is_public =
--      false): when a learner votes 'better' on the suggestion their own flag
--      triggered. The SCF two-contract model keeps feedback ANONYMOUS TO THE
--      FACILITATOR — a public feed row would leak who flagged, so this fires a
--      private ping only. The CARRE evidence probe counts rows regardless of
--      is_public, so the R-item measure still moves.
--
-- MECHANISM: AFTER-row triggers on the two source tables (catches every writer
-- path — the service-role grade cron, the SECURITY DEFINER vote RPC, and any
-- future writer). Idempotent via NOT EXISTS on stable ref keys, exactly like
-- the existing mess writers — re-firing a trigger or re-running the backfill
-- never duplicates a row.
--
-- DOCTRINE: acts-not-scores (each row is a conferred act, never a rank);
-- recognition is CONFERRED, never claimed (no learner insert path is added);
-- rows are an append-only event log — a later disqualification stops FUTURE
-- confers but never deletes history; nothing is auto-applied to any human's
-- record (the stream is display + evidence only).
--
-- SECURITY: both trigger functions are SECURITY DEFINER with a pinned
-- search_path; EXECUTE is revoked from anon and PUBLIC (trigger functions are
-- not PostgREST-callable, but the lock is asserted anyway) and granted only to
-- service_role. campus_living_recognition RLS is untouched (write = admin-only
-- policy; these writers run as the function owner).
--
-- NOT APPLIED via this file — validated in a BEGIN..ROLLBACK Management-API
-- transaction only; the coordinator applies after review.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Source 1: AI Pulse graded prompt builds → 'academic' recognition
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
END;
$$;

-- Trigger functions are not PostgREST-callable, but assert the lock anyway.
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_recognition_from_prompt_build() TO service_role;

DROP TRIGGER IF EXISTS trg_recognition_from_prompt_build ON public.ai_pulse_prompt_builds;
CREATE TRIGGER trg_recognition_from_prompt_build
  AFTER INSERT OR UPDATE OF grade_status, grade, disqualified_at
  ON public.ai_pulse_prompt_builds
  FOR EACH ROW
  WHEN (NEW.grade_status = 'graded')
  EXECUTE FUNCTION public.fn_recognition_from_prompt_build();

COMMENT ON FUNCTION public.fn_recognition_from_prompt_build() IS
'CARRE recognition pipe (backlog #4, lane A): confers academic recognition (first_prompt once per learner; gold_prompt per gold-grade build at the leaderboard_gold_score_threshold) when an AI Pulse prompt build is graded through the 4-part quality gate. Idempotent via NOT EXISTS on stable ref keys. Append-only: later disqualification stops future confers, never deletes history.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. Source 2: SCF resolution vote 'better' → private 'academic' recognition
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_recognition_from_scf_resolution_vote() TO service_role;

DROP TRIGGER IF EXISTS trg_recognition_from_scf_resolution_vote ON public.scf_note_resolution_votes;
CREATE TRIGGER trg_recognition_from_scf_resolution_vote
  AFTER INSERT OR UPDATE OF vote
  ON public.scf_note_resolution_votes
  FOR EACH ROW
  WHEN (NEW.vote = 'better')
  EXECUTE FUNCTION public.fn_recognition_from_scf_resolution_vote();

COMMENT ON FUNCTION public.fn_recognition_from_scf_resolution_vote() IS
'CARRE recognition pipe (backlog #4, lane A): confers PRIVATE academic recognition (voice_confirmed_better, is_public=false — SCF anonymity contract) when a learner votes better on the suggestion their own flag triggered. Idempotent per (learner, suggestion).';

-- ────────────────────────────────────────────────────────────────────────
-- 3. Backfill — last 90 days of source events (bounded, idempotent).
--    Tables are small (7 builds, 3 votes at authoring); every INSERT carries
--    the same NOT EXISTS dedupe the triggers use, so re-running is a no-op.
-- ────────────────────────────────────────────────────────────────────────

-- 3a. first_prompt: one row per learner, anchored to their EARLIEST
--     quality-gate-passing graded build in the window.
INSERT INTO public.campus_living_recognition
  (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
SELECT DISTINCT ON (b.learner_id)
  b.learner_id, 'academic', 'first_prompt',
  'Your first quality-gated prompt build passed all four checks',
  'Role, context, task and output format were all present',
  jsonb_build_object('build_id', b.id, 'cycle_id', b.cycle_id),
  true, COALESCE(b.graded_at, b.updated_at)
FROM public.ai_pulse_prompt_builds b
WHERE b.grade_status = 'graded'
  AND b.disqualified_at IS NULL
  AND COALESCE(b.graded_at, b.updated_at) >= now() - interval '90 days'
  AND COALESCE((b.grade->>'has_role')::boolean,    false)
  AND COALESCE((b.grade->>'has_context')::boolean, false)
  AND COALESCE((b.grade->>'has_task')::boolean,    false)
  AND COALESCE((b.grade->>'has_format')::boolean,  false)
  AND EXISTS (SELECT 1 FROM public.learners_profiles lp WHERE lp.id = b.learner_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.campus_living_recognition r
    WHERE r.learner_id = b.learner_id
      AND r.module = 'academic' AND r.event_type = 'first_prompt'
  )
ORDER BY b.learner_id, COALESCE(b.graded_at, b.updated_at) ASC;

-- 3b. gold_prompt: per gold-grade build in the window.
INSERT INTO public.campus_living_recognition
  (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
SELECT
  b.learner_id, 'academic', 'gold_prompt',
  'Your prompt build earned the Gold Prompt badge',
  format('Scored %s/100 on the four-part quality check', COALESCE((b.grade->>'score')::numeric, 0)::int),
  jsonb_build_object('build_id', b.id, 'cycle_id', b.cycle_id, 'score', COALESCE((b.grade->>'score')::numeric, 0)),
  true, COALESCE(b.graded_at, b.updated_at)
FROM public.ai_pulse_prompt_builds b
WHERE b.grade_status = 'graded'
  AND b.disqualified_at IS NULL
  AND COALESCE(b.graded_at, b.updated_at) >= now() - interval '90 days'
  AND COALESCE((b.grade->>'has_role')::boolean,    false)
  AND COALESCE((b.grade->>'has_context')::boolean, false)
  AND COALESCE((b.grade->>'has_task')::boolean,    false)
  AND COALESCE((b.grade->>'has_format')::boolean,  false)
  AND COALESCE((b.grade->>'score')::numeric, 0) >= COALESCE((
        SELECT (p.value_jsonb#>>'{}')::numeric FROM public.ai_pulse_policies p
        WHERE p.config_key = 'leaderboard_gold_score_threshold' AND p.is_active
      ), 80)
  AND EXISTS (SELECT 1 FROM public.learners_profiles lp WHERE lp.id = b.learner_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.campus_living_recognition r
    WHERE r.module = 'academic' AND r.event_type = 'gold_prompt'
      AND r.ref->>'build_id' = b.id::text
  );

-- 3c. voice_confirmed_better: per current 'better' vote in the window (private).
INSERT INTO public.campus_living_recognition
  (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
SELECT
  v.learner_id, 'academic', 'voice_confirmed_better',
  'A change you flagged made the class better',
  CASE WHEN s.course_code IS NOT NULL
       THEN format('You confirmed the improvement in %s', s.course_code)
       ELSE 'You confirmed the improvement' END,
  jsonb_build_object('suggestion_id', v.suggestion_id),
  false, COALESCE(v.updated_at, v.created_at)
FROM public.scf_note_resolution_votes v
LEFT JOIN public.scf_ai_suggestions s ON s.id = v.suggestion_id
WHERE v.vote = 'better'
  AND COALESCE(v.updated_at, v.created_at) >= now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.campus_living_recognition r
    WHERE r.learner_id = v.learner_id
      AND r.module = 'academic' AND r.event_type = 'voice_confirmed_better'
      AND r.ref->>'suggestion_id' = v.suggestion_id::text
  );

NOTIFY pgrst, 'reload schema';
