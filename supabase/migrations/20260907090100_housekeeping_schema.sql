-- Housekeeping rebuild, migration 2 of 4: schema.
--
-- Design notes that are NOT obvious from the DDL:
--
--   * bookings.learner_id references profiles(id), NOT learners_profiles(id).
--     hostel_allocations.learner_id is itself a FK to profiles(id) despite the
--     column name: all 714 live allocations resolve that way, zero resolve
--     through profiles.learner_id. The OLD bookings table pointed at
--     learners_profiles and was joining two different id spaces.
--     The chain is: auth.uid() = profiles.id = hostel_allocations.learner_id
--     = hostel_attendance.learner_id (verified 15,822/15,822 rows).
--
--   * The room lock is ux_hk_one_live_booking_per_room, a PARTIAL UNIQUE INDEX.
--     Two roommates tapping Book in the same second get one booking and one
--     23505. There is no application path around it.
--
--   * bookings carries four snapshot columns (type_name, duration_minutes,
--     expected_cost_inr, cleaner_name) so renaming a type, editing its
--     expenses, deactivating it, or retiring a cleaner never rewrites the
--     history of jobs already done.
--
--   * cleaner_name is a snapshot specifically so learners never need SELECT on
--     hostel_cleaners, which holds staff phone numbers. Postgres RLS is
--     row-level, not column-level: exposing the row exposes the PII.
--
--   * An EMPTY hostel_cleaning_type_categories set means NOBODY can book that
--     type. It fails closed. The types UI must warn on a type with no
--     categories, because it is invisible to every learner.
--
--   * hostel_categories is a GLOBAL lookup with no institution_id (12 rows,
--     gender-split). The junction is what makes a type institution-scoped.
--
--   * This migration recreates a table named hostel_cleaning_bookings, which
--     is what makes fn_delete_hostel_room() work again -- its body runs
--     DELETE FROM hostel_cleaning_bookings and broke when migration 1 dropped
--     the old table. Verified after applying.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md sections 3, 8
--
-- APPLIED over a direct SQL connection, not scripts/apply-migration-file.mjs:
-- the exec_sql HTTP transport aborts files this size at ~9s with 57014. See
-- the header of 20260907085000_housekeeping_teardown.sql.

-- ==========================================================================
-- 1. hostel_cleaning_types
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  name              text NOT NULL,
  description       text,
  duration_minutes  integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  usage_limit_count integer NOT NULL CHECK (usage_limit_count >= 1),
  usage_period      text    NOT NULL CHECK (usage_period IN ('day','week','month')),
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_types_institution ON public.hostel_cleaning_types (institution_id);
CREATE INDEX idx_hk_types_created_by  ON public.hostel_cleaning_types (created_by);
CREATE UNIQUE INDEX ux_hk_types_name_per_institution
  ON public.hostel_cleaning_types (institution_id, lower(name));
CREATE TRIGGER t_hk_types_touch BEFORE UPDATE ON public.hostel_cleaning_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_types ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 2. hostel_cleaning_type_expenses
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_type_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id        uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  item_name      text NOT NULL,
  unit           text,
  quantity       numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_cost_inr  numeric(10,2) NOT NULL CHECK (unit_cost_inr >= 0),
  line_total_inr numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost_inr) STORED,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_type_expenses_type        ON public.hostel_cleaning_type_expenses (type_id);
