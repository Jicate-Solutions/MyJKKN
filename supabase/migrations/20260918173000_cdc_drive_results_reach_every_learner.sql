-- Every learner who declared hears their result - selected or not.
--
-- THE GAP. On results_announced the emitter wrote ONE row to every learner who
-- had declared and not withdrawn: 'Results are out ... Open the drive page to
-- see your selection status.' A learner who was NOT selected had no way to
-- learn that. The page they were sent to never changed for them, so the chain
-- ended in silence. 277 learners were waiting on outcomes from the 17 Sep
-- drives when this was written.
--
-- THE RULING (Director, 2026-09-18): tell everyone either way.
--
-- WHAT CHANGES - the results_announced branch only:
--   selected      learners with a cdc_placements row for this drive
--                 -> 'You have been selected ...',  key '<base>'
--   not selected  every other learner who declared and did not withdraw
--                 -> 'You have not been selected for this one ...',
--                    key '<base>.not_selected'
--   Both rows point at '/cdc/drives/<id>/willingness' - the learner's own page.
--   Learners do not hold cdc.drives.view, so the coordinator page at
--   '/cdc/drives/<id>' renders them an inline 'no access' notice.
--   The second key needs its own suffix or ON CONFLICT DO NOTHING drops the
--   second row silently. Same shape as the cancelled split's '.learners'.
--
-- Every other branch is byte-identical to the live definition read from the
-- production catalogue via pg_get_functiondef on 2026-09-18.
--
-- NOT APPLIED HERE. File only; the operator applies it at merge.
--
-- Behavioural proof: __tests__/cdc/drive-results-per-outcome.test.ts - the file
-- below is applied VERBATIM to a throwaway PostgreSQL 16 beside the live body
-- (checked in as __tests__/cdc/_fixtures/fn_cdc_emit_drive_notification.live-2026-09-18.sql)
-- installed under another name as the control.

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
  -- coordinator page at v_drive_url renders them an inline "no access" notice.
  v_learner_url    text;
  -- results_announced now speaks to two audiences with two different messages.
  v_selected_ids   uuid[];
  v_unselected_ids uuid[];
BEGIN
  SELECT title INTO v_drive_title
  FROM public.cdc_drives
  WHERE id = p_drive_id;

  IF v_drive_title IS NULL THEN
    RETURN;
  END IF;

  v_drive_url   := '/cdc/drives/' || p_drive_id::text;
  v_learner_url := v_drive_url || '/willingness';
  v_idempotency := 'cdc.drive.' || p_drive_id::text || '.' || p_to_state;

  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_drives WHERE id = p_drive_id)
  );

  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  IF p_to_state = 'cancelled' THEN
    SELECT array_agg(DISTINCT uid) INTO v_user_ids FROM (
      SELECT ur.user_id AS uid
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
        AND cr.is_active = true
      UNION
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
    -- Application-owned since 20260915100000: the learner notification is
    -- emitted by lib/services/cdc/drive-notifications.ts (institution +
    -- semester targeting, shared fanout + web push, idempotency key
    -- 'cdc_drive_willingness_open:<drive_id>'). No-op here to avoid a
    -- duplicate bell item.
    RETURN;

  ELSIF p_to_state = 'eligibility_locked' THEN
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
    -- Everyone who declared hears an outcome, selected or not (Director ruling,
    -- 2026-09-18: "Tell everyone either way"). Before this, one generic row went
    -- to every declared learner saying results were out and to go and look; a
    -- learner who was not selected had nothing to look at, because the page they
    -- could open never changed. Two rows now, because one row carries one body.
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

    -- Both rows point at the learner's own page, never the coordinator page.
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
    RETURN;
  END IF;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_targeting := jsonb_build_object('user_ids', to_jsonb(v_user_ids));

  INSERT INTO public.notifications (
    title, body, url, created_by, targeting, priority, category, kind, metadata, idempotency_key
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
-- Live ACL read 2026-09-18: postgres + service_role only.
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_emit_drive_notification(uuid, text, text, uuid) TO service_role;
