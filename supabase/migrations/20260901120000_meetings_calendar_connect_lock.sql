-- ============================================================================
-- Calendar-connect lock — Director decision 2026-08-18
-- ============================================================================
-- WHY THIS EXISTS
-- 16 accountability review meetings could not be scheduled because the people in
-- them had never connected Google Calendar. A daily bell notification with a
-- connect link already fires (meeting-trigger-service.ts) and had been sent on
-- all 16 without effect, so the Director escalated: anyone who holds a booking
-- page must connect, or MyJKKN stops for them.
--
-- THE SHAPE OF THE DECISION (all four parts were chosen deliberately)
--   scope         every profile with a meeting_host_pages row  (116 people)
--   grace         warned for 3 days, THEN locked
--   escape        auto-release after 3 failed connect attempts
--   kill switch   a config row the Director flips himself
--
-- WHY A COLUMN ON profiles AND NOT A JOIN
-- proxy.ts already does `.from('profiles').select('*')` on EVERY authenticated
-- request. A boolean there is free; a second table would add a query to every
-- page load for all ~6,400 users to gate 116. `calendar_lock_active` is the ONLY
-- thing the request path reads — it is a cached verdict, not the rule.
--
-- WHY THE KILL SWITCH WRITES THE COLUMN
-- If the gate re-read the policy row per request that would be a second query
-- per request; if it only read it hourly, turning the lock OFF would take up to
-- an hour to reach people — useless in an incident. So flipping the policy OFF
-- clears every flag in the same transaction (fn_calendar_lock_set_enabled), and
-- the gate needs no policy read at all. Off means off, immediately.
-- ============================================================================

-- ── 1. The verdict the request path reads ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_lock_active     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_lock_warned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_lock_failures   smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calendar_lock_released_at timestamptz;

COMMENT ON COLUMN public.profiles.calendar_lock_active IS
  'Cached verdict read by proxy.ts on every request. true = this person is held on /auth/connect-calendar. Maintained by fn_calendar_lock_sweep; cleared instantly by fn_calendar_lock_set_enabled(false). Never set this by hand.';
COMMENT ON COLUMN public.profiles.calendar_lock_warned_at IS
  'When this person first entered the grace window. NULL = not yet warned. The lock lands grace_days after this stamp.';
COMMENT ON COLUMN public.profiles.calendar_lock_failures IS
  'Connect attempts that came back failed. At max_failures the sweep auto-releases them rather than stranding someone behind a broken OAuth flow.';
COMMENT ON COLUMN public.profiles.calendar_lock_released_at IS
  'Set when the escape hatch fired. A released person is never re-locked by the sweep; clearing this column is a deliberate admin act.';

-- Partial index: the sweep and any audit only ever care about the locked few.
CREATE INDEX IF NOT EXISTS idx_profiles_calendar_lock_active
  ON public.profiles (id) WHERE calendar_lock_active;

-- ── 2. The policy rows — the Director's own switches ───────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, description, data_type, is_system, is_active, classification, publication_state)
VALUES
  ('meetings.calendar_lock.enabled', 'global', 'false'::jsonb,
   'Master switch for the calendar-connect lock. Ships OFF. Turning it ON starts the 3-day grace for everyone holding a booking page; turning it OFF clears every lock instantly (fn_calendar_lock_set_enabled).',
   'boolean', false, true, 'major', 'published'),
  ('meetings.calendar_lock.grace_days', 'global', '3'::jsonb,
   'Days a person is warned before the lock lands. 0 would lock on the next page load with no warning.',
   'number', false, true, 'major', 'published'),
  ('meetings.calendar_lock.max_failures', 'global', '3'::jsonb,
   'Failed connect attempts after which a person is auto-released, so a broken Google flow can never permanently shut someone out of MyJKKN.',
   'number', false, true, 'major', 'published')
-- NOT `ON CONFLICT (policy_key)`: the unique index on this table is an
-- EXPRESSION index — uq_platform_policies_key_scope on
-- (policy_key, scope_type, COALESCE(scope_id, '000…'::uuid)) — so a bare
-- policy_key inference raises 42P10 and takes the whole migration down with it.
-- A TARGETLESS `ON CONFLICT DO NOTHING` is idempotent against whatever unique
-- index actually fires, without this migration having to restate that index's
-- exact expression — which is the thing that would rot if the index changed.
ON CONFLICT DO NOTHING;

