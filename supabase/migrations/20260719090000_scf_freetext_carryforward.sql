-- ============================================================================
-- 20260719090000_scf_freetext_carryforward.sql
-- ----------------------------------------------------------------------------
-- SCF free-text carry-forward — "you mentioned the lab pace — better this week?"
-- Spec: specs/scf-freetext-carryforward-2026-07-19.md (8 Director decisions,
-- AskUserQuestion interview 2026-07-19).
--
-- Extends the LIVE checklist carry-forward (#1624): a nightly ₹0 jobs-lane run
-- classifies+summarizes learners' substantive free texts (concern|praise|none,
-- <=3 concern items, <=12-word summaries); the next same-course check-in re-asks
-- each open concern (Yes/Partly/No) and acknowledges praise once. Summaries are
-- PRIVATE to the learner (self-scoped SECDEF); Senior Learners see ONLY
-- course-level counts under a >=3-learner floor (Director decisions 4+5 — the
-- one deliberate, informed addition to the anonymity line).
--
-- Persistence = the checklist-carry rule (decision 3): re-asked at the next
-- check-in for that course until answered once; 30-day fade. 'none' rows are the
-- processed-marker (so the nightly job never re-reads a text). AI-unavailable →
-- the check-in simply has no personalized line (decision 7, never a template).
--
-- Additive + idempotent. Validated in a BEGIN…aborted-txn batch on prod first.
-- ============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scf_freetext_carry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_feedback_id uuid NOT NULL REFERENCES public.session_feedback(id) ON DELETE CASCADE,
  learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id      uuid,
  timetable_id        uuid NOT NULL,
  period_id           text NOT NULL,
  course_code         text NOT NULL,
  course_name         text,
  source_date         date NOT NULL,           -- attendance_date of the source check-in
  kind                text NOT NULL CHECK (kind IN ('concern','praise','none')),
  -- 'none' = processed-and-nothing-to-carry marker; only it may lack a summary.
  summary             text CHECK (kind = 'none' OR summary IS NOT NULL),
  model               text,
  answer              text CHECK (answer IN ('Yes','Partly','No','Seen')),
  answered_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_scf_ftc_learner_course
  ON public.scf_freetext_carry (learner_id, course_code, source_date DESC)
  WHERE answer IS NULL;
CREATE INDEX IF NOT EXISTS ix_scf_ftc_feedback
  ON public.scf_freetext_carry (session_feedback_id);
CREATE INDEX IF NOT EXISTS ix_scf_ftc_recent
  ON public.scf_freetext_carry (source_date DESC);

ALTER TABLE public.scf_freetext_carry ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: direct access deny-all (scf_learner_notes model).
-- Writes = service-role cron; reads = the SECURITY DEFINER fns below.
REVOKE ALL ON public.scf_freetext_carry FROM anon, authenticated;

COMMENT ON TABLE public.scf_freetext_carry IS
  'AI-classified items from learners'' session-feedback free text (concern|praise; none = processed-marker). Each open concern is re-asked at the learner''s next same-course check-in; summaries are PRIVATE to the learner; Senior Learners see only >=floor course-level counts. Spec: specs/scf-freetext-carryforward-2026-07-19.md';

