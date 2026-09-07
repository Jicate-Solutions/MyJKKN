-- Campus Living — a hostel block grant is a SCOPE IN ITS OWN RIGHT, not a
-- narrowing of an institution scope.
--
-- THE BUG THIS FIXES
-- ------------------
-- A chief warden assigned to Girls Hostel A/B/C opened /campus-living/allocations
-- and saw an empty table; every action in the row menu failed with 42501.
--
-- Every warden's profile sits in "JKKN Main Office", and hostel_block_institutions
-- maps NO block to Main Office — all 30 mappings point at the six member colleges.
-- So for a warden:
--
--   role_has_institution_access(<allocation's institution>)  =  false, always.
--
-- Every campus-living gate below ANDed that against role_has_block_access(), which
-- meant a block grant could only ever narrow an institution scope the warden did
-- not have. Verified by simulation as KASTHURI J (chief_warden, 3 girls blocks):
-- RLS returned 861 allocation rows (her blocks, correct), while every WRITE gate
-- and the hostel_beds SELECT policy returned 0 / refused.
--
-- The fix is one shape, applied consistently: institution access OR block access.
--   * A block grant is institution-independent BY DESIGN — a warden's profile
--     institution need not match the block's owner (see role_has_hostel_block_scope,
--     which has ORed these two since the persona-design PR; the allocation-side
--     gates never followed).
--   * It cannot fall open: hostel_allocations.block_id and .institution_id are both
--     NOT NULL with zero null rows, and role_has_block_access() only returns true
--     for a NULL block or a live user_block_access grant.
--   * It is not a widening for anyone else — an institution-scoped hostel-office
--     user keeps exactly the rows they had, and in two places (vacate, and the
--     hostel_allocations UPDATE policy) the old AND was refusing THEM too, because
--     they hold no block grant at all.
--
-- Also tightens two things noticed while auditing the same call paths:
--   * fn_cl_admin_transfer_allocation checked only the TARGET block, never the
--     source allocation — a caller could move a learner out of a block they have
--     no access to. Now both ends are checked.
--   * fn_hostel_unallocated_candidates was SECURITY DEFINER with NO authorization
--     check at all, and p_institution_id => NULL means "every institution" — i.e.
--     any authenticated user could read every unplaced learner on the platform.
--     Now gated, and able to take a set of institutions so a warden can be scoped
--     to the colleges their own blocks serve.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helpers — the caller is ALWAYS derived from auth.uid() internally.
--    Never take a caller id as a parameter: parameters are attacker-controlled.
-- ─────────────────────────────────────────────────────────────────────────────

-- Both helpers RETURN AN EMPTY ARRAY rather than RAISE when the caller has no
-- campus-living access. They are evaluated inside RLS policies, where a raise
-- would turn "you see no rows" into a hard 42501 on the whole query for every
-- user outside the module. An empty array makes the policy branch false, which
-- is the same answer expressed safely. The guard is positive-form with an
-- explicit ELSE so a NULL auth.role() (postgres/cron, no JWT) falls to the
-- closed branch — `NOT (NULL OR …)` is NULL, and a NULL CASE condition would
-- have fallen through to the data.
CREATE OR REPLACE FUNCTION public.fn_cl_my_block_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN COALESCE((SELECT auth.role()), '') = 'service_role'
      OR (SELECT is_super_admin())
      OR (SELECT user_has_permission('campus_living.view'))
    THEN COALESCE(
      (SELECT array_agg(DISTINCT uba.block_id)
         FROM user_block_access uba
        WHERE uba.user_id = (SELECT auth.uid())
          AND uba.revoked_at IS NULL),
      ARRAY[]::uuid[])
    ELSE ARRAY[]::uuid[]
  END;
$function$;

