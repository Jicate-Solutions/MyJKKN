-- Cleaning types become a GLOBAL catalogue: institution_id is dropped from
-- hostel_cleaning_types and hostel_cleaning_type_expenses.
--
-- WHY:
--   * A cleaning type is gated on hostel_categories, and hostel_categories is
--     already a global lookup with no institution_id (12 rows, gender-split).
--     20260907090100_housekeeping_schema.sql said so itself -- "the junction is
--     what makes a type institution-scoped" -- which is the tell that the
--     scoping was artificial. "Deep Clean, 45 min, 1/week" is the same service
--     on every campus; re-keying it 14 times bought nothing.
--   * hostel_cleaning_type_expenses.institution_id existed ONLY to give RLS a
--     local column to gate on. Eligibility now flows entirely through type_id.
--   * What is genuinely per-campus is untouched: hostel_cleaners (real staff,
--     real phone numbers) and hostel_cleaning_availability (per block, per
--     weekday windows and capacity) keep their institution_id.
--
-- Safe as pure DDL: all four type tables were EMPTY when this was authored
-- (0 types, 0 expenses, 0 category links, 0 bookings). No backfill.
--
-- The column is NOT replaced by a nullable "NULL means all institutions"
-- override. That shape forces "institution_id IS NULL OR institution_id = X"
-- at every read, and the one time this repo wrote it as a strict equality
-- (calendar entries, scope_institution_ids) a whole institution saw 2 of 26
-- days. One catalogue, one predicate.
--
-- MANAGE GATE: the policies below drop role_has_institution_access() and gate
-- on the permission key alone, so every holder of
-- campus_living.housekeeping.types_manage -- Warden and Chief Warden included,
-- which are per-institution roles -- edits the catalogue every campus books
-- from. That is a deliberate product decision, not an oversight. The types page
-- says so on screen; RLS does not narrow it.
--
-- ORDER MATTERS: Postgres refuses DROP COLUMN while a policy depends on the
-- column, and hk_type_categories_{insert,delete} reference t.institution_id on
-- the PARENT table, so they have to go first too.

-- ==========================================================================
-- 1. Drop the policies that reference institution_id
-- ==========================================================================
-- hk_type_categories_select is deliberately left alone: it never referenced
-- institution_id, only the parent row's existence.
DROP POLICY IF EXISTS hk_types_select           ON public.hostel_cleaning_types;
DROP POLICY IF EXISTS hk_types_insert           ON public.hostel_cleaning_types;
DROP POLICY IF EXISTS hk_types_update           ON public.hostel_cleaning_types;
DROP POLICY IF EXISTS hk_types_delete           ON public.hostel_cleaning_types;
DROP POLICY IF EXISTS hk_type_expenses_select   ON public.hostel_cleaning_type_expenses;
DROP POLICY IF EXISTS hk_type_expenses_insert   ON public.hostel_cleaning_type_expenses;
DROP POLICY IF EXISTS hk_type_expenses_update   ON public.hostel_cleaning_type_expenses;
DROP POLICY IF EXISTS hk_type_expenses_delete   ON public.hostel_cleaning_type_expenses;
DROP POLICY IF EXISTS hk_type_categories_insert ON public.hostel_cleaning_type_categories;
DROP POLICY IF EXISTS hk_type_categories_delete ON public.hostel_cleaning_type_categories;

-- ==========================================================================
-- 2. Drop the columns
-- ==========================================================================
-- Dropping the column also drops idx_hk_types_institution and
-- ux_hk_types_name_per_institution, which was UNIQUE (institution_id, lower(name)).
ALTER TABLE public.hostel_cleaning_types
  DROP COLUMN IF EXISTS institution_id;

-- Drops idx_hk_type_expenses_institution with it.
ALTER TABLE public.hostel_cleaning_type_expenses
  DROP COLUMN IF EXISTS institution_id;

