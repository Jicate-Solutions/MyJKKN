-- P2.1b — Auto-allocation batch + batch linkage + RLS.

CREATE TABLE IF NOT EXISTS public.hostel_allocation_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  category_id      uuid NOT NULL REFERENCES hostel_categories(id),
  academic_year_id uuid NOT NULL REFERENCES academic_years(id),
  status           text NOT NULL DEFAULT 'pending_approval'
                     CHECK (status IN ('pending_approval','approved','rejected')),
  allocated_count  int  NOT NULL DEFAULT 0,
  skipped_count    int  NOT NULL DEFAULT 0,
  notes            text,
  created_by       uuid REFERENCES profiles(id),
  approved_by      uuid REFERENCES profiles(id),
  approved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hostel_allocations
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.hostel_allocation_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hostel_allocations_batch ON public.hostel_allocations (batch_id);

DROP TRIGGER IF EXISTS trg_alloc_batches_updated_at ON public.hostel_allocation_batches;
CREATE TRIGGER trg_alloc_batches_updated_at
  BEFORE UPDATE ON public.hostel_allocation_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: batches ──
ALTER TABLE public.hostel_allocation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY hostel_alloc_batches_select ON public.hostel_allocation_batches
  FOR SELECT TO authenticated USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('campus_living.allocations.view')
    OR user_has_permission('campus_living.allocations.approve')
  );
CREATE POLICY hostel_alloc_batches_write ON public.hostel_allocation_batches
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ── Additive warden-review policy on allocations ──
-- The base SELECT policy requires allocations.view AND institution AND block
-- access; a block warden may lack institution-scope, so this permissive policy
-- lets an approver see allocations in a block they hold access to (P0 grant).
DROP POLICY IF EXISTS hostel_allocations_warden_review_select ON public.hostel_allocations;
CREATE POLICY hostel_allocations_warden_review_select ON public.hostel_allocations
  FOR SELECT TO authenticated USING (
    user_has_permission('campus_living.allocations.approve')
    AND role_has_block_access(block_id)
  );