-- Rooms inside the caller's granted blocks. Exists because hostel_beds carries
-- room_id but no block_id, and a policy on hostel_beds must not select from
-- hostel_rooms directly (that would re-enter hostel_rooms' own RLS).
CREATE OR REPLACE FUNCTION public.fn_cl_my_block_room_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN COALESCE((SELECT auth.role()), '') = 'service_role'
      OR (SELECT is_super_admin())
      OR (SELECT user_has_permission('campus_living.view'))
    THEN COALESCE(
      (SELECT array_agg(r.id)
         FROM hostel_rooms r
        WHERE r.block_id = ANY (public.fn_cl_my_block_ids())),
      ARRAY[]::uuid[])
    ELSE ARRAY[]::uuid[]
  END;
$function$;

-- Re-creating a function silently re-grants EXECUTE to PUBLIC (which includes
-- anon). REVOKE first, then grant deliberately.
REVOKE EXECUTE ON FUNCTION public.fn_cl_my_block_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_cl_my_block_room_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_my_block_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cl_my_block_room_ids() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. hostel_allocations policies — institution OR block, everywhere.
--    The two SELECT policies also collapse into one: multiple permissive
--    policies are ORed but ALL of them are evaluated per candidate row.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS hostel_allocations_warden_review_select ON public.hostel_allocations;
DROP POLICY IF EXISTS hostel_allocations_select_permission ON public.hostel_allocations;

CREATE POLICY hostel_allocations_select_permission ON public.hostel_allocations
FOR SELECT
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.allocations.view'))
    AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))
  )
  -- Kept from the old hostel_allocations_warden_review_select: an approver may
  -- read the rows they are being asked to approve even without allocations.view.
  OR (
    (SELECT user_has_permission('campus_living.allocations.approve'))
    AND role_has_block_access(block_id)
  )
  OR (
    (SELECT user_has_permission('campus_living.allocations.view_own'))
    AND learner_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS hostel_allocations_insert_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_insert_permission ON public.hostel_allocations
FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.allocations.create'))
    AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))
  )
);

DROP POLICY IF EXISTS hostel_allocations_update_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_update_permission ON public.hostel_allocations
FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.allocations.edit'))
    AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))
  )
)
WITH CHECK (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.allocations.edit'))
    AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))
  )
);

