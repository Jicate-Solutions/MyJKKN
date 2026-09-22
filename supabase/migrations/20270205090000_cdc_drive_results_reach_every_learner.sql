-- =============================================================================
-- Every learner who declared hears their result - selected or not.
-- =============================================================================
-- REBUILT ON MAIN'S CURRENT BODY. The first cut of this file was derived from
-- the body 20260915100000 left in production, which is NOT what main carries
-- any more: 20260919100000_cdc_drive_notification_emitter_restore.sql restored
-- three behaviours 20260915100000 had silently dropped. Applying the first cut
-- would have dropped them a THIRD time. This file therefore starts from
-- 20260919100000's body and changes ONE branch.
--
-- CARRIED OVER FROM 20260919100000 (byte-for-byte, do not "simplify"):
--   1. attendance_day  - the whole branch. eligibility_locked -> attendance_day
--      notifies the willing learners at their own page. 20260915100000 deleted
--      it, so that transition told nobody.
--   2. learner URLs    - v_learner_url = '/cdc/drives/<id>/willingness' on every
--      learner-facing branch. Learners do not hold cdc.drives.view, so the
--      coordinator page renders them an inline "no access" notice.
--   3. cancelled split - TWO rows, not one: the team row at the coordinator page
--      on the base idempotency key, the learner row at the learner page on
--      '<key>.learners'.
--   4. willingness_open - still a no-op. The learner notification for a
--      willingness cycle is emitted by lib/services/cdc/drive-notifications.ts;
--      a row here would be a second bell item.
--
-- WHAT THIS FILE CHANGES - the results_announced branch, and nothing else:
--   THE GAP. results_announced wrote ONE row to every learner who had declared
--   and not withdrawn: 'Results are out ... Open the drive page to see your
--   selection status.' A learner who was NOT selected had no way to learn that.
--   The page they could open never changed for them, so the chain ended in
--   silence. 277 learners were waiting on outcomes from the 17 Sep drives when
--   this was written.
--
--   THE RULING (Director, 2026-09-18): tell everyone either way.
--
--     selected      learners with a cdc_placements row for this drive
--                   -> 'You have been selected ...',  key '<base>'
--     not selected  every other learner who declared and did not withdraw
--                   -> 'You have not been selected for this one ...',
--                      key '<base>.not_selected'
--
--   Both rows point at '/cdc/drives/<id>/willingness'. The second key needs its
--   own suffix or ON CONFLICT DO NOTHING drops the second row silently - the
--   same shape as the cancelled split's '.learners'.
--
-- VERSION. 20270205090000 is numbered past 20260919100000, past every version
-- on main (highest: 20261231090000, read from jicate/main at f7a67e7a08) and
-- past every version claimed by an OPEN pull request (highest: 20270204090000,
-- PR #3946, read 2026-09-22 via scripts/ci/check-migration-version-cross-pr.sh's
-- API sweep). A version that sorts earlier than 20260919100000 would re-apply
-- this body BEFORE the restore and re-introduce the regression on a fresh apply.
-- The first number tried here, 20270101090000, was already claimed by PR #3947.
--
-- NOT APPLIED HERE. File only; the operator applies it at merge.
--
-- Behavioural proof: __tests__/cdc/drive-results-per-outcome.test.ts applies
-- this file VERBATIM to a throwaway PostgreSQL 16 beside two controls -
-- _fixtures/...main-2026-09-22.sql (main's current body) and
-- _fixtures/...regressed-2026-09-15.sql (the body that dropped attendance_day).
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
  -- The learner's own page. Learners do not hold cdc.drives.view, so the
  -- coordinator page at v_drive_url shows them an inline "no access" notice.
  v_learner_url    text;
  -- cancelled goes to two audiences that can open different pages.
  v_team_ids      uuid[];
  v_learner_ids    uuid[];
  -- results_announced now speaks to two audiences with two different messages.
  v_selected_ids   uuid[];
  v_unselected_ids uuid[];
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
    -- Application-owned: the learner notification for willingness is sent once
    -- per willingness CYCLE by lib/services/cdc/willingness-cycles.ts ->
    -- drive-notifications.ts (institution + program + semester targeting,
    -- shared fanout + web push, audited in cdc_drive_notification_log).
    -- No-op here so learners never get a second bell item.
    RETURN;

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
    -- Everyone who declared hears an outcome, selected or not (Director ruling,
    -- 2026-09-18: "Tell everyone either way"). Two rows, because one row carries
    -- one body. Both at the learner page - v_drive_url is deliberately NOT
    -- reassigned here, because this branch writes its own rows and RETURNs.
    --
    -- Selected = the learner has a cdc_placements row for this drive. The bucket
    -- test depends only on w.learner_id, and profiles.learner_id is single
    -- valued, so a given profile id lands in exactly one of the two arrays.
    SELECT array_agg(DISTINCT p.id) INTO v_selected_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.cdc_placements pl
        WHERE pl.drive_id = p_drive_id
          AND pl.learner_id = w.learner_id
      );

    SELECT array_agg(DISTINCT p.id) INTO v_unselected_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cdc_placements pl
        WHERE pl.drive_id = p_drive_id
          AND pl.learner_id = w.learner_id
      );

    IF v_selected_ids IS NOT NULL AND array_length(v_selected_ids, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (
        title, body, url, created_by, targeting, priority, category, kind,
        metadata, idempotency_key
      ) VALUES (
        'Results Announced: ' || v_drive_title,
        'Results are out for the drive "' || v_drive_title || '". '
          || 'You have been selected. Open your drive page for the offer '
          || 'details and what happens next.',
        v_learner_url,
        v_actor,
        jsonb_build_object('user_ids', to_jsonb(v_selected_ids)),
        'normal', 'cdc.drive.results_announced', 'work_item',
        jsonb_build_object(
          'drive_id', p_drive_id, 'from_state', p_from_state, 'to_state', p_to_state,
          'audience', 'selected', 'recipient_count', array_length(v_selected_ids, 1)
        ),
        v_idempotency
      )
      ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
    END IF;

    IF v_unselected_ids IS NOT NULL AND array_length(v_unselected_ids, 1) IS NOT NULL THEN
      INSERT INTO public.notifications (
        title, body, url, created_by, targeting, priority, category, kind,
        metadata, idempotency_key
      ) VALUES (
        'Results Announced: ' || v_drive_title,
        'Results are out for the drive "' || v_drive_title || '". '
          || 'You have not been selected for this one. Thank you for taking '
          || 'part. Your drive page has the details.',
        v_learner_url,
        v_actor,
        jsonb_build_object('user_ids', to_jsonb(v_unselected_ids)),
        'normal', 'cdc.drive.results_announced', 'work_item',
        jsonb_build_object(
          'drive_id', p_drive_id, 'from_state', p_from_state, 'to_state', p_to_state,
          'audience', 'not_selected', 'recipient_count', array_length(v_unselected_ids, 1)
        ),
        -- Distinct suffix: the base key already belongs to the selected row, and
        -- ON CONFLICT DO NOTHING would otherwise drop this one silently. Same
        -- shape as the cancelled split's '.learners' suffix.
        v_idempotency || '.not_selected'
      )
      ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
    END IF;

    RETURN;

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
