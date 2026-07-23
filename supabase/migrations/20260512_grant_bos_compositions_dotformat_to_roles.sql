-- Migration: 20260512_grant_bos_compositions_dotformat_to_roles.sql
--
-- HOD and principal have BOS compositions/meetings permissions in underscore format
-- (academic.bos-compositions_edit) and nested object format, but the bos_members
-- RLS uses user_has_permission('academic.bos-compositions.edit') which reads
-- permissions->>'academic.bos-compositions.edit' — the dot format.
-- Without the dot-format key, HOD/principal cannot add or remove composition members.
--
-- Fix: merge the missing dot-format keys into HOD and principal.

UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-compositions.view": true,
  "academic.bos-compositions.create": true,
  "academic.bos-compositions.edit": true,
  "academic.bos-compositions.delete": true,
  "academic.bos-meetings.view": true,
  "academic.bos-meetings.create": true,
  "academic.bos-meetings.edit": true
}'::jsonb
WHERE role_key = 'hod';

UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-compositions.view": true,
  "academic.bos-compositions.create": true,
  "academic.bos-compositions.edit": true,
  "academic.bos-meetings.view": true,
  "academic.bos-meetings.create": true,
  "academic.bos-meetings.edit": true
}'::jsonb
WHERE role_key = 'principal';
