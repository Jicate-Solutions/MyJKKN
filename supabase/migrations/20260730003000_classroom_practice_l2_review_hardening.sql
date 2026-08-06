-- =============================================================================
-- 20260730003000_classroom_practice_l2_review_hardening.sql
-- Classroom Practice L2 — hardening from the deep review on PR #2585.
--
-- 20260729184500_classroom_practice_l2_micro.sql IS ALREADY APPLIED TO PROD.
-- It must NEVER be edited. Every server-side correction lives here, as a
-- forward migration that replaces the three RPCs and swaps one constraint.
--
-- Findings addressed (review verdict: no CRITICAL/HIGH; the seal, RLS,
-- kill-switch and race design were found sound):
--
--   1. MEDIUM — fn_scf_micro_health aggregated session_feedback and
--      carre_micro_impressions across ALL institutions, gated only by
--      is_admin()/audit.cycle.view. A tenant-scoped admin could read another
--      institution's submission volumes. THIS SHAPE IS LIVE ON PROD; it is the
--      reason this migration exists. Now scoped to the caller's institution
--      unless the caller is a global super admin.
--   2. MEDIUM — the dedup key omitted timetable_id while next_item resolves the
--      session BY timetable_id, so a learner in two classes sharing one period
--      slot on one day got an item only for the first. timetable_id now joins
--      the UNIQUE constraint, the already_offered probe and the ON CONFLICT
--      target.
--   3. MEDIUM — a non-empty, non-UUID faculty_id (a staff CODE rather than an
--      id) made ::uuid raise 22P02; the catch-all swallowed it and returned
--      {item:null,'unavailable'}, silently disabling the feature for every such
--      session. Both casts are now CASE/regex-guarded, mirroring
--      20260722062012. NOTE: the student_id cast in the Present check had the
--      same defect and the same blast radius — it is guarded here too, though
--      the review did not flag it.
--   4. LOW — a skip also stamps answered_at, so the comment-only branch let a
--      sealed comment attach to a SKIPPED impression. Invariant 8 says never
--      after a skip; that is now enforced in SQL, not only in the UI.
--   5. LOW — the cadence read still filtered on is_active, so a deactivated
--      policy row (the kill switch) fell back to the default cadence and kept
--      issuing invites while next_item correctly reported 'disabled'. Both
--      RPCs now share one rule: row present but inactive, OR enabled=false =>
--      feature off (no invites, no comment writes); row MISSING => documented
--      defaults, so a fresh database still works.
--   6. LOW — teacher_email was stored and compared verbatim, so one Senior
--      Learner whose blob casing varies by day would have their rotation deck
--      and reveal aggregates split per casing. Stored lowered, compared
--      lowered, with a backfill below and lower() indexes to keep both hot
--      paths index-backed.
--
-- DELIBERATELY NOT CHANGED (Director ruling, 2026-07-30) — a learner may attach
-- a sealed comment on any first answer, not only on an invited one. The cadence
-- is PROMPT-FATIGUE control, not a write restriction: a learner who volunteers a
-- sealed line is voice-positive and refusing it would discard the exact signal
-- this loop exists to collect. One-per-impression remains the hard cap, and
-- fix 4 above stops it riding a skip.
--
-- Additive and reversible: no data is destroyed. The constraint swap widens the
-- key (every row that was legal before is still legal), and the backfill only
-- lowercases text.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Normalise stored emails BEFORE the comparisons below start relying on it.
--    The table is empty today; this is for idempotence and for any environment
--    that ran the base migration earlier.
-- ---------------------------------------------------------------------------
UPDATE public.carre_micro_impressions
   SET teacher_email = lower(teacher_email),
       updated_at    = now()
 WHERE teacher_email IS DISTINCT FROM lower(teacher_email);

