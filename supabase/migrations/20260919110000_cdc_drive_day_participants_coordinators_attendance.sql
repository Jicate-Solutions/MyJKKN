-- =============================================================================
-- CDC Drives — drive-day slice: finalized participants, assigned coordinators,
-- status-based attendance, and a per-drive activity log.
-- =============================================================================
-- Everything hangs off (drive_id, learner_id). No learner master data is copied:
-- names / programs / contacts are always joined from learners_profiles.
--
--   willingness (Willing) ──finalize──▶ cdc_drive_participants ──▶ attendance roster
--
-- Additive + idempotent. Ships as a FILE — apply out of band.
-- Writes go through the service role behind API gates:
--   participants / coordinators : cdc.drives.edit
--   attendance                  : cdc.drives.edit OR an assigned coordinator
-- =============================================================================

-- 1. Finalized participants ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id     uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id   uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  -- 'willing' = came from the willingness list at finalization; 'added' = CDC added by hand.
  source       text NOT NULL DEFAULT 'willing' CHECK (source IN ('willing', 'added')),
  -- Soft removal keeps the history (spec §29: never replace a status without a record).
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  remarks      text,
  added_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at     timestamptz NOT NULL DEFAULT now(),
  removed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at   timestamptz,
  notified_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_drive_participants_one_per_learner UNIQUE (drive_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_participants_drive ON public.cdc_drive_participants (drive_id, status);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_participants_learner ON public.cdc_drive_participants (learner_id);

ALTER TABLE public.cdc_drives
  ADD COLUMN IF NOT EXISTS participants_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS participants_finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Assigned faculty / coordinators -----------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_coordinators (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id     uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- staff.profile_id at assignment time: the login that gets scoped access.
  user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  notified_at  timestamptz,
  CONSTRAINT cdc_drive_coordinators_one_per_staff UNIQUE (drive_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_coordinators_user ON public.cdc_drive_coordinators (user_id);

-- 3. Attendance: status model on the existing per-round table ----------------
ALTER TABLE public.cdc_drive_attendance
  ADD COLUMN IF NOT EXISTS status     text,
  ADD COLUMN IF NOT EXISTS remarks    text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cdc_drive_attendance
  DROP CONSTRAINT IF EXISTS cdc_drive_attendance_status_check;
ALTER TABLE public.cdc_drive_attendance
  ADD CONSTRAINT cdc_drive_attendance_status_check
  CHECK (status IS NULL OR status IN ('present', 'absent', 'late', 'excused', 'not_attended'));

COMMENT ON COLUMN public.cdc_drive_attendance.status IS
  'Drive-day attendance status. `attended` is kept in sync (true for present/late) so older readers keep working. Drive-day attendance is round_no = 1.';

-- 4. Activity / audit log -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id        uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id      uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  actor_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role      text,
  action          text NOT NULL,
  previous_value  jsonb,
  new_value       jsonb,
  reason          text,
  ip_address      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_activity_log_drive ON public.cdc_drive_activity_log (drive_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_activity_log_learner ON public.cdc_drive_activity_log (learner_id);

-- 5. RLS ----------------------------------------------------------------------
ALTER TABLE public.cdc_drive_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_coordinators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_activity_log  ENABLE ROW LEVEL SECURITY;

-- Is the caller an assigned coordinator of this drive?
CREATE OR REPLACE FUNCTION public.is_cdc_drive_coordinator(p_drive_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cdc_drive_coordinators c
    WHERE c.drive_id = p_drive_id AND c.user_id = auth.uid()
  );
$$;
-- ci:allow-secdef-authenticated Every signed-in user may call this: the RLS read
-- policies on cdc_drive_participants and cdc_drive_attendance below evaluate it
-- as the querying user, so authenticated must hold EXECUTE. It answers only about
-- the CALLER (c.user_id = auth.uid()) - it cannot be asked about anyone else, and
-- it returns a bare boolean, so there is nothing to disclose beyond "am I one".
REVOKE ALL ON FUNCTION public.is_cdc_drive_coordinator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cdc_drive_coordinator(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "cdc_drive_participants_read" ON public.cdc_drive_participants;
CREATE POLICY "cdc_drive_participants_read" ON public.cdc_drive_participants
  FOR SELECT USING (
    public.is_cdc_staff()
    OR public.is_cdc_drive_coordinator(drive_id)
    OR learner_id IN (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "cdc_drive_coordinators_read" ON public.cdc_drive_coordinators;
CREATE POLICY "cdc_drive_coordinators_read" ON public.cdc_drive_coordinators
  FOR SELECT USING (public.is_cdc_staff() OR user_id = auth.uid());

DROP POLICY IF EXISTS "cdc_drive_activity_log_read" ON public.cdc_drive_activity_log;
CREATE POLICY "cdc_drive_activity_log_read" ON public.cdc_drive_activity_log
  FOR SELECT USING (public.is_cdc_staff());

-- Attendance: coordinators of the drive and the learner themself may READ.
-- (Existing cdc_drive_attendance policies for CDC staff are left as they are.)
DROP POLICY IF EXISTS "cdc_drive_attendance_coordinator_read" ON public.cdc_drive_attendance;
CREATE POLICY "cdc_drive_attendance_coordinator_read" ON public.cdc_drive_attendance
  FOR SELECT USING (
    public.is_cdc_drive_coordinator(drive_id)
    OR learner_id IN (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 6. Grants -------------------------------------------------------------------
-- Updated: 2026-09-19 - explicit anon lock (Supabase's default privileges grant
-- anon ALL on every new public table; RLS alone is not the lock). Reads go
-- through the RLS policies above; every write goes through the service role.
REVOKE ALL ON TABLE public.cdc_drive_participants FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.cdc_drive_coordinators FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.cdc_drive_activity_log FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.cdc_drive_participants TO authenticated;
GRANT SELECT ON TABLE public.cdc_drive_coordinators TO authenticated;
GRANT SELECT ON TABLE public.cdc_drive_activity_log TO authenticated;
