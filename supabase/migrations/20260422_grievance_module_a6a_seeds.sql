-- PR-A6a: Grievance module seed migration
-- Purpose: Add UGC grievance metric to accreditation catalog + seed default
--          grievance_categories across the 8 JKKN colleges that have iqac_code.
-- Idempotent: ON CONFLICT DO NOTHING everywhere; safe to re-run on prod.
-- Context: production schema for grievance_tickets is already live (12 cols +
--          CHECK constraints + triggers). This migration only ADDS seed data
--          so the new /accreditation/naac/grievance UI has categories to pick.

-- 1. Seed UGC grievance metric (NAAC 7.7.1 already exists; UGC equivalent does not).
INSERT INTO sh_accreditation_metrics (
  metric_type, metric_code, metric_name, category,
  calculation_method, data_sources, verification_requirements, is_active
)
VALUES (
  'UGC', 'grievance', 'Student Grievance Redressal Mechanism',
  'Welfare & Student Support',
  'Count of grievance tickets resolved within SLA / Total tickets filed',
  ARRAY['grievance_tickets'],
  'Signed resolution letter + satisfaction rating ≥ 3 of 5',
  true
)
ON CONFLICT (metric_type, metric_code) DO NOTHING;

-- 2. Seed default grievance_categories for each JKKN college (iqac_code IS NOT NULL).
--    Five universal categories: Sexual Harassment (ICC), Ragging, Academic,
--    Infrastructure/Hostel, Other. All tagged with NAAC 7.7.1.
--    Uses UNIQUE (institution_id, name) pattern via WHERE NOT EXISTS.
DO $$
DECLARE
  inst RECORD;
  cat  RECORD;
BEGIN
  FOR inst IN
    SELECT id FROM institutions
    WHERE iqac_code IS NOT NULL
      AND is_active = true
  LOOP
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
        is_active, sort_order
      )
      SELECT inst.id, cat.name, cat.sla_hours, cat.assignee_role,
             cat.is_emergency, cat.attachment_required, '7.7.1',
             true, cat.sort_order
      WHERE NOT EXISTS (
        SELECT 1 FROM grievance_categories
        WHERE institution_id = inst.id AND name = cat.name
      );
    END LOOP;
  END LOOP;
END $$;

-- 3. Verification block (RAISE NOTICE only; no failure path — seed is best-effort).
DO $$
DECLARE
  n_metrics INT;
  n_cats    INT;
BEGIN
  SELECT COUNT(*) INTO n_metrics FROM sh_accreditation_metrics
    WHERE metric_type='UGC' AND metric_code='grievance';
  SELECT COUNT(*) INTO n_cats FROM grievance_categories;
  RAISE NOTICE 'PR-A6a seed complete: UGC grievance metrics=%, grievance_categories total=%', n_metrics, n_cats;
END $$;
