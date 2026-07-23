-- ============================================================================
-- Migration: 20260515_bos_members_add_startup_type.sql
-- Description: Allow 'startup' as a valid bos_members.member_type value.
--
-- Context: Migration 20260515_bos_external_experts_add_startup_category.sql
-- (applied today) widened the bos_external_experts.category constraint to
-- include 'startup', but the parallel CHECK on bos_members.member_type still
-- rejects it. Without this, inserting a startup-category expert into a BoS
-- composition fails with Postgres 23514 (check_violation) and the
-- /api/bos/members POST handler returns a generic 500.
--
-- Mirrors the pattern established by 20260512_add_bos_member_types.sql, which
-- previously added 'hod', 'facilitator', 'principal'.
-- ============================================================================

BEGIN;

ALTER TABLE public.bos_members
  DROP CONSTRAINT IF EXISTS bos_members_member_type_check;

ALTER TABLE public.bos_members
  ADD CONSTRAINT bos_members_member_type_check
  CHECK (member_type IN (
    'chairman',
    'internal_member',
    'university_nominee',
    'subject_expert',
    'industry_expert',
    'alumni',
    'startup',
    'hod',
    'facilitator',
    'principal'
  ));

COMMIT;
