-- ============================================================================
-- Hostel Rooms v2 — PR 2: Service refactor + RLS rewrite + destructive cleanup
-- ============================================================================
-- Spec lock 2026-05-26 (Director).
--
-- Builds on PR 1 substrate (migration 20260703000000_hostel_rooms_v2_pr1_substrate
-- already merged + applied). PR 1 added:
--   • room_institution_access (junction)
--   • v_hostel_room_occupancy (view)
--   • 5 additive columns on hostel_allocations + warden_id FK
--   • UNIQUE INDEX hostel_allocations_room_bed_active_uidx
--   • DEPRECATED comments on hostel_rooms.status + .current_occupancy
--
-- WHAT THIS PR DOES (the 5 destructive steps PR 1 deferred + RLS rewrite +
-- the SECURITY DEFINER helper function):
--
--   1. Backfill 3 missing JKKN Dental rows into hostel_block_institutions
--      (currently 0 rows for blocks A/B/C with institution_id =
--      e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5; 5 rows exist for the other 5
--      test blocks). Without this backfill, the post-DROP RLS via
--      hostel_block_institutions can't see the 3 production blocks.
--   2. Patch fn_premium_reserve_bed — remove the hostel_rooms.current_occupancy
--      UPDATE (column gone after Step 11). Occupancy now derives from the
--      live v_hostel_room_occupancy view.
--   3. Create SECURITY DEFINER helper public.fn_user_can_access_room(uuid)
--      that joins through room_institution_access. Used by the new
--      hostel_rooms RLS policies.
--   4. Rewrite RLS on hostel_rooms — drops dependence on .institution_id;
--      scope flows through room_institution_access.
--   5. Rewrite RLS on hostel_blocks — drops dependence on .institution_id;
--      scope flows through hostel_block_institutions.
--   6. Rewrite RLS on hostel_residents — drops dependence on .institution_id;
--      scope flows through their active hostel_allocations row → block →
--      hostel_block_institutions. Residents WITHOUT any allocation become
--      visible to ALL roles that have campus_living.residents.view permission
--      (institution-agnostic) — Director's lock 2026-05-26: unallocated
--      residents are administrative entities not tied to a college.
--   7. DELETE the 1 hostel_vacate_requests row (its FK to hostel_allocations
--      is ON DELETE RESTRICT and blocks Step 8). 0 hostel_deposits +
--      0 hostel_premium_invites rows exist, so no other FK handling needed.
--   8. DELETE the 1 hostel_allocations row.
--   9. DROP FK constraints + indexes that depend on the doomed columns.
--  10. DROP UNIQUE constraint hostel_residents_one_per_institution.
--  11. DROP COLUMNs (the 5 that PR 1 deferred):
--        hostel_blocks.institution_id
--        hostel_rooms.institution_id
--        hostel_rooms.status
--        hostel_rooms.current_occupancy
--        hostel_residents.institution_id
--  12. DROP TYPE room_status_enum.
--
-- APPLIED VIA SUPABASE MANAGEMENT API per feedback_supabase_management_api*
-- and feedback_supabase_db_url_skip_permanent.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- Step 1: Backfill hostel_block_institutions for 3 JKKN Dental blocks
-- ──────────────────────────────────────────────────────────────────────
-- Currently missing: A Block, B Block, C Block (all institution_id =
-- e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5). The other 5 test blocks already
-- have a junction row each. Backfill is idempotent via UNIQUE (block_id,
-- institution_id) — present on the table via primary-key composite or
-- equivalent constraint (verified via the migration that created it).
-- We use a SELECT-INSERT keyed on b.id to write one row per block.

INSERT INTO public.hostel_block_institutions (block_id, institution_id, is_primary, notes)
SELECT
  b.id,
  b.institution_id,
  true,
  'PR 2 backfill 2026-05-26: rows missing before institution_id DROP. See migration 20260703100000.'