-- ---------------------------------------------------------------------------
-- 2) Dedup key gains timetable_id.
--    The old constraint was created inline in CREATE TABLE, so its name is
--    server-generated AND long enough to be truncated at 63 bytes — never
--    hard-code it. Find it by its exact column set instead.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_class rel     ON rel.oid = con.conrelid
  JOIN pg_namespace ns  ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'carre_micro_impressions'
    AND con.contype = 'u'
    -- attname is type `name`, so an uncast array_agg yields name[] and there is
    -- no name[] = text[] operator (42883). Cast in BOTH the aggregate and the
    -- ORDER BY: `name` sorts under C collation while `text` uses the database
    -- collation, so casting only one side could reorder the array on some
    -- databases and silently fail to match.
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(con.conkey) k
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
    ) = ARRAY['attendance_date','learner_id','period_id']
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.carre_micro_impressions DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.carre_micro_impressions
    ADD CONSTRAINT carre_micro_impressions_session_uniq
    UNIQUE (learner_id, attendance_date, timetable_id, period_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN
  NULL;  -- already swapped
END $$;

COMMENT ON CONSTRAINT carre_micro_impressions_session_uniq ON public.carre_micro_impressions IS
  'INVARIANT 1 — one micro-item per (learner, session). timetable_id is part of the key because a learner can sit two different classes in the same period slot on one day; without it the second session silently reported already_offered (deep review, PR #2585).';

-- Keep both hot paths index-backed now that comparisons are lower()-ed.
CREATE INDEX IF NOT EXISTS idx_carre_micro_deck_lower
  ON public.carre_micro_impressions (learner_id, lower(teacher_email), parameter_code, offered_at DESC);
CREATE INDEX IF NOT EXISTS idx_carre_micro_reveal_lower
  ON public.carre_micro_impressions (lower(teacher_email), parameter_code, offered_at);

-- ---------------------------------------------------------------------------
-- 3) fn_scf_micro_next_item — guarded casts, timetable-aware dedup, lowered email.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_next_item(
  p_attendance_date date,
  p_timetable_id    uuid,
  p_period_id       text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg            jsonb;
  v_row_active     boolean;
  v_enabled        boolean;
  v_min_gap        int;
  v_floor          numeric;
  v_window         int;
  v_cooldown       int;
  v_leave_lookback int;

  v_lp        uuid;
  v_inst      uuid;
  v_period    jsonb;
  v_email     text;
  v_staff     uuid;
  v_present   boolean;

  v_total     int;
  v_answered  int;
  v_last_off  timestamptz;

  v_has_leave boolean;

  v_code      text;
  v_name      text;
  v_question  text;
  v_last_item timestamptz;
  v_id        uuid;

  -- Canonical UUID shape. Anything else must become NULL rather than raise:
  -- a single malformed roster entry would otherwise abort the offer path for
  -- every learner in the session (mirrors 20260722062012).
  c_uuid_re constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  -- ---- config -------------------------------------------------------------
  -- is_active is READ, not filtered on: a row that is present but deactivated
  -- means an operator turned this off. Only a genuinely MISSING row falls
  -- through to defaults.
  SELECT pp.value, COALESCE(pp.is_active, true)
    INTO v_cfg, v_row_active
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.l2'
    AND pp.scope_type = 'global'
    AND pp.scope_id IS NULL
  LIMIT 1;

  IF v_cfg IS NOT NULL AND NOT COALESCE(v_row_active, true) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'disabled');
  END IF;

  -- COALESCE only replaces NULL, never false — an explicit enabled=false
  -- survives this line.
  v_enabled        := COALESCE((v_cfg ->> 'enabled')::boolean, true);
  v_min_gap        := COALESCE((v_cfg ->> 'min_gap_days_per_item')::int, 10);
  v_floor          := COALESCE((v_cfg ->> 'backoff_answer_rate_floor')::numeric, 0.2);
  v_window         := GREATEST(COALESCE((v_cfg ->> 'backoff_window')::int, 10), 1);
  v_cooldown       := COALESCE((v_cfg ->> 'backoff_cooldown_days')::int, 3);
  v_leave_lookback := COALESCE((v_cfg ->> 'leave_item_lookback_days')::int, 60);

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'disabled');
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'not_authenticated');
  END IF;

  -- Learners only. 'student' is the literal DB role VALUE in profiles.role,
  -- not user-facing wording.
  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'learners_only');
  END IF;

  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid()
  LIMIT 1;

  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_learner_profile');
  END IF;

  -- ---- resolve the session + the senior learner from the blob --------------
  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_period IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_such_session');
  END IF;

  -- Guarded cast: a malformed student_id must be skipped, never raise.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE CASE
            WHEN (st ->> 'student_id') ~ c_uuid_re
            THEN (st ->> 'student_id')::uuid END = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT COALESCE(v_present, false) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'not_present');
  END IF;

  -- Lowered at the source so every downstream comparison, index and reveal
  -- aggregate sees one canonical spelling.
  v_email := lower(NULLIF(btrim(COALESCE(v_period -> 'assigned_faculty' ->> 'faculty_email', '')), ''));

  -- Guarded cast: faculty_id is documented as a STAFF id and is reference-only,
  -- so a staff CODE here must not cost the learner their item.
  v_staff := CASE
               WHEN (v_period -> 'assigned_faculty' ->> 'faculty_id') ~ c_uuid_re
               THEN (v_period -> 'assigned_faculty' ->> 'faculty_id')::uuid END;

  -- Coarse FN/AN blobs carry no assigned person: nothing to attribute to.
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_attributable_session');
  END IF;

  -- ---- invariant 1: never a second item on the same submission -------------
  -- timetable_id included: two classes can share one period slot on a day.
  IF EXISTS (
    SELECT 1 FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
      AND mi.attendance_date = p_attendance_date
      AND mi.timetable_id = p_timetable_id
      AND mi.period_id = p_period_id
  ) THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'already_offered');
  END IF;

  -- ---- invariant 6: auto-backoff on this learner's own response rate -------
  SELECT count(*), count(r.answered_at), max(r.offered_at)
    INTO v_total, v_answered, v_last_off
  FROM (
    SELECT mi.answered_at, mi.offered_at
    FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
    ORDER BY mi.offered_at DESC
    LIMIT GREATEST(v_window, 1)
  ) r;

  IF COALESCE(v_total, 0) >= v_window
     AND v_total > 0
     AND (v_answered::numeric / v_total::numeric) < v_floor
     AND v_last_off IS NOT NULL
     AND v_last_off > now() - make_interval(days => v_cooldown)
  THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'backoff');
  END IF;

  -- ---- invariant 5: relevance gate for CP-C1 ------------------------------
  -- ANY decided leave/OD in the lookback (Director-confirmed) — not only ones
  -- this person decided. updated_at is the decision-time proxy: the table has
  -- no decided_at column.
  SELECT EXISTS (
    SELECT 1
    FROM public.leave_onduty_applications loa
    WHERE loa.learner_id = v_lp
      AND loa.status IN ('approved', 'rejected')
      AND loa.updated_at >= now() - make_interval(days => v_leave_lookback)
  ) INTO v_has_leave;

  -- ---- invariant 4: per-(learner, senior learner) rotation deck ------------
  SELECT c.code, c.name, COALESCE(NULLIF(c.description, ''), c.name), deck.last_offered
    INTO v_code, v_name, v_question, v_last_item
  FROM public.audit_parameter_catalog c
  LEFT JOIN LATERAL (
    SELECT max(mi.offered_at) AS last_offered
    FROM public.carre_micro_impressions mi
    WHERE mi.learner_id = v_lp
      AND lower(mi.teacher_email) = v_email
      AND mi.parameter_code = c.code
  ) deck ON true
  WHERE c.code LIKE 'CP-%'
    AND COALESCE(c.is_active, true)
    AND (c.code <> 'CP-C1' OR COALESCE(v_has_leave, false))
  ORDER BY deck.last_offered ASC NULLS FIRST, c.code ASC
  LIMIT 1;

  IF v_code IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'no_candidate');
  END IF;

  IF v_last_item IS NOT NULL
     AND v_last_item > now() - make_interval(days => v_min_gap)
  THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'deck_cooling');
  END IF;

  -- ---- record the offer ----------------------------------------------------
  INSERT INTO public.carre_micro_impressions (
    institution_id, learner_id, teacher_email, teacher_staff_id,
    parameter_code, attendance_date, timetable_id, period_id
  )
  VALUES (
    v_inst, v_lp, v_email, v_staff,
    v_code, p_attendance_date, p_timetable_id, p_period_id
  )
  ON CONFLICT (learner_id, attendance_date, timetable_id, period_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('item', NULL, 'reason', 'already_offered');
  END IF;

  RETURN jsonb_build_object(
    'item', jsonb_build_object(
      'impression_id', v_id,
      'code',          v_code,
      'name',          v_name,
      'question',      v_question
    )
  );

EXCEPTION WHEN OTHERS THEN
  -- INVARIANT 3: never surface an error to a learner who just submitted
  -- feedback. With both casts guarded above, this is now a genuine last resort
  -- rather than a routine path.
  RETURN jsonb_build_object('item', NULL, 'reason', 'unavailable');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_next_item(date,uuid,text) IS
  'Classroom Practice L2: picks AND records the single micro-item riding one feedback submission. Learner-only. Senior learner resolved server-side from the attendance blob and stored lowercased. Both ::uuid casts are regex-guarded so a malformed roster or staff id cannot abort the offer path. Dedup key includes timetable_id. Honors the kill switch (enabled=false OR a deactivated policy row), per-(learner,senior learner) rotation with min_gap_days, the CP-C1 decided-leave relevance gate, and per-learner auto-backoff. Records the offer at OFFER time so ignored offers count against response rate. Never raises.';

-- ---------------------------------------------------------------------------
-- 4) fn_scf_micro_answer — no comment on a skip, kill-switch-aware cadence.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_answer(
  p_impression_id uuid,
  p_score         int DEFAULT NULL,
  p_skip          boolean DEFAULT false,
  p_comment       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lp        uuid;
  v_hit       int;
  v_comment   text;
  v_cfg       jsonb;
  v_row_active boolean;
  v_off       boolean;
  v_every     int;
  v_email     text;
  v_answers   int;
  v_invite    boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF COALESCE(get_current_user_role(), '') NOT IN ('student', 'learner') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'learners_only');
  END IF;

  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid()
  LIMIT 1;

  IF v_lp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_learner_profile');
  END IF;

  -- ---- one kill-switch rule, shared with fn_scf_micro_next_item -----------
  -- Row present but deactivated, OR enabled=false => feature OFF: no invites
  -- and no comment writes. A MISSING row => documented defaults. Recording a
  -- score or a skip still works, because that item was already offered and
  -- discarding the learner's answer would lose data they already gave.
  SELECT pp.value, COALESCE(pp.is_active, true)
    INTO v_cfg, v_row_active
  FROM public.platform_policies pp
  WHERE pp.policy_key = 'classroom_practice.l2'
    AND pp.scope_type = 'global'
    AND pp.scope_id IS NULL
  LIMIT 1;

  v_off := (v_cfg IS NOT NULL AND NOT COALESCE(v_row_active, true))
        OR NOT COALESCE((v_cfg ->> 'enabled')::boolean, true);

  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');
  IF v_comment IS NOT NULL THEN
    v_comment := left(v_comment, 2000);
  END IF;

  IF v_off AND v_comment IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'disabled');
  END IF;

  -- ---- comment-only follow-up ---------------------------------------------
  -- The invite appears AFTER the item is answered, so the comment arrives in a
  -- second call. NOT skipped: a skip also stamps answered_at, and invariant 8
  -- says a comment never rides a skip — enforced here, not only in the UI.
  -- One comment maximum: the sealed_comment IS NULL guard makes a second send a
  -- refusal rather than an overwrite.
  IF v_comment IS NOT NULL AND p_score IS NULL AND NOT COALESCE(p_skip, false) THEN
    UPDATE public.carre_micro_impressions mi
       SET sealed_comment = v_comment,
           updated_at     = now()
     WHERE mi.id = p_impression_id
       AND mi.learner_id = v_lp
       AND mi.answered_at IS NOT NULL
       AND NOT mi.skipped
       AND mi.sealed_comment IS NULL;

    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'not_commentable');
    END IF;
    RETURN jsonb_build_object('success', true, 'comment_saved', true);
  END IF;

  -- ---- normal answer ------------------------------------------------------
  IF NOT COALESCE(p_skip, false) THEN
    IF p_score IS NULL OR p_score < 0 OR p_score > 4 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_score');
    END IF;
  END IF;

  -- A comment riding the FIRST answer is accepted on purpose (Director,
  -- 2026-07-30): the every-Nth cadence is prompt-fatigue control, not a write
  -- restriction — a learner who volunteers a sealed line is voice-positive.
  -- One-per-impression stays the only hard cap, and a skip nulls it out below.
  UPDATE public.carre_micro_impressions mi
     SET score          = CASE WHEN COALESCE(p_skip, false) THEN NULL ELSE p_score::smallint END,
         skipped        = COALESCE(p_skip, false),
         answered_at    = now(),
         sealed_comment = CASE
                            WHEN COALESCE(p_skip, false) THEN mi.sealed_comment
                            ELSE COALESCE(mi.sealed_comment, v_comment)
                          END,
         updated_at     = now()
   WHERE mi.id = p_impression_id
     AND mi.learner_id = v_lp
     AND mi.answered_at IS NULL
  RETURNING mi.teacher_email INTO v_email;

  GET DIAGNOSTICS v_hit = ROW_COUNT;

  IF v_hit = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_answerable');
  END IF;

  -- ---- comment invite cadence --------------------------------------------
  IF NOT v_off AND NOT COALESCE(p_skip, false) AND v_email IS NOT NULL THEN
    v_every := GREATEST(COALESCE((v_cfg ->> 'comment_invite_every_n_answers')::int, 8), 0);

    IF v_every > 0 THEN
      SELECT count(*) INTO v_answers
      FROM public.carre_micro_impressions mi
      WHERE mi.learner_id = v_lp
        AND lower(mi.teacher_email) = lower(v_email)
        AND mi.answered_at IS NOT NULL
        AND NOT mi.skipped;

      v_invite := COALESCE(v_answers, 0) > 0
              AND (v_answers % v_every) = 0
              AND v_comment IS NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'skipped',        COALESCE(p_skip, false),
    'comment_invite', v_invite
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_answer(uuid,int,boolean,text) IS
  'Classroom Practice L2: the learner answers their own micro-item 0-4, or skips, and may attach ONE sealed comment. A comment can never ride a SKIP (skips stamp answered_at, so the comment-only branch also requires NOT skipped). A comment on any first answer IS allowed by design — the every-Nth cadence is prompt-fatigue control, not a write gate (Director, 2026-07-30); one-per-impression is the hard cap. Kill switch (enabled=false OR a deactivated policy row) blocks invites and comment writes but still records scores and skips. Owner-scoped via learners_profiles. Never raises.';

