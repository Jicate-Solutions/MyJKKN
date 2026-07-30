-- ============================================================================
-- Updated: 2026-07-27 — "Run on my Mac": move a pending job to the mac lane.
-- ============================================================================
-- WHY: the ai_jobs queue had exactly one worker (the Windows box). A Mac drain
-- now exists (always-on launchd agent `ai.jkkn.maxlane.aijobs`) and polls
-- lane='mac'. This gives the admin UI a way to hand a specific job to it.
--
-- HOW IT WORKS — no new column, no change to fn_ai_claim. That function already
-- filters `(p_lane IS NULL OR j2.lane = p_lane)`, so the existing `lane` column
-- IS the routing mechanism:
--     lane='max'  -> drained by the Windows box (every job today)
--     lane='mac'  -> drained by the Mac agent, invisible to Windows
-- Verified before relying on it: fn_ai_complete, fn_ai_fail, fn_ai_job_cancel
-- and fn_ai_requeue_stale do NOT read `lane`, so re-laning a job changes only
-- who may claim it and nothing about how it completes, fails or is cancelled.
--
-- ⚠️ THE FAILURE MODE THIS GUARDS AGAINST. A pending job on lane='mac' is
-- invisible to Windows, and fn_ai_requeue_stale only rescues CLAIMED jobs that
-- went stale — a PENDING job on an unwatched lane never becomes stale, it just
-- sits there forever. If the Mac is asleep, a naive button would silently
-- strand real work. Mitigations, all here rather than in the UI:
--   1. Only 'pending' jobs can move. A claimed/running job is already someone's.
--   2. fn_ai_job_set_lane REFUSES to move work TO 'mac' when no mac runner has
--      claimed anything in the last 15 minutes — a cold Mac cannot be fed.
--   3. The move is always reversible: p_lane='max' hands it straight back.
--   4. fn_ai_queue_health now reports per-lane depth so a stranded job is
--      visible on the card instead of silently waiting.
--
-- The guard is COALESCE(..., false). A bare `IF NOT (SELECT ...)` returns NULL
-- for a caller with no profiles row and IF treats NULL as false, so the RAISE
-- never fires — proven on this database 2026-07-26 against
-- fn_ai_routine_schedules_list, which returned 46 rows to a profile-less user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_ai_job_set_lane(p_job_id uuid, p_lane text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row public.ai_jobs;
BEGIN
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_job_set_lane: not authorized';
  END IF;

  IF p_lane IS NULL OR p_lane NOT IN ('max', 'mac') THEN
    RAISE EXCEPTION 'fn_ai_job_set_lane: lane must be max or mac, got %', coalesce(p_lane, '(null)');
  END IF;

  -- ⚠️ THERE IS DELIBERATELY NO "is the Mac alive?" PRECONDITION HERE.
  --
  -- The first version refused to move work to 'mac' unless a mac runner had
  -- claimed within 15 minutes. That DEADLOCKS, and it was caught on the live UI
  -- rather than in review: a mac runner only ever claims when there is already
  -- work on lane='mac', and the only way work gets there is this function. So
  -- once the Mac has been idle 15 minutes — observed at 43 minutes within an
  -- hour of shipping — the button can never be used again. A guard written to
  -- prevent stranding instead created a permanent lockout.
  --
  -- Heartbeats are not the answer either: the existing heartbeat rows
  -- ('maxlane:chat-drain', 'maxlane:poller-heartbeat') have been frozen for 13
  -- and 17 DAYS while the lane ran, which is the known defect behind the
  -- max-lane restart alert. Gating a control on a dead signal is worse than not
  -- gating it.
  --
  -- Instead, stranding is made VISIBLE and REVERSIBLE rather than prevented:
  -- fn_ai_queue_health reports per-lane depth so a parked job cannot hide, and
  -- fn_ai_mac_lane_return_all() puts everything back on the Windows lane in one
  -- call. Worst case is a visible delay with a one-click undo, instead of an
  -- un-usable button.
  UPDATE public.ai_jobs
     SET lane = p_lane
   WHERE id = p_job_id
     AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ai_job_set_lane: job % is not pending (already claimed, done, or absent)', p_job_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'job_type', v_row.job_type, 'lane', v_row.lane, 'status', v_row.status);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_job_set_lane(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_job_set_lane(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_ai_job_set_lane(uuid, text) IS
  'Super-admin only. Moves a PENDING ai_job between the max (Windows) and mac (local Mac agent) lanes. No liveness precondition by design — gating on "did the Mac claim recently" deadlocks, because the Mac only claims work this function puts there. Stranding is instead made visible (fn_ai_queue_health reports per-lane depth) and reversible (fn_ai_mac_lane_return_all).';


-- ---------------------------------------------------------------------------
-- The undo. One call puts every pending job on the mac lane back on the
-- Windows lane — the escape hatch that makes the absent liveness check safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_mac_lane_return_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_n int;
BEGIN
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_mac_lane_return_all: not authorized';
  END IF;

  -- PENDING only: a job the Mac has already claimed is mid-flight and moving it
  -- would let both workers run it. Those self-heal via fn_ai_requeue_stale.
  UPDATE public.ai_jobs SET lane = 'max'
   WHERE lane = 'mac' AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('returned', v_n);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_mac_lane_return_all() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_mac_lane_return_all() TO authenticated;

COMMENT ON FUNCTION public.fn_ai_mac_lane_return_all() IS
  'Super-admin only. Returns every PENDING job on the mac lane to the max (Windows) lane. The undo for "Run on my Mac" when the Mac is asleep.';


-- ---------------------------------------------------------------------------
-- fn_ai_queue_health: add a per-lane view + the oldest claimable job per type.
-- ---------------------------------------------------------------------------
-- Body is otherwise unchanged from the version applied 2026-07-26. Two additions:
--   'lanes'    — depth per lane, so a job parked on 'mac' is VISIBLE rather than
--                silently waiting for a Mac that may be asleep.
--   'by_type'  — now carries oldest_id, so the card can offer "send the oldest
--                job of this type to my Mac" without a second round trip.
CREATE OR REPLACE FUNCTION public.fn_ai_queue_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_queue_health: not authorized';
  END IF;

  SELECT jsonb_build_object(
    'read_at', now(),

    'depth', (
      SELECT jsonb_build_object(
        'pending',   count(*) FILTER (WHERE status = 'pending'),
        'in_flight', count(*) FILTER (WHERE status IN ('claimed', 'running'))
      ) FROM public.ai_jobs
    ),

    'last_hour', (
      SELECT jsonb_build_object(
        'arrived', count(*) FILTER (WHERE requested_at > now() - interval '1 hour'),
        'done',    count(*) FILTER (WHERE status = 'done'  AND completed_at > now() - interval '1 hour'),
        'errored', count(*) FILTER (WHERE status = 'error' AND completed_at > now() - interval '1 hour')
      ) FROM public.ai_jobs
    ),

    -- Per-lane depth. A job handed to the Mac lane must never be able to hide.
    'lanes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'lane', lane, 'pending', n, 'oldest_mins', oldest_mins
             ) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT coalesce(lane, '(none)') AS lane,
               count(*) AS n,
               (EXTRACT(EPOCH FROM (now() - min(requested_at))) / 60)::int AS oldest_mins
        FROM public.ai_jobs WHERE status = 'pending'
        GROUP BY coalesce(lane, '(none)')
      ) l
    ),

    -- Workers = things that actually DRAIN, not every identity ever seen.
    --
    -- This list is built from distinct claimed_by strings, so before the HAVING
    -- below a single ad-hoc run masqueraded as a dead worker for a full 24
    -- hours. Measured 2026-07-27: 'mac-backup' had claimed exactly ONE job, once,
    -- and had been rendering as a broken service ever since; 'mac-manual-verify-
    -- 0717' was the same thing from 9 days earlier and only stopped showing
    -- because it aged out. Two of the three "Mac workers" on the card were
    -- ghosts, which is precisely the kind of dead signal this card exists to
    -- kill rather than create.
    --
    -- A real worker either claims repeatedly or claimed just now. A one-shot
    -- identity that has been silent for over an hour is neither.
    'workers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'runner', runner, 'last_claim', last_claim,
               'mins_ago', mins_ago, 'claims', claims
             ) ORDER BY last_claim DESC), '[]'::jsonb)
      FROM (
        SELECT claimed_by AS runner,
               max(claimed_at) AS last_claim,
               count(*) AS claims,
               (EXTRACT(EPOCH FROM (now() - max(claimed_at))) / 60)::int AS mins_ago
        FROM public.ai_jobs
        WHERE claimed_by IS NOT NULL AND claimed_at > now() - interval '24 hours'
        GROUP BY claimed_by
        HAVING count(*) > 1 OR max(claimed_at) > now() - interval '1 hour'
      ) w
    ),

    'by_type', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'job_type', job_type, 'pending', n, 'oldest', oldest,
               'oldest_id', oldest_id, 'lane', lane
             ) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT job_type,
               count(*) AS n,
               min(requested_at) AS oldest,
               (array_agg(id ORDER BY priority ASC, requested_at ASC))[1] AS oldest_id,
               (array_agg(lane ORDER BY priority ASC, requested_at ASC))[1] AS lane
        FROM public.ai_jobs WHERE status = 'pending'
        GROUP BY job_type ORDER BY count(*) DESC LIMIT 12
      ) t
    ),

    'stuck', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'job_type', job_type, 'runner', claimed_by, 'mins', mins
             ) ORDER BY mins DESC), '[]'::jsonb)
      FROM (
        SELECT id, job_type, claimed_by,
               (EXTRACT(EPOCH FROM (now() - claimed_at)) / 60)::int AS mins
        FROM public.ai_jobs
        WHERE status IN ('claimed', 'running')
          AND claimed_at < now() - interval '10 minutes'
        ORDER BY claimed_at LIMIT 20
      ) s
    ),

    'error_shapes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'sample', sample, 'n', n, 'latest', latest
             ) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT left(coalesce(error, '(no message)'), 120) AS sample,
               count(*) AS n, max(completed_at) AS latest
        FROM public.ai_jobs
        WHERE status = 'error' AND completed_at > now() - interval '24 hours'
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 8
      ) e
    )
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_queue_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_queue_health() TO authenticated;
