-- ============================================================================
-- Eligibility-gated leave types
-- 2026-09-19
-- ----------------------------------------------------------------------------
-- WHY. Some leave types are not open to everyone. PH.D leave needs proof of
-- enrolment before anybody may take it, and that proof should be given ONCE --
-- not stapled to every application for the rest of the person's degree.
--
-- THE SHAPE. A gated type is invisible until the staff member holds an approved
-- eligibility for it. They request it with the supporting document, the leave
-- type's own approvers decide it, and from then on the type simply appears in
-- Apply Leave and needs no document again.
--
-- WHERE THE GATE LIVES. v_hr_leave_balance_src is a CROSS JOIN of academic
-- years x leave types x staff, and the Apply Leave drawer lists from it rather
-- than from hr_leave_types. Its WHERE already filters per staff on gender,
-- cadre and hr_leave_type_assignments, so "hide until eligible" is one more
-- predicate in a view that already does exactly this.
--
-- NOT hr_leave_type_assignments, deliberately. That table means "if ANY active
-- row exists for this type, only matching staff see it", so the first grant
-- would flip a type's visibility globally, and it also carries entitled_days
-- and the short-time-off limits -- conflating "may apply" with "how much".
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The flag
-- ─────────────────────────────────────────────────────────────────────────────
-- Default false, so every one of the 66 existing types behaves exactly as it
-- does today and the view change below is a no-op until somebody opts in.
ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS requires_eligibility boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hr_leave_types.requires_eligibility IS
  'When true this leave type is hidden from Apply Leave until the staff member holds an approved row in hr_leave_eligibilities, and the per-application document requirement is satisfied by the one given at eligibility.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The grant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_leave_eligibilities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),

  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),

  -- The proof, in the same shape hr_leave_applications.documents uses, so the
  -- upload component and the viewer are shared rather than re-implemented.
  documents           jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason              text,

  -- Frozen at submit exactly like a leave application's chain: editing the
  -- flow afterwards must not re-route a request already in flight.
  approval_chain      jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_step        integer NOT NULL DEFAULT 0,

  -- The days this person gets for this type. Applied by writing an
  -- hr_leave_entitlement_overrides row on approval -- that table is already
  -- first in the view's COALESCE and already reports entitlement_source
  -- 'override', so nothing downstream needs to learn about this one.
  entitled_days       numeric,

  valid_from          date NOT NULL DEFAULT CURRENT_DATE,
  -- NULL = does not expire. A past date stops the type appearing without
  -- touching leave already approved under it.
  valid_until         date,

  decided_by          uuid REFERENCES public.profiles(id),
  decided_at          timestamptz,
  decision_note       text,

  revoked_by          uuid REFERENCES public.profiles(id),
  revoked_at          timestamptz,
  revoke_reason       text,

  -- True when HR recorded the grant directly instead of the staff member
  -- requesting it -- the migration path for people already doing a PhD.
  granted_directly    boolean NOT NULL DEFAULT false,

  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_eligibilities_dates_chk
    CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

-- ONE LIVE ROW PER PERSON PER TYPE. Rejected and revoked rows are excluded, so
-- somebody turned down once can request again with better evidence, and the
-- history of both attempts survives.
CREATE UNIQUE INDEX IF NOT EXISTS hr_leave_eligibilities_live_uniq
  ON public.hr_leave_eligibilities (employee_id, leave_type_id)
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS hr_leave_eligibilities_type_status_idx
  ON public.hr_leave_eligibilities (leave_type_id, status);
