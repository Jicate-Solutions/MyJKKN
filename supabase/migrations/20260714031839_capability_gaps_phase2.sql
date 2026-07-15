-- =====================================================================
-- Capability-Gap Loop — Phase 2 (triage + human-gated fix + measured drop-check)
-- Spec: specs/capability-gap-loop-spec-2026-07-13.md
--       §7 (tab), §8 (human-gated fix workflow), §9 (measurement / moat
--       2-cycle proof), §10 Phase 2 scope, §2 G9–G15.
-- Builds on: 20260714013517_capability_gaps_phase1.sql (table + scan + list).
-- Created: 2026-07-14
--
-- What this ships (INERT until the RPCs are called by a super-admin):
--   1. capability_gaps.fix_applied_at   — the boundary between the baseline
--      and post-fix measurement windows (§9). Plus two sample-size columns
--      (baseline_n / post_fix_n) so the tab can show the denominator next to
--      every frequency — the spec's explicit "never over-read a 1-of-2"
--      guardrail (§9). Additive/nullable; DEVIATION from "add one column",
--      flagged in the build report.
--   2. public._capgap_topic_freq(...)   — internal helper: refusal-frequency
--      for a cluster over a time window, reusing the EXACT per-cluster keyword
--      ladder + refusal-phrase array from fn_capgap_scan (so measurement
--      matches how detection clusters). Internal-only (no anon/authenticated
--      grant); callable only inside the SECDEF RPCs below.
--   3. fn_capgap_triage(...)      — human sets/overrides the gap class (G9).
--   4. fn_capgap_set_status(...)  — workflow transition; on → fix_live it
--      captures baseline_freq/baseline_n (§9).
--   5. fn_capgap_measure(...)     — the §9 drop-check: post_fix_freq, the
--      freq_dropped verdict, retest_answer proof (G13), and the 1b→1a
--      re-classification on no-drop (§9 Branch B — loop, not echo).
--
-- Security: all RPCs are SECURITY DEFINER, is_super_admin()-gated, and
-- anon-locked (REVOKE EXECUTE FROM anon, PUBLIC) per CLAUDE.md. They read only
-- chat-log metadata (ai_jobs) + the capability_gaps catalog — NOT a new
-- per-user institutional data surface (same posture as Phase 1). The tool
-- exposures they help track go through the out-of-band leak-test + Director
-- approval + Windows READ_TOOLS handoff (§8), never through these RPCs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns: the measurement boundary + sample sizes (§9)
-- ---------------------------------------------------------------------
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS fix_applied_at timestamptz;  -- baseline↔post-fix boundary
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS baseline_n int;              -- denominator of baseline_freq (topic Qs pre-fix)
ALTER TABLE public.capability_gaps
  ADD COLUMN IF NOT EXISTS post_fix_n int;              -- denominator of post_fix_freq (topic Qs post-fix)

COMMENT ON COLUMN public.capability_gaps.fix_applied_at IS
  'Phase 2 (§9): set when status→fix_live. The boundary between the baseline refusal-frequency window (requested_at < fix_applied_at) and the post-fix window (requested_at >= fix_applied_at).';
COMMENT ON COLUMN public.capability_gaps.baseline_n IS
  'Phase 2 (§9): sample size (answered topic-questions) behind baseline_freq. Shown next to the frequency so a 1.0 from 2/2 is never over-read.';
COMMENT ON COLUMN public.capability_gaps.post_fix_n IS
  'Phase 2 (§9): sample size (answered topic-questions) behind post_fix_freq.';


