-- =====================================================================
-- AI Pulse — Star-Prompt Library v2: champion review queue (moderation #3)
-- Created: 2026-08-04 - A senior learner decides on a reported feed prompt.
-- =====================================================================
-- DIRECTOR'S LOCKED DECISION #3 (verbatim)
--   "REPORT SPEED = a champion decides — reported feed prompts route to a
--    senior learner to decide; NO auto-hide."
--
-- WHAT CHANGES
-- ------------
-- Today the classmates FEED (fn_ai_pulse_topic_peer_prompts) silently hides a
-- build once >= prompt_report_autohide_threshold DISTINCT learners flag it. That
-- is a machine deciding. The Director wants a PERSON deciding. So:
--
--   (1) the FEED read drops its auto-hide clause entirely, and
--   (2) a new champion-only read RPC surfaces every build that is waiting on a
--       human decision, so a champion can HIDE it or KEEP it.
--
-- THE TRADEOFF, STATED PLAINLY (not hidden)
-- -----------------------------------------
-- With auto-hide removed, a reported feed prompt STAYS VISIBLE until a champion
-- acts. That is a deliberate Director choice, not an oversight. Compensating
-- controls already in place:
--   * the ₹0 AI safety pre-gate (migration 20260804110000, moderation #1) —
--     every feed prompt is judged APPROPRIATE before it can appear at all, so a
--     report is a second-opinion signal, not the first line of defence;
--   * fn_ai_pulse_disqualify_prompt_build — a champion's HIDE is immediate and
--     permanent (the feed keeps `AND b.disqualified_at IS NULL`);
--   * the feed is still DARK (prompt_classmates_feed_enabled = false), so this
--     migration changes NOTHING that any learner can see today.
--
-- SCOPE NOTE — THE LIBRARY KEEPS ITS AUTO-HIDE ON PURPOSE
-- ------------------------------------------------------
-- fn_ai_pulse_topic_graduated_prompts (the shared graduated LIBRARY, a different
-- surface with a different owner PR) is deliberately NOT touched here. It keeps
-- reading prompt_report_autohide_threshold and keeps auto-hiding. Editing it in
-- this migration would collide with that PR and would silently revert it. The
-- policy row prompt_report_autohide_threshold therefore stays live and in use —
-- only the FEED stops consulting it.
--
-- NO NEW STATE COLUMN (simplest-first): "pending champion review" is fully
-- DERIVABLE from columns that already exist —
--   >= 1 row in ai_pulse_prompt_build_reports
--   AND disqualified_at IS NULL      (champion has not hidden it)
--   AND report_cleared_at IS NULL    (champion has not kept it)
-- A champion's decision writes one of those two timestamps via the EXISTING
-- RPCs, which drops the row out of the queue. No new write path is added.

-- ---------------------------------------------------------------------------
-- 1. FEED read — auto-hide REMOVED (Director decision #3).
--    Base is the safety-gated version (20260804110000). The ONLY changes are:
--      - the `AND NOT ( report_cleared_at IS NULL AND count(distinct reporter)
--        >= v_threshold )` block is deleted, and
--      - the now-unused v_threshold DECLARE + its policy SELECT are deleted.
--    EVERYTHING else is byte-for-byte the same: the learner-identity guard, the
--    prompt_classmates_feed_enabled kill switch, the safety_status='passed'
--    fail-closed gate, the 60-79 band, self-exclusion, match-by-NAME across all
--    colleges, and `AND b.disqualified_at IS NULL`. Signature UNCHANGED
--    (id, assembled_prompt, score, used_count) — the sole TS caller is untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_topic_peer_prompts(p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 6)
 RETURNS TABLE(id uuid, assembled_prompt text, score numeric, used_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner   uuid;
  v_name      text;                              -- subject name to match (NULL for global)
BEGIN
  -- Identity from the session only (self-scoped; confused-deputy guard).
  SELECT p.learner_id INTO v_learner FROM profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN;  -- learners only
  END IF;

  -- Kill switch (safeguarding): campus-wide feed of UNGRADED-quality peer prompts;
  -- the AI grader scores craft, not content safety. Dark by default; the Director
  -- flips 'prompt_classmates_feed_enabled' to turn it on. Per-item guards still apply.
  IF NOT COALESCE((SELECT (value_jsonb)::boolean FROM ai_pulse_policies
                   WHERE config_key = 'prompt_classmates_feed_enabled' AND is_active LIMIT 1), false) THEN
    RETURN;
  END IF;

  -- Resolve the caller's topic to a SUBJECT NAME. 'global' has no name (matched by type).
  IF p_topic_type = 'programme' THEN
    SELECT pr.program_name INTO v_name FROM programs pr WHERE pr.id = p_topic_id;
  ELSIF p_topic_type = 'course' THEN
    SELECT c.course_name INTO v_name FROM courses c WHERE c.id = p_topic_id;
  ELSIF p_topic_type = 'global' THEN
    v_name := NULL;
  ELSE
    RETURN;  -- unknown topic type
  END IF;

  IF p_topic_type <> 'global' AND v_name IS NULL THEN
    RETURN;  -- topic id didn't resolve to a name -> nothing to match
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.assembled_prompt,
         (b.grade->>'score')::numeric AS score,
         COALESCE((
           SELECT count(DISTINCT u.profile_id)
           FROM ai_pulse_prompt_build_uses u
           WHERE u.build_id = b.id AND u.action = 'copy'
         ), 0) AS used_count
  FROM ai_pulse_prompt_builds b
  LEFT JOIN programs bpr ON b.topic_type = 'programme' AND bpr.id = b.topic_id
  LEFT JOIN courses  bco ON b.topic_type = 'course'    AND bco.id = b.topic_id
  WHERE b.graduated_at IS NULL                    -- NON-star: not yet graduated
    -- Decent-but-not-yet-star band. >=80 would auto-graduate on quality; this is
    -- the popularity lane where copies (>=3 distinct) can promote it.
    AND (b.grade->>'score')::numeric BETWEEN 60 AND 79
    AND b.learner_id <> v_learner                 -- never the caller's own builds
    -- Match the SAME subject by NAME across ALL colleges (no institution scope). [#2]
    AND (
         (p_topic_type = 'programme' AND b.topic_type = 'programme' AND bpr.program_name = v_name)
      OR (p_topic_type = 'course'    AND b.topic_type = 'course'    AND bco.course_name  = v_name)
      OR (p_topic_type = 'global'    AND b.topic_type = 'global')
    )
    -- SAFETY GATE (moderation #1, safeguarding minors): show ONLY after the ₹0 AI
    -- safety check judged the prompt APPROPRIATE. Fail-closed — pending/failed/
    -- error/NULL never surface. The grader scores craft; THIS gates content.
    AND b.safety_status = 'passed'
    -- Champion disqualify: a disqualified build NEVER surfaces. This is the
    -- champion's HIDE decision, and it is now the ONLY thing that removes a
    -- reported build from the feed (moderation #3 — no auto-hide).
    AND b.disqualified_at IS NULL
  ORDER BY (b.grade->>'score')::numeric DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 6);
END; $function$;

-- Re-assert the anon lock (Supabase default-privileges re-grants anon on
-- CREATE OR REPLACE; the secdef-anon gate treats this replace as a new fn).
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_topic_peer_prompts(text, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Champion review queue — the builds AWAITING a human decision.
-- ---------------------------------------------------------------------------
-- ai_pulse_prompt_build_reports is RLS-deny-all with NO policies, so a SECURITY
-- DEFINER fn is the ONLY read path to the flags. That is the intended design and
-- this fn mirrors it: the RUNTIME GUARD is the gate, not the GRANT.
--
-- AUTHOR NAME is returned on purpose. A champion cannot make a moderation call
-- on an anonymous body of text — repeated offenders, context, and the "is this a
-- real complaint" judgement all need the author. This surface is permission-
-- gated (aiPulse:anomaly.review) and institution-scoped, NOT campus-wide; the
-- learner-facing feed/library stay anonymised.
--
-- WHICH PERMISSION — DIRECTOR'S RETARGET (2026-08-04)
-- --------------------------------------------------
--   "Only the 3 designated AI Pulse champions should open the moderation page
--    and decide on reported prompts."
-- So the gate is aiPulse:anomaly.review, NOT aiPulse:lab.score. Measured live
-- BY VALUE (a key present with value false is NOT granted):
--   * role ai_pulse_champion — the purpose-built champion role, 3 members —
--     holds anomaly.review = TRUE and lab.score = FALSE. Gated on lab.score
--     this page was unopenable by the designated cohort except through their
--     incidental super-admin bypass.
--   * lab.score = TRUE for ~587 staff per the roles that hold it. Gating here
--     on it would have exposed learner names + reported prompt text to all of
--     them, and would have made "grant Monday-Lab peer-scoring power" the
--     prerequisite for becoming a moderator.
-- anomaly.review is also what the sibling champion console
-- /ai-pulse/admin/anomalies already enforces, so the two moderation surfaces
-- now share one grantable key.
--
-- INSTITUTION SCOPE: role_has_institution_access(b.institution_id) — house rule
-- for any read of a table carrying institution_id, and load-bearing here because
-- the payload includes a learner's name. A champion with an 'own'-scope role sees
-- only their own college's reports; a super admin / 'all'-scope role sees every
-- college. (Reports are already intra-institution by construction:
-- fn_ai_pulse_report_prompt_build refuses cross_institution flags.)
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_champion_report_queue(p_limit integer DEFAULT 50)
 RETURNS TABLE(
   build_id         uuid,
   assembled_prompt text,
   score            numeric,
   author_name      text,
   institution_id   uuid,
   report_count     bigint,
   report_reasons   text[],
   last_reported_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- COALESCE'd because a NULL from either helper would make `NOT (a OR b)` NULL,
  -- the IF fall through, and the guard silently open.
  IF NOT COALESCE(is_super_admin() OR user_has_permission('aiPulse:anomaly.review'), false) THEN
    RAISE EXCEPTION 'Not allowed: only a champion can review reported prompts.' USING ERRCODE = '42501';
  END IF;

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
  -- One aggregate pass per build; the ON clause is what filters to ">= 1 report"
  -- (an aggregate over zero rows still returns one row, with count 0).
  JOIN LATERAL (
    SELECT count(DISTINCT r.reporter_profile_id)::bigint                    AS report_count,
           COALESCE(array_agg(DISTINCT r.reason)
                    FILTER (WHERE btrim(coalesce(r.reason,'')) <> ''),
                    ARRAY[]::text[])                                        AS report_reasons,
           max(r.created_at)                                                AS last_reported_at
    FROM ai_pulse_prompt_build_reports r
    WHERE r.build_id = b.id
  ) agg ON agg.report_count >= 1
  LEFT JOIN learners_profiles lp ON lp.id = b.learner_id
  WHERE b.disqualified_at  IS NULL     -- champion has not HIDDEN it yet
    AND b.report_cleared_at IS NULL    -- champion has not KEPT it yet
    AND role_has_institution_access(b.institution_id)
  ORDER BY agg.last_reported_at DESC NULLS LAST, b.id
  LIMIT COALESCE(NULLIF(p_limit, 0), 50);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_champion_report_queue(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_champion_report_queue(integer) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_pulse_champion_report_queue(integer) IS
  'AI Pulse moderation #3: reported prompt-builds awaiting a champion decision (>=1 report, not yet disqualified, not yet cleared). Champion-only (aiPulse:anomaly.review OR super admin), institution-scoped. Decisions are written by fn_ai_pulse_disqualify_prompt_build (HIDE) / fn_ai_pulse_clear_prompt_build_reports (KEEP), both widened below to accept the same key.';

-- ---------------------------------------------------------------------------
-- 3. The two DECISION RPCs — guard WIDENED to accept the champion key.
-- ---------------------------------------------------------------------------
-- WHY THIS SECTION EXISTS (it is not optional):
-- Retargeting only the queue READ (section 2) would have produced a decorative,
-- broken page. The two buttons on /ai-pulse/admin/reports call these two
-- PRE-EXISTING RPCs, and both are gated on aiPulse:lab.score alone. A champion
-- holding anomaly.review but NOT lab.score could then open the queue and have
-- BOTH actions RAISE 42501. That is latent today only because all 3 current
-- champions happen to also be super admins — the bypass, not the design.
--
-- WIDEN, DO NOT MOVE. Both keys are accepted:
--     is_super_admin() OR lab.score OR anomaly.review
-- lab.score is deliberately KEPT. The graduated-LIBRARY moderation path already
-- depends on these same two RPCs under lab.score; removing it would break
-- moderation that works in production today (and is out of scope here). This is
-- therefore a documented WIDENING of two live functions, not a re-gate.
--
-- SILENT-REVERT GUARD: both bodies below were pulled from the LIVE production
-- definitions with pg_get_functiondef() immediately before this edit. The ONLY
-- change to either is the single guard line (now COALESCE'd, per the house rule
-- that a NULL from a permission helper makes NOT(a OR b) evaluate to NULL and
-- the guard fall silently OPEN). Every other line is byte-for-byte live.
-- ---------------------------------------------------------------------------

-- HIDE — a champion removes the prompt from the feed permanently.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_disqualify_prompt_build(p_build_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(is_super_admin()
                    OR user_has_permission('aiPulse:lab.score')
                    OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can disqualify a build.' USING ERRCODE = '42501';
    END IF;

    UPDATE ai_pulse_prompt_builds
    SET disqualified_at     = now(),
        disqualified_by     = auth.uid(),
        disqualified_reason = left(nullif(btrim(coalesce(p_reason,'')),''), 500),
        updated_at          = now()
    WHERE id = p_build_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_disqualify_prompt_build(uuid, text) TO authenticated;

-- KEEP — a champion clears the reports and the prompt stays in the feed.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(p_build_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(is_super_admin()
                    OR user_has_permission('aiPulse:lab.score')
                    OR user_has_permission('aiPulse:anomaly.review'), false) THEN
        RAISE EXCEPTION 'Not allowed: only a champion can clear reports on a build.' USING ERRCODE = '42501';
    END IF;

    UPDATE ai_pulse_prompt_builds
    SET report_cleared_at = now(),
        report_cleared_by = auth.uid(),
        updated_at        = now()
    WHERE id = p_build_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_clear_prompt_build_reports(uuid) TO authenticated;
