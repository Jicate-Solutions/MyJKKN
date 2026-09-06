-- ============================================================================
-- Updated: 2026-07-20 - AI Pulse Domain Starter: interview refinements (dark).
-- Director interview (2026-07-20), 12th-grade edge-case walkthrough:
--   * Tiny subject (< min learners) → the learner sees their PROGRAMME's prompt
--     (not a blank page). So the resolver now returns BOTH the course topic(s)
--     AND the programme topic, and the learner read shows the FINEST one that
--     was actually generated (course if present, else programme).
--   * Auto-publish stays (no pre-publish check) + a learner "report this prompt"
--     button as the human safety valve AFTER publish. Added as a 'report' event.
--   * Tamil: English-only until a reviewer approves, no deadline — already the
--     substrate behaviour; unchanged.
-- ============================================================================

-- 1. Report action (safety valve). Widen the events CHECK + a reason note.
ALTER TABLE public.ai_pulse_domain_starter_events
  DROP CONSTRAINT IF EXISTS ai_pulse_domain_starter_events_action_check;
ALTER TABLE public.ai_pulse_domain_starter_events
  ADD  CONSTRAINT ai_pulse_domain_starter_events_action_check CHECK (action IN ('view','copy','report'));
ALTER TABLE public.ai_pulse_domain_starter_events
  ADD COLUMN IF NOT EXISTS note text;


-- 2. Resolver: return BOTH the course topic(s) (finest, if the timetable knows
--    them) AND the programme topic (the always-there fallback base). No longer
--    course-OR-programme — both, so a tiny course below the floor still has the
--    programme prompt to fall back to, and programme prompts always generate.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_learner_topics(p_learner_id uuid)
RETURNS TABLE (topic_type text, topic_id uuid, topic_label text, institution_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  -- 2a. COURSE grain (finest) — learner's section's scheduled courses.
  RETURN QUERY
  WITH lp AS (
    SELECT l.id, l.section_id, l.program_id, l.department_id, l.institution_id AS inst_id
    FROM learners_profiles l WHERE l.id = p_learner_id
  ),
  courses_for AS (
    SELECT DISTINCT csl.course_id AS cid
    FROM lp JOIN timetables t ON t.section_id = lp.section_id AND t.is_active
            JOIN class_session_lesson csl ON csl.timetable_id = t.id
    WHERE csl.course_id IS NOT NULL
    UNION
    SELECT DISTINCT sf.course_id
    FROM lp JOIN session_feedback sf ON sf.section_id = lp.section_id
    WHERE sf.course_id IS NOT NULL
  )
  SELECT 'course'::text, c.id, c.course_name, (SELECT inst_id FROM lp)
  FROM courses_for cf JOIN courses c ON c.id = cf.cid;

  -- 2b. PROGRAMME (always appended — the fallback base, 100% populated).
  RETURN QUERY
  SELECT 'programme'::text, pr.id, pr.program_name, l.institution_id
  FROM learners_profiles l JOIN programs pr ON pr.id = l.program_id
  WHERE l.id = p_learner_id AND l.program_id IS NOT NULL;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_learner_topics(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_learner_topics(uuid) TO service_role;


-- 3. Learner read: FINEST-available. Return the learner's COURSE prompt(s) if any
--    were generated this cycle; otherwise fall back to their PROGRAMME prompt. So
--    a tiny-course student is never blank — they see the programme prompt.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_my_domain_starters(p_cycle_id uuid)
RETURNS TABLE (starter_id uuid, topic_type text, topic_label text,
               final_prompt text, prompt_pack jsonb, tamil_available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_learner uuid;
BEGIN
  SELECT learner_id INTO v_learner FROM profiles WHERE id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH mine AS (
    SELECT d.id, d.topic_type, d.topic_label, d.final_prompt, d.prompt_pack, d.ta_review_status
    FROM public.fn_ai_pulse_learner_topics(v_learner) t
    JOIN ai_pulse_domain_starters d
      ON d.topic_type = t.topic_type AND d.topic_id = t.topic_id AND d.cycle_id = p_cycle_id
    WHERE d.final_prompt IS NOT NULL
  )
  SELECT m.id, m.topic_type, m.topic_label, m.final_prompt,
         CASE WHEN m.ta_review_status = 'approved' THEN m.prompt_pack
              ELSE (m.prompt_pack - 'ta') END,
         (m.ta_review_status = 'approved') AS tamil_available
  FROM mine m
  WHERE m.topic_type = 'course'                                   -- finest: course prompts
     OR NOT EXISTS (SELECT 1 FROM mine WHERE topic_type = 'course'); -- else: programme fallback
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_my_domain_starters(uuid) TO authenticated;


-- 4. Learner "report this prompt" (safety valve). Self-scoped, dedup per learner.
CREATE OR REPLACE FUNCTION public.fn_ai_pulse_domain_starter_report(p_starter_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO ai_pulse_domain_starter_events (starter_id, profile_id, action, note)
  VALUES (p_starter_id, v_uid, 'report', left(nullif(btrim(coalesce(p_reason,'')),''), 500))
  ON CONFLICT (starter_id, profile_id, action) DO UPDATE SET note = EXCLUDED.note;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_report(uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_pulse_domain_starter_report(uuid,text) TO authenticated;
