-- ============================================================================
-- Migration: 20260706c_bos_member_secretary_type.sql
-- Description: Allow 'member_secretary' as a bos_members.member_type value.
--
-- Context: The Academic Council (20260706b_bos_academic_council.sql) has three
-- positions — Chairman (the Principal), Member, and Member Secretary (nominated
-- by the Principal). Chairman/Member reuse existing member_type values
-- ('chairman' / 'internal_member'), but Member Secretary needs a new value.
--
-- Mirrors 20260515_bos_members_add_startup_type.sql — drop & re-add the CHECK
-- with the full current set plus 'member_secretary'.
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
    'principal',
    'member_secretary'
  ));

COMMIT;
