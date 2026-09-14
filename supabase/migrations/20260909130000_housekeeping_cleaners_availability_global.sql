-- Cleaners and cleaning availability become global: institution_id is dropped
-- from hostel_cleaners and hostel_cleaning_availability.
--
-- WHY — THE BLOCKS THEY SERVE WERE NEVER INSTITUTION-SCOPED.
--
-- hostel_blocks has NO institution_id column. It never did. A block is a
-- physical building shared by whoever the hostel office seats in it, and the
-- live data is emphatic about that: 4 of the 6 blocks house learners from more
-- than one college, and the two biggest house SIX each.
--
--     Boys Hostel A     6 institutions   179 residents
--     Girls Hostel A    6 institutions   210 residents
--     Girls Hostel C    4 institutions   172 residents
--     Girls Hostel B    2 institutions    67 residents
--     Boys Hostel B     1 institution     38 residents
--     Boys Hostel C     1 institution     48 residents
--     (measured 2026-09-07 over fn_cl_roster_statuses())
--
-- So hostel_cleaners.institution_id pinned a person to one college while the
-- corridors they actually clean belong to none of them. That is not merely
-- redundant — it was a live assignment dead-end:
--
--   fn_cl_housekeeping_assign required  c.institution_id = v_b.institution_id,
--   and a booking's institution_id comes from the LEARNER's allocation. One
--   cleaner covering Girls Hostel A could therefore be assigned only to the
--   bookings of the single college they were registered under, and would return
--   'cleaner_unavailable' for the other five colleges' learners in the same
--   corridor, on the same day, for the same job. It never fired only because
--   hostel_cleaners has 0 rows.
--
-- The correct scope was already there and is untouched: hostel_cleaner_blocks.
-- A cleaner serves the blocks they are attached to, and fn_cl_housekeeping_assign
-- still refuses anything else with 'cleaner_wrong_block'. Same shape as cleaning
-- types, where the room-category junction replaced the institution column in
-- 20260909110000_housekeeping_types_global.sql.
--
-- AVAILABILITY, same defect, and its institution_id was already inert:
-- ux_hk_availability_block_weekday is UNIQUE (block_id, weekday), so exactly one
-- window per block per weekday can exist no matter how many institutions claim
-- it. Two colleges could never have set different hours for a shared block —
-- the second one to try would have taken a 23505 from a row it could not see.
-- The column bought nothing and blocked the setup path.
--
-- PII, decided and accepted: hostel_cleaners holds phone numbers, and RLS is
-- row-level, not column-level, so a shared row is a shared phone number. Every
-- holder of campus_living.housekeeping.view now sees every cleaner. That is the
-- point — the warden of a six-college block needs the number of whoever cleans
-- it, regardless of which payroll they sit on. Learners are still nowhere near
-- this table: they read the bookings.cleaner_name snapshot, which exists for
-- exactly this reason.
--
-- Safe as pure DDL: hostel_cleaners, hostel_cleaner_blocks and
-- hostel_cleaning_availability were all EMPTY when this was authored, and no
-- booking has ever carried a cleaner_id. No backfill.
--
-- ORDER MATTERS: Postgres refuses DROP COLUMN while a policy depends on the
-- column, and hk_cleaner_blocks_{insert,delete} reference c.institution_id on
-- the PARENT table, so they go first too.

-- ==========================================================================
-- 1. Drop the policies that reference institution_id
-- ==========================================================================
-- hk_cleaner_blocks_select is left alone: it only tests that the parent cleaner
-- row exists and never referenced institution_id.
DROP POLICY IF EXISTS hk_cleaners_select        ON public.hostel_cleaners;
DROP POLICY IF EXISTS hk_cleaners_insert        ON public.hostel_cleaners;
DROP POLICY IF EXISTS hk_cleaners_update        ON public.hostel_cleaners;
DROP POLICY IF EXISTS hk_cleaners_delete        ON public.hostel_cleaners;
DROP POLICY IF EXISTS hk_cleaner_blocks_insert  ON public.hostel_cleaner_blocks;
DROP POLICY IF EXISTS hk_cleaner_blocks_delete  ON public.hostel_cleaner_blocks;
DROP POLICY IF EXISTS hk_availability_select    ON public.hostel_cleaning_availability;
DROP POLICY IF EXISTS hk_availability_insert    ON public.hostel_cleaning_availability;
DROP POLICY IF EXISTS hk_availability_update    ON public.hostel_cleaning_availability;
DROP POLICY IF EXISTS hk_availability_delete    ON public.hostel_cleaning_availability;

-- ==========================================================================
-- 2. Drop the columns
-- ==========================================================================
-- Each takes its own index with it: idx_hk_cleaners_institution and
-- idx_hk_availability_institution.
ALTER TABLE public.hostel_cleaners
  DROP COLUMN IF EXISTS institution_id;

