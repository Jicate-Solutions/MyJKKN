-- Compensatory off earned-credit ledger.
--
-- WHY a new table: comp off is EARNED, not granted. Each credit traces to the
-- specific day worked and expires on its own schedule. hr_leave_balances is
-- (employee, leave_type, academic_year) -> (entitled, used, carried_forward),
-- one row per type per year, and cannot express "this credit came from 08/03
-- and dies on 06/06 while that one is still good".
--
-- POLICY (confirmed with the product owner, 2026-07-22):
--   earning  1 full day per day worked, regardless of hours
--   expiry   90 days from the worked date
--   sources  claim (team member asserts, approver confirms), hr_grant, and
--            attendance (dormant — see below)
--
-- The attendance-triggered source is defined here but nothing writes it yet:
-- hr_attendance_records, hr_public_holidays and hr_shift_templates are all
-- empty, so a "detect work on a holiday" job would credit nobody. The enum
-- value exists so that path can be switched on later without a schema change.
--
-- EXPIRY IS DERIVED, NOT STORED. `status` records what a human decided
-- (pending / approved / rejected / consumed); whether an approved credit has
-- since lapsed is computed from expires_on at read time. Storing 'expired'
-- would require a scheduled job whose failure silently keeps dead credits
-- spendable — the one failure mode worth designing out.

CREATE TABLE IF NOT EXISTS public.hr_comp_off_credits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  employee_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  worked_date         date    NOT NULL,
  credit_days         numeric NOT NULL DEFAULT 1
                        CHECK (credit_days > 0 AND credit_days <= 2),
  expires_on          date    NOT NULL,

  source              varchar NOT NULL DEFAULT 'claim'
                        CHECK (source IN ('claim','hr_grant','attendance')),
  status              varchar NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','consumed')),

  -- Set when the credit is spent. The application is the comp-off request
  -- that consumed it, which is how a balance reconciles to a booking.
  consumed_by_application_id uuid REFERENCES public.hr_leave_applications(id) ON DELETE SET NULL,
  consumed_at         timestamptz,

  granted_by          uuid,
  approved_by         uuid,
  approved_at         timestamptz,
  rejection_reason    text,
  notes               text,

  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One credit per person per worked day. The 1:1 policy means a second row
  -- for the same date is always a duplicate claim, not a second entitlement.
  CONSTRAINT hr_comp_off_credits_employee_date_unique UNIQUE (employee_id, worked_date),

  -- A consumed credit must say what consumed it, and nothing else may.
  CONSTRAINT hr_comp_off_credits_consumption_coherent CHECK (
    (status = 'consumed' AND consumed_by_application_id IS NOT NULL AND consumed_at IS NOT NULL)
    OR (status <> 'consumed' AND consumed_by_application_id IS NULL AND consumed_at IS NULL)
  ),

  CONSTRAINT hr_comp_off_credits_expiry_after_worked CHECK (expires_on > worked_date)
);

-- Balance reads are always (employee, status) and FIFO by expiry.
CREATE INDEX IF NOT EXISTS idx_hcoc_employee_status
  ON public.hr_comp_off_credits(employee_id, status, expires_on);
CREATE INDEX IF NOT EXISTS idx_hcoc_org_status
  ON public.hr_comp_off_credits(hr_organization_id, status);

COMMENT ON TABLE public.hr_comp_off_credits IS
  'Earned compensatory-off credits. One row per worked day per person; 1 day earned per day worked, expiring 90 days after the worked date. Expiry is derived from expires_on at read time, never stored as a status.';

-- Default expiry = worked_date + 90 days, applied when the caller does not
-- set one explicitly. Kept in a trigger rather than a column DEFAULT because
-- a DEFAULT cannot reference another column of the same row.
CREATE OR REPLACE FUNCTION public.hr_comp_off_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.expires_on IS NULL THEN
    NEW.expires_on := NEW.worked_date + INTERVAL '90 days';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hcoc_set_expiry ON public.hr_comp_off_credits;
CREATE TRIGGER trg_hcoc_set_expiry
  BEFORE INSERT OR UPDATE ON public.hr_comp_off_credits
  FOR EACH ROW EXECUTE FUNCTION public.hr_comp_off_set_expiry();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Mirrors hr_leave_applications: own rows always visible; approvers see their
-- organizations'. Writes are narrower than reads on purpose — a team member
-- may CLAIM but never approve their own claim.
ALTER TABLE public.hr_comp_off_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY hcoc_select ON public.hr_comp_off_credits
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    OR (
      public.user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  );

-- Claiming: only for yourself, only as source='claim', only as 'pending'.
-- Without the status clause a claimant could insert an already-approved row.
CREATE POLICY hcoc_insert_claim ON public.hr_comp_off_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
      AND source = 'claim'
      AND status = 'pending'
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
    OR (
      public.user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  );

-- Deciding a claim requires the approve permission. Self-approval is blocked
-- by the WITH CHECK: you may not move your OWN row out of 'pending'.
CREATE POLICY hcoc_update ON public.hr_comp_off_credits
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
      AND employee_id NOT IN (SELECT unnest(public.fn_my_staff_ids()))
    )
  );

CREATE POLICY hcoc_delete ON public.hr_comp_off_credits
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