CREATE INDEX idx_hk_type_expenses_institution ON public.hostel_cleaning_type_expenses (institution_id);
CREATE TRIGGER t_hk_type_expenses_touch BEFORE UPDATE ON public.hostel_cleaning_type_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_type_expenses ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 3. hostel_cleaning_type_categories  (eligibility junction)
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_type_categories (
  type_id     uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.hostel_categories(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type_id, category_id)
);
CREATE INDEX idx_hk_type_categories_category ON public.hostel_cleaning_type_categories (category_id);
ALTER TABLE public.hostel_cleaning_type_categories ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 4. hostel_cleaners  (directory records; NO login, NO profile link)
-- ==========================================================================
CREATE TABLE public.hostel_cleaners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  full_name      text NOT NULL,
  phone          text,
  gender         text CHECK (gender IN ('Male','Female','Other')),
  employee_code  text,
  -- Postgres DOW: 0=Sunday .. 6=Saturday. Default is Mon-Sat.
  working_days   integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  shift_start    time,
  shift_end      time,
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hk_cleaners_shift
    CHECK (shift_end IS NULL OR shift_start IS NULL OR shift_end > shift_start),
  CONSTRAINT ck_hk_cleaners_working_days
    CHECK (working_days <@ ARRAY[0,1,2,3,4,5,6])
);
CREATE INDEX idx_hk_cleaners_institution ON public.hostel_cleaners (institution_id);
CREATE TRIGGER t_hk_cleaners_touch BEFORE UPDATE ON public.hostel_cleaners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaners ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 5. hostel_cleaner_blocks
-- ==========================================================================
CREATE TABLE public.hostel_cleaner_blocks (
  cleaner_id uuid NOT NULL REFERENCES public.hostel_cleaners(id) ON DELETE CASCADE,
  block_id   uuid NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cleaner_id, block_id)
);
CREATE INDEX idx_hk_cleaner_blocks_block ON public.hostel_cleaner_blocks (block_id);
ALTER TABLE public.hostel_cleaner_blocks ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 6. hostel_cleaning_availability  (per block, per weekday)
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_availability (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  block_id       uuid NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  weekday        integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open        boolean NOT NULL DEFAULT true,
  window_start   time NOT NULL DEFAULT '09:00',
  window_end     time NOT NULL DEFAULT '17:00',
  capacity       integer NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hk_availability_window CHECK (window_end > window_start),
  CONSTRAINT ux_hk_availability_block_weekday UNIQUE (block_id, weekday)
);
CREATE INDEX idx_hk_availability_institution ON public.hostel_cleaning_availability (institution_id);
CREATE TRIGGER t_hk_availability_touch BEFORE UPDATE ON public.hostel_cleaning_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_availability ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 7. hostel_cleaning_bookings  (the core record)
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  block_id          uuid NOT NULL REFERENCES public.hostel_blocks(id),
  room_id           uuid NOT NULL REFERENCES public.hostel_rooms(id),
  allocation_id     uuid NOT NULL REFERENCES public.hostel_allocations(id),
  -- profiles(id), matching hostel_allocations.learner_id. See header note.
  learner_id        uuid NOT NULL REFERENCES public.profiles(id),
  type_id           uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE RESTRICT,

  booking_date      date NOT NULL,
  slot_start        time NOT NULL,
  slot_end          time NOT NULL,
  status            text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','assigned','in_progress','awaiting_feedback','completed','cancelled')),

  cleaner_id        uuid REFERENCES public.hostel_cleaners(id),
  cleaner_name      text,
  assigned_at       timestamptz,
  assigned_by       uuid REFERENCES public.profiles(id),

  started_at        timestamptz,
  finished_at       timestamptz,

  -- Display + notification scheduling only. The hold predicate is
  -- booking_date < p_date (fn_cl_housekeeping_feedback_holds), the authority.
  feedback_due_at   timestamptz NOT NULL,

  -- Snapshots, frozen at booking / assign time.
  type_name         text NOT NULL,
  duration_minutes  integer NOT NULL,
  expected_cost_inr numeric(12,2) NOT NULL DEFAULT 0,

  waived_at         timestamptz,
  waived_by         uuid REFERENCES public.profiles(id),
  waive_reason      text,

  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES public.profiles(id),
  cancel_reason     text,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_hk_bookings_slot  CHECK (slot_end > slot_start),
  CONSTRAINT ck_hk_bookings_waive CHECK (waived_at IS NULL OR waive_reason IS NOT NULL)
);