-- ---------------------------------------------------------------------
-- 2. Internal helper: _capgap_topic_freq(cluster_key, sample_questions, from, to)
-- ---------------------------------------------------------------------
-- Refusal-frequency for a cluster's TOPIC questions over a half-open time
-- window [p_from, p_to). Returns jsonb {answered, refused, freq}.
--   * answered = answered ai_query.chat questions whose MESSAGE matches the
--     cluster's topic predicate in the window.
--   * refused  = of those, how many ANSWERS carry a refusal phrase.
--   * freq     = refused / nullif(answered,0)   (NULL when answered=0).
-- The topic predicate reuses the SAME per-cluster keyword sets as
-- fn_capgap_scan (billing / hostel / attendance); for an unknown cluster_key
-- it falls back to ILIKE-any over the significant words in sample_questions.
-- The refusal-phrase array is the same one fn_capgap_scan/fn_capgap_list use.
-- Internal-only: no anon/authenticated grant (only the owner-run SECDEF RPCs
-- below call it).
CREATE OR REPLACE FUNCTION public._capgap_topic_freq(
  p_cluster_key      text,
  p_sample_questions jsonb,
  p_from             timestamptz,   -- inclusive lower bound (NULL = -infinity)
  p_to               timestamptz    -- exclusive upper bound (NULL = +infinity)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal_phrases text[] := ARRAY[
    '%don''t have%','%do not have%','%can''t access%','%cannot access%',
    '%outside the data%','%couldn''t find%','%not available to me%',
    '%don''t have access%','%no access%','%not able to access%'];
  v_patterns text[];   -- fallback ILIKE patterns for unknown clusters
  v_answered int := 0;
  v_refused  int := 0;
BEGIN
  -- Fallback patterns: significant (>=4 char, non-stopword) words from the
  -- cluster's sample questions. Only used when cluster_key is not one of the
  -- three known data domains.
  IF p_cluster_key NOT IN ('billing.fee_defaulters','hostel.capacity','attendance.participation') THEN
    SELECT array_agg(DISTINCT '%' || w || '%')
    INTO v_patterns
    FROM (
      SELECT lower(unnest(regexp_split_to_array(qq, '\s+'))) AS w
      FROM jsonb_array_elements_text(coalesce(p_sample_questions, '[]'::jsonb)) qq
    ) x
    WHERE length(w) >= 4
      AND w ~ '[a-z0-9]'
      AND w NOT IN (
        'this','that','what','which','with','from','have','they','them','their',
        'would','could','should','about','list','show','give','tell','many','does',
        'your','when','where','into','over','than','then','these','those','some',
        'more','most','also','been','were','will','being','there','here','current',
        'semester','please','need','want','find','know','make','like','only','each',
        'both','other','same','such','very','much','just','back','down','still');
  END IF;

  SELECT
    count(*) FILTER (WHERE is_topic),
    count(*) FILTER (WHERE is_topic AND lower(answer) ~~ ANY (v_refusal_phrases))
  INTO v_answered, v_refused
  FROM (
    SELECT
      j.result->>'answer' AS answer,
      CASE
        WHEN p_cluster_key = 'billing.fee_defaulters' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%fee%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%defaulter%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%billing%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%revenue%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%collection%' )
        WHEN p_cluster_key = 'hostel.capacity' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%hostel%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%hostelite%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%hosteite%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%day scholar%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%days scholar%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%day scholars%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%occupancy%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%capacity%' )
        WHEN p_cluster_key = 'attendance.participation' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%participation%'
            OR ( lower(coalesce(j.payload->>'message','')) ILIKE '%attendance%'
                 AND lower(coalesce(j.payload->>'message','')) ILIKE '%75%' )
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%below 75%' )
        ELSE
          ( v_patterns IS NOT NULL
            AND lower(coalesce(j.payload->>'message','')) ILIKE ANY (v_patterns) )
      END AS is_topic
    FROM public.ai_jobs j
    WHERE j.job_type = 'ai_query.chat'
      AND j.result->>'answer' IS NOT NULL
      AND (p_from IS NULL OR j.requested_at >= p_from)
      AND (p_to   IS NULL OR j.requested_at <  p_to)
  ) t;

  RETURN jsonb_build_object(
    'answered', v_answered,
    'refused',  v_refused,
    'freq',     CASE WHEN v_answered = 0 THEN NULL
                     ELSE round(v_refused::numeric / v_answered, 4) END
  );
END;
$$;


-- ---------------------------------------------------------------------
-- 3. fn_capgap_triage(p_id, p_gap_class, p_candidate_tool, p_reason)
-- ---------------------------------------------------------------------
-- Human sets/overrides the gap class. Renders suggested_fix from the new
-- class, stamps gap_class_source='human' + disposed_by=auth.uid().
CREATE OR REPLACE FUNCTION public.fn_capgap_triage(
  p_id             uuid,
  p_gap_class      text,
  p_candidate_tool text DEFAULT NULL,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.capability_gaps;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF p_gap_class IS NULL OR p_gap_class NOT IN ('1a','1b','2','3','non_gap') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid gap_class');
  END IF;

  UPDATE public.capability_gaps cg
  SET gap_class        = p_gap_class,
      gap_class_source = 'human',
      candidate_tool   = coalesce(p_candidate_tool, cg.candidate_tool),
      suggested_fix    = CASE p_gap_class
                           WHEN '1a'      THEN 'Edit tool description/examples'
                           WHEN '1b'      THEN 'Expose existing tool (leak-test first)'
                           WHEN '2'       THEN 'Draft new SECDEF tool (leak-test first)'
                           WHEN '3'       THEN 'Log as data gap'
                           WHEN 'non_gap' THEN 'Not a capability gap'
                         END,
      disposed_by      = auth.uid(),
      disposed_reason  = p_reason,
      updated_at       = now()
  WHERE cg.id = p_id
  RETURNING cg.* INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_row));
