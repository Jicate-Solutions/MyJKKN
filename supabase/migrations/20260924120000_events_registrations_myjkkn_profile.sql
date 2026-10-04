-- ============================================================================
-- events_registrations.myjkkn_profile — who a signed-in registrant was, that day
-- ----------------------------------------------------------------------------
-- The public form (/p/event/[id]/register) is used by guests AND by signed-in
-- MyJKKN users. For a signed-in person the register API now stamps a snapshot
-- of their record onto the registration:
--   learners              → learner id, roll / register number, institution,
--                           department, degree, program, semester
--   learning facilitators → staff row + employee id, designation, institution,
--                           department
--   everyone              → profile id, name, email, phone, person_type
-- Shape: lib/services/events/registration/registrant-profile.ts
-- (MyjkknRegistrantSnapshot). Written once at registration; not resynced.
--
-- The existing institution_id / institution_name / department columns are
-- filled from the same snapshot so the registrations board and its export
-- show them without a join.
-- ============================================================================

ALTER TABLE public.events_registrations
  ADD COLUMN IF NOT EXISTS myjkkn_profile jsonb;

COMMENT ON COLUMN public.events_registrations.myjkkn_profile IS
  'Snapshot of the signed-in registrant''s MyJKKN record at registration time (learner / facilitator / user). NULL for guests. Shape: MyjkknRegistrantSnapshot.';

CREATE INDEX IF NOT EXISTS idx_events_registrations_myjkkn_person_type
  ON public.events_registrations ((myjkkn_profile->>'person_type'))
  WHERE myjkkn_profile IS NOT NULL;