-- THE ROOM LOCK. One live booking per room, enforced by the database.
CREATE UNIQUE INDEX ux_hk_one_live_booking_per_room
  ON public.hostel_cleaning_bookings (room_id)
  WHERE status IN ('booked','assigned','in_progress','awaiting_feedback');

CREATE INDEX idx_hk_bookings_institution_date ON public.hostel_cleaning_bookings (institution_id, booking_date);
CREATE INDEX idx_hk_bookings_block_date       ON public.hostel_cleaning_bookings (block_id, booking_date);
CREATE INDEX idx_hk_bookings_room_date        ON public.hostel_cleaning_bookings (room_id, booking_date);
CREATE INDEX idx_hk_bookings_cleaner_date     ON public.hostel_cleaning_bookings (cleaner_id, booking_date);
CREATE INDEX idx_hk_bookings_learner          ON public.hostel_cleaning_bookings (learner_id);
CREATE INDEX idx_hk_bookings_allocation       ON public.hostel_cleaning_bookings (allocation_id);
CREATE INDEX idx_hk_bookings_type             ON public.hostel_cleaning_bookings (type_id);
CREATE INDEX idx_hk_bookings_assigned_by      ON public.hostel_cleaning_bookings (assigned_by);
CREATE INDEX idx_hk_bookings_waived_by        ON public.hostel_cleaning_bookings (waived_by);
CREATE INDEX idx_hk_bookings_cancelled_by     ON public.hostel_cleaning_bookings (cancelled_by);

-- The attendance-hold lookup. Deliberately narrow: only a handful of rows sit
-- in awaiting_feedback at any moment, which is what keeps the hostel_attendance
-- trigger cheap on a 15,822-row hot table.
CREATE INDEX idx_hk_bookings_awaiting_feedback
  ON public.hostel_cleaning_bookings (room_id, booking_date)
  WHERE status = 'awaiting_feedback';

CREATE TRIGGER t_hk_bookings_touch BEFORE UPDATE ON public.hostel_cleaning_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_bookings ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 8. hostel_cleaning_booking_photos
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_booking_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES public.hostel_cleaning_bookings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  phase          text NOT NULL CHECK (phase IN ('before','after')),
  drive_file_id  text NOT NULL,
  drive_url      text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  uploaded_by    uuid NOT NULL REFERENCES public.profiles(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_photos_booking     ON public.hostel_cleaning_booking_photos (booking_id);
CREATE INDEX idx_hk_photos_institution ON public.hostel_cleaning_booking_photos (institution_id);
CREATE INDEX idx_hk_photos_uploader    ON public.hostel_cleaning_booking_photos (uploaded_by);
ALTER TABLE public.hostel_cleaning_booking_photos ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- 9. hostel_cleaning_feedback
-- ==========================================================================
CREATE TABLE public.hostel_cleaning_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES public.hostel_cleaning_bookings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  room_id        uuid NOT NULL REFERENCES public.hostel_rooms(id),
  learner_id     uuid NOT NULL REFERENCES public.profiles(id),
  rating         integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_hk_feedback_one_per_learner UNIQUE (booking_id, learner_id)
);
CREATE INDEX idx_hk_feedback_booking     ON public.hostel_cleaning_feedback (booking_id);
CREATE INDEX idx_hk_feedback_institution ON public.hostel_cleaning_feedback (institution_id);
CREATE INDEX idx_hk_feedback_room        ON public.hostel_cleaning_feedback (room_id);
CREATE INDEX idx_hk_feedback_learner     ON public.hostel_cleaning_feedback (learner_id);
ALTER TABLE public.hostel_cleaning_feedback ENABLE ROW LEVEL SECURITY;

