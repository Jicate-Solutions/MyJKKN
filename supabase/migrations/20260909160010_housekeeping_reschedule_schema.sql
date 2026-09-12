-- Housekeeping reschedule, migration 1 of 3: the audit trail table.
--
-- WHY THIS EXISTS. A warden's only two moves on a live booking were "reassign
-- the cleaner" and "cancel". When the assigned cleaner turns out to be
-- unavailable at that hour, cancelling was the escape -- and it costs the
-- learner the booking with no explanation attached to it anywhere.
--
-- Design notes that are NOT obvious from the DDL:
--
--   * ONE ROW PER MOVE, not columns on the booking. A booking pushed twice has
--     two reasons, and the learner is shown both. Last-move columns would
--     overwrite the first reason with the second.
--
--   * from_cleaner_name / to_cleaner_name are SNAPSHOTS for the same reason
--     hostel_cleaning_bookings.cleaner_name is one: learners must never need
--     SELECT on hostel_cleaners, which holds staff phone numbers. Postgres RLS
--     is row-level, not column-level -- exposing the row exposes the PII.
--
--   * The slot must actually MOVE (the last CHECK). Changing only the cleaner
--     is the existing Assign action, not a reschedule, and letting it write a
--     row here would fill the learner's history with entries that say nothing.
--
--   * reason_note is required only for reason_code 'other'. A preset reason is
--     already a sentence; 'Other' without a note is not.
--
--   * SELECT is the only policy. INSERT is RPC-only, exactly like
--     hostel_cleaning_bookings itself, so PostgREST refuses writes for every
--     role. fn_cl_housekeeping_reschedule (SECURITY DEFINER) is the one writer.
--
--   * That SELECT policy delegates to the bookings policy rather than restating
--     it. Same shape as hk_photos_select: the subquery is evaluated as the
--     caller, so admin (.view + institution access), super admin and "I live in
--     that room" all resolve through ONE wall and cannot drift apart.
--
-- APPLIED through the Supabase MCP apply_migration transport, which stamps its
-- own version: this body is recorded as 20260909061128
-- (housekeeping_reschedule_schema), not as the filename's version. The filename
-- is 160010 rather than 160000 because 20260909160000 was already taken by
-- campus_living_block_scope_is_a_scope.

CREATE TABLE public.hostel_cleaning_booking_reschedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES public.hostel_cleaning_bookings(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),

  from_date         date NOT NULL,
  from_slot_start   time NOT NULL,
  from_slot_end     time NOT NULL,
  to_date           date NOT NULL,
  to_slot_start     time NOT NULL,
  to_slot_end       time NOT NULL,

  from_cleaner_id   uuid REFERENCES public.hostel_cleaners(id),
  from_cleaner_name text,
  to_cleaner_id     uuid REFERENCES public.hostel_cleaners(id),
  to_cleaner_name   text,

  reason_code       text NOT NULL CHECK (reason_code IN (
                      'cleaner_unavailable',
                      'cleaner_on_leave',
                      'slot_full',
                      'learner_requested',
                      'emergency',
                      'other')),
  reason_note       text,

  rescheduled_by    uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_hk_reschedule_note_for_other
    CHECK (reason_code <> 'other'
           OR nullif(btrim(COALESCE(reason_note, '')), '') IS NOT NULL),
  CONSTRAINT ck_hk_reschedule_slot_moved
    CHECK ((to_date, to_slot_start) IS DISTINCT FROM (from_date, from_slot_start))
);

CREATE INDEX idx_hk_reschedules_booking      ON public.hostel_cleaning_booking_reschedules (booking_id, created_at);
CREATE INDEX idx_hk_reschedules_institution  ON public.hostel_cleaning_booking_reschedules (institution_id);
CREATE INDEX idx_hk_reschedules_by           ON public.hostel_cleaning_booking_reschedules (rescheduled_by);
CREATE INDEX idx_hk_reschedules_from_cleaner ON public.hostel_cleaning_booking_reschedules (from_cleaner_id);
CREATE INDEX idx_hk_reschedules_to_cleaner   ON public.hostel_cleaning_booking_reschedules (to_cleaner_id);

ALTER TABLE public.hostel_cleaning_booking_reschedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY hk_reschedules_select ON public.hostel_cleaning_booking_reschedules FOR SELECT
USING ((EXISTS ( SELECT 1
   FROM public.hostel_cleaning_bookings b
  WHERE (b.id = hostel_cleaning_booking_reschedules.booking_id))));

GRANT SELECT ON public.hostel_cleaning_booking_reschedules TO authenticated;
