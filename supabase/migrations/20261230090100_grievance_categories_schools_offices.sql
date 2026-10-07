-- Grievance categories for the schools and offices
--
-- Director 30 Sep 2026: complaint screen showed 'no complaint types' for
-- ~1,070 people in schools and offices; the April seed covered only
-- iqac_code colleges.
--
-- Same five categories, SLAs, assignee roles, emergency and attachment flags
-- and sort order as section 2 of 20260422_grievance_module_a6a_seeds.sql, for
-- the five institutions that seed skipped. Differences, on purpose:
--   - default_naac_metric_code is NULL (these are not NAAC-assessed colleges)
--   - is_system = true, allow_anonymous = true, is_active = true, set explicitly
--
-- Seed data only: no table, column, policy or function changes.
-- Idempotent: WHERE NOT EXISTS (institution_id, name), safe to re-run.

DO $$
DECLARE
  inst     RECORD;
  cat      RECORD;
  n_insts  INT := 0;
  n_added  INT := 0;
  n_rows   INT;
BEGIN
  FOR inst IN
    SELECT id, name FROM institutions
    WHERE name IN (
      'JKKN Matric Higher Secondary School',
      'Nattraja Vidhyalya CBSE',
      'JKKN Main Office',
      'Jicate Solutions',
      'JKKN Testing Institution'
    )
  LOOP
    n_insts := n_insts + 1;
    FOR cat IN
      SELECT * FROM (VALUES
        -- name,                       sla_hours, assignee_role, emergency, attach_required, sort_order
        ('Sexual Harassment (ICC)',    72,        'principal',   true,      true,            1),
        ('Ragging',                    24,        'principal',   true,      true,            2),
        ('Academic',                   120,       'hod',         false,     false,           3),
        ('Infrastructure / Hostel',    168,       'admin',       false,     false,           4),
        ('Other',                      240,       'admin',       false,     false,           5)
      ) AS t(name, sla_hours, assignee_role, is_emergency, attachment_required, sort_order)
    LOOP
      INSERT INTO grievance_categories (
        institution_id, name, default_sla_hours, default_assignee_role,
        is_emergency, attachment_required, default_naac_metric_code,
        is_system, allow_anonymous, is_active, sort_order
      )
      SELECT inst.id, cat.name, cat.sla_hours, cat.assignee_role,
             cat.is_emergency, cat.attachment_required, NULL,
             true, true, true, cat.sort_order
      WHERE NOT EXISTS (
        SELECT 1 FROM grievance_categories
        WHERE institution_id = inst.id AND name = cat.name
      );
      GET DIAGNOSTICS n_rows = ROW_COUNT;
      n_added := n_added + n_rows;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Schools/offices grievance seed: % of 5 institutions matched by name, % categories added',
    n_insts, n_added;
END $$;
