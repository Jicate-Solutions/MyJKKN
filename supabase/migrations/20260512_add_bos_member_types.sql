-- Migration: 20260512_add_bos_member_types.sql
-- Adds 'hod', 'facilitator', 'principal' to bos_members.member_type CHECK constraint.

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
    'hod',
    'facilitator',
    'principal'
  ));
