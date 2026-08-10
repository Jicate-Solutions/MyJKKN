-- =============================================================================
-- 20260808214500_lc_broadcast_approval.sql
-- Learners Council broadcast approval — Director decisions, 2026-08-08.
-- =============================================================================
-- The council's 4 elected office-bearers can now notify learners
-- (20260807010000). This adds the approval step the Director asked for:
--
--   • a message to the sender's OWN college goes out immediately;
--   • a message to ALL colleges (up to 4,934 learners) waits for ONE named
--     approver;
--   • if that approver does not respond within 24 hours the message is SENT
--     ANYWAY. The Director chose this on a question that named the
--     consequence explicitly: silence counts as a "yes". It is deliberate.
--   • a message that turns out wrong is corrected by sending a NEW message —
--     there is no recall, because people have already read the original.
--
-- WHY A HOLDING TABLE and not a "pending" notifications row: `notifications`
-- has 261,959 rows and ZERO with sent_at IS NULL — nothing in the read path
-- filters on sent_at, and delivery resolves purely from `targeting`. So a row
-- parked in `notifications` would reach learners immediately. A pending
-- broadcast therefore CANNOT live there; it becomes a notification only once
-- approved.
--
-- Config, not constants (an admin must be able to change these without DDL):
--   lc.broadcast.approver_user_id  — WHO approves (nullable until named)
--   lc.broadcast.auto_send_hours   — the 24h window
-- Status is a STATE MACHINE, not a domain value list, so it is a CHECK.
--
-- SAFETY: additive. One new table + 3 SECURITY DEFINER RPCs + 2 policy rows.
-- No change to `notifications`, to its RLS, or to any existing behaviour.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config rows. approver_user_id is NULL until the Director names someone;
--    while it is NULL, nothing can be approved by a human and every
--    all-college request falls through to the 24h auto-send.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('lc.broadcast.approver_user_id','global','null'::jsonb,'string',
   'profiles.id of the ONE person who approves Learners Council all-college broadcasts. Null = nobody is named, so all-college messages rely entirely on the auto-send window.',
   true, true, 'major','published','text','learners_council'),
  ('lc.broadcast.auto_send_hours','global','24'::jsonb,'number',
   'Hours an all-college Learners Council broadcast waits for approval before it is sent anyway. Silence counts as approval — set high to make that unlikely, or coordinate with the named approver.',
   true, true, 'major','published','number','learners_council')
) v(policy_key, scope_type, value, data_type, description,
    is_system, is_active, classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');

-- ---------------------------------------------------------------------------
-- 2) The holding table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lc_broadcast_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text NOT NULL,
  -- same shape `notifications.targeting` uses, so approval hands it straight over
  targeting       jsonb NOT NULL,
  reach           text NOT NULL CHECK (reach IN ('own_college','all_colleges')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled','auto_approved')),
  approver_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_note   text,
  auto_send_at    timestamptz NOT NULL,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lc_broadcast_requests IS
  'All-college Learners Council broadcasts awaiting approval. Own-college messages never appear here — they are sent immediately.';

CREATE INDEX IF NOT EXISTS idx_lc_broadcast_requests_pending
  ON public.lc_broadcast_requests (auto_send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lc_broadcast_requests_requester
  ON public.lc_broadcast_requests (requester_id, created_at DESC);

ALTER TABLE public.lc_broadcast_requests ENABLE ROW LEVEL SECURITY;

-- A new table inherits Supabase's default grants, so REVOKE first and then
-- grant deliberately — a bare GRANT after the fact is a no-op.
REVOKE ALL ON public.lc_broadcast_requests FROM anon, PUBLIC;
GRANT SELECT ON public.lc_broadcast_requests TO authenticated;

-- Read: your own requests, or you are the named approver, or an admin.
-- Writes go exclusively through the RPCs below — no INSERT/UPDATE policy.
DROP POLICY IF EXISTS lc_broadcast_requests_select ON public.lc_broadcast_requests;
CREATE POLICY lc_broadcast_requests_select ON public.lc_broadcast_requests
FOR SELECT USING (
  requester_id = (SELECT auth.uid())
  OR (SELECT is_super_admin()) OR (SELECT is_admin((SELECT auth.uid())))
  OR (SELECT auth.uid())::text = (
        SELECT trim(both '"' from value::text) FROM public.platform_policies
        WHERE policy_key='lc.broadcast.approver_user_id' AND scope_type='global')
);

-- ---------------------------------------------------------------------------
-- 3) Submit. Own-college sends immediately; all-college is held for approval.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lc_broadcast_submit(
  p_title text, p_body text, p_targeting jsonb, p_reach text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_hours numeric; v_req uuid; v_notif uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in.');
  END IF;
  IF NOT public.fn_is_lc_office_bearer(v_uid) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Only the council office-bearers can send messages to learners.');
  END IF;
  IF p_reach NOT IN ('own_college','all_colleges') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown reach.');
  END IF;
  -- The learners-only rule is enforced here too, not just at the RLS layer,
  -- so a rejected payload never even becomes a pending request.
  IF NOT public.fn_notification_targets_learners_only(p_targeting) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Council messages can only be sent to learners, and never to the schools.');
  END IF;

  IF p_reach = 'own_college' THEN
    INSERT INTO public.notifications (title, body, targeting, created_by, sent_at, category)
    VALUES (p_title, p_body, p_targeting, v_uid, now(), 'announcement')
    RETURNING id INTO v_notif;
    RETURN jsonb_build_object('ok', true, 'sent', true, 'notification_id', v_notif);
  END IF;

  SELECT COALESCE((value #>> '{}')::numeric, 24) INTO v_hours
    FROM public.platform_policies
   WHERE policy_key='lc.broadcast.auto_send_hours' AND scope_type='global';

  INSERT INTO public.lc_broadcast_requests
    (requester_id, title, body, targeting, reach, auto_send_at)
  VALUES (v_uid, p_title, p_body, p_targeting, p_reach,
          now() + make_interval(hours => COALESCE(v_hours, 24)::int))
  RETURNING id INTO v_req;

  RETURN jsonb_build_object('ok', true, 'sent', false, 'request_id', v_req,
    'auto_send_hours', COALESCE(v_hours, 24));
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lc_broadcast_submit(text, text, jsonb, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lc_broadcast_submit(text, text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Decide. Only the ONE named approver (or an admin) may approve or reject.
--    A rejection MUST carry a reason the requester can read (rule 27).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lc_broadcast_decide(
  p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_approver text; v_row public.lc_broadcast_requests; v_notif uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in.');
  END IF;

  SELECT trim(both '"' from value::text) INTO v_approver
    FROM public.platform_policies
   WHERE policy_key='lc.broadcast.approver_user_id' AND scope_type='global';

  IF NOT (v_uid::text = v_approver OR public.is_super_admin() OR public.is_admin(v_uid)) THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'Only the named approver can approve council messages.');
  END IF;

  SELECT * INTO v_row FROM public.lc_broadcast_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That request no longer exists.');
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false,
      'error', format('That request was already %s.', v_row.status));
  END IF;

  IF NOT p_approve THEN
    IF p_note IS NULL OR btrim(p_note) = '' THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'Please give a short reason so the sender knows what to change.');
    END IF;
    UPDATE public.lc_broadcast_requests
       SET status='rejected', approver_id=v_uid, decided_at=now(),
           decision_note=p_note, updated_at=now()
     WHERE id = p_request_id;
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  INSERT INTO public.notifications (title, body, targeting, created_by, sent_at, category)
  VALUES (v_row.title, v_row.body, v_row.targeting, v_row.requester_id, now(), 'announcement')
  RETURNING id INTO v_notif;

  UPDATE public.lc_broadcast_requests
     SET status='approved', approver_id=v_uid, decided_at=now(),
         decision_note=p_note, notification_id=v_notif, updated_at=now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'status', 'approved', 'notification_id', v_notif);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lc_broadcast_decide(uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lc_broadcast_decide(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Cancel — the sender may withdraw their own pending request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lc_broadcast_cancel(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_n int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You must be signed in.');
  END IF;
  UPDATE public.lc_broadcast_requests
     SET status='cancelled', decided_at=now(), updated_at=now()
   WHERE id = p_request_id AND requester_id = v_uid AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false,
      'error', 'That request is not yours, or it is no longer waiting.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lc_broadcast_cancel(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lc_broadcast_cancel(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Auto-send sweep. SYSTEM ONLY (service_role) — the cron calls this.
--    Silence counts as approval once auto_send_at passes: the Director's
--    explicit choice. Advisory-locked so two overlapping runs cannot
--    double-send, and it re-checks the learners-only rule at send time in
--    case the council roster changed while the request sat waiting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lc_broadcast_autosend()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_notif uuid; v_sent int := 0; v_skipped int := 0;
BEGIN
  IF NOT pg_try_advisory_lock(hashtext('fn_lc_broadcast_autosend')) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'another run holds the lock');
  END IF;

  FOR r IN
    SELECT * FROM public.lc_broadcast_requests
     WHERE status = 'pending' AND auto_send_at <= now()
     ORDER BY auto_send_at
     FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT public.fn_notification_targets_learners_only(r.targeting) THEN
      UPDATE public.lc_broadcast_requests
         SET status='rejected', decided_at=now(), updated_at=now(),
             decision_note='Not sent automatically: the audience is no longer learners-only.'
       WHERE id = r.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (title, body, targeting, created_by, sent_at, category)
    VALUES (r.title, r.body, r.targeting, r.requester_id, now(), 'announcement')
    RETURNING id INTO v_notif;

    UPDATE public.lc_broadcast_requests
       SET status='auto_approved', decided_at=now(), notification_id=v_notif,
           updated_at=now(),
           decision_note='Sent automatically — the approval window passed with no response.'
     WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  PERFORM pg_advisory_unlock(hashtext('fn_lc_broadcast_autosend'));
  RETURN jsonb_build_object('ok', true, 'auto_sent', v_sent, 'rejected', v_skipped);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_lc_broadcast_autosend() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_lc_broadcast_autosend() TO service_role;
