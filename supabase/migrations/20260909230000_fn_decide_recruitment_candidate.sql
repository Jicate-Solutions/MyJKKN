-- =====================================================================================
-- fn_decide_recruitment_candidate — approve/reject a recruitment candidate step
-- =====================================================================================
-- WHY THIS EXISTS
--
-- RecruitmentService.approveCandidate / rejectCandidate authorized the caller in
-- TypeScript and then wrote the decision through the caller's own RLS-bound client:
--
--     supabase.from('hr_recruitment_candidates').update(...).eq('id', id).select().single()
--
-- The UPDATE policy on hr_recruitment_candidates requires `hr.recruitment.edit`.
-- Three roles that appear as approvers in live approval chains hold
-- `hr.recruitment.approve` but NOT `hr.recruitment.edit`:
--
--     hod, board, medical_superintendent
--
-- For those roles the service said "authorized", the policy matched zero rows,
-- `.single()` raised PGRST116, and — because a PostgrestError is a plain object and
-- not an Error instance — the route reported {"error":"Unknown error"} with a 400.
-- Every teaching_faculty chain starts on a `hod` step, so in practice no HOD has ever
-- been able to approve: of the 30 `hod` steps decided in production, 28 were the COO
-- and 2 a super admin, all through the override path. Seven candidates were stuck,
-- the oldest since 2026-07-14.
--
-- The same gap was already recognised and solved for review comments by
-- fn_update_recruitment_step_comment ("the author may be an approver role (e.g. hod)
-- that can approve but not edit the candidate row"). This is the twin for the decision
-- itself.
--
-- WHY NOT JUST WIDEN THE UPDATE POLICY
--
-- Adding `hr.recruitment.approve` to the UPDATE policy would let an HOD rewrite every
-- column on the candidate row (salary band, status, institution), not just stamp their
-- own step. The narrow SECURITY DEFINER surface is the correct trade.
--
-- WHY THE WHOLE DECISION MOVES INTO SQL
--
-- A definer function that simply wrote a chain handed to it by the client would let
-- any authenticated caller POST status=approved. So the function has to re-derive the
-- mutation from the row it just read, under its own authorization. That also closes
-- the read-then-write race the TypeScript version had (the candidate is now locked
-- FOR UPDATE for the duration of the decision).
--
-- BEHAVIOUR PARITY — the gate mirrors the TypeScript it replaces:
--   * step pinned to a user  -> only that user
--   * role step              -> holders of that role_key in user_roles
--   * super admin            -> always allowed, as an override
--   * hr.recruitment.approve.override holder -> allowed, as an override
--   * an override approval requires a comment
--   * overriding preserves the original routing (intended_approver_*) and never
--     clobbers approver_user_id; decided_by records who really acted
--
-- TWO DELIBERATE TIGHTENINGS (both strictly safer than what shipped):
--   1. Reject now runs the same step-approver gate as approve. The old
--      rejectCandidate had NO approver check at all — it was bounded only by the
--      `hr.recruitment.edit` RLS predicate this function bypasses, so carrying it
--      over unguarded would have opened a hole.
--   2. An 'own'-scoped approver (hod, principal, school_principal,
--      medical_superintendent) must also pass role_has_institution_access on the
--      candidate's institution. The old UPDATE policy required that confinement and
--      approval chains carry no institution binding of their own, so without this a
--      HOD at one college could action another college's candidate. 'all'-scoped
--      roles (coo, ceo, hr_head, board, ...) are unaffected — that function returns
--      true for them.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.fn_decide_recruitment_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_comment text DEFAULT NULL
)
RETURNS public.hr_recruitment_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate public.hr_recruitment_candidates;
  v_chain     jsonb;
  v_step      jsonb;
  v_len       integer;
  v_idx       integer;
  v_uid       uuid := auth.uid();
  v_pinned    text;
  v_role      text;
  v_own       boolean := false;
  v_override  boolean := false;
  v_now       timestamptz := now();
  v_next      integer;
  v_final     boolean;
