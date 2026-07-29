-- Migration: capture live-DB-only Max-lane / AI-jobs changes into the repo
-- Date: 2026-07-12
-- Why: PR #1996 stripped BOTH access gates off the old unscoped chat path
--      (route wrapper + fn_max_chat_request's internal allowlist), enabling a
--      real cross-tenant PII pull by a non-super staffer. The breach was STOPPED
--      by re-inserting the seat-owner allowlist gate DIRECTLY on prod
--      (marker [breach-stop 2026-07-12]) plus three other emergency DB changes
--      that were NEVER captured in a repo migration. Repo `main` therefore still
--      ships the UNGATED fn_max_chat_request, so any DB rebuild / migration
--      re-apply would silently REOPEN the breach.
--
--      This migration makes the repo match live so a rebuild is safe. It is a
--      faithful, idempotent capture of the current prod definitions — applying
--      it on prod is a no-op (prod already in this state).
--
--      This does NOT perform the architectural cutover (route -> scoped ai_jobs
--      path, retire fn_max_chat_request). That follow-up PR is gated on the
--      chat-aware Windows drain + the interactive-claim gap; flipping the route
--      before those are ready would break live chat. See
--      supabase/migrations/20260712183000_ai_jobs_registry_queue.sql and the
--      route at app/api/ai-query/route.ts.

-- ---------------------------------------------------------------------------
-- 1) ai_job_types.daily_cap_per_user  (configurable per-person daily cap; NULL = unlimited)
--    Added live during the cutover build; NOT in #1998's migration.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_job_types
  ADD COLUMN IF NOT EXISTS daily_cap_per_user integer;

COMMENT ON COLUMN public.ai_job_types.daily_cap_per_user IS
  'Per-person daily job cap for this type, counted by IST day (NULL = unlimited). Editable from the AI Assistant config UI. Enforced in fn_ai_enqueue.';

