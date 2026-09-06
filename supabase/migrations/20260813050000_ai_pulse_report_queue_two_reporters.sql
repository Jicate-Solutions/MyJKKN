-- Updated: 2026-08-06 - One report should not put a learner's name in front of a champion.
--
-- fn_ai_pulse_champion_report_queue admitted any build with >= 1 report, so a
-- single learner could push a peer's prompt - and that peer's real name, which
-- the function returns as author_name - into the champion review queue on their
-- own. It did this even for a build that was never published.
--
-- The threshold now comes from the policy row this module already has:
-- ai_pulse_policies.prompt_report_autohide_threshold (live value 2). That key
-- already decides when a reported prompt disappears from the shared library
-- (fn_ai_pulse_topic_graduated_prompts reads the same row), so reusing it makes
-- the two behaviours provably consistent: a prompt enters the champion queue at
-- exactly the moment it stops being visible to learners. One knob, not two.
--
-- Auto-hide is a READ-TIME filter and never writes disqualified_at, so raising
-- this threshold does not strand builds outside the queue - the queue's
-- disqualified_at / report_cleared_at filters remain champion decisions only.
--
-- Nothing else about the function changes: the permission guard, the
-- institution scoping and the returned columns are preserved verbatim.

CREATE OR REPLACE FUNCTION public.fn_ai_pulse_champion_report_queue(p_limit integer DEFAULT 50)
 RETURNS TABLE(build_id uuid, assembled_prompt text, score numeric, author_name text, institution_id uuid, report_count bigint, report_reasons text[], last_reported_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_min_reports integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- COALESCE'd because a NULL from either helper would make `NOT (a OR b)` NULL,
  -- the IF fall through, and the guard silently open.
  IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
    RAISE EXCEPTION 'Not allowed: only a champion can review reported prompts.' USING ERRCODE = '42501';
  END IF;

  -- A missing, inactive or non-numeric policy row must NOT fall back to the old
  -- one-report behaviour, so the COALESCE default is 2 rather than 1, and
  -- GREATEST pins the floor at 1 so a mistaken 0 cannot admit unreported builds.
  v_min_reports := GREATEST(
    COALESCE(
      (SELECT (value_jsonb #>> '{}')::integer
         FROM ai_pulse_policies
        WHERE config_key = 'prompt_report_autohide_threshold'
          AND is_active
        LIMIT 1),
      2),
    1);

  RETURN QUERY
  SELECT b.id AS build_id,
         b.assembled_prompt,
         (b.grade->>'score')::numeric AS score,
         NULLIF(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS author_name,
         b.institution_id,
         agg.report_count,
         agg.report_reasons,
         agg.last_reported_at
  FROM ai_pulse_prompt_builds b
  -- One aggregate pass per build; the ON clause is what filters to the
  -- threshold (an aggregate over zero rows still returns one row, with count 0).
  JOIN LATERAL (
    SELECT count(DISTINCT r.reporter_profile_id)::bigint                    AS report_count,
           COALESCE(array_agg(DISTINCT r.reason)
                    FILTER (WHERE btrim(coalesce(r.reason,'')) <> ''),
                    ARRAY[]::text[])                                        AS report_reasons,
           max(r.created_at)                                                AS last_reported_at
    FROM ai_pulse_prompt_build_reports r
    WHERE r.build_id = b.id
  ) agg ON agg.report_count >= v_min_reports
  LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
  WHERE b.disqualified_at  IS NULL     -- champion has not HIDDEN it yet
    AND b.report_cleared_at IS NULL    -- champion has not KEPT it yet
    AND role_has_institution_access(b.institution_id)
  ORDER BY agg.last_reported_at DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 50);
END; $function$;

-- Supabase's default privileges grant EXECUTE on every new function to anon,
-- separate from PUBLIC, so the revoke must name anon explicitly and must be
-- re-asserted with the EXACT signature after every CREATE OR REPLACE.
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_champion_report_queue(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_champion_report_queue(integer) TO authenticated;
