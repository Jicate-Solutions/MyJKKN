-- =====================================================================
-- Blocking feedback gate — Migration B: "must answer" announcements
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-blocking-feedback-gate.md (ruling 1, build step 2 + 6)
--
-- An admin may tick "Must answer" on an announcement and give it 2-6 short
-- options. Recipients meet it on the blocking screen (Migration C) and cannot
-- use the app until they pick one. Their pick is one row per person in
-- notification_answers; picking also counts as the acknowledgment so every
-- existing compliance number keeps working.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) notifications — the two new fields
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS requires_answer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS answer_options  jsonb;

COMMENT ON COLUMN public.notifications.requires_answer IS
  'Ruling 1 (2026-09-16): recipients must pick one of answer_options on the blocking screen before using the app.';
COMMENT ON COLUMN public.notifications.answer_options IS
  'JSON array of 2-6 short strings, e.g. ["Yes","No","Can''t tell"]. Only read when requires_answer is true.';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_answer_options_shape_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_answer_options_shape_check
  CHECK (
    requires_answer = false
    OR (answer_options IS NOT NULL
        AND jsonb_typeof(answer_options) = 'array'
        AND jsonb_array_length(answer_options) BETWEEN 2 AND 6)
  );

-- ---------------------------------------------------------------------
-- 2) notification_answers — one row per person per announcement
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answer          text NOT NULL,
  answered_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_answers_one_per_user UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_answers_notification
  ON public.notification_answers (notification_id);

ALTER TABLE public.notification_answers ENABLE ROW LEVEL SECURITY;

-- Lock the public anon key out entirely; authenticated reads go through RLS.
REVOKE ALL ON TABLE public.notification_answers FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.notification_answers TO authenticated;
GRANT ALL    ON TABLE public.notification_answers TO service_role;

DROP POLICY IF EXISTS "notification_answers_select_own" ON public.notification_answers;
CREATE POLICY "notification_answers_select_own" ON public.notification_answers
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_answers_select_admin" ON public.notification_answers;
CREATE POLICY "notification_answers_select_admin" ON public.notification_answers
  FOR SELECT USING (is_super_admin() OR is_admin());

-- Writes only through the SECURITY DEFINER RPC below (no INSERT/UPDATE policy).