DROP POLICY IF EXISTS hostel_allocations_delete_permission ON public.hostel_allocations;
CREATE POLICY hostel_allocations_delete_permission ON public.hostel_allocations
FOR DELETE
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.allocations.delete'))
    AND (role_has_institution_access(institution_id) OR role_has_block_access(block_id))
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. hostel_beds SELECT — the transfer dialog's bed picker reads this table
--    directly (useBedsByRoom), and it returned 0 rows for a warden, so "Change
--    room / bed" would have stayed unusable even with the RPC gate widened.
--    hostel_beds has no block_id, hence the room-id array.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS hostel_beds_select_permission ON public.hostel_beds;
CREATE POLICY hostel_beds_select_permission ON public.hostel_beds
FOR SELECT
USING (
  (SELECT is_super_admin())
  OR (SELECT is_admin())
  OR (
    (SELECT user_has_permission('campus_living.beds.view'))
    AND (
      role_has_institution_access(institution_id)
      -- Array-contains against a scalar subquery: one InitPlan for the whole
      -- query, not one function call per bed. (`= ANY ((SELECT f()))` would be
      -- read as ANY-of-a-SUBQUERY and compare uuid to uuid[] — 42883.)
      OR (SELECT public.fn_cl_my_block_room_ids()) @> ARRAY[room_id]
    )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The four action RPCs. Bodies are unchanged apart from the scope gates.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_admin_transfer_allocation(p_allocation_id uuid, p_room_id uuid, p_bed_id uuid, p_block_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alloc      hostel_allocations%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_room       hostel_rooms%ROWTYPE;
  v_old_bed    uuid;
  v_learner    uuid;
  v_block_id   uuid;
  v_mapped     boolean;
  v_accessible boolean;
BEGIN
  IF NOT user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'Not authorized to transfer hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;

  -- SOURCE scope. This function used to check only the TARGET block, so a caller
  -- could move a learner OUT of a block they have no access to and into one they
  -- do. Mirrors the SELECT policy's bypass branches so no existing caller loses
  -- a path they legitimately had.
  IF NOT (is_super_admin()
          OR is_admin()
          OR role_has_institution_access(v_alloc.institution_id)
          OR role_has_block_access(v_alloc.block_id)) THEN
    RAISE EXCEPTION 'No access to this allocation''s block'
      USING ERRCODE = '42501';
  END IF;

  IF v_alloc.status <> 'active' OR v_alloc.check_out_date IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active allocation can be transferred (current status: %)', v_alloc.status
      USING ERRCODE = 'P0001';
  END IF;

  v_old_bed := v_alloc.bed_id;
  v_learner := v_alloc.learner_id;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002';
  END IF;
  IF v_bed.room_id <> p_room_id THEN
    RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001';
  END IF;

  v_block_id := COALESCE(p_block_id, v_room.block_id);

  -- TARGET scope: institution OR block. Data gaps (a block mapped to no
  -- institution at all) still fail open, exactly as before.
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block_id)
    INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block_id
        AND hbi.institution_id IN (
          SELECT institution_id FROM get_user_accessible_institutions(auth.uid())
        )
    ) INTO v_accessible;
    IF NOT (v_accessible OR role_has_block_access(v_block_id)) THEN
      RAISE EXCEPTION 'No access to the target block'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_bed_id <> COALESCE(v_old_bed, '00000000-0000-0000-0000-000000000000'::uuid)
     AND EXISTS (
       SELECT 1 FROM hostel_allocations a
       WHERE a.bed_id = p_bed_id
         AND a.status = 'active'
         AND a.check_out_date IS NULL
     ) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  UPDATE hostel_allocations
     SET room_id         = p_room_id,
         bed_id          = p_bed_id,
         block_id        = v_block_id,
         allocation_type = 'transfer',
         updated_at      = now()
   WHERE id = p_allocation_id;

  IF v_old_bed IS NOT NULL AND v_old_bed <> p_bed_id THEN
    UPDATE hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_old_bed;
  END IF;
  UPDATE hostel_beds
     SET status = 'occupied', current_occupant_id = v_learner, updated_at = now()
   WHERE id = p_bed_id;

  RETURN jsonb_build_object(
    'success',       true,
    'allocation_id', p_allocation_id,
    'room_id',       p_room_id,
    'bed_id',        p_bed_id,
    'block_id',      v_block_id,
    'freed_bed_id',  CASE WHEN v_old_bed IS DISTINCT FROM p_bed_id THEN v_old_bed END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_reset_allocation(p_allocation_id uuid, p_reset_room boolean DEFAULT false, p_reset_room_category boolean DEFAULT false, p_reset_mess_category boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alloc            hostel_allocations%ROWTYPE;
  v_lp_id            uuid;
  v_mapped           boolean;
  v_accessible       boolean;
  v_deleted          boolean := false;
  v_freed_bed        uuid;
  v_room_cat_cleared boolean := false;
  v_mess_cat_cleared boolean := false;
BEGIN
  -- Authorization: super-admin OR a hostel-admin role holding upgrades.manage.
  IF NOT user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'Not authorized to reset hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (COALESCE(p_reset_room, false)
          OR COALESCE(p_reset_room_category, false)
          OR COALESCE(p_reset_mess_category, false)) THEN
    RAISE EXCEPTION 'Select at least one item to reset' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;

  -- Scope: institution access OR a live grant on this allocation's block.
  -- Enforced only when the block is mapped to institution(s) via
  -- hostel_block_institutions; data gaps fail open (same as the transfer RPC).
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_alloc.block_id)
    INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_alloc.block_id
        AND hbi.institution_id IN (
          SELECT institution_id FROM get_user_accessible_institutions(auth.uid())
        )
    ) INTO v_accessible;
    IF NOT (v_accessible OR role_has_block_access(v_alloc.block_id)) THEN
      RAISE EXCEPTION 'No access to this allocation''s block'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bridge to the learner-level record: allocation.learner_id is profiles.id;
  -- the category columns live on learners_profiles (profiles.learner_id, 1:1).
  SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = v_alloc.learner_id;

  IF COALESCE(p_reset_room, false) THEN
    IF v_alloc.status NOT IN ('active', 'pending_approval')
       OR v_alloc.check_out_date IS NOT NULL THEN
      RAISE EXCEPTION 'Only an active or pending allocation can be reset (current status: %)',
        v_alloc.status USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (SELECT 1 FROM hostel_deposits WHERE allocation_id = p_allocation_id) THEN
      RAISE EXCEPTION 'This allocation has a deposit record — settle or remove it before resetting the room'
        USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM hostel_vacate_requests WHERE allocation_id = p_allocation_id) THEN
      RAISE EXCEPTION 'This allocation has a vacate request — resolve it before resetting the room'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM hostel_allocations WHERE id = p_allocation_id;
    v_deleted := true;

    -- Free the bed only when no other open allocation still claims it
    -- (a pending_approval row's bed may legitimately never have been occupied
    -- — the conditional update is a safe no-op in that case).
    IF v_alloc.bed_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM hostel_allocations a
      WHERE a.bed_id = v_alloc.bed_id
        AND a.status IN ('active', 'pending_approval')
        AND a.check_out_date IS NULL
    ) THEN
      UPDATE hostel_beds
         SET status = 'available', current_occupant_id = NULL, updated_at = now()
       WHERE id = v_alloc.bed_id;
      v_freed_bed := v_alloc.bed_id;
    END IF;
  END IF;

  IF COALESCE(p_reset_room_category, false) AND v_lp_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET hostel_category_id = NULL
     WHERE id = v_lp_id AND hostel_category_id IS NOT NULL;
    v_room_cat_cleared := FOUND;
  END IF;

  IF COALESCE(p_reset_mess_category, false) AND v_lp_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET mess_category_id = NULL
     WHERE id = v_lp_id AND mess_category_id IS NOT NULL;
    v_mess_cat_cleared := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'success',               true,
    'allocation_deleted',    v_deleted,
    'freed_bed_id',          v_freed_bed,
    'room_category_cleared', v_room_cat_cleared,
    'mess_category_cleared', v_mess_cat_cleared
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cl_vacate_allocation(p_allocation_id uuid, p_vacate_reason vacate_reason_enum)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alloc     hostel_allocations%ROWTYPE;
  v_freed_bed uuid;
  v_already   boolean := false;
