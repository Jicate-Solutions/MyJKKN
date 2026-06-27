-- 2026-06-22 — F2 UDYOG follow-up (BUG-004075, 4b): bell notification when a
-- UDYOG application requirement is raised for a learner.
--
-- Fires on EVERY new cdc_udyog_requirements row, so it covers both paths that
-- create a requirement: the auto-raise trigger on UNNATI enrollment
-- (fn_cdc_raise_udyog_on_unnati_enroll) AND a manual staff insert via /cdc/udyog.
-- ON CONFLICT DO NOTHING in the auto-raise path means re-enrollment never inserts
-- a duplicate row, so the learner is never double-notified for the same programme.
--
-- Canonical bell pattern (mirrors lib/services/cdc/idp-service.ts sendReminders and
-- fn_create_dashboard_work_item): ONE notifications row + ONE user_notifications
-- link per recipient. The bell reads `user_notifications !inner notifications`, so
-- the per-recipient link is what makes it appear.
--
-- Recipient resolution: the bell is keyed on profiles.id (auth id), but the
-- requirement carries learner_id (learners_profiles.id). Map via profiles.learner_id.
-- A learner with NO linked profile (never got an auth account) cannot receive an
-- in-app notification — the requirement is still tracked for staff reporting, and
-- the trigger simply skips them (no error).
--
-- created_by: system-generated with no human sender → set to the recipient's own
-- profile id, the established convention for system notifications
-- (fn_create_dashboard_work_item uses p_target_user as created_by).
--
-- url: deliberately NULL. The learner-facing "apply via UDYOG + record reference"
-- surface is an open Director decision (spec §7.4 / 4a) — no student-facing CDC
-- portal exists yet. Rather than deep-link to the staff-only /cdc/udyog page (which
-- the learner can't open) or a route that doesn't exist, the instruction lives in
-- the body. When 4a is decided, set url here in a one-line change.

CREATE OR REPLACE FUNCTION public.fn_cdc_notify_udyog_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_notif_id   uuid;
BEGIN
  -- Map learner -> profile (bell key). Skip silently if the learner has no auth account.
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE learner_id = NEW.learner_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (title, body, created_by, category, kind, url, targeting, metadata)
  VALUES (
    'Apply via the UDYOG portal',
    'You are enrolled in UNNATI and are required to submit an application via the UDYOG portal. '
      || 'Please complete your UDYOG application; the CDC team will record your reference number.',
    v_profile_id,                       -- system-generated → created_by = recipient
    'cdc.udyog.requirement',
    'work_item',
    NULL,                               -- learner surface pending Director decision (4a)
    jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(v_profile_id)),
    jsonb_build_object(
      'kind', 'cdc_udyog_requirement',
      'requirement_id', NEW.id,
      'source_programme_id', NEW.source_programme_id
    )
  )
  RETURNING id INTO v_notif_id;

  INSERT INTO public.user_notifications (notification_id, user_id)
  VALUES (v_notif_id, v_profile_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break requirement creation because of bell bookkeeping (mirrors the
  -- auto-raise trigger's defensive pattern). Notification delivery is best-effort.
  RETURN NEW;
END;
$$;

-- Trigger function is not RPC-callable (returns trigger), but revoke for defense-in-depth
-- per the standing rule on new SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.fn_cdc_notify_udyog_requirement() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_cdc_udyog_notify ON public.cdc_udyog_requirements;
CREATE TRIGGER trg_cdc_udyog_notify
  AFTER INSERT ON public.cdc_udyog_requirements
  FOR EACH ROW EXECUTE FUNCTION public.fn_cdc_notify_udyog_requirement();
