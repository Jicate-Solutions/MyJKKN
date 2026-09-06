-- ============================================================================
-- Leave approval flows: parallel/sequential, multi-approver steps, role ladder
-- 2026-08-31
-- ----------------------------------------------------------------------------
-- WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT.
--
-- Before this migration every leave flow was ONE step with ONE approver: 23
-- active leave flows, 0 of them multi-step, and 705 in-flight applications, 0
-- of them with a multi-step frozen chain. So there is no legacy multi-step
-- behaviour to preserve — only legacy SINGLE-step behaviour, which every
-- function below still reads byte-identically through fn_leave_step_approvers().
--
-- THE SHAPE DECISION THAT KEEPS current_step INTACT. "Parallel" is not a flag on
-- the frozen chain. It is a chain with exactly ONE step holding every approver;
-- "sequential" is a chain with N steps. Both are then "an ordered list of steps,
-- each with an approver set and a quorum", so current_step keeps its meaning,
-- fn_is_designated_leave_approver still reads approval_chain -> current_step,
-- and the advance logic needs no second completion rule.
--
-- hr_approval_flows IS SHARED WITH RECRUITMENT (40 recruitment_approval rows vs
-- 23 leave_approval). Every column added here defaults to the behaviour those
-- rows already have, and nothing in the recruitment path reads them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Flow configuration
-- ---------------------------------------------------------------------------

ALTER TABLE public.hr_approval_flows
  ADD COLUMN IF NOT EXISTS step_source text NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS run_mode text NOT NULL DEFAULT 'sequential',
  ADD COLUMN IF NOT EXISTS role_ladder jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_approver jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_step_source_check'
  ) THEN
    ALTER TABLE public.hr_approval_flows
      ADD CONSTRAINT hr_approval_flows_step_source_check
      CHECK (step_source IN ('explicit', 'role_ladder'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_run_mode_check'
  ) THEN
    ALTER TABLE public.hr_approval_flows
      ADD CONSTRAINT hr_approval_flows_run_mode_check
      CHECK (run_mode IN ('sequential', 'parallel'));
  END IF;

  -- A ladder flow with an empty ladder would resolve to nobody for everyone,
  -- which is the silent-empty-state failure this module has shipped twice.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_ladder_check'
  ) THEN
    ALTER TABLE public.hr_approval_flows
      ADD CONSTRAINT hr_approval_flows_ladder_check
      CHECK (
        step_source <> 'role_ladder'
        OR (jsonb_typeof(role_ladder) = 'array' AND jsonb_array_length(role_ladder) > 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.hr_approval_flows.step_source IS
  'explicit = use steps[]; role_ladder = derive the chain from role_ladder against the APPLICANT''s own rung.';
COMMENT ON COLUMN public.hr_approval_flows.run_mode IS
  'sequential = steps run in order; parallel = the builder collapses them into ONE step holding every approver.';
COMMENT ON COLUMN public.hr_approval_flows.role_ladder IS
  'Ordered custom_roles.role_key array, LOWEST rung first. The applicant enters above their own highest rung.';
COMMENT ON COLUMN public.hr_approval_flows.fallback_approver IS
  '{role_key?,user_id?,name?} used ONLY when the ladder yields nobody (the topmost person applying).';

-- ---------------------------------------------------------------------------
-- 2. One reader for both step shapes
-- ---------------------------------------------------------------------------
-- Every gate below goes through this, so "who is on this step" has exactly one
-- answer. When `approvers` is absent it yields the STEP ITSELF as a single
-- entry — the legacy step carries approver_user_id / approver_role at its top
-- level, so an old chain and a new one read through the same code path.

CREATE OR REPLACE FUNCTION public.fn_leave_step_approvers(p_step jsonb)
RETURNS TABLE(approver_user_id uuid, approver_role text)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT
    NULLIF(e->>'approver_user_id', '')::uuid,
    NULLIF(e->>'approver_role', '')
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_step -> 'approvers') = 'array'
       AND jsonb_array_length(p_step -> 'approvers') > 0
      THEN p_step -> 'approvers'
      ELSE jsonb_build_array(p_step)
    END
  ) AS e;