BEGIN
  IF NOT (is_super_admin()
          OR is_admin()
          OR user_has_permission('campus_living.allocations.edit')) THEN
    RAISE EXCEPTION 'Not authorized to vacate hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;

  -- Institution OR block scope, matching the UPDATE policy's second branch.
  -- This was an AND until 2026-09-09, which refused BOTH populations that
  -- realistically vacate: a warden (block grant, no institution access) and a
  -- hostel-office user (institution access, no block grant). Only super-admin
  -- and admin ever got through.
  IF NOT (is_super_admin() OR is_admin()) THEN
    IF NOT (role_has_institution_access(v_alloc.institution_id)
            OR role_has_block_access(v_alloc.block_id)) THEN
      RAISE EXCEPTION 'No access to this allocation''s block'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotent on an already-vacated row so this doubles as the repair path
  -- for rows stranded by the old code, and so the vacate-request finalize
  -- flow stays safe to retry. Any other status is a genuine caller error.
  IF v_alloc.status = 'vacated' THEN
    v_already := true;
  ELSIF v_alloc.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active allocation can be vacated (current status: %)',
      v_alloc.status USING ERRCODE = 'P0001';
  END IF;

  IF v_already THEN
    -- Preserve the reason/date already on record; only complete the release.
    UPDATE hostel_allocations
       SET check_out_date = COALESCE(check_out_date, actual_vacate_date, CURRENT_DATE),
           updated_at     = now()
     WHERE id = p_allocation_id;
  ELSE
    UPDATE hostel_allocations
       SET status             = 'vacated',
           vacate_reason      = p_vacate_reason,
           actual_vacate_date = CURRENT_DATE,
           check_out_date     = CURRENT_DATE,
           updated_at         = now()
     WHERE id = p_allocation_id;
  END IF;

  -- Free the bed only when no OTHER open allocation still claims it. A
  -- pending_approval row's bed may legitimately never have been occupied, so
  -- the conditional update is a safe no-op there.
  IF v_alloc.bed_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hostel_allocations a
     WHERE a.bed_id = v_alloc.bed_id
       AND a.id <> p_allocation_id
       AND a.status IN ('active', 'pending_approval')
       AND a.check_out_date IS NULL
  ) THEN
    UPDATE hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_alloc.bed_id;
    v_freed_bed := v_alloc.bed_id;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'allocation_id',   p_allocation_id,
    'already_vacated', v_already,
    'freed_bed_id',    v_freed_bed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocate_bed(p_learner_profile_id uuid, p_room_id uuid, p_bed_id uuid, p_mess_category_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_room       hostel_rooms%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_profile    uuid;
  v_inst       uuid;
  v_sem        uuid;
  v_ay         uuid;
  v_tier       uuid;
  v_block      uuid;
  v_mapped     boolean;
  v_accessible boolean;
  v_alloc_id   uuid;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to allocate hostel rooms' USING ERRCODE = '42501';
  END IF;

  -- learners_profiles → institution / semester / academic year (mirror auto-allocate fallback)
  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years
             WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
  FROM learners_profiles lp WHERE lp.id = p_learner_profile_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner % not found', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for this learner' USING ERRCODE = 'P0001'; END IF;

  -- The learner must belong to an institution the caller can act for: one they
  -- have institution access to, or one served by a block they hold a grant on.
  -- Previously unchecked here — only the target block was, so any caller could
  -- place a learner from any college.
  IF NOT (is_super_admin()
          OR is_admin()
          OR EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g
                      WHERE g.institution_id = v_inst)
          OR EXISTS (SELECT 1 FROM hostel_block_institutions hbi
                      WHERE hbi.institution_id = v_inst
                        AND hbi.block_id = ANY (public.fn_cl_my_block_ids()))) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  -- bridge to the profiles.id key hostel_allocations uses
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_learner_profile_id LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'No profile bridges learner %', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;

  -- fresh-only
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.learner_id = v_profile AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'Learner already has an active allocation — use Change room/bed instead' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002'; END IF;
  IF v_bed.room_id <> p_room_id THEN RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001'; END IF;

  -- 2026-08-15: a bed reserved for another learner's confirmed upgrade hold
  -- must never be handed to a fresh allocation here. This path is
  -- fresh-only (checked above), and a learner with zero prior allocations
  -- cannot legitimately be the holder of a reserved bed's upgrade hold — so
  -- requiring 'available' costs no real path. trg_allocation_guard_reserved_bed
  -- on hostel_allocations is the backstop for every writer; this explicit
  -- check exists only so the admin UI gets a clean refusal here instead of a
  -- raw trigger exception.
  IF v_bed.status = 'reserved' THEN
    RAISE EXCEPTION 'This bed is reserved for another learner''s confirmed upgrade' USING ERRCODE = 'P0001';
  END IF;

  v_block := v_room.block_id;

  -- target block scope: institution OR block grant (mirror fn_cl_admin_transfer_allocation)
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block) INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block
        AND hbi.institution_id IN (SELECT institution_id FROM get_user_accessible_institutions(auth.uid()))
    ) INTO v_accessible;
    IF NOT (v_accessible OR role_has_block_access(v_block)) THEN
      RAISE EXCEPTION 'No access to the target block' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- bed must be free (dedup on allocation existence, matching auto-allocate)
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.bed_id = p_bed_id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- standard tier policy (mirror auto-allocate)
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  ) VALUES (
    v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, auth.uid()
  ) RETURNING id INTO v_alloc_id;

  -- occupy the bed (immediate-active per design decision)
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile, updated_at=now() WHERE id = p_bed_id;

  -- room category is synced by trg_allocation_sync_learner_categories; honor an explicit mess pick
  IF p_mess_category_id IS NOT NULL THEN
    UPDATE learners_profiles SET mess_category_id = p_mess_category_id, updated_at = now() WHERE id = p_learner_profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id,
                            'room_id', p_room_id, 'bed_id', p_bed_id, 'block_id', v_block);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The Allocate dialog's two pickers. Both refused a warden outright on the
