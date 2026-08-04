-- ============================================================================
-- AI Console Phase 0.5 — gate visibility
-- Director decisions #4 (record every check, blocked or not) and #8 (drop to a
-- lighter mode automatically if it gets heavy).
-- Spec: specs/ai-console-unification-2026-08-01.md
-- Created: 2026-08-02
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS
-- ----------------------------------------------------------------------------
-- A policy gate that returns false makes a feature do nothing, silently. Three
-- separate STATIC sweeps for policy gates each missed the same key
-- (accreditation.meeting.proposal_enabled), which is why this instruments the
-- CHOKEPOINT instead of maintaining a registry: fn_get_policy_bool is the one
-- function both SQL and app code call, so recording there is complete BY
-- CONSTRUCTION. Nothing to maintain, nothing to drift.
--
-- ----------------------------------------------------------------------------
-- THE CONSTRAINT THAT SHAPES THIS MIGRATION
-- ----------------------------------------------------------------------------
-- fn_get_policy_bool is STABLE today, and PostgreSQL refuses to let a
-- non-volatile function write:
--     ERROR: 0A000: INSERT is not allowed in a non-volatile function
-- (verified against production 2026-08-02 with a temp function). So recording
-- from inside it REQUIRES flipping it to VOLATILE. Two facts were checked live
-- before doing that, because both would have made it unsafe:
--
--   1. How many RLS policies call fn_get_policy_bool?  ZERO.
--      A write triggered during RLS evaluation would recurse and would break
--      every read. It cannot happen here.
--   2. Nineteen other functions call it, and they are STABLE. Does a STABLE
--      caller reaching a VOLATILE writer fail?  NO — verified live: PostgreSQL
--      applies the barrier only to the IMMEDIATELY enclosing function, so a
--      STABLE caller -> VOLATILE callee that writes returns true.
--      => the blast radius is ONE function, not twenty. No caller changes.
--
-- The observation write is additionally wrapped in an exception guard, so a
-- read-only transaction, a full disk or a lock wait can never turn a policy
-- READ into an error. Visibility must never be able to break the thing it is
-- watching.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The observation table — one row per policy key, upsert not insert, so it
--    is bounded by the number of distinct keys and never grows with traffic.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.policy_gate_observations (
  policy_key        text PRIMARY KEY,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  last_result       boolean,
  eval_count        bigint      NOT NULL DEFAULT 0,
  blocked_count     bigint      NOT NULL DEFAULT 0,
  -- 'full'  = every call refreshes last_evaluated_at + last_result
  -- 'light' = counters only, timestamp refreshed at most once a minute (#8)
  mode              text        NOT NULL DEFAULT 'full'
                                CHECK (mode IN ('full','light')),
  mode_changed_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_gate_obs_blocked
  ON public.policy_gate_observations (last_evaluated_at DESC)
  WHERE last_result = false;

COMMENT ON TABLE public.policy_gate_observations IS
  'One row per policy key, written from inside fn_get_policy_bool. Turns a silent early-RETURN into a visible state: the AI console reads this to say "last blocked by <key> at <time>". Complete by construction — the chokepoint records, so there is no registry to drift. Bounded: upsert per key, never grows with traffic.';
COMMENT ON COLUMN public.policy_gate_observations.mode IS
  'Auto-managed by fn_policy_gate_observe. Flips to light above the eval threshold so a hot key cannot cost a timestamp write per call, and back to full once the key goes quiet for an hour. Never set by hand.';

-- Supabase ALTER DEFAULT PRIVILEGES grants ALL on every new public table to
-- both anon and authenticated, so an additive GRANT SELECT is a NO-OP and the
-- table is born writable by any signed-in user. Revoke FIRST, then grant.
ALTER TABLE public.policy_gate_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.policy_gate_observations FROM anon;
REVOKE ALL ON TABLE public.policy_gate_observations FROM authenticated;
GRANT  SELECT ON TABLE public.policy_gate_observations TO authenticated;

-- Read matches what the AI console at /admin/ai-routines ALREADY gates on:
-- super_admin / admin, with no dedicated permission key anywhere in the page or
-- in lib/constants/permissions.ts. A key was deliberately NOT invented here —
-- #2744 was caused by RLS demanding a key that existed nowhere, and a live sweep
-- on 2026-08-02 found 91 more of them. Adding a 92nd to gate the very table
-- built to make silent gates visible would be its own punchline. When the
-- console earns a real permission key, add it to permissions.ts and this policy
-- in the same change.
-- The writer is SECURITY DEFINER and bypasses RLS, so no write policy exists.
DROP POLICY IF EXISTS policy_gate_obs_select ON public.policy_gate_observations;
CREATE POLICY policy_gate_obs_select
  ON public.policy_gate_observations FOR SELECT
  TO authenticated
  USING (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
  );

-- ----------------------------------------------------------------------------
-- 2. The observer. VOLATILE (it writes), SECURITY DEFINER (callers hold no
--    grant on the table), and it can never raise into its caller.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_policy_gate_observe(
  p_key    text,
  p_result boolean
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Above this many evaluations a key stops refreshing its timestamp on every
  -- call (#8). A constant, not a config row, on purpose: this function runs on
  -- the policy read path, and reading a config row to decide how to record a
  -- config read would put a second query in the hot path to save one write.
  c_light_threshold  CONSTANT bigint   := 10000;
  -- In light mode the timestamp still moves this often, so "last seen" stays
  -- truthful without a write per call.
  c_light_interval   CONSTANT interval := interval '1 minute';
  -- A light key that has gone quiet this long returns to full detail (#8:
  -- "detail resumes when it drops").
  c_quiet_for_full   CONSTANT interval := interval '1 hour';
BEGIN
  INSERT INTO public.policy_gate_observations AS o
    (policy_key, last_evaluated_at, last_result, eval_count, blocked_count)
  VALUES
    (p_key, now(), p_result, 1, CASE WHEN p_result IS FALSE THEN 1 ELSE 0 END)
  ON CONFLICT (policy_key) DO UPDATE SET
    eval_count    = o.eval_count + 1,
    blocked_count = o.blocked_count + CASE WHEN p_result IS FALSE THEN 1 ELSE 0 END,

    -- Mode is decided from the row as it stood before this call.
    mode = CASE
             WHEN o.mode = 'full'  AND o.eval_count + 1 > c_light_threshold THEN 'light'
             WHEN o.mode = 'light' AND now() - o.last_evaluated_at > c_quiet_for_full THEN 'full'
             ELSE o.mode
           END,
    mode_changed_at = CASE
             WHEN o.mode = 'full'  AND o.eval_count + 1 > c_light_threshold THEN now()
             WHEN o.mode = 'light' AND now() - o.last_evaluated_at > c_quiet_for_full THEN now()
             ELSE o.mode_changed_at
           END,

    -- full: always refresh. light: only once per c_light_interval, but ALWAYS
    -- refresh when the answer flipped — a gate changing from true to false is
    -- the entire signal this table exists to surface, and rate-limiting it away
    -- would hide exactly the event worth seeing.
    last_evaluated_at = CASE
             WHEN o.mode = 'full'                                        THEN now()
             WHEN o.last_result IS DISTINCT FROM p_result                THEN now()
             WHEN now() - o.last_evaluated_at > c_light_interval          THEN now()
             ELSE o.last_evaluated_at
           END,
    last_result = CASE
             WHEN o.mode = 'full'                                        THEN p_result
             WHEN o.last_result IS DISTINCT FROM p_result                THEN p_result
             WHEN now() - o.last_evaluated_at > c_light_interval          THEN p_result
             ELSE o.last_result
           END;
EXCEPTION
  WHEN OTHERS THEN
    -- Recording must never be able to break a policy read. A read-only
    -- transaction, a replica, a full disk or a lock timeout all land here and
    -- the caller still gets its answer.
    NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_policy_gate_observe(text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_policy_gate_observe(text, boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. fn_get_policy_bool — instrumented.
--    Rebuilt from the LIVE production definition captured immediately before
--    this migration was written (md5 ee1671e8bb7d77c3387138cf013d8254), NOT
--    from a repo file: a CREATE OR REPLACE from a stale source has silently
--    reverted a gate in this codebase before. The RETURNED VALUE is unchanged —
--    still COALESCE(fn_get_policy(...)::boolean, p_default). Only the
--    volatility changes, and one observation call is added.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_policy_bool(
  p_key      text,
  p_default  boolean,
  p_scope_id uuid DEFAULT NULL::uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result boolean;
BEGIN
  SELECT COALESCE((fn_get_policy(p_key, p_scope_id))::boolean, p_default) INTO v_result;
  PERFORM public.fn_policy_gate_observe(p_key, v_result);
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_get_policy_bool(text, boolean, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_policy_bool(text, boolean, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Apply-time asserts — the behaviour must be identical, and it must record.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_a boolean;
  v_b boolean;
  v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='policy_gate_observations') THEN
    RAISE EXCEPTION 'policy_gate_observations was not created';
  END IF;

  -- The default must still come back for a key that does not exist, in both
  -- directions, or the rewrite changed behaviour.
  v_a := fn_get_policy_bool('__phase05_selftest_missing_key__', true);
  v_b := fn_get_policy_bool('__phase05_selftest_missing_key__', false);
  IF v_a IS NOT TRUE OR v_b IS NOT FALSE THEN
    RAISE EXCEPTION 'fn_get_policy_bool changed behaviour: default true gave %, default false gave %', v_a, v_b;
  END IF;

  -- ...and it must have recorded both of those evaluations.
  SELECT eval_count INTO v_n FROM public.policy_gate_observations
   WHERE policy_key = '__phase05_selftest_missing_key__';
  IF COALESCE(v_n, 0) < 2 THEN
    RAISE EXCEPTION 'observer did not record: eval_count = %', COALESCE(v_n, 0);
  END IF;

  DELETE FROM public.policy_gate_observations
   WHERE policy_key = '__phase05_selftest_missing_key__';
END
$assert$;

COMMIT;
