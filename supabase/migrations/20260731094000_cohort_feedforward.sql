-- ============================================================================
-- COHORT CORE — M7.3: feed-forward proposer (Phase 7 · MOAT · M3/M5/M7)
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 7 · M3/M5/M7 → 7.3)
-- ============================================================================
-- WHAT: The ACTION half of the loop, with two hard safety gates.
--   1. public.cohort_adjustment_proposals — proposed program changes, each a
--      PENDING record until a human approves it.
--   2. fn_propose_cohort_adjustments(cohort_id) — reads a CLOSED cohort's causal
--      lift and emits a PENDING proposal to promote (or reject) the intervention
--      that its treatment arm tested. NEVER mutates the live program.
--   3. fn_apply_cohort_adjustment_proposal(proposal_id, actor) — the ONLY path
--      that mutates the program, and it REFUSES unless a human first moved the
--      proposal to 'approved'.
--
-- THE CONCRETE LOOP: cohort N stores an intervention in
--   config.experiment.treatment_params (e.g. {"paid_user_target_delta": 1}) and
--   applies it to its TREATMENT arm only. At close, 7.2 computes causal_lift =
--   treatment_mean − control_mean. If the intervention causally helped, this
--   proposer proposes PROMOTING treatment_params to the program default so cohort
--   N+1 runs it for everyone. That is a real feed-forward: the next action changes
--   BECAUSE the prior outcome was measured against a control.
--
-- SAFETY GATES (PLAN.md M5 + M7):
--   • M5 — learn ONLY from a CLOSED cohort (status completed|archived) whose
--     experiment has a non-NULL causal_lift (both arms present + computed). No
--     acting on mid-flight noise or a single-arm number.
--   • M7 — the proposer only ever writes status='pending'. The apply fn hard-
--     requires status='approved' (a human decision). Nothing auto-applies. Ever.
--   • MIN_ACTIONABLE_LIFT (0.02) — a causal lift below the noise floor yields an
--     'inconclusive' proposal (no program change proposed), so the loop cannot
--     chase statistical dust.
--
-- TIER: TIER-1 (new table + fns; IDEMPOTENT; NON-DESTRUCTIVE; DROPS-NOTHING).
-- ============================================================================

-- Minimum causal lift (blended-score points, 0..1 scale) worth acting on.
CREATE OR REPLACE FUNCTION public.fn_cohort_min_actionable_lift()
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 0.02::numeric $$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_min_actionable_lift() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cohort_min_actionable_lift() TO authenticated;

