-- ============================================================================
-- CDC NOTIFICATION PARITY (P1)
-- ----------------------------------------------------------------------------
-- Two notification-layer fixes, DB-only:
--
-- A) CHANNEL DIVERGENCE
--    fn_cdc_emit_drive_email_notification (email channel) is missing the
--    lifecycle filter that the in-app fn_cdc_emit_drive_notification already
--    has (added by R5.B / migration 20260519T204616Z). Without it, ~201
--    enquiry/inactive/exited/rejected learners get EMAILED on every
--    announced -> willingness_open transition. We re-CREATE the email fn with
--    the live body byte-identical, inserting only the single clause:
--        AND lp.lifecycle_status IN ('active', 'graduated')
--    into the willingness_open branch.
--
-- B) MISSING EVENT
--    placement offered/accepted emits NO notification on either channel -- the
--    highest-value event in the module is silent. We add a placement
--    notification path mirroring the drive pattern exactly:
--      - fn_cdc_emit_placement_notification(p_placement_id, p_to_state, p_actor)
--        notifies the PLACED learner on both in-app + email channels.
--      - trigger trg_cdc_placement_notifications on cdc_placements
--        AFTER UPDATE OF status, coexisting with the existing
--        trg_cdc_multi_offer_cascade + trg_cdc_placement_to_alumni triggers.
--      - email_notifications.notification_type CHECK allowlist extended with
--        'cdc.placement.offered' + 'cdc.placement.accepted'.
--
-- Idempotency keys match the drive scheme:
--   in-app:  cdc.placement.<placement_id>.<state>
--   email:   cdc.placement.email.<placement_id>.<state>.<recipient_id>
-- ============================================================================


-- ===========================================================================
-- PART A: email fn lifecycle filter (live body, +1 clause in willingness_open)
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
    -- attendance_day or unhandled transition: no-op (matches A1).
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
-- PART B.1: extend email_notifications.notification_type CHECK allowlist
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
      'cdc.drive.results_announced'::text,
      'cdc.drive.closed'::text,
      'cdc.drive.cancelled'::text,
      'cdc.placement.offered'::text,
      'cdc.placement.accepted'::text
    ])
  );


