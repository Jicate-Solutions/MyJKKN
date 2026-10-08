-- 20271008150000_personal_key_meeting_booking.sql
--
-- A person can let ONE of their own personal keys (made on /ai-query/connect)
-- book meetings on their own calendar through the outside-AI door.
--
-- Why: the Director asked on 8 Oct 2026 for his Front desk assistant to book
-- meetings as him through MyJKKN, and chose this design over a server-side
-- shared secret (AskUserQuestion in the meetings tab, 8 Oct 2026 ~07:00 IST:
-- "Your personal key"). A key that books only on its OWNER's calendar, that the
-- owner switches on per key and can switch off or revoke himself, and whose
-- every call is audit-logged, instead of a secret that books as one hard-coded
-- person and that nobody can see or turn off from MyJKKN.
--
-- What this adds (ADD ONLY — nothing existing is altered):
--   1. ai_personal_key_booking_grants: one row per key the owner opted in.
--      RLS on, no table grants to anon/authenticated: read and written only
--      through the two functions below. Kept apart from api_keys so the
--      personal-key freeze trigger (20270301090000, section 4b) is untouched.
--   2. fn_ai_personal_key_set_booking(p_key_id, p_allow): the owner switches
--      booking on or off for one of THEIR OWN working personal keys. Switching
--      on needs meetings.view (the same gate as /meetings/schedule) or super
--      admin. Switching off always works.
--   3. fn_ai_personal_key_booking_ids(): the ids of the caller's own keys that
--      may book, for the Connect page's switch.
--
-- The door (lib/mcp/personal-door.ts) reads the grant with the service-role
-- client at key lookup, and books with HostSchedulingService.scheduleDirect for
-- host = the key's owner. It never takes a host from the caller.

CREATE TABLE IF NOT EXISTS public.ai_personal_key_booking_grants (
  key_id     uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_personal_key_booking_grants IS
  'Personal keys whose owner allowed them to book meetings on the owner''s own calendar through the outside-AI door. Written only by fn_ai_personal_key_set_booking.';

ALTER TABLE public.ai_personal_key_booking_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_personal_key_booking_grants FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ai_personal_key_booking_grants TO service_role;

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

  IF p_allow IS TRUE THEN
    IF NOT (public.is_super_admin() OR public.user_has_permission('meetings.view')) THEN
      RAISE EXCEPTION 'You need access to Meetings to let a key book meetings' USING ERRCODE = '42501';
    END IF;
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

CREATE OR REPLACE FUNCTION public.fn_ai_personal_key_booking_ids()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(g.key_id)
      FROM public.ai_personal_key_booking_grants g
      JOIN public.api_keys k ON k.id = g.key_id
     WHERE g.active
       AND k.key_kind = 'personal'
       AND k.user_id = auth.uid()
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_personal_key_booking_ids() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_personal_key_booking_ids() TO authenticated;

-- Apply-time assertions: the table is closed to clients, the functions are
-- closed to anon.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.ai_personal_key_booking_grants', 'SELECT')
     OR has_table_privilege('anon', 'public.ai_personal_key_booking_grants', 'SELECT') THEN
    RAISE EXCEPTION 'ai_personal_key_booking_grants must not be readable by clients';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ai_personal_key_set_booking(uuid, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_ai_personal_key_booking_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'personal key booking functions must not be callable by anon';
  END IF;
END $$;
