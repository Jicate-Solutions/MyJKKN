-- ============================================================================
-- Migration: 20260729_bos_member_types_faculty.sql
-- Description: Add 'faculty_member' as a bos_member_types.base_type value and
--              re-point existing "Faculty Members" catalog rows onto it.
--
-- Context: In the composition "Add Member" dialog, faculty (and chairmen) can
-- be sourced from the external-expert directory — a faculty member or chairman
-- brought in from another institution. The dialog's Source = External Expert
-- filter keys on base_type (EXTERNAL_EXPERT_BASE_TYPES in add-member-dialog.tsx),
-- so those member types only appear under External Expert if their base_type is
-- in that set.
--
-- 'chairman' already exists as a base_type. "Faculty Members", however, shared
-- base_type 'internal_member' with internal-only roles (e.g. "Department
-- Autonomous Coordinator"). A base_type-keyed filter can't show one without the
-- other, so we give faculty its own base_type: 'faculty_member'. Now:
--   • Add Member's Source = External Expert lists Faculty Members + Chairman
--     (EXTERNAL_EXPERT_BASE_TYPES) WITHOUT exposing Department Autonomous
--     Coordinator, which stays base_type 'internal_member' (Staff-only).
--   • The Experts page gains matching 'faculty_member' + 'chairman' categories
--     (BosExpertCategory). bos_external_experts.category has NO CHECK (dropped
--     in 20260515 / the category-check-drop script), so no constraint change
--     is needed there.
--
-- bos_members.member_type needs no change — its CHECK was dropped in
-- 20260710150000 (member_type stores the catalog name verbatim).
--
-- Mirrors 20260724's constraint block — drop & re-add the CHECK with the full
-- current set plus 'faculty_member'. Idempotent: the UPDATE is scoped to rows
-- still on 'internal_member' so re-running is a no-op.
-- ============================================================================

BEGIN;

-- ── 1. Widen the base_type CHECK to include 'faculty_member' ─────────────────
ALTER TABLE public.bos_member_types
  DROP CONSTRAINT IF EXISTS bos_member_types_base_type_check;

ALTER TABLE public.bos_member_types
  ADD CONSTRAINT bos_member_types_base_type_check
  CHECK (base_type IN (
    'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
    'subject_expert', 'academic_expert', 'internal_member', 'industry_expert',
    'alumni', 'startup', 'member_secretary', 'student', 'faculty_member'
  ));

-- ── 2. Re-point existing "Faculty Members" rows onto the new base_type ───────
-- Any catalog row literally named "Faculty Member(s)" that is still tagged as a
-- generic internal member becomes 'faculty_member'. Institution-agnostic so it
-- covers CET and any other board that named its faculty seat the same way.
UPDATE public.bos_member_types
SET base_type = 'faculty_member'
WHERE base_type = 'internal_member'
  AND lower(trim(name)) IN ('faculty members', 'faculty member');

COMMIT;