FROM public.hostel_blocks b
WHERE b.institution_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.hostel_block_institutions hbi
    WHERE hbi.block_id = b.id
  );

-- ──────────────────────────────────────────────────────────────────────
-- Step 2: Patch fn_premium_reserve_bed — drop current_occupancy UPDATE
-- ──────────────────────────────────────────────────────────────────────
-- The only DB-level reference to hostel_rooms.current_occupancy. Removed
-- because the column is dropped in Step 11 and occupancy now derives from
-- v_hostel_room_occupancy.

CREATE OR REPLACE FUNCTION public.fn_premium_reserve_bed(
  p_learner_id uuid,
  p_bed_id uuid,
  p_tier_id uuid,
  p_room_id uuid,
  p_block_id uuid,
  p_institution_id uuid,
  p_academic_year_id uuid,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_emergency_contact_relation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_eligibility jsonb;
  v_bed_status TEXT;
  v_tier_active BOOLEAN;
  v_allocation_id UUID;
BEGIN
  -- Step 1: advisory lock on bed (xact-scoped, auto-released on commit/rollback)
  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'bed_locked_by_other',
      'detail', 'Another learner is currently reserving this bed. Try a different bed.'
    );
  END IF;

  -- Step 2: tier sanity check
  SELECT is_active INTO v_tier_active
    FROM public.hostel_tier_policy
   WHERE id = p_tier_id;

  IF v_tier_active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'tier_inactive',
      'detail', 'Premium tier is no longer active. Refresh and try again.'
    );
  END IF;

  -- Step 3: re-evaluate eligibility (defense in depth — UI also checks)
  v_eligibility := public.fn_hostel_premium_evaluate(p_learner_id, p_tier_id);
  IF (v_eligibility ->> 'eligible')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'eligibility_failed',
      'detail', 'You are no longer eligible for this tier. Reason: ' || COALESCE(v_eligibility ->> 'reason', 'unknown')
    );
  END IF;

  -- Step 4: bed availability (under lock)
  SELECT status INTO v_bed_status
    FROM public.hostel_beds
   WHERE id = p_bed_id
     AND room_id = p_room_id;

  IF v_bed_status IS NULL OR v_bed_status <> 'available' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'bed_unavailable',
      'detail', 'This bed is no longer available. Pick a different bed.'
    );
  END IF;

  -- Step 5: insert allocation row
  INSERT INTO public.hostel_allocations (
    institution_id,
    learner_id,
    block_id,
    room_id,
    bed_id,
    academic_year_id,
    allocation_type,
    allocation_date,
    status,
    fee_status,
    emergency_contact_name,
    emergency_contact_phone,
    emergency_contact_relation,
    tier_id,
    allocated_by
  ) VALUES (
    p_institution_id,
    p_learner_id,
    p_block_id,
    p_room_id,
    p_bed_id,
    p_academic_year_id,
    'regular',
    CURRENT_DATE,
    'active',
    'pending',
    p_emergency_contact_name,
    p_emergency_contact_phone,
    p_emergency_contact_relation,
    p_tier_id,
    p_learner_id  -- learner self-allocates under premium flow
  )
  RETURNING id INTO v_allocation_id;

  -- Step 6: mark bed as occupied
  UPDATE public.hostel_beds
     SET status = 'occupied',
         current_occupant_id = p_learner_id,
         updated_at = now()
   WHERE id = p_bed_id;

  -- Step 7 (removed PR 2 2026-05-26): the hostel_rooms.current_occupancy
  -- bump is no longer needed. Occupancy derives live from
  -- v_hostel_room_occupancy (which counts active hostel_allocations rows).

  RETURN jsonb_build_object(
    'success', true,
    'allocation_id', v_allocation_id,
    'reason', 'ok'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'reason', 'unknown',
    'detail', SQLERRM
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────
-- Step 3: SECURITY DEFINER helper — fn_user_can_access_room
-- ──────────────────────────────────────────────────────────────────────
-- New helper that the rewritten hostel_rooms RLS policies depend on.
-- Returns true if the current authenticated user has access to the given
-- room via:
--   (a) super_admin / admin bypass
--   (b) the room_institution_access junction AND role_has_institution_access
--       for at least one granted institution
--
-- SECURITY DEFINER + search_path='public' so the join through
-- room_institution_access doesn't get filtered by that table's own RLS
-- recursion (the policy on room_institution_access itself uses
-- role_has_institution_access, which is the same gate).

CREATE OR REPLACE FUNCTION public.fn_user_can_access_room(check_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF check_room_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Junction-driven access: any active access grant whose institution_id
  -- the current user can reach satisfies the check.
  RETURN EXISTS (
    SELECT 1
    FROM public.room_institution_access ria
    WHERE ria.room_id = check_room_id
      AND ria.is_active = true
      AND role_has_institution_access(ria.institution_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_user_can_access_room(uuid) IS
  'Returns true if auth.uid() can see hostel_rooms.id = check_room_id via '
  'room_institution_access (any active grant whose institution is reachable). '
  'SECURITY DEFINER to bypass junction RLS recursion. Used by hostel_rooms '
  'RLS policies post-institution_id-drop (PR 2 2026-05-26).';

-- ──────────────────────────────────────────────────────────────────────
-- Step 4: Rewrite hostel_rooms RLS
-- ──────────────────────────────────────────────────────────────────────
-- Before: 4 policies key off institution_id + block_id.
-- After:  4 policies key off fn_user_can_access_room(id).
-- Note: role_has_block_access(block_id) was an additional gate in the
-- legacy policy; we keep that here for warden-of-block delegations.

DROP POLICY IF EXISTS hostel_rooms_select_permission ON public.hostel_rooms;
CREATE POLICY hostel_rooms_select_permission
  ON public.hostel_rooms
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.view'::text)
      AND (
        fn_user_can_access_room(id)
        OR role_has_block_access(block_id)
      )
    )
  );

DROP POLICY IF EXISTS hostel_rooms_update_permission ON public.hostel_rooms;
CREATE POLICY hostel_rooms_update_permission
  ON public.hostel_rooms
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.edit'::text)
      AND (
        fn_user_can_access_room(id)
        OR role_has_block_access(block_id)
      )
    )
  );

