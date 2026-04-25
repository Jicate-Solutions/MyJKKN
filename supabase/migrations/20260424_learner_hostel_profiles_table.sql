-- ============================================================================
-- Migration: learner_hostel_profiles — warden-scoped hostel data on Learner profile
-- Date: 2026-04-24
-- Spec: specs/warden-edit-hostel-fields-spec.md
-- Context:
--   Wardens need to capture/edit hostel-specific Learner data (emergency contact,
--   medical notes, hostel parent phone) without touching admission-owned columns
--   on learners_profiles. This table is a 1:1 side-table keyed on learner_id.
--
-- Why a separate table (not columns on learners_profiles)?
--   - learners_profiles has 40+ admission-owned columns. Mixing warden-writable
--     columns with admission-owned columns creates ownership confusion and
--     complicates admission's read-after-write invariants.
--   - RLS split-brain avoided: this table's policies gate on
--     campus_living.residents.edit via a JOIN to learners_profiles for the
--     institution scope, keeping admission's RLS untouched.
--   - 1:1 join on learner_id is trivial; LEFT JOIN covers the "no row yet" case
--     for new hostelites.
--
-- Note: hostel_type stays on learners_profiles (billing's fee pipeline reads it).
--       Warden writes to that column directly, not to this table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_hostel_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL UNIQUE REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  hostel_emergency_contact_name TEXT,
  hostel_emergency_contact_phone TEXT,
  hostel_emergency_contact_relation TEXT,
  hostel_medical_notes TEXT,
  hostel_parent_phone TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learner_hostel_profiles IS
  'Warden-scoped hostel data for a Learner (1:1 with learners_profiles). Kept separate from learners_profiles to preserve ownership boundaries between admission (profile) and campus-living (hostel operations) and to avoid RLS split-brain on the admission record. hostel_type lives on learners_profiles because billing reads it.';

COMMENT ON COLUMN public.learner_hostel_profiles.learner_id IS
  '1:1 FK to learners_profiles.id. ON DELETE CASCADE — removing a learner drops their hostel side-record.';
COMMENT ON COLUMN public.learner_hostel_profiles.hostel_emergency_contact_name IS
  'Hostel-specific emergency contact name (may differ from admission parent — e.g. local guardian, room-mate''s parent).';
COMMENT ON COLUMN public.learner_hostel_profiles.hostel_emergency_contact_phone IS
  'Hostel-specific emergency contact phone. 10-digit validation enforced at service layer.';
COMMENT ON COLUMN public.learner_hostel_profiles.hostel_emergency_contact_relation IS
  'Free-form relation (father, mother, brother, local guardian, etc.).';
COMMENT ON COLUMN public.learner_hostel_profiles.hostel_medical_notes IS
  'Warden-facing medical notes (asthma inhaler at warden desk, mess dietary flags, etc.).';
COMMENT ON COLUMN public.learner_hostel_profiles.hostel_parent_phone IS
  'Hostel parent phone — the number the warden actually calls. Separate from admission''s parent phone.';
COMMENT ON COLUMN public.learner_hostel_profiles.updated_by IS
  'Last writer (auth.users.id). Supports a future audit-trail / history table.';

-- ---------------------------------------------------------------------------
-- 2) Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lhp_learner ON public.learner_hostel_profiles(learner_id);

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger (reuse campus-living pattern)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_learner_hostel_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_lhp_updated_at ON public.learner_hostel_profiles;
CREATE TRIGGER tr_lhp_updated_at
  BEFORE UPDATE ON public.learner_hostel_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_learner_hostel_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Row Level Security
--
-- Canonical campus-living pattern:
--   super_admin OR admin
--   OR (permission granted AND institution scope allows)
--
-- Institution scope is resolved via JOIN to learners_profiles since this table
-- has no direct institution_id column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learner_hostel_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: view permission + institution scope
DROP POLICY IF EXISTS lhp_select_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_select_permission ON public.learner_hostel_profiles
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.learners_profiles lp
      WHERE lp.id = learner_hostel_profiles.learner_id
        AND user_has_permission('campus_living.residents.view')
        AND role_has_institution_access(lp.institution_id)
    )
  );

-- INSERT: edit permission + institution scope
DROP POLICY IF EXISTS lhp_insert_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_insert_permission ON public.learner_hostel_profiles
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.learners_profiles lp
      WHERE lp.id = learner_hostel_profiles.learner_id
        AND user_has_permission('campus_living.residents.edit')
        AND role_has_institution_access(lp.institution_id)
    )
  );

-- UPDATE: edit permission + institution scope (USING + WITH CHECK identical)
DROP POLICY IF EXISTS lhp_update_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_update_permission ON public.learner_hostel_profiles
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.learners_profiles lp
      WHERE lp.id = learner_hostel_profiles.learner_id
        AND user_has_permission('campus_living.residents.edit')
        AND role_has_institution_access(lp.institution_id)
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.learners_profiles lp
      WHERE lp.id = learner_hostel_profiles.learner_id
        AND user_has_permission('campus_living.residents.edit')
        AND role_has_institution_access(lp.institution_id)
    )
  );

-- DELETE: super_admin / admin only (no warden-level delete — use ON DELETE CASCADE
-- from learners_profiles if the learner is removed)
DROP POLICY IF EXISTS lhp_delete_permission ON public.learner_hostel_profiles;
CREATE POLICY lhp_delete_permission ON public.learner_hostel_profiles
  FOR DELETE USING (is_super_admin() OR is_admin());
