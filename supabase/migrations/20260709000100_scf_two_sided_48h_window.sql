-- =============================================================================
-- SCF TWO-SIDED 48h FEEDBACK WINDOW
-- Director decision 2026-07-08 23:34–23:43: "also learners within 48 hours,
-- then the window should close."
--
-- Side A — SUBMISSION CLOSE (learner end):
--   • fn_scf_submit_feedback        — rejects feedback past the window with an
--                                     EXPLICIT message (never a silent drop).
--   • fn_scf_pending_for_learner    — stops listing sessions whose window closed
--                                     (they are no longer actionable).
--   • fn_scf_nudge_pending_learners — adoption nudge only targets sessions whose
--                                     window is still OPEN (fires ~12–36h after
--                                     class on the daily 12:45 IST dispatcher
--                                     slot; expired sessions drop out).
--   • fn_scf_notify_session_pending — faculty "remind pending learners" poke is
--                                     refused once the window closed (a reminder
--                                     to a closed window is a dead end).
--
-- Side B — GENERATOR MATURITY (AI note end):
--   • fn_scf_candidate_windows     — a course qualifies for AI coaching only on
--                                    responses from sessions whose window CLOSED
--                                    (the sample can no longer change).
--   • fn_scf_ai_signal             — same maturity filter + NEW session_dates
--                                    return column so the generated note can cite
--                                    the exact contributing session dates.
--                                    (Changed RETURNS ⇒ DROP + CREATE.)
--
-- BOTH sides read the ONE existing config lever:
--     platform_policies.policy_key = 'session_feedback.window_hours'  (48, global)
-- via fn_get_policy_int('session_feedback.window_hours', 48, institution_id) —
-- the same lever fn_scf_faculty_completion / fn_scf_my_confirmed_attendance /
-- fn_scf_effective_attendance (D2 gate) already consume. NO new config key.
--
-- D2 hard-gate coupling: UNCHANGED by construction. fn_scf_effective_attendance
-- has only ever counted confirmations submitted within the window (decision #11),
-- so hard-closing submission does not move anyone's effective attendance — it
-- makes stored reality match what the gate already counted.
--
-- Window anchor (canonical, matches fn_scf_faculty_completion): the class day at
-- IST midnight + window_hours:
--   (attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
--     + make_interval(hours => fn_get_policy_int('session_feedback.window_hours', 48, institution_id))
-- =============================================================================


-- =============================================================================
-- A1. fn_scf_submit_feedback — hard-close submission past the window
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_submit_feedback(p_attendance_date date, p_timetable_id uuid, p_period_id text, p_understood smallint, p_checklist jsonb DEFAULT '{}'::jsonb, p_free_text text DEFAULT NULL::text, p_source text DEFAULT 'async'::text)
 RETURNS session_feedback
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lp       uuid;
  v_period   jsonb;
  v_present  boolean;
  v_inst     uuid;
  v_src      text;
  v_row      public.session_feedback;
  v_window_hours integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: not authenticated';
  END IF;
  IF p_understood IS NULL OR p_understood < 1 OR p_understood > 5 THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: understood must be 1..5';
  END IF;
  v_src := COALESCE(p_source, 'async');
  IF v_src NOT IN ('async','live_poll') THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: source must be async|live_poll';
  END IF;

  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller is not a learner';
  END IF;

  -- Locate the session's period entry in the attendance blob.
  SELECT sa.institution_id, sa.attendance_data -> p_period_id
    INTO v_inst, v_period
  FROM public.student_attendance sa
  WHERE sa.timetable_id = p_timetable_id
    AND sa.attendance_date = p_attendance_date
    AND sa.attendance_data ? p_period_id
  LIMIT 1;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: no such session (timetable/date/period)';
  END IF;

  -- Two-sided 48h window (Director, 2026-07-08): submission CLOSES window_hours
  -- after the class day (IST midnight anchor, matching fn_scf_faculty_completion).
  -- The rejection is EXPLICIT — the client toast shows this exact message — never
  -- a silent drop. Applies to edits of an in-window submission too: past the
  -- close, the sample is frozen (the AI generator coaches on it as final).
  v_window_hours := public.fn_get_policy_int('session_feedback.window_hours', 48, v_inst);
  IF now() > (p_attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => v_window_hours) THEN
    RAISE EXCEPTION 'The feedback window for this class has closed — feedback can be given up to % hours after the class day.', v_window_hours;
  END IF;

  -- The caller must appear as Present in that period (the present-gate, inherited
  -- by the live path — there is no way to write feedback for a session you weren't
  -- marked Present in).
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_period -> 'students') st
    WHERE (st ->> 'student_id')::uuid = v_lp
      AND st ->> 'status' = 'Present'
  ) INTO v_present;

  IF NOT v_present THEN
    RAISE EXCEPTION 'fn_scf_submit_feedback: caller was not marked Present in this session';
  END IF;

  -- Honest source label (#6): a 'live_poll' tag is only kept if a pulse is
  -- actually open for this class right now; otherwise downgrade to 'async'.
  IF v_src = 'live_poll' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.scf_live_pulse lp
      WHERE lp.timetable_id = p_timetable_id
        AND lp.attendance_date = p_attendance_date
        AND lp.period_id = p_period_id
        AND lp.is_open = true
        AND lp.auto_close_at > now()
    ) THEN
      v_src := 'async';
    END IF;
  END IF;

  INSERT INTO public.session_feedback (
    institution_id, student_id, attendance_date, timetable_id, period_id,
    section_id, course_id, course_code, course_name, faculty_id, faculty_email,
    understood, checklist, free_text, source
  )
  VALUES (
    v_inst, v_lp, p_attendance_date, p_timetable_id, p_period_id,
    NULLIF(v_period ->> 'section_id','')::uuid,
    NULLIF(v_period ->> 'course_id','')::uuid,
    v_period ->> 'course_code',
    v_period ->> 'course_name',
    NULLIF(v_period -> 'assigned_faculty' ->> 'faculty_id','')::uuid,
    v_period -> 'assigned_faculty' ->> 'faculty_email',
    p_understood, COALESCE(p_checklist,'{}'::jsonb), p_free_text, v_src
  )
  ON CONFLICT (student_id, attendance_date, period_id) DO UPDATE SET
    understood = EXCLUDED.understood,
    checklist  = EXCLUDED.checklist,
    free_text  = EXCLUDED.free_text,
    source     = EXCLUDED.source,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date, uuid, text, smallint, jsonb, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_submit_feedback(date, uuid, text, smallint, jsonb, text, text) TO authenticated;


