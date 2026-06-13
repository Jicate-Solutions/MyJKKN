-- =============================================================================
-- R5.B / B3.3.1 — Filter drive-notification eligibility by lifecycle_status
-- =============================================================================
-- Re-frame from T2.1 audit (PR #1012):
-- The original "44/624 BPHARM gap" finding was not a profile-mapping bug. It
-- was A1's eligibility query wrongly including learners_profiles rows in
-- non-active lifecycle states (enquiry, inactive, exited, rejected, pending) —
-- admission-funnel rows that never became active learners.
--
-- This migration adds `lp.lifecycle_status IN ('active', 'graduated')` to the
-- willingness_open branch of fn_cdc_emit_drive_notification.
--
-- Probe (2026-05-19, before this migration):
--   Full learner population: 4697 profiles without filter → 4496 with filter
--     (drops 201, ~4.3% — enquiry/inactive/exited/rejected/pending)
--   BPHARM cohort:           580 profiles without filter → 572 with filter
--     (drops 8, ~1.4%)
--
-- All other transition branches (cancelled, announced, eligibility_locked,
-- results_announced, closed) are unchanged.
-- =============================================================================

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
    -- * → cancelled: coordinators + heads + any learner who declared willingness
    SELECT array_agg(DISTINCT uid) INTO v_user_ids FROM (
      -- coordinators + heads
      SELECT ur.user_id AS uid
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
        AND cr.is_active = true
      UNION
      -- willing learners (any non-withdrawn status)
      SELECT p.id AS uid
      FROM public.cdc_drive_willingness w
      JOIN public.profiles p ON p.learner_id = w.learner_id
      WHERE w.drive_id = p_drive_id
        AND w.status IS DISTINCT FROM 'withdrawn'
    ) all_targets WHERE uid IS NOT NULL;

    v_title := 'Drive Cancelled: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has been cancelled. '
            || 'See the drive page for the cancellation reason.';

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

  ELSIF p_to_state = 'results_announced' THEN
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
    -- No-op state (e.g. attendance_day, or unhandled transition).
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