-- ==========================================================================
-- RLS POLICIES
--
-- One permissive policy per table per verb. Every auth call is wrapped in a
-- scalar subquery so it evaluates once per query (InitPlan) rather than once
-- per candidate row.
--
-- Learner access is deliberately narrow:
--   types, type_categories     : SELECT yes (they must see what they can book)
--   type_expenses              : SELECT NO  (institution cost data)
--   cleaners, cleaner_blocks   : SELECT NO  (phone numbers; RLS is row-level,
--                                so exposing the row exposes the PII. The
--                                learner sees bookings.cleaner_name instead.)
--   availability               : SELECT NO  (the slots RPC is DEFINER)
--   bookings, photos, feedback : SELECT yes, scoped to their own room
--
-- hostel_cleaning_bookings gets NO INSERT and NO DELETE policy on purpose:
-- both are RPC-only, so PostgREST refuses them for every role.
--
-- The bodies below are as Postgres normalised them (dumped from pg_policy
-- after applying), so this file is exactly what is live.
-- ==========================================================================

CREATE POLICY hk_types_select ON public.hostel_cleaning_types FOR SELECT
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (is_active AND (EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE ((a.learner_id = ( SELECT auth.uid() AS uid)) AND (a.institution_id = hostel_cleaning_types.institution_id) AND ((a.status)::text = ANY (fn_cl_roster_statuses()))))))));

CREATE POLICY hk_types_insert ON public.hostel_cleaning_types FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_types_update ON public.hostel_cleaning_types FOR UPDATE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_types_delete ON public.hostel_cleaning_types FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_type_expenses_select ON public.hostel_cleaning_type_expenses FOR SELECT
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_type_expenses_insert ON public.hostel_cleaning_type_expenses FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_type_expenses_update ON public.hostel_cleaning_type_expenses FOR UPDATE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_type_expenses_delete ON public.hostel_cleaning_type_expenses FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_type_categories_select ON public.hostel_cleaning_type_categories FOR SELECT
USING ((EXISTS ( SELECT 1
   FROM hostel_cleaning_types t
  WHERE (t.id = hostel_cleaning_type_categories.type_id))));

CREATE POLICY hk_type_categories_insert ON public.hostel_cleaning_type_categories FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM hostel_cleaning_types t
  WHERE ((t.id = hostel_cleaning_type_categories.type_id) AND ( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(t.institution_id))))));

CREATE POLICY hk_type_categories_delete ON public.hostel_cleaning_type_categories FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM hostel_cleaning_types t
  WHERE ((t.id = hostel_cleaning_type_categories.type_id) AND ( SELECT user_has_permission('campus_living.housekeeping.types_manage'::text) AS user_has_permission) AND role_has_institution_access(t.institution_id))))));

CREATE POLICY hk_cleaners_select ON public.hostel_cleaners FOR SELECT
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_cleaners_insert ON public.hostel_cleaners FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_cleaners_update ON public.hostel_cleaners FOR UPDATE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_cleaners_delete ON public.hostel_cleaners FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_cleaner_blocks_select ON public.hostel_cleaner_blocks FOR SELECT
USING ((EXISTS ( SELECT 1
   FROM hostel_cleaners c
  WHERE (c.id = hostel_cleaner_blocks.cleaner_id))));

