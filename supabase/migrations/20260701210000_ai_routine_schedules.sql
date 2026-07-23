-- =====================================================================
-- AI Routine Scheduler — editable schedules for MyJKKN AI routines
-- Migration: 2026-07-01
-- =====================================================================
-- Lets super_admin set, from /admin/ai-routines, WHEN each AI routine runs —
-- which days of the week and exact time (IST) — without a code change or
-- redeploy. A single dispatcher cron (/api/cron/ai-routine-dispatcher, every
-- 15 min) reads this table and fires whatever is due.
--
-- Director standing rule (config = a row + super-admin UI + reader fn): this is
-- the config table; the UI writes via fn_ai_routine_schedule_upsert; the reader
-- is fn_ai_routine_schedules_list; the dispatcher claims due rows via
-- fn_ai_routine_claim_due (service-role, atomic, idempotent).
--
-- Timezone: schedules are stored + edited in IST (Asia/Kolkata), the JKKN local
-- time the operator thinks in. The dispatcher converts now()->IST to compare.
-- Times land on 15-minute marks (the dispatcher tick granularity).
-- =====================================================================

-- ── TABLE ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_routine_schedules (
  routine_id      text PRIMARY KEY,                 -- matches lib/ai-routines registry id
  enabled         boolean  NOT NULL DEFAULT true,
  days_of_week    smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',  -- 0=Sun..6=Sat, IST
  minute_of_day   smallint NOT NULL DEFAULT 0,       -- 0..1439 (IST); rounded to /15 by the UI
  managed         boolean  NOT NULL DEFAULT true,     -- true = the dispatcher owns this routine's timing
  last_fired_slot text,                               -- idempotency: 'YYYY-MM-DD HH:MM' IST slot last fired
  last_fired_at   timestamptz,
  last_status     text,                               -- short result of the last dispatcher fire
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_routine_schedules_minute_chk CHECK (minute_of_day BETWEEN 0 AND 1439),
  CONSTRAINT ai_routine_schedules_dow_chk CHECK (
    days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  )
);

ALTER TABLE public.ai_routine_schedules ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: anon & authenticated get deny-all on direct access.
-- All reads/writes go through the SECURITY DEFINER RPCs below.
REVOKE ALL ON public.ai_routine_schedules FROM anon, authenticated;

COMMENT ON TABLE public.ai_routine_schedules IS
  'Editable day-of-week + time-of-day (IST) schedule per AI routine, owned by the '
  'ai-routine-dispatcher cron. Written by super_admin via fn_ai_routine_schedule_upsert; '
  'RLS-enabled with no policies (RPC-only access).';

-- ── helper: current IST timestamp (Asia/Kolkata) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ist_now()
RETURNS timestamp
LANGUAGE sql STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata'); $$;

-- ── RPC: super_admin gate helper (inline) ──────────────────────────────────────
-- (kept inline in each fn to avoid a cross-fn dependency)

-- ── RPC 1: list all schedules (super_admin read) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_routine_schedules_list()
RETURNS SETOF public.ai_routine_schedules
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
          FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RAISE EXCEPTION 'fn_ai_routine_schedules_list: not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.ai_routine_schedules ORDER BY routine_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_schedules_list() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_schedules_list() TO authenticated;

-- ── RPC 2: upsert one routine's schedule (super_admin write) ────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_routine_schedule_upsert(
  p_routine_id    text,
  p_enabled       boolean,
  p_days_of_week  smallint[],
  p_minute_of_day smallint
)
RETURNS public.ai_routine_schedules
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.ai_routine_schedules;
BEGIN
  IF NOT (SELECT (p.role = 'super_admin' OR p.is_super_admin = true)
          FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RAISE EXCEPTION 'fn_ai_routine_schedule_upsert: not authorized';
  END IF;
  IF p_minute_of_day IS NULL OR p_minute_of_day < 0 OR p_minute_of_day > 1439 THEN
    RAISE EXCEPTION 'minute_of_day out of range';
  END IF;
  IF p_days_of_week IS NULL OR array_length(p_days_of_week, 1) IS NULL THEN
    RAISE EXCEPTION 'days_of_week must not be empty (a schedule with no days would silently never run)';
  END IF;
  IF NOT (p_days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]) THEN
    RAISE EXCEPTION 'days_of_week must be 0..6';
  END IF;

  INSERT INTO public.ai_routine_schedules
    (routine_id, enabled, days_of_week, minute_of_day, updated_by, updated_at)
  VALUES
    (p_routine_id, COALESCE(p_enabled, true), COALESCE(p_days_of_week, '{0,1,2,3,4,5,6}'),
     p_minute_of_day, auth.uid(), now())
  ON CONFLICT (routine_id) DO UPDATE SET
    enabled       = EXCLUDED.enabled,
    days_of_week  = EXCLUDED.days_of_week,
    minute_of_day = EXCLUDED.minute_of_day,
    updated_by    = auth.uid(),
    updated_at    = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_schedule_upsert(text, boolean, smallint[], smallint) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_schedule_upsert(text, boolean, smallint[], smallint) TO authenticated;

-- ── RPC 3: dispatcher claims due routines (service_role only, atomic+idempotent) ─
-- Returns the routines that should fire in the current 15-min slot and marks
-- last_fired_slot in the SAME statement, so an overlapping tick can't double-fire.
CREATE OR REPLACE FUNCTION public.fn_ai_routine_claim_due()
RETURNS TABLE(routine_id text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ist   timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  v_dow   smallint  := EXTRACT(DOW FROM v_ist)::smallint;      -- 0=Sun..6=Sat
  v_min   smallint  := (EXTRACT(HOUR FROM v_ist) * 60 + EXTRACT(MINUTE FROM v_ist))::smallint;
  v_slotmin smallint := (v_min / 15) * 15;                     -- floor to 15-min slot
  v_slotkey text    := to_char(v_ist, 'YYYY-MM-DD') || ' ' ||
                       lpad((v_slotmin/60)::text,2,'0') || ':' || lpad((v_slotmin%60)::text,2,'0');
BEGIN
  RETURN QUERY
  UPDATE public.ai_routine_schedules s
     SET last_fired_slot = v_slotkey, last_fired_at = now()
   WHERE s.enabled = true
     AND s.managed = true
     AND v_dow = ANY (s.days_of_week)
     AND (s.minute_of_day / 15) * 15 = v_slotmin       -- routine's slot == current slot
     AND s.last_fired_slot IS DISTINCT FROM v_slotkey    -- not already fired this slot
  RETURNING s.routine_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_claim_due() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_claim_due() TO service_role;

-- ── RPC 4: record a dispatcher fire result (service_role) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_routine_record_fire(p_routine_id text, p_status text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_routine_schedules
     SET last_status = left(p_status, 200), updated_at = now()
   WHERE routine_id = p_routine_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_routine_record_fire(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
