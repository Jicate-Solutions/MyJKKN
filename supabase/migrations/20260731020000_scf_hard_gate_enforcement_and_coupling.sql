-- ============================================================================
-- 20260731020000_scf_hard_gate_enforcement_and_coupling.sql
-- Faculty-engagement adoption + hard-gate enforcement (DARK, compliance-gated).
-- Spec: specs/faculty-engagement-adoption-2026-07-04.md  (Director decisions LOCKED)
-- Builds on:
--   20260615233000_session_feedback_substrate.sql
--   20260617100000_session_feedback_faculty_completion.sql  (gate_mode/window seeds)
--   20260623190500_scf_adoption_nudge.sql                    (notification 2-write path)
--   20260703003800_scf_confirmation_rollup.sql               (present-mark scan pattern)
--
-- ⚠️ NON-DESTRUCTIVE INVARIANT (unchanged, load-bearing):
--   NOTHING here mutates student_attendance.attendance_data. Confirmation and the
--   PR-D "effective attendance %" are DERIVED, recomputable reads — never a write
--   to the official attendance blob. Any effect is reversible by construction.
--
-- ⚠️ DARK / OFF BY DEFAULT:
--   * session_feedback.gate_mode default STAYS 'visibility' (seeded earlier). The
--     'hard' enforcement branch below is INERT until a super-admin flips the config.
--   * session_feedback.attendance_coupling_enabled is seeded FALSE. The effective-%
--     computation returns nothing and touches nothing until it is flipped ON (and
--     legal/compliance review of R2 in the spec is required before that flip).
--   * fn_scf_set_gate_mode is the super-admin BREAK-GLASS: revert gate_mode ->
--     'visibility' in one call, no deploy, to halt enforcement instantly.
--
-- House rules honored: every new/changed SECURITY DEFINER fn ends with an explicit
-- REVOKE EXECUTE ... FROM anon, PUBLIC + GRANT ... TO authenticated. Authorization
-- via is_super_admin()/is_admin() + user_has_permission()/role_has_institution_access
-- — no hardcoded role names. Reuses the anonymizing fn_scf_* pattern; never returns
-- per-learner feedback content; k>=3 floor preserved on the aggregate surfaces.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Safe wall-clock parser for the mixed-format blob times. The attendance blob
--    stores start_time/end_time as free text — mostly "10:00:00" (24h) or "3:00 PM"
--    (12h), but a slot can legitimately hold an unparseable value ('TBD', 'Period 1')
--    that the client time parser tolerates. Bare-casting such text with ::time raises
--    22007/22008 and, in an ORDER BY, aborts the ENTIRE fn_scf_faculty_completion
--    query. This returns the parsed time-of-day, or NULL for anything unparseable —
--    it never throws (the regex fast-rejects obvious junk; the EXCEPTION handler is the
--    last-resort backstop for shaped-but-out-of-range text like '24:70' / '13:00 PM').
--    Used for chronological sorting only (NULLS LAST). Never bare-cast blob text.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_to_time_or_null(p_text text)
RETURNS time
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  -- Fast reject of obviously-non-time text so the exception handler stays a cold path.
  -- POSIX classes (not \d/\s) to stay unambiguous under standard_conforming_strings and
  -- consistent with the UUID-shape regex used elsewhere in this file.
  IF btrim(p_text) !~ '^[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?[ ]*([AaPp][Mm])?$' THEN
    RETURN NULL;
  END IF;
  RETURN btrim(p_text)::time;
EXCEPTION WHEN others THEN
  -- Shaped like a time but out of range ('24:70', '13:00 PM'): never abort the caller.
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_to_time_or_null(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_to_time_or_null(text) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_to_time_or_null(text) IS
  'Parse a mixed-format blob wall-clock string ("10:00:00" 24h or "3:00 PM" 12h) to a '
  'time-of-day, returning NULL (never raising) for empty/unparseable/out-of-range text '
  '("TBD", "24:70"). Sorts fn_scf_faculty_completion chronologically without a bare '
  '::time cast that would abort the whole query on a non-time slot value.';

-- ----------------------------------------------------------------------------
-- 1) PR-A + PR-C — extend fn_scf_faculty_completion with:
--      start_time / end_time  (blob wall-clock, for the active-period spotlight)
--      gate_mode              (resolved per session institution via fn_get_policy_text)
--      session_status         (DERIVED enforcement status; 'incomplete' ONLY under hard)
--    Return type changes -> DROP + recreate (CREATE OR REPLACE cannot widen the
--    return signature). Safe: only the client + service call this (no DB dependents).
--    The two added-in-PR columns are additive — existing consumers ignore them.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_scf_faculty_completion(date, date);

