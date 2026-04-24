-- =============================================================================
-- Campus Living — Bulk-import Learners flagged HOSTEL as pending allocations
-- Created: 2026-04-24
-- Agent: Agent A (4-agent parallel fan-out, coordinator-tracked)
--
-- Problem:
--   718 rows in public.learners_profiles have accommodation_type = 'HOSTEL'
--   but public.hostel_allocations has ZERO rows. Wardens have no workspace.
--   We cannot insert directly into hostel_allocations because its schema
--   (see migration 20260222000015) requires block_id / room_id / bed_id /
--   academic_year_id / emergency_contact_* as NOT NULL — and the physical
--   infrastructure (blocks → rooms → beds) has not yet been seeded.
--
-- Solution:
--   Create public.hostel_allocation_applications — a lightweight "pending
--   allocation" inbox. Each row captures a learner's stated intent to live
--   in hostel. Wardens convert these to real hostel_allocations once
--   infrastructure is seeded.
--
--   The second half of this migration seeds one row per HOSTEL-flagged
--   learner (ON CONFLICT DO NOTHING keyed on learner_id, so safe re-run).
--
-- Judgment calls (per spec: "make the best judgment call and note it"):
--   (a) learner_id FK targets learners_profiles(id), NOT profiles(id).
--       learners_profiles is the domain table that carries accommodation_type
--       and hostel_type. A separate profiles(id) link would add a join hop
--       without value; learners_profiles is the canonical learner identity.
--   (b) The seed uses a fixed source tag 'admission_import_2026_04_24' so
--       this batch is distinguishable from any future imports.
--   (c) RLS uses the campus_living.allocations.* permission keys (not new
--       ones) to stay within the existing permission model.
--
-- Idempotent: safe to re-run (both DDL and the seed step).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_allocation_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'admission_import_2026_04_24',
    status TEXT NOT NULL DEFAULT 'pending',
    preferred_hostel_type TEXT NULL,
    preferred_food_type TEXT NULL,
    academic_year_id UUID NULL,
    notes TEXT,
    reviewed_by UUID NULL,
    reviewed_at TIMESTAMPTZ NULL,
    allocated_to UUID NULL,  -- Set to hostel_allocations.id when converted
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT hostel_allocation_applications_status_check
        CHECK (status IN ('pending', 'reviewing', 'allocated', 'rejected', 'cancelled')),
    CONSTRAINT hostel_allocation_applications_learner_unique
        UNIQUE (learner_id)
);

COMMENT ON TABLE public.hostel_allocation_applications IS
    'Inbox of learner requests for hostel accommodation, produced either by '
    'admission form submission (accommodation_type=HOSTEL) or by warden UI. '
    'Wardens convert pending rows into concrete hostel_allocations '
    'once block/room/bed infrastructure is seeded. See migration '
    '20260424000002 for the initial 718-learner import.';

COMMENT ON COLUMN public.hostel_allocation_applications.learner_id IS
    'FK to learners_profiles.id — the domain identity for the learner.';

COMMENT ON COLUMN public.hostel_allocation_applications.source IS
    'Batch/channel the row came from. admission_import_2026_04_24 = initial '
    '718-learner backfill. Future values: admission_form, warden_walk_in, etc.';

COMMENT ON COLUMN public.hostel_allocation_applications.allocated_to IS
    'Set to the resulting hostel_allocations.id when a warden converts the '
    'application into a concrete allocation. NULL while status != allocated.';

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hostel_allocation_applications_institution
    ON public.hostel_allocation_applications (institution_id);

CREATE INDEX IF NOT EXISTS idx_hostel_allocation_applications_status
    ON public.hostel_allocation_applications (status)
    WHERE status IN ('pending', 'reviewing');

CREATE INDEX IF NOT EXISTS idx_hostel_allocation_applications_source
    ON public.hostel_allocation_applications (source);

CREATE INDEX IF NOT EXISTS idx_hostel_allocation_applications_learner
    ON public.hostel_allocation_applications (learner_id);

