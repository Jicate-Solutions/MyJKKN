-- ============================================================================
-- Migration: 20260723_bos_member_types_academic_expert.sql
-- Description: Allow 'academic_expert' as a bos_member_types.base_type value.
--
-- Context: /bos/member-types "Behaves As" gains an Academic Expert option.
-- It behaves as an EXTERNAL expert type — Add Member switches to the external
-- expert picker (EXTERNAL_EXPERT_TYPES in add-member-dialog.tsx) and TA/DA
-- prefills the external SOP shape (EXTERNAL_BASE_TYPES in
-- rate-settings-dialog.tsx).
--
-- bos_members.member_type needs no change — its CHECK was dropped in
-- 20260710150000 (member_type stores the catalog name verbatim).
--
-- Mirrors 20260710150000's constraint block — drop & re-add the CHECK with the
-- full current set plus 'academic_expert'. Safe to re-run.
-- ============================================================================

BEGIN;

ALTER TABLE public.bos_member_types
  DROP CONSTRAINT IF EXISTS bos_member_types_base_type_check;

ALTER TABLE public.bos_member_types
  ADD CONSTRAINT bos_member_types_base_type_check
  CHECK (base_type IN (
    'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
    'subject_expert', 'academic_expert', 'internal_member', 'industry_expert',
    'alumni', 'startup', 'member_secretary'
  ));

COMMIT;