BEGIN
  -- Barrier 1. No authenticated caller, no decision — refused before anything is
  -- read, so an anonymous request cannot probe which candidate ids exist.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized to action this step' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision — expected approve or reject';
  END IF;

  -- The route already enforces this; repeated here because the function is a
  -- callable surface in its own right and a NULL reason would erase the audit trail.
  IF p_decision = 'reject' AND COALESCE(btrim(p_comment), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_candidate
  FROM public.hr_recruitment_candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found' USING ERRCODE = 'P0002';
  END IF;

  v_chain := COALESCE(v_candidate.approval_chain, '[]'::jsonb);
  v_len   := jsonb_array_length(v_chain);
  v_idx   := v_candidate.current_step;
  v_step  := CASE WHEN v_idx >= 0 AND v_idx < v_len THEN v_chain -> v_idx ELSE NULL END;

  -- ---------------------------------------------------------------------------
  -- Barrier 2. Step-approver enforcement.
  -- ---------------------------------------------------------------------------
  IF v_step IS NOT NULL AND (v_step ->> 'status') = 'pending' THEN
    v_pinned := v_step ->> 'approver_user_id';
    v_role   := lower(COALESCE(v_step ->> 'approver_role', ''));

    v_own := (v_pinned IS NOT NULL AND v_pinned = v_uid::text);

    IF NOT v_own AND v_pinned IS NULL AND v_role <> '' THEN
      v_own := EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = v_uid
          AND lower(cr.role_key) = v_role
      );
    END IF;

    -- Institution confinement for the role-matched path (see header note 2).
    IF v_own AND NOT public.role_has_institution_access(v_candidate.institution_id) THEN
      v_own := false;
    END IF;

    IF NOT v_own THEN
      v_override := COALESCE(
        public.is_super_admin()
        OR public.user_has_permission('hr.recruitment.approve.override'),
        false
      );

      IF NOT v_override THEN
        IF v_pinned IS NOT NULL THEN
          RAISE EXCEPTION
            'This step is assigned to a specific approver and can only be actioned by them.'
            USING ERRCODE = '42501';
        ELSE
          RAISE EXCEPTION
            'Only users with role ''%'' can action this step. Adjust the chain at /hr/admin/recruitment-approval-flows if routing is wrong.',
            COALESCE(v_step ->> 'approver_role', '?')
            USING ERRCODE = '42501';
        END IF;
      END IF;

      -- An override must carry a reason so the audit trail explains why someone
      -- acted on another approver's step. (Reject already required one above.)
      IF p_decision = 'approve' AND COALESCE(btrim(p_comment), '') = '' THEN
        RAISE EXCEPTION
          'A comment is required when overriding another approver''s step. Please explain why you are approving on their behalf.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    -- No pending step at the cursor. The row is in a state the flow cannot
    -- describe, so only a privileged caller may touch it; everyone else falls
    -- through to the explanatory guards below.
    IF NOT COALESCE(
      public.is_super_admin()
      OR public.user_has_permission('hr.recruitment.approve.override'),
      false
    ) THEN
      RAISE EXCEPTION 'Not authorized to action this step' USING ERRCODE = '42501';
    END IF;
    v_override := true;
  END IF;

  -- ---------------------------------------------------------------------------
  -- State guards.
  -- ---------------------------------------------------------------------------
  IF v_candidate.status NOT IN ('pending_approval', 'submitted') THEN
    RAISE EXCEPTION 'Cannot % candidate in status ''%''', p_decision, v_candidate.status;
  END IF;

  IF p_decision = 'approve' AND v_step IS NULL THEN
    -- Friendlier wording when the chain is already complete: covers a stale client
    -- cache showing the candidate as pending after a previous approver finished it.
    IF v_idx >= v_len THEN
      RAISE EXCEPTION 'This candidate has already been fully approved.';
    END IF;
    RAISE EXCEPTION 'Approval chain exhausted — no pending step found';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Stamp the step and advance.
  -- ---------------------------------------------------------------------------
  IF p_decision = 'approve' THEN
    v_step := v_step || jsonb_build_object(
      'status',     'approved',
      'decided_at', v_now,
      'decided_by', v_uid::text,
      'comment',    p_comment
    );

    IF v_override THEN
      -- Record the override; do NOT clobber approver_user_id — that would erase
      -- who the step was originally routed to. decided_by records who really acted.
      v_step := v_step || jsonb_build_object(
        'overridden',                 true,
        'overridden_by',              v_uid::text,
        'overridden_at',              v_now,
        'intended_approver_user_id',  COALESCE(v_step -> 'approver_user_id', 'null'::jsonb),
        'intended_approver_role',     COALESCE(v_step -> 'approver_role', 'null'::jsonb)
      );
    ELSE
      v_step := v_step || jsonb_build_object('approver_user_id', v_uid::text);
    END IF;

    v_chain := jsonb_set(v_chain, ARRAY[v_idx::text], v_step);
    v_next  := v_idx + 1;
    v_final := v_next >= v_len;

    UPDATE public.hr_recruitment_candidates
       SET approval_chain    = v_chain,
           current_step      = v_next,
           status            = CASE WHEN v_final THEN 'approved' ELSE 'pending_approval' END,
           final_approver_id = CASE WHEN v_final THEN v_uid ELSE final_approver_id END,
           final_decided_at  = CASE WHEN v_final THEN v_now ELSE final_decided_at END
     WHERE id = p_candidate_id
    RETURNING * INTO v_candidate;

  ELSE
    IF v_step IS NOT NULL THEN
      v_step := v_step || jsonb_build_object(
        'status',           'rejected',
        'decided_at',       v_now,
        'decided_by',       v_uid::text,
        'comment',          p_comment,
        'approver_user_id', v_uid::text
      );
      v_chain := jsonb_set(v_chain, ARRAY[v_idx::text], v_step);
    END IF;

    UPDATE public.hr_recruitment_candidates
       SET status            = 'rejected',
           approval_chain    = v_chain,
           rejection_reason  = p_comment,
           final_approver_id = v_uid,
           final_decided_at  = v_now
     WHERE id = p_candidate_id
    RETURNING * INTO v_candidate;
  END IF;

  RETURN v_candidate;
END;
$function$;

-- Postgres grants EXECUTE to PUBLIC on every new function, which would hand the anon
-- role a callable decision surface. Barrier 1 refuses a NULL auth.uid() anyway, but the
-- reachable surface should match the intended one. The explicit grants also matter
-- because a future DROP + CREATE silently resets the ACL to owner-only and would 403
-- every approver — so they travel with the definition rather than living in a console.
REVOKE ALL ON FUNCTION public.fn_decide_recruitment_candidate(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_decide_recruitment_candidate(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_decide_recruitment_candidate(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_decide_recruitment_candidate(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_decide_recruitment_candidate(uuid, text, text) IS
  'Approve or reject the current approval-chain step of a recruitment candidate. '
  'SECURITY DEFINER because approver roles (hod, board, medical_superintendent) hold '
  'hr.recruitment.approve but not hr.recruitment.edit, so they cannot satisfy the '
  'UPDATE policy on hr_recruitment_candidates. Self-authorizes against the frozen '
  'approval_chain: pinned approver, role holder (institution-confined), super admin, '
  'or hr.recruitment.approve.override holder.';
