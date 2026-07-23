-- ============================================================================
-- COHORT CORE — Phase 7 · M7 tuning: super-admin escape hatch for the SoD gate
-- Created: 2026-07-06  (Director decision — assumption-thrash follow-up to #1843)
-- ============================================================================
-- WHY: The proposer≠approver / proposer≠applier separation-of-duties added in
--   #1843 blocks a program run by a SINGLE admin — if only one person can manage
--   the SF100 program, no feed-forward proposal can ever be approved or applied
--   (they'd be approving/applying their own). The Director chose to add an escape
--   hatch: a SUPER-ADMIN may approve/apply their own proposal. Regular
--   cohort.manage holders are STILL bound by the two-person rule — only the top-
--   level super-admin bypasses it.
--
--   NOTE on auto-generated proposals: the auto-propose cron generates proposals in
--   a service context (auth.uid() NULL → proposed_by NULL), so the SoD checks
--   already skip for those (no human proposer to exclude) and ANY admin may approve
--   them — the human approver is the M7 brake. This exemption is what additionally
--   lets a lone super-admin approve a proposal THEY manually generated.
--
-- Re-states both live functions VERBATIM (pulled via pg_get_functiondef post-#1843)
-- + adds a single `NOT is_super_admin()` guard to each SoD check. Nothing else
-- changes (immutability pins, terminal/state-machine guards, tenant + authority
-- gates, M7 approved-gate all preserved).
--
-- TIER: TIER-1 (CREATE OR REPLACE of two existing fns; IDEMPOTENT; DROPS-NOTHING).
-- ============================================================================

-- ── guard: super-admin may SELF-APPROVE (regular managers still may not) ────────
CREATE OR REPLACE FUNCTION public.fn_cohort_proposal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- IMMUTABILITY (anti-tamper) — pin provenance + decision-input columns so a
  -- direct client PATCH cannot rewrite them (e.g. blank proposed_by to dodge SoD).
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

  -- STATE-MACHINE INTEGRITY: 'applied' may ONLY be reached from 'approved' via fn_apply.
  IF NEW.status = 'applied' AND OLD.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'proposal % may only reach applied via approval (fn_apply)', OLD.id
      USING ERRCODE='check_violation';
  END IF;

  -- SEPARATION OF DUTIES: the proposer may not APPROVE their own proposal —
  -- EXCEPT a super-admin (Director escape hatch for single-admin programs). Skipped
  -- for a trusted service caller (auth.uid() NULL) or a system-generated proposal
  -- (proposed_by NULL) where there is no human proposer to exclude.
  IF NEW.status = 'approved' AND NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL AND OLD.proposed_by IS NOT NULL
     AND auth.uid() = OLD.proposed_by
     AND NOT (SELECT public.is_super_admin()) THEN
    RAISE EXCEPTION 'separation-of-duties: the proposer of proposal % cannot approve it — a second reviewer (or a super-admin) must approve', OLD.id
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

-- ── apply: super-admin may SELF-APPLY (regular managers still may not) ───────────
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

  -- SEPARATION OF DUTIES: the proposer may not APPLY their own proposal — EXCEPT a
  -- super-admin (Director escape hatch). Skipped for a trusted service caller
  -- (auth.uid() NULL) or a system-generated proposal (proposed_by NULL).
  IF auth.uid() IS NOT NULL AND v_p.proposed_by IS NOT NULL
     AND auth.uid() = v_p.proposed_by
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'separation-of-duties: the proposer of proposal % cannot apply it — a second actor (or a super-admin) must apply', p_proposal_id
      USING ERRCODE='42501';
  END IF;

  -- Idempotency of the SIDE EFFECT: additive delta → refuse an already-applied one.
  IF v_p.status = 'applied' OR v_p.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'proposal % is already applied (applied_at=%)', p_proposal_id, v_p.applied_at
      USING ERRCODE='check_violation';
  END IF;

  -- M7: refuse unless a human approved it.
  IF v_p.status <> 'approved' THEN
    RAISE EXCEPTION 'M7 gate: proposal % is % (must be human-approved before apply)', p_proposal_id, v_p.status
      USING ERRCODE='check_violation';
  END IF;

  -- CROSS-TENANT WRITE GUARD: target program must belong to the proposal's tenant.
  SELECT institution_id INTO v_prog_inst FROM public.sf100_programs WHERE id = v_p.target_id;
  IF v_prog_inst IS NULL THEN
    RAISE EXCEPTION 'target program % not found for proposal %', v_p.target_id, p_proposal_id USING ERRCODE='no_data_found';
  END IF;
  IF v_prog_inst IS DISTINCT FROM v_p.institution_id THEN
    RAISE EXCEPTION 'cross-tenant apply blocked: proposal institution % <> target program institution %', v_p.institution_id, v_prog_inst
      USING ERRCODE='42501';
  END IF;

  -- Authority gate (DEFINER bypasses RLS → re-check here), bound to the TARGET
  -- PROGRAM's institution. NULL auth.uid() = trusted server context; anon REVOKEd.
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
    v_target_delta   := COALESCE((v_changes->>'paid_user_target_delta')::int, 0);
    v_deadline_shift := COALESCE((v_changes->>'hard_deadline_shift_days')::int, 0);
    v_min_txn_delta  := COALESCE((v_changes->>'min_transaction_amount_delta')::numeric, 0);

    UPDATE public.sf100_programs
       SET paid_user_target = GREATEST(0, COALESCE(paid_user_target,0) + v_target_delta),
           hard_deadline    = CASE WHEN v_deadline_shift <> 0 AND hard_deadline IS NOT NULL
                                   THEN GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date,
                                                 hard_deadline + v_deadline_shift)
                                   ELSE hard_deadline END,
           min_transaction_amount = GREATEST(0, COALESCE(min_transaction_amount,0) + v_min_txn_delta),
           updated_at = now()
     WHERE id = v_p.target_id
       AND institution_id = v_p.institution_id;
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