DROP POLICY IF EXISTS hostel_rooms_delete_permission ON public.hostel_rooms;
CREATE POLICY hostel_rooms_delete_permission
  ON public.hostel_rooms
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.delete'::text)
      AND (
        fn_user_can_access_room(id)
        OR role_has_block_access(block_id)
      )
    )
  );

-- Rewrite hostel_rooms_insert_permission too — its WITH CHECK references
-- institution_id (`qual` is NULL in pg_policies but `with_check` is not).
-- The new INSERT check drops the institution_id gate but keeps the
-- role_has_block_access gate.

DROP POLICY IF EXISTS hostel_rooms_insert_permission ON public.hostel_rooms;
CREATE POLICY hostel_rooms_insert_permission
  ON public.hostel_rooms
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.create'::text)
      AND role_has_block_access(block_id)
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- Step 5: Rewrite hostel_blocks RLS
-- ──────────────────────────────────────────────────────────────────────
-- Before: role_has_hostel_block_scope(id, institution_id).
-- After:  role_has_hostel_block_scope(id, NULL). The function's clause (c)
-- handles the junction-driven case via hostel_block_institutions. Step 1
-- backfilled the 3 missing JKKN Dental rows so this is now safe.

DROP POLICY IF EXISTS hostel_blocks_select_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_select_permission
  ON public.hostel_blocks
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.blocks.view'::text)
      AND role_has_hostel_block_scope(id, NULL)
    )
  );

DROP POLICY IF EXISTS hostel_blocks_update_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_update_permission
  ON public.hostel_blocks
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.blocks.edit'::text)
      AND role_has_hostel_block_scope(id, NULL)
    )
  );