CREATE OR REPLACE FUNCTION public.fn_scf_faculty_completion(p_from date, p_to date)
RETURNS TABLE (
  attendance_date date, timetable_id uuid, period_id text,
  course_code text, course_name text,
  present_count int, confirmed_count int, pending_count int,
  completion_pct numeric, within_window boolean,
  start_time text, end_time text,
  gate_mode text, session_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_faculty_completion: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT sa.institution_id, sa.attendance_date, sa.timetable_id,
           period.key AS period_id, period.value AS pv
    FROM public.student_attendance sa, jsonb_each(sa.attendance_data) AS period
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND lower(period.value -> 'assigned_faculty' ->> 'faculty_email') = v_email
  ),
  counted AS (
    SELECT s.institution_id, s.attendance_date, s.timetable_id, s.period_id, s.pv,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present')::int AS present_count,
      (SELECT count(*) FROM jsonb_array_elements(s.pv -> 'students') st
        WHERE st ->> 'status' = 'Present'
          AND EXISTS (
            SELECT 1 FROM public.session_feedback f
            -- Guard the ::uuid cast. A malformed blob student_id ('', 'N/A') raises
            -- 22P02 and aborts the whole completion query. Same UUID-shape regex as the
            -- sibling fn_scf_effective_attendance, applied AS A CASE so the cast can
            -- never run on a non-UUID (guaranteed evaluation order, unlike an AND qual).
            -- A non-UUID yields NULL -> never matches -> the learner just stays pending.
            WHERE f.student_id = CASE
                    WHEN (st ->> 'student_id') ~
                         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                    THEN (st ->> 'student_id')::uuid END
              AND f.attendance_date = s.attendance_date
              AND f.period_id = s.period_id
              -- Key the confirmation match on the FULL session identity. period_id is
              -- only a slot key inside a day; without timetable_id a learner's feedback
              -- for a different class sharing the same period slot could falsely mark
              -- this session confirmed.
              AND f.timetable_id = s.timetable_id))::int AS confirmed_count
    FROM sess s
  ),
  derived AS (
    SELECT c.*,
      (c.present_count - c.confirmed_count) AS pending_ct,
      -- Anchor the completion window to IST wall-clock, NOT the server TZ. Casting a
      -- date to timestamptz resolves midnight in the server zone (UTC in prod), which
      -- shifts the IST day boundary 5.5h earlier and flips session_status at the edge.
      -- Interpret attendance_date as IST midnight explicitly before adding the window.
      (now() <= (c.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
         + make_interval(hours => public.fn_get_policy_int(
             'session_feedback.window_hours', 48, c.institution_id))) AS win,
      -- Resolve the gate mode for THIS session's institution (institution override
      -- shadows the global default). Default 'visibility' matches the seeded row.
      public.fn_get_policy_text(
        'session_feedback.gate_mode', 'visibility', c.institution_id) AS gmode
    FROM counted c
    WHERE c.present_count > 0
  )
  SELECT d.attendance_date, d.timetable_id, d.period_id,
         d.pv ->> 'course_code', d.pv ->> 'course_name',
         d.present_count, d.confirmed_count, d.pending_ct,
         CASE WHEN d.present_count = 0 THEN 0
              ELSE round((d.confirmed_count::numeric / d.present_count) * 100, 0) END,
         d.win,
         d.pv ->> 'start_time', d.pv ->> 'end_time',
         d.gmode,
         -- DERIVED enforcement status. 'incomplete' is emitted ONLY when the gate is
         -- 'hard' AND feedback is still pending AND the window is open — i.e. the
         -- teeth of the hard gate. Under 'visibility'/'off' the status can never be
         -- 'incomplete', so this branch is INERT until the config flip (dark).
         CASE
           WHEN d.pending_ct <= 0            THEN 'complete'
           WHEN d.gmode = 'hard' AND d.win   THEN 'incomplete'
           WHEN d.win                        THEN 'open'
           ELSE                                   'overdue'
         END
  FROM derived d
  -- Chronological within a day: sort on the PARSED time-of-day, not the raw blob text.
  -- start_time comes in mixed formats (24h "10:00:00" and 12h "3:00 PM"); a raw text
  -- sort orders "9:00 AM" after "10:00:00". fn_scf_to_time_or_null normalizes both AND
  -- returns NULL (never raises) for a non-time slot value ('TBD', 'Period 1', '24:70') —
  -- a bare NULLIF(...)::time would abort the ENTIRE query on such a value (round-3
  -- regression). NULLS LAST sends the unparseable rows to the end.
  ORDER BY d.attendance_date DESC,
           public.fn_scf_to_time_or_null(d.pv ->> 'start_time') ASC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_faculty_completion(date, date) TO authenticated;

