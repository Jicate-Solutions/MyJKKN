-- Tell the learner when the CDC reopens their declined answer.
--
-- RULING C (Director, 2026-09-18) — "tell the learner."
--
-- THE GAP. Ruling B let any CDC team member reopen ONE learner's declined
-- answer, up to and including the drive day. The learner was told NOTHING. The
-- page that would show them the reopening is /cdc/drives/<id>/willingness — a
-- page they have already answered and have no reason to open again. A grant
-- nobody knows about is the same as no grant, and this one expires at the end of
-- the drive day, so "they might notice eventually" is not good enough.
--
-- WHY THIS RIDES THE EXISTING MECHANISM. `fn_cdc_emit_drive_notification`
-- (20260519T0444Z) and `fn_cdc_emit_drive_details_notification` +
-- `trg_cdc_drive_details_notifications` (20260912200000) are how a CDC drive
-- already speaks to a learner: a SECURITY DEFINER emitter that writes one
-- `public.notifications` row, called from an AFTER UPDATE trigger on the table
-- whose change IS the news. This is the same shape, on the table whose change is
-- the news here (`cdc_drive_willingness`). No second mechanism, no new table, no
-- outbox, and nothing for the API route to remember to call — the notification
-- is written in the SAME TRANSACTION as the reopening, so it cannot be emitted
-- for a reopening that rolled back, and a reopening that committed cannot fail
-- to emit it.
--
-- WHAT COUNTS AS A REOPENING. Exactly what `isReopenedForLearner` reads back in
-- lib/services/cdc/willingness-service.ts: the row is still `withdrawn`, and the
-- LAST entry in its `willingness_audit` jsonb carries `via = 'cdc-reopen'`. The
-- learner's own next answer appends a `via = 'learner-ui'` entry after it, which
-- both consumes the grant and stops this trigger firing again. The `via` value
-- is duplicated here from REOPEN_AUDIT_VIA in that module; the two must agree,
-- and __tests__/cdc/willingness-clash-and-reopen.test.ts pins the TypeScript half.
--
-- URL. `/cdc/drives/<drive_id>/willingness`, the LEARNER's own page — never
-- `/cdc/drives/<drive_id>`, which is the coordinator surface gated on
-- `cdc.drives.view`, a permission learners do not hold. This is the same rule
-- 20260914210000 applied to the other CDC drive notifications.
--
-- EXPIRY. `expires_at` is midnight Asia/Kolkata at the START of the day AFTER
-- the drive date — the exact moment `driveDayNotPassed` stops returning true, so
-- the notification dies precisely when the thing it invites the learner to do
-- becomes impossible. A drive with no date has no expiry, matching that function
-- treating an undated drive as one that has not happened.
--
-- TONE. It says what happened, what they may do, and that doing nothing is a
-- complete answer. A learner who declined for a good reason should not read this
-- as pressure.
--
-- IDEMPOTENCY. Keyed on the willingness row plus the moment of the reopening, so
-- one UPDATE can only ever write one. And the trigger speaks only on the
-- TRANSITION into "reopened": an UPDATE whose OLD row already ended in a
-- standing CDC reopening is not news, so a second Reopen press (which the
-- service now refuses anyway) could never send the learner the same message
-- twice even if it got through (review repair, 2026-09-24).
--
-- WHO MAY SPEAK FOR THE CDC (review repair, 2026-09-24). `willingness_audit` is
-- on the learner's own row, and the learner's RLS lets them write that row. A
-- learner could therefore append a {via:'cdc-reopen', actor:<anyone>} entry
-- themselves through PostgREST. The trigger does not treat such an entry as a
-- CDC reopening: when the writing session's role is `authenticated` or `anon`
-- (the learner's own client) it neither notifies nor takes the `actor` uuid
-- from that learner-writable JSON as notifications.created_by. The CDC path
-- writes through the service role (app/api/cdc/drives/[id]/responses, POST).
-- `current_setting('role')` is used, not `current_user`: inside a SECURITY
-- DEFINER function `current_user` is always the owner, while the `role`
-- setting still names the caller's role.
--
-- DRIVE STATUS. A cancelled or closed drive gets no reopen message — the same
-- REOPEN_REFUSING_DRIVE_STATUSES rule the service applies before writing.
--
-- NUMBERING. Renumbered from 20260918193000 to sit past every migration on main
-- at the time of the repair (highest was 20270210090000).
--
-- FILE ONLY / NOT APPLIED — the operator applies it at merge.

-- ---------------------------------------------------------------------------
-- Emitter. Internal: granted no wider than the CDC emitters it sits beside —
-- postgres + service_role, never authenticated, never anon.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_willingness_reopen_notification(
  p_willingness_id uuid,
  p_actor          uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_drive_id    uuid;
  v_learner_id  uuid;
  v_updated_at  timestamptz;
  v_drive_title text;
  v_drive_date  date;
  v_drive_status text;
  v_user_id     uuid;
  v_actor       uuid;
  v_body        text;
  v_expires_at  timestamptz;
BEGIN
  SELECT w.drive_id, w.learner_id, w.updated_at
    INTO v_drive_id, v_learner_id, v_updated_at
  FROM public.cdc_drive_willingness w
  WHERE w.id = p_willingness_id;

  IF v_drive_id IS NULL THEN
    RETURN;  -- row vanished mid-transaction
  END IF;

  SELECT d.title, d.drive_date, d.status::text, COALESCE(p_actor, d.created_by)
    INTO v_drive_title, v_drive_date, v_drive_status, v_actor
  FROM public.cdc_drives d
  WHERE d.id = v_drive_id;

  -- Drive gone, or no identifiable actor and notifications.created_by is
  -- NOT NULL. Either way there is nothing that can be written.
  IF v_drive_title IS NULL OR v_actor IS NULL THEN
    RETURN;
  END IF;

  -- A cancelled or closed drive cannot be reopened (REOPEN_REFUSING_DRIVE_STATUSES
  -- in willingness-service.ts); never invite a learner to answer one.
  IF v_drive_status IN ('cancelled', 'closed') THEN
    RETURN;
  END IF;

  -- The one learner this concerns. A learner with no profile row cannot be
  -- notified — targeting is by profiles.id — and that is not an error here.
  SELECT p.id INTO v_user_id
  FROM public.profiles p
  WHERE p.learner_id = v_learner_id
  ORDER BY p.id
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Midnight IST at the start of the day after the drive: the moment the
  -- reopening stops being usable. NULL date → no expiry, same as the rule.
  v_expires_at := CASE
    WHEN v_drive_date IS NULL THEN NULL
    ELSE ((v_drive_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  END;

  v_body := 'You declined "' || v_drive_title || '". The Career Development Centre '
         || 'has reopened your response, so you can change your answer if you want to.'
         || CASE
              WHEN v_drive_date IS NULL THEN ' You can answer until the drive day is over.'
              ELSE ' You can answer up to the end of ' || to_char(v_drive_date, 'DD Mon YYYY')
                   || ', the day of the drive.'
            END
         || ' If you are still not taking part, you do not need to do anything.';

  INSERT INTO public.notifications (
    title, body, url, created_by, targeting, priority, category, kind,
    metadata, expires_at, idempotency_key
  ) VALUES (
    'Your response has been reopened: ' || v_drive_title,
    v_body,
    '/cdc/drives/' || v_drive_id::text || '/willingness',
    v_actor,
    jsonb_build_object('user_ids', to_jsonb(ARRAY[v_user_id])),
    'normal',
    'cdc.drive.response_reopened',
    'work_item',
    jsonb_build_object(
      'drive_id',       v_drive_id,
      'willingness_id', p_willingness_id,
      'drive_date',     v_drive_date,
      'reopened_by',    v_actor
    ),
    v_expires_at,
    'cdc.willingness.' || p_willingness_id::text || '.reopened.'
      || to_char(COALESCE(v_updated_at, now()) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS')
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cdc_emit_willingness_reopen_notification(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_willingness_reopen_notification(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_emit_willingness_reopen_notification(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_emit_willingness_reopen_notification(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger function. The WHEN clause below is deliberately cheap and loose; the
-- real test — "is the LAST audit entry a CDC reopening" — is done here in
-- plpgsql, where the order of the checks is under our control. Putting a
-- jsonb_array_length() call in a trigger WHEN clause would depend on AND
-- short-circuiting that SQL does not promise, and would raise on a row whose
-- audit jsonb is not an array.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_willingness_reopen_notifications_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_audit     jsonb;
  v_last      jsonb;
  v_old_audit jsonb;
  v_old_last  jsonb;
  v_actor     uuid;
BEGIN
  -- The learner's own client (PostgREST as authenticated/anon) can write this
  -- row, including its audit. A reopen marker it wrote is not a CDC reopening:
  -- do not notify, and never lift `actor` out of learner-written JSON.
  IF COALESCE(current_setting('role', true), 'none') IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  v_audit := NEW.willingness_audit;

  IF v_audit IS NULL OR jsonb_typeof(v_audit) <> 'array' OR jsonb_array_length(v_audit) = 0 THEN
    RETURN NEW;
  END IF;

  v_last := v_audit -> (jsonb_array_length(v_audit) - 1);

  IF v_last IS NULL OR jsonb_typeof(v_last) <> 'object' THEN
    RETURN NEW;
  END IF;

  -- Must agree with REOPEN_AUDIT_VIA in lib/services/cdc/willingness-service.ts.
  IF (v_last ->> 'via') IS DISTINCT FROM 'cdc-reopen' THEN
    RETURN NEW;
  END IF;

  -- Only the transition INTO a standing reopening is news. If the OLD row was
  -- already a withdrawn answer whose last entry was a CDC reopening, the learner
  -- has already been told.
  v_old_audit := OLD.willingness_audit;
  IF OLD.status = 'withdrawn'
     AND v_old_audit IS NOT NULL
     AND jsonb_typeof(v_old_audit) = 'array'
     AND jsonb_array_length(v_old_audit) > 0 THEN
    v_old_last := v_old_audit -> (jsonb_array_length(v_old_audit) - 1);
    IF jsonb_typeof(v_old_last) = 'object'
       AND (v_old_last ->> 'via') IS NOT DISTINCT FROM 'cdc-reopen' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- The audit entry names who did it. A malformed or absent actor falls back to
  -- the drive's creator inside the emitter rather than failing the reopening.
  BEGIN
    v_actor := (v_last ->> 'actor')::uuid;
  EXCEPTION WHEN others THEN
    v_actor := NULL;
  END;

  PERFORM public.fn_cdc_emit_willingness_reopen_notification(NEW.id, v_actor);

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cdc_willingness_reopen_notifications_trg() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cdc_willingness_reopen_notifications_trg() FROM anon;
REVOKE ALL ON FUNCTION public.fn_cdc_willingness_reopen_notifications_trg() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cdc_willingness_reopen_notifications_trg() TO service_role;

DROP TRIGGER IF EXISTS trg_cdc_willingness_reopen_notifications ON public.cdc_drive_willingness;

CREATE TRIGGER trg_cdc_willingness_reopen_notifications
AFTER UPDATE OF willingness_audit
ON public.cdc_drive_willingness
FOR EACH ROW
WHEN (
  NEW.status = 'withdrawn'
  AND NEW.willingness_audit IS DISTINCT FROM OLD.willingness_audit
)
EXECUTE FUNCTION public.fn_cdc_willingness_reopen_notifications_trg();

COMMENT ON TRIGGER trg_cdc_willingness_reopen_notifications ON public.cdc_drive_willingness IS
  'Tells the learner when the CDC reopens their declined answer (Director ruling, '
  '2026-09-18). Fires in the same transaction as the reopening, so the grant and '
  'the message cannot come apart. Recognises a reopening exactly as '
  'isReopenedForLearner does: status still withdrawn, last willingness_audit '
  'entry via = ''cdc-reopen''. The learner''s own next answer appends a '
  '''learner-ui'' entry, which both consumes the grant and silences this trigger.';

COMMENT ON FUNCTION public.fn_cdc_emit_willingness_reopen_notification(uuid, uuid) IS
  'Writes the one notification a reopened learner gets. URL points at the '
  'learner''s own /cdc/drives/<id>/willingness page, never the coordinator page. '
  'expires_at is midnight Asia/Kolkata after the drive date — the moment the '
  'reopening itself stops being usable.';
