-- ============================================================================
-- Classroom Practice — REVEAL CADENCE (config-driven) + SEALED COMMENTS reader
-- 2026-07-30 · The batch-reveal completion of the Classroom Practice arc.
-- Ratified design (project_classroom_practice_audit_design, amended 30 Jul):
-- reveal default = WEEKLY for classes >= ~20 learners, MONTHLY for small
-- classes — decided by the Director, CONFIGURABLE, never hardcoded.
--
-- WHAT THIS DOES:
--   1. Config row classroom_practice.reveal — the three cadence knobs.
--   2. fn_classroom_practice_window_cutoff — ONE internal definition of "when
--      does this teacher's window close", used by BOTH readers below so the
--      score reveal and the comment reveal can never disagree on the window.
--   3. fn_classroom_practice_compare — REPLACED from the VERBATIM live body
--      (pg_get_functiondef verified byte-identical to 20260730020000 before
--      this file was written). ONLY change: the completed-window cutoff comes
--      from the helper (weekly OR monthly, config-driven) instead of the
--      hardcoded date_trunc('week'); the response also names the cadence so
--      the UI can say "week" or "month" honestly.
--   4. fn_classroom_practice_sealed_comments — NEW leadership-only reader for
--      the drip's occasional sealed comments (carre_micro_impressions.
--      sealed_comment, written since 20260729184500, readable until now by
--      nobody but super admins at the RLS layer).
--
-- SEALED-COMMENT VISIBILITY (ratified decision 3): Principal & Director ONLY.
-- THE CYCLE'S OWNER NEVER SEES THEM — refused FIRST, before any role check,
-- so even an owner who holds admin or principal cannot read comments written
-- about their own sessions. Comments are BATCH-revealed on the same completed
-- window as scores (timing attacks on anonymity die with the batch), carry no
-- learner identity and no timestamp finer than the window label.
--
-- Deliberately NOT gated on the owner's self-score: that gate exists so the
-- teacher's mirror cannot become an answer key — comments never reach the
-- teacher at all, so the gate protects nothing here and leadership should not
-- wait on the teacher to read what learners sealed to them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Config row — every cadence decision is a policy row, never a constant.
--    Missing row => the helper falls back to these same values via COALESCE.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT
  'classroom_practice.reveal', 'global', NULL,
  jsonb_build_object(
    'window_large',          'weekly',
    'window_small',          'monthly',
    'small_class_threshold', 20
  ),
  'Classroom Practice batch-reveal cadence (Director default, 2026-07-30): weekly for classes of small_class_threshold (20) or more distinct learners, monthly below it. window_large/window_small accept ''weekly'' or ''monthly''. Class size = DISTINCT learners the drip has reached for that Senior Learner inside the cycle window. Both the score reveal (fn_classroom_practice_compare) and the sealed-comment reveal (fn_classroom_practice_sealed_comments) read this through one shared helper, so the two can never disagree on when a window closes.',
  'object', true, true, 'operational', 'published', 'json', 'Classroom Practice'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'classroom_practice.reveal'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