ALTER TABLE public.hostel_cleaning_availability
  DROP COLUMN IF EXISTS institution_id;

-- ==========================================================================
-- 3. Recreate the policies without the institution predicate
-- ==========================================================================
-- One permissive policy per table per verb, every auth helper wrapped in a
-- scalar subquery so it is an InitPlan evaluated once per query rather than once
-- per candidate row.

CREATE POLICY hk_cleaners_select ON public.hostel_cleaners FOR SELECT
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.view'::text) )
);

CREATE POLICY hk_cleaners_insert ON public.hostel_cleaners FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.cleaners_manage'::text) )
);

CREATE POLICY hk_cleaners_update ON public.hostel_cleaners FOR UPDATE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.cleaners_manage'::text) )
);

CREATE POLICY hk_cleaners_delete ON public.hostel_cleaners FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.cleaners_manage'::text) )
);

CREATE POLICY hk_cleaner_blocks_insert ON public.hostel_cleaner_blocks FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR (
    ( SELECT public.user_has_permission('campus_living.housekeeping.cleaners_manage'::text) )
    AND EXISTS (
      SELECT 1 FROM public.hostel_cleaners c
      WHERE c.id = hostel_cleaner_blocks.cleaner_id
    )
  )
);

CREATE POLICY hk_cleaner_blocks_delete ON public.hostel_cleaner_blocks FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR (
    ( SELECT public.user_has_permission('campus_living.housekeeping.cleaners_manage'::text) )
    AND EXISTS (
      SELECT 1 FROM public.hostel_cleaners c
      WHERE c.id = hostel_cleaner_blocks.cleaner_id
    )
  )
);

CREATE POLICY hk_availability_select ON public.hostel_cleaning_availability FOR SELECT
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.view'::text) )
);

CREATE POLICY hk_availability_insert ON public.hostel_cleaning_availability FOR INSERT
WITH CHECK (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.availability_manage'::text) )
);

CREATE POLICY hk_availability_update ON public.hostel_cleaning_availability FOR UPDATE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.availability_manage'::text) )
);

CREATE POLICY hk_availability_delete ON public.hostel_cleaning_availability FOR DELETE
USING (
  ( SELECT public.is_super_admin() )
  OR ( SELECT public.user_has_permission('campus_living.housekeeping.availability_manage'::text) )
);

-- ==========================================================================
-- 4. fn_cl_housekeeping_assign: drop the institution equality on the cleaner
-- ==========================================================================
-- CREATE OR REPLACE, never DROP + CREATE: the signature is unchanged so the ACL
-- survives. A dropped-and-recreated function silently re-grants EXECUTE to
-- PUBLIC, which includes anon.
--
-- One line changed:
--   was  AND c.institution_id = v_b.institution_id
--   now  (gone -- the cleaner has no institution)
-- The authorisation on the caller is untouched: assigning still requires
-- campus_living.housekeeping.assign AND role_has_institution_access over the
-- BOOKING's institution, which is real and comes from the learner's allocation.
-- What is gone is the requirement that the cleaner belong to that same college.
-- 'cleaner_wrong_block' below is the gate that always meant something.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_assign(
  p_booking_id uuid,
  p_cleaner_id uuid,
  p_clear      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_b    public.hostel_cleaning_bookings%ROWTYPE;
  v_name text;
  v_days integer[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF NOT (public.user_has_permission('campus_living.housekeeping.assign')
          AND public.role_has_institution_access(v_b.institution_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  IF v_b.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_assignable');
  END IF;

  IF p_clear THEN
    UPDATE public.hostel_cleaning_bookings
    SET cleaner_id = NULL, cleaner_name = NULL,
        assigned_at = NULL, assigned_by = NULL,
        status = 'booked'
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'status', 'booked');
  END IF;

  -- Any active cleaner. The block check below is what scopes them.
  SELECT c.full_name, c.working_days INTO v_name, v_days
  FROM public.hostel_cleaners c
  WHERE c.id = p_cleaner_id
    AND c.is_active;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_unavailable');
  END IF;

  -- The cleaner must actually serve this block and work this weekday.
  IF NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaner_blocks cb
    WHERE cb.cleaner_id = p_cleaner_id AND cb.block_id = v_b.block_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_wrong_block');
  END IF;

  IF NOT (EXTRACT(DOW FROM v_b.booking_date)::integer = ANY (v_days)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_not_working');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET cleaner_id = p_cleaner_id, cleaner_name = v_name,
      assigned_at = now(), assigned_by = v_uid,
      status = 'assigned'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'status', 'assigned', 'cleaner_name', v_name);
END $fn$;

-- Re-asserted, not required: CREATE OR REPLACE keeps the existing ACL.
REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) TO authenticated;
