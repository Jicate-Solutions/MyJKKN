-- =============================================================================
-- CDC drive-state notifications — email channel (T1.2)
-- =============================================================================
-- A1 (PR #988) wired `notifications` in-app rows on cdc_drives status changes
-- via trigger trg_cdc_drive_notifications → fn_cdc_drive_notifications_trg() →
-- fn_cdc_emit_drive_notification(). Students check email first, so this
-- migration adds the email channel atomically alongside the in-app channel.
--
-- Approach
-- --------
-- 1. Add `idempotency_key` (nullable) to email_notifications + a unique partial
--    index. email_notifications was missing any idempotency mechanism — adding
--    one without breaking the 4 existing rows (BoS meeting emails).
-- 2. New helper fn_cdc_emit_drive_email_notification() — same recipient
--    resolution as A1's in-app function; INSERTs one email_notifications row
--    per recipient (fanout, unlike notifications which uses targeting.user_ids).
-- 3. Modify fn_cdc_drive_notifications_trg() to PERFORM BOTH side-effects in
--    the same transaction. Single trigger; atomic; matches A1's signature.
--
-- Negative permissions honoured
-- -----------------------------
-- - Do NOT touch fn_cdc_emit_drive_notification body (sibling only).
-- - Do NOT send emails — only enqueue rows; existing dispatcher delivers.
-- - Recipient logic mirrors A1 exactly so in-app + email reach same users.
-- - SMTP credentials untouched.
--
-- Reality-check
-- -------------
-- - email_notifications.recipient_email (varchar, NOT NULL) — fanout column.
-- - email_notifications.institutions_id (uuid, NOT NULL) — resolved from
--   cdc_drives.institutions[1] (first element of the ARRAY column).
-- - profiles.email + profiles.full_name supply recipient identity.
-- - No idempotency column existed; added one with partial unique index.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Idempotency column + partial unique index on email_notifications
-- -----------------------------------------------------------------------------
-- Nullable so the 4 existing rows (and any other non-CDC writer) are unaffected.
-- Partial unique index enforces "one email per (drive_id, to_state, recipient)"
-- only when idempotency_key is set.
ALTER TABLE public.email_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_notifications_idempotency_key
  ON public.email_notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 1b. Widen notification_type CHECK to allow CDC drive states
-- -----------------------------------------------------------------------------
-- email_notifications was built for BoS (syllabus_revised, syllabus_approved,
-- meeting_scheduled, course_ready_review). Add the 6 CDC drive state values
-- to the allowlist. Original 4 values preserved; existing rows unaffected.
ALTER TABLE public.email_notifications
  DROP CONSTRAINT IF EXISTS email_notifications_notification_type_check;

ALTER TABLE public.email_notifications
  ADD CONSTRAINT email_notifications_notification_type_check
  CHECK (notification_type::text = ANY (ARRAY[
    -- BoS (pre-existing)
    'syllabus_revised',
    'syllabus_approved',
    'meeting_scheduled',
    'course_ready_review',
    -- CDC drive states (T1.2)
    'cdc.drive.announced',
    'cdc.drive.willingness_open',
    'cdc.drive.eligibility_locked',
    'cdc.drive.results_announced',
    'cdc.drive.closed',
    'cdc.drive.cancelled'
  ]::text[]));

-- -----------------------------------------------------------------------------
-- 2. Sibling helper: fn_cdc_emit_drive_email_notification
-- -----------------------------------------------------------------------------
-- Mirrors fn_cdc_emit_drive_notification recipient resolution; fans out one
-- email_notifications row per recipient. Idempotent on (drive_id, to_state,
-- recipient_user_id) via idempotency_key.
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_email_notification(
  p_drive_id  uuid,
  p_from_state text,
  p_to_state  text,
  p_actor     uuid
)
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
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
    JOIN public.cdc_drive_eligibility e ON e.drive_id = p_drive_id
    WHERE lp.program_id = ANY(e.program_ids)
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

-- -----------------------------------------------------------------------------
-- 3. Modify trigger function to call BOTH in-app and email atomically.
-- -----------------------------------------------------------------------------
-- The in-app body is untouched (A1's fn_cdc_emit_drive_notification stays
-- exactly as shipped in PR #988). Only the trigger function itself is updated
-- to PERFORM both side-effects in the same statement.
CREATE OR REPLACE FUNCTION public.fn_cdc_drive_notifications_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.fn_cdc_emit_drive_notification(
      NEW.id,
      OLD.status::text,
      NEW.status::text,
      COALESCE(NEW.updated_by, NEW.created_by)
    );
    PERFORM public.fn_cdc_emit_drive_email_notification(
      NEW.id,
      OLD.status::text,
      NEW.status::text,
      COALESCE(NEW.updated_by, NEW.created_by)
    );
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