-- ---------------------------------------------------------------------------
-- 5) fn_scf_micro_health — INSTITUTION-SCOPED. This is the finding whose
--    unscoped form is live on prod.
--
--    A caller who is not a global super admin sees ONLY their own institution's
--    numbers. Note the fail-closed property: if such a caller has no
--    institution_id on their profile, institution_id = NULL matches nothing and
--    they see zeroes rather than everyone's data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_micro_health()
RETURNS TABLE (
  week_start        date,
  base_submissions  bigint,
  impressions       bigint,
  answered          bigint,
  skipped           bigint,
  answer_rate       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_super boolean;
  v_inst  uuid;
BEGIN
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('audit.cycle.view'), false)
  ) THEN
    RAISE EXCEPTION 'fn_scf_micro_health: not authorised';
  END IF;

  v_super := COALESCE(is_super_admin(), false);
  v_inst  := auth_institution_id();

  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(
      date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')::date,
      date_trunc('week', CURRENT_DATE)::date,
      INTERVAL '1 week'
    )::date AS wk
  ),
  base AS (
    SELECT date_trunc('week', sf.created_at)::date AS wk, count(*) AS n
    FROM public.session_feedback sf
    WHERE sf.created_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')
      AND (v_super OR sf.institution_id = v_inst)
    GROUP BY 1
  ),
  micro AS (
    SELECT date_trunc('week', mi.offered_at)::date AS wk,
           count(*)                                             AS n,
           count(mi.answered_at) FILTER (WHERE NOT mi.skipped)   AS n_answered,
           count(*) FILTER (WHERE mi.skipped)                    AS n_skipped
    FROM public.carre_micro_impressions mi
    WHERE mi.offered_at >= date_trunc('week', CURRENT_DATE - INTERVAL '7 weeks')
      AND (v_super OR mi.institution_id = v_inst)
    GROUP BY 1
  )
  SELECT
    w.wk,
    COALESCE(b.n, 0)::bigint,
    COALESCE(m.n, 0)::bigint,
    COALESCE(m.n_answered, 0)::bigint,
    COALESCE(m.n_skipped, 0)::bigint,
    CASE WHEN COALESCE(m.n, 0) = 0 THEN NULL
         ELSE round(COALESCE(m.n_answered, 0)::numeric / m.n::numeric, 3)
    END
  FROM weeks w
  LEFT JOIN base  b ON b.wk = w.wk
  LEFT JOIN micro m ON m.wk = w.wk
  ORDER BY w.wk;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_micro_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_micro_health() TO authenticated;

COMMENT ON FUNCTION public.fn_scf_micro_health() IS
  'Classroom Practice L2 alarm metric (invariant 7). Weekly for ~8 weeks: base session-feedback submissions next to micro offers/answers/skips. INSTITUTION-SCOPED — a caller who is not a global super admin sees only their own institution, and fail-closed (no institution on the profile => zeroes, never everyone). A DROP IN base_submissions after L2 ships is the signal to flip platform_policies classroom_practice.l2 -> enabled=false. Aggregates only, never identities, never sealed_comment. Gated: super admin / admin / audit.cycle.view.';
