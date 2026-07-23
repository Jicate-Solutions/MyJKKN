-- ============================================================================
-- COHORT CORE — Phase 7 · M7 follow-up: proposer≠approver SEPARATION-OF-DUTIES
-- Created: 2026-07-06  (deferred follow-up documented in PR #1836 / PLAN.md)
-- ============================================================================
-- WHAT: The moat's human brake (M7) currently proves WHO reviewed (reviewed_by,
--   bound anti-spoof to auth.uid()) and WHO applied (applied_by), but it does NOT
--   record WHO PROPOSED — so nothing stops the same person from generating a
--   feed-forward proposal AND approving/applying it. That defeats the "a human
--   approves each auto-change" intent: the safety brake must be a SECOND pair of
--   eyes, not the proposer rubber-stamping their own machine output.
--
-- THIS MIGRATION adds true 4-eyes control:
--   1. cohort_adjustment_proposals.proposed_by  — recorded at INSERT, bound
--      anti-spoof to auth.uid() by a BEFORE INSERT trigger (a client cannot forge
--      a different proposer to dodge the SoD check).
--   2. fn_cohort_proposal_guard (BEFORE UPDATE) — refuses an approval where the
--      approver IS the proposer (self-approval). Rejecting your own proposal stays
--      allowed (killing your own draft is harmless; only self-APPROVAL is unsafe).
--   3. fn_apply_cohort_adjustment_proposal (DEFINER) — refuses an apply where the
--      applier IS the proposer, so the proposer is excluded from BOTH downstream
--      gates. Net effect: at least two distinct humans touch every applied change.
--
-- TRUSTED-SERVICE ESCAPE HATCH: when auth.uid() IS NULL (service_role / migration
--   context) the SoD checks are skipped — anon is REVOKEd on every path, so only a
--   trusted server principal ever has a NULL uid here. System-generated proposals
--   (proposed_by NULL) also skip the check: there is no human proposer to exclude,
--   and a human approver is still required by the existing M7 status gate.
--
-- TIER: TIER-1 (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE of two existing fns +
--       one new trigger fn; IDEMPOTENT; NON-DESTRUCTIVE; DROPS-NOTHING).
-- Base defs verified against LIVE prod (pg_get_functiondef) on 2026-07-06 — no
-- drift from 20260731094000; this file re-states them verbatim + the SoD additions.
-- ============================================================================

-- ── 1. proposer identity column ────────────────────────────────────────────────
ALTER TABLE public.cohort_adjustment_proposals
  ADD COLUMN IF NOT EXISTS proposed_by uuid;

COMMENT ON COLUMN public.cohort_adjustment_proposals.proposed_by IS
  'auth.uid() of who generated this proposal (stamped anti-spoof at INSERT). '
  'NULL = system/service generated. Used to enforce proposer≠approver / proposer≠applier.';

-- ── 2. anti-spoof stamp of proposed_by at INSERT ───────────────────────────────
-- Mirrors the reviewed_by anti-spoof pattern in fn_cohort_proposal_guard: the real
-- caller's auth.uid() WINS over any client-supplied value, so a proposer cannot
-- insert a foreign proposed_by to later approve their own proposal.
CREATE OR REPLACE FUNCTION public.fn_cohort_proposal_stamp_proposer()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.proposed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_proposal_stamp_proposer() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_cohort_proposals_stamp_proposer ON public.cohort_adjustment_proposals;
CREATE TRIGGER trg_cohort_proposals_stamp_proposer
  BEFORE INSERT ON public.cohort_adjustment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_cohort_proposal_stamp_proposer();

