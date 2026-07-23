-- =============================================================================
-- Migration: 20260715070000_verified_skills_record
-- Verified Skills Record — "My Proof" (phase 1)
-- Spec: specs/verified-learner-transcript-spec-2026-07-14.md
--       (Director build verdict 2026-07-14; build-once-dial-audience shape)
--
-- One page per learner where every line is backed by a real, timestamped
-- platform record. Phase 1 assembles EXISTING live data only:
--   * attendance      — the same figures fn_my_running_attendance shows
--   * engagement      — session_feedback participation COUNTS only (the
--                       feedback CONTENT is permanently excluded — the
--                       anonymity promise of #2049/#2051 is not retroactively
--                       breakable, even with learner consent)
--   * marks           — overlaid in the app layer from COE, gated by the
--                       exam-audit provenance verdicts (NOT in this file)
--   * self-claims     — phase 1 ships a labeled empty section (no table yet)
--
-- Policies baked in (Director-chosen, binding):
--   * learner-controlled sharing (record private until the learner shares)
--   * health-check gate (a section renders only when the college's data
--     passes health — hidden, never a damning blank)
--   * dispute-review-before-first-share (share tokens cannot be created until
--     the learner has VIEWED their record and has no open disputes)
--   * integrity checks day one (submission-burst patterns quietly withhold
--     the "verified" stamp — never rendered as accusation)
--   * outward sharing ring-gated PER COLLEGE via platform_policies
--     ('vsr.sharing_enabled', default FALSE everywhere at launch)
--
-- SECURITY MODEL
--   * All fns are SECURITY DEFINER, SET search_path = public, and duplicate
--     the scope gate inside (self-scope via profiles.learner_id of auth.uid();
--     caller-supplied learner ids are never trusted).
--   * Core fns (fn_vsr_*_core) carry NO grants at all — they are internal and
--     only reachable through the wrappers (definer-owner call chain).
--   * fn_vsr_shared_record is the ONE deliberate anon surface of this module:
--     explicit GRANT TO anon, resolves ONLY a valid, unrevoked, unexpired
--     share token, and re-checks the college's sharing dial at view time, so
--     revocation or turning the dial off kills every link instantly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- Share tokens: one row per live verify-link a learner has issued.
CREATE TABLE IF NOT EXISTS public.vsr_share_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  token          text NOT NULL UNIQUE,
  label          text,                                -- who it's for, learner-entered
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  view_count     integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vsr_share_tokens_learner ON public.vsr_share_tokens (learner_id, created_at DESC);

COMMENT ON TABLE public.vsr_share_tokens IS
  'Live verify-links for the Verified Skills Record (My Proof). Created/revoked ONLY via fn_vsr_create_share_token / fn_vsr_revoke_share_token; resolved anonymously ONLY via fn_vsr_shared_record. Revocation or the college sharing dial going off kills the link at view time. Spec: specs/verified-learner-transcript-spec-2026-07-14.md';

-- Disputes: the learner''s "this is wrong" button. A human resolves BEFORE the
-- record can ever be shared (open disputes block token creation).
CREATE TABLE IF NOT EXISTS public.vsr_disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  section         text NOT NULL CHECK (section IN ('attendance','engagement','marks','profile','other')),
  detail          text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.profiles(id),
  resolution_note text
);

CREATE INDEX IF NOT EXISTS idx_vsr_disputes_learner ON public.vsr_disputes (learner_id, status);
CREATE INDEX IF NOT EXISTS idx_vsr_disputes_open    ON public.vsr_disputes (status, created_at DESC) WHERE status = 'open';

COMMENT ON TABLE public.vsr_disputes IS
  'Learner-raised corrections against their own Verified Skills Record. Open disputes BLOCK share-token creation (dispute-review-before-first-share, Director policy 3). Opened via fn_vsr_open_dispute; resolved via fn_vsr_resolve_dispute (admin).';

