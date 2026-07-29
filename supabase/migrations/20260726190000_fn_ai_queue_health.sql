-- ============================================================================
-- Updated: 2026-07-26 — fn_ai_queue_health(): one read for the AI job queue.
-- ============================================================================
-- WHY: every control surface we have is per-ROUTINE (run now, run on Max, cap,
-- schedule). Nothing shows the QUEUE as one thing. On 2026-07-26 a backfill put
-- ~900 jobs on the lane while the drain managed 14-56/hour and a third of
-- attempts died at exactly 120s — none of which was visible on any screen. Every
-- number in that diagnosis came from hand-written SQL. This RPC is that SQL,
-- made available to the admin UI.
--
-- Read-only and STABLE: it never mutates. The two actions the panel offers
-- (fn_ai_job_cancel, fn_ai_requeue_stale) already exist and are unchanged here.
--
-- Auth mirrors fn_ai_routine_schedules_list exactly: super_admin only, enforced
-- server-side, so the route can run under the caller's session.
-- ============================================================================

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
  -- COALESCE is load-bearing. With no session auth.uid() is NULL, the subquery
  -- returns NO ROWS, the scalar is NULL, and `IF NOT (NULL)` is NULL — which IF
  -- treats as false, so an unguarded version FALLS THROUGH and runs. Verified
  -- against this exact function in a rolled-back transaction on 2026-07-26: the
  -- uncoalesced form let an unauthenticated call succeed. NULL must mean deny.
  IF NOT COALESCE((SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
                   FROM public.profiles p WHERE p.id = auth.uid()), false) THEN
    RAISE EXCEPTION 'fn_ai_queue_health: not authorized';
  END IF;

  SELECT jsonb_build_object(
    'read_at', now(),

    -- Depth right now.
    'depth', (
      SELECT jsonb_build_object(
        'pending',   count(*) FILTER (WHERE status = 'pending'),
        'in_flight', count(*) FILTER (WHERE status IN ('claimed', 'running'))
      ) FROM public.ai_jobs
    ),

    -- Direction. Arrivals vs completions is the pair that makes a growing queue
    -- obvious; either number alone is misleading (an 18h "ETA" computed from
    -- depth/throughput alone is meaningless while work is still arriving).
    'last_hour', (
      SELECT jsonb_build_object(
        'arrived', count(*) FILTER (WHERE requested_at > now() - interval '1 hour'),
        'done',    count(*) FILTER (WHERE status = 'done'  AND completed_at > now() - interval '1 hour'),
        'errored', count(*) FILTER (WHERE status = 'error' AND completed_at > now() - interval '1 hour')
      ) FROM public.ai_jobs
    ),

    -- Who is draining. Liveness by real claims beats a heartbeat row, which can
    -- freeze while the lane runs (the defect behind the restart alert).
    'workers', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'runner', runner, 'last_claim', last_claim, 'mins_ago', mins_ago
             ) ORDER BY last_claim DESC), '[]'::jsonb)
      FROM (
        SELECT claimed_by AS runner,
               max(claimed_at) AS last_claim,
               (EXTRACT(EPOCH FROM (now() - max(claimed_at))) / 60)::int AS mins_ago
        FROM public.ai_jobs
        WHERE claimed_by IS NOT NULL AND claimed_at > now() - interval '24 hours'
        GROUP BY claimed_by
      ) w
    ),

    -- What the backlog is made of. A queue that is 96% one job type is a
    -- backfill (finite); a spread across types is real demand.
    'by_type', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'job_type', job_type, 'pending', n, 'oldest', oldest
             ) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT job_type, count(*) AS n, min(requested_at) AS oldest
        FROM public.ai_jobs WHERE status = 'pending'
        GROUP BY job_type ORDER BY count(*) DESC LIMIT 12
      ) t
    ),

    -- Claimed far longer than any real run: a dead worker, or a job past its
    -- CLI timeout. fn_ai_requeue_stale recovers these.
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

    -- Failure SHAPES, not a raw log. A uniform message repeated N times is the
    -- signal (19 identical ETIMEDOUTs is a config ceiling, not bad luck).
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

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- separately from PUBLIC, so the revoke must name anon explicitly.
REVOKE EXECUTE ON FUNCTION public.fn_ai_queue_health() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_queue_health() TO authenticated;

COMMENT ON FUNCTION public.fn_ai_queue_health() IS
  'Super-admin only. One read of AI job queue health: depth, arrival vs completion rate, worker liveness by real claims, backlog composition, stuck jobs, and failure shapes. Read-only; powers the Queue health card on /admin/ai-routines.';