-- =============================================================================
-- A2. fn_scf_pending_for_learner — expired-window sessions are no longer listed
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_pending_for_learner(p_lookback_days integer DEFAULT 30)
 RETURNS TABLE(attendance_date date, timetable_id uuid, period_id text, section_id uuid, course_id uuid, course_code text, course_name text, faculty_name text, period_name text, start_time text, end_time text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_scf_pending_for_learner: not authenticated'; END IF;
  SELECT lp.id INTO v_lp FROM public.learners_profiles lp WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT sa.attendance_date, sa.timetable_id, period.key AS period_id,
         NULLIF(period.value ->> 'section_id','')::uuid AS section_id,
         NULLIF(period.value ->> 'course_id','')::uuid AS course_id,
         period.value ->> 'course_code'  AS course_code,
         period.value ->> 'course_name'  AS course_name,
         period.value -> 'assigned_faculty' ->> 'faculty_name' AS faculty_name,
         period.value ->> 'period_name'  AS period_name,
         period.value ->> 'start_time'   AS start_time,
         period.value ->> 'end_time'     AS end_time
  FROM public.student_attendance sa,
       jsonb_each(sa.attendance_data) AS period
  WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
    -- Two-sided 48h window (Director, 2026-07-08): a session whose feedback
    -- window has CLOSED is no longer actionable — submission would be rejected
    -- by fn_scf_submit_feedback — so it must not appear as "pending". Same IST
    -- anchor + lever as fn_scf_faculty_completion.
    AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => public.fn_get_policy_int(
              'session_feedback.window_hours', 48, sa.institution_id))
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(period.value -> 'students') st
      WHERE (st ->> 'student_id')::uuid = v_lp AND st ->> 'status' = 'Present'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.session_feedback f
      WHERE f.student_id = v_lp AND f.attendance_date = sa.attendance_date AND f.period_id = period.key
    )
  ORDER BY sa.attendance_date DESC, period.value ->> 'start_time';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_pending_for_learner(integer) TO authenticated;


