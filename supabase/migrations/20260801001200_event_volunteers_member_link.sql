-- ─── Event volunteers: link JKKN volunteers to their MyJKKN user ─────────────
-- 2026-07-10 (applied via MCP as `event_volunteers_member_link`)
-- event_volunteer_checkins stored only a free-text volunteer_name, so a JKKN
-- staff member / student volunteering was indistinguishable from a typo and
-- could not be resolved back to a profile. Mirrors the committee-member model:
--   member_id   = auth uid (staff.profile_id) or learners_profiles.id
--   member_role = 'staff' | 'student'  (NULL for external guests)
-- Guests keep external_name/external_phone and leave these NULL.

ALTER TABLE public.event_volunteer_checkins
  ADD COLUMN IF NOT EXISTS member_id   uuid,
  ADD COLUMN IF NOT EXISTS member_role text,
  ADD COLUMN IF NOT EXISTS member_email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_volunteer_checkins_member_role_check'
  ) THEN
    ALTER TABLE public.event_volunteer_checkins
      ADD CONSTRAINT event_volunteer_checkins_member_role_check
      CHECK (member_role IS NULL OR member_role IN ('staff', 'student'));
  END IF;
END $$;

-- One active (not checked-out) check-in per JKKN person per event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_volunteers_member_active
  ON public.event_volunteer_checkins (event_id, member_id)
  WHERE member_id IS NOT NULL AND checked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_volunteers_member
  ON public.event_volunteer_checkins (member_id)
  WHERE member_id IS NOT NULL;

COMMENT ON COLUMN public.event_volunteer_checkins.member_id IS
  'MyJKKN user this volunteer is: staff.profile_id (auth uid) or learners_profiles.id. NULL for external guest volunteers (see external_name/external_phone).';
COMMENT ON COLUMN public.event_volunteer_checkins.member_role IS
  'staff | student — which directory member_id came from. NULL for guests.';