CREATE INDEX IF NOT EXISTS hr_leave_eligibilities_org_status_idx
  ON public.hr_leave_eligibilities (hr_organization_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The gate, as one named function
-- ─────────────────────────────────────────────────────────────────────────────
-- SQL + STABLE so the planner can inline it into the view rather than calling
-- it per row. Named rather than inlined by hand because the same question is
-- asked by the view, by the Apply Leave drawer and by createApplication, and
-- those three must not drift.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_ok(
  p_employee_id uuid,
  p_leave_type_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT NOT EXISTS (
    -- Fails only for a type that demands eligibility the person does not hold.
    -- An ungated type short-circuits here, which is every type today.
    SELECT 1
    FROM public.hr_leave_types t
    WHERE t.id = p_leave_type_id
      AND t.requires_eligibility
      AND NOT EXISTS (
        SELECT 1
        FROM public.hr_leave_eligibilities e
        WHERE e.employee_id = p_employee_id
          AND e.leave_type_id = p_leave_type_id
          AND e.status = 'approved'
          AND e.valid_from <= CURRENT_DATE
          AND (e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE)
      )
  );
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_ok(uuid, uuid) IS
  'May this staff member see and apply for this leave type? True for every type that does not require eligibility, which is the default.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Apply the gate to the balance view
-- ─────────────────────────────────────────────────────────────────────────────
-- WRAPPED, NOT RETYPED. The live definition is ~5 kB and the copy in
-- supabase/setup/05_views.sql is STALE (it predates the accrued/pending columns
-- and the included_in_hr joins), so transcribing it by hand would silently
-- revert those. Reading the live body and wrapping it keeps every column,
-- both UNION branches and every existing filter byte-for-byte, and applies the
-- new predicate to both branches at once.
--
-- SELECT * preserves the column list and order, which CREATE OR REPLACE VIEW
-- requires and which v_hr_leave_balance depends on.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_viewdef('public.v_hr_leave_balance_src'::regclass, true) INTO v_def;

  -- Idempotent: re-running must not wrap a wrapped view.
  IF position('fn_hr_leave_eligibility_ok' IN v_def) > 0 THEN
    RAISE NOTICE 'v_hr_leave_balance_src already carries the eligibility gate; leaving it alone.';
    RETURN;
  END IF;

  v_def := rtrim(btrim(v_def), ';');

  EXECUTE
    'CREATE OR REPLACE VIEW public.v_hr_leave_balance_src AS '
    || 'SELECT * FROM (' || v_def || ') base '
    || 'WHERE public.fn_hr_leave_eligibility_ok(base.employee_id, base.leave_type_id)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Who may decide one
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors fn_is_designated_leave_approver exactly, against the eligibility's
-- own frozen chain. fn_leave_step_admits is shared, so a pinned person is
-- admitted from any institution here for the same reason they are on leave.
CREATE OR REPLACE FUNCTION public.fn_is_designated_eligibility_approver(p_eligibility_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_leave_eligibilities e
    WHERE e.id = p_eligibility_id
      AND e.status = 'pending'
      AND public.fn_leave_step_admits(
            e.approval_chain -> e.current_step,
            (SELECT auth.uid()),
            e.hr_organization_id,
            e.employee_id)
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_leave_eligibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_leave_eligibilities_select ON public.hr_leave_eligibilities;
CREATE POLICY hr_leave_eligibilities_select ON public.hr_leave_eligibilities
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]))
    OR public.fn_is_designated_eligibility_approver(id)
    OR (
      (SELECT public.user_has_permission('hr.leave.types.manage'))
      AND hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
    )
  );

-- A staff member files their OWN request and it starts pending. They cannot
-- insert an approved row for themselves, which is the whole point of the gate.
DROP POLICY IF EXISTS hr_leave_eligibilities_insert_own ON public.hr_leave_eligibilities;
CREATE POLICY hr_leave_eligibilities_insert_own ON public.hr_leave_eligibilities
  FOR INSERT WITH CHECK (
    employee_id = ANY (COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]))
    AND status = 'pending'
    AND NOT granted_directly
  );

-- HR records a grant directly, or edits one.
DROP POLICY IF EXISTS hr_leave_eligibilities_manage ON public.hr_leave_eligibilities;
CREATE POLICY hr_leave_eligibilities_manage ON public.hr_leave_eligibilities
  FOR ALL USING (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.leave.types.manage'))
      AND hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
    )
  ) WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('hr.leave.types.manage'))
      AND hr_organization_id = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))
    )
  );

-- The approver's decision. Scoped to the row they are actually next on.
DROP POLICY IF EXISTS hr_leave_eligibilities_decide ON public.hr_leave_eligibilities;
CREATE POLICY hr_leave_eligibilities_decide ON public.hr_leave_eligibilities
  FOR UPDATE USING (public.fn_is_designated_eligibility_approver(id))
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Locks
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.hr_leave_eligibilities TO authenticated;
GRANT ALL ON public.hr_leave_eligibilities TO service_role;
REVOKE ALL ON public.hr_leave_eligibilities FROM anon;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_ok(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_ok(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_is_designated_eligibility_approver(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_designated_eligibility_approver(uuid) TO authenticated, service_role;