-- ---------------------------------------------------------------------
-- 3) fn_notification_answer(notification, answer) — the recipient's pick.
--    Checks: the caller received this notification, it requires an answer,
--    the pick is one of its options. Upserts (a person may change their
--    mind while the announcement is live) and stamps the acknowledgment so
--    the existing compliance rollups count it.
-- ---------------------------------------------------------------------
-- ci:allow-secdef-authenticated every signed-in recipient may answer a must-answer notice SENT TO THEM: the body refuses unless a user_notifications row exists for (notification, auth.uid()) and the pick is one of the notice's own options; it writes only the caller's row.
CREATE OR REPLACE FUNCTION public.fn_notification_answer(p_notification_id uuid, p_answer text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_options jsonb;
  v_req     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'sign in required');
  END IF;

  SELECT requires_answer, answer_options INTO v_req, v_options
  FROM public.notifications WHERE id = p_notification_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF NOT COALESCE(v_req, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'this announcement does not take an answer');
  END IF;
  IF p_answer IS NULL OR NOT (v_options ? p_answer) THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be one of the offered options');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_notifications
                 WHERE notification_id = p_notification_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'this announcement was not sent to you');
  END IF;

  INSERT INTO public.notification_answers (notification_id, user_id, answer, answered_at)
  VALUES (p_notification_id, v_uid, p_answer, now())
  ON CONFLICT (notification_id, user_id) DO UPDATE
    SET answer = EXCLUDED.answer, answered_at = now(), updated_at = now();

  -- Answering is the acknowledgment for a must-answer notice.
  UPDATE public.user_notifications
  SET acknowledged_at = COALESCE(acknowledged_at, now()),
      read_at         = COALESCE(read_at, now())
  WHERE notification_id = p_notification_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_notification_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_notification_answer(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) fn_notification_compliance_rollup — LIVE body (pg_get_functiondef,
--    2026-09-16) + CHANGED lines: by_notification rows carry
--    requires_answer, answered (count) and answers (option → count) so the
--    compliance dashboard can show an "answers" column.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notification_compliance_rollup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Defense-in-depth: the route already gates on super_admin; re-check here so the
  -- SECURITY DEFINER RPC (which bypasses RLS to read all users' data) cannot be
  -- called by any lesser-privileged authenticated user.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges: super admin required'
      USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT
      un.user_id,
      un.notification_id,
      un.acknowledged_at,
      un.created_at AS un_created_at,
      (COALESCE(n.sent_at, n.created_at)
        + make_interval(hours => COALESCE(n.acknowledgment_deadline_hours, 4))) AS deadline_at,
      p.full_name,
      p.email,
      p.role,
      p.institution_id,
      i.name AS inst_name_raw
    FROM public.user_notifications un
    JOIN public.notifications n
      ON n.id = un.notification_id
     AND (n.requires_acknowledgment = true OR n.requires_answer = true)  -- CHANGED 2026-09-16
    LEFT JOIN public.profiles p ON p.id = un.user_id
    LEFT JOIN public.institutions i ON i.id = p.institution_id
  ),
  overall AS (
    SELECT
      (SELECT count(*) FROM public.notifications
        WHERE requires_acknowledgment = true OR requires_answer = true) AS total_mandatory,  -- CHANGED 2026-09-16
      count(*) AS total_required,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS total_ack,
      count(*) FILTER (WHERE acknowledged_at IS NULL AND now() > deadline_at) AS total_overdue
    FROM base
  ),
  inst AS (
    SELECT
      COALESCE(inst_name_raw,
        CASE WHEN institution_id IS NULL THEN 'No Institution' ELSE 'Unknown Institution' END
      ) AS institution_name,
      count(*) AS total,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged,
      count(*) FILTER (WHERE acknowledged_at IS NULL AND now() > deadline_at) AS overdue_cnt
    FROM base
    GROUP BY 1
  ),
  by_institution AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', institution_name,
        'total_required', total,
        'acknowledged', acknowledged,
        'compliance_rate', CASE WHEN total > 0 THEN round((acknowledged::numeric / total * 100), 1) ELSE 0 END,
        'overdue', overdue_cnt
      )
      ORDER BY (CASE WHEN total > 0 THEN round((acknowledged::numeric / total * 100), 1) ELSE 0 END) ASC, institution_name
    ), '[]'::jsonb) AS data
    FROM inst
  ),
  notif_rollup AS (
    SELECT notification_id,
      count(*) AS total,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged
    FROM base
    GROUP BY notification_id
  ),
  -- CHANGED 2026-09-16: answers per notification (option → count)
  answer_rollup AS (
    SELECT notification_id,
           count(*) AS answered,
           jsonb_object_agg(answer, cnt) AS answers
    FROM (
      SELECT notification_id, answer, count(*) AS cnt
      FROM public.notification_answers
      GROUP BY notification_id, answer
    ) a
    GROUP BY notification_id
  ),
  by_notification AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'priority', n.priority,
        'category', n.category,
        'sent_at', COALESCE(n.sent_at, n.created_at),
        'deadline_passed', (n.expires_at IS NOT NULL AND n.expires_at < now()),
        'expires_at', n.expires_at,
        'total', COALESCE(r.total, 0),
        'acknowledged', COALESCE(r.acknowledged, 0),
        'rate', CASE WHEN COALESCE(r.total, 0) > 0
                     THEN round((r.acknowledged::numeric / r.total * 100), 1) ELSE 0 END,
        'requires_answer', n.requires_answer,                 -- CHANGED 2026-09-16
        'answered', COALESCE(ar.answered, 0),                  -- CHANGED 2026-09-16
        'answers', COALESCE(ar.answers, '{}'::jsonb)           -- CHANGED 2026-09-16
      )
      ORDER BY n.created_at DESC, n.id
    ), '[]'::jsonb) AS data
    FROM public.notifications n
    LEFT JOIN notif_rollup r ON r.notification_id = n.id
    LEFT JOIN answer_rollup ar ON ar.notification_id = n.id
    WHERE n.requires_acknowledgment = true OR n.requires_answer = true  -- CHANGED 2026-09-16
  ),
  hod_agg AS (
    SELECT
      user_id, full_name, email, role, institution_id, inst_name_raw,
      count(*) AS received,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged,
      avg(EXTRACT(EPOCH FROM (acknowledged_at - un_created_at)))
        FILTER (WHERE acknowledged_at IS NOT NULL AND acknowledged_at > un_created_at) AS avg_response_secs
    FROM base
    WHERE role IN ('hod', 'principal', 'vice_principal', 'dean')
    GROUP BY user_id, full_name, email, role, institution_id, inst_name_raw
  ),
  hod_responsiveness AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', COALESCE(full_name, 'Unknown'),
        'email', COALESCE(email, ''),
        'role', role,
        'institution', CASE WHEN institution_id IS NULL THEN 'N/A' ELSE COALESCE(inst_name_raw, 'Unknown') END,
        'escalations_received', received,
        'escalations_acknowledged', acknowledged,
        'avg_response_hours', CASE WHEN avg_response_secs IS NOT NULL
                                   THEN round((avg_response_secs / 3600.0)::numeric, 1) ELSE NULL END
      )
      ORDER BY (CASE WHEN received > 0 THEN acknowledged::numeric / received ELSE 0 END) ASC, user_id
    ), '[]'::jsonb) AS data
    FROM hod_agg
  ),
  wo AS (
    SELECT
      user_id, full_name, email, role, institution_id, inst_name_raw,
      count(*) AS unack
    FROM base
    WHERE acknowledged_at IS NULL
    GROUP BY user_id, full_name, email, role, institution_id, inst_name_raw
    ORDER BY count(*) DESC, user_id
    LIMIT 20
  ),
  worst_offenders AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', COALESCE(full_name, 'Unknown'),
        'email', COALESCE(email, ''),
        'role', COALESCE(role, 'unknown'),
        'institution', CASE WHEN institution_id IS NULL THEN 'N/A' ELSE COALESCE(inst_name_raw, 'Unknown') END,
        'unacknowledged_count', unack
      )
      ORDER BY unack DESC, user_id
    ), '[]'::jsonb) AS data
    FROM wo
  )
  SELECT jsonb_build_object(
    'overall', jsonb_build_object(
      'total_mandatory_notifications', o.total_mandatory,
      'total_required_acknowledgments', o.total_required,
      'total_acknowledged', o.total_ack,
      'overall_compliance_rate', CASE WHEN o.total_required > 0
        THEN round((o.total_ack::numeric / o.total_required * 100), 1) ELSE 0 END,
      'total_overdue', o.total_overdue
    ),
    'by_institution', bi.data,
    'by_notification', bn.data,
    'hod_responsiveness', hr.data,
    'worst_offenders', wof.data
  )
  INTO v_result
  FROM overall o, by_institution bi, by_notification bn, hod_responsiveness hr, worst_offenders wof;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_notification_compliance_rollup() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_notification_compliance_rollup() TO authenticated, service_role;
