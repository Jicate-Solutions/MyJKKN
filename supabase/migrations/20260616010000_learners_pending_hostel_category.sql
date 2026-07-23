-- Staged (pending) hostel category for in-flight upgrades. Set when a learner confirms
-- a category upgrade; promoted into hostel_category_id on payment + academic threshold;
-- cleared (reverted) when the hold deadline passes unpaid. See
-- docs/superpowers/specs/2026-06-15-hostel-pending-category-upgrade-design.md
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS pending_hostel_category_id uuid
    REFERENCES public.hostel_categories(id) ON DELETE SET NULL;