DROP POLICY IF EXISTS hostel_blocks_delete_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_delete_permission
  ON public.hostel_blocks
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.blocks.delete'::text)
      AND role_has_hostel_block_scope(id, NULL)
    )
  );

-- Rewrite hostel_blocks_insert_permission — its WITH CHECK references
-- institution_id. With the column dropped, scope is determined by junction
-- after INSERT (Director's lock 2026-05-26: blocks are created network-wide
-- by admins, then granted to colleges via the junction).

DROP POLICY IF EXISTS hostel_blocks_insert_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_insert_permission
  ON public.hostel_blocks
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('campus_living.blocks.create'::text)
  );

-- ──────────────────────────────────────────────────────────────────────
-- Step 6: Rewrite hostel_residents RLS
-- ──────────────────────────────────────────────────────────────────────
-- Before: role_has_institution_access(institution_id).
-- After:  EXISTS join through active allocation's block → junction. If no
-- allocation exists yet, the resident is visible to any role with
-- campus_living.residents.view permission (institution-agnostic; Director
-- 2026-05-26 lock: unallocated residents are administrative entities not
-- tied to a college).
--
-- We do NOT key off the resident's profile.institution_id because that's
-- a different concept (staff's home college) and residents may legitimately
-- be enrolled across colleges.

DROP POLICY IF EXISTS hostel_residents_select_permission ON public.hostel_residents;
CREATE POLICY hostel_residents_select_permission
  ON public.hostel_residents
  FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.residents.view'::text)
      AND (
        -- Visible if resident has an active allocation in a reachable block,
        -- OR has no allocation at all (administrative entity).
        EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
            AND role_has_hostel_block_scope(a.block_id, NULL)
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
        )
      )
    )
  );

DROP POLICY IF EXISTS hostel_residents_update_permission ON public.hostel_residents;
CREATE POLICY hostel_residents_update_permission
  ON public.hostel_residents
  FOR UPDATE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.residents.edit'::text)
      AND (
        EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
            AND role_has_hostel_block_scope(a.block_id, NULL)
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
        )
      )
    )
  );

DROP POLICY IF EXISTS hostel_residents_delete_permission ON public.hostel_residents;
CREATE POLICY hostel_residents_delete_permission
  ON public.hostel_residents
  FOR DELETE
  USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.residents.delete'::text)
      AND (
        EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
            AND role_has_hostel_block_scope(a.block_id, NULL)
        )
        OR NOT EXISTS (
          SELECT 1 FROM public.hostel_allocations a
          WHERE a.resident_id = hostel_residents.id
        )
      )
    )
  );

-- Rewrite hostel_residents_insert_permission — its WITH CHECK references
-- institution_id. Post-drop, residents are admin entities created by anyone
-- with campus_living.residents.create.

DROP POLICY IF EXISTS hostel_residents_insert_permission ON public.hostel_residents;
CREATE POLICY hostel_residents_insert_permission
  ON public.hostel_residents
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('campus_living.residents.create'::text)
  );

-- ──────────────────────────────────────────────────────────────────────
-- Step 7: Delete the 1 dangling hostel_vacate_requests row
-- ──────────────────────────────────────────────────────────────────────
-- hostel_vacate_requests.allocation_id REFERENCES hostel_allocations(id)
-- ON DELETE RESTRICT — would block Step 8. Currently 1 row references the
-- 1 allocation we're about to delete. Both go.

DELETE FROM public.hostel_vacate_requests
WHERE allocation_id IN (SELECT id FROM public.hostel_allocations);

-- ──────────────────────────────────────────────────────────────────────
-- Step 8: Delete the 1 hostel_allocations row
-- ──────────────────────────────────────────────────────────────────────
-- 0 hostel_deposits rows reference any allocation (verified).
-- 0 hostel_premium_invites rows reference any allocation (CASCADE anyway).

DELETE FROM public.hostel_allocations;

