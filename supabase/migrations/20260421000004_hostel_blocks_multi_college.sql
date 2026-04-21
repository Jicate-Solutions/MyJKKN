-- =====================================================================
-- Hostel blocks ↔ multi-college junction (PR-1 of 2)
-- Date: 2026-04-21
-- Trigger: Warden reported 2026-04-21 12:35 IST that JKKN's 3 girls'
--          blocks are SHARED across all colleges and floors separate
--          year-groups. The 1-block = 1-college assumption baked into
--          hostel_blocks.institution_id (NOT NULL) is wrong.
--
-- What this migration does:
--   PHASE 1: CREATE TABLE hostel_block_institutions — M2M junction
--            (block_id, institution_id, is_primary, learner_year_groups,
--             floors_assigned). Composite PK; partial unique index
--            enforces "at most one primary college per block".
--
--   PHASE 2: Backfill junction from existing hostel_blocks.institution_id.
--            Every existing block row gets a matching junction row with
--            is_primary=true. ON CONFLICT DO NOTHING = re-run safe.
--
--   PHASE 3: ALTER hostel_blocks.institution_id DROP NOT NULL. Wrapped in
--            a DO block that checks is_nullable first — PG errors if you
--            try to drop NOT NULL on an already-nullable column.
--
--   PHASE 4: CREATE OR REPLACE FUNCTION role_has_hostel_block_scope
--            (block_id, institution_id). Additive helper that returns
--            TRUE if user has:
--              (a) super_admin
--              (b) direct grant in user_block_access (PR-1 of persona-design)
--              (c) institution access to the block's primary college
--              (d) institution access to ANY institution in the junction
--
--   PHASE 5: RLS on the new hostel_block_institutions table (4 CRUD
--            policies, standard CLAUDE.md pattern).
--
--   PHASE 6: Replace 4 CRUD policies on hostel_blocks to use the new
--            helper so wardens of secondary colleges can see shared
--            blocks. Policies on hostel_rooms / hostel_beds /
--            hostel_allocations remain on the old pattern — they are
--            updated in a follow-up PR once the junction data is
--            populated via the xlsx loader (avoids a chicken-and-egg
--            lockout: the table would be unreadable until junction is seeded).
--
-- Atomicity: single BEGIN/COMMIT — all-or-nothing.
-- Idempotency: every statement guarded with IF NOT EXISTS, ON CONFLICT,
--              DROP POLICY IF EXISTS, or a DO block pre-check.
-- Rollback plan: drop the function, drop the table, ALTER COLUMN SET
--                NOT NULL (safe because every row has a value, backfill
--                never nulled anything). Policies revert via the PR-4
--                migration's PHASE 2a definitions.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: Junction table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hostel_block_institutions (
    block_id UUID NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    learner_year_groups TEXT[] DEFAULT NULL,
    floors_assigned INTEGER[] DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (block_id, institution_id)
);

COMMENT ON TABLE public.hostel_block_institutions IS
  'M2M junction: which colleges does each physical hostel block serve. '
  'JKKN has 3 girls'' blocks shared across all 8 colleges. Floors '
  'separate year-groups (captured in floors_assigned + learner_year_groups).';

COMMENT ON COLUMN public.hostel_block_institutions.is_primary IS
  'TRUE for the college that "owns" the block (legacy hostel_blocks.institution_id '
  'semantics). Constrained to at most one per block via partial unique index.';

COMMENT ON COLUMN public.hostel_block_institutions.learner_year_groups IS
  'Optional: which year-cohorts of this college live in the block. '
  'E.g. ARRAY[''1st_year'', ''2nd_year''].';

COMMENT ON COLUMN public.hostel_block_institutions.floors_assigned IS
  'Optional: which floors are allocated to this college''s learners. '
  'E.g. ARRAY[1, 2] = floors 1 and 2.';

