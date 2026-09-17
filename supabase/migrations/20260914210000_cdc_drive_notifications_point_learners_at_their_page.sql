-- A learner's drive notification now opens a page the learner can see.
--
-- THE GAP. Every drive notification pointed at '/cdc/drives/<id>' — the
-- COORDINATOR page, wrapped in <PermissionGuard module="cdc.drives"
-- action="view">. Learners do not hold that permission. A learner who tapped
-- "Drive Open for Willingness" therefore landed on an inline "you don't have
-- access" notice with no link onward, and the chain ended there. Nothing failed
-- loudly; the link failed politely. Found 2026-09-12 while tracing why zero
-- learners had ever declared for a drive.
--
-- WHAT CHANGES. Only the URL, and only per audience:
--   learner-only transitions   willingness_open, attendance_day, results_announced
--                              -> '/cdc/drives/<id>/willingness'   (the learner page,
--                                 deliberately ungated — see its header comment)
--   team-only transitions     announced, eligibility_locked, closed
--                              -> '/cdc/drives/<id>'               (unchanged)
--   cancelled                  BOTH audiences in one row before; now one row per
--                              audience, each with a page it can open. The team member
--                              row keeps the original idempotency key so a
--                              cancellation already sent is never re-sent; the
--                              learner row is keyed '<key>.learners'.
--
-- Titles, bodies, recipient queries, the R5.B lifecycle filter and every other
-- line are byte-identical to the live definition as read 2026-09-14. The email
-- emitter (fn_cdc_emit_drive_email_notification) carries no link and is untouched.
--
-- Behavioural proof: __tests__/cdc/drive-notification-learner-url.test.ts

CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_drive_title    text;
  v_drive_url      text;
  v_user_ids       uuid[];
  v_targeting      jsonb;
  v_title          text;
  v_body           text;
  v_idempotency    text;
  v_actor          uuid;
  -- The learner's own page. Learners do not hold cdc.drives.view, so the
  -- coordinator page at v_drive_url shows them an inline "no access" notice.
  v_learner_url    text;
  -- cancelled goes to two audiences that can open different pages.
  v_team_ids      uuid[];
  v_learner_ids    uuid[];
