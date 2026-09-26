-- =====================================================================
-- 20270306090000_ai_chat_answerer_health.sql
-- AI Assistant: which computer is answering (Windows drain or Mac backup)
-- Created: 2026-09-23 — Lane F of the AI Assistant upgrade (Director ruling
-- 2026-09-23: "This Mac, free" answers when the Windows computer is down).
-- FILE ONLY — applied by the operator at merge time.
-- =====================================================================
--
-- The AI Assistant's questions (ai_jobs.job_type = 'ai_query.chat') are
-- answered by the Windows computer (the chat drain), which stamps
-- ai_routine_schedules.routine_id = 'maxlane:chat-drain' (last_fired_at) every
-- cycle and claims under runner names such as 'Biometric-chat-…'. A standby
-- answerer on the Director's Mac (launchd ai.jkkn.maxlane.chatstandby, live
-- since 2026-09-23) upserts 'maxlane:chat-standby-mac' with managed = false
-- and last_fired_at = now() every 60 s while it can answer (a direct
-- PostgREST upsert — NOT fn_ai_routine_record_fire, which never sets
-- last_fired_at and writes a run-log row on every call), and claims under
-- runner names starting 'mac-chat-standby-'. This migration makes that second
-- answerer visible and keeps its heartbeat from being mistaken for a routine.
--
-- A heartbeat alone is not trusted: 20260727010000 records 'maxlane:chat-drain'
-- frozen for 13 days while the drain was answering, and the Windows clock runs
-- ~47 s fast. So "serving" also counts claim evidence — a recent claimed_at on
-- an ai_query.chat job by that answerer's runners.
--
-- 1) fn_ai_chat_drain_health() — extended BACKWARD-COMPATIBLY.
--      online / last_seen        UNCHANGED: still the Windows heartbeat only.
--      standby_online            Mac heartbeat fresh (<3 min); NULL = never stamped.
--      standby_last_seen         Mac backup's last heartbeat; NULL = never.
--      last_claim                last ai_query.chat claim by a non-Mac runner.
--      standby_last_claim        last ai_query.chat claim by a Mac standby runner.
--      serving                   'windows'     — Windows heartbeat < 3 min OR it
--                                                claimed a question < 10 min ago
--                                'mac_standby' — Windows is not answering, the Mac
--                                                is (same two tests)
--                                'none'        — at least one heartbeat has stamped,
--                                                neither answerer is answering
--                                'unknown'     — NEITHER heartbeat has ever stamped
--                                                and no recent claim (banner inert)
--    Thresholds: the banner goes red on this 3-min / 10-min rule. The
--    super-admin PAGE (lib/services/platform/chat-answerer-health.ts, run by
--    the 15-min ai-tasks-sweep) waits for 15 min of silence AND a question
--    waiting unclaimed > 10 min, so a super-admin can see red before any page.
--
--    Same guards as 20260712230000 (the only prior definition on main):
--    super-admin only (RAISEs otherwise), STABLE, SECURITY DEFINER,
--    SET search_path = public, REVOKE from anon, PUBLIC. Signature and return
--    type (jsonb) are unchanged, so CREATE OR REPLACE is safe and the existing
--    callers (components/ai-query/DrainHealthBanner.tsx) keep working.
--
-- 2) Seed the Mac heartbeat row with managed = false — ONLY if it is missing.
--    ai_routine_schedules.managed DEFAULTS TO TRUE, and fn_ai_routine_claim_due
--    (the cloud dispatcher, every 15 min) sets last_fired_at = now() on every
--    enabled managed row whose slot comes round — a FALSE "the Mac is
--    answering" heartbeat. In production the Mac already created this row
--    itself with managed = false and re-asserts managed = false on every 60-s
--    upsert, so the seed is ON CONFLICT DO NOTHING: an existing row, and its
--    last_fired_at, are never touched. On a fresh database the seed creates the
--    row with managed = false and no heartbeat, so 'unknown' stays honest.
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
  v_win_claim  timestamptz;
  v_mac_claim  timestamptz;
  v_win_fresh  boolean;
  v_mac_fresh  boolean;
  v_win_up     boolean;
  v_mac_up     boolean;
  v_serving    text;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT last_fired_at INTO v_win
    FROM public.ai_routine_schedules WHERE routine_id = 'maxlane:chat-drain';
  SELECT last_fired_at INTO v_mac
    FROM public.ai_routine_schedules WHERE routine_id = 'maxlane:chat-standby-mac';

  -- Claim evidence: who last picked up an assistant question.
  SELECT max(claimed_at) INTO v_win_claim
    FROM public.ai_jobs
   WHERE job_type = 'ai_query.chat'
     AND claimed_at IS NOT NULL
     AND claimed_by NOT LIKE 'mac-chat-standby-%';
  SELECT max(claimed_at) INTO v_mac_claim
    FROM public.ai_jobs
   WHERE job_type = 'ai_query.chat'
     AND claimed_at IS NOT NULL
     AND claimed_by LIKE 'mac-chat-standby-%';

  -- NULL when never stamped (or no row) — never coerced to false.
  v_win_fresh := CASE WHEN v_win IS NULL THEN NULL ELSE v_win > now() - interval '3 minutes' END;
  v_mac_fresh := CASE WHEN v_mac IS NULL THEN NULL ELSE v_mac > now() - interval '3 minutes' END;

  -- Answering = fresh heartbeat OR claimed a question in the last 10 minutes.
  v_win_up := v_win_fresh IS TRUE OR COALESCE(v_win_claim > now() - interval '10 minutes', false);
  v_mac_up := v_mac_fresh IS TRUE OR COALESCE(v_mac_claim > now() - interval '10 minutes', false);

  v_serving := CASE
    WHEN v_win_up                         THEN 'windows'
    WHEN v_mac_up                         THEN 'mac_standby'
    WHEN v_win IS NULL AND v_mac IS NULL  THEN 'unknown'
    ELSE                                       'none'
  END;

  RETURN jsonb_build_object(
    'online',             v_win_fresh,
    'last_seen',          v_win,
    'standby_online',     v_mac_fresh,
    'standby_last_seen',  v_mac,
    'last_claim',         v_win_claim,
    'standby_last_claim', v_mac_claim,
    'serving',            v_serving
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_chat_drain_health() TO authenticated, service_role;

-- 2) Mac heartbeat row: never dispatcher-managed; an existing row is untouched
INSERT INTO public.ai_routine_schedules (routine_id, managed)
VALUES ('maxlane:chat-standby-mac', false)
ON CONFLICT (routine_id) DO NOTHING;

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