-- Enforce "at most one primary college per block" at DB level
CREATE UNIQUE INDEX IF NOT EXISTS hostel_block_institutions_primary_uidx
  ON public.hostel_block_institutions (block_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS hostel_block_institutions_institution_idx
  ON public.hostel_block_institutions (institution_id);

ALTER TABLE public.hostel_block_institutions ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (uses existing trigger_set_updated_at pattern)
DROP TRIGGER IF EXISTS hostel_block_institutions_set_updated_at
  ON public.hostel_block_institutions;
CREATE TRIGGER hostel_block_institutions_set_updated_at
  BEFORE UPDATE ON public.hostel_block_institutions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- PHASE 2: Backfill from existing hostel_blocks.institution_id
-- ---------------------------------------------------------------------

INSERT INTO public.hostel_block_institutions (block_id, institution_id, is_primary)
SELECT id, institution_id, true
FROM public.hostel_blocks
WHERE institution_id IS NOT NULL
ON CONFLICT (block_id, institution_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- PHASE 3: Make hostel_blocks.institution_id nullable
-- (idempotency: only drop if currently NOT NULL)
-- ---------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hostel_blocks'
          AND column_name = 'institution_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.hostel_blocks
          ALTER COLUMN institution_id DROP NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.hostel_blocks.institution_id IS
  'Primary owning college (optional). When the block is shared across '
  'multiple colleges, consult hostel_block_institutions for the full set. '
  'Nullable since 2026-04-21 — wardens of secondary colleges must still '
  'access the block via the junction table.';

-- ---------------------------------------------------------------------
-- PHASE 4: Hostel block scope helper
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.role_has_hostel_block_scope(
    check_block_id UUID,
    check_institution_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Super admin bypass (authoritative)
    IF is_super_admin() THEN
        RETURN true;
    END IF;

    -- (a) Direct per-user block grant (user_block_access) — institution
    --     independent. Added via persona-design PR-1 for wardens who
    --     legitimately manage a block regardless of college ownership.
    IF check_block_id IS NOT NULL
       AND role_has_block_access(check_block_id) THEN
        RETURN true;
    END IF;

    -- (b) Access to the block's primary institution (legacy path —
    --     keeps existing behavior working for non-shared blocks).
    IF check_institution_id IS NOT NULL
       AND role_has_institution_access(check_institution_id) THEN
        RETURN true;
    END IF;

    -- (c) Access to ANY institution in the junction — handles the
    --     shared-block case (warden of college B can see a block whose
    --     primary is college A but also serves B).
    IF check_block_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM hostel_block_institutions hbi
        WHERE hbi.block_id = check_block_id
          AND role_has_institution_access(hbi.institution_id)
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$;

COMMENT ON FUNCTION public.role_has_hostel_block_scope(UUID, UUID) IS
  'Hostel-specific scope helper that understands shared blocks. Returns '
  'TRUE if the user is super_admin, has a direct user_block_access grant, '
  'has institution access to the block''s primary college, OR has access to '
  'any institution listed in hostel_block_institutions for the block. Use '
  'in RLS on hostel_blocks, hostel_rooms, hostel_beds, hostel_allocations '
  'and any other hostel_* table where shared-block visibility matters.';

-- ---------------------------------------------------------------------
-- PHASE 5: RLS on hostel_block_institutions (4 CRUD policies)
-- Standard CLAUDE.md pattern. Permission keys reuse campus_living.blocks.*
-- since managing the mapping is conceptually a blocks-admin task.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS hostel_block_institutions_select_permission
  ON public.hostel_block_institutions;
CREATE POLICY hostel_block_institutions_select_permission
  ON public.hostel_block_institutions
  FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.view')
          AND role_has_hostel_block_scope(block_id, institution_id))
  );

DROP POLICY IF EXISTS hostel_block_institutions_insert_permission
  ON public.hostel_block_institutions;
CREATE POLICY hostel_block_institutions_insert_permission
  ON public.hostel_block_institutions
  FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.create')
          AND role_has_hostel_block_scope(block_id, institution_id))
  );

DROP POLICY IF EXISTS hostel_block_institutions_update_permission
  ON public.hostel_block_institutions;
CREATE POLICY hostel_block_institutions_update_permission
  ON public.hostel_block_institutions
  FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.edit')
          AND role_has_hostel_block_scope(block_id, institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.edit')
          AND role_has_hostel_block_scope(block_id, institution_id))
  );

DROP POLICY IF EXISTS hostel_block_institutions_delete_permission
  ON public.hostel_block_institutions;
CREATE POLICY hostel_block_institutions_delete_permission
  ON public.hostel_block_institutions
  FOR DELETE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.delete')
          AND role_has_hostel_block_scope(block_id, institution_id))
  );

-- ---------------------------------------------------------------------
-- PHASE 6: Replace hostel_blocks CRUD policies to use new helper
-- (PR-4 created these with role_has_institution_access — we swap to
-- role_has_hostel_block_scope so shared-block visibility works.)
-- NOTE: rooms / beds / allocations deliberately NOT changed here —
-- follow-up PR after junction is populated (see migration header).
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS hostel_blocks_select_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_select_permission ON public.hostel_blocks
  FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.view')
          AND role_has_hostel_block_scope(id, institution_id))
  );

DROP POLICY IF EXISTS hostel_blocks_insert_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_insert_permission ON public.hostel_blocks
  FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.create')
          AND role_has_hostel_block_scope(id, institution_id))
  );

DROP POLICY IF EXISTS hostel_blocks_update_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_update_permission ON public.hostel_blocks
  FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.edit')
          AND role_has_hostel_block_scope(id, institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.edit')
          AND role_has_hostel_block_scope(id, institution_id))
  );

DROP POLICY IF EXISTS hostel_blocks_delete_permission ON public.hostel_blocks;
CREATE POLICY hostel_blocks_delete_permission ON public.hostel_blocks
  FOR DELETE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.blocks.delete')
          AND role_has_hostel_block_scope(id, institution_id))
  );

COMMIT;

-- =====================================================================
-- Post-migration verification (read-only; run in Supabase SQL Editor)
-- =====================================================================
--
-- -- 1. Junction table exists and is populated:
-- SELECT COUNT(*) AS junction_rows,
--        COUNT(*) FILTER (WHERE is_primary) AS primary_rows
-- FROM public.hostel_block_institutions;
-- -- Expected: junction_rows >= existing hostel_blocks count (every block has ≥1)
-- --           primary_rows = hostel_blocks count (exactly one primary each)
--
-- -- 2. institution_id is now nullable:
-- SELECT is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='hostel_blocks'
--   AND column_name='institution_id';
-- -- Expected: YES
--
-- -- 3. New helper function installed:
-- SELECT pg_get_functiondef(oid)
-- FROM pg_proc
-- WHERE proname = 'role_has_hostel_block_scope';
-- -- Expected: 1 row, body matches above
--
-- -- 4. hostel_blocks policies all use new helper:
-- SELECT policyname, qual, with_check
-- FROM pg_policies
-- WHERE tablename='hostel_blocks';
-- -- Expected: 4 rows, all *_permission names, all referencing
-- --           role_has_hostel_block_scope in qual/with_check.