-- =============================================================================
-- A3. fn_scf_nudge_pending_learners — nudge only inside the open window
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_nudge_pending_learners(p_lookback_days integer DEFAULT 14)
 RETURNS TABLE(learners_nudged integer, sessions_pending_total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_system_actor uuid;
  v_nudged       int := 0;
  v_pending_sum  bigint := 0;
BEGIN
  -- Stable system identity for notifications.created_by (NOT NULL). Earliest
  -- super_admin; per-row COALESCE to the recipient guarantees non-null even if
  -- this is somehow NULL.
  SELECT p.id INTO v_system_actor
  FROM public.profiles p
  WHERE p.is_super_admin = true
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- 1) Aggregate Present-but-unconfirmed sessions per DELIVERABLE learner.
  --    A learner is deliverable when their learners_profiles row maps to a
  --    profile_id (the bell recipient / user_notifications.user_id).
  WITH pending AS (
    SELECT
      (st.value ->> 'student_id')::uuid AS lp_id,
      sa.attendance_date,
      period.key                        AS period_id
    FROM public.student_attendance sa,
         jsonb_each(sa.attendance_data)                   AS period,
         jsonb_array_elements(period.value -> 'students') AS st
    WHERE sa.attendance_date >= (CURRENT_DATE - p_lookback_days)
      -- Two-sided 48h window (Director, 2026-07-08): only nudge for sessions whose
      -- window is still OPEN — a nudge toward a closed window is a dead end (the
      -- submit RPC now rejects it). On the daily 12:45 IST dispatcher slot this
      -- lands the nudge ~12–36h after class, inside the window by construction.
      AND now() <= (sa.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
            + make_interval(hours => public.fn_get_policy_int(
                'session_feedback.window_hours', 48, sa.institution_id))
      AND jsonb_typeof(sa.attendance_data) = 'object'
      AND st.value ->> 'status' = 'Present'
      AND (st.value ->> 'student_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = (st.value ->> 'student_id')::uuid
          AND f.attendance_date = sa.attendance_date
          AND f.period_id       = period.key
      )
  ),
  per_learner AS (
    SELECT
      lp.profile_id              AS recipient_id,
      COUNT(*)::int              AS pending_count
    FROM pending p
    JOIN public.learners_profiles lp
      ON lp.id = p.lp_id
     AND lp.profile_id IS NOT NULL
    GROUP BY lp.profile_id
  ),
  -- 2) Create ONE notifications row per learner (idempotent per learner per day).
  --    The WHERE NOT EXISTS guard below skips learners already nudged today, so
  --    only freshly-inserted rows are RETURNINGed — the user_notifications
  --    fan-out stays in lock-step (no orphan user_notifications, no dup).
  ins_notif AS (
    INSERT INTO public.notifications (
      id, title, body, url, icon,
      created_by, targeting,
      priority, category, kind,
      requires_acknowledgment, is_layer_0,
      idempotency_key, metadata,
      created_at, updated_at
    )
    SELECT
      gen_random_uuid(),
      'You have ' || pl.pending_count || ' class' ||
        CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END || ' to confirm',
      'Take 10 seconds to confirm you attended and rate how well you understood '
        || 'your recent class' || CASE WHEN pl.pending_count = 1 THEN '' ELSE 'es' END
        || '. Each class accepts feedback only for a short window after it ends — '
        || 'once the window closes, it can no longer be confirmed.',
      '/learners/class-feedback',
      'clipboard-check',
      COALESCE(v_system_actor, pl.recipient_id),
      jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(pl.recipient_id)),
      'normal',
      'dashboard:scf_nudge',
      'work_item',
      FALSE,                                   -- no blocking acknowledgment modal
      FALSE,
      'scf-nudge:' || pl.recipient_id::text || ':' || CURRENT_DATE::text,
      jsonb_build_object('pending_count', pl.pending_count, 'source', 'scf_adoption_nudge'),
      NOW(), NOW()
    FROM per_learner pl
    -- Idempotent per learner per day: skip learners already nudged today. (The
    -- partial unique index still backstops against races — a concurrent run that
    -- slips past this guard would raise a unique violation rather than dup.)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n2
      WHERE n2.idempotency_key =
        'scf-nudge:' || pl.recipient_id::text || ':' || CURRENT_DATE::text
    )
    RETURNING id, (targeting -> 'user_ids' ->> 0)::uuid AS recipient_id
  ),
  -- 3) Manual fan-out: one user_notifications row per freshly-created notification.
  ins_user AS (
    INSERT INTO public.user_notifications (id, notification_id, user_id, created_at)
    SELECT gen_random_uuid(), n.id, n.recipient_id, NOW()
    FROM ins_notif n
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::int FROM ins_user),
    (SELECT COALESCE(SUM(pl.pending_count), 0)::bigint FROM per_learner pl)
  INTO v_nudged, v_pending_sum;

  RETURN QUERY SELECT v_nudged, v_pending_sum;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_nudge_pending_learners(integer) TO service_role;


