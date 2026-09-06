-- ─────────────────────────────────────────────────────────────────────────────
-- Add display_department to bos_members
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a denormalised department field alongside the existing display_name /
-- display_designation / display_institution columns. Rendered in the BoS
-- call-letter PDF addressee block as "Department of {value}", e.g.:
--
--     Test User,
--     Testuser,
--     Department of English,         ← new line
--     JKKN College of Arts...,
--     Mobile: 9876543210
--
-- For internal members, populated from staff.department.department_name at
-- add-time. For external experts, populated from bos_external_experts.
-- department_name. Same intentional-denormalisation pattern as the other
-- display_* fields — see comment in 20260306_create_bos_tables.sql.
--
-- Nullable: not every member has a department (e.g. industry experts, alumni),
-- and existing rows have no department to backfill into. The renderer skips
-- the line when the value is null/empty.

ALTER TABLE bos_members
ADD COLUMN IF NOT EXISTS display_department VARCHAR(255);

COMMENT ON COLUMN bos_members.display_department IS
  'Denormalised department name for the member as of join-time. Rendered in the BoS call-letter PDF addressee block. NULL when the member type does not carry a department (industry/alumni).';
