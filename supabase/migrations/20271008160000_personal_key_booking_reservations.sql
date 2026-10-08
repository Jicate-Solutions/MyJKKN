-- 20271008160000_personal_key_booking_reservations.sql
--
-- Follow-up to 20271008150000_personal_key_meeting_booking.sql (PR #4274).
-- #4274 merged on 8 Oct 2026 at its round-1 head (d32d82466c), before the
-- second deep review's fixes reached it. This file carries the database half of
-- those fixes as a NEW migration, so it is correct whichever of the two files
-- is applied first, and 20271008150000 is left exactly as merged.
--
--   1. ai_booking_reservations + fn_ai_booking_reserve / fn_ai_booking_release
--      (service role only). The door reserves a slot under a per-owner advisory
--      lock BEFORE it books, so parallel or retried calls cannot pass the
--      per-key and per-owner limits (round 2 HIGH). A slot is released only
--      when booking definitely wrote nothing.
--   2. fn_ai_personal_key_set_booking re-created with a per-owner advisory
--      lock, so two quick "on" clicks for two keys cannot race the
--      one-key-per-person index. Same signature, same grants; every other line
--      is identical to 20271008150000's body.
--
-- Depends on 20271008150000 (ai_personal_key_booking_grants). Refuses to run
-- without it.

DO $$
BEGIN
  IF to_regclass('public.ai_personal_key_booking_grants') IS NULL THEN
    RAISE EXCEPTION '20271008160000 needs 20271008150000 (ai_personal_key_booking_grants) applied first';
  END IF;
END $$;

-- ─── Booking reservations (deep review round 2, 8 Oct 2026) ───────────────
-- The door reserves a slot BEFORE it books, so N parallel or retried calls
-- cannot all pass the limits. fn_ai_booking_reserve takes a per-owner advisory
-- lock, counts the owner's live reservations, and inserts one only if the call
-- is within every limit, all in one transaction. A reservation is released
-- only when booking definitely wrote nothing (a validation error or a taken
-- slot); an unknown outcome (error, timeout) keeps it, so it still counts.
-- Service role only: the door calls it after the key and owner are verified.
CREATE TABLE IF NOT EXISTS public.ai_booking_reservations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id     uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitees   integer NOT NULL CHECK (invitees >= 1),
  released   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_booking_reservations IS
  'One row per schedule_meeting attempt through the outside-AI door, reserved before booking. Counts toward the per-key and per-owner limits unless released (booking definitely wrote nothing).';

CREATE INDEX IF NOT EXISTS idx_ai_booking_reservations_owner_time
  ON public.ai_booking_reservations (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_booking_reservations_key_time
  ON public.ai_booking_reservations (key_id, created_at DESC);

ALTER TABLE public.ai_booking_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_booking_reservations FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ai_booking_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ai_booking_reserve(
  p_key_id uuid,
  p_owner_id uuid,
  p_invitees integer,
  p_per_hour integer,
  p_per_day integer,
  p_invitees_per_day integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour     integer;
  v_day      integer;
  v_invited  integer;
  v_id       uuid;
BEGIN
  IF p_key_id IS NULL OR p_owner_id IS NULL OR coalesce(p_invitees, 0) < 1 THEN
    RAISE EXCEPTION 'reserve: key, owner and invitees are required' USING ERRCODE = '22023';
  END IF;

  -- Serialise every reservation for this owner (and so for each of their keys).
  PERFORM pg_advisory_xact_lock(hashtext('ai_booking_reserve:' || p_owner_id::text));

  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'),
         count(*)
    INTO v_hour, v_day
    FROM public.ai_booking_reservations
   WHERE key_id = p_key_id
     AND NOT released
     AND created_at > now() - interval '24 hours';

  IF v_hour >= p_per_hour THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'per_hour', 'limit', p_per_hour);
  END IF;
  IF v_day >= p_per_day THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'per_day', 'limit', p_per_day);
  END IF;

  SELECT coalesce(sum(invitees), 0)
    INTO v_invited
    FROM public.ai_booking_reservations
   WHERE owner_id = p_owner_id
     AND NOT released
     AND created_at > now() - interval '24 hours';

  IF v_invited + p_invitees > p_invitees_per_day THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitees_per_day', 'limit', p_invitees_per_day);
  END IF;

  INSERT INTO public.ai_booking_reservations (key_id, owner_id, invitees)
  VALUES (p_key_id, p_owner_id, p_invitees)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer) TO service_role;

-- Releases a reservation whose booking definitely wrote nothing.
CREATE OR REPLACE FUNCTION public.fn_ai_booking_release(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_booking_reservations
     SET released = true
   WHERE id = p_reservation_id
     AND NOT released;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_booking_release(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_ai_booking_release(uuid) TO service_role;

-- ci:allow-secdef-authenticated fn_ai_personal_key_set_booking / fn_ai_personal_key_booking_ids:
-- both act only on rows where api_keys.user_id = auth.uid() AND key_kind =
-- 'personal', so nobody reaches another person's key. Switching ON is gated on
-- meetings.view (or super admin); switching OFF must keep working after that
-- permission is taken away, so it is not gated.
CREATE OR REPLACE FUNCTION public.fn_ai_personal_key_set_booking(p_key_id uuid, p_allow boolean)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_ok    boolean;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT true INTO v_ok
    FROM public.api_keys k
   WHERE k.id = p_key_id
     AND k.key_kind = 'personal'
     AND k.user_id = v_owner
     AND (p_allow IS NOT TRUE OR (k.is_active IS TRUE AND k.expires_at > now()));
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Key not found' USING ERRCODE = 'P0002';
  END IF;

  -- One switch at a time per person, so two quick "on" clicks for two keys
  -- cannot race the one-key-per-person index.
  PERFORM pg_advisory_xact_lock(hashtext('ai_booking_grant:' || v_owner::text));

  IF p_allow IS TRUE THEN
    IF NOT (public.is_super_admin() OR public.user_has_permission('meetings.view')) THEN
      RAISE EXCEPTION 'You need access to Meetings to let a key book meetings' USING ERRCODE = '42501';
    END IF;
    -- Only one key per person may book: switch the others off first.
    UPDATE public.ai_personal_key_booking_grants
       SET active = false, updated_at = now()
     WHERE owner_id = v_owner
       AND key_id <> p_key_id
       AND active;
    INSERT INTO public.ai_personal_key_booking_grants (key_id, owner_id, active)
    VALUES (p_key_id, v_owner, true)
    ON CONFLICT (key_id) DO UPDATE SET active = true, updated_at = now();
  ELSE
    UPDATE public.ai_personal_key_booking_grants
       SET active = false, updated_at = now()
     WHERE key_id = p_key_id;
  END IF;

  RETURN jsonb_build_object('id', p_key_id, 'can_book_meetings', p_allow IS TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_personal_key_set_booking(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_personal_key_set_booking(uuid, boolean) TO authenticated;

-- Apply-time assertions: everything here is service role only, and the
-- re-created switch function keeps its grants.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.ai_booking_reservations', 'SELECT')
     OR has_table_privilege('anon', 'public.ai_booking_reservations', 'SELECT')
     OR has_function_privilege('authenticated', 'public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ai_booking_reserve(uuid, uuid, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ai_booking_release(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ai_booking_release(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'booking reservations must be service-role only';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ai_personal_key_set_booking(uuid, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_ai_personal_key_set_booking(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_ai_personal_key_set_booking grants are wrong';
  END IF;
END $$;
