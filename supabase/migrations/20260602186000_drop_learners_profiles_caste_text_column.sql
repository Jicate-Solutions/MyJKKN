-- Drop learners_profiles.caste TEXT column (FK-only). caste_id (FK -> castes) is
-- the sole source of truth; reads derive the name via a castes join; writes /
-- bulk import / profile change-requests resolve to caste_id (community-scoped).
-- The FK->text sync trigger was dropped in 20260602185000; no view/trigger
-- depends on the column; caste is nullable so no NOT NULL window.
ALTER TABLE public.learners_profiles DROP COLUMN caste;
