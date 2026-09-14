-- Tell a learner who said yes when the drive moves.
--
-- THE GAP. `trg_cdc_drive_notifications` is `AFTER UPDATE OF status`, so the
-- only thing that ever reaches a learner is a change of state. A coordinator who
-- moves the interview to a different day, or to a different building, changes no
-- state at all — the drive stays `willingness_open` — and the learner who already
-- declared finds out by turning up at the old place on the old day.
--
-- SCOPE, AND WHY IT IS THIS NARROW. Only the fields that decide WHEN and WHERE a
-- learner has to physically be:
--     when   drive_date, drive_start_time
--     where  venue_label, location_url, drive_mode
-- `drive_end_time` is deliberately NOT here: it changes how long the day runs,
-- not whether the learner turns up in the right place at the right time, and a
-- notification nobody needs makes the ones they do need easier to ignore.
-- Package, role title and the rest are likewise out. Widening this list is a
-- product decision about noise, not a technical one.
--
-- WHO. Exactly the learners who declared and have not withdrawn — the same
-- recipient set `attendance_day` and `results_announced` already use. A learner
-- who never answered, or who declined, is not waiting on this drive.
--
-- WHEN NOT TO SPEAK. Only while the learner is still expected to attend
-- (`willingness_open`, `eligibility_locked`, `attendance_day`). After results are
-- out, or once the drive is closed or cancelled, a venue correction is
-- bookkeeping — and cancellation has its own notification already.
--
-- IDEMPOTENCY. Keyed on the drive plus the moment of the change, not on the new
-- values: a drive that moves to Friday, back to Thursday, then to Friday again
-- has genuinely changed three times and the learner needs telling three times. A
-- value-based key would silently swallow the third. Re-saving the form with
-- nothing altered cannot reach the emitter at all — the trigger's WHEN clause
-- requires a real difference — so the looser key costs nothing.
--
-- URL. Points at the learner's own page, `/cdc/drives/<id>/willingness`, not at
-- `/cdc/drives/<id>`. The latter is the coordinator surface and is gated on
-- `cdc.drives.view`, which learners do not hold.

-- ---------------------------------------------------------------------------
-- Emitter. Internal: only the trigger below calls it, so it is granted no wider
-- than fn_cdc_emit_drive_notification (postgres + service_role, never
-- authenticated, never anon).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_details_notification(
  p_drive_id     uuid,
  p_actor        uuid,
  p_when_changed boolean,
  p_where_changed boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_drive_title text;
  v_updated_at  timestamptz;
  v_actor       uuid;
  v_user_ids    uuid[];
  v_what        text;
  v_title       text;
  v_body        text;
  v_idempotency text;
BEGIN
  SELECT title, updated_at, COALESCE(p_actor, created_by)
    INTO v_drive_title, v_updated_at, v_actor
  FROM public.cdc_drives
  WHERE id = p_drive_id;

  -- Drive vanished mid-transaction, or there is no identifiable actor and
  -- notifications.created_by is NOT NULL. Either way there is nothing to write.
  IF v_drive_title IS NULL OR v_actor IS NULL THEN
    RETURN;
  END IF;

  IF NOT (p_when_changed OR p_where_changed) THEN
    RETURN;
  END IF;

  -- The learners who are waiting on this drive.
  SELECT array_agg(DISTINCT p.id) INTO v_user_ids
  FROM public.cdc_drive_willingness w
  JOIN public.profiles p ON p.learner_id = w.learner_id
  WHERE w.drive_id = p_drive_id
    AND w.status IS DISTINCT FROM 'withdrawn'
    AND p.id IS NOT NULL;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    -- Nobody declared yet; the change is not news to anyone.
    RETURN;
  END IF;

  v_what := CASE
    WHEN p_when_changed AND p_where_changed THEN 'date and venue'
    WHEN p_when_changed                     THEN 'date'
    ELSE                                         'venue'
  END;

  v_title := 'Drive Details Changed: ' || v_drive_title;
  v_body  := 'The ' || v_what || ' for "' || v_drive_title || '" has changed. '
          || 'Open the drive page for the new details.';

  v_idempotency := 'cdc.drive.' || p_drive_id::text || '.details.'
    || to_char(COALESCE(v_updated_at, now()) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS');

  INSERT INTO public.notifications (
    title, body, url, created_by, targeting, priority, category, kind,
    metadata, idempotency_key
  ) VALUES (
    v_title,
    v_body,
    '/cdc/drives/' || p_drive_id::text || '/willingness',
    v_actor,
    jsonb_build_object('user_ids', to_jsonb(v_user_ids)),
    'normal',
    'cdc.drive.details_changed',
    'work_item',
    jsonb_build_object(
      'drive_id',        p_drive_id,
      'when_changed',    p_when_changed,
      'where_changed',   p_where_changed,
      'recipient_count', array_length(v_user_ids, 1)
    ),
    v_idempotency
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger function. Works out WHICH half moved so the learner is told, rather
-- than being sent to the page to spot the difference themselves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_drive_details_notifications_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_when  boolean;
  v_where boolean;
BEGIN
  v_when := (OLD.drive_date       IS DISTINCT FROM NEW.drive_date)
         OR (OLD.drive_start_time IS DISTINCT FROM NEW.drive_start_time);

  v_where := (OLD.venue_label  IS DISTINCT FROM NEW.venue_label)
          OR (OLD.location_url IS DISTINCT FROM NEW.location_url)
          OR (OLD.drive_mode   IS DISTINCT FROM NEW.drive_mode);

  IF v_when OR v_where THEN
    PERFORM public.fn_cdc_emit_drive_details_notification(
      NEW.id,
      COALESCE(NEW.updated_by, NEW.created_by),
      v_when,
      v_where
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cdc_drive_details_notifications_trg() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_drive_details_notifications_trg() FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_drive_details_notifications_trg() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_drive_details_notifications_trg() TO service_role;

DROP TRIGGER IF EXISTS trg_cdc_drive_details_notifications ON public.cdc_drives;

CREATE TRIGGER trg_cdc_drive_details_notifications
AFTER UPDATE OF drive_date, drive_start_time, venue_label, location_url, drive_mode
ON public.cdc_drives
FOR EACH ROW
WHEN (
  NEW.status IN ('willingness_open', 'eligibility_locked', 'attendance_day')
  AND (
       OLD.drive_date       IS DISTINCT FROM NEW.drive_date
    OR OLD.drive_start_time IS DISTINCT FROM NEW.drive_start_time
    OR OLD.venue_label      IS DISTINCT FROM NEW.venue_label
    OR OLD.location_url     IS DISTINCT FROM NEW.location_url
    OR OLD.drive_mode       IS DISTINCT FROM NEW.drive_mode
  )
)
EXECUTE FUNCTION public.fn_cdc_drive_details_notifications_trg();

COMMENT ON TRIGGER trg_cdc_drive_details_notifications ON public.cdc_drives IS
  'Notifies learners who declared willingness when the drive''s date or venue '
  'moves. trg_cdc_drive_notifications covers status changes only, which left a '
  'rescheduled drive reaching nobody. Behavioural proof: '
  '__tests__/cdc/drive-details-change-notification.test.ts';
