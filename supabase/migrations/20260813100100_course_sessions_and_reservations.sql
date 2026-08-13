-- =====================================================================
-- Course Events — sessions, and the link into Resource Management
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id   uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  session_no        int,
  title             text,
  session_date      date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  trainer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trainer_name      text,
  venue_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  venue_text        text,
  reservation_id    uuid REFERENCES public.resource_reservations(id) ON DELETE SET NULL,
  is_cancelled      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_sessions_time_order_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_course_sessions_event
  ON public.course_sessions (course_event_id, session_date);
CREATE INDEX IF NOT EXISTS idx_course_sessions_date
  ON public.course_sessions (session_date) WHERE NOT is_cancelled;

COMMENT ON TABLE public.course_sessions IS
  'One scheduled sitting of a course. Each session holds its OWN venue reservation, so a weekend bootcamp books only the Saturdays it uses rather than blocking a hall for months.';
COMMENT ON COLUMN public.course_sessions.trainer_name IS
  'Free text for an external trainer who has no profile. Use trainer_profile_id for internal staff.';

CREATE TRIGGER trg_course_sessions_touch
  BEFORE UPDATE ON public.course_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- resource_reservations: a third owner kind
-- ---------------------------------------------------------------------
-- This is a FK to a DIFFERENT table than the existing event_id and
-- session_id links, so it does not create a second FK to one table and
-- therefore does not disturb any PostgREST embed on this table.
--
-- The old CHECK forbade event_id and session_id being set together. The
-- replacement generalises that to "at most one owner" across all three,
-- using num_nonnulls rather than three pairwise NOT-AND clauses.
-- ---------------------------------------------------------------------
ALTER TABLE public.resource_reservations
  ADD COLUMN IF NOT EXISTS course_session_id uuid
  REFERENCES public.course_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.resource_reservations
  DROP CONSTRAINT IF EXISTS resource_reservations_event_or_session_check;

ALTER TABLE public.resource_reservations
  ADD CONSTRAINT resource_reservations_single_owner_check
  CHECK (num_nonnulls(event_id, session_id, course_session_id) <= 1);

CREATE INDEX IF NOT EXISTS idx_resource_reservations_course_session
  ON public.resource_reservations (course_session_id)
  WHERE course_session_id IS NOT NULL;

COMMENT ON COLUMN public.resource_reservations.course_session_id IS
  'Set when this reservation was raised to hold a venue for one course session. Mutually exclusive with event_id and session_id.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.course_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_sessions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_sessions TO authenticated;

CREATE POLICY course_sessions_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_sessions_manage ON public.course_sessions
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.sessions.manage'))
        AND public.role_has_institution_access(institution_id))
  );
