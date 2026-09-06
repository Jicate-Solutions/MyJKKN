-- Migration: 20260813040000_ai_pulse_switchable_cycles_all_attended.sql
-- Updated: 2026-08-13 — AI Pulse week switcher: show every session the learner
--                       attended, and say so plainly when a week has no prompt.
--
-- WHY
-- ---
-- 20260722210000 narrowed the week switcher to cycles where a Domain Starter
-- matched the learner's own topics. That fixed dead-end weeks but overshot: a
-- learner who ATTENDED a live session cannot get back to that week at all when
-- no prompt was written for their programme. Live check (2026-08-06) on a real
-- learner who attended 5 sessions: the switcher offered 2 weeks, and 4 weeks
-- they genuinely sat through were invisible.
--
-- Director's decision: show EVERY past session the learner attended. Where
-- there is no prompt for their programme that week, the page says so plainly
-- instead of hiding the week.
--
-- WHAT CHANGES
-- ------------
-- 1. Rows returned = cycles the learner ATTENDED  ∪  cycles that have a prompt
--    for them. The union (not attendance alone) is deliberate: the CURRENT week
--    routinely has starters but zero attendance until the session runs, so an
--    attendance-only rule would drop the live week out of the switcher — a
--    regression on the very thing 20260722210000 shipped. Verified live: the
--    newest cycle (2026-08-06) has 121 starters and 0 attendance rows.
--
-- 2. New column has_prompt — lets the page render an honest empty state instead
--    of an invisible week.
--
--    has_prompt MIRRORS fn_ai_pulse_my_domain_starters, which is what the
--    learner's card actually reads. That read fn falls back to a cycle-wide
--    topic_type='general' starter when the learner's own topics have none
--    (Director decision #6, 2026-07-30). So has_prompt is TRUE when either
--    (a) a starter matches the learner's own course/programme topics, or
--    (b) a 'general' starter exists for that cycle.
--    Scoring only (a) would print "no prompt this week" on a week where the
--    card then renders the general prompt — the page would contradict itself.
--    Live check: cycle 2026-08-06 carries 1 general starter, so the fallback
--    path is reachable today, not theoretical.
--
-- UNCHANGED (load-bearing — do not drop)
-- --------------------------------------
--   * DARK kill-switch gate on ai_pulse_policies.domain_starter_enabled.
--   * Identity resolved ONLY from profiles.learner_id for auth.uid(), so a
--     learner can never enumerate another learner's cycles.
--   * status <> 'cancelled', ORDER BY start_date DESC NULLS LAST, LIMIT.
--
-- The RETURNS TABLE shape changes, so the old function must be DROPped first;
-- the grants are therefore re-asserted below (a bare CREATE would leave the new
-- function EXECUTE-able by anon via Supabase's ALTER DEFAULT PRIVILEGES).

DROP FUNCTION IF EXISTS public.fn_ai_pulse_switchable_cycles(int);

CREATE FUNCTION public.fn_ai_pulse_switchable_cycles(p_limit int DEFAULT 12)
RETURNS TABLE(
  cycle_id   uuid,
  name       text,
  start_date timestamptz,
  end_date   timestamptz,
  status     text,
  has_prompt boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_profile uuid;
  v_learner uuid;
BEGIN
  -- DARK gate: invisible to learners until the kill switch is on (mirrors read
  -- fn). COALESCE is load-bearing — a NULL guard would fall silently OPEN.
  IF NOT COALESCE((SELECT (value_jsonb#>>'{}')::boolean FROM ai_pulse_policies
                   WHERE config_key = 'domain_starter_enabled' AND is_active), false) THEN
    RETURN;
  END IF;

  -- Identity comes from the session and nowhere else. v_profile keys attendance
  -- (ai_pulse_live_attendance.profile_id); v_learner keys topics.
  v_profile := auth.uid();
  IF v_profile IS NULL THEN RETURN; END IF;

  SELECT p.learner_id INTO v_learner FROM profiles p WHERE p.id = v_profile;
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH topics AS (
    SELECT t.topic_type, t.topic_id
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
  ),
  scored AS (
    SELECT
      e.id, e.name, e.start_date, e.end_date, e.status,
      -- Mirrors fn_ai_pulse_my_domain_starters: own topics first, else the
      -- cycle-wide 'general' fallback.
      COALESCE(
        EXISTS (
          SELECT 1
          FROM topics t
          JOIN ai_pulse_domain_starters d
            ON d.topic_type = t.topic_type
           AND d.topic_id   = t.topic_id
           AND d.cycle_id   = e.id
          WHERE d.final_prompt IS NOT NULL)
        OR EXISTS (
          SELECT 1
          FROM ai_pulse_domain_starters g
          WHERE g.cycle_id   = e.id
            AND g.topic_type = 'general'
            AND g.final_prompt IS NOT NULL),
        false) AS has_prompt,
      COALESCE(
        EXISTS (
          SELECT 1
          FROM ai_pulse_live_attendance a
          WHERE a.event_id   = e.id
            AND a.day_type   = 'live_session'
            AND a.profile_id = v_profile),
        false) AS attended
    FROM startup_events e
    WHERE e.config->>'kind' = 'ai_pulse'
      AND e.status <> 'cancelled'
  )
  SELECT s.id, s.name, s.start_date, s.end_date, s.status, s.has_prompt
  FROM scored s
  WHERE s.attended OR s.has_prompt
  ORDER BY s.start_date DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END; $function$;

-- Re-assert after the DROP: Supabase's default ALTER DEFAULT PRIVILEGES grants
-- EXECUTE on every new function to anon, so a fresh CREATE is open by default.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_switchable_cycles(int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_switchable_cycles(int) TO authenticated;
