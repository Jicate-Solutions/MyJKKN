-- ============================================================================
-- Calendar-connect lock — close an over-broad grant (security fix)
-- ============================================================================
-- WHAT WAS WRONG
-- 20260901120000 shipped all three fn_calendar_lock_* functions as
-- SECURITY DEFINER, owned by postgres, GRANTed to `authenticated`, and with NO
-- authorization check inside any of them. The migration satisfied the standing
-- anon mandate (REVOKE ... FROM anon, PUBLIC) and then never asked the next
-- question: should a logged-in user be able to call this AT ALL?
--
-- With 7,317 profiles on the platform, that meant ANY signed-in account —
-- including every learner — could:
--   • fn_calendar_lock_set_enabled(true)   arm a platform-wide lockout of the
--                                          116 people holding a booking page;
--   • fn_calendar_lock_set_enabled(false)  disarm a lock an admin had set, AND
--                                          wipe every calendar_lock_warned_at,
--                                          resetting the 3-day grace silently;
--   • fn_calendar_lock_record_failure(uuid) take an ARBITRARY profile id with no
--                                          ownership check — three calls stamp
--                                          calendar_lock_released_at, and the
--                                          sweep's scope requires that be NULL,
--                                          so any user could permanently exempt
--                                          any host from the lock.
--
-- None of those grants bought anything. fn_calendar_lock_set_enabled has NO
-- caller anywhere in the codebase; fn_calendar_lock_record_failure is called
-- only from app/api/integrations/google-calendar/callback/route.ts on a
-- SERVICE-ROLE client; fn_calendar_lock_sweep is called only by the hourly cron,
-- also service-role. service_role holds EXECUTE independently of the
-- `authenticated` grant (verified live), so revoking it breaks no caller.
--
-- WHY CI DID NOT CATCH IT
-- check-secdef-anon-revoke.mjs asserts only that `anon` is locked out. It has no
-- opinion on an over-broad `authenticated` grant, so the PR went green with all
-- gates passing. The gap was found by an independent review pass, not by CI.
--
-- HOUSE PATTERN
-- fn_scf_set_gate_mode — the closest analogue, also a break-glass control —
-- opens with an explicit super-admin refusal. fn_calendar_lock_set_enabled now
-- matches it. The guard is written to still permit a TRUSTED context (postgres /
-- service_role, where auth.uid() is NULL) so the documented
-- `select fn_calendar_lock_set_enabled(true);` operator path keeps working;
-- the check bites exactly when there IS a logged-in user and they are not a
-- super admin.
-- ============================================================================

-- ── 1. The switch: refuse a non-super-admin caller ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_calendar_lock_set_enabled(p_enabled boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared integer := 0;
BEGIN
  -- auth.uid() IS NULL means postgres / service_role — an operator or the cron,
  -- both of which already hold the keys. A logged-in caller must be a super
  -- admin. Same shape as fn_scf_set_gate_mode.
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'fn_calendar_lock_set_enabled: super-admin only (break-glass control)';
  END IF;

  UPDATE public.platform_policies
     SET value = to_jsonb(p_enabled), updated_at = now(), updated_by = auth.uid()
   WHERE policy_key = 'meetings.calendar_lock.enabled';

  IF p_enabled THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles
     SET calendar_lock_active = false,
         calendar_lock_warned_at = NULL
   WHERE calendar_lock_active OR calendar_lock_warned_at IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN v_cleared;
END;
$$;

-- ── 2. Drop the grants that bought nothing ─────────────────────────────────
-- service_role keeps EXECUTE independently, so the cron and the OAuth callback
-- are unaffected. anon was already revoked in 20260901120000; repeated here so
-- this file states the whole intended end-state rather than a diff.
REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_set_enabled(boolean)  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_record_failure(uuid)  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_calendar_lock_sweep()               FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.fn_calendar_lock_set_enabled(boolean) IS
  'Break-glass master switch for the calendar-connect lock. Super-admin only when called by a logged-in user; callable by postgres/service_role for the documented operator path. EXECUTE is revoked from anon and authenticated — do not re-grant without an authorization check inside.';
COMMENT ON FUNCTION public.fn_calendar_lock_record_failure(uuid) IS
  'Counts a failed Google connect and auto-releases at the ceiling. Takes an arbitrary profile id, so it is service-role only — the OAuth callback is its only caller. Never grant to authenticated.';
COMMENT ON FUNCTION public.fn_calendar_lock_sweep() IS
  'Warn → lock → release state machine, called hourly by /api/cron/meeting-trigger-reconcile on a service-role client. Never grant to authenticated: it decides who loses access to the platform.';
