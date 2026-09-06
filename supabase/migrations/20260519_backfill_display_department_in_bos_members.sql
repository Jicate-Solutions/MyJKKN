-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill display_department on existing bos_members rows
-- ─────────────────────────────────────────────────────────────────────────────
-- The column was added in 20260518_add_display_department_to_bos_members.sql
-- but rows that pre-date the column have display_department = NULL. The
-- add-member dialog now populates it at insert-time from the source FK; this
-- migration does the same one-shot fix for legacy rows.
--
--   Internal members (staff_id IS NOT NULL):
--     bos_members.staff_id → staff.department_id → departments.department_name
--
--   External experts (expert_id IS NOT NULL):
--     bos_members.expert_id → bos_external_experts.department_name
--
-- Idempotent: only touches rows where display_department is NULL or empty, so
-- re-running won't overwrite any value already set (e.g. a manually-edited
-- department name). Rows where the source FK has no department (NULL
-- department_id, or department_name = '') are left alone — the PDF renderer
-- skips the "Department of …" line when the value is null/empty, which is the
-- correct behaviour for industry experts / alumni who have no department.

-- Internal members: pull current department_name from the staff↔departments join.
UPDATE bos_members AS m
SET    display_department = d.department_name
FROM   staff       AS s
       JOIN departments AS d ON d.id = s.department_id
WHERE  m.staff_id = s.id
  AND  (m.display_department IS NULL OR m.display_department = '')
  AND  d.department_name IS NOT NULL
  AND  d.department_name <> '';

-- External experts: copy from bos_external_experts.department_name directly.
UPDATE bos_members AS m
SET    display_department = e.department_name
FROM   bos_external_experts AS e
WHERE  m.expert_id = e.id
  AND  (m.display_department IS NULL OR m.display_department = '')
  AND  e.department_name IS NOT NULL
  AND  e.department_name <> '';