-- One catalogue, so one name. Replaces the per-institution unique index that
-- went out with the column.
CREATE UNIQUE INDEX IF NOT EXISTS ux_hk_types_name
  ON public.hostel_cleaning_types (lower(name));

-- ==========================================================================
-- 3. Recreate the policies without the institution predicate
-- ==========================================================================
-- Same shape as before: one permissive policy per table per verb, every auth
-- helper wrapped in a scalar subquery so it is an InitPlan evaluated once per
-- query rather than once per candidate row.

-- A learner sees an ACTIVE type if they hold any live allocation anywhere. The
-- allocation's institution no longer has to match the type's -- there is no
-- longer a type institution to match.
CREATE POLICY hk_types_select ON public.hostel_cleaning_types FOR SELECT
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.view'::text) )
  OR (is_active AND EXISTS (
        SELECT 1 FROM public.hostel_allocations a
        WHERE a.learner_id = ( SELECT auth.uid() )
          AND (a.status)::text = ANY (public.fn_cl_roster_statuses())
      ))
);

CREATE POLICY hk_types_insert ON public.hostel_cleaning_types FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

CREATE POLICY hk_types_update ON public.hostel_cleaning_types FOR UPDATE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

CREATE POLICY hk_types_delete ON public.hostel_cleaning_types FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

-- Learners still get NO read on expense lines. That is deliberate: the cost
-- breakdown is internal, and the learner already sees the total through the
-- bookings.expected_cost_inr snapshot.
CREATE POLICY hk_type_expenses_select ON public.hostel_cleaning_type_expenses FOR SELECT
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.view'::text) )
);

CREATE POLICY hk_type_expenses_insert ON public.hostel_cleaning_type_expenses FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

CREATE POLICY hk_type_expenses_update ON public.hostel_cleaning_type_expenses FOR UPDATE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

CREATE POLICY hk_type_expenses_delete ON public.hostel_cleaning_type_expenses FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
);

CREATE POLICY hk_type_categories_insert ON public.hostel_cleaning_type_categories FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR (
    ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
    AND EXISTS (
      SELECT 1 FROM public.hostel_cleaning_types t
      WHERE t.id = hostel_cleaning_type_categories.type_id
    )
  )
);

CREATE POLICY hk_type_categories_delete ON public.hostel_cleaning_type_categories FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR (
    ( SELECT public.user_has_permission('campus_living.housekeeping.types_manage'::text) )
    AND EXISTS (
      SELECT 1 FROM public.hostel_cleaning_types t
      WHERE t.id = hostel_cleaning_type_categories.type_id
    )
  )
);