-- =============================================================================
-- A4. fn_scf_notify_session_pending — refuse the faculty poke once closed
--     (window guard added after the authorization block, so window state is
--     never revealed to an unauthorized caller; everything else unchanged)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_notify_session_pending(p_attendance_date date, p_timetable_id uuid, p_period_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
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

  -- Two-sided 48h window (Director, 2026-07-08): once the window closed, the
  -- submit RPC rejects learner feedback — a reminder would be a dead end.
  IF now() > (p_attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
             + make_interval(hours => public.fn_get_policy_int(
                 'session_feedback.window_hours', 48, v_institution_id)) THEN
    RAISE EXCEPTION 'The feedback window for this class has closed — learners can no longer submit, so a reminder cannot be sent.';
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
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_notify_session_pending(date, uuid, text) TO authenticated;


-- =============================================================================
-- B1. fn_scf_candidate_windows — only coach on CLOSED-window sessions
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_scf_candidate_windows(p_from date, p_to date)
 RETURNS TABLE(institution_id uuid, course_code text, faculty_email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.institution_id, c.course_code, c.faculty_email
  FROM (
    SELECT
      f.institution_id,
      f.course_code,
      lower(NULLIF(btrim(f.faculty_email), '')) AS faculty_email
    FROM public.session_feedback f
    WHERE f.attendance_date BETWEEN p_from AND p_to
      AND f.course_code IS NOT NULL
      AND f.understood IS NOT NULL          -- mirror fn_scf_ai_signal's scoreable-row basis
      -- Generator maturity (Director, 2026-07-08): coach ONLY on sessions whose
      -- feedback window has CLOSED — the sample can no longer change (submission
      -- is rejected past the window), so the note reads a final sample instead of
      -- a still-open one. Same IST anchor + lever as fn_scf_faculty_completion.
      AND now() > (f.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
            + make_interval(hours => public.fn_get_policy_int(
                'session_feedback.window_hours', 48, f.institution_id))
    GROUP BY f.institution_id, f.course_code, lower(NULLIF(btrim(f.faculty_email), ''))
    HAVING count(*) >= 3                    -- mirrors MIN_RESPONSES in the cron + fn_scf_ai_signal
  ) c
  LEFT JOIN LATERAL (
    SELECT max(s.generated_at) AS last_at
    FROM public.scf_ai_suggestions s
    WHERE s.domain = 'session_feedback'
      AND s.course_code     = c.course_code
      AND s.institution_id IS NOT DISTINCT FROM c.institution_id
      AND s.faculty_email  IS NOT DISTINCT FROM c.faculty_email
  ) la ON true
  -- FAIR ROTATION: order by least-recently-suggested (never-suggested NULLS FIRST,
  -- then longest-ago) so the BATCH_CAP slice always favours the neediest courses.
  -- A fixed alphabetical sort would let early-sorting tenants permanently starve
  -- later ones once daily candidates exceed BATCH_CAP=25; this self-rotates —
  -- once a course is suggested it sorts last until the others catch up.
  ORDER BY la.last_at ASC NULLS FIRST, c.institution_id, c.course_code;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_candidate_windows(date, date) TO service_role;


-- =============================================================================
-- B2. fn_scf_ai_signal — maturity filter + session_dates (changed RETURNS ⇒
--     DROP then CREATE, grants re-asserted below)
-- =============================================================================
DROP FUNCTION IF EXISTS public.fn_scf_ai_signal(text, date, date, uuid, text);

CREATE FUNCTION public.fn_scf_ai_signal(p_course_code text, p_from date, p_to date, p_institution_id uuid DEFAULT NULL::uuid, p_faculty_email text DEFAULT NULL::text)
 RETURNS TABLE(course_code text, responses bigint, low_responses bigint, avg_understood numeric, free_texts text[], session_dates date[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p_course_code                                                          AS course_code,
    count(*)                                                               AS responses,
    count(*) FILTER (WHERE f.understood <= 2)                              AS low_responses,
    round(avg(f.understood)::numeric, 2)                                   AS avg_understood,
    array_agg(f.free_text) FILTER (
      WHERE f.free_text IS NOT NULL AND btrim(f.free_text) <> ''
    )                                                                      AS free_texts,
    -- The exact contributing session dates, so the generated note can cite them
    -- ("based on your classes on 5 Jul, 6 Jul") instead of a vague date range.
    array_agg(DISTINCT f.attendance_date ORDER BY f.attendance_date)       AS session_dates
  FROM public.session_feedback f
  WHERE f.course_code = p_course_code
    AND f.attendance_date BETWEEN p_from AND p_to
    AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
    AND (p_faculty_email  IS NULL OR lower(f.faculty_email) = lower(p_faculty_email))
    -- Generator maturity (Director, 2026-07-08): aggregate ONLY closed-window
    -- sessions — mirrors fn_scf_candidate_windows so signal and candidacy agree.
    AND now() > (f.attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata')
          + make_interval(hours => public.fn_get_policy_int(
              'session_feedback.window_hours', 48, f.institution_id))
  HAVING count(*) >= 3;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text) TO service_role;
