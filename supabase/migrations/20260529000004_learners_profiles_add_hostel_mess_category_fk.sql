-- File: supabase/migrations/20260529000003_learners_profiles_add_hostel_mess_category_fk.sql
-- Phase 2 of the hostel-fee architecture (learner selection): capture the
-- student's chosen hostel room category + mess category at enquiry / profile /
-- student-form time. These are gendered global catalogs in campus-living
-- (hostel_categories.type / mess_categories.type ∈ {boys,girls,mixed}); the
-- forms filter options by the learner's gender. Stored alongside the existing
-- accommodation_type / hostel_type / food_type columns on learners_profiles.
-- Nullable + ON DELETE SET NULL: selection is optional and a category can be
-- archived in campus-living without orphaning learner rows. Phase 3 (billing
-- resolver) will read these to sum room+mess+amenity fees.
BEGIN;

ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS hostel_category_id uuid
    REFERENCES public.hostel_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mess_category_id uuid
    REFERENCES public.mess_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learners_profiles_hostel_category_id
  ON public.learners_profiles(hostel_category_id)
  WHERE hostel_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learners_profiles_mess_category_id
  ON public.learners_profiles(mess_category_id)
  WHERE mess_category_id IS NOT NULL;

COMMIT;
