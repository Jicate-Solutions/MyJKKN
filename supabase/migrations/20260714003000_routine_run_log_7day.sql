-- 20260714003000_routine_run_log_7day.sql
-- Purpose: give /admin/ai-routines a rolling 7-DAY run history (day-wise "what
-- happened"), replacing the single overwritten last_status snapshot.
-- Director request 2026-07-14: "we can have summary log for the past 7 days
-- alone so that is overwritten."
--
-- IMPORTANT context discovered before writing this (production survey 2026-07-14):
--   * public.ai_routine_run_log ALREADY EXISTS in prod (id/routine_id/fired_at/
--     status) and is ALREADY populated on every cloud-dispatcher fire — but NO
--     migration in the repo creates it, and the repo copy of
--     fn_ai_routine_record_fire does NOT contain the run-log INSERT while the LIVE
--     copy does. That is live-DB drift with no source counterpart: a future
--     re-apply of 20260701210000 would silently drop run-log capture. This
--     migration therefore CODIFIES the live table + writer so source == prod.
--   * The table had RLS enabled with ZERO policies (nothing could read it), and
--     the writer never pruned (unbounded growth). Both are fixed here.
--   * The Max lane updates ai_routine_schedules.last_fired_at DIRECTLY and does
--     NOT call fn_ai_routine_record_fire, so max-lane fires were never logged. A
--     trigger scoped to 'maxlane:%' rows ONLY captures those (and, being scoped,
--     never double-logs the cloud lane, which is captured via the writer).

-- 1) Canonical table (codifies the drifted prod table; idempotent). Adds `lane`.
CREATE TABLE IF NOT EXISTS public.ai_routine_run_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id text NOT NULL,
  lane       text NOT NULL DEFAULT 'cloud',   -- 'cloud' (dispatcher) | 'max' (Max lane)
  fired_at   timestamptz NOT NULL DEFAULT now(),
  status     text
);
-- the live table predates `lane`; add + backfill it
ALTER TABLE public.ai_routine_run_log ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'cloud';
UPDATE public.ai_routine_run_log
   SET lane = CASE WHEN routine_id LIKE 'maxlane:%' THEN 'max' ELSE 'cloud' END
 WHERE lane IS NULL OR lane = '' OR (routine_id LIKE 'maxlane:%' AND lane <> 'max');

CREATE INDEX IF NOT EXISTS idx_routine_run_log_routine_fired
  ON public.ai_routine_run_log (routine_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_run_log_fired
  ON public.ai_routine_run_log (fired_at);

-- 2) RLS: admin read only (table had RLS on, 0 policies → unreadable). Writes are
--    only ever via SECURITY DEFINER paths (the writer RPC + the maxlane trigger),
--    which bypass RLS, so no INSERT policy is needed.
ALTER TABLE public.ai_routine_run_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS run_log_admin_select ON public.ai_routine_run_log;
CREATE POLICY run_log_admin_select ON public.ai_routine_run_log
  FOR SELECT USING (is_super_admin() OR is_admin());
REVOKE ALL ON public.ai_routine_run_log FROM anon;

-- 3) Codify the LIVE cloud writer (drift fix) + add lane tag + 7-day retention.
--    Signature/security/grants match the live definition exactly; only the
--    best-effort logging sub-block gains a lane value and an inline prune.
CREATE OR REPLACE FUNCTION public.fn_ai_routine_record_fire(p_routine_id text, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_routine_schedules
     SET last_status = left(p_status, 200), updated_at = now()
   WHERE routine_id = p_routine_id;

  -- Append-only run log (cloud dispatcher lane). Best-effort: a logging failure
  -- must not fail the tick, so swallow any error from this sub-block only.
  BEGIN
    INSERT INTO public.ai_routine_run_log (routine_id, lane, status)
    VALUES (
      p_routine_id,
      CASE WHEN p_routine_id LIKE 'maxlane:%' THEN 'max' ELSE 'cloud' END,
      left(p_status, 200)
    );
    -- rolling 7-day retention, scoped to this routine (cheap, indexed)
    DELETE FROM public.ai_routine_run_log
     WHERE routine_id = p_routine_id
       AND fired_at < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- logging is best-effort; the dispatcher tick must not fail on it
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) TO service_role;

-- 4) Max-lane capture: the Max lane advances ai_routine_schedules.last_fired_at
--    directly and never calls the writer above, so log those fires here. Scoped
--    to 'maxlane:%' rows ONLY, so it can NEVER double-log the cloud lane.
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
  -- (chat-drain) or ~2 min (heartbeat), which would flood the log. Any future
  -- high-frequency Max-lane daemon must be added to this exclusion list.
  IF NEW.last_fired_at IS DISTINCT FROM OLD.last_fired_at
     AND NEW.last_fired_at IS NOT NULL
     AND NEW.routine_id NOT IN ('maxlane:poller-heartbeat', 'maxlane:chat-drain')
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

DROP TRIGGER IF EXISTS trg_log_maxlane_routine_run ON public.ai_routine_schedules;
CREATE TRIGGER trg_log_maxlane_routine_run
  AFTER UPDATE OF last_fired_at ON public.ai_routine_schedules
  FOR EACH ROW
  WHEN (NEW.routine_id LIKE 'maxlane:%')
  EXECUTE FUNCTION public.fn_log_maxlane_routine_run();

-- 5) Read RPC for the UI (super_admin/admin only): a routine's 7-day history
--    across BOTH lanes (base id + its 'maxlane:' twin), newest first.
CREATE OR REPLACE FUNCTION public.fn_ai_routine_run_history(p_routine_id text)
RETURNS TABLE (routine_id text, lane text, fired_at timestamptz, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT l.routine_id, l.lane, l.fired_at, l.status
      FROM public.ai_routine_run_log l
     WHERE l.routine_id IN (p_routine_id, 'maxlane:' || p_routine_id)
       AND l.fired_at >= now() - interval '7 days'
     ORDER BY l.fired_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_run_history(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_run_history(text) TO authenticated;