$function$;

COMMENT ON FUNCTION public.fn_leave_step_approvers(jsonb) IS
  'Approver entries of one chain step. Falls back to the step itself for legacy single-approver chains.';

-- ---------------------------------------------------------------------------
-- 3. One eligibility rule
-- ---------------------------------------------------------------------------
-- p_uid MUST be auth.uid(): the role branch calls fn_my_hr_organization_ids(),
-- which is derived from the session, not from p_uid. Passing anyone else's id
-- would test their role against the CALLER's organisations.
--
-- Institution scope is asymmetric on purpose and this preserves it: a PINNED
-- person is reachable from any organisation, a ROLE is only honoured inside the
-- application's own organisation.

CREATE OR REPLACE FUNCTION public.fn_leave_step_admits(
  p_step jsonb,
  p_uid uuid,
  p_hr_organization_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.fn_leave_step_approvers(p_step) e
    WHERE p_uid IS NOT NULL
      AND (
        e.approver_user_id = p_uid
        OR (
          e.approver_role IS NOT NULL
          AND p_hr_organization_id IN (
            SELECT unnest(public.fn_my_hr_organization_ids())
          )
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p_uid
              AND cr.role_key = e.approver_role
              AND cr.is_active
          )
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. RLS helper — now multi-approver aware
-- ---------------------------------------------------------------------------
-- Same contract as before (hla_select / hla_update both call it); it simply
-- reads every approver on the current step instead of only the first.

CREATE OR REPLACE FUNCTION public.fn_is_designated_leave_approver(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_applications a
    WHERE a.id = p_application_id
      AND public.fn_leave_step_admits(
            a.approval_chain -> a.current_step,
            auth.uid(),
            a.hr_organization_id
          )
  );
$function$;

-- ---------------------------------------------------------------------------
-- 5. Resolve the ladder for one applicant
-- ---------------------------------------------------------------------------
-- MUST live in the database. user_roles and custom_roles are not readable by an
-- ordinary member of staff, so resolving the ladder in the browser would come
-- back empty for exactly the people applying — the silent-false-negative this
-- module has already shipped twice (see LeaveService.assertCanDecide).
--
-- Returns the rungs STRICTLY ABOVE the applicant's highest held rung. Holding
-- none of them returns the whole ladder: 398 of 594 active HR staff hold no
-- ladder role today, and leaving them with no approver would break leave for
-- two thirds of the workforce.

CREATE OR REPLACE FUNCTION public.hr_resolve_leave_ladder(
  p_employee_id uuid,
  p_ladder jsonb
) RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_may        boolean;
  v_profile_id uuid;
  v_rank       int;
  v_out        text[];
BEGIN
  IF p_ladder IS NULL
     OR jsonb_typeof(p_ladder) <> 'array'
     OR jsonb_array_length(p_ladder) = 0 THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- COALESCE'd to false deliberately. A NULL here would make the IF skip and the
  -- gate fail OPEN, which is how a plpgsql guard in this codebase has silently
  -- passed before.
  v_may :=
       public.is_super_admin()
    OR p_employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]))
    OR public.user_has_permission('hr.leave.approve')
    OR public.user_has_permission('hr.leave.types.manage');

  IF NOT COALESCE(v_may, false) THEN
    RAISE EXCEPTION 'Not authorized to resolve an approval ladder for this employee.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.profile_id INTO v_profile_id
  FROM public.staff s WHERE s.id = p_employee_id;

  -- 1-based ordinality, so 0 legitimately means "holds no rung at all".
  SELECT COALESCE(max(l.ord), 0) INTO v_rank
  FROM jsonb_array_elements_text(p_ladder) WITH ORDINALITY AS l(role_key, ord)
  WHERE v_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = v_profile_id
        AND cr.role_key = l.role_key
        AND cr.is_active
    );

  SELECT array_agg(l.role_key ORDER BY l.ord) INTO v_out
  FROM jsonb_array_elements_text(p_ladder) WITH ORDINALITY AS l(role_key, ord)
  WHERE l.ord > v_rank;

  RETURN COALESCE(v_out, ARRAY[]::text[]);
