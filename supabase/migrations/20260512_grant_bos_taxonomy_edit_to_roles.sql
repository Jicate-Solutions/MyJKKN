-- Migration: 20260512_grant_bos_taxonomy_edit_to_roles.sql
--
-- Problem: applyBOSFallback() only seeds academic.bos-* keys when a DB custom_role
-- has NO academic.bos-* keys at all. HOD/principal/facilitator roles in DB already
-- have some BOS keys (e.g. academic.bos-syllabus.*), so fallback never runs.
-- Those roles therefore lack academic.bos-taxonomy.edit, which is what the fixed
-- bos_programme_outcomes / bos_programme_specific_outcomes RLS policies check.
--
-- Fix: explicitly MERGE the missing keys into custom_roles.permissions JSONB
-- for every role that should have taxonomy edit access.
--
-- Uses jsonb || operator (non-destructive merge — only adds keys, never removes).

UPDATE public.custom_roles
SET permissions = permissions
  || '{"academic.bos-taxonomy.view": true, "academic.bos-taxonomy.edit": true}'::jsonb
WHERE role_key IN (
  'hod',
  'principal',
  'vice_principal',
  'dean',
  'facilitator',
  'coordinator',
  'administrator'
);
