-- ============================================================================
-- Migration: allow RACI roles on project_task_assignees.role (PR1 RACI substrate)
-- Date: 2026-06-23
--
-- The role column had a CHECK constraint limiting it to ('owner','collaborator').
-- The RACI substrate stores responsible/accountable/consulted/informed there, so
-- the constraint is widened to allow those four AS WELL — owner/collaborator are
-- kept for back-compat. Without this, every RACI assignment is rejected at the
-- DB layer (23514), invisible to TypeScript and the type-check gate.
-- ============================================================================

ALTER TABLE public.project_task_assignees
  DROP CONSTRAINT IF EXISTS project_task_assignees_role_check;

ALTER TABLE public.project_task_assignees
  ADD CONSTRAINT project_task_assignees_role_check
  CHECK (role = ANY (ARRAY[
    'owner'::text,
    'collaborator'::text,
    'responsible'::text,
    'accountable'::text,
    'consulted'::text,
    'informed'::text
  ]));