END
$function$;

REVOKE ALL ON FUNCTION public.hr_resolve_leave_ladder(uuid, jsonb) FROM anon;

-- ---------------------------------------------------------------------------
-- 6. Approver gate — multi-approver, and now also fires on step ADVANCE
-- ---------------------------------------------------------------------------
-- ADDED FIRING CONDITION. The old trigger fired only on status -> approved /
-- rejected. With one-step chains that covered every decision, because the first
-- approval WAS the final one. A multi-step chain advances current_step while
-- status stays 'pending', so without this the intermediate steps would be
-- ungated. Safe for existing rows: today current_step never moves without the
-- status moving with it.
--
-- PERMISSIVE WHEN NOTHING CONSTRAINS. An entry only constrains if it pins a
-- person or names a role that exists and is active. A step whose entries name
-- neither is "any permitted approver" — that is what keeps the seeded flows
-- working and it is preserved exactly.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_step         jsonb;
  v_constraining int;
  v_matched      int;
  v_labels       text;
  v_deciding     boolean;
BEGIN
  v_deciding :=
       (NEW.status IN ('approved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status)
    OR (COALESCE(NEW.current_step, 0) > COALESCE(OLD.current_step, 0));

  IF NOT v_deciding THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.employee_id IN (SELECT unnest(public.fn_my_staff_ids())) THEN
    RAISE EXCEPTION 'You cannot decide on your own leave application.';
  END IF;

  v_step := OLD.approval_chain -> OLD.current_step;
  IF v_step IS NULL THEN
    RETURN NEW;
  END IF;

  WITH entries AS (
    SELECT
      (cr.role_key IS NOT NULL OR e.approver_user_id IS NOT NULL) AS constraining,
      (
        e.approver_user_id = v_uid
        OR (
          cr.role_key IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.user_roles ur
            JOIN public.custom_roles cr2 ON cr2.id = ur.role_id
            WHERE ur.user_id = v_uid
              AND cr2.role_key = e.approver_role
              AND cr2.is_active
          )
        )
      ) AS matched,
      COALESCE(cr.role_name, 'the assigned approver') AS label
    FROM public.fn_leave_step_approvers(v_step) e
    LEFT JOIN public.custom_roles cr
           ON cr.role_key = e.approver_role AND cr.is_active
  )
  SELECT
    count(*) FILTER (WHERE constraining),
    count(*) FILTER (WHERE matched),
    string_agg(DISTINCT label, ' or ')
  INTO v_constraining, v_matched, v_labels
  FROM entries;

  IF COALESCE(v_constraining, 0) = 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_matched, 0) > 0 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'This approval step is reserved for %.',
    COALESCE(v_labels, 'a different approver');
END
$function$;

-- ---------------------------------------------------------------------------
-- 7. Guard: a decision may only be recorded by the person making it
-- ---------------------------------------------------------------------------
-- WHY THIS IS NEW. hla_update's USING clause admits the APPLICANT
-- (employee_id IN fn_my_staff_ids()), and its WITH CHECK only bites when status
-- becomes approved/rejected. Until now every decision flipped status, so that
-- window was closed by accident. With quorum = 'all' a partial decision leaves
-- status 'pending', which would let an applicant write a forged decision into
-- their own chain and have a real approver unknowingly complete the quorum.
--
-- Scoped tightly: it only looks at decisions ADDED by this statement, and only
-- when the chain or the step pointer actually moved. Eligibility itself stays
-- with hla_update + hr_trig_leave_enforce_approver, so there is still exactly
-- one place that decides who may approve.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_guard_chain_decisions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_forged int;
BEGIN
  IF NEW.approval_chain IS NOT DISTINCT FROM OLD.approval_chain
     AND NEW.current_step IS NOT DISTINCT FROM OLD.current_step THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- The applicant may still cancel or edit their request; what they may not do
  -- is put a decision into their own chain.
  SELECT count(*) INTO v_forged
  FROM jsonb_array_elements(COALESCE(NEW.approval_chain, '[]'::jsonb))
       WITH ORDINALITY AS ns(step, ord)
  CROSS JOIN LATERAL jsonb_array_elements(
       COALESCE(ns.step -> 'decisions', '[]'::jsonb)) AS d(decision)
  WHERE NOT (
          COALESCE(
            OLD.approval_chain -> (ns.ord::int - 1) -> 'decisions',
            '[]'::jsonb
          ) @> jsonb_build_array(d.decision)
        )
    AND NULLIF(d.decision ->> 'by', '')::uuid IS DISTINCT FROM v_uid;

  IF COALESCE(v_forged, 0) > 0 THEN
    RAISE EXCEPTION
      'An approval decision can only be recorded by the approver making it.';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hla_guard_chain_decisions ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_guard_chain_decisions
  BEFORE UPDATE ON public.hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_leave_guard_chain_decisions();

