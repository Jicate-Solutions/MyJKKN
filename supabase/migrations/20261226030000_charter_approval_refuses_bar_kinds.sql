-- ============================================================================
-- 20261226030000_charter_approval_refuses_bar_kinds.sql
-- ----------------------------------------------------------------------------
-- fn_loop_apply_charter_proposal must refuse a proposal that is not a CHARTER.
--
-- WHY (critic risk 1 on PR #3883, confirmed against production 2026-09-19):
-- 20261225070000 added `kind` to loop_charter_proposals ('charter' | 'bar' |
-- 'bar-review'), so one table now carries three different proposal shapes.
-- The approval function was written when the table held charters only: it
-- checks status='proposed' and is_super_admin() and NOTHING ELSE. A super admin
-- calling this RPC directly on a kind='bar' row runs
--
--     UPDATE loop_registry SET outcome_metric = NULLIF(proposed->>'outcome_metric') …
--
-- against a bar payload, whose keys are {bar, bar_kind} — none of the five
-- charter keys exist, every NULLIF lands NULL, and the loop's FIVE charter legs
-- (outcome_metric · counter_metric · intervention · baseline_window ·
-- remeasure_window) are ERASED. The bar proposal is then stamped 'approved' on
-- the wrong path, so the bar is silently consumed and can never be decided by
-- fn_loop_bar_decide, its real door.
--
-- Reachable today, not hypothetical. Read live 2026-09-19:
--   6 rows kind='bar' status='proposed' (bug-triage · counselor-briefing-effect
--   · events · feeder · induction-session · scf); every one of those six
--   loop_registry rows has all 5 legs currently SET; every one of those six
--   payloads has payload keys {bar, bar_kind} only.
-- So each of the six is a one-call, five-column data loss on a live loop.
--
-- The UI already routes bars through fn_loop_bar_decide — this closes the
-- direct-RPC path the UI happens not to take. Defence in depth: the enforcement
-- belongs in the function, not in the panel that calls it.
--
-- WHAT THIS CHANGES: exactly one new guard, inserted immediately after the
-- existing status check. The body is otherwise the LIVE pg_get_functiondef
-- verbatim (read from production 2026-09-19), so the diff is the guard alone.
-- SECURITY DEFINER, search_path, signature and grants are unchanged from live.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_loop_apply_charter_proposal(p_proposal_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Whole-row variable, never bare column names in expressions — the 42702
  -- out-param-shadows-column class (ref feedback_out_param_name_shadows_column_42702).
  v_prop public.loop_charter_proposals%ROWTYPE;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_prop
    FROM public.loop_charter_proposals
   WHERE id = p_proposal_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;  -- surfaced as an explicit toast in the panel, never swallowed
  END IF;

  IF v_prop.status <> 'proposed' THEN
    RAISE EXCEPTION 'proposal already decided (status=%)', v_prop.status;
  END IF;

  -- THE GUARD (20261226030000). One table, three proposal shapes since
  -- 20261225070000 — a bar payload has none of the five charter keys, so
  -- letting it through here NULLs all five legs on a live loop. IS DISTINCT
  -- FROM, not <>, so a NULL kind (belt-and-braces; the column is NOT NULL
  -- DEFAULT 'charter' today) is refused rather than silently passed.
  IF v_prop.kind IS DISTINCT FROM 'charter' THEN
    RAISE EXCEPTION 'proposal % is a % proposal — decide it through fn_loop_bar_decide', p_proposal_id, v_prop.kind;
  END IF;

  UPDATE public.loop_registry SET
    outcome_metric   = NULLIF(btrim(v_prop.proposed->>'outcome_metric'), ''),
    counter_metric   = NULLIF(btrim(v_prop.proposed->>'counter_metric'), ''),
    intervention     = NULLIF(btrim(v_prop.proposed->>'intervention'), ''),
    baseline_window  = NULLIF(btrim(v_prop.proposed->>'baseline_window'), ''),
    remeasure_window = NULLIF(btrim(v_prop.proposed->>'remeasure_window'), ''),
    updated_at       = now()
  WHERE loop_key = v_prop.loop_key;
  IF NOT FOUND THEN
    -- FK guarantees this can only happen if the registry row vanished between
    -- proposal and approval — fail loudly rather than stamp a ghost approval.
    RAISE EXCEPTION 'no loop_registry row for loop_key %', v_prop.loop_key;
  END IF;

  UPDATE public.loop_charter_proposals SET
    status     = 'approved',
    decided_by = auth.uid(),
    decided_at = now(),
    updated_at = now()
  WHERE id = p_proposal_id;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) IS
  'Approve a MetaLoop charter proposal: super-admin-asserted (own is_super_admin() check), validates status=proposed AND kind=''charter'' (a bar / bar-review row is refused — it belongs to fn_loop_bar_decide, and its payload would NULL all five registry legs), writes the 5 charter legs onto loop_registry (NULLIF-normalized), stamps the proposal approved/decided_by/decided_at. kill_rule + suggested_verdict_owner stay on the proposal row (no registry column / owner assignment is fn_loop_set_owner''s). Returns false when no proposal matches; raises on refusal or an already-decided row.';

-- MANDATORY house policy (2026-06-06): Supabase default privileges grant anon
-- EXECUTE on every new function — revoke explicitly, separate from PUBLIC.
-- Ref: migration 20260605191101 + feedback_supabase_anon_execute_default_grant.
-- Re-asserted here because CREATE OR REPLACE re-runs those default privileges.
REVOKE EXECUTE ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_apply_charter_proposal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- POST-APPLY GUARD — this file is a no-op unless the new check is really in the
-- deployed body. Reads the body back from the catalog; a silent CREATE OR
-- REPLACE that lost the guard fails the apply instead of reporting success.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_loop_apply_charter_proposal'
     AND p.pronargs = 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'GUARD FAILED: fn_loop_apply_charter_proposal(uuid) not found after apply';
  END IF;

  IF position('v_prop.kind IS DISTINCT FROM ''charter''' in v_def) = 0 THEN
    RAISE EXCEPTION 'GUARD FAILED: deployed body has no kind check — bar proposals can still erase a loop''s five charter legs';
  END IF;

  IF position('fn_loop_bar_decide' in v_def) = 0 THEN
    RAISE EXCEPTION 'GUARD FAILED: deployed body does not name fn_loop_bar_decide in its refusal message';
  END IF;

  -- The guard must sit BEFORE the registry UPDATE, otherwise the legs are
  -- already NULLed by the time it raises.
  IF position('v_prop.kind IS DISTINCT FROM' in v_def)
     > position('UPDATE public.loop_registry SET' in v_def) THEN
    RAISE EXCEPTION 'GUARD FAILED: kind check is AFTER the loop_registry UPDATE — it would fire too late';
  END IF;

  RAISE NOTICE 'GUARD OK: fn_loop_apply_charter_proposal refuses non-charter kinds before touching loop_registry';
END
$guard$;