-- ==========================================================================
-- 4. fn_cl_housekeeping_book: drop the institution equality on the type
-- ==========================================================================
-- CREATE OR REPLACE, never DROP + CREATE: the signature is unchanged, so the
-- ACL survives. A dropped-and-recreated function silently re-grants EXECUTE to
-- PUBLIC, which includes anon.
--
-- Step 3 below is the only line that changed:
--   was  AND t.institution_id = v_alloc.institution_id
--   now  (gone -- the type has no institution)
-- Eligibility is still gated, by the seated room's category in step 4, which is
-- what actually decides who may book what.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_book(
  p_type_id    uuid,
  p_date       date,
  p_slot_start time,
  p_notes      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_alloc        public.hostel_allocations%ROWTYPE;
  v_type         public.hostel_cleaning_types%ROWTYPE;
  v_category_id  uuid;
  v_slot_end     time;
  v_window_start date;
  v_used         integer;
  v_advance_days integer;
  v_slots        jsonb;
  v_slot         jsonb;
  v_ok           boolean := false;
  v_cost         numeric(12,2);
  v_booking_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  -- 1. Master kill switch.
  IF NOT public.fn_get_policy_bool('housekeeping.booking_enabled', true, NULL) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'feature_disabled');
  END IF;

  -- 2. Live allocation. This is the learner's authorisation -- no permission
  --    key is involved; living in the room IS the right to book for it.
  SELECT * INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ORDER BY a.allocation_date DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_allocation');
  END IF;

  -- 3. Active type. The catalogue is global, so there is no institution to
  --    match -- step 4 is what decides whether THIS learner may book it.
  SELECT * INTO v_type
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id
    AND t.is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'type_unavailable');
  END IF;

  -- 4. Eligibility by the SEATED room's category (never the billed category,
  --    and never hostel_allocations.tier_id, which is dead in production).
  --    An empty junction means nobody can book: it fails closed.
  SELECT r.category_id INTO v_category_id
  FROM public.hostel_rooms r WHERE r.id = v_alloc.room_id;
  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaning_type_categories tc
    WHERE tc.type_id = p_type_id AND tc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'category_not_eligible');
  END IF;

  -- Serialise same-room bookers before the read-then-write below.
  PERFORM pg_advisory_xact_lock(hashtext(v_alloc.room_id::text));

  -- 5. Room lock: one live booking per room, any type.
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.status IN ('booked','assigned','in_progress','awaiting_feedback')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
  END IF;

  -- 6. Quota: per room, per type, rolling window ending on the booking date.
  v_window_start := CASE v_type.usage_period
                      WHEN 'day'   THEN p_date
                      WHEN 'week'  THEN p_date - 6
                      WHEN 'month' THEN p_date - 29
                    END;
  SELECT count(*)::integer INTO v_used
  FROM public.hostel_cleaning_bookings b
  WHERE b.room_id = v_alloc.room_id
    AND b.type_id = p_type_id
    AND b.status <> 'cancelled'
    AND b.booking_date BETWEEN v_window_start AND p_date;
  IF v_used >= v_type.usage_limit_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
                              'used', v_used, 'allowed', v_type.usage_limit_count);
  END IF;

  -- 7. Date range.
  v_advance_days := public.fn_get_policy_int('housekeeping.booking_advance_days', 7, NULL);
  IF p_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + v_advance_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'date_out_of_range');
  END IF;

  -- 8. The slot must exist in today's grid and still be bookable.
  v_slots := public.fn_cl_housekeeping_slots(v_alloc.room_id, p_type_id, p_date);
  IF NOT (v_slots->>'open')::boolean THEN
    RETURN jsonb_build_object('success', false,
                              'error_code', COALESCE(v_slots->>'reason', 'day_closed'));
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots->'slots') LOOP
    IF (v_slot->>'slot_start') = to_char(p_slot_start, 'HH24:MI') THEN
      v_ok := (v_slot->>'is_bookable')::boolean;
      v_slot_end := (v_slot->>'slot_end')::time;
    END IF;
  END LOOP;
  IF v_slot_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_not_found');
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full');
  END IF;

  -- 9. Snapshot the cost and insert.
  SELECT COALESCE(sum(e.line_total_inr), 0) INTO v_cost
  FROM public.hostel_cleaning_type_expenses e WHERE e.type_id = p_type_id;

  INSERT INTO public.hostel_cleaning_bookings (
    institution_id, block_id, room_id, allocation_id, learner_id, type_id,
    booking_date, slot_start, slot_end, status,
    feedback_due_at, type_name, duration_minutes, expected_cost_inr, notes
  ) VALUES (
    v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id, v_uid, p_type_id,
    p_date, p_slot_start, v_slot_end, 'booked',
    (p_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata',
    v_type.name, v_type.duration_minutes, v_cost, nullif(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id,
                            'slot_end', to_char(v_slot_end, 'HH24:MI'));
EXCEPTION
  WHEN unique_violation THEN
    -- ux_hk_one_live_booking_per_room fired: a roommate won the race.
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
END $fn$;

-- Re-asserted, not required: CREATE OR REPLACE keeps the existing ACL. Cheap
-- insurance against someone later turning this into a DROP + CREATE.
REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) TO authenticated;