-- ---------------------------------------------------------------------------
-- 8. The approver inbox
-- ---------------------------------------------------------------------------
-- hr_leave_my_approval_queue(p_hr_organization_id) ALREADY EXISTED and is what
-- LeaveApprovalFlowService.myQueueIds calls. It is REPLACED here, not joined by
-- a second overload: two overloads of an authorization-shaped function drift
-- apart and then disagree about who may act, which this codebase has already
-- been bitten by on user_has_permission.
--
-- What changes is only how it reads a step. It matched on the SINGULAR
-- approver_user_id / approver_role, so a step routed to several approvers -- or
-- to a role-ladder rung -- resolved against whichever single field it found
-- first. An HOD could be the current approver of a request and never see it.
--
-- The two permissive branches are preserved verbatim: a NULL step, and a step
-- that constrains nobody, both stay visible to any leave approver. Only the
-- constrained case now goes through fn_leave_step_admits, which is the same rule
-- the RLS helper and the gate trigger use -- so the inbox can neither list a row
-- the approver is then refused on, nor hide one they could act on.

DROP FUNCTION IF EXISTS public.hr_leave_my_approval_queue();

CREATE OR REPLACE FUNCTION public.hr_leave_my_approval_queue(
  p_hr_organization_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(application_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.id
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types lt ON lt.id = a.leave_type_id
  CROSS JOIN LATERAL (SELECT a.approval_chain -> a.current_step AS step) s
  WHERE a.status IN ('pending', 'escalated')
    AND (p_hr_organization_id IS NULL OR a.hr_organization_id = p_hr_organization_id)
    AND a.hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    AND a.employee_id NOT IN (SELECT unnest(public.fn_my_staff_ids()))
    AND (
      public.is_super_admin()
      -- The permissive branches stay behind the permission key, or a null /
      -- unconstrained step would expose pending applications to every
      -- authenticated user.
      OR (
        public.hr_can_approve_leave()
        AND (
          s.step IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.fn_leave_step_approvers(s.step) e
            LEFT JOIN public.custom_roles cr
                   ON cr.role_key = e.approver_role AND cr.is_active
            WHERE e.approver_user_id IS NOT NULL OR cr.role_key IS NOT NULL
          )
          OR public.fn_leave_step_admits(s.step, v_uid, a.hr_organization_id)
        )
      )
      -- A DESIGNATED APPROVER NEEDS NO PERMISSION KEY. hla_select already grants
      -- them the read and hla_update lets them decide; only this queue disagreed,
      -- so a role-ladder step routed to hod / principal / cao (all of which have
      -- hr.leave.approve = false) produced a request they were authorised to
      -- approve and could never find. Granting them the key instead would let any
      -- of the 94 HODs approve ANY request in their institution.
      OR public.fn_leave_step_admits(s.step, v_uid, a.hr_organization_id)
    );
END $function$;

REVOKE ALL ON FUNCTION public.hr_leave_my_approval_queue(uuid) FROM anon;
