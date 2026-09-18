-- Tell a learner when a drive MOVES onto a day they are already booked.
--
-- RULING A, LATE HALF (Director, 2026-09-18). The learner-side warning in
-- lib/services/cdc/willingness-service.ts catches the clash a learner is about
-- to CREATE, at the moment they say yes. It cannot catch the clash a
-- COORDINATOR creates afterwards: a learner who said yes to two drives on two
-- different days, and then finds the second one moved onto the first, was never
-- told anything. The page they would have to reopen to notice is one they have
-- no reason to reopen.
--
-- WHY THIS FILE EXTENDS AN EXISTING PATH RATHER THAN STARTING A NEW ONE.
-- `trg_cdc_drive_details_notifications` (20260912200000) already fires on
-- drive_date / drive_start_time / venue / mode changes and already tells the
-- learners who said yes. The clash is a PROPERTY of that same move, so it is
-- emitted from the same trigger, in the same transaction, keyed on the same
-- moment. There is no second mechanism, no second trigger, and no second table.
--
-- WHY IT IS A SECOND NOTIFICATION AND NOT A LONGER SENTENCE.
-- `notifications` carries one body for one recipient array. The learners who now
-- have a clash are a SUBSET of the learners who were told the drive moved —
-- usually a small one. Putting "you may now be double-booked" in the body every
-- recipient reads would tell the majority something untrue. So the move
-- notification is unchanged, and the clashing subset gets one extra, higher
-- priority notification naming the drive they collide with.
--
-- WHO COUNTS AS CLASHING. A learner is warned when, after the move, they hold a
-- non-withdrawn answer on BOTH this drive and some other drive, and the two
-- drives share `drive_date`. Exactly the learner-side predicate
-- `findSameDayClashes` applies in TypeScript: same date, both answers still
-- standing, the drive is not itself cancelled or closed, and a NULL date on
-- either side is not a clash because nobody knows when it is.
--
-- IT SPEAKS ONLY WHEN THE DAY MOVED. A venue correction cannot create a clash,
-- so `p_when_changed` gates the whole thing — the caller already works out which
-- half moved.
--
-- IDEMPOTENCY. Same shape as the move notification it rides with: keyed on the
-- drive plus the moment of the change, so a drive that moves onto a clashing day
-- three times warns three times, while one UPDATE cannot warn twice.
--
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.

-- ---------------------------------------------------------------------------
-- Emitter, extended. Internal: granted no wider than before — postgres +
-- service_role, never authenticated, never anon.
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
  v_drive_date  date;
  v_updated_at  timestamptz;
  v_actor       uuid;
  v_user_ids    uuid[];
  v_clash_ids   uuid[];
  v_clash_names text;
  v_what        text;
  v_title       text;
  v_body        text;
  v_idempotency text;
BEGIN
  SELECT title, drive_date, updated_at, COALESCE(p_actor, created_by)
    INTO v_drive_title, v_drive_date, v_updated_at, v_actor
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

  -- -------------------------------------------------------------------------
  -- Ruling A, late half: did the move land this drive on a day the learner is
  -- already booked? Only the day moving can create that, and only a drive with
  -- a known date can collide with anything.
  -- -------------------------------------------------------------------------
  IF NOT p_when_changed OR v_drive_date IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT p.id) INTO v_clash_ids
  FROM public.cdc_drive_willingness w
  JOIN public.profiles p ON p.learner_id = w.learner_id
  JOIN public.cdc_drive_willingness other
    ON other.learner_id = w.learner_id
   AND other.drive_id <> p_drive_id
   AND other.status IS DISTINCT FROM 'withdrawn'
   AND other.status IS DISTINCT FROM 'no_show'
  JOIN public.cdc_drives od
    ON od.id = other.drive_id
   AND od.drive_date = v_drive_date
   AND od.status NOT IN ('cancelled', 'closed')
  WHERE w.drive_id = p_drive_id
    AND w.status IS DISTINCT FROM 'withdrawn'
    AND w.status IS DISTINCT FROM 'no_show'
    AND p.id IS NOT NULL;

  IF v_clash_ids IS NULL OR array_length(v_clash_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Name the drives they collide with, so the notification is actionable
  -- without opening anything. Distinct titles only, at most three — a
  -- notification body is not a list view.
  SELECT string_agg(t.title, ', ' ORDER BY t.title)
    INTO v_clash_names
  FROM (
    SELECT DISTINCT od.title
    FROM public.cdc_drives od
    WHERE od.id <> p_drive_id
      AND od.drive_date = v_drive_date
      AND od.status NOT IN ('cancelled', 'closed')
      AND EXISTS (
        SELECT 1
        FROM public.cdc_drive_willingness ow
        JOIN public.profiles op ON op.learner_id = ow.learner_id
        WHERE ow.drive_id = od.id
          AND ow.status IS DISTINCT FROM 'withdrawn'
          AND ow.status IS DISTINCT FROM 'no_show'
          AND op.id = ANY (v_clash_ids)
      )
    ORDER BY od.title
    LIMIT 3
  ) t;

  INSERT INTO public.notifications (
    title, body, url, created_by, targeting, priority, category, kind,
    metadata, idempotency_key
  ) VALUES (
    'Two drives on the same day: ' || v_drive_title,
    '"' || v_drive_title || '" has moved to ' || to_char(v_drive_date, 'DD Mon YYYY')
      || ', the same day as '
      || COALESCE(v_clash_names, 'another drive you said yes to')
      || '. You said yes to both. Check the timings and tell the Career Development Centre '
      || 'if you need to change one of your answers.',
    '/cdc/drives/' || p_drive_id::text || '/willingness',
    v_actor,
    jsonb_build_object('user_ids', to_jsonb(v_clash_ids)),
    'high',
    'cdc.drive.same_day_clash',
    'work_item',
    jsonb_build_object(
      'drive_id',        p_drive_id,
      'drive_date',      v_drive_date,
      'recipient_count', array_length(v_clash_ids, 1)
    ),
    'cdc.drive.' || p_drive_id::text || '.clash.'
      || to_char(COALESCE(v_updated_at, now()) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.fn_cdc_emit_drive_details_notification(uuid, uuid, boolean, boolean) IS
  'Notifies learners who said yes when a drive''s date or venue moves, and — when '
  'the DATE moved — additionally warns the subset who now hold a same-day answer '
  'on another drive (Director ruling, 2026-09-18). The learner-side half of that '
  'rule lives in findSameDayClashes, lib/services/cdc/willingness-service.ts.';