-- ===========================================================================
-- PART B.2: placement notification emit fn (mirrors the drive pattern)
-- ---------------------------------------------------------------------------
-- For p_to_state IN ('offered','accepted'): notify the placed learner on both
-- the in-app channel (notifications) and the email channel (email_notifications).
-- Recipient resolution: cdc_placements.learner_id -> profiles.id (in-app) and
-- profiles.email (email). Institution for email resolved via learners_profiles.
-- Guards mirror the drive fns: skip silently if no actor (notifications.created_by
-- is NOT NULL), if no recipient profile, or if institution is NULL (email only).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_placement_notification(p_placement_id uuid, p_to_state text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_learner_id      uuid;
  v_drive_id        uuid;
  v_recruiter_id    uuid;
  v_recruiter_name  text;
  v_recipient_id    uuid;     -- profiles.id of the placed learner
  v_recipient_email text;
  v_recipient_name  text;
  v_institution     uuid;
  v_actor           uuid;
  v_title           text;
  v_body            text;
  v_url             text;
  v_targeting       jsonb;
BEGIN
  -- Only the two high-value placement transitions notify.
  IF p_to_state NOT IN ('offered', 'accepted') THEN
    RETURN;
  END IF;

  -- Resolve placement -> learner + recruiter.
  SELECT learner_id, drive_id, recruiter_id
    INTO v_learner_id, v_drive_id, v_recruiter_id
  FROM public.cdc_placements
  WHERE id = p_placement_id;

  IF v_learner_id IS NULL THEN
    RETURN; -- placement vanished mid-tx
  END IF;

  -- Recruiter (company) name for a richer message; degrade gracefully.
  SELECT name INTO v_recruiter_name
  FROM public.cdc_recruiters
  WHERE id = v_recruiter_id;
  v_recruiter_name := COALESCE(NULLIF(trim(v_recruiter_name), ''), 'the recruiter');

  -- Resolve the placed learner -> profiles.id + email + institution.
  -- cdc_placements.learner_id references learners_profiles.id; profiles links
  -- back via profiles.learner_id.
  SELECT p.id, p.email, p.full_name, lp.institution_id
    INTO v_recipient_id, v_recipient_email, v_recipient_name, v_institution
  FROM public.learners_profiles lp
  JOIN public.profiles p ON p.learner_id = lp.id
  WHERE lp.id = v_learner_id;

  IF v_recipient_id IS NULL THEN
    -- No linked profile for this learner; nothing to notify. (Match drive guards.)
    RETURN;
  END IF;

  -- created_by is NOT NULL on notifications; fall back to placement creator.
  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_placements WHERE id = p_placement_id)
  );

  IF v_actor IS NULL THEN
    -- No identifiable actor; skip silently rather than violate NOT NULL.
    RETURN;
  END IF;

  -- Message copy per state.
  IF p_to_state = 'offered' THEN
    v_title := 'Placement Offer Received';
    v_body  := 'You have received a placement offer from ' || v_recruiter_name || '. '
            || 'Open your placements page to review and respond.';
  ELSE -- accepted
    v_title := 'Placement Offer Accepted';
    v_body  := 'Your placement offer from ' || v_recruiter_name || ' has been accepted. '
            || 'Congratulations -- see your placements page for next steps.';
  END IF;

  v_url       := '/cdc/placements/' || p_placement_id::text;
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
    'cdc.placement.' || p_to_state,
    'work_item',
    jsonb_build_object(
      'placement_id', p_placement_id,
      'drive_id', v_drive_id,
      'recruiter_id', v_recruiter_id,
      'to_state', p_to_state,
      'recipient_id', v_recipient_id
    ),
    'cdc.placement.' || p_placement_id::text || '.' || p_to_state
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;

  -- ---------------------------------------------------------------------
  -- EMAIL channel (email_notifications). Skip silently if institution is NULL
  -- (institutions_id is NOT NULL) or no email address -- matches drive email fn.
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
      'cdc.placement.' || p_to_state,
      v_recipient_email,
      v_recipient_name,
      v_title,
      v_body,
      'pending',
      v_actor,
      'cdc.placement.email.' || p_placement_id::text || '.' || p_to_state || '.' || v_recipient_id::text
    )
    ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
  END IF;
END;
$function$;


-- ===========================================================================
-- PART B.3: trigger fn + triggers on cdc_placements (coexist with the others)
-- ---------------------------------------------------------------------------
-- REALITY OVERRIDE (spec said "AFTER UPDATE OF status" only):
-- placement-service.createPlacement does a plain INSERT, and a row is BORN with
-- status='offered' (offered_at is NOT NULL). The 'accepted' transition goes
-- through updateStatus (an UPDATE), but the 'offered' event -- the highest-value
-- half of bug B -- happens at INSERT time and would NEVER fire under an
-- UPDATE-only trigger. So we register BOTH:
--   - AFTER INSERT  : catches the born-offered (and born-accepted, e.g. walk-in)
--   - AFTER UPDATE OF status (on real change): catches offered->accepted etc.
-- Both call the same emit fn; idempotency_key dedupes if both ever fire for the
-- same (placement, state). Both coexist with trg_cdc_multi_offer_cascade +
-- trg_cdc_placement_to_alumni (distinct trigger names).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_cdc_placement_notifications_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Fire only for the two high-value placement states. The emit fn is
  -- idempotent per (placement, state) so re-entry (INSERT then later UPDATE
  -- back to the same state) is safe.
  IF NEW.status::text IN ('offered', 'accepted') THEN
    PERFORM public.fn_cdc_emit_placement_notification(
      NEW.id,
      NEW.status::text,
      COALESCE(NEW.updated_by, NEW.created_by)
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cdc_placement_notifications ON public.cdc_placements;
DROP TRIGGER IF EXISTS trg_cdc_placement_notifications_ins ON public.cdc_placements;

-- Born-offered / born-accepted (createPlacement INSERT path).
CREATE TRIGGER trg_cdc_placement_notifications_ins
  AFTER INSERT ON public.cdc_placements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_placement_notifications_trg();

-- Status transitions (updateStatus UPDATE path); only on real change.
CREATE TRIGGER trg_cdc_placement_notifications
  AFTER UPDATE OF status ON public.cdc_placements
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_cdc_placement_notifications_trg();
