-- 20270105090000_recording_booking_ownership.sql
--
-- A recording may only be attached to a meeting the recorder actually hosts.
--
-- WHY. 20260915120001 moved the allow-list into the INSERT policy after a blind
-- review pointed out that checking it in the route alone made it a UI hint —
-- anyone signed in could write the row straight through PostgREST with the anon
-- key that ships in every page bundle. #3836 then added `booking_id` and
-- checked ownership of that booking IN THE ROUTE, and nowhere else. The same
-- argument applies word for word, and the same review caught it: an
-- allow-listed person can insert a recording pointed at anybody's meeting, and
-- the route never runs.
--
-- The hole is wider than the insert. `mrec_owner_update` checks only that the
-- row is yours, so a recording created with no booking (which passes every
-- check) can be UPDATEd afterwards to carry someone else's booking_id. Both
-- doors are closed here, or neither is.
--
-- WHAT COUNTS AS YOURS. The booking's host_profile_id, not merely a booking you
-- can see. Stated explicitly rather than leaning on mb_host_select, because a
-- super admin sees every booking and "can read it" would quietly become "may
-- attach a recording to it". Super admins keep an explicit escape hatch in the
-- policies, so the exception is visible rather than a side effect.
--
-- The recording itself is unaffected: booking_id IS NULL is always allowed, and
-- that is what /meetings/record writes when it is opened on its own.

CREATE OR REPLACE FUNCTION public.fn_may_attach_recording(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    p_booking_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.meeting_bookings b
      WHERE b.id = p_booking_id
        AND b.host_profile_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.fn_may_attach_recording(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_may_attach_recording(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_may_attach_recording(uuid) IS
  'True when this recording may hang on that meeting: no meeting at all, or one the caller hosts. SECURITY INVOKER — auth.uid() is the caller, and RLS on meeting_bookings applies, so it can never report on a booking the caller cannot see.';

-- ── INSERT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "mrec_allowlisted_insert" ON public.meeting_recordings;
CREATE POLICY "mrec_allowlisted_insert" ON public.meeting_recordings
FOR INSERT WITH CHECK (
  (
    recorded_by = auth.uid()
    AND public.fn_may_record_meetings()
    AND public.fn_may_attach_recording(booking_id)
  )
  OR is_super_admin()
);

-- ── UPDATE ───────────────────────────────────────────────────────────────────
-- USING is unchanged: which rows you may touch is still "your own". The new
-- guard is on WITH CHECK, which governs what the row may become — without it,
-- the insert guard is one UPDATE away from meaningless.
DROP POLICY IF EXISTS "mrec_owner_update" ON public.meeting_recordings;
CREATE POLICY "mrec_owner_update" ON public.meeting_recordings
FOR UPDATE USING (recorded_by = auth.uid() OR is_super_admin())
WITH CHECK (
  (recorded_by = auth.uid() AND public.fn_may_attach_recording(booking_id))
  OR is_super_admin()
);

-- ── the guard's own check ────────────────────────────────────────────────────
-- Both policies must exist afterwards. A DROP that succeeded and a CREATE that
-- silently did not would leave the table with NO insert policy at all, which
-- fails closed for writes but would also stop the feature dead — and a
-- migration that half-applied is worth hearing about at apply time rather than
-- from a host whose recording will not start.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_recordings'
      AND policyname = 'mrec_allowlisted_insert'
  ) THEN
    RAISE EXCEPTION 'mrec_allowlisted_insert is missing after this migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_recordings'
      AND policyname = 'mrec_owner_update'
  ) THEN
    RAISE EXCEPTION 'mrec_owner_update is missing after this migration';
  END IF;
END $$;
