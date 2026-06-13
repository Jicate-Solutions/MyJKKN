-- Migration: 20260514d_grant_facilitator_compositions_meetings_edit.sql
--
-- Problem: The Facilitator code default in lib/services/bos/bos-role-permissions.ts:94-104
-- grants compositions.edit and meetings.edit:
--
--   [BOS_MODULES.COMPOSITIONS]: ['view', 'edit'],
--   [BOS_MODULES.MEETINGS]: ['view', 'edit'],
--
-- But the dot-format permission migration 20260512_grant_bos_compositions_dotformat_to_roles.sql
-- only targeted role_key IN ('hod', 'principal') — it did NOT include facilitator.
-- Facilitator was inserted by 20260511_rename_bos_syllabi_permissions_to_syllabus.sql:93-109
-- with only:
--
--   'academic.bos-compositions.view': true,
--   'academic.bos-meetings.view': true,
--
-- So at runtime Facilitator can only view compositions/meetings — they cannot edit
-- as the documented role intent says they should.
--
-- Fix: merge compositions.edit and meetings.edit into the facilitator row.
-- Idempotent via jsonb || operator (won't duplicate existing keys; only adds).
-- Scope: edit only, not create — matching the [view, edit] code default exactly,
-- not the [view, create, edit] Principal scope.
--
-- Reversible via:
--   UPDATE public.custom_roles
--   SET permissions = permissions
--     - 'academic.bos-compositions.edit'
--     - 'academic.bos-meetings.edit'
--   WHERE role_key = 'facilitator';

BEGIN;

UPDATE public.custom_roles
SET
  permissions = permissions || '{
    "academic.bos-compositions.edit": true,
    "academic.bos-meetings.edit": true
  }'::jsonb,
  updated_at = NOW()
WHERE role_key = 'facilitator';

COMMIT;