CREATE POLICY hk_cleaner_blocks_insert ON public.hostel_cleaner_blocks FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM hostel_cleaners c
  WHERE ((c.id = hostel_cleaner_blocks.cleaner_id) AND ( SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'::text) AS user_has_permission) AND role_has_institution_access(c.institution_id))))));

CREATE POLICY hk_cleaner_blocks_delete ON public.hostel_cleaner_blocks FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (EXISTS ( SELECT 1
   FROM hostel_cleaners c
  WHERE ((c.id = hostel_cleaner_blocks.cleaner_id) AND ( SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'::text) AS user_has_permission) AND role_has_institution_access(c.institution_id))))));

CREATE POLICY hk_availability_select ON public.hostel_cleaning_availability FOR SELECT
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_availability_insert ON public.hostel_cleaning_availability FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.availability_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_availability_update ON public.hostel_cleaning_availability FOR UPDATE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.availability_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_availability_delete ON public.hostel_cleaning_availability FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.availability_manage'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_bookings_select ON public.hostel_cleaning_bookings FOR SELECT
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.view'::text) AS user_has_permission) AND role_has_institution_access(institution_id)) OR (EXISTS ( SELECT 1
   FROM hostel_allocations a
  WHERE ((a.room_id = hostel_cleaning_bookings.room_id) AND (a.learner_id = ( SELECT auth.uid() AS uid)) AND ((a.status)::text = ANY (fn_cl_roster_statuses())))))));

CREATE POLICY hk_bookings_update ON public.hostel_cleaning_bookings FOR UPDATE
USING ((( SELECT is_super_admin() AS is_super_admin) OR ((( SELECT user_has_permission('campus_living.housekeeping.execute'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.assign'::text) AS user_has_permission) OR ( SELECT user_has_permission('campus_living.housekeeping.waive'::text) AS user_has_permission)) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_photos_select ON public.hostel_cleaning_booking_photos FOR SELECT
USING ((EXISTS ( SELECT 1
   FROM hostel_cleaning_bookings b
  WHERE (b.id = hostel_cleaning_booking_photos.booking_id))));

CREATE POLICY hk_photos_insert ON public.hostel_cleaning_booking_photos FOR INSERT
WITH CHECK ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.execute'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_photos_delete ON public.hostel_cleaning_booking_photos FOR DELETE
USING ((( SELECT is_super_admin() AS is_super_admin) OR (( SELECT user_has_permission('campus_living.housekeeping.execute'::text) AS user_has_permission) AND role_has_institution_access(institution_id))));

CREATE POLICY hk_feedback_select ON public.hostel_cleaning_feedback FOR SELECT
USING ((EXISTS ( SELECT 1
   FROM hostel_cleaning_bookings b
  WHERE (b.id = hostel_cleaning_feedback.booking_id))));

CREATE POLICY hk_feedback_insert ON public.hostel_cleaning_feedback FOR INSERT
WITH CHECK (((learner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (hostel_cleaning_bookings b
     JOIN hostel_allocations a ON ((a.room_id = b.room_id)))
  WHERE ((b.id = hostel_cleaning_feedback.booking_id) AND (b.status = 'awaiting_feedback'::text) AND (a.learner_id = ( SELECT auth.uid() AS uid)) AND ((a.status)::text = ANY (fn_cl_roster_statuses())))))));

-- ==========================================================================
-- ANON LOCK
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`,
-- so a new public-schema table can be born with SELECT/INSERT/UPDATE/DELETE
-- granted to the anon key embedded in every page of the public site. RLS is
-- NOT a substitute: CREATE TABLE AS never enables it, and a policy written
-- TO PUBLIC still applies to anon.
--
-- This project's live grants were already clean when the tables were created,
-- but the lock has to live in the migration so a replay onto a stock Supabase
-- project is safe too. Enforced by scripts/ci/check-table-anon-revoke.mjs.
--
-- The authenticated grants are the coarse door; RLS decides the rows. Two are
-- deliberately narrower than the rest:
--   bookings — no INSERT/DELETE: those are RPC-only (fn_cl_housekeeping_book /
--              _cancel), and no policy exists for them either.
--   feedback — no UPDATE/DELETE: a rating is a record of what someone said at
--              the time, not an editable field.
-- ==========================================================================
REVOKE ALL ON TABLE public.hostel_cleaning_types            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_type_expenses    FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_type_categories  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaners                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaner_blocks            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_availability     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_bookings         FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_booking_photos   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_cleaning_feedback         FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaning_types            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaning_type_expenses    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaning_type_categories  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaners                  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaner_blocks            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hostel_cleaning_availability     TO authenticated;
GRANT SELECT, UPDATE                 ON TABLE public.hostel_cleaning_bookings         TO authenticated;
GRANT SELECT, INSERT, DELETE         ON TABLE public.hostel_cleaning_booking_photos   TO authenticated;
GRANT SELECT, INSERT                 ON TABLE public.hostel_cleaning_feedback         TO authenticated;