-- Per-learner state: proves the learner has SEEN their own record (share
-- cannot enable before first view — Director policy 3).
CREATE TABLE IF NOT EXISTS public.vsr_learner_state (
  learner_id      uuid PRIMARY KEY REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at  timestamptz NOT NULL DEFAULT now(),
  view_count      integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.vsr_learner_state IS
  'First/last time a learner viewed their own Verified Skills Record. Stamped by fn_vsr_my_record; fn_vsr_create_share_token refuses until a row exists.';

-- ---------------------------------------------------------------------------
-- 2) RLS — learners read their own rows; ALL writes flow through the fns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.vsr_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsr_disputes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vsr_learner_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vsr_share_tokens_own ON public.vsr_share_tokens;
CREATE POLICY vsr_share_tokens_own ON public.vsr_share_tokens
  FOR SELECT TO authenticated
  USING (learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS vsr_disputes_own ON public.vsr_disputes;
CREATE POLICY vsr_disputes_own ON public.vsr_disputes
  FOR SELECT TO authenticated
  USING (learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid()));

-- Admins see all disputes (the resolution queue).
DROP POLICY IF EXISTS vsr_disputes_admin ON public.vsr_disputes;
CREATE POLICY vsr_disputes_admin ON public.vsr_disputes
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_admin());

DROP POLICY IF EXISTS vsr_learner_state_own ON public.vsr_learner_state;
CREATE POLICY vsr_learner_state_own ON public.vsr_learner_state
  FOR SELECT TO authenticated
  USING (learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid()));

