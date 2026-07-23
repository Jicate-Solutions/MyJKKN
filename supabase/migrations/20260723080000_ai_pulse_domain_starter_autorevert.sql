-- =====================================================================
-- AI Pulse — Domain Starter auto-revert (decision #19)
-- Created: 2026-07-23 - Add auto-revert to the self-improving prompt loop.
-- =====================================================================
-- The generation cron (app/api/cron/aipulse-domain-starter) seeds each cycle's
-- prompt from prior_context. Today that prior is ALWAYS the most-recent version
-- for the topic (ORDER BY created_at DESC LIMIT 1). So if last cycle's rewrite
-- LOWERED usage, the loop keeps building on the worse prompt — drift, not
-- improvement.
--
-- Auto-revert (design decision #19, "library only moves forward"): when enabled,
-- seed from the BEST prior version by copy-rate (copies / learner_count). When
-- the most-recent version regressed vs a better earlier one by more than a
-- margin, flag prior_context.reverted = true so buildPrompt tells the model to
-- go BACK toward the earlier, better-performing version instead of continuing
-- from the worse one.
--
-- DARK by default: gated behind policy 'domain_starter_autorevert_enabled'
-- (default false). When OFF, prior_context is byte-identical to today's
-- most-recent behavior — this migration changes NO live loop behavior until an
-- admin flips the switch. Control-cohort topics are unaffected: the cron passes
-- prior = null for control topics before it ever reads prior_context.
--
-- SECURITY DEFINER, service_role only (the generation cron is the single
-- caller). CREATE OR REPLACE of a previously anon-locked SECDEF fn re-trips the
-- secdef-anon-revoke CI gate, so the REVOKE/GRANT is re-asserted below.

-- 1. Config rows (house rule: every switch = a policy row). Do NOT clobber a
--    value a human already set.
INSERT INTO ai_pulse_policies (config_key, display_name, description, value_jsonb, data_type)
VALUES
  ('domain_starter_autorevert_enabled',
   'Domain Starter: auto-revert on worse usage',
   'When on, next cycle seeds each subject prompt from its BEST prior version by copy-rate and reverts if the most-recent version lost usage. Dark by default.',
   'false'::jsonb, 'bool'),
  ('domain_starter_revert_margin',
   'Domain Starter: auto-revert copy-rate margin',
   'A prior version must beat the most-recent version by more than this copy-rate margin (copies/learner) before the loop reverts to it. Guards against reverting on noise.',
   '0.05'::jsonb, 'float')
ON CONFLICT (config_key) DO NOTHING;

-- 2. Replace the candidates hinge with the gated auto-revert logic.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_candidates(p_cycle_id uuid, p_min_learners integer DEFAULT 3)
 RETURNS TABLE(topic_type text, topic_id uuid, topic_label text, institution_id uuid, learner_count integer, prior_context jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_autorevert boolean;
  v_margin numeric;
BEGIN
  -- Dark-by-default toggle + noise margin (config rows above).
  SELECT COALESCE((value_jsonb)::boolean, false) INTO v_autorevert
  FROM ai_pulse_policies
  WHERE config_key = 'domain_starter_autorevert_enabled' AND is_active
  LIMIT 1;
  v_autorevert := COALESCE(v_autorevert, false);

  SELECT COALESCE((value_jsonb)::numeric, 0.05) INTO v_margin
  FROM ai_pulse_policies
  WHERE config_key = 'domain_starter_revert_margin' AND is_active
  LIMIT 1;
  v_margin := COALESCE(v_margin, 0.05);

  RETURN QUERY
  WITH attendees AS (
    SELECT DISTINCT p.learner_id
    FROM ai_pulse_live_attendance a
    JOIN profiles p ON p.id = a.profile_id
    WHERE a.event_id = p_cycle_id AND a.day_type = 'live_session'
      AND p.learner_id IS NOT NULL
  ),
  resolved AS (
    SELECT t.topic_type, t.topic_id, t.topic_label, t.institution_id
    FROM attendees at CROSS JOIN LATERAL public.fn_ai_pulse_learner_topics(at.learner_id) t
  ),
  grouped AS (
    SELECT topic_type, topic_id,
           max(topic_label)              AS topic_label,
           max(institution_id::text)::uuid AS institution_id,
           count(*)::int                 AS learner_count
    FROM resolved
    GROUP BY topic_type, topic_id
    HAVING count(*) >= p_min_learners      -- >=3 floor: relevance + privacy
  )
  SELECT g.topic_type, g.topic_id, g.topic_label, g.institution_id, g.learner_count,
    CASE
      -- AUTO-REVERT ON: seed from best-by-copy-rate; revert flag when latest regressed.
      WHEN v_autorevert THEN
        COALESCE((
          SELECT jsonb_build_object(
            'prior_cycle_id', CASE WHEN rev THEN best_cycle_id ELSE last_cycle_id END,
            'prior_prompt',   CASE WHEN rev THEN best_prompt   ELSE last_prompt   END,
            'prior_views',    CASE WHEN rev THEN best_views    ELSE last_views    END,
            'prior_copies',   CASE WHEN rev THEN best_copies   ELSE last_copies   END,
            'prior_lift',     CASE WHEN rev THEN best_lift     ELSE last_lift     END,
            'reverted',       rev,
            'best_copy_rate', best_copy_rate,
            'last_copy_rate', last_copy_rate
          )
          FROM (
            SELECT
              lp.cycle_id          AS last_cycle_id,
              lp.final_prompt      AS last_prompt,
              lp.views             AS last_views,
              lp.copies            AS last_copies,
              lp.dept_outcome_lift AS last_lift,
              lp.copy_rate         AS last_copy_rate,
              bp.cycle_id          AS best_cycle_id,
              bp.final_prompt      AS best_prompt,
              bp.views             AS best_views,
              bp.copies            AS best_copies,
              bp.dept_outcome_lift AS best_lift,
              bp.copy_rate         AS best_copy_rate,
              (bp.cycle_id IS NOT NULL
                 AND bp.cycle_id IS DISTINCT FROM lp.cycle_id
                 AND bp.copy_rate > COALESCE(lp.copy_rate, 0) + v_margin) AS rev
            FROM
              -- latest prior version for this topic (unchanged legacy seed)
              (SELECT d.cycle_id, d.final_prompt, d.views, d.copies, d.dept_outcome_lift,
                      (d.copies::numeric / NULLIF(d.learner_count, 0)) AS copy_rate
               FROM ai_pulse_domain_starters d
               WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
                 AND d.cycle_id <> p_cycle_id
               ORDER BY d.created_at DESC
               LIMIT 1) lp
              -- best prior version by copy-rate (only versions with real usage signal)
              LEFT JOIN LATERAL
              (SELECT d.cycle_id, d.final_prompt, d.views, d.copies, d.dept_outcome_lift,
                      (d.copies::numeric / NULLIF(d.learner_count, 0)) AS copy_rate
               FROM ai_pulse_domain_starters d
               WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
                 AND d.cycle_id <> p_cycle_id
                 AND d.final_prompt IS NOT NULL
                 AND d.learner_count > 0
                 AND d.copies IS NOT NULL
               ORDER BY (d.copies::numeric / NULLIF(d.learner_count, 0)) DESC NULLS LAST,
                        d.created_at DESC
               LIMIT 1) bp ON true
          ) prior_pick
        ), '{}'::jsonb)
      -- AUTO-REVERT OFF (default): most-recent prior, byte-identical to legacy.
      ELSE
        COALESCE((
          SELECT jsonb_build_object(
                   'prior_cycle_id', d.cycle_id,
                   'prior_prompt',   d.final_prompt,
                   'prior_views',    d.views,
                   'prior_copies',   d.copies,
                   'prior_lift',     d.dept_outcome_lift)
          FROM ai_pulse_domain_starters d
          WHERE d.topic_type = g.topic_type AND d.topic_id = g.topic_id
            AND d.cycle_id <> p_cycle_id
          ORDER BY d.created_at DESC LIMIT 1
        ), '{}'::jsonb)
    END AS prior_context
  FROM grouped g;
END; $function$;

-- 3. Anon-lock. CREATE OR REPLACE re-trips the secdef-anon-revoke CI gate on a
--    previously-locked fn, so re-assert (memory: feedback_secdef_anon_gate_flags_create_or_replace).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_candidates(uuid, integer) TO service_role;