--    learner's institution, so the dialog opened empty.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_blocks(p_learner_profile_id uuid)
 RETURNS TABLE(block_id uuid, block_name text, block_code text, hostel_type text, gender_ok boolean, allocatable_rooms integer, free_beds integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable blocks' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT (EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst)
          OR EXISTS (SELECT 1 FROM hostel_block_institutions hbi
                      WHERE hbi.institution_id = v_inst
                        AND hbi.block_id = ANY (public.fn_cl_my_block_ids()))) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT bl.id, bl.name, bl.code, bl.hostel_type::text,
         g.c_gender,
         COALESCE(cnt.rooms, 0), COALESCE(cnt.beds, 0)
  FROM hostel_blocks bl
  CROSS JOIN LATERAL (
    SELECT (bl.hostel_type::text = 'mixed'
      OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
      OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender
  ) g
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS rooms, COALESCE(sum(av.free), 0)::int AS beds
    FROM hostel_rooms r
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS free FROM hostel_beds b
      WHERE b.room_id = r.id AND b.status = 'available'
        AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                         WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
    ) av
    WHERE r.block_id = bl.id
      AND r.room_purpose = 'student'
      AND g.c_gender
      AND av.free > 0
      AND fn_room_serves_institution(r.id, v_inst)
      AND fn_learner_eligible_for_room(p_learner_profile_id, r.id)
      AND (NOT v_has_elig
           OR r.category_id IN (SELECT elig.category_id
                                FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig))
  ) cnt ON true
  -- A block-scoped caller may only place into the blocks they hold. Callers with
  -- no block grant at all are unaffected (fn_cl_my_block_ids returns an empty
  -- array, so the guard short-circuits on cardinality).
  WHERE cardinality(public.fn_cl_my_block_ids()) = 0
     OR is_super_admin()
     OR EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g2 WHERE g2.institution_id = v_inst)
     OR bl.id = ANY (public.fn_cl_my_block_ids())
  ORDER BY COALESCE(cnt.rooms, 0) DESC, bl.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocatable_rooms(p_learner_profile_id uuid, p_block_id uuid)
 RETURNS TABLE(room_id uuid, room_number text, floor integer, category_id uuid, category_name text, capacity integer, available_beds integer, is_allocatable boolean, gender_ok boolean, institution_ok boolean, eligibility_ok boolean, category_ok boolean, has_free_beds boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst   uuid;
  v_gender text;
  v_has_elig boolean;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view allocatable rooms' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_profile_id;
  IF v_inst IS NULL THEN RETURN; END IF;

  IF NOT (EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst)
          OR EXISTS (SELECT 1 FROM hostel_block_institutions hbi
                      WHERE hbi.institution_id = v_inst
                        AND hbi.block_id = ANY (public.fn_cl_my_block_ids()))) THEN
    RAISE EXCEPTION 'You do not have access to this learner''s institution' USING ERRCODE = '42501';
  END IF;

  -- A block-scoped caller can only enumerate rooms in a block they hold.
  IF cardinality(public.fn_cl_my_block_ids()) > 0
     AND NOT is_super_admin()
     AND NOT EXISTS (SELECT 1 FROM get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_inst)
     AND NOT (p_block_id = ANY (public.fn_cl_my_block_ids())) THEN
    RAISE EXCEPTION 'No access to this block' USING ERRCODE = '42501';
  END IF;

  SELECT lower(trim(COALESCE(pr.gender, lp.gender))) INTO v_gender
    FROM learners_profiles lp LEFT JOIN profiles pr ON pr.learner_id = lp.id
   WHERE lp.id = p_learner_profile_id;

  -- Fail-open on category: only narrow to the learner's eligible categories when
  -- some are configured (matches the dialog's prior fail-open behavior).
  SELECT EXISTS (SELECT 1 FROM fn_hostel_learner_room_categories(p_learner_profile_id))
    INTO v_has_elig;

  RETURN QUERY
  SELECT r.id, r.room_number, r.floor, r.category_id, hc.name,
         COALESCE(r.actual_capacity, r.capacity)::int,
         av.free,
         (chk.c_gender AND chk.c_institution AND chk.c_eligibility AND chk.c_category AND av.free > 0),
         chk.c_gender, chk.c_institution, chk.c_eligibility, chk.c_category,
         av.free > 0
  FROM hostel_rooms r
  JOIN hostel_blocks bl ON bl.id = r.block_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS free FROM hostel_beds b
    WHERE b.room_id = r.id AND b.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                       WHERE a.bed_id = b.id AND a.status IN ('active','pending_approval'))
  ) av
  CROSS JOIN LATERAL (
    SELECT
      (bl.hostel_type::text = 'mixed'
        OR (v_gender IN ('male','m')   AND bl.hostel_type::text = 'boys')
        OR (v_gender IN ('female','f') AND bl.hostel_type::text = 'girls')) AS c_gender,
      fn_room_serves_institution(r.id, v_inst)                              AS c_institution,
      fn_learner_eligible_for_room(p_learner_profile_id, r.id)             AS c_eligibility,
      (NOT v_has_elig
        OR r.category_id IN (SELECT elig.category_id
                             FROM fn_hostel_learner_room_categories(p_learner_profile_id) elig)) AS c_category
  ) chk
  WHERE r.block_id = p_block_id
    AND r.room_purpose = 'student'
  ORDER BY 8 DESC, r.floor, r.room_number;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. fn_hostel_unallocated_candidates — gate it, and let it take a SET of