-- ── 2. Candidate picker (service-role only — the nightly cron''s worklist) ────
-- Substantive (>=15 chars after stripping carry markers), not yet processed,
-- last 7 days (no retro backlog at launch — spec "explicitly out").
CREATE OR REPLACE FUNCTION public.fn_scf_freetext_carry_candidates(p_limit integer DEFAULT 150)
 RETURNS TABLE(session_feedback_id uuid, learner_id uuid, institution_id uuid,
               timetable_id uuid, period_id text, course_code text, course_name text,
               source_date date, clean_text text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cleaned AS (
    SELECT f.id, f.student_id, f.institution_id, f.timetable_id, f.period_id,
           f.course_code, f.course_name, f.attendance_date,
           trim(regexp_replace(coalesce(f.free_text,''), '\[(carry-forward|freetext-carry)[^\]]*\]', '', 'g')) AS clean
    FROM public.session_feedback f
    WHERE f.attendance_date >= current_date - 7
      AND f.course_code IS NOT NULL
      AND f.free_text IS NOT NULL
  )
  SELECT c.id, c.student_id, c.institution_id, c.timetable_id, c.period_id,
         c.course_code, c.course_name, c.attendance_date, c.clean
  FROM cleaned c
  WHERE length(c.clean) >= 15
    AND lower(c.clean) NOT IN ('no','nil','nill','na','n/a','nothing','nothing to add',
                               'good','nice','ok','okay','fine','super','well',
                               'no doubts','no doubt','everything is okay','understand')
    AND NOT EXISTS (SELECT 1 FROM public.scf_freetext_carry x WHERE x.session_feedback_id = c.id)
  ORDER BY c.attendance_date DESC
  LIMIT greatest(1, least(p_limit, 500));
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_freetext_carry_candidates(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_freetext_carry_candidates(integer) TO service_role;

-- ── 3. Recorder (service-role only — collect side of the jobs lane) ──────────
-- Sanitizes: strips [ ] (marker-spoof guard), caps 120 chars, caps items at the
-- config max (concerns) + 1 (praise). Empty/none → the processed-marker row.
CREATE OR REPLACE FUNCTION public.fn_scf_record_freetext_carry(
  p_session_feedback_id uuid, p_items jsonb, p_model text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f RECORD;
  v_item jsonb;
  v_kind text;
  v_summary text;
  v_concerns int := 0;
  v_praise int := 0;
  v_max_concerns int;
  v_written int := 0;
BEGIN
  SELECT f.id, f.student_id, f.institution_id, f.timetable_id, f.period_id,
         f.course_code, f.course_name, f.attendance_date
    INTO v_f FROM public.session_feedback f WHERE f.id = p_session_feedback_id;
  IF v_f.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'feedback row not found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.scf_freetext_carry x WHERE x.session_feedback_id = p_session_feedback_id) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already processed');
  END IF;

  v_max_concerns := fn_get_policy_int('scf.freetext_carry.max_concerns_per_text', 3, v_f.institution_id);

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_kind := lower(coalesce(v_item->>'kind',''));
      v_summary := left(translate(trim(coalesce(v_item->>'summary','')), '[]', ''), 120);
      CONTINUE WHEN v_summary = '' OR v_kind NOT IN ('concern','praise');
      IF v_kind = 'concern' THEN
        CONTINUE WHEN v_concerns >= v_max_concerns;
        v_concerns := v_concerns + 1;
      ELSE
        CONTINUE WHEN v_praise >= 1;
        v_praise := v_praise + 1;
      END IF;
      INSERT INTO public.scf_freetext_carry
        (session_feedback_id, learner_id, institution_id, timetable_id, period_id,
         course_code, course_name, source_date, kind, summary, model)
      VALUES (v_f.id, v_f.student_id, v_f.institution_id, v_f.timetable_id, v_f.period_id,
              v_f.course_code, v_f.course_name, v_f.attendance_date, v_kind, v_summary, p_model);
      v_written := v_written + 1;
    END LOOP;
  END IF;

  IF v_written = 0 THEN
    -- processed-marker: never re-read this text
    INSERT INTO public.scf_freetext_carry
      (session_feedback_id, learner_id, institution_id, timetable_id, period_id,
       course_code, course_name, source_date, kind, model)
    VALUES (v_f.id, v_f.student_id, v_f.institution_id, v_f.timetable_id, v_f.period_id,
            v_f.course_code, v_f.course_name, v_f.attendance_date, 'none', p_model);
  END IF;

  RETURN jsonb_build_object('success', true, 'written', v_written);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_record_freetext_carry(uuid, jsonb, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_freetext_carry(uuid, jsonb, text) TO service_role;

-- ── 4. Learner answer (self-scoped; the ONLY authenticated write path) ───────
CREATE OR REPLACE FUNCTION public.fn_scf_answer_freetext_carry(p_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_answer_freetext_carry: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can answer their own follow-ups.');
  END IF;
  IF p_answer NOT IN ('Yes','Partly','No','Seen') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Answer must be Yes, Partly, No or Seen.');
  END IF;

  UPDATE public.scf_freetext_carry
     SET answer = p_answer, answered_at = now(), updated_at = now()
   WHERE id = p_id AND learner_id = v_lp AND answer IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Follow-up not found or already answered.');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_answer_freetext_carry(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_answer_freetext_carry(uuid, text) TO authenticated;

-- ── 5. Extend the carry-forward read with the learner's open items ───────────
-- RETURNS TABLE changes shape → drop + recreate + re-lock (same name/arg).
-- New columns: prior_concerns jsonb [{id,summary,source_date}] (open, <=3,
-- newest first, 30-day window) and prior_praise jsonb {id,summary}|null (latest
-- un-acked). Config kill switch empties both without a deploy.
DROP FUNCTION IF EXISTS public.fn_scf_carryforward_for_learner(integer);
CREATE OR REPLACE FUNCTION public.fn_scf_carryforward_for_learner(p_lookback_days integer DEFAULT 30)
 RETURNS TABLE(timetable_id uuid, period_id text, course_code text, course_name text,
               prior_session_date date, prior_understood smallint, prior_unmet_items text[],
               prior_concerns jsonb, prior_praise jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid;
  v_ftc_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_carryforward_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  v_ftc_enabled := fn_get_policy_bool('scf.freetext_carry.enabled', true);

  -- Body below is the ORIGINAL #1624 query VERBATIM (pending/prior CTEs, join
  -- conditions, ordering, casts — verified against the live prod definition
  -- 2026-07-19); the ONLY additions are the two jsonb output columns.
  RETURN QUERY
  WITH pending AS (
    SELECT sa.attendance_date,
           sa.timetable_id                          AS timetable_id,
           period.key                               AS period_id,
           period.value ->> 'course_code'           AS course_code,
           period.value ->> 'course_name'           AS course_name
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
      AND (period.value ->> 'course_code') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
        WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id = v_lp
          AND f.attendance_date = sa.attendance_date
          AND f.period_id = period.key
      )
  ),
  prior AS (
    SELECT f.course_code,
           f.course_name,
           f.attendance_date AS prior_session_date,
           f.understood      AS prior_understood,
           ARRAY(
             SELECT c.item_key
             FROM public.session_feedback_checklist_config c
             WHERE c.is_active = true
               AND (c.institution_id IS NULL OR c.institution_id = f.institution_id)
               AND COALESCE((f.checklist ->> c.item_key)::boolean, false) = false
             ORDER BY c.sort_order
           ) AS unmet_items,
           ROW_NUMBER() OVER (
             PARTITION BY f.course_code
             ORDER BY f.attendance_date DESC, f.created_at DESC
           ) AS rn
    FROM public.session_feedback f
    WHERE f.student_id = v_lp
      AND f.course_code IS NOT NULL
  )
  SELECT DISTINCT ON (p.timetable_id, p.period_id, p.course_code)
         p.timetable_id::uuid                       AS timetable_id,
         p.period_id::text                          AS period_id,
         p.course_code::text                        AS course_code,
         COALESCE(p.course_name, pr.course_name)::text AS course_name,
         pr.prior_session_date::date                AS prior_session_date,
         pr.prior_understood::smallint              AS prior_understood,
         COALESCE(pr.unmet_items, '{}'::text[])     AS prior_unmet_items,
         CASE WHEN v_ftc_enabled THEN
           coalesce((
             SELECT jsonb_agg(jsonb_build_object('id', x.id, 'summary', x.summary,
                                                 'source_date', x.source_date)
                              ORDER BY x.source_date DESC)
             FROM (
               SELECT c2.id, c2.summary, c2.source_date
               FROM public.scf_freetext_carry c2
               WHERE c2.learner_id = v_lp AND c2.course_code = p.course_code
                 AND c2.kind = 'concern' AND c2.answer IS NULL
                 AND c2.source_date >= (CURRENT_DATE - p_lookback_days)
                 AND c2.source_date < p.attendance_date
               ORDER BY c2.source_date DESC
               LIMIT 3
             ) x
           ), '[]'::jsonb)
         ELSE '[]'::jsonb END                       AS prior_concerns,
         CASE WHEN v_ftc_enabled THEN (
           SELECT jsonb_build_object('id', c3.id, 'summary', c3.summary)
           FROM public.scf_freetext_carry c3
           WHERE c3.learner_id = v_lp AND c3.course_code = p.course_code
             AND c3.kind = 'praise' AND c3.answer IS NULL
             AND c3.source_date >= (CURRENT_DATE - p_lookback_days)
             AND c3.source_date < p.attendance_date
           ORDER BY c3.source_date DESC
           LIMIT 1
         ) ELSE NULL END                            AS prior_praise
  FROM pending p
  -- LEFT (was INNER): decision 8 — a free-text concern carries even when the
  -- prior check-in was a happy 5/Clear with every checklist item met (the
  -- checklist flag never fires, but the words still count on their own).
  LEFT JOIN prior pr
    ON pr.course_code = p.course_code
   AND pr.rn = 1
   AND pr.prior_session_date < p.attendance_date
   AND (pr.prior_understood <= 2 OR cardinality(pr.unmet_items) > 0)
  WHERE pr.course_code IS NOT NULL
     OR (v_ftc_enabled AND EXISTS (
          SELECT 1 FROM public.scf_freetext_carry c4
          WHERE c4.learner_id = v_lp AND c4.course_code = p.course_code
            AND c4.kind IN ('concern','praise') AND c4.answer IS NULL
            AND c4.source_date >= (CURRENT_DATE - p_lookback_days)
            AND c4.source_date < p.attendance_date
        ))
  ORDER BY p.timetable_id, p.period_id, p.course_code, p.attendance_date DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_carryforward_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_carryforward_for_learner(integer) TO authenticated;

-- ── 6. Senior Learner counts (>=floor, counts ONLY — never words or names) ───
CREATE OR REPLACE FUNCTION public.fn_scf_freetext_carry_counts()
 RETURNS TABLE(course_code text, course_name text, learners integer,
               open_concerns integer, resolved integer, partly integer, not_better integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_floor int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_freetext_carry_counts: not authenticated'; END IF;
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  v_floor := fn_get_policy_int('scf.freetext_carry.count_floor', 3);

  RETURN QUERY
  SELECT c.course_code,
         max(c.course_name) AS course_name,
         count(DISTINCT c.learner_id)::int AS learners,
         count(*) FILTER (WHERE c.kind = 'concern' AND c.answer IS NULL)::int AS open_concerns,
         count(*) FILTER (WHERE c.answer = 'Yes')::int AS resolved,
         count(*) FILTER (WHERE c.answer = 'Partly')::int AS partly,
         count(*) FILTER (WHERE c.answer = 'No')::int AS not_better
  FROM public.scf_freetext_carry c
  WHERE c.kind IN ('concern')
    AND c.source_date >= current_date - 30
    -- the caller taught the source sessions (same email join session_feedback uses)
    AND EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.id = c.session_feedback_id AND f.faculty_email = v_email
    )
  GROUP BY c.course_code
  HAVING count(DISTINCT c.learner_id) >= v_floor;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_freetext_carry_counts() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_freetext_carry_counts() TO authenticated;

-- ── 7. Jobs-lane registry row (₹0; interactive=false → batch drain serves it) ─
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('scf.freetext_carry',
   'SCF — Free-text carry-forward classifier (loop)',
   'Nightly classify+summarize of learners'' substantive session-feedback free texts (concern|praise|none, <=3 items, <=12-word summaries). Results recorded via fn_scf_record_freetext_carry; each open concern is re-asked at the learner''s next same-course check-in. Spec: specs/scf-freetext-carryforward-2026-07-19.md',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 20)
ON CONFLICT (job_type) DO NOTHING;

-- ── 8. Config rows (identity-guarded seeds) ──────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'scf.freetext_carry.enabled', 'global', NULL, 'true'::jsonb,
  'SCF free-text carry-forward: master switch. false = check-ins stop showing free-text follow-ups instantly (no deploy); the nightly classifier also stops enqueueing.',
  'boolean', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'scf.freetext_carry.enabled' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'scf.freetext_carry.count_floor', 'global', NULL, '3'::jsonb,
  'SCF free-text carry-forward: minimum distinct learners with items in a course before the Senior Learner counts card shows ANY number (privacy floor, Director 2026-07-19).',
  'number', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'scf.freetext_carry.count_floor' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT 'scf.freetext_carry.max_concerns_per_text', 'global', NULL, '3'::jsonb,
  'SCF free-text carry-forward: maximum separate concern follow-ups extracted from one free text (each gets its own Yes/Partly/No, Director decision 6).',
  'number', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'scf.freetext_carry.max_concerns_per_text' AND scope_type = 'global' AND scope_id IS NULL);

NOTIFY pgrst, 'reload schema';