CREATE INDEX IF NOT EXISTS idx_hostel_allocation_applications_institution_status
    ON public.hostel_allocation_applications (institution_id, status);

-- -----------------------------------------------------------------------------
-- 3. updated_at BEFORE UPDATE trigger
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hostel_allocation_applications_updated_at
    ON public.hostel_allocation_applications;

CREATE TRIGGER trg_hostel_allocation_applications_updated_at
    BEFORE UPDATE ON public.hostel_allocation_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. RLS — canonical pattern
-- -----------------------------------------------------------------------------
ALTER TABLE public.hostel_allocation_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_allocation_applications_select_permission
    ON public.hostel_allocation_applications;
DROP POLICY IF EXISTS hostel_allocation_applications_insert_permission
    ON public.hostel_allocation_applications;
DROP POLICY IF EXISTS hostel_allocation_applications_update_permission
    ON public.hostel_allocation_applications;
DROP POLICY IF EXISTS hostel_allocation_applications_delete_permission
    ON public.hostel_allocation_applications;

CREATE POLICY hostel_allocation_applications_select_permission
    ON public.hostel_allocation_applications
    FOR SELECT USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.allocations.view')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_allocation_applications_insert_permission
    ON public.hostel_allocation_applications
    FOR INSERT WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.allocations.create')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_allocation_applications_update_permission
    ON public.hostel_allocation_applications
    FOR UPDATE USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.allocations.edit')
            AND role_has_institution_access(institution_id)
        )
    )
    WITH CHECK (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.allocations.edit')
            AND role_has_institution_access(institution_id)
        )
    );

CREATE POLICY hostel_allocation_applications_delete_permission
    ON public.hostel_allocation_applications
    FOR DELETE USING (
        is_super_admin()
        OR is_admin()
        OR (
            user_has_permission('campus_living.allocations.edit')
            AND role_has_institution_access(institution_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 5. Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.hostel_allocation_applications TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Seed — bulk-import 718 HOSTEL-flagged learners as pending applications
-- -----------------------------------------------------------------------------
-- Idempotent: ON CONFLICT keyed on learner_id (via the unique constraint).
-- Filters:
--   accommodation_type = 'HOSTEL'  — case-sensitive match per the flag.
--   institution_id IS NOT NULL     — multi-tenant requirement.
-- The match is intentionally loose on case for accommodation_type (HOSTEL /
-- hostel / Hostel) since admission form may have drifted in past imports.
INSERT INTO public.hostel_allocation_applications (
    institution_id,
    learner_id,
    source,
    status,
    preferred_hostel_type,
    preferred_food_type,
    academic_year_id,
    notes
)
SELECT
    lp.institution_id,
    lp.id AS learner_id,
    'admission_import_2026_04_24' AS source,
    'pending' AS status,
    lp.hostel_type AS preferred_hostel_type,
    lp.food_type AS preferred_food_type,
    lp.academic_year_id,
    'Auto-imported from learners_profiles.accommodation_type=HOSTEL backfill '
        || '(2026-04-24). Review and convert to hostel_allocation when '
        || 'block/room/bed assignment is ready.' AS notes
FROM public.learners_profiles lp
WHERE UPPER(lp.accommodation_type) = 'HOSTEL'
  AND lp.institution_id IS NOT NULL
ON CONFLICT (learner_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Verification — log row counts to the Postgres NOTICE channel
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    learner_count INT;
    pending_count INT;
BEGIN
    SELECT COUNT(*) INTO learner_count
    FROM public.learners_profiles
    WHERE UPPER(accommodation_type) = 'HOSTEL'
      AND institution_id IS NOT NULL;

    SELECT COUNT(*) INTO pending_count
    FROM public.hostel_allocation_applications
    WHERE source = 'admission_import_2026_04_24';

    RAISE NOTICE 'hostel_allocation_applications backfill complete: % learners flagged HOSTEL, % pending applications captured.',
        learner_count, pending_count;
END $$;