-- ---------------------------------------------------------------------------
-- 2) fn_ai_enqueue  — live version, now enforcing daily_cap_per_user (IST day).
--    #1998 shipped this WITHOUT cap enforcement (the column did not exist yet).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_enqueue(p_job_type text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_type public.ai_job_types%ROWTYPE;
  v_ok boolean; v_id uuid; v_today_count int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;

  SELECT * INTO v_type FROM public.ai_job_types WHERE job_type = p_job_type AND enabled = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'unknown or disabled job_type'); END IF;

  IF v_type.allow_rule = 'seat_owner' THEN
    v_ok := EXISTS (SELECT 1 FROM public.ai_model_config
                     WHERE feature_key = 'ai_query.natural_language' AND is_active
                       AND COALESCE(config_json->'max_lane_user_ids','[]'::jsonb) ? v_uid::text);
  ELSIF v_type.allow_rule LIKE 'permission:%' THEN
    v_ok := public.user_has_permission(substring(v_type.allow_rule from 12));
  ELSE
    v_ok := true;
  END IF;
  IF NOT COALESCE(v_ok, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'not allowed for this job_type'); END IF;

  -- configurable per-person daily cap (IST day), editable from the config UI
  IF v_type.daily_cap_per_user IS NOT NULL THEN
    SELECT count(*) INTO v_today_count FROM public.ai_jobs
      WHERE requested_by = v_uid AND job_type = p_job_type AND status <> 'canceled'
        AND (requested_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
    IF v_today_count >= v_type.daily_cap_per_user THEN
      RETURN jsonb_build_object('ok', false, 'error', 'daily limit reached',
                                'cap', v_type.daily_cap_per_user, 'used', v_today_count);
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_jobs:' || v_uid::text || ':' || p_job_type));
  INSERT INTO public.ai_jobs (job_type, payload, requested_by, lane)
  SELECT p_job_type, COALESCE(p_payload,'{}'::jsonb), v_uid, v_type.lane
   WHERE (SELECT count(*) FROM public.ai_jobs
           WHERE requested_by = v_uid AND job_type = p_job_type
             AND status IN ('pending','claimed','running')) < v_type.max_inflight
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'too many in-flight jobs of this type'); END IF;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_enqueue(text, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_enqueue(text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) fn_ai_requeue_stale  — recovers jobs stranded by a crashed runner.
--    Service-role only. Built live during the cutover build; NOT in #1998.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_requeue_stale(p_timeout_seconds integer DEFAULT 300, p_max_attempts integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE v_requeued int; v_failed int;
BEGIN
  UPDATE public.ai_jobs SET status='error', error='stale: runner did not finish in time', completed_at=now()
   WHERE status IN ('claimed','running')
     AND claimed_at < now() - make_interval(secs => p_timeout_seconds)
     AND attempts >= p_max_attempts;
  GET DIAGNOSTICS v_failed = ROW_COUNT;

  UPDATE public.ai_jobs SET status='pending', claimed_by=NULL, claimed_at=NULL, attempts=attempts+1
   WHERE status IN ('claimed','running')
     AND claimed_at < now() - make_interval(secs => p_timeout_seconds)
     AND attempts < p_max_attempts;
  GET DIAGNOSTICS v_requeued = ROW_COUNT;

  RETURN jsonb_build_object('requeued', v_requeued, 'failed', v_failed);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_requeue_stale(integer, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_requeue_stale(integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) fn_max_chat_request  — THE BREACH-STOP. Restores the seat-owner allowlist
--    gate that #1996 removed. Repo `main` still ships the ungated version; this
--    is the durable fix. Director-only (max_lane_user_ids) until the scoped
--    ai_jobs path is the sole chat path, at which point this function is retired.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_max_chat_request(p_message text, p_conversation_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_message   text := btrim(COALESCE(p_message, ''));
  v_uid       uuid := auth.uid();
  v_heartbeat timestamptz;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- [breach-stop 2026-07-12] restore seat-owner allowlist gate (removed by #1996).
  -- Any authenticated user could otherwise queue chat and get UNSCOPED service-role
  -- answers via the old runner. Director-only until the scoped ai_jobs path is live.
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_model_config
     WHERE feature_key = 'ai_query.natural_language' AND is_active
       AND COALESCE(config_json->'max_lane_user_ids', '[]'::jsonb) ? v_uid::text
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not allowed');
  END IF;


  IF length(v_message) < 1 OR length(v_message) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid message');
  END IF;

  -- Runner liveness: the poller stamps maxlane:poller-heartbeat every ~2 min.
  -- A stale/missing pulse means nothing would claim the row — refuse WITHOUT
  -- inserting so the route can fail immediately, not after
  -- its 150s unclaimed deadline.
  SELECT last_fired_at INTO v_heartbeat
    FROM public.ai_routine_schedules
   WHERE routine_id = 'maxlane:poller-heartbeat';
  IF v_heartbeat IS NULL OR v_heartbeat < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'runner offline');
  END IF;

  -- Up to 3 live questions per requester.
  -- ATOMIC: the count gate lives inside the INSERT statement itself — a
  -- count-then-insert pair could let two concurrent submits both pass
  -- (deep-review finding #4). Serialized against same-user racers by a
  -- transaction-scoped advisory lock on the requester id.
  PERFORM pg_advisory_xact_lock(hashtext('max_lane_chat:' || v_uid::text));

  INSERT INTO public.max_lane_chat_requests (requested_by, conversation_id, message)
  SELECT v_uid, p_conversation_id, v_message
   WHERE (
     SELECT count(*) FROM public.max_lane_chat_requests
      WHERE requested_by = v_uid
        AND status IN ('pending', 'claimed')
   ) < 3
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue full');
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_max_chat_request(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_max_chat_request(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) ai_query.chat config drift — repo #1998 seeded allow_rule='seat_owner';
--    live was changed to 'permission:ai_query.view' + cap 50 during the build.
--    Kept enabled=false (deferred until the scoped drain + route cutover land).
-- ---------------------------------------------------------------------------
UPDATE public.ai_job_types
   SET allow_rule         = 'permission:ai_query.view',
       daily_cap_per_user = 50,
       enabled            = false,
       updated_at         = now()
 WHERE job_type = 'ai_query.chat';
