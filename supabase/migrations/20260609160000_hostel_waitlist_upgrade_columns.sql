-- 20260609160000_hostel_waitlist_upgrade_columns.sql
-- Reuse hostel_waitlist for self-service category-upgrade intent.
ALTER TABLE public.hostel_waitlist
  ADD COLUMN IF NOT EXISTS target_hostel_category_id uuid REFERENCES public.hostel_categories(id),
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'allocation';

COMMENT ON COLUMN public.hostel_waitlist.target_hostel_category_id IS
  'entry_kind=upgrade: room category the resident wants to move up to.';
COMMENT ON COLUMN public.hostel_waitlist.entry_kind IS
  'allocation = first-allocation preference (legacy); upgrade = self-service category upgrade intent.';

-- At most one active upgrade intent per (resident, target category).
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_waitlist_active_upgrade
  ON public.hostel_waitlist (learner_id, target_hostel_category_id)
  WHERE entry_kind = 'upgrade' AND status = 'waiting';
