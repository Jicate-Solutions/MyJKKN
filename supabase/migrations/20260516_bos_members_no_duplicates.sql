-- ─────────────────────────────────────────────────────────────────────────────
-- 20260516_bos_members_no_duplicates.sql
--
-- Prevents the same person from being added to a composition twice.
--
-- bos_members rows pair a composition with either a staff (internal member) or
-- an external expert. Today nothing stops the picker from inserting the same
-- staff_id or expert_id under the same composition_id more than once. Two
-- partial unique indexes enforce the rule at the database level so that any
-- code path — UI, API, scripts, future bulk-import flows — gets a clean
-- constraint error instead of silently producing duplicate rows.
--
-- "Partial" indexes are needed because exactly one of staff_id / expert_id is
-- non-null per row (enforced by bos_members_source_check from 20260306). A
-- plain UNIQUE on the nullable column would let multiple NULLs coexist with a
-- non-null duplicate; the WHERE clause keeps the index scoped to rows where
-- the column actually has a value.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_members_composition_staff
  ON bos_members (composition_id, staff_id)
  WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_members_composition_expert
  ON bos_members (composition_id, expert_id)
  WHERE expert_id IS NOT NULL;

COMMENT ON INDEX uniq_bos_members_composition_staff IS
  'Prevents adding the same staff member to a BoS composition twice.';
COMMENT ON INDEX uniq_bos_members_composition_expert IS
  'Prevents adding the same external expert to a BoS composition twice.';
