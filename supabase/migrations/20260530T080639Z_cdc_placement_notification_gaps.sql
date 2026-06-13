-- ============================================================================
-- CDC PLACEMENT NOTIFICATION GAPS (P1) — two currently-silent events
-- ----------------------------------------------------------------------------
-- DB-only. Mirrors the established CDC notification pattern exactly
-- (notifications + email_notifications fanout, idempotency_key dedupe,
--  learner_id -> profiles.id recipient resolution). No new mechanism invented.
--
-- GAP 1 — MULTI-OFFER AUTO-DECLINE IS SILENT
--   When a learner accepts a placement offer, trg_cdc_multi_offer_cascade
--   (migration 20260518T1530Z) bulk-UPDATEs that learner's OTHER 'offered' rows
--   to 'declined' with decline_reason = 'auto_declined_on_acceptance_of_offer_<id>'.
--   The placement notification path (fn_cdc_emit_placement_notification, #1129)
--   only emits for 'offered'/'accepted' — it RETURNs early on 'declined'. And the
--   notification trigger (fn_cdc_placement_notifications_trg) also fires only for
--   'offered'/'accepted'. So the auto-declined learner is never told their offer
--   was cancelled because they accepted elsewhere. SILENT.
--
--   FIX: a new emit fn fn_cdc_emit_placement_auto_decline_notification, called
--   FROM INSIDE the cascade for each row it auto-declines. Only the cascade knows
--   which declines are acceptance-driven (vs a manual decline), so the emit is
--   wired at the cascade site rather than via a status-watching trigger. Mirrors
--   fn_cdc_emit_placement_notification byte-for-byte in shape: same recipient
--   resolution, both channels, same idempotency scheme.
--
--   RECRUITER NOTE: the existing placement pattern notifies ONLY the placed
--   learner — cdc_recruiters has NO user/profile/auth link (only a free-text
--   primary_contact_email), and fn_cdc_emit_placement_notification has no
--   recruiter recipient. Per parity ("recruiter IF the existing pattern notifies
--   recruiters"), and because it does NOT, we notify only the affected learner.
--
-- GAP 2 — attendance_day DRIVE TRANSITION IS SILENT
--   fn_cdc_emit_drive_notification (in-app, 20260519) and
--   fn_cdc_emit_drive_email_notification (email, 20260530 parity) BOTH treat
--   attendance_day as the ELSE no-op branch — the only drive stage that emits
--   nothing. Other stages all notify.
--
--   FIX: re-CREATE both drive emit fns with their LIVE body preserved
--   byte-identical (incl. the R5.B lifecycle filter on willingness_open) plus a
--   new attendance_day branch. Recipients = willing learners (the candidate pool
--   reporting that day), parity with the results_announced branch.
--
-- Idempotency keys follow the established scheme:
--   auto-decline in-app: cdc.placement.<placement_id>.declined
--   auto-decline email:  cdc.placement.email.<placement_id>.declined.<recipient_id>
--   drive attendance_day in-app: cdc.drive.<drive_id>.attendance_day
--   drive attendance_day email:  cdc.drive.email.<drive_id>.attendance_day.<recipient_id>
-- ============================================================================


-- ===========================================================================
-- PART 0: extend notification_type CHECK allowlist with 'cdc.placement.declined'
-- and the two drive attendance-day types are already covered by 'cdc.drive.*'
-- email types? NO -- email_notifications.notification_type is a fixed allowlist
-- (see #1129). Add the new email categories used below.
-- ===========================================================================
ALTER TABLE public.email_notifications
  DROP CONSTRAINT IF EXISTS email_notifications_notification_type_check;

ALTER TABLE public.email_notifications
  ADD CONSTRAINT email_notifications_notification_type_check
  CHECK (
    (notification_type)::text = ANY (ARRAY[
      'syllabus_revised'::text,
      'syllabus_approved'::text,
      'meeting_scheduled'::text,
      'course_ready_review'::text,
      'cdc.drive.announced'::text,
      'cdc.drive.willingness_open'::text,
      'cdc.drive.eligibility_locked'::text,
      'cdc.drive.attendance_day'::text,
      'cdc.drive.results_announced'::text,
      'cdc.drive.closed'::text,
      'cdc.drive.cancelled'::text,
      'cdc.placement.offered'::text,
      'cdc.placement.accepted'::text,
      'cdc.placement.declined'::text
    ])
  );


-- ===========================================================================
-- PART 1.1: auto-decline emit fn (mirrors fn_cdc_emit_placement_notification)
-- ---------------------------------------------------------------------------
-- Notify the learner whose pending offer was auto-declined because they
-- accepted another offer. p_accepted_placement_id is the offer they accepted
-- (for the message + metadata). In-app + email, both idempotent.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_placement_auto_decline_notification(
  p_declined_placement_id uuid,
  p_accepted_placement_id uuid,
  p_actor uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner_id        uuid;
  v_drive_id          uuid;
  v_recruiter_id      uuid;
  v_recruiter_name    text;
  v_recipient_id      uuid;     -- profiles.id of the auto-declined learner
  v_recipient_email   text;
  v_recipient_name    text;
  v_institution       uuid;
  v_actor             uuid;
  v_title             text;
  v_body              text;
  v_url               text;
  v_targeting         jsonb;
BEGIN
  -- Resolve the DECLINED placement -> learner + recruiter.
  SELECT learner_id, drive_id, recruiter_id
    INTO v_learner_id, v_drive_id, v_recruiter_id
  FROM public.cdc_placements
  WHERE id = p_declined_placement_id;

  IF v_learner_id IS NULL THEN
    RETURN; -- placement vanished mid-tx
  END IF;

  -- Recruiter (company) name of the declined offer; degrade gracefully.
  SELECT name INTO v_recruiter_name
  FROM public.cdc_recruiters
  WHERE id = v_recruiter_id;
  v_recruiter_name := COALESCE(NULLIF(trim(v_recruiter_name), ''), 'the recruiter');

  -- Resolve the placed learner -> profiles.id + email + institution.
  -- cdc_placements.learner_id references learners_profiles.id; profiles links
  -- back via profiles.learner_id (auth.users.id == profiles.id).
  SELECT p.id, p.email, p.full_name, lp.institution_id
    INTO v_recipient_id, v_recipient_email, v_recipient_name, v_institution
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.learner_id = lp.id
  WHERE lp.id = v_learner_id;

  IF v_recipient_id IS NULL THEN
    -- No linked profile for this learner; nothing to notify. (Match the pattern.)
    RETURN;
  END IF;

  -- created_by is NOT NULL on notifications; fall back to placement creator.
  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_placements WHERE id = p_declined_placement_id)
  );

  IF v_actor IS NULL THEN
    -- No identifiable actor; skip silently rather than violate NOT NULL.
    RETURN;
  END IF;

  v_title := 'Placement Offer Auto-Declined';
  v_body  := 'Your pending placement offer from ' || v_recruiter_name || ' was '
          || 'automatically declined because you accepted another offer. '
          || 'Open your placements page to review your accepted offer.';

  -- Link to the DECLINED placement so the learner lands on the affected offer.
  v_url       := '/cdc/placements/' || p_declined_placement_id::text;
  v_targeting := jsonb_build_object('user_ids', to_jsonb(ARRAY[v_recipient_id]));

  -- ---------------------------------------------------------------------
  -- IN-APP channel (notifications). Idempotent on idempotency_key.
  -- ---------------------------------------------------------------------
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
    v_url,
    v_actor,
    v_targeting,
    'high',
    'cdc.placement.declined',
    'work_item',
    jsonb_build_object(
      'placement_id', p_declined_placement_id,
      'accepted_placement_id', p_accepted_placement_id,
      'drive_id', v_drive_id,
      'recruiter_id', v_recruiter_id,
      'to_state', 'declined',
      'reason', 'auto_declined_on_acceptance',
      'recipient_id', v_recipient_id
    ),
    'cdc.placement.' || p_declined_placement_id::text || '.declined'
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;

  -- ---------------------------------------------------------------------
  -- EMAIL channel (email_notifications). Skip silently if institution is NULL
  -- (institutions_id is NOT NULL) or no email address -- matches the pattern.
  -- ---------------------------------------------------------------------
  IF v_institution IS NOT NULL
     AND v_recipient_email IS NOT NULL
     AND v_recipient_email <> '' THEN
    INSERT INTO public.email_notifications (
      institutions_id,
      notification_type,
      recipient_email,
      recipient_name,
      subject,
      body,
      status,
      created_by,
      idempotency_key
    ) VALUES (
      v_institution,
      'cdc.placement.declined',
      v_recipient_email,
      v_recipient_name,
      v_title,
      v_body,
      'pending',
      v_actor,
      'cdc.placement.email.' || p_declined_placement_id::text || '.declined.' || v_recipient_id::text
    )
    ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
  END IF;
END;
$function$;


-- ===========================================================================
-- PART 1.2: re-CREATE fn_cdc_multi_offer_cascade with notification emit
-- ---------------------------------------------------------------------------
-- LIVE body preserved byte-identical (the UPDATE that auto-declines other
-- 'offered' rows). Added: capture the set of auto-declined placement ids and
-- emit one auto-decline notification per affected row. Emitting from inside the
-- cascade (not a status trigger) is deliberate -- only the cascade can
-- distinguish acceptance-driven declines from manual ones.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_multi_offer_cascade()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_declined_id uuid;
  v_actor       uuid;
BEGIN
  -- Only fire when status transitions INTO 'accepted'.
  IF NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'accepted' THEN
    RETURN NEW;  -- already accepted — idempotent re-fire safety
  END IF;

  -- Actor for the emitted notifications (created_by is NOT NULL on notifications).
  v_actor := COALESCE(NEW.updated_by, NEW.created_by);

  -- Decline all other 'offered' rows for this learner except the one just accepted,
  -- capturing their ids so we can notify each auto-declined learner offer.
  FOR v_declined_id IN
    UPDATE public.cdc_placements
    SET
      status         = 'declined',
      declined_at    = now(),
      decline_reason = 'auto_declined_on_acceptance_of_offer_' || NEW.id::text,
      updated_at     = now()
    WHERE learner_id = NEW.learner_id
      AND id        <> NEW.id
      AND status     = 'offered'
    RETURNING id
  LOOP
    -- GAP 1 FIX: tell the learner their pending offer was auto-declined.
    PERFORM public.fn_cdc_emit_placement_auto_decline_notification(
      v_declined_id,  -- the auto-declined placement
      NEW.id,         -- the offer they accepted
      v_actor
    );
  END LOOP;

  RETURN NEW;
END;
$$;


-- ===========================================================================
-- PART 2.1: in-app drive emit fn — add attendance_day branch
-- ---------------------------------------------------------------------------
-- LIVE body preserved byte-identical (incl. the R5.B lifecycle filter on the
-- willingness_open branch). Added: an attendance_day branch BEFORE the ELSE
-- no-op, mirroring results_announced's recipient set (willing learners).
-- ===========================================================================
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

  ELSIF p_to_state = 'attendance_day' THEN
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


-- ===========================================================================
-- PART 2.2: email drive emit fn — add attendance_day branch
-- ---------------------------------------------------------------------------
-- LIVE body preserved byte-identical (incl. R5.B lifecycle filter on
-- willingness_open). Added: an attendance_day branch mirroring
-- results_announced's recipient set (willing learners).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_email_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_drive_title   text;
  v_user_ids      uuid[];
  v_subject       text;
  v_body          text;
  v_institution   uuid;
  v_actor         uuid;
BEGIN
  -- Resolve drive title + the first institution (institutions is uuid[]).
  SELECT title, institutions[1]
    INTO v_drive_title, v_institution
  FROM public.cdc_drives
  WHERE id = p_drive_id;

  IF v_drive_title IS NULL THEN
    RETURN; -- drive vanished mid-tx
  END IF;

  IF v_institution IS NULL THEN
    -- email_notifications.institutions_id is NOT NULL; skip silently rather
    -- than violate the constraint. In-app channel still fires (handled by
    -- the in-app emit function which has no such constraint).
    RETURN;
  END IF;

  -- created_by mirrors in-app function: fall back to drive creator.
  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_drives WHERE id = p_drive_id)
  );

  -- =====================================================================
  -- Resolve targeted user_ids per transition (mirrors A1 exactly).
  -- =====================================================================
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

    v_subject := 'Drive Cancelled: ' || v_drive_title;
    v_body    := 'The drive "' || v_drive_title || '" has been cancelled. '
              || 'See the drive page for the cancellation reason.';

  ELSIF p_to_state = 'announced' AND p_from_state = 'draft' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_subject := 'New Drive Announced: ' || v_drive_title;
    v_body    := 'A new drive "' || v_drive_title || '" has been announced. '
              || 'Review details and prepare the willingness rollout.';

  ELSIF p_to_state = 'willingness_open' THEN
    -- R5.B PARITY FIX: restrict to ACTIVE + GRADUATED learners only, matching
    -- fn_cdc_emit_drive_notification (in-app). Without this, learners in
    -- enquiry/inactive/exited/rejected/pending lifecycle states get wrongly
    -- emailed about drives they are not part of.
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
    JOIN public.cdc_drive_eligibility e ON e.drive_id = p_drive_id
    WHERE lp.program_id = ANY(e.program_ids)
      AND lp.lifecycle_status IN ('active', 'graduated')
      AND p.id IS NOT NULL;

    v_subject := 'Drive Open for Willingness: ' || v_drive_title;
    v_body    := 'You are eligible for the drive "' || v_drive_title || '". '
              || 'Declare your willingness before the window closes.';

  ELSIF p_to_state = 'eligibility_locked' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_subject := 'Eligibility Locked: ' || v_drive_title;
    v_body    := 'The eligibility list for "' || v_drive_title || '" has been '
              || 'locked. Proceed to attendance and selection.';

  ELSIF p_to_state = 'attendance_day' THEN
    -- GAP 2 FIX (email parity): notify the willing learners (candidate pool
    -- reporting that day), mirroring results_announced's recipient set.
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_subject := 'Attendance Day: ' || v_drive_title;
    v_body    := 'The drive "' || v_drive_title || '" has reached its attendance '
              || 'day. Report as instructed and check the drive page for details.';

  ELSIF p_to_state = 'results_announced' THEN
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_subject := 'Results Announced: ' || v_drive_title;
    v_body    := 'Results are out for the drive "' || v_drive_title || '". '
              || 'Open the drive page to see your selection status.';

  ELSIF p_to_state = 'closed' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key = 'cdc_head'
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_subject := 'Drive Closed: ' || v_drive_title;
    v_body    := 'The drive "' || v_drive_title || '" has been closed. '
              || 'Final selections are recorded; archive the artifacts.';

  ELSE
    -- unhandled transition: no-op (matches A1).
    RETURN;
  END IF;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- =====================================================================
  -- Fanout INSERT: one email_notifications row per recipient with a real
  -- email address. Skip recipients whose profile has no email.
  -- =====================================================================
  INSERT INTO public.email_notifications (
    institutions_id,
    notification_type,
    recipient_email,
    recipient_name,
    subject,
    body,
    status,
    created_by,
    idempotency_key
  )
  SELECT
    v_institution,
    'cdc.drive.' || p_to_state,
    p.email,
    p.full_name,
    v_subject,
    v_body,
    'pending',
    v_actor,
    'cdc.drive.email.' || p_drive_id::text || '.' || p_to_state || '.' || p.id::text
  FROM public.profiles p
  WHERE p.id = ANY(v_user_ids)
    AND p.email IS NOT NULL
    AND p.email <> ''
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;


-- ===========================================================================
-- Verification probes (SELECT-only; the BEGIN/ROLLBACK smoke is run separately
-- via the Management API at apply time — see PR body for observed row counts).
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_cdc_emit_placement_auto_decline_notification'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_cdc_emit_placement_auto_decline_notification not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_cdc_multi_offer_cascade'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Verification failed: fn_cdc_multi_offer_cascade not found';
  END IF;

  RAISE NOTICE 'CDC placement notification gaps migration verification: ALL PASS';
END;
$$;