COMMENT ON FUNCTION public.fn_scf_faculty_completion(date, date) IS
  'Per-session feedback coverage for the caller faculty. Adds (2026-07-04) '
  'start_time/end_time for the current-period Live Pulse spotlight, and gate_mode '
  '+ derived session_status for the hard-gate enforcement branch. session_status = '
  'incomplete ONLY when gate_mode=hard AND pending>0 AND within window (inert until '
  'the config flip). NON-DESTRUCTIVE: never mutates attendance_data.';

-- ----------------------------------------------------------------------------
-- 2) PR-B — per-session faculty "notify pending" nudge.
--    Reuses the EXACT notification delivery path of fn_scf_nudge_pending_learners
--    (one notifications row + one user_notifications fan-out row per recipient,
--    work_item kind, no blocking ack, idempotency_key). Difference: authenticated
--    faculty-scoped (not service-role, not all-learners) — the caller must be the
--    assigned faculty for the session (or a super/admin). Identity ONLY is used to
--    target; NO feedback content is read or sent. Idempotent per learner per
--    session per day.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_notify_session_pending(
  p_attendance_date date, p_timetable_id uuid, p_period_id text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
SET statement_timeout = '20s'
AS $$
DECLARE
  v_email          text;
  v_pv             jsonb;
  v_institution_id uuid;
  v_course         text;
  v_system_actor   uuid;
  v_nudged         int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: not authenticated'; END IF;
  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  IF v_email IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: no profile'; END IF;

  -- Resolve the session WITH its institution_id so the admin path can be tenant-bounded.
  SELECT sa.attendance_data -> p_period_id, sa.institution_id
    INTO v_pv, v_institution_id
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;
  IF v_pv IS NULL THEN RAISE EXCEPTION 'fn_scf_notify_session_pending: no such session'; END IF;

  -- Authorization. The assigned faculty may always nudge their own session. An admin
  -- may also nudge, but ONLY within their OWN tenant — mirror the scope-honest guard in
  -- fn_scf_effective_attendance (super_admin sees all; every other admin is bounded by
  -- role_has_institution_access). Without the institution bound a tenant-A admin could
  -- nudge tenant-B learners (cross-tenant), since the session is resolved by
  -- timetable_id + date alone.
  IF lower(v_pv -> 'assigned_faculty' ->> 'faculty_email') IS DISTINCT FROM v_email
     AND NOT (
       is_super_admin()
       OR (is_admin() AND role_has_institution_access(v_institution_id))
     ) THEN
    RAISE EXCEPTION 'fn_scf_notify_session_pending: not authorized for this session';
  END IF;

  v_course := COALESCE(NULLIF(v_pv ->> 'course_name', ''),
                       NULLIF(v_pv ->> 'course_code', ''), 'your class');

  SELECT p.id INTO v_system_actor
  FROM public.profiles p WHERE p.is_super_admin = true ORDER BY p.created_at ASC LIMIT 1;

  WITH present_students AS (
    -- Extract + VALIDATE each Present learner's id ONCE. A malformed blob student_id
    -- ('', 'N/A') cast with ::uuid raises 22P02 and aborts the whole nudge. Guard the
    -- cast with the same UUID-shape regex as fn_scf_effective_attendance, applied AS A
    -- CASE so the cast can never run on a non-UUID (guaranteed order). Malformed ids
    -- become NULL and are dropped below — they simply aren't nudged, never crash.
    SELECT CASE
             WHEN (st ->> 'student_id') ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (st ->> 'student_id')::uuid END AS student_uuid
    FROM jsonb_array_elements(v_pv -> 'students') st
    WHERE st ->> 'status' = 'Present'
  ),
  pend AS (
    SELECT DISTINCT lp.profile_id AS recipient_id
    FROM present_students ps
    JOIN public.learners_profiles lp
      ON lp.id = ps.student_uuid
     AND lp.profile_id IS NOT NULL
    WHERE ps.student_uuid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = ps.student_uuid
          AND f.attendance_date = p_attendance_date
          AND f.period_id       = p_period_id
          -- Full session identity: feedback for a different class sharing this period
          -- slot must NOT mark the learner confirmed for THIS session (else we skip a
          -- genuinely-pending learner).
          AND f.timetable_id    = p_timetable_id)
  ),
  ins_notif AS (
    INSERT INTO public.notifications (
      id, title, body, url, icon, created_by, targeting,
      priority, category, kind, requires_acknowledgment, is_layer_0,
      idempotency_key, metadata, created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      'Confirm ' || v_course || ' — 10-second feedback',
      'Your teacher is waiting on your post-class feedback for ' || v_course
        || '. Take 10 seconds to confirm you attended and rate how well you understood it.',
      '/learners/class-feedback',
      'clipboard-check',
      COALESCE(v_system_actor, pend.recipient_id),
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(pend.recipient_id)),
      'normal',
      'dashboard:scf_nudge',
      'work_item',
      FALSE,
      FALSE,
      -- Key includes timetable_id so two sessions that share a period_id on the same
      -- day for the same learner cannot collapse into a single nudge. The day component
      -- is the IST calendar day, NOT the UTC day: CURRENT_DATE rolls at 05:30 IST on a
      -- UTC prod server, which would let the same learner/session be nudged twice across
      -- an IST midnight. (now() AT TIME ZONE 'Asia/Kolkata')::date is IST-anchored,
      -- consistent with the completion-window anchoring above.
      'scf-nudge-session:' || pend.recipient_id::text || ':' || p_attendance_date::text
        || ':' || p_timetable_id::text || ':' || p_period_id || ':'
        || (now() AT TIME ZONE 'Asia/Kolkata')::date::text,
      jsonb_build_object('source', 'scf_faculty_session_nudge',
                         'period_id', p_period_id, 'timetable_id', p_timetable_id),
      NOW(), NOW()
    FROM pend
    -- Atomic idempotency via the partial unique index idx_notifications_idempotency
    -- (ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL). Repeating
    -- that predicate lets ON CONFLICT infer the partial index, so a concurrent
    -- double-click becomes a no-op instead of a unique_violation that aborts the whole
    -- call. Skipped (conflicting) rows are NOT returned, so the user_notifications
    -- fan-out below stays in lock-step (no orphan rows, no duplicates).
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, NOW() FROM ins_notif n
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_nudged FROM ins_user;

  RETURN v_nudged;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_notify_session_pending(date, uuid, text) IS
  'Faculty-triggered per-session nudge: sends ONE in-app bell to each Present-but-'
  'unconfirmed learner of the given session, reusing fn_scf_nudge_pending_learners'' '
  'two-write delivery path. Assigned-faculty (or super/admin) only. Identity-scoped '
  'targeting; never reads/sends feedback content. Idempotent per learner/session/day.';

REVOKE EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date, uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) PR-C — super-admin BREAK-GLASS: set/revert session_feedback.gate_mode via
--    config with NO deploy. This is the incident kill-switch — flip back to
--    'visibility' (or 'off') to instantly halt enforcement campus-wide. Writes the
--    canonical platform_policies row (same row the platform-policy admin UI edits),
--    validated to the enum, stamped with updated_by = the acting super-admin.
--    Super-admin ONLY (tighter than the table's is_super_admin() OR is_admin() RLS).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_set_gate_mode(
  p_mode text, p_institution_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_scope_type text; v_scope_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_set_gate_mode: not authenticated'; END IF;
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'fn_scf_set_gate_mode: super-admin only (break-glass control)';
  END IF;
  IF p_mode NOT IN ('off', 'visibility', 'hard') THEN
    RAISE EXCEPTION 'fn_scf_set_gate_mode: mode must be off | visibility | hard';
  END IF;

  IF p_institution_id IS NULL THEN
    v_scope_type := 'global'; v_scope_id := NULL;
  ELSE
    v_scope_type := 'institution'; v_scope_id := p_institution_id;
  END IF;

  -- Break-glass upsert. Deliberately AVOIDS ON CONFLICT so the kill-switch can never
  -- throw on an index-inference mismatch. platform_policies' uniqueness is the
  -- EXPRESSION index uq_platform_policies_key_scope
  -- (policy_key, scope_type, COALESCE(scope_id, '000..')) from
  -- 20260429000002_platform_policies_substrate.sql. UPDATE-then-INSERT-if-absent is the
  -- same pattern the coupling-flag seed below uses; it works even if that index is ever
  -- renamed or rebuilt. The break-glass MUST reliably revert gate_mode with no deploy.
  UPDATE public.platform_policies
     SET value = to_jsonb(p_mode), is_active = true,
         updated_by = auth.uid(), updated_at = now()
   WHERE policy_key = 'session_feedback.gate_mode'
     AND scope_type = v_scope_type
     AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(v_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT FOUND THEN
    -- Race guard: two concurrent callers can both see NOT FOUND and both INSERT, so the
    -- second hits uq_platform_policies_key_scope -> unique_violation, which (without this
    -- handler) would abort the whole break-glass call. Catch it and re-run the UPDATE so
    -- the last writer still wins. The kill-switch can never throw a unique_violation.
    BEGIN
      INSERT INTO public.platform_policies
        (policy_key, scope_type, scope_id, value, data_type, enum_options,
         description, classification, publication_state, is_system, is_active, ui_category,
         updated_by, updated_at)
      SELECT
        'session_feedback.gate_mode', v_scope_type, v_scope_id, to_jsonb(p_mode), 'string',
        to_jsonb(ARRAY['off', 'visibility', 'hard']),
        'Post-class feedback gate: off | visibility | hard. Set via SCF break-glass RPC.',
        'major', 'published', true, true, 'Session Feedback',
        auth.uid(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.platform_policies
         WHERE policy_key = 'session_feedback.gate_mode'
           AND scope_type = v_scope_type
           AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE(v_scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.platform_policies
         SET value = to_jsonb(p_mode), is_active = true,
             updated_by = auth.uid(), updated_at = now()
       WHERE policy_key = 'session_feedback.gate_mode'
         AND scope_type = v_scope_type
         AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(v_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);
    END;
  END IF;

  RETURN p_mode;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_set_gate_mode(text, uuid) IS
  'Super-admin break-glass kill-switch for the post-class-feedback hard gate. '
  'Upserts session_feedback.gate_mode (global when p_institution_id NULL, else the '
  'institution override). Revert to visibility|off halts enforcement with no deploy.';

REVOKE EXECUTE ON FUNCTION public.fn_scf_set_gate_mode(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_set_gate_mode(text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) PR-D — DERIVED "effective attendance %" coupling (NON-DESTRUCTIVE).
--    Per learner, over a date/scope: official attendance % (present/(present+absent))
--    vs an EFFECTIVE % that only counts present marks the learner CONFIRMED with
--    feedback (present-but-no-feedback lowers the effective %). Pure read over
--    student_attendance + session_feedback — attendance_data is NEVER written. This
--    is the exam-eligibility coupling the Director approved; it is GATED behind
--    session_feedback.attendance_coupling_enabled (seeded FALSE below) in the SERVICE
--    layer and consumes NOTHING in the live official-% path until legal/compliance
--    review (spec R2) + the flag flip. Returns attendance COUNTS only (never feedback
--    content); authorization mirrors fn_scf_confirmation_rollup exactly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_scf_effective_attendance(
  p_from           date,
  p_to             date,
  p_institution_id uuid DEFAULT NULL,
  p_program_id     uuid DEFAULT NULL,
  p_department_id  uuid DEFAULT NULL,
  p_section_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id        uuid,
  present_marks     bigint,
  absent_marks      bigint,
  confirmed_present bigint,
  official_pct      numeric,
  effective_pct     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
SET statement_timeout = '20s'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_effective_attendance: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_effective_attendance: not authorized';
  END IF;

  -- Server-side compliance gate (defense in depth). The coupling is DARK by default and
  -- must stay inert until a super-admin flips session_feedback.attendance_coupling_enabled
  -- AND legal/compliance sign-off (spec R2). The service layer already checks this flag,
  -- but re-check it HERE so the derived effective-% can NEVER be computed by a direct RPC
  -- call that bypasses the service. When OFF: return zero rows, compute/touch nothing.
  -- Resolves the institution override (p_institution_id) -> global -> default FALSE.
  IF NOT public.fn_get_policy_bool(
       'session_feedback.attendance_coupling_enabled', false, p_institution_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH marks AS (
    SELECT
      (st ->> 'student_id')::uuid AS sid,
      sa.attendance_date,
      sa.timetable_id             AS timetable_id,
      period.key                  AS period_id,
      (st ->> 'status')           AS status
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
           THEN sa.attendance_data ELSE '{}'::jsonb END) AS period
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
           THEN period.value -> 'students' ELSE '[]'::jsonb END) AS st
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (st ->> 'status') IN ('Present', 'Absent')
      AND (st ->> 'student_id') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      -- Same scope-honest guard as fn_scf_confirmation_rollup (no is_admin() bypass
      -- of institution_scope): super_admin sees all, everyone else is bounded by
      -- role_has_institution_access.
      AND (is_super_admin() OR role_has_institution_access(sa.institution_id))
  ),
  -- One mark per (learner, date, timetable, period); prefer Present on the rare
  -- dual-row tuple. timetable_id is IN the key so two distinct classes that share a
  -- period key on the same date do NOT collapse into one mark (which would skew both
  -- official_pct and effective_pct).
  dedup AS (
    SELECT DISTINCT ON (sid, attendance_date, timetable_id, period_id)
      sid, attendance_date, timetable_id, period_id, status
    FROM marks
    ORDER BY sid, attendance_date, timetable_id, period_id, (status = 'Present') DESC
  ),
  agg AS (
    SELECT
      d.sid,
      count(*) FILTER (WHERE d.status = 'Present') AS present_marks,
      count(*) FILTER (WHERE d.status = 'Absent')  AS absent_marks,
      count(*) FILTER (WHERE d.status = 'Present' AND EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = d.sid
          AND f.attendance_date = d.attendance_date
          AND f.period_id       = d.period_id
          -- Match the confirmation on the full session identity (session_feedback.
          -- timetable_id is NOT NULL) so feedback for a different class sharing the
          -- same period slot cannot inflate confirmed_present.
          AND f.timetable_id    = d.timetable_id
      )) AS confirmed_present
    FROM dedup d
    GROUP BY d.sid
  )
  SELECT
    a.sid,
    a.present_marks::bigint,
    a.absent_marks::bigint,
    a.confirmed_present::bigint,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.present_marks::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END,
    CASE WHEN (a.present_marks + a.absent_marks) = 0 THEN 0
         ELSE round(a.confirmed_present::numeric
                    / (a.present_marks + a.absent_marks) * 100, 2) END
  FROM agg a;
END;
$$;

COMMENT ON FUNCTION public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) IS
  'DERIVED, non-destructive "effective attendance %": per learner, present/(present+'
  'absent) official % vs a confirmed-only effective % (present-but-no-feedback lowers '
  'it). Read-only over student_attendance + session_feedback; NEVER writes '
  'attendance_data. Compliance-gated behind session_feedback.attendance_coupling_enabled '
  '(default FALSE) in the service layer. Returns counts only — no feedback content.';

REVOKE EXECUTE ON FUNCTION
  public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION
  public.fn_scf_effective_attendance(date, date, uuid, uuid, uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) PR-D — seed the coupling kill-flag. DEFAULT FALSE (dark). Editable via the
--    platform-policy admin UI (ui_category='Session Feedback'). Idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, enum_options, description,
   classification, publication_state, is_system, is_active, ui_category)
SELECT 'session_feedback.attendance_coupling_enabled', 'global', NULL,
       to_jsonb(false), 'boolean', NULL,
       'When TRUE, the DERIVED "effective attendance %" (present-but-no-feedback '
       || 'lowers a learner''s attendance %) is computed for eligibility surfaces. '
       || 'Non-destructive (never writes attendance_data). Requires legal/compliance '
       || 'sign-off before enabling (exam-eligibility regulatory surface). Default FALSE.',
       'major', 'published', true, true, 'Session Feedback'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'session_feedback.attendance_coupling_enabled'
    AND scope_type = 'global' AND scope_id IS NULL);

-- ----------------------------------------------------------------------------
-- 6) SECURITY — arm-side authz guard for BOTH compliance controls (arming symmetry).
--    platform_policies RLS is (is_super_admin() OR is_admin()), so WITHOUT this guard any
--    TENANT ADMIN could write either compliance flag for their institution and ARM the
--    regulated behaviour — while the break-glass revert (fn_scf_set_gate_mode) and the
--    coupling policy are meant to be super-admin ONLY. The compliance assurance "only a
--    super-admin can arm the hard gate / the exam-eligibility coupling" must hold in BOTH
--    directions, for BOTH rows:
--      * session_feedback.gate_mode                   (hard-gate arming)
--      * session_feedback.attendance_coupling_enabled (exam-eligibility coupling arming)
--    This BEFORE INSERT/UPDATE trigger rejects any authenticated non-super-admin write to
--    EITHER control row (SQLSTATE 42501), scoped STRICTLY to those two policy_keys so no
--    other platform policy is affected. Service-role / migrations (auth.uid() IS NULL) are
--    unaffected; the super-admin break-glass and super-admin admin-UI edits pass
--    (is_super_admin() = true). The coupling row is seeded FALSE below by this same
--    migration (auth.uid() NULL), so the seed is not blocked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_gate_mode_super_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_guarded boolean := false;
BEGIN
  -- Guard BOTH compliance-sensitive control rows against INSERT, UPDATE, AND DELETE.
  -- On INSERT/UPDATE check NEW; on UPDATE/DELETE also check OLD — so neither row can be
  -- created, re-valued, renamed into/out of a guarded key, OR DELETED. (Deleting a
  -- protective per-institution override silently falls the tenant back to the global
  -- armed value, so DELETE must be guarded too.) Reject only an AUTHENTICATED
  -- non-super-admin; allow service-role/migration writes (auth.uid() IS NULL) and super-admins.
  IF TG_OP <> 'DELETE'
     AND NEW.policy_key IN ('session_feedback.gate_mode',
                            'session_feedback.attendance_coupling_enabled') THEN
    v_guarded := true;
  END IF;
  IF TG_OP <> 'INSERT'
     AND OLD.policy_key IN ('session_feedback.gate_mode',
                            'session_feedback.attendance_coupling_enabled') THEN
    v_guarded := true;
  END IF;
  IF v_guarded AND auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'session_feedback compliance controls (gate_mode, attendance_coupling_enabled) are super-admin-only'
      USING ERRCODE = '42501',
            HINT = 'Use the super-admin break-glass RPC or contact a super-admin.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_gate_mode_super_admin_only() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_gate_mode_super_admin_only() IS
  'BEFORE INSERT/UPDATE/DELETE guard on platform_policies: only a super-admin (or service-role/'
  'migration, auth.uid() NULL) may write the session_feedback.gate_mode OR '
  'session_feedback.attendance_coupling_enabled control rows. Makes BOTH the hard-gate '
  'and exam-eligibility-coupling ARMING super-admin-only, symmetric with the super-admin-'
  'only break-glass revert (fn_scf_set_gate_mode). Scoped strictly to those two keys.';

DROP TRIGGER IF EXISTS trg_guard_gate_mode_super_admin_only ON public.platform_policies;
CREATE TRIGGER trg_guard_gate_mode_super_admin_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_gate_mode_super_admin_only();

NOTIFY pgrst, 'reload schema';