-- ── 3. The kill switch ─────────────────────────────────────────────────────
-- Flipping OFF must take effect on the NEXT request, not the next cron tick.
CREATE OR REPLACE FUNCTION public.fn_calendar_lock_set_enabled(p_enabled boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared integer := 0;
BEGIN
  UPDATE public.platform_policies
     SET value = to_jsonb(p_enabled), updated_at = now(), updated_by = auth.uid()
   WHERE policy_key = 'meetings.calendar_lock.enabled';

  IF p_enabled THEN
    RETURN 0;  -- the sweep decides who gets warned; never lock on the way in
  END IF;

  -- OFF: everyone is released THIS instant, and the grace clocks are wound back
  -- so a later re-enable starts a fresh 3 days rather than locking instantly.
  UPDATE public.profiles
     SET calendar_lock_active = false,
         calendar_lock_warned_at = NULL
   WHERE calendar_lock_active OR calendar_lock_warned_at IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN v_cleared;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_set_enabled(boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_lock_set_enabled(boolean) TO authenticated;

-- ── 4. Record a failed connect attempt (the escape hatch's input) ──────────
CREATE OR REPLACE FUNCTION public.fn_calendar_lock_record_failure(p_profile uuid)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   integer;
  v_count smallint;
BEGIN
  SELECT COALESCE((value)::text::integer, 3) INTO v_max
    FROM public.platform_policies
   WHERE policy_key = 'meetings.calendar_lock.max_failures';

  UPDATE public.profiles
     SET calendar_lock_failures = calendar_lock_failures + 1
   WHERE id = p_profile
  RETURNING calendar_lock_failures INTO v_count;

  -- At the ceiling the door opens. A person who cannot connect because the flow
  -- itself is broken must never be left unable to work.
  IF v_count >= v_max THEN
    UPDATE public.profiles
       SET calendar_lock_active = false,
           calendar_lock_released_at = now()
     WHERE id = p_profile;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_record_failure(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_lock_record_failure(uuid) TO authenticated;

-- ── 5. The sweep — the whole state machine, in one place ───────────────────
-- Called by /api/cron/meeting-trigger-reconcile (already runs '23 * * * *', and
-- is already the code that nudges people about calendars — same concern, same
-- tick). Idempotent: safe to run every hour, or twice in one hour.
--
-- Deliberately NOT a trigger. Locking someone out is a scheduled, observable act
-- that an operator can watch land; a trigger would fire it from whatever random
-- write happened to touch profiles, at a time nobody chose.
CREATE OR REPLACE FUNCTION public.fn_calendar_lock_sweep()
RETURNS TABLE (warned integer, locked integer, cleared integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_grace   integer;
  v_warned  integer := 0;
  v_locked  integer := 0;
  v_cleared integer := 0;
BEGIN
  SELECT COALESCE((value)::text::boolean, false) INTO v_enabled
    FROM public.platform_policies WHERE policy_key = 'meetings.calendar_lock.enabled';
  SELECT COALESCE((value)::text::integer, 3) INTO v_grace
    FROM public.platform_policies WHERE policy_key = 'meetings.calendar_lock.grace_days';

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- WHO IS IN SCOPE: holds a booking page, has NO active Google connection, is a
  -- live account, and has not already been let out by the escape hatch.
  -- `is_active` matters: 15 of the 116 are already disabled accounts, and locking
  -- a disabled account is noise that would show up as "116 locked" while meaning
  -- nothing.
  CREATE TEMP TABLE _cl_scope ON COMMIT DROP AS
  SELECT p.id
    FROM public.profiles p
    JOIN public.meeting_host_pages hp ON hp.host_profile_id = p.id
   WHERE p.is_active IS NOT false
     AND p.calendar_lock_released_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_host_google_connections c
        WHERE c.host_profile_id = p.id AND c.status = 'active');

  -- (a) CONNECTED SINCE THE LAST SWEEP → release immediately. This runs before
  -- anything else so that connecting always beats the clock, even in the same tick.
  UPDATE public.profiles p
     SET calendar_lock_active = false, calendar_lock_warned_at = NULL
   WHERE (p.calendar_lock_active OR p.calendar_lock_warned_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM _cl_scope s WHERE s.id = p.id);
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- (b) START THE CLOCK for anyone newly in scope.
  UPDATE public.profiles p
     SET calendar_lock_warned_at = now()
    FROM _cl_scope s
   WHERE p.id = s.id AND p.calendar_lock_warned_at IS NULL;
  GET DIAGNOSTICS v_warned = ROW_COUNT;

  -- (c) LOCK anyone whose grace has run out.
  UPDATE public.profiles p
     SET calendar_lock_active = true
    FROM _cl_scope s
   WHERE p.id = s.id
     AND p.calendar_lock_active = false
     AND p.calendar_lock_warned_at IS NOT NULL
     AND p.calendar_lock_warned_at < now() - (v_grace || ' days')::interval;
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  RETURN QUERY SELECT v_warned, v_locked, v_cleared;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_sweep() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_calendar_lock_sweep() TO authenticated;

COMMENT ON FUNCTION public.fn_calendar_lock_sweep() IS
  'Warn → lock → release state machine for the calendar-connect lock. Idempotent; called hourly from /api/cron/meeting-trigger-reconcile. Connecting always beats the clock (step a runs first). Returns (warned, locked, cleared) so the cron response is auditable.';
