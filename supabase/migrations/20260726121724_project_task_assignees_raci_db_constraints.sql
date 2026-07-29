-- ============================================================================
-- Migration: enforce the RACI invariants on project_task_assignees at the DB
-- Date: 2026-07-26
-- Spec: back the RACI single-accountable + one-role-per-person invariants with
--       DB constraints (defense-in-depth), so they no longer rely solely on app
--       code.
--
-- BACKGROUND
--   The RACI invariants the meeting/project engine relies on were enforced ONLY
--   in application code — TaskAssignmentService.assign()
--   (lib/services/projects/task-service.ts) keeps "one RACI role per person per
--   task" and "exactly one Accountable per task" via a delete-then-insert. That
--   sequence is NOT concurrency-safe: two simultaneous assigns can each
--   delete-then-insert and leave two Accountables on the same task, or two rows
--   for the same person. This migration adds the missing DB-level backstop. The
--   app's delete-then-insert stays as friendly UX (on the happy path it silently
--   replaces rather than surfacing a 23505 to the user).
--
-- PRODUCTION STATE (verified via the Management API before authoring;
--   public.project_task_assignees currently has 0 rows -> no existing violations,
--   so every constraint below can be created safely):
--     * uq_project_task_assignees  UNIQUE (task_id, staff_id)  ALREADY EXISTS.
--         -> the "one RACI role per person per task" invariant is ALREADY
--            DB-enforced. This migration does NOT create a duplicate index; the
--            guarded block below only creates ix_pta_unique_person on an
--            environment that somehow lacks any unique on (task_id, staff_id).
--            On production it is a documented no-op.
--     * project_task_assignees_role_check  CHECK (role IN
--         ('owner','collaborator','responsible','accountable','consulted',
--          'informed'))  ALREADY EXISTS (widened for RACI in 20260719120000).
--         -> role is already restricted, so NO new CHECK is added here. The
--            legacy 'owner'/'collaborator' values are intentionally kept for
--            back-compat; tightening to the 4 RACI values would be out of scope
--            and could reject existing/legacy assignments.
--     * NO index enforcing "exactly one Accountable per task" -> the real gap
--       this migration fills.
--
-- IDEMPOTENT: safe to run more than once (IF NOT EXISTS + guarded create).
--
-- NOT APPLIED BY THIS PR. MyJKKN deploys ship code, not migrations — apply this
-- to production via the Supabase Management API after merge.
-- ============================================================================

-- (1) Exactly one Accountable per task.
--     Partial unique index over task_id, limited to Accountable rows: a second
--     'accountable' insert for the same task now raises 23505 instead of
--     silently coexisting. (R/C/I rows are unaffected — the WHERE excludes them.)
CREATE UNIQUE INDEX IF NOT EXISTS ix_pta_one_accountable
  ON public.project_task_assignees (task_id)
  WHERE role = 'accountable';

-- (2) One RACI role per person per task.
--     Already guaranteed on production by the pre-existing
--     uq_project_task_assignees UNIQUE (task_id, staff_id). Create the named
--     index ix_pta_unique_person ONLY where NO unique on (task_id, staff_id)
--     exists yet, so this migration self-heals other environments without
--     creating a redundant duplicate index on production.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.project_task_assignees'::regclass
      AND i.indisunique
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(string_to_array(i.indkey::text, ' ')::int[]) AS colnum
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = colnum::smallint
      ) = ARRAY['staff_id', 'task_id']::text[]
  ) THEN
    CREATE UNIQUE INDEX ix_pta_unique_person
      ON public.project_task_assignees (task_id, staff_id);
  END IF;
END $$;

-- (3) Valid RACI role values.
--     SKIPPED — role is already restricted by project_task_assignees_role_check
--     (see PRODUCTION STATE note above). No CHECK is added or altered here.