END;
$$;


-- ---------------------------------------------------------------------
-- 4. fn_capgap_set_status(p_id, p_status, p_linked_tool_id, p_reason)
-- ---------------------------------------------------------------------
-- Workflow transition. Special cases:
--   → fix_live : linked_tool_id, fix_applied_at=now(), and capture
--                baseline_freq/baseline_n = the cluster's refusal frequency in
--                the window BEFORE the boundary (requested_at < fix_applied_at).
--   → resolved : resolved_at=now().
--   → dismissed|data_gap|privacy_wall : just stamp disposition.
-- Always: disposed_by=auth.uid(), disposed_reason=coalesce(p_reason,existing),
--         updated_at=now().
CREATE OR REPLACE FUNCTION public.fn_capgap_set_status(
  p_id             uuid,
  p_status         text,
  p_linked_tool_id text DEFAULT NULL,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       public.capability_gaps;
  v_boundary  timestamptz := now();
  v_base      jsonb;
  v_base_freq numeric;
  v_base_n    int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  -- Validate against the table's status CHECK set (defense in depth).
  IF p_status IS NULL OR p_status NOT IN (
       'open','triaged','fix_drafted','leak_testing','awaiting_approval',
       'fix_live','resolved','dismissed','data_gap','privacy_wall') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid status');
  END IF;

  -- Load the current row (need its cluster_key + sample_questions for baseline).
  SELECT * INTO v_row FROM public.capability_gaps WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  -- On → fix_live, capture the pre-fix baseline against the boundary NOW.
  IF p_status = 'fix_live' THEN
    v_base := public._capgap_topic_freq(
      v_row.cluster_key, v_row.sample_questions, NULL, v_boundary);
    v_base_freq := (v_base->>'freq')::numeric;      -- NULL if no pre-fix topic Qs
    v_base_n    := (v_base->>'answered')::int;
  END IF;

  UPDATE public.capability_gaps cg
  SET status          = p_status,
      linked_tool_id  = CASE WHEN p_status = 'fix_live'
                             THEN coalesce(p_linked_tool_id, cg.linked_tool_id)
                             ELSE cg.linked_tool_id END,
      fix_applied_at  = CASE WHEN p_status = 'fix_live'
                             THEN v_boundary ELSE cg.fix_applied_at END,
      baseline_freq   = CASE WHEN p_status = 'fix_live'
                             THEN v_base_freq ELSE cg.baseline_freq END,
      baseline_n      = CASE WHEN p_status = 'fix_live'
                             THEN v_base_n ELSE cg.baseline_n END,
      resolved_at     = CASE WHEN p_status = 'resolved'
                             THEN now() ELSE cg.resolved_at END,
      disposed_by     = auth.uid(),
      disposed_reason = coalesce(p_reason, cg.disposed_reason),
      updated_at      = now()
  WHERE cg.id = p_id
  RETURNING cg.* INTO v_row;

  RETURN jsonb_build_object('success', true, 'data', to_jsonb(v_row));
END;
$$;


-- ---------------------------------------------------------------------
-- 5. fn_capgap_measure(p_id) — the §9 drop-check (loop, not echo)
-- ---------------------------------------------------------------------
-- Measures the cluster's post-fix refusal frequency and decides the next
-- action FROM the measured outcome:
--   * dropped  → status=resolved (the measurement confirms the class).
--   * no drop & class 1b → reclassify 1b→1a (auto), reopen (§9 Branch B: the
--     tool is now reachable but the model still isn't reaching for it → it's a
--     discoverability problem, not a reachability one). This is what makes the
--     loop read its own outcome instead of echoing its own noise.
-- Also captures retest_answer (G13): the most recent NON-refused topic answer
-- at/after the boundary — the human-visible "after" proof.
CREATE OR REPLACE FUNCTION public.fn_capgap_measure(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refusal_phrases text[] := ARRAY[
    '%don''t have%','%do not have%','%can''t access%','%cannot access%',
    '%outside the data%','%couldn''t find%','%not available to me%',
    '%don''t have access%','%no access%','%not able to access%'];
  v_row          public.capability_gaps;
  v_boundary     timestamptz;
  v_post         jsonb;
  v_post_freq    numeric;
  v_post_n       int;
  v_dropped      boolean;
  v_retest       text;
  v_new_status   text;
  v_new_class    text;
  v_new_fix      text;
  v_new_source   text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.capability_gaps WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;

  v_boundary := coalesce(v_row.fix_applied_at, now());

  -- Post-fix refusal frequency over requested_at >= boundary.
  v_post := public._capgap_topic_freq(
    v_row.cluster_key, v_row.sample_questions, v_boundary, NULL);
  v_post_freq := (v_post->>'freq')::numeric;   -- NULL when no post-fix topic Qs
  v_post_n    := (v_post->>'answered')::int;

  -- Did it drop? Only a real (non-NULL) post-fix frequency below the baseline
  -- (baseline missing → treat as 1.0, the worst case) counts as a drop.
  v_dropped := v_post_freq IS NOT NULL
               AND v_post_freq < coalesce(v_row.baseline_freq, 1);

  -- retest_answer (G13): most recent NON-refused answered topic question's
  -- answer (<=500 chars) at/after the boundary — the visible "after" proof.
  SELECT left(t.answer, 500)
  INTO v_retest
  FROM (
    SELECT
      j.requested_at,
      j.result->>'answer' AS answer,
      CASE
        WHEN v_row.cluster_key = 'billing.fee_defaulters' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%fee%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%defaulter%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%billing%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%revenue%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%collection%' )
        WHEN v_row.cluster_key = 'hostel.capacity' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%hostel%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%hostelite%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%hosteite%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%day scholar%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%days scholar%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%day scholars%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%occupancy%'
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%capacity%' )
        WHEN v_row.cluster_key = 'attendance.participation' THEN
          ( lower(coalesce(j.payload->>'message','')) ILIKE '%participation%'
            OR ( lower(coalesce(j.payload->>'message','')) ILIKE '%attendance%'
                 AND lower(coalesce(j.payload->>'message','')) ILIKE '%75%' )
            OR lower(coalesce(j.payload->>'message','')) ILIKE '%below 75%' )
        ELSE FALSE   -- unknown cluster: no reliable per-row topic test here
      END AS is_topic
    FROM public.ai_jobs j
    WHERE j.job_type = 'ai_query.chat'
      AND j.result->>'answer' IS NOT NULL
      AND j.requested_at >= v_boundary
  ) t
  WHERE t.is_topic
    AND lower(t.answer) !~~ ALL (v_refusal_phrases)
  ORDER BY t.requested_at DESC
  LIMIT 1;

  -- Decide the next action FROM the measured outcome (§9).
  IF v_dropped THEN
    -- Drop confirms the class → resolve.
    v_new_status := 'resolved';
    v_new_class  := v_row.gap_class;
    v_new_fix    := v_row.suggested_fix;
    v_new_source := v_row.gap_class_source;
  ELSIF v_row.gap_class = '1b' THEN
    -- No drop on a 1b fix → the tool is reachable but the model still isn't
    -- reaching for it → discoverability. Flip 1b→1a and reopen (Branch B).
    v_new_status := 'open';
    v_new_class  := '1a';
    v_new_fix    := 'Edit tool description/examples';
    v_new_source := 'auto';
  ELSE
    -- No drop, not a 1b → leave the disposition as-is; just record the metric.
    v_new_status := v_row.status;
    v_new_class  := v_row.gap_class;
    v_new_fix    := v_row.suggested_fix;
    v_new_source := v_row.gap_class_source;
  END IF;

  UPDATE public.capability_gaps cg
  SET post_fix_freq    = v_post_freq,
      post_fix_n       = v_post_n,
      freq_dropped     = v_dropped,
      retest_answer    = v_retest,
      retest_at        = now(),
      status           = v_new_status,
      gap_class        = v_new_class,
      suggested_fix    = v_new_fix,
      gap_class_source = v_new_source,
      resolved_at      = CASE WHEN v_dropped THEN now() ELSE cg.resolved_at END,
      updated_at       = now()
  WHERE cg.id = p_id
  RETURNING cg.* INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'baseline_freq', v_row.baseline_freq,
      'baseline_n',    v_row.baseline_n,
      'post_fix_freq', v_post_freq,
      'post_fix_n',    v_post_n,
      'freq_dropped',  v_dropped,
      'new_status',    v_new_status,
      'retest_answer', v_retest
    )
  );
END;
$$;


-- ---------------------------------------------------------------------
-- 6. Grants — anon-lock per CLAUDE.md (Supabase default-grants anon EXECUTE)
-- ---------------------------------------------------------------------
-- Internal helper: no anon/authenticated grant — callable only by the owner
-- (i.e. inside the SECDEF RPCs below). NOTE: Supabase default-grants EXECUTE to
-- `authenticated` on every new function, so revoking from anon+PUBLIC alone is
-- insufficient — `authenticated` must be revoked explicitly to keep this helper
-- truly internal (it has no is_super_admin() gate of its own).
REVOKE EXECUTE ON FUNCTION public._capgap_topic_freq(text, jsonb, timestamptz, timestamptz) FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_triage(uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_triage(uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_set_status(uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_set_status(uuid, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_capgap_measure(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_capgap_measure(uuid) TO authenticated;