-- ── 3. guard: block SELF-APPROVAL (proposer≠approver) ──────────────────────────
-- Re-states the live guard verbatim + adds the SoD check. Order matters: the SoD
-- RAISE fires BEFORE reviewed_by is rebound, comparing the true caller (auth.uid())
-- against the recorded proposer.
CREATE OR REPLACE FUNCTION public.fn_cohort_proposal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- IMMUTABILITY (anti-tamper) — the approval UI updates this table via a DIRECT
  -- client PostgREST PATCH (the `authenticated` role holds table-level UPDATE, or
  -- the approval UPDATE would 42501), so a cohort.manage holder could otherwise
  -- rewrite ANY column: blank/repoint proposed_by to DODGE the SoD gate below
  -- (its IS-NOT-NULL escape then skips), or silently alter proposed_changes /
  -- causal_lift / target AFTER a reviewer has seen them. Pin every provenance +
  -- decision-input column to its stored value on EVERY update so only the status /
  -- review / apply metadata (handled below + in fn_apply) can ever move. This
  -- mirrors — and generalizes — the existing reviewed_by anti-spoof.
  NEW.proposed_by        := OLD.proposed_by;
  NEW.based_on_cohort_id := OLD.based_on_cohort_id;
  NEW.kind               := OLD.kind;
  NEW.target_scope       := OLD.target_scope;
  NEW.target_id          := OLD.target_id;
  NEW.causal_lift        := OLD.causal_lift;
  NEW.decision           := OLD.decision;
  NEW.proposed_changes   := OLD.proposed_changes;
  NEW.institution_id     := OLD.institution_id;

  IF OLD.status IN ('applied','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'proposal % is % (terminal) — its status cannot change', OLD.id, OLD.status
      USING ERRCODE='check_violation';
  END IF;

  -- STATE-MACHINE INTEGRITY: 'applied' may ONLY be reached from 'approved', and
  -- only via fn_apply (which does approved→applied). A direct client PATCH
  -- pending→applied would otherwise mislabel state, spoof applied_by, and — because
  -- uidx_cohort_proposals_one_open_per_cohort covers 'applied' — consume the
  -- one-open slot to DoS both re-proposal and the real fn_apply ("already applied").
  -- fn_apply is unaffected (its OLD.status is 'approved').
  IF NEW.status = 'applied' AND OLD.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'proposal % may only reach applied via approval (fn_apply)', OLD.id
      USING ERRCODE='check_violation';
  END IF;

  -- SEPARATION OF DUTIES: the proposer may not APPROVE their own proposal.
  -- (Self-rejection is allowed — killing your own draft harms nothing.) Skipped
  -- for a trusted service caller (auth.uid() NULL) or a system-generated proposal
  -- (proposed_by NULL) where there is no human proposer to exclude.
  IF NEW.status = 'approved' AND NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL AND OLD.proposed_by IS NOT NULL
     AND auth.uid() = OLD.proposed_by THEN
    RAISE EXCEPTION 'separation-of-duties: the proposer of proposal % cannot approve it — a second reviewer must approve', OLD.id
      USING ERRCODE='42501';
  END IF;

  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL THEN NEW.reviewed_by := auth.uid(); END IF;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_proposal_guard() FROM anon, PUBLIC;

-- ── 4. apply: block the proposer from APPLYING their own proposal ───────────────
-- Re-states the live DEFINER apply fn verbatim + adds the proposer≠applier SoD
-- check early (right after the row is locked). With §3 this fully excludes the
-- proposer from both downstream gates → ≥2 distinct humans per applied change.
CREATE OR REPLACE FUNCTION public.fn_apply_cohort_adjustment_proposal(p_proposal_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_p        public.cohort_adjustment_proposals;
  v_changes  jsonb;
  v_target_delta int;
  v_deadline_shift int;
  v_min_txn_delta numeric;
  v_prog_inst uuid;
  v_actor    uuid := COALESCE(auth.uid(), p_actor_id);  -- trust auth.uid(); param is a fallback for service context
BEGIN
  SELECT * INTO v_p FROM public.cohort_adjustment_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id USING ERRCODE='no_data_found';
  END IF;

  -- SEPARATION OF DUTIES: the proposer may not APPLY their own proposal either.
  -- Skipped for a trusted service caller (auth.uid() NULL) or a system-generated
  -- proposal (proposed_by NULL). auth.uid() is the true human; p_actor_id is only
  -- a service-context fallback and is not trusted for this exclusion.
  IF auth.uid() IS NOT NULL AND v_p.proposed_by IS NOT NULL
     AND auth.uid() = v_p.proposed_by THEN
    RAISE EXCEPTION 'separation-of-duties: the proposer of proposal % cannot apply it — a second actor must apply', p_proposal_id
      USING ERRCODE='42501';
  END IF;

  -- Idempotency of the SIDE EFFECT: the program delta is additive, so applying
  -- twice would double-count it. Refuse a proposal already applied (belt; the
  -- BEFORE UPDATE terminal trigger below is the suspenders that also blocks an
  -- applied→approved re-transition).
  IF v_p.status = 'applied' OR v_p.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'proposal % is already applied (applied_at=%)', p_proposal_id, v_p.applied_at
      USING ERRCODE='check_violation';
  END IF;

  -- M7: refuse unless a human approved it.
  IF v_p.status <> 'approved' THEN
    RAISE EXCEPTION 'M7 gate: proposal % is % (must be human-approved before apply)', p_proposal_id, v_p.status
      USING ERRCODE='check_violation';
  END IF;

  -- CROSS-TENANT WRITE GUARD: the target program must belong to the proposal's
  -- OWN institution. target_id is derived (in propose) from cohort config, which a
  -- cohort manager can set freely — without this a manager in institution A could
  -- point a proposal at institution B's program and mutate it. Re-derive authority
  -- from the TARGET PROGRAM's tenant, not the proposal's stored institution alone.
  SELECT institution_id INTO v_prog_inst FROM public.sf100_programs WHERE id = v_p.target_id;
  IF v_prog_inst IS NULL THEN
    RAISE EXCEPTION 'target program % not found for proposal %', v_p.target_id, p_proposal_id USING ERRCODE='no_data_found';
  END IF;
  IF v_prog_inst IS DISTINCT FROM v_p.institution_id THEN
    RAISE EXCEPTION 'cross-tenant apply blocked: proposal institution % <> target program institution %', v_p.institution_id, v_prog_inst
      USING ERRCODE='42501';
  END IF;

  -- Authority gate (DEFINER bypasses RLS → re-check here), bound to the TARGET
  -- PROGRAM's institution. NULL auth.uid() = trusted server context (service_role
  -- / migration); anon is REVOKEd below so it can never reach this branch.
  IF auth.uid() IS NOT NULL AND NOT (
       is_super_admin() OR is_admin()
       OR (user_has_permission('cohort.manage'::text) AND role_has_institution_access(v_prog_inst))
     ) THEN
    RAISE EXCEPTION 'not authorized to apply proposal % (institution %)', p_proposal_id, v_prog_inst
      USING ERRCODE = '42501';
  END IF;

  v_changes := COALESCE(v_p.proposed_changes, '{}'::jsonb);

  -- Nothing to apply (revert/inconclusive/no changes) → just mark applied.
  IF v_p.target_scope = 'program' AND v_changes <> '{}'::jsonb THEN
    -- whitelist of adjustable SF100 program levers (deltas / shifts only).
    v_target_delta   := COALESCE((v_changes->>'paid_user_target_delta')::int, 0);
    v_deadline_shift := COALESCE((v_changes->>'hard_deadline_shift_days')::int, 0);
    v_min_txn_delta  := COALESCE((v_changes->>'min_transaction_amount_delta')::numeric, 0);

    UPDATE public.sf100_programs
       SET paid_user_target = GREATEST(0, COALESCE(paid_user_target,0) + v_target_delta),
           -- hard_deadline is a DATE; floor a negative shift at TODAY (IST) so an
           -- approved shift can never move a live deadline into the past.
           hard_deadline    = CASE WHEN v_deadline_shift <> 0 AND hard_deadline IS NOT NULL
                                   THEN GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date,
                                                 hard_deadline + v_deadline_shift)
                                   ELSE hard_deadline END,
           min_transaction_amount = GREATEST(0, COALESCE(min_transaction_amount,0) + v_min_txn_delta),
           updated_at = now()
     WHERE id = v_p.target_id
       AND institution_id = v_p.institution_id;  -- tenant-bound write (defense-in-depth)
  END IF;

  UPDATE public.cohort_adjustment_proposals
     SET status='applied', applied_at=now(), applied_by=v_actor, updated_at=now()
   WHERE id = p_proposal_id
   RETURNING * INTO v_p;

  RETURN to_jsonb(v_p);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_apply_cohort_adjustment_proposal(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_apply_cohort_adjustment_proposal(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
