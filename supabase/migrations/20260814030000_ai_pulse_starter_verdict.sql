-- ===========================================================================
-- AI Pulse — let a learner say whether a starter prompt actually worked.
-- Created: 2026-08-14 (allocated slot 20260814030000; verified free in the
-- repo AND in supabase_migrations.schema_migrations before writing).
-- ===========================================================================
--
-- WHY, MEASURED
--
-- The starter loop is supposed to improve itself: the generator reads last
-- cycle's signal and writes it into next week's prompt (its own code calls
-- this "the self-improvement hinge"). What travels through that hinge today
-- is EXPOSURE, not quality:
--
--     177 starters authored · 1,107 views · 9 copies      (a 0.8% signal)
--     dept_outcome_lift populated on 0 of 177 rows
--
-- A copy count cannot separate a good prompt from a well-announced one. The
-- 2026-08-06 cycle proved it: views went 50 -> 438 within an hour of the
-- announcement being fixed, and not one word of any prompt got better. Feed
-- that number back and the generator learns to be announced, not to be good.
--
-- The measurement designed to supply quality - fn_ai_pulse_measure_domain_
-- starters - has produced zero values in its lifetime and structurally cannot
-- cover the estate: it reaches a starter only via ai_pulse_live_attendance ->
-- fn_ai_pulse_learner_topics, which returns only 'course' and 'programme'. The
-- general fallback (4,343 learners) and the non-rotation programmes are
-- unreachable by construction, however long it runs.
--
-- A learner verdict does not depend on that join. It is the only quality
-- signal that can reach EVERY starter.
--
-- WHAT THIS SHIPS: the capture half only.
--   - 'worked' / 'didnt_work' become recordable actions
--   - the counters live beside views/copies on the starter row
--   - the existing DEFINER writer accepts them, plus an optional note
--
-- DELIBERATELY NOT IN THIS MIGRATION: feeding the verdict into
-- fn_ai_pulse_domain_starter_candidates -> prior_context -> the generator's
-- prompt. That function carries the autorevert best/last selection, and there
-- is no reason to tune a generator on data that does not exist yet. It follows
-- once a week of real verdicts has been collected.
--
-- NOT APPLIED BY THIS PR. The Director applies it by hand.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow the two verdict actions.
-- ---------------------------------------------------------------------------
-- 'report' is already permitted (added after the original substrate). This
-- widens the same constraint rather than adding a second one.
ALTER TABLE public.ai_pulse_domain_starter_events
  DROP CONSTRAINT IF EXISTS ai_pulse_domain_starter_events_action_check;

ALTER TABLE public.ai_pulse_domain_starter_events
  ADD CONSTRAINT ai_pulse_domain_starter_events_action_check
  CHECK (action IN ('view','copy','report','worked','didnt_work'));

-- ---------------------------------------------------------------------------
-- 2. Counters beside the existing views/copies, so a reader needs no join.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_pulse_domain_starters
  ADD COLUMN IF NOT EXISTS worked_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS didnt_work_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_pulse_domain_starters.worked_count IS
  'DISTINCT learners who said this starter worked for them. Quality signal, unlike views.';
COMMENT ON COLUMN public.ai_pulse_domain_starters.didnt_work_count IS
  'DISTINCT learners who said it did not. A learner holds at most one verdict at a time.';

-- ---------------------------------------------------------------------------
-- 3. The writer. Same function, one new optional argument.
-- ---------------------------------------------------------------------------
-- The 2-argument form is dropped and replaced by a 3-argument form whose third
-- argument DEFAULTs, so every existing caller - including the currently
-- deployed card, which passes only p_starter_id and p_action - keeps working
-- unchanged during the window between this migration being applied and the new
-- UI being deployed.
DROP FUNCTION IF EXISTS public.fn_ai_pulse_domain_starter_used(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_used(
  p_starter_id uuid,
  p_action     text,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_note text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_action NOT IN ('view','copy','worked','didnt_work') THEN
    RAISE EXCEPTION 'bad action';
  END IF;

  -- A free-text note is only meaningful on a verdict, and is capped so this
  -- can never become an unbounded write surface.
  v_note := CASE
              WHEN p_action IN ('worked','didnt_work')
                THEN NULLIF(btrim(left(COALESCE(p_note,''), 400)), '')
              ELSE NULL
            END;

  -- One verdict per learner per starter: changing your mind REPLACES the
  -- previous verdict rather than recording both. Without this the UNIQUE
  -- (starter_id, profile_id, action) would happily hold 'worked' AND
  -- 'didnt_work' for the same learner and both counters would be right at the
  -- same time, which is worse than either being wrong.
  IF p_action IN ('worked','didnt_work') THEN
    DELETE FROM ai_pulse_domain_starter_events e
     WHERE e.starter_id = p_starter_id
       AND e.profile_id = v_uid
       AND e.action IN ('worked','didnt_work')
       AND e.action <> p_action;
  END IF;

  INSERT INTO ai_pulse_domain_starter_events (starter_id, profile_id, action, note)
  VALUES (p_starter_id, v_uid, p_action, v_note)
  ON CONFLICT (starter_id, profile_id, action)
  DO UPDATE SET note = COALESCE(EXCLUDED.note, ai_pulse_domain_starter_events.note);

  UPDATE ai_pulse_domain_starters d SET
    views            = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='view'),
    copies           = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='copy'),
    worked_count     = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='worked'),
    didnt_work_count = (SELECT count(DISTINCT profile_id) FROM ai_pulse_domain_starter_events e WHERE e.starter_id = d.id AND e.action='didnt_work'),
    updated_at       = now()
  WHERE d.id = p_starter_id;
END; $function$;

-- Supabase's default privileges grant EXECUTE on every new function to anon,
-- separately from PUBLIC, so the revoke must name anon explicitly and must be
-- re-asserted with the EXACT signature after the DROP + CREATE above.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_used(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_used(uuid, text, text) TO authenticated;