BEGIN
  -- Resolve drive title + URL once.
  SELECT title INTO v_drive_title
  FROM public.cdc_drives
  WHERE id = p_drive_id;

  IF v_drive_title IS NULL THEN
    -- Drive vanished mid-transaction; nothing to notify about.
    RETURN;
  END IF;

  v_drive_url   := '/cdc/drives/' || p_drive_id::text;
  v_learner_url := v_drive_url || '/willingness';
  v_idempotency := 'cdc.drive.' || p_drive_id::text || '.' || p_to_state;

  -- created_by is NOT NULL on notifications; fall back to the drive's creator
  -- if the actor is missing (e.g. system-driven transition).
  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_drives WHERE id = p_drive_id)
  );

  IF v_actor IS NULL THEN
    -- No identifiable actor; skip silently rather than violate NOT NULL.
    RETURN;
  END IF;

  -- =====================================================================
  -- Build the targeted user_ids array per transition.
  -- =====================================================================
  IF p_to_state = 'cancelled' THEN
    -- * → cancelled: coordinators + heads, AND any learner who declared.
    -- Two rows, not one: a single row can carry only one URL, and the two
    -- audiences cannot open the same page. The team member row keeps the original
    -- idempotency key so a cancellation already sent is never sent twice.
    SELECT array_agg(DISTINCT ur.user_id) INTO v_team_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    SELECT array_agg(DISTINCT p.id) INTO v_learner_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_title := 'Drive Cancelled: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has been cancelled. '
            || 'See the drive page for the cancellation reason.';

    IF v_team_ids IS NOT NULL AND array_length(v_team_ids, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (
        title, body, url, created_by, targeting, priority, category, kind,
        metadata, idempotency_key
      ) VALUES (
        v_title, v_body, v_drive_url, v_actor,
        jsonb_build_object('user_ids', to_jsonb(v_team_ids)),
        'normal', 'cdc.drive.cancelled', 'work_item',
        jsonb_build_object(
          'drive_id', p_drive_id, 'from_state', p_from_state, 'to_state', p_to_state,
          'audience', 'team', 'recipient_count', array_length(v_team_ids, 1)
        ),
        v_idempotency
      )
      ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
    END IF;

    IF v_learner_ids IS NOT NULL AND array_length(v_learner_ids, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (
        title, body, url, created_by, targeting, priority, category, kind,
        metadata, idempotency_key
      ) VALUES (
        v_title, v_body, v_learner_url, v_actor,
        jsonb_build_object('user_ids', to_jsonb(v_learner_ids)),
        'normal', 'cdc.drive.cancelled', 'work_item',
        jsonb_build_object(
          'drive_id', p_drive_id, 'from_state', p_from_state, 'to_state', p_to_state,
          'audience', 'learners', 'recipient_count', array_length(v_learner_ids, 1)
        ),
        v_idempotency || '.learners'
      )
      ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
    END IF;

    RETURN;

  ELSIF p_to_state = 'announced' AND p_from_state = 'draft' THEN
    -- draft → announced: notify cdc_coordinator + cdc_head
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'New Drive Announced: ' || v_drive_title;
    v_body  := 'A new drive "' || v_drive_title || '" has been announced. '
            || 'Review details and prepare the willingness rollout.';

  ELSIF p_to_state = 'willingness_open' THEN
    v_drive_url := v_learner_url;  -- learner-only audience
    -- announced → willingness_open: notify learners whose program is in the
    -- drive's eligibility program_ids[].
    --
    -- R5.B fix: restrict to ACTIVE + GRADUATED learners only.
    -- Without this filter, rows in enquiry/inactive/exited/rejected/pending
    -- lifecycle states (admission-funnel artifacts, dropped learners) get
    -- wrongly notified about drives they are not part of.
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
    JOIN public.cdc_drive_eligibility e ON e.drive_id = p_drive_id
    WHERE lp.program_id = ANY(e.program_ids)
      AND lp.lifecycle_status IN ('active', 'graduated')
      AND p.id IS NOT NULL;

    v_title := 'Drive Open for Willingness: ' || v_drive_title;
    v_body  := 'You are eligible for the drive "' || v_drive_title || '". '
            || 'Declare your willingness before the window closes.';

  ELSIF p_to_state = 'eligibility_locked' THEN
    -- willingness_open → eligibility_locked: notify cdc_coordinator + cdc_head
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'Eligibility Locked: ' || v_drive_title;
    v_body  := 'The eligibility list for "' || v_drive_title || '" has been '
            || 'locked. Proceed to attendance and selection.';

  ELSIF p_to_state = 'attendance_day' THEN
    v_drive_url := v_learner_url;  -- learner-only audience
    -- GAP 2 FIX: eligibility_locked → attendance_day. Notify the willing
    -- learners (the candidate pool reporting for the drive that day), parity
    -- with results_announced's recipient set.
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_title := 'Attendance Day: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has reached its attendance '
            || 'day. Report as instructed and check the drive page for details.';

  ELSIF p_to_state = 'results_announced' THEN
    v_drive_url := v_learner_url;  -- learner-only audience
    -- (eligibility_locked OR attendance_day) → results_announced: notify
    -- learners who declared willingness (the candidate pool).
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_title := 'Results Announced: ' || v_drive_title;
    v_body  := 'Results are out for the drive "' || v_drive_title || '". '
            || 'Open the drive page to see your selection status.';

  ELSIF p_to_state = 'closed' THEN
    -- results_announced → closed: notify cdc_head only
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key = 'cdc_head'
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'Drive Closed: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has been closed. '
            || 'Final selections are recorded; archive the artifacts.';

  ELSE
    -- No-op state (unhandled transition).
    RETURN;
  END IF;

  -- =====================================================================
  -- INSERT the notification row (idempotent on idempotency_key).
  -- =====================================================================
  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    -- Nobody to notify; skip silently.
    RETURN;
  END IF;

  v_targeting := jsonb_build_object('user_ids', to_jsonb(v_user_ids));

  INSERT INTO public.notifications (
    title,
    body,
    url,
    created_by,
    targeting,
    priority,
    category,
    kind,
    metadata,
    idempotency_key
  ) VALUES (
    v_title,
    v_body,
    v_drive_url,
    v_actor,
    v_targeting,
    'normal',
    'cdc.drive.' || p_to_state,
    'work_item',
    jsonb_build_object(
      'drive_id', p_drive_id,
      'from_state', p_from_state,
      'to_state', p_to_state,
      'recipient_count', array_length(v_user_ids, 1)
    ),
    v_idempotency
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;

-- CREATE OR REPLACE keeps an existing ACL, but re-assert it so this file is
-- safe to apply on a database where the function was never locked down.
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) TO service_role;