-- ──────────────────────────────────────────────────────────────────────
-- Step 9: Drop FK constraints + non-PK indexes on doomed columns
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_blocks
  DROP CONSTRAINT IF EXISTS hostel_blocks_institution_id_fkey;
DROP INDEX IF EXISTS public.idx_hostel_blocks_institution;

ALTER TABLE public.hostel_rooms
  DROP CONSTRAINT IF EXISTS hostel_rooms_institution_id_fkey;
DROP INDEX IF EXISTS public.idx_hostel_rooms_institution;

ALTER TABLE public.hostel_residents
  DROP CONSTRAINT IF EXISTS hostel_residents_institution_id_fkey;
DROP INDEX IF EXISTS public.idx_hostel_residents_institution;

-- ──────────────────────────────────────────────────────────────────────
-- Step 10: Drop the per-institution UNIQUE constraint on residents
-- ──────────────────────────────────────────────────────────────────────
-- UNIQUE (institution_id, profile_id) becomes meaningless once
-- institution_id is gone. Replace with UNIQUE (profile_id) so a person
-- has at most one resident record (Director's lock 2026-05-26).

ALTER TABLE public.hostel_residents
  DROP CONSTRAINT IF EXISTS hostel_residents_one_per_institution;

-- Replacement: one resident record per profile, network-wide.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hostel_residents_one_per_profile'
  ) THEN
    ALTER TABLE public.hostel_residents
      ADD CONSTRAINT hostel_residents_one_per_profile UNIQUE (profile_id);
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────
-- Step 11: Drop the doomed columns
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_blocks DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.hostel_rooms DROP COLUMN IF EXISTS institution_id;
ALTER TABLE public.hostel_rooms DROP COLUMN IF EXISTS status;
ALTER TABLE public.hostel_rooms DROP COLUMN IF EXISTS current_occupancy;
ALTER TABLE public.hostel_residents DROP COLUMN IF EXISTS institution_id;

-- ──────────────────────────────────────────────────────────────────────
-- Step 12: Drop room_status_enum (no remaining users)
-- ──────────────────────────────────────────────────────────────────────
-- The only column using this type was hostel_rooms.status (dropped above).
-- DROP TYPE IF EXISTS is safe even if the type doesn't exist; CASCADE not
-- needed because the column is already gone.

DROP TYPE IF EXISTS public.room_status_enum;

-- ──────────────────────────────────────────────────────────────────────
-- Step 13: Verification probes
-- ──────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_block_junction int;
  v_doomed_cols int;
  v_residents_allocs int;
  v_helper_fn int;
  v_room_status_enum int;
BEGIN
  SELECT count(*) INTO v_block_junction FROM public.hostel_block_institutions;
  SELECT count(*) INTO v_doomed_cols
    FROM information_schema.columns
    WHERE (table_name='hostel_blocks' AND column_name='institution_id')
       OR (table_name='hostel_rooms'    AND column_name IN ('institution_id','status','current_occupancy'))
       OR (table_name='hostel_residents' AND column_name='institution_id');
  SELECT (SELECT count(*) FROM public.hostel_residents)
       + (SELECT count(*) FROM public.hostel_allocations) * 1000
    INTO v_residents_allocs;
  SELECT count(*) INTO v_helper_fn
    FROM pg_proc WHERE proname='fn_user_can_access_room';
  SELECT count(*) INTO v_room_status_enum
    FROM pg_type WHERE typname='room_status_enum';

  RAISE NOTICE 'PR 2 destructive verification:';
  RAISE NOTICE '  hostel_block_institutions rows (expect 8): %', v_block_junction;
  RAISE NOTICE '  doomed columns still present (expect 0): %', v_doomed_cols;
  RAISE NOTICE '  residents (expect 130) + allocations*1000 (expect 0): %', v_residents_allocs;
  RAISE NOTICE '  fn_user_can_access_room exists (expect 1): %', v_helper_fn;
  RAISE NOTICE '  room_status_enum type exists (expect 0): %', v_room_status_enum;
END$$;
