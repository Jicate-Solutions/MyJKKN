-- =============================================================================
-- Campus Living — Create hostel_floors table
-- Created: 2026-04-24
-- Agent: Agent A (4-agent parallel fan-out, coordinator-tracked)
--
-- Problem:
--   hostel_blocks.total_floors exists (INT column) and
--   hostel_wardens.assigned_floors is INT[]. But there is NO hostel_floors
--   table on prod. The original 2026-02-22 campus-living rebuild DROPPED
--   the legacy hostel_floors table and never re-added it. This blocks any
--   floor-level addressing (floor-specific warden scoping, floor-wise
--   occupancy, floor-specific gender pref — which matters since JKKN's
--   shared girls' blocks separate year-groups by floor per
--   project_hostel_blocks_are_multi_college).
--
--   This migration creates hostel_floors with the canonical RLS pattern
--   from supabase/setup/03_policies.sql (is_super_admin / is_admin /
--   user_has_permission + role_has_institution_access).
--
-- Judgment call: the dispatch spec named the CHECK column `gender` but the
-- actual column in the task spec was `gender_preference`. Using
-- `gender_preference` for the column and the CHECK to keep consistency
-- with hostel_blocks.hostel_type and avoid collision with any future
-- `gender` column on learner tables.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    block_id UUID NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
    floor_number INT NOT NULL,
    name TEXT,
    total_rooms INT NOT NULL DEFAULT 0,
    gender_preference TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT hostel_floors_block_floor_unique UNIQUE (block_id, floor_number),
    CONSTRAINT hostel_floors_gender_preference_check
        CHECK (gender_preference IS NULL OR gender_preference IN ('boys', 'girls', 'mixed')),
    CONSTRAINT hostel_floors_status_check
        CHECK (status IN ('active', 'inactive', 'under_maintenance'))
);

COMMENT ON TABLE public.hostel_floors IS
    'Floor-level addressing for hostel blocks. Enables floor-scoped warden '
    'assignment, floor-wise occupancy reporting, and per-floor gender '
    'segregation (e.g. JKKN shared girls'' blocks where year-groups are '
    'separated by floor).';

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_floors_block_floor
    ON public.hostel_floors (block_id, floor_number);

CREATE INDEX IF NOT EXISTS idx_hostel_floors_institution
    ON public.hostel_floors (institution_id);

CREATE INDEX IF NOT EXISTS idx_hostel_floors_status
    ON public.hostel_floors (status)
    WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- 3. updated_at BEFORE UPDATE trigger
-- -----------------------------------------------------------------------------
-- Reuses the canonical public.update_updated_at_column() function
-- that was ensured to exist by migration 20260222000016.
DROP TRIGGER IF EXISTS trg_hostel_floors_updated_at ON public.hostel_floors;
CREATE TRIGGER trg_hostel_floors_updated_at
    BEFORE UPDATE ON public.hostel_floors
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. RLS — canonical pattern per supabase/setup/03_policies.sql
-- -----------------------------------------------------------------------------
ALTER TABLE public.hostel_floors ENABLE ROW LEVEL SECURITY;

-- Drop any prior-run policies first (idempotent).
DROP POLICY IF EXISTS hostel_floors_select_permission ON public.hostel_floors;
DROP POLICY IF EXISTS hostel_floors_insert_permission ON public.hostel_floors;
DROP POLICY IF EXISTS hostel_floors_update_permission ON public.hostel_floors;
DROP POLICY IF EXISTS hostel_floors_delete_permission ON public.hostel_floors;

CREATE POLICY hostel_floors_select_permission ON public.hostel_floors
    FOR SELECT USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.blocks.view')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_floors_insert_permission ON public.hostel_floors
    FOR INSERT WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.blocks.create')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_floors_update_permission ON public.hostel_floors
    FOR UPDATE USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.blocks.edit')
            AND role_has_institution_access(institution_id)
        )
    )
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.blocks.edit')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_floors_delete_permission ON public.hostel_floors
    FOR DELETE USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.blocks.delete')
            AND role_has_institution_access(institution_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 5. Grants (match the pattern used for the other campus_living tables)
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hostel_floors TO authenticated;