REVOKE ALL ON public.vsr_share_tokens, public.vsr_disputes, public.vsr_learner_state FROM anon, PUBLIC;
GRANT SELECT ON public.vsr_share_tokens, public.vsr_disputes, public.vsr_learner_state TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) fn_vsr_attendance_core — the attendance computation, extracted VERBATIM
--    from fn_my_running_attendance and parameterized by learner+institution,
--    so My Proof and the learner''s running-attendance card can never drift.
--    INTERNAL: no grants; reachable only through definer wrappers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_attendance_core(p_learner uuid, p_inst uuid)
 RETURNS TABLE(course_id uuid, course_code text, course_name text, present integer, total integer, pct numeric, first_session date, last_session date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
BEGIN
  IF p_learner IS NULL OR p_inst IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH periods AS (
    SELECT CASE WHEN (e.val->>'course_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (e.val->>'course_id')::uuid END AS cid,
           sa.attendance_date AS ad,
           e.val AS period
    FROM public.student_attendance sa,
         LATERAL jsonb_each(sa.attendance_data) AS e(k, val)
    WHERE sa.institution_id = p_inst
      AND jsonb_typeof(sa.attendance_data) = 'object'
  ),
  mine AS (
    SELECT p.cid, p.ad,
           CASE WHEN lower(s->>'status') = 'present' THEN 1 ELSE 0 END AS is_present
    FROM periods p,
         LATERAL jsonb_array_elements(p.period->'students') AS s
    WHERE p.period ? 'students'
      AND (s->>'student_id') = p_learner::text
  )
  SELECT m.cid AS course_id,
         c.course_code::text,
         c.course_name::text,
         SUM(m.is_present)::int AS present,
         COUNT(*)::int AS total,
         ROUND(100.0 * SUM(m.is_present) / NULLIF(COUNT(*), 0), 1) AS pct,
         MIN(m.ad) AS first_session,
         MAX(m.ad) AS last_session
  FROM mine m
  LEFT JOIN public.courses c ON c.id = m.cid
  GROUP BY m.cid, c.course_code, c.course_name
  ORDER BY pct ASC NULLS LAST;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_attendance_core(uuid, uuid) FROM anon, authenticated, PUBLIC;

-- fn_my_running_attendance becomes a thin self-scope wrapper around the core —
-- same signature, same grants, provably identical figures forever.
CREATE OR REPLACE FUNCTION public.fn_my_running_attendance()
 RETURNS TABLE(course_id uuid, course_code text, course_name text, present integer, total integer, pct numeric, first_session date, last_session date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE v_learner uuid; v_inst uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_my_running_attendance: not authenticated';
  END IF;
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN RETURN; END IF;  -- not a learner: empty, not an error

  RETURN QUERY SELECT * FROM public.fn_vsr_attendance_core(v_learner, v_inst);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_my_running_attendance() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_running_attendance() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) fn_vsr_health_core — does this college''s data pass the health check?
--    A section renders ONLY when healthy (Director policy 2: e.g. an empty
--    even-semester attendance term must hide the section, never show a
--    damning blank). Thresholds are config rows, not literals.
--    INTERNAL: no grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_health_core(p_inst uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_days int;
  v_min_days    int;
  v_att_days    int;
  v_eng_days    int;
BEGIN
  v_window_days := fn_get_policy_int('vsr.health.window_days', 45, p_inst);
  v_min_days    := fn_get_policy_int('vsr.health.min_active_days', 8, p_inst);

  SELECT COUNT(DISTINCT sa.attendance_date) INTO v_att_days
  FROM public.student_attendance sa
  WHERE sa.institution_id = p_inst
    AND sa.attendance_date >= current_date - v_window_days;

  SELECT COUNT(DISTINCT sf.attendance_date) INTO v_eng_days
  FROM public.session_feedback sf
  WHERE sf.institution_id = p_inst
    AND sf.attendance_date >= current_date - v_window_days;

  RETURN jsonb_build_object(
    'window_days', v_window_days,
    'min_active_days', v_min_days,
    'attendance', jsonb_build_object('healthy', v_att_days >= v_min_days, 'active_days', v_att_days),
    'engagement', jsonb_build_object('healthy', v_eng_days >= v_min_days, 'active_days', v_eng_days)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_health_core(uuid) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 5) fn_vsr_record_core — assemble one learner''s record as JSONB.
--    Engagement = participation COUNTS and whole-record aggregates ONLY.
--    Never per-session values, never free text, never which session got which
--    rating (anonymity promise #2049/#2051).
--    Integrity (day one, Director policy 4): the "verified" stamp is EARNED by
--    prompt check-ins — submissions server-stamped within a config window of
--    the session itself. Measured on prod 2026-07-15: a naive one-day-burst
--    detector would have failed 76% of active learners (catch-up dumps when
--    the feature reached each cohort are rollout mechanics, not gaming);
--    prompt-earning passes 83.6% and cannot be faked retroactively
--    (created_at is server time). No stamp = absence, never accusation.
--    INTERNAL: no grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_record_core(p_learner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_inst        uuid;
  v_learner_hdr jsonb;
  v_health      jsonb;
  v_attendance  jsonb;
  v_engagement  jsonb;
  v_prompt_window int;
  v_min_prompt    int;
BEGIN
  SELECT lp.institution_id,
         jsonb_build_object(
           'name', NULLIF(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
           'register_number', lp.register_number,
           'roll_number', lp.roll_number,
           'program', pr.program_name,
           'institution', i.name,
           'institution_id', lp.institution_id
         )
    INTO v_inst, v_learner_hdr
  FROM public.learners_profiles lp
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.institutions i ON i.id = lp.institution_id
  WHERE lp.id = p_learner;

  IF v_inst IS NULL AND v_learner_hdr IS NULL THEN
    RETURN NULL; -- no such learner
  END IF;

  v_health := public.fn_vsr_health_core(v_inst);

  -- Attendance layer — rendered only when the college''s attendance data is
  -- healthy. Marked in-session by a Senior Learner; stamp follows health.
  IF (v_health->'attendance'->>'healthy')::boolean THEN
    SELECT jsonb_build_object(
             'verified', true,
             'courses', coalesce(jsonb_agg(jsonb_build_object(
               'course_code', a.course_code,
               'course_name', a.course_name,
               'present', a.present,
               'total', a.total,
               'pct', a.pct,
               'first_session', a.first_session,
               'last_session', a.last_session
             ) ORDER BY a.pct ASC NULLS LAST), '[]'::jsonb),
             'overall', jsonb_build_object(
               'present', coalesce(SUM(a.present), 0),
               'total', coalesce(SUM(a.total), 0),
               'pct', ROUND(100.0 * coalesce(SUM(a.present),0) / NULLIF(SUM(a.total), 0), 1)
             )
           )
      INTO v_attendance
    FROM public.fn_vsr_attendance_core(p_learner, v_inst) a;
  ELSE
    v_attendance := NULL; -- section hidden, never a damning blank
  END IF;

  -- Engagement layer — counts + whole-record aggregates only.
  IF (v_health->'engagement'->>'healthy')::boolean THEN
    v_prompt_window := fn_get_policy_int('vsr.integrity.prompt_window_days', 1, v_inst);
    v_min_prompt    := fn_get_policy_int('vsr.integrity.min_prompt_checkins', 10, v_inst);

    SELECT jsonb_build_object(
             -- The stamp is EARNED by an established prompt-check-in habit
             -- (server-stamped within the window — cannot be faked after the
             -- fact). Catch-up backfills still COUNT; they just don''t earn
             -- the stamp. No stamp = absence, never accusation.
             'verified', (COUNT(*) FILTER (WHERE sf.created_at::date - sf.attendance_date <= v_prompt_window) >= v_min_prompt),
             'total_checkins', COUNT(*),
             'prompt_checkins', COUNT(*) FILTER (WHERE sf.created_at::date - sf.attendance_date <= v_prompt_window),
             'active_days', COUNT(DISTINCT sf.attendance_date),
             'courses_covered', COUNT(DISTINCT sf.course_id) FILTER (WHERE sf.course_id IS NOT NULL),
             'first_day', MIN(sf.attendance_date),
             'last_day', MAX(sf.attendance_date),
             'rating_levels_used', COUNT(DISTINCT sf.understood),
             'concerns_raised', COUNT(*) FILTER (WHERE sf.understood <= 2)
           )
      INTO v_engagement
    FROM public.session_feedback sf
    WHERE sf.student_id = p_learner;
  ELSE
    v_engagement := NULL;
  END IF;

  RETURN jsonb_build_object(
    'learner', v_learner_hdr,
    'generated_at', now(),
    'health', v_health,
    'attendance', v_attendance,
    'engagement', v_engagement,
    -- Durable-skills ratings are phase 2 (>=3 raters x >=2 activities floor);
    -- phase 1 renders a placeholder section only — never a faked score.
    'durable_skills', NULL,
    'self_claims', jsonb_build_object('label', 'Self-reported, not verified', 'items', '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_record_core(uuid) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 6) fn_vsr_my_record — the learner''s own view (self-scoped), and the act
--    that STAMPS "this learner has seen their record" (share precondition).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_my_record()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_learner uuid;
  v_record  jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_my_record: not authenticated';
  END IF;
  SELECT p.learner_id INTO v_learner FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN RETURN NULL; END IF; -- not a learner: empty, not an error

  v_record := public.fn_vsr_record_core(v_learner);
  IF v_record IS NULL THEN RETURN NULL; END IF;

  -- Viewing the record is the precondition for sharing — stamp it.
  INSERT INTO public.vsr_learner_state (learner_id)
  VALUES (v_learner)
  ON CONFLICT (learner_id)
  DO UPDATE SET last_viewed_at = now(), view_count = vsr_learner_state.view_count + 1;

  RETURN v_record || jsonb_build_object(
    'disputes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'section', d.section, 'detail', d.detail,
               'status', d.status, 'created_at', d.created_at,
               'resolution_note', d.resolution_note
             ) ORDER BY d.created_at DESC), '[]'::jsonb)
      FROM public.vsr_disputes d WHERE d.learner_id = v_learner
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_my_record() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_my_record() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) fn_vsr_my_share_panel — sharing state for the learner''s own page:
--    the college dial, the three preconditions, and the learner''s tokens.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_my_share_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_inst    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_my_share_panel: not authenticated';
  END IF;
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'sharing_enabled', fn_get_policy_bool('vsr.sharing_enabled', false, v_inst),
    'has_viewed', EXISTS (SELECT 1 FROM public.vsr_learner_state s WHERE s.learner_id = v_learner),
    'open_disputes', (SELECT COUNT(*) FROM public.vsr_disputes d
                      WHERE d.learner_id = v_learner AND d.status = 'open'),
    'tokens', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'token', t.token, 'label', t.label,
               'created_at', t.created_at, 'expires_at', t.expires_at,
               'revoked_at', t.revoked_at, 'view_count', t.view_count,
               'last_viewed_at', t.last_viewed_at
             ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM public.vsr_share_tokens t WHERE t.learner_id = v_learner
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_my_share_panel() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_my_share_panel() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) fn_vsr_create_share_token — learner-controlled sharing, with ALL
--    preconditions enforced server-side:
--      (1) the college sharing dial is ON  (config row; OFF everywhere at launch)
--      (2) the learner has VIEWED their own record
--      (3) the learner has NO open disputes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_create_share_token(p_label text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_inst    uuid;
  v_open    int;
  v_token   text;
  v_expiry_days int;
  v_row     public.vsr_share_tokens%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_create_share_token: not authenticated';
  END IF;
  SELECT p.learner_id, p.institution_id INTO v_learner, v_inst
  FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can share a Verified Skills Record.');
  END IF;

  IF NOT fn_get_policy_bool('vsr.sharing_enabled', false, v_inst) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Outward sharing is not yet enabled for your college. Your record stays private to you.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vsr_learner_state s WHERE s.learner_id = v_learner) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Please review your record first — sharing unlocks after you have seen it.');
  END IF;

  SELECT COUNT(*) INTO v_open FROM public.vsr_disputes d
  WHERE d.learner_id = v_learner AND d.status = 'open';
  IF v_open > 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You have a correction under review. Sharing unlocks once it is resolved.');
  END IF;

  -- 24 random bytes, URL-safe base64 (32 chars) — unguessable by construction.
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  v_expiry_days := fn_get_policy_int('vsr.share_token_expiry_days', 90, v_inst);

  INSERT INTO public.vsr_share_tokens (learner_id, token, label, expires_at)
  VALUES (v_learner, v_token, NULLIF(trim(p_label), ''), now() + make_interval(days => v_expiry_days))
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('success', true, 'token', v_row.token, 'id', v_row.id,
                            'expires_at', v_row.expires_at);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_create_share_token(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_create_share_token(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) fn_vsr_revoke_share_token — the learner''s kill switch. Instant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_revoke_share_token(p_token_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_count   int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_revoke_share_token: not authenticated';
  END IF;
  SELECT p.learner_id INTO v_learner FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a learner account.');
  END IF;

  UPDATE public.vsr_share_tokens
     SET revoked_at = now()
   WHERE id = p_token_id AND learner_id = v_learner AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link not found or already revoked.');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_revoke_share_token(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_revoke_share_token(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) fn_vsr_open_dispute — the "this is wrong" button.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_open_dispute(p_section text, p_detail text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner uuid;
  v_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_open_dispute: not authenticated';
  END IF;
  SELECT p.learner_id INTO v_learner FROM public.profiles p WHERE p.id = auth.uid();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can raise a correction.');
  END IF;
  IF p_section IS NULL OR p_section NOT IN ('attendance','engagement','marks','profile','other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown record section.');
  END IF;
  IF NULLIF(trim(p_detail), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please describe what is wrong.');
  END IF;

  INSERT INTO public.vsr_disputes (learner_id, section, detail)
  VALUES (v_learner, p_section, trim(p_detail))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_open_dispute(text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_open_dispute(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11) fn_vsr_resolve_dispute — a HUMAN resolves (admin-gated inside; SECDEF
--     bypasses RLS so the gate is duplicated here).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_resolve_dispute(p_dispute_id uuid, p_status text, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_vsr_resolve_dispute: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only an administrator can resolve corrections.');
  END IF;
  IF p_status NOT IN ('resolved','dismissed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status must be resolved or dismissed.');
  END IF;

  UPDATE public.vsr_disputes
     SET status = p_status,
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = NULLIF(trim(p_note), '')
   WHERE id = p_dispute_id AND status = 'open';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Correction not found or already handled.');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_resolve_dispute(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_vsr_resolve_dispute(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12) fn_vsr_shared_record — ⚠️ THE ONE DELIBERATE ANON SURFACE OF THIS MODULE.
--     Explicit GRANT TO anon is INTENDED (documented exception to the standard
--     revoke-anon rule): a local employer opens a learner-issued verify-link
--     with no account. Access is token-scoped ONLY:
--       * the token must exist, be unrevoked and unexpired (learner kill switch)
--       * the learner''s college sharing dial must STILL be on at view time
--       * the record is RE-READ live at view time (never a snapshot)
--     Returns NULL for any invalid token — indistinguishable from absent.
--     Learner-internal state (disputes, health internals) is stripped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vsr_shared_record(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_tok     public.vsr_share_tokens%ROWTYPE;
  v_inst    uuid;
  v_record  jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;

  SELECT * INTO v_tok FROM public.vsr_share_tokens t
  WHERE t.token = p_token AND t.revoked_at IS NULL AND t.expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT lp.institution_id INTO v_inst FROM public.learners_profiles lp WHERE lp.id = v_tok.learner_id;

  -- The college dial is re-checked at VIEW time — turning it off kills every
  -- outstanding link for that college instantly.
  IF NOT fn_get_policy_bool('vsr.sharing_enabled', false, v_inst) THEN
    RETURN NULL;
  END IF;

  v_record := public.fn_vsr_record_core(v_tok.learner_id);
  IF v_record IS NULL THEN RETURN NULL; END IF;

  UPDATE public.vsr_share_tokens
     SET view_count = view_count + 1, last_viewed_at = now()
   WHERE id = v_tok.id;

  RETURN (v_record - 'health')
         || jsonb_build_object(
              'shared', jsonb_build_object(
                'issued_at', v_tok.created_at,
                'expires_at', v_tok.expires_at,
                'label', v_tok.label
              )
            );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_vsr_shared_record(text) FROM PUBLIC;
-- ⚠️ Deliberate anon grant — see the header comment on this function.
GRANT EXECUTE ON FUNCTION public.fn_vsr_shared_record(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13) Config rows (config-table pattern: every dial is a row, defaults seeded)
--     vsr.sharing_enabled is GLOBAL FALSE — outward sharing is OFF everywhere
--     at launch; a per-college flip is an institution-scoped override row.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
  ('vsr.sharing_enabled', 'global', NULL, 'false'::jsonb,
   'Verified Skills Record: may learners of this scope issue live verify-links to employers? OFF everywhere at launch (Director 2026-07-14); flip per college with an institution-scoped override row.',
   'boolean', true),
  ('vsr.share_token_expiry_days', 'global', NULL, '90'::jsonb,
   'Verified Skills Record: days a verify-link stays live before expiring (learner can revoke earlier at any time).',
   'number', true),
  ('vsr.health.window_days', 'global', NULL, '45'::jsonb,
   'Verified Skills Record: lookback window (days) for the college data health check.',
   'number', true),
  ('vsr.health.min_active_days', 'global', NULL, '8'::jsonb,
   'Verified Skills Record: minimum distinct active days inside the window for a college''s attendance/engagement data to count as healthy (unhealthy sections are hidden, never shown blank).',
   'number', true),
  ('vsr.integrity.prompt_window_days', 'global', NULL, '1'::jsonb,
   'Verified Skills Record: a feedback check-in counts as PROMPT when submitted within this many days of the session (server-stamped; retro-proof).',
   'number', true),
  ('vsr.integrity.min_prompt_checkins', 'global', NULL, '10'::jsonb,
   'Verified Skills Record: prompt check-ins needed to EARN the engagement verified stamp (earned-not-withheld integrity model; calibrated 2026-07-15: 83.6% of active learners qualify).',
   'number', true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 14) Permission key for the sidebar/menu gate. Learner-facing: granted to the
--     student role (precedent: 20260129180000_add_student_mobile_nav_permissions).
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object('learners.proof.view', true),
    updated_at = now()
WHERE role_key = 'student' AND is_active = true;

NOTIFY pgrst, 'reload schema';
