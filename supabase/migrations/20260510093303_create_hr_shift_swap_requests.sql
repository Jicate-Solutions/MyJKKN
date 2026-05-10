-- ============================================================================
-- HR Shifts — Swap Requests workflow (T1.6 Phase 2b)
-- ============================================================================
-- Created: 2026-05-10
-- Spec: specs/hr-module-decomposition-2026-05-09.md (Tier 1, T1.6)
-- Q-locks (Director-locked 2026-05-10):
--   2. Swap permissions: Employee-initiated with HR approval (audit trail required).
--   3. Rotation: BOTH — default single-week, multi-week opt-in per department.
--
-- State machine (6 states)
-- ------------------------
--   pending                 — requester filed; waiting on counterparty consent
--                             (or "open swap" with no counterparty named)
--   counterparty_accepted   — counterparty agreed; queued for HR review
--   approved                — HR approved; effective on swap_date (no
--                             cascading writes — consumers read this row as
--                             the override source-of-truth on swap_date)
--   rejected                — HR rejected
--   cancelled               — requester cancelled before approval
--   expired                 — swap_date passed without resolution
--                             (set by an out-of-band sweeper or first read
--                             after the date; no trigger here)
--
-- Allowed transitions:
--   pending → counterparty_accepted | cancelled | rejected | expired
--   counterparty_accepted → approved | rejected | cancelled | expired
--   approved | rejected | cancelled | expired → (terminal)
--
-- Swap execution detail
-- ---------------------
-- When HR approves, NO underlying assignment rows are mutated. The
-- approved swap_request row IS the per-day override. Consumers that need
-- "who is on shift on date Y" must check this table first (status='approved'
-- AND swap_date=Y) and fall back to hr_shift_assignments. This avoids
-- introducing a separate exceptions table while preserving full audit trail.
--
-- RLS: requester sees own; counterparty sees own; HR (admin / super_admin)
-- sees all. Insert by requester (matched via staff.profile_id=auth.uid());
-- update by requester | counterparty | HR; delete admin-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) hr_shift_swap_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_shift_swap_requests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Initiating staff member's existing assignment
  requester_assignment_id     uuid NOT NULL REFERENCES public.hr_shift_assignments(id) ON DELETE CASCADE,
  requester_staff_id          uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- Target counterparty (the staff they want to swap with). Both NULL = "open swap"
  -- (any willing partner can accept). Both NOT NULL once a counterparty is named.
  counterparty_assignment_id  uuid REFERENCES public.hr_shift_assignments(id) ON DELETE CASCADE,
  counterparty_staff_id       uuid REFERENCES public.staff(id) ON DELETE CASCADE,

  -- Swap window
  swap_date                   date NOT NULL,
  reason                      text,

  -- State machine
  status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending',
                                  'counterparty_accepted',
                                  'approved',
                                  'rejected',
                                  'cancelled',
                                  'expired'
                                )),

  -- Lifecycle audit cols
  counterparty_consent_at     timestamptz,
  hr_approved_by              uuid REFERENCES public.profiles(id),
  hr_approved_at              timestamptz,
  hr_review_notes             text,

  -- Standard audit cols
  requested_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Counterparty pair must be all-or-nothing.
  CONSTRAINT hr_shift_swap_requests_counterparty_pair_chk CHECK (
    (counterparty_staff_id IS NULL AND counterparty_assignment_id IS NULL)
    OR (counterparty_staff_id IS NOT NULL AND counterparty_assignment_id IS NOT NULL)
  ),
  -- Requester and counterparty must differ when both set.
  CONSTRAINT hr_shift_swap_requests_no_self_swap_chk CHECK (
    counterparty_staff_id IS NULL
    OR counterparty_staff_id <> requester_staff_id
  )
);

COMMENT ON TABLE public.hr_shift_swap_requests IS
  'HR Shifts — Employee-initiated shift swap requests with HR approval (T1.6 Phase 2b). 6-state machine: pending → counterparty_accepted → approved | rejected | cancelled | expired. Approved row IS the per-day override (no cascading writes to hr_shift_assignments — consumers read this table as source-of-truth on swap_date).';
COMMENT ON COLUMN public.hr_shift_swap_requests.requester_assignment_id IS
  'The requester''s currently-active assignment (the shift they want to swap OUT of on swap_date).';
COMMENT ON COLUMN public.hr_shift_swap_requests.counterparty_assignment_id IS
  'The counterparty''s currently-active assignment (the shift they want to swap INTO). Both counterparty_* cols are NULL for "open swap" requests waiting for any willing partner.';
COMMENT ON COLUMN public.hr_shift_swap_requests.swap_date IS
  'Single calendar date the swap applies to. Approved swap_request rows act as a per-day override on top of hr_shift_assignments for this date only.';
COMMENT ON COLUMN public.hr_shift_swap_requests.status IS
  'State machine: pending → counterparty_accepted → approved | rejected | cancelled | expired. Approved is the only state that actually swaps shifts (downstream consumers must read this table on swap_date).';

-- ---------------------------------------------------------------------------
-- 2) Indexes — primary access patterns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_shift_swap_requester_status
  ON public.hr_shift_swap_requests(requester_staff_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_shift_swap_counterparty_status
  ON public.hr_shift_swap_requests(counterparty_staff_id, status);

CREATE INDEX IF NOT EXISTS idx_hr_shift_swap_pending_review
  ON public.hr_shift_swap_requests(status, swap_date)
  WHERE status IN ('pending', 'counterparty_accepted');

CREATE INDEX IF NOT EXISTS idx_hr_shift_swap_approved_swap_date
  ON public.hr_shift_swap_requests(swap_date)
  WHERE status = 'approved';

-- ---------------------------------------------------------------------------
-- 3) Trigger — keep updated_at fresh
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS hr_shift_swap_requests_updated_at
  ON public.hr_shift_swap_requests;
CREATE TRIGGER hr_shift_swap_requests_updated_at
  BEFORE UPDATE ON public.hr_shift_swap_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
--    SELECT: super_admin / admin always; requester sees own; counterparty
--      sees own (when named).
--    INSERT: super_admin / admin always; otherwise the row's requester_staff_id
--      must map back to auth.uid() via staff.profile_id.
--    UPDATE: super_admin / admin always; requester can cancel; counterparty
--      can accept; admin/super_admin perform final HR approve/reject.
--    DELETE: admin / super_admin only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_shift_swap_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_shift_swap_requests_select"
  ON public.hr_shift_swap_requests;
CREATE POLICY "hr_shift_swap_requests_select"
  ON public.hr_shift_swap_requests FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_swap_requests.requester_staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_swap_requests.counterparty_staff_id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_shift_swap_requests_insert"
  ON public.hr_shift_swap_requests;
CREATE POLICY "hr_shift_swap_requests_insert"
  ON public.hr_shift_swap_requests FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_swap_requests.requester_staff_id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_shift_swap_requests_update"
  ON public.hr_shift_swap_requests;
CREATE POLICY "hr_shift_swap_requests_update"
  ON public.hr_shift_swap_requests FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_swap_requests.requester_staff_id
        AND s.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = hr_shift_swap_requests.counterparty_staff_id
        AND s.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "hr_shift_swap_requests_delete"
  ON public.hr_shift_swap_requests;
CREATE POLICY "hr_shift_swap_requests_delete"
  ON public.hr_shift_swap_requests FOR DELETE USING (
    is_super_admin() OR is_admin()
  );
