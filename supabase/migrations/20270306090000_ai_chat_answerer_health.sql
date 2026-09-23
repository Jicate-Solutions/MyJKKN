-- =====================================================================
-- 20270306090000_ai_chat_answerer_health.sql
-- AI Assistant: which computer is answering (Windows drain or Mac backup)
-- Created: 2026-09-23 — Lane F of the AI Assistant upgrade (Director ruling
-- 2026-09-23: "This Mac, free" answers when the Windows computer is down).
-- FILE ONLY — applied by the operator at merge time.
-- =====================================================================
--
-- The AI Assistant's questions are answered by ONE Windows computer (the chat
-- drain), which stamps ai_routine_schedules.routine_id = 'maxlane:chat-drain'
-- (last_fired_at = now()) every cycle. A standby answerer on the Director's Mac
-- stamps 'maxlane:chat-standby-mac' the same way. This migration makes that
-- second heartbeat visible and keeps it from being mistaken for a routine.
--
-- 1) fn_ai_chat_drain_health() — extended BACKWARD-COMPATIBLY.
--      online / last_seen        UNCHANGED: still the Windows drain only.
--      standby_online            Mac backup fresh (<3 min); NULL = never stamped.
--      standby_last_seen         Mac backup's last heartbeat; NULL = never.
--      serving                   'windows'     — the Windows drain is fresh
--                                'mac_standby' — Windows is not fresh, the Mac is
--                                'none'        — at least one has stamped, neither is fresh
--                                'unknown'     — NEITHER row has ever stamped
--                                                (the banner stays inert)
--    Same guards as 20260712230000 (the only prior definition on main):
--    super-admin only (RAISEs otherwise), STABLE, SECURITY DEFINER,
--    SET search_path = public, REVOKE from anon, PUBLIC. Signature and return
--    type (jsonb) are unchanged, so CREATE OR REPLACE is safe and the existing
--    callers (components/ai-query/DrainHealthBanner.tsx) keep working.
--
-- 2) Seed the Mac heartbeat row with managed = false.
--    ai_routine_schedules.managed DEFAULTS TO TRUE, and fn_ai_routine_claim_due
--    (the cloud dispatcher, every 15 min) sets last_fired_at = now() on every
--    enabled managed row whose slot comes round. If the Mac creates its own row
--    with the column defaults, the dispatcher would stamp it once a day at its
--    slot — a FALSE "the Mac is answering" heartbeat, and a fresh outage
--    identity for the alert. 20260710080000_maxlane_managed_guard.sql states
--    the invariant (maxlane:* rows are NEVER dispatcher-managed) but was a
--    one-time UPDATE, so it cannot cover a row created after it ran. last_fired_at
--    is NOT touched: a never-stamped row stays NULL, so 'unknown' stays honest.
--
-- 3) fn_log_maxlane_routine_run() — add 'maxlane:chat-standby-mac' to the
--    high-frequency exclusion list. The Mac stamps every cycle, like the chat
--    drain; without this every stamp writes (and prunes) an ai_routine_run_log
--    row. The 20260714003000 body says so itself: "Any future high-frequency
--    Max-lane daemon must be added to this exclusion list." Body is otherwise
--    VERBATIM from 20260714003000 (the only definition on main).
-- =====================================================================

-- 1) Health RPC -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_chat_drain_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_win        timestamptz;
  v_mac        timestamptz;
  v_win_fresh  boolean;
  v_mac_fresh  boolean;
  v_serving    text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT last_fired_at INTO v_win
    FROM public.ai_routine_schedules WHERE routine_id = 'maxlane:chat-drain';
  SELECT last_fired_at INTO v_mac
    FROM public.ai_routine_schedules WHERE routine_id = 'maxlane:chat-standby-mac';

  -- NULL when never stamped (or no row) — never coerced to false.
  v_win_fresh := CASE WHEN v_win IS NULL THEN NULL ELSE v_win > now() - interval '3 minutes' END;
  v_mac_fresh := CASE WHEN v_mac IS NULL THEN NULL ELSE v_mac > now() - interval '3 minutes' END;

  v_serving := CASE
    WHEN v_win_fresh IS TRUE              THEN 'windows'
    WHEN v_mac_fresh IS TRUE              THEN 'mac_standby'
    WHEN v_win IS NULL AND v_mac IS NULL  THEN 'unknown'
    ELSE                                       'none'
  END;

  RETURN jsonb_build_object(
    'online',            v_win_fresh,
    'last_seen',         v_win,
    'standby_online',    v_mac_fresh,
    'standby_last_seen', v_mac,
    'serving',           v_serving
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() TO authenticated, service_role;

-- 2) Mac heartbeat row: never dispatcher-managed ----------------------------
INSERT INTO public.ai_routine_schedules (routine_id, managed)
VALUES ('maxlane:chat-standby-mac', false)
ON CONFLICT (routine_id) DO UPDATE
   SET managed = false, updated_at = now()
 WHERE public.ai_routine_schedules.managed IS DISTINCT FROM false;

-- 3) Run-log trigger: skip the Mac heartbeat like the Windows one ------------
CREATE OR REPLACE FUNCTION public.fn_log_maxlane_routine_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip the continuous Max-lane infra pollers. These are NOT user-facing
  -- routines (absent from lib/ai-routines/registry, so /admin/ai-routines never
  -- lists or queries them) and they advance last_fired_at every few seconds
  -- (chat-drain, chat-standby-mac) or ~2 min (heartbeat), which would flood the
  -- log. Any future high-frequency Max-lane daemon must be added to this
  -- exclusion list.
  -- Updated: 2026-09-23 - added 'maxlane:chat-standby-mac' (the Mac backup answerer).
  IF NEW.last_fired_at IS DISTINCT FROM OLD.last_fired_at
     AND NEW.last_fired_at IS NOT NULL
     AND NEW.routine_id NOT IN ('maxlane:poller-heartbeat', 'maxlane:chat-drain', 'maxlane:chat-standby-mac')
  THEN
    INSERT INTO public.ai_routine_run_log (routine_id, lane, fired_at, status)
    VALUES (NEW.routine_id, 'max', NEW.last_fired_at, NEW.last_status);
    DELETE FROM public.ai_routine_run_log
     WHERE routine_id = NEW.routine_id
       AND fired_at < now() - interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_log_maxlane_routine_run() FROM anon, PUBLIC;

NOTIFY pgrst, 'reload schema';
