-- 2026-06-20 — BUG-004052: surface a Staff Coordinator + Student President on clubs.
--
-- The "Staff Coordinator" picker reuses the EXISTING `cdc_clubs.coordinator_staff_id`
-- column (already FK→staff(id), already wired through ClubService.create/update), so
-- this migration only adds the genuinely-new "Student President" column.
--
-- `student_president_id` FK→learners_profiles(id) ON DELETE SET NULL, mirroring how
-- cdc_club_memberships.learner_id references learners_profiles and how coordinator_staff_id
-- nulls (not blocks) on a deleted staff row. Both nullable/optional.

ALTER TABLE public.cdc_clubs
  ADD COLUMN IF NOT EXISTS student_president_id uuid
    REFERENCES public.learners_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cdc_clubs.coordinator_staff_id IS
  'Staff coordinator for this club (FK→staff). Surfaced as "Staff Coordinator" on the club create form. (2026-06-20, BUG-004052)';

COMMENT ON COLUMN public.cdc_clubs.student_president_id IS
  'Student president for this club (FK→learners_profiles, nullable). Surfaced as "Student President" on the club create form. (2026-06-20, BUG-004052)';