--    institutions (a warden's scope is the colleges their blocks serve, which
--    is always more than one).
--
--    The signature changes, so this is a DROP + CREATE. A DROP takes the ACL
--    with it and the CREATE re-grants EXECUTE to PUBLIC (= anon), so the
--    REVOKE/GRANT pair below is load-bearing, not decoration.
-- ─────────────────────────────────────────────────────────────────────────────

-- Both signatures, so re-running this file is a no-op rather than a 42723:
-- the first run drops (uuid) and creates (uuid, uuid[]), after which only the
-- second exists.
DROP FUNCTION IF EXISTS public.fn_hostel_unallocated_candidates(uuid);
DROP FUNCTION IF EXISTS public.fn_hostel_unallocated_candidates(uuid, uuid[]);

CREATE FUNCTION public.fn_hostel_unallocated_candidates(
  p_institution_id  uuid   DEFAULT NULL::uuid,
  p_institution_ids uuid[] DEFAULT NULL::uuid[]
)
 RETURNS TABLE(learner_id uuid, first_name text, last_name text, full_name text, email text, gender text, institution_id uuid, institution_name text, program_name text, semester_name text, academic_year_id uuid, academic_year_name text, lifecycle_status text, has_profile boolean, gender_set boolean, academic_year_set boolean, room_category_resolved boolean, mess_category_resolved boolean, resolved_room_category_name text, resolved_mess_category_name text, bill_state text, readiness text, missing_items text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH candidates AS (
    SELECT
      lp.id,
      lp.first_name,
      lp.last_name,
      lp.gender AS lp_gender,
      lp.institution_id,
      lp.program_id,
      lp.semester_id,
      lp.academic_year_id,
      lp.lifecycle_status,
      room_elig.cats AS room_cats,
      mess_elig.cats AS mess_cats
    FROM learners_profiles lp
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_room_categories(lp.id)
    ) room_elig ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(category_id) AS cats
      FROM fn_hostel_learner_mess_categories(lp.id)
    ) mess_elig ON true
    WHERE
      -- Authorization. This function was SECURITY DEFINER with no check at all
      -- and NULL => every institution, so any authenticated user could read
      -- every unplaced learner on the platform.
      (SELECT is_super_admin() OR user_has_permission('campus_living.allocations.view'))
      AND lp.accommodation_type_id IN (
            SELECT id FROM accommodation_types WHERE code = 'hostel'
          )
      AND lp.lifecycle_status::text = ANY (public.fn_cl_roster_statuses())
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      AND (p_institution_ids IS NULL OR lp.institution_id = ANY (p_institution_ids))
      AND NOT EXISTS (
        SELECT 1
        FROM hostel_allocations ha2
        JOIN profiles pr2 ON pr2.learner_id = lp.id
        WHERE ha2.learner_id = pr2.id
          AND ha2.status IN ('active', 'pending_approval')
      )
  ),
  enriched AS (
    SELECT
      c.id                                                          AS learner_id,
      c.first_name,
      c.last_name,
      COALESCE(
        p.full_name,
        NULLIF(btrim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        p.email
      )                                                             AS full_name,
      p.email,
      lower(btrim(COALESCE(NULLIF(btrim(p.gender), ''), c.lp_gender)))  AS gender,
      c.institution_id,
      inst.name                                                     AS institution_name,
      prog.program_name,
      sem.semester_name,
      c.academic_year_id,
      ay.academic_year_name,
      c.lifecycle_status::text                                      AS lifecycle_status,
      (p.id IS NOT NULL)                                            AS has_profile,
      (COALESCE(NULLIF(btrim(p.gender), ''), NULLIF(btrim(c.lp_gender), '')) IS NOT NULL) AS gender_set,
      (c.academic_year_id IS NOT NULL)                              AS academic_year_set,
      (c.room_cats IS NOT NULL)                                     AS room_category_resolved,
      (c.mess_cats IS NOT NULL)                                     AS mess_category_resolved,
      rc.name                                                       AS resolved_room_category_name,
      mc.name                                                       AS resolved_mess_category_name,
      CASE
        WHEN c.academic_year_id IS NULL THEN 'none'
        WHEN (
          SELECT count(*) FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id = c.academic_year_id
        ) > 0 THEN 'matched'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
            AND b.academic_year_id IS NOT NULL
            AND b.academic_year_id IS DISTINCT FROM c.academic_year_id
        ) THEN 'different_year'
        WHEN EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id = c.id
            AND b.fee_source = 'academic'
            AND b.status NOT IN ('cancelled','superseded')
        ) THEN 'untagged'
        ELSE 'none'
      END                                                           AS bill_state,
      c.room_cats,
      c.mess_cats
    FROM candidates c
    LEFT JOIN profiles       p    ON p.learner_id   = c.id
    LEFT JOIN institutions   inst ON inst.id         = c.institution_id
    LEFT JOIN programs       prog ON prog.id         = c.program_id
    LEFT JOIN semesters      sem  ON sem.id          = c.semester_id
    LEFT JOIN academic_years ay   ON ay.id           = c.academic_year_id
    LEFT JOIN hostel_categories rc ON rc.id          = c.room_cats[1]
    LEFT JOIN mess_categories   mc ON mc.id          = c.mess_cats[1]
  )
  SELECT
    e.learner_id,
    e.first_name,
    e.last_name,
    e.full_name,
    e.email,
    e.gender,
    e.institution_id,
    e.institution_name,
    e.program_name,
    e.semester_name,
    e.academic_year_id,
    e.academic_year_name,
    e.lifecycle_status,
    e.has_profile,
    e.gender_set,
    e.academic_year_set,
    e.room_category_resolved,
    e.mess_category_resolved,
    e.resolved_room_category_name,
    e.resolved_mess_category_name,
    e.bill_state,
    CASE
      WHEN e.has_profile
        AND e.gender_set
        AND e.academic_year_set
        AND e.room_category_resolved
        AND e.bill_state = 'matched'
      THEN 'ready'
      ELSE 'incomplete'
    END                                                             AS readiness,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN NOT e.has_profile             THEN 'No login profile'                         END,
      CASE WHEN NOT e.gender_set              THEN 'Gender not set'                           END,
      CASE WHEN NOT e.academic_year_set       THEN 'Academic year not set'                    END,
      CASE WHEN NOT e.room_category_resolved  THEN 'No room-category eligibility rule'        END,
      CASE WHEN e.bill_state = 'none'         THEN 'No academic bill generated'               END,
      CASE WHEN e.bill_state = 'different_year' THEN 'Bill tagged to a different academic year' END,
      CASE WHEN e.bill_state = 'untagged'     THEN 'Academic bill not year-tagged'            END
    ], NULL)                                                        AS missing_items
  FROM enriched e
  ORDER BY
    (CASE
       WHEN e.has_profile AND e.gender_set AND e.academic_year_set
            AND e.room_category_resolved AND e.bill_state = 'matched'
       THEN 0 ELSE 1
     END),
    e.full_name;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_hostel_unallocated_candidates(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hostel_unallocated_candidates(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_cl_my_block_ids() IS
  'Block ids the caller holds a live user_block_access grant on. Caller derived from auth.uid(); never parameterised.';
COMMENT ON FUNCTION public.fn_cl_my_block_room_ids() IS
  'Rooms inside the caller''s granted blocks. Exists so hostel_beds RLS can express block scope without selecting from hostel_rooms (which would re-enter its RLS).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ACLs for the six rebuilt RPCs.
--
-- CREATE OR REPLACE preserves an existing ACL, so these are re-assertions, not
-- changes — but they are stated explicitly because the anon-revoke gate reads
-- the migration TEXT, not the live catalog, and because a future DROP+CREATE of
-- any of these would silently re-grant EXECUTE to PUBLIC (= anon). Naming both
-- PUBLIC and anon matters: revoking one does not undo a grant to the other.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_reset_allocation(uuid, boolean, boolean, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_reset_allocation(uuid, boolean, boolean, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid, uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_blocks(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocatable_rooms(uuid, uuid) TO authenticated;
