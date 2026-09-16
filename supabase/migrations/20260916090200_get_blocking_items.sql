-- =====================================================================
-- Blocking feedback gate — Migration C: one queue for the gate
-- Date: 2026-09-16
-- Spec: specs/2026-09-16-blocking-feedback-gate.md (build step 3)
--
-- get_blocking_items(p_user_id) returns everything the mandatory-notice
-- screen must show this person, in the order it shows them:
--
--   kind = 'ack'          — today's mandatory notifications (same rows and
--                           field names as get_unacknowledged_notifications,
--                           which stays in place for its other callers)
--   kind = 'answer'       — "must answer" announcements (Migration B) this
--                           person has not answered yet
--   kind = 'bug_feedback' — their own "is this fixed for you?" questions that
--                           are due (ask_after passed), not expired, not
--                           snoozed (Migration A). Ruling 6: reporter only.
--
-- Ruling 7 (super admins exempt) is enforced where it always was — in the
-- gate component — so /my-bug-reports keeps showing them their prompts.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_blocking_items(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Caller-identity guard (same shape as acknowledge_notification): a signed-in
  -- caller may only read their own queue; service role (auth.uid() IS NULL)
  -- and super admins may read anyone's.
  IF auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid()
     AND NOT COALESCE(is_super_admin(), false) THEN
    RAISE EXCEPTION 'Cannot read another user''s blocking items'
      USING ERRCODE = '42501';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    -- (a) mandatory acknowledgments — a must-answer notice is served as
    --     kind 'answer' below instead, never twice.
    SELECT
      'ack'::text                          AS kind,
      un.id,
      un.notification_id,
      un.read_at,
      un.acknowledged_at,
      un.created_at,
      n.title,
      n.body,
      n.priority,
      n.category,
      n.url,
      n.requires_acknowledgment,
      n.acknowledgment_deadline_hours,
      n.sent_at,
      n.created_by,
      n.metadata,
      COALESCE(p.full_name, p.email, 'System') AS created_by_name,
      NULL::jsonb                          AS answer_options,
      NULL::uuid                           AS request_id,
      NULL::uuid                           AS bug_id,
      NULL::text                           AS display_id,
      NULL::int                            AS snooze_count,
      NULL::timestamptz                    AS ask_after,
      NULL::timestamptz                    AS expires_at,
      1                                    AS sort_group,
      un.created_at                        AS sort_at
    FROM public.user_notifications un
    JOIN public.notifications n ON n.id = un.notification_id
    LEFT JOIN public.profiles p ON p.id = n.created_by
    WHERE un.user_id = p_user_id
      AND un.acknowledged_at IS NULL
      AND n.requires_acknowledgment = true
      AND n.requires_answer = false

    UNION ALL

    -- (b) must-answer announcements not yet answered by this person
    SELECT
      'answer'::text,
      un.id,
      un.notification_id,
      un.read_at,
      un.acknowledged_at,
      un.created_at,
      n.title,
      n.body,
      n.priority,
      n.category,
      n.url,
      n.requires_acknowledgment,
      n.acknowledgment_deadline_hours,
      n.sent_at,
      n.created_by,
      n.metadata,
      COALESCE(p.full_name, p.email, 'System'),
      n.answer_options,
      NULL::uuid, NULL::uuid, NULL::text, NULL::int, NULL::timestamptz,
      n.expires_at,
      2,
      un.created_at
    FROM public.user_notifications un
    JOIN public.notifications n ON n.id = un.notification_id
    LEFT JOIN public.profiles p ON p.id = n.created_by
    WHERE un.user_id = p_user_id
      AND n.requires_answer = true
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_answers a
        WHERE a.notification_id = n.id AND a.user_id = p_user_id
      )

    UNION ALL

    -- (c) the reporter's own due "is this fixed for you?" questions
    SELECT
      'bug_feedback'::text,
      r.id,
      r.id                                 AS notification_id,  -- the gate keys on this
      r.delivered_at                       AS read_at,
      NULL::timestamptz                    AS acknowledged_at,
      r.created_at,
      'You reported ' || COALESCE(b.display_id, 'a bug') || ' — is it fixed for you?' AS title,
      -- one line, plain text: the gate renders this without the rich-text box
      left(regexp_replace(COALESCE(b.description, ''), E'[\\r\\n\\t]+', ' ', 'g'), 200) AS body,
      'normal'::text                       AS priority,
      'bug_reports:fix_feedback'::text     AS category,
      '/my-bug-reports'::text              AS url,
      false                                AS requires_acknowledgment,
      NULL::int                            AS acknowledgment_deadline_hours,
      r.sent_at,
      NULL::uuid                           AS created_by,
      jsonb_build_object('source', 'bug_fix_feedback', 'cluster_id', r.cluster_id) AS metadata,
      'MyJKKN bug fixes'::text             AS created_by_name,
      NULL::jsonb,
      r.id                                 AS request_id,
      r.bug_id,
      b.display_id::text,
      r.snooze_count,
      r.ask_after,
      r.expires_at,
      3,
      r.ask_after
    FROM public.bug_fix_feedback_requests r
    JOIN public.bug_reports b ON b.id = r.bug_id
    WHERE r.reporter_user_id = p_user_id
      AND r.status IN ('sent','delivered')
      AND r.ask_after IS NOT NULL AND r.ask_after <= now()
      AND r.expires_at > now()
      AND (r.snoozed_until IS NULL OR r.snoozed_until <= now())

    ORDER BY sort_group ASC, sort_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_blocking_items(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_blocking_items(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_blocking_items(uuid) IS
  'The mandatory-notice screen''s queue: ack + must-answer + due bug-feedback items for one user. 2026-09-16.';