-- ── 1. cohort_adjustment_proposals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cohort_adjustment_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  based_on_cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  target_scope       text NOT NULL DEFAULT 'program' CHECK (target_scope IN ('program')),
  target_id          uuid NOT NULL,             -- sf100_programs.id to adjust
  causal_lift        numeric,
  decision           text NOT NULL CHECK (decision IN ('adopt','revert','inconclusive')),
  proposed_changes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale          text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','applied')),
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  applied_at         timestamptz,
  applied_by         uuid,
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_proposals_institution ON public.cohort_adjustment_proposals (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_proposals_target ON public.cohort_adjustment_proposals (target_scope, target_id);
CREATE INDEX IF NOT EXISTS idx_cohort_proposals_status ON public.cohort_adjustment_proposals (status);
-- At most ONE non-terminal-or-applied proposal per source cohort. Covering
-- 'applied' (not just 'pending') is what stops a cohort's additive delta from
-- being proposed→approved→applied a SECOND time and double-counting. A 'rejected'
-- proposal is excluded, so a cohort can be re-proposed after a rejection.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_proposals_one_open_per_cohort
  ON public.cohort_adjustment_proposals (based_on_cohort_id)
  WHERE status IN ('pending','applied');

-- touch updated_at
DROP TRIGGER IF EXISTS trg_cohort_proposals_updated_at ON public.cohort_adjustment_proposals;
CREATE TRIGGER trg_cohort_proposals_updated_at
  BEFORE UPDATE ON public.cohort_adjustment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Terminal-state + anti-spoof guard. (a) 'applied'/'rejected' are IMMUTABLE — an
-- applied proposal can never be flipped back to 'approved' and re-applied (which
-- would double-count the additive delta), and a rejected one can't be revived.
-- (b) on a human decision (→approved/→rejected) the reviewer is bound to the
-- actual caller's auth.uid() so "who approved" can't be spoofed via the update
-- column. Runs regardless of the RLS-governed UPDATE that triggers it.
CREATE OR REPLACE FUNCTION public.fn_cohort_proposal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('applied','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'proposal % is % (terminal) — its status cannot change', OLD.id, OLD.status
      USING ERRCODE='check_violation';
  END IF;
  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL THEN NEW.reviewed_by := auth.uid(); END IF;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cohort_proposal_guard() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_cohort_proposals_guard ON public.cohort_adjustment_proposals;
CREATE TRIGGER trg_cohort_proposals_guard
  BEFORE UPDATE ON public.cohort_adjustment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_cohort_proposal_guard();

-- ── 2. RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.cohort_adjustment_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_proposals_select_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_select_permission ON public.cohort_adjustment_proposals
  FOR SELECT USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.view'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- INSERT = manage (the proposer fn is DEFINER; this governs a manual insert).
DROP POLICY IF EXISTS cohort_proposals_insert_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_insert_permission ON public.cohort_adjustment_proposals
  FOR INSERT WITH CHECK (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

-- UPDATE = manage: this is the HUMAN APPROVAL surface (pending→approved/rejected).
DROP POLICY IF EXISTS cohort_proposals_update_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_update_permission ON public.cohort_adjustment_proposals
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
    OR ((select user_has_permission('cohort.manage'::text))
        AND (select role_has_institution_access(institution_id)))
  );

DROP POLICY IF EXISTS cohort_proposals_delete_permission ON public.cohort_adjustment_proposals;
CREATE POLICY cohort_proposals_delete_permission ON public.cohort_adjustment_proposals
  FOR DELETE USING ( (select is_super_admin()) OR (select is_admin()) );

-- ── 3. the proposer (M3 + M5 gate + M7 pending-only) ───────────────────────────
-- SECURITY INVOKER: reads the cohort/experiment and writes the proposal under the
-- caller's RLS (cohort.view to read, cohort.manage+institution to insert). A
-- cross-tenant caller cannot see the source cohort nor insert a proposal in
-- another institution — RLS scopes it. No DEFINER bypass.
CREATE OR REPLACE FUNCTION public.fn_propose_cohort_adjustments(p_cohort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cohort      public.cohorts;
  v_exp         public.cohort_experiments;
  v_program_id  uuid;
  v_prog_inst   uuid;
  v_treatment   jsonb;
  v_unwhitelisted int;
  v_min         numeric := public.fn_cohort_min_actionable_lift();
  v_decision    text;
  v_changes     jsonb;
  v_rationale   text;
  v_proposal    public.cohort_adjustment_proposals;
BEGIN
  SELECT * INTO v_cohort FROM public.cohorts WHERE id = p_cohort_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cohort % not found', p_cohort_id USING ERRCODE='no_data_found';
  END IF;

  -- M5 gate (a): only learn from a CLOSED cohort.
  IF v_cohort.status NOT IN ('completed','archived') THEN
    RAISE EXCEPTION 'M5 gate: cohort % is not closed (status=%); cannot feed-forward from an open cohort',
      p_cohort_id, v_cohort.status USING ERRCODE='check_violation';
  END IF;

  -- M5 gate (b): require a computed experiment WITH a causal lift (both arms).
  SELECT * INTO v_exp FROM public.cohort_experiments WHERE cohort_id = p_cohort_id;
  IF NOT FOUND OR v_exp.causal_lift IS NULL THEN
    RAISE EXCEPTION 'M5 gate: cohort % has no causal lift (need a computed experiment with both control+treatment arms) — run fn_compute_cohort_experiment first',
      p_cohort_id USING ERRCODE='check_violation';
  END IF;

  -- Only SF100 has an actionable program today.
  IF v_cohort.kind <> 'sf100' THEN
    RAISE EXCEPTION 'no feed-forward lever defined for kind=% yet', v_cohort.kind USING ERRCODE='check_violation';
  END IF;

  -- Resolve the target program: config primary, member→enrollment fallback.
  v_program_id := NULLIF(v_cohort.config->>'sf100_program_id','')::uuid;
  IF v_program_id IS NULL THEN
    SELECT e.program_id INTO v_program_id
      FROM public.cohort_memberships m
      JOIN public.sf100_enrollments e ON e.id = m.member_ref
     WHERE m.cohort_id = p_cohort_id AND m.member_type='team'
     LIMIT 1;
  END IF;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'could not resolve target sf100 program for cohort %', p_cohort_id USING ERRCODE='check_violation';
  END IF;

  -- CROSS-TENANT GUARD: the resolved program must be in the cohort's OWN
  -- institution. cohorts.config is freely editable by a cohort manager, so a
  -- config-supplied sf100_program_id could point at another tenant's program.
  SELECT institution_id INTO v_prog_inst FROM public.sf100_programs WHERE id = v_program_id;
  IF v_prog_inst IS DISTINCT FROM v_cohort.institution_id THEN
    RAISE EXCEPTION 'cross-tenant proposal blocked: cohort institution % <> program institution %',
      v_cohort.institution_id, v_prog_inst USING ERRCODE='42501';
  END IF;

  -- The intervention that the treatment arm tested (empty if none was recorded).
  v_treatment := COALESCE(v_cohort.config#>'{experiment,treatment_params}', '{}'::jsonb);

  -- Only these 3 program levers can be applied. If treatment_params carries ANY
  -- other key, the tested intervention is NOT one the apply path can promote —
  -- proposing 'adopt' would mark the proposal applied while changing nothing (a
  -- silent no-op reporting success). Count non-whitelisted keys to force it
  -- 'inconclusive' instead.
  SELECT count(*) INTO v_unwhitelisted
    FROM jsonb_object_keys(v_treatment) k
   WHERE k NOT IN ('paid_user_target_delta','hard_deadline_shift_days','min_transaction_amount_delta');

  -- Decision from the CAUSAL lift (never the naive/confounded one).
  IF v_exp.causal_lift >= v_min AND v_treatment <> '{}'::jsonb AND v_unwhitelisted = 0 THEN
    v_decision  := 'adopt';
    v_changes   := v_treatment;
    v_rationale := format('Treatment arm out-performed control by causal lift %s (≥ %s). Promote the tested intervention to the program default.',
                          v_exp.causal_lift, v_min);
  ELSIF v_exp.causal_lift <= -v_min AND v_treatment <> '{}'::jsonb THEN
    v_decision  := 'revert';
    v_changes   := '{}'::jsonb;   -- reverting = do NOT adopt; keep control default
    v_rationale := format('Treatment arm UNDER-performed control by causal lift %s (≤ -%s). Do NOT adopt the tested intervention.',
                          v_exp.causal_lift, v_min);
  ELSE
    v_decision  := 'inconclusive';
    v_changes   := '{}'::jsonb;
    v_rationale := CASE
      WHEN v_unwhitelisted > 0 THEN
        format('Causal lift %s ≥ threshold, but the tested treatment_params contain %s non-promotable key(s) the apply path cannot action — no program change proposed.',
               v_exp.causal_lift, v_unwhitelisted)
      ELSE
        format('Causal lift %s is within the noise floor ±%s (or no intervention was recorded). No program change proposed.',
               v_exp.causal_lift, v_min)
    END;
  END IF;

  -- Emit ONE pending proposal (idempotent: the partial unique index rejects a
  -- second pending proposal for the same source cohort → surface as the existing).
  BEGIN
    INSERT INTO public.cohort_adjustment_proposals (
      based_on_cohort_id, kind, target_scope, target_id, causal_lift,
      decision, proposed_changes, rationale, status, institution_id, metadata
    ) VALUES (
      p_cohort_id, 'sf100', 'program', v_program_id, v_exp.causal_lift,
      v_decision, v_changes, v_rationale, 'pending', v_cohort.institution_id,
      jsonb_build_object('treatment_params', v_treatment,
                         'naive_lift', v_exp.naive_lift,
                         'min_actionable', v_min)
    )
    RETURNING * INTO v_proposal;
  EXCEPTION WHEN unique_violation THEN
    -- The open-proposal index covers pending OR applied; return whichever exists
    -- (regardless of status) so we never toast success while returning NULL.
    SELECT * INTO v_proposal FROM public.cohort_adjustment_proposals
     WHERE based_on_cohort_id = p_cohort_id AND status IN ('pending','applied')
     ORDER BY created_at DESC LIMIT 1;
  END;

  RETURN to_jsonb(v_proposal);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_propose_cohort_adjustments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_propose_cohort_adjustments(uuid) TO authenticated;

-- ── 4. apply an APPROVED proposal (M7 human gate enforced here) ────────────────
-- The ONLY path that mutates the live program from a proposal. It is SECURITY
-- DEFINER because it must UPDATE sf100_programs even when the approving cohort
-- manager has no direct SF100-program grant — the human approval + tenant
-- authority justify the write. Because DEFINER bypasses RLS, this fn re-checks
-- authority INTERNALLY, bound to the PROPOSAL'S OWN institution (never a caller
-- param), so a cross-tenant caller cannot apply another institution's proposal.
-- Hard-requires status='approved' (a human moved it there). Whitelists the change
-- keys so a proposal can never write an arbitrary column. Marks it 'applied'.
CREATE OR REPLACE FUNCTION public.fn_apply_cohort_adjustment_proposal(
  p_proposal_id uuid,
  p_actor_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.fn_apply_cohort_adjustment_proposal(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_apply_cohort_adjustment_proposal(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