-- ----------------------------------------------------------------------------
-- 2) The ONE window definition. Internal plumbing: callable by no client role;
--    both SECURITY DEFINER readers reach it as the function owner.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_classroom_practice_window_cutoff(
  p_teacher_email text,
  p_window_start  timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_large     text;
  v_small     text;
  v_threshold int;
  v_learners  int := 0;
  v_unit      text;
BEGIN
  SELECT COALESCE(NULLIF(pp.value ->> 'window_large', ''), 'weekly'),
         COALESCE(NULLIF(pp.value ->> 'window_small', ''), 'monthly'),
         COALESCE((pp.value ->> 'small_class_threshold')::int, 20)
    INTO v_large, v_small, v_threshold
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.reveal'
    AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active;

  v_large     := COALESCE(v_large, 'weekly');
  v_small     := COALESCE(v_small, 'monthly');
  v_threshold := COALESCE(v_threshold, 20);
  -- Only the two ratified cadences are meaningful; anything else falls back.
  IF v_large NOT IN ('weekly','monthly') THEN v_large := 'weekly'; END IF;
  IF v_small NOT IN ('weekly','monthly') THEN v_small := 'monthly'; END IF;

  -- Class size = DISTINCT learners the drip has REACHED (offers, not answers):
  -- a large class with a shy week is still a large class, and offers exist for
  -- exactly the learners who submitted session feedback for this person.
  SELECT count(DISTINCT mi.learner_id)::int INTO v_learners
  FROM public.carre_micro_impressions mi
  WHERE p_teacher_email IS NOT NULL
    AND lower(mi.teacher_email) = lower(p_teacher_email)
    AND mi.offered_at >= p_window_start;

  v_unit := CASE WHEN v_learners >= v_threshold THEN v_large ELSE v_small END;

  RETURN jsonb_build_object(
    'cutoff', CASE v_unit WHEN 'weekly' THEN date_trunc('week',  now())
                          ELSE               date_trunc('month', now()) END,
    'unit',   CASE v_unit WHEN 'weekly' THEN 'week' ELSE 'month' END,
    'learners', v_learners,
    'threshold', v_threshold
  );
END;
$$;

-- Internal only: no client role may call it directly.
REVOKE EXECUTE ON FUNCTION public.fn_classroom_practice_window_cutoff(text, timestamptz) FROM anon, PUBLIC, authenticated;

COMMENT ON FUNCTION public.fn_classroom_practice_window_cutoff(text, timestamptz) IS
  'INTERNAL. The single definition of a Senior Learner''s batch-reveal window cutoff: weekly when the drip has reached >= small_class_threshold DISTINCT learners inside the cycle window, monthly below it — all three knobs from platform_policies classroom_practice.reveal (Director default 2026-07-30: weekly >= 20 / monthly). Returns {cutoff, unit, learners, threshold}. Called by fn_classroom_practice_compare AND fn_classroom_practice_sealed_comments so scores and comments can never disagree on when a window closes. No client role holds EXECUTE.';

-- ----------------------------------------------------------------------------
-- 3) fn_classroom_practice_compare — body VERBATIM from the verified live
--    definition; the ONLY changes are marked CADENCE below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_classroom_practice_compare(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_cycle       record;
  v_owner_email text;
  v_caller_inst uuid;
  v_cross       boolean;
  v_item_count  int;
  v_self_count  int;
  v_window      jsonb;                                   -- CADENCE
  v_cutoff      timestamptz;                             -- CADENCE (was date_trunc('week', now()))
  v_start       timestamptz;
  v_items       jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_authenticated');
  END IF;

  SELECT c.id, c.lead_auditor_id, c.start_date, c.institution_ids,
         c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND c.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE';

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_found');
  END IF;

  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);

  -- Admission: the cycle's own owner, or super-admin/admin (cross-institution),
  -- or an audit.cycle.view holder WITHIN THE CYCLE'S INSTITUTION. A permission
  -- key is not a passport across tenants. NULL on either side cannot establish
  -- tenancy, so it reads as "no" rather than falling through the check.
  IF v_cycle.lead_auditor_id <> v_uid AND NOT v_cross THEN
    IF NOT COALESCE(user_has_permission('audit.cycle.view'), false) THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
    END IF;

    SELECT p.institution_id INTO v_caller_inst
    FROM public.profiles p WHERE p.id = v_uid;

    IF v_caller_inst IS NULL
       OR v_cycle.institution_ids IS NULL
       OR NOT (v_caller_inst = ANY (v_cycle.institution_ids)) THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
    END IF;
  END IF;

  -- Frozen at creation, so a later profile-email change cannot re-point a
  -- running cycle at someone else's voices. Already lower-cased when frozen.
  v_owner_email := v_cycle.parameter_catalog_snapshot ->> 'teacher_email';

  -- The window opens at the creation INSTANT, not at midnight of the creation
  -- day: impressions offered earlier that day predate the cycle. COALESCE keeps
  -- cycles created before this key existed working.
  v_start := COALESCE(
    (v_cycle.parameter_catalog_snapshot ->> 'created_at')::timestamptz,
    v_cycle.start_date::timestamptz);

  -- CADENCE: the completed-window cutoff is the shared helper's, config-driven
  -- (weekly for classes >= threshold distinct learners, monthly below) — the
  -- Director's 2026-07-30 default, adjustable with no deploy.
  v_window := public.fn_classroom_practice_window_cutoff(v_owner_email, v_start);
  v_cutoff := (v_window ->> 'cutoff')::timestamptz;

  v_item_count := jsonb_array_length(
    COALESCE(v_cycle.parameter_catalog_snapshot -> 'parameters', '[]'::jsonb));

  -- DISTINCT parameter_code, and only codes actually in the frozen snapshot.
  -- care_audit_scores holds several rows per (cycle, parameter) by design — the
  -- CARE/CARRE second-scorer flow stores participant rows beside owner rows —
  -- so a plain count(*) could reach the item count without every item being
  -- self-scored. A UNIQUE constraint would be the wrong fix: it would break
  -- those shared flows.
  SELECT count(DISTINCT s.parameter_code)::int INTO v_self_count
  FROM public.care_audit_scores s
  WHERE s.cycle_id = p_cycle_id
    AND s.scorer_role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters') e
      WHERE e ->> 'code' = s.parameter_code);

  -- GATE 1 — self-score first.
  IF v_item_count = 0 OR v_self_count < v_item_count THEN
    RETURN jsonb_build_object(
      'locked', true,
      'reason', 'self_score_incomplete',
      'item_count', v_item_count,
      'self_scored', v_self_count,
      'window_unit', v_window ->> 'unit');
  END IF;

  -- GATES 2 and 3 — completed windows only, and k >= 3 DISTINCT LEARNERS.
  WITH params AS (
    SELECT e ->> 'code' AS code, ord
    FROM jsonb_array_elements(v_cycle.parameter_catalog_snapshot -> 'parameters')
         WITH ORDINALITY AS t(e, ord)
  ),
  self AS (
    SELECT s.parameter_code, max(s.score) AS score
    FROM public.care_audit_scores s
    WHERE s.cycle_id = p_cycle_id AND s.scorer_role = 'owner'
    GROUP BY s.parameter_code
  ),
  -- One row per (item, learner): that learner's LATEST answered score.
  per_learner AS (
    SELECT DISTINCT ON (mi.parameter_code, mi.learner_id)
           mi.parameter_code, mi.learner_id, mi.score
    FROM public.carre_micro_impressions mi
    WHERE v_owner_email IS NOT NULL
      AND lower(mi.teacher_email) = v_owner_email
      AND mi.score IS NOT NULL          -- skips and unanswered offers never count
      AND mi.offered_at >= v_start      -- on or after the creation instant
      AND mi.offered_at <  v_cutoff     -- completed windows only (CADENCE)
    ORDER BY mi.parameter_code, mi.learner_id,
             mi.answered_at DESC NULLS LAST, mi.offered_at DESC
  ),
  voice AS (
    SELECT pl.parameter_code,
           count(*)::int AS voices,     -- one row per learner => distinct learners
           percentile_cont(0.5) WITHIN GROUP (ORDER BY pl.score)::numeric AS med
    FROM per_learner pl
    GROUP BY pl.parameter_code
  )
  SELECT jsonb_agg(jsonb_build_object(
           'code', p.code,
           'self_score', s.score,
           'voices', COALESCE(v.voices, 0),
           'learner_median',
             CASE WHEN COALESCE(v.voices, 0) >= 3 THEN v.med ELSE NULL END
         ) ORDER BY p.ord)
    INTO v_items
  FROM params p
  LEFT JOIN self  s ON s.parameter_code = p.code
  LEFT JOIN voice v ON v.parameter_code = p.code;

  RETURN jsonb_build_object(
    'locked', false,
    'item_count', v_item_count,
    'self_scored', v_self_count,
    'week_cutoff', v_cutoff,            -- kept under its old name for existing readers
    'window_cutoff', v_cutoff,          -- CADENCE: the same value, honestly named
    'window_unit', v_window ->> 'unit', -- CADENCE: 'week' | 'month' for the UI copy
    'window_learners', v_window -> 'learners',
    'window_start', v_start,
    'items', COALESCE(v_items, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_classroom_practice_compare(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_classroom_practice_compare IS
  'Classroom Practice owner-side reveal: the owner''s own score beside the sealed learner median per item, read from carre_micro_impressions (the SCF drip). AGGREGATION: each learner contributes exactly ONE value per item — their LATEST answered score (answered_at desc, offered_at desc tiebreak); voices = count of DISTINCT LEARNERS; the median is taken across those per-learner values; k>=3 is applied to the distinct-learner count, so three answers from one person stay sealed. Window is [snapshot.created_at, cutoff) where the cutoff is CONFIG-DRIVEN via fn_classroom_practice_window_cutoff (Director default 2026-07-30: completed WEEKS for classes >= 20 distinct learners, completed MONTHS below) — batch reveal only, never live. Admission: the cycle owner, or super-admin/admin, or an audit.cycle.view holder within the cycle''s own institution. Aggregates only — never an identity, a comment, or a single answer.';

-- ----------------------------------------------------------------------------
-- 4) fn_classroom_practice_sealed_comments — Principal & Director ONLY.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_classroom_practice_sealed_comments(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_cycle       record;
  v_owner_email text;
  v_start       timestamptz;
  v_window      jsonb;
  v_cutoff      timestamptz;
  v_role        text;
  v_caller_inst uuid;
  v_cross       boolean;
  v_comments    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_authenticated');
  END IF;

  SELECT c.id, c.lead_auditor_id, c.start_date, c.institution_ids,
         c.parameter_catalog_snapshot
    INTO v_cycle
  FROM public.audit_cycles c
  WHERE c.id = p_cycle_id
    AND c.frameworks @> ARRAY['CARRE']::text[]
    AND c.parameter_catalog_snapshot ->> 'catalog' = 'CLASSROOM_PRACTICE';

  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'not_found');
  END IF;

  -- THE PERSON DESCRIBED NEVER READS THESE — checked FIRST, before any role:
  -- an owner who is also a principal or an admin is still the person the
  -- comments are about (ratified decision 3: teacher sees scores only).
  IF v_cycle.lead_auditor_id = v_uid THEN
    RETURN jsonb_build_object('locked', true, 'reason', 'owner_never_reads_comments');
  END IF;

  -- Admission: Director (super-admin/admin) anywhere, or a Principal within
  -- the cycle's own institution. audit.cycle.view deliberately does NOT admit:
  -- the ratified visibility for sealed comments is Principal & Director only.
  v_cross := COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false);
  IF NOT v_cross THEN
    v_role := COALESCE(get_current_user_role(), '');
    IF v_role <> 'principal' THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'principal_or_director_only');
    END IF;
    SELECT p.institution_id INTO v_caller_inst
    FROM public.profiles p WHERE p.id = v_uid;
    IF v_caller_inst IS NULL
       OR v_cycle.institution_ids IS NULL
       OR NOT (v_caller_inst = ANY (v_cycle.institution_ids)) THEN
      RETURN jsonb_build_object('locked', true, 'reason', 'forbidden');
    END IF;
  END IF;

  v_owner_email := v_cycle.parameter_catalog_snapshot ->> 'teacher_email';
  v_start := COALESCE(
    (v_cycle.parameter_catalog_snapshot ->> 'created_at')::timestamptz,
    v_cycle.start_date::timestamptz);

  -- Same shared window as the score reveal: comments are BATCH-revealed on
  -- completed windows only, so timing can never unmask a voice.
  v_window := public.fn_classroom_practice_window_cutoff(v_owner_email, v_start);
  v_cutoff := (v_window ->> 'cutoff')::timestamptz;

  -- No learner identity, no timestamp finer than the window label, capped.
  -- Ordered by window desc then item code — never by insertion order, which
  -- would leak arrival timing within a window.
  SELECT jsonb_agg(x.c ORDER BY x.window_label DESC, x.code)
    INTO v_comments
  FROM (
    SELECT to_char(date_trunc(
             CASE v_window ->> 'unit' WHEN 'week' THEN 'week' ELSE 'month' END,
             mi.offered_at), 'YYYY-MM-DD') AS window_label,
           mi.parameter_code AS code,
           jsonb_build_object(
             'window_label', to_char(date_trunc(
               CASE v_window ->> 'unit' WHEN 'week' THEN 'week' ELSE 'month' END,
               mi.offered_at), 'YYYY-MM-DD'),
             'code', mi.parameter_code,
             'comment', mi.sealed_comment
           ) AS c
    FROM public.carre_micro_impressions mi
    WHERE v_owner_email IS NOT NULL
      AND lower(mi.teacher_email) = v_owner_email
      AND mi.sealed_comment IS NOT NULL
      AND mi.offered_at >= v_start
      AND mi.offered_at <  v_cutoff
    LIMIT 200
  ) x;

  RETURN jsonb_build_object(
    'locked', false,
    'window_unit', v_window ->> 'unit',
    'window_cutoff', v_cutoff,
    'comments', COALESCE(v_comments, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_classroom_practice_sealed_comments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_classroom_practice_sealed_comments(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_classroom_practice_sealed_comments(uuid) IS
  'Classroom Practice sealed comments — PRINCIPAL & DIRECTOR ONLY (ratified decision 3). The cycle''s owner is refused FIRST, before any role check: the person described never reads what learners sealed about them, even if they hold admin or principal. Principals read within their own institution; super-admin/admin (Director) read across. audit.cycle.view deliberately does not admit. Comments are BATCH-revealed on the SAME config-driven completed window as the score reveal (fn_classroom_practice_window_cutoff), carry item code + text + window label only — no learner identity, no fine timestamps, ordered by window then item (never insertion order), capped at 200. Deliberately NOT gated on the owner''s self-score: that gate keeps the teacher''s mirror from becoming an answer key, and these never reach the teacher at all.';

-- PostgREST schema-cache reload (replaced signatures invisible to REST until this).
NOTIFY pgrst, 'reload schema';
