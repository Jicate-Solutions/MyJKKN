-- T4.4 — Seed standard Indian pay components across all institutions.
-- These define WHAT types of earnings exist (structural), not HOW MUCH (that's hr_pay_scales).
-- Components are institution-scoped so each college can enable/disable independently.

INSERT INTO hr_pay_components (institution_id, code, display_name, component_type, calculation_basis, default_amount_or_percent, applies_to_engine_types, is_system, is_active, display_order)
SELECT
  i.id,
  c.code,
  c.display_name,
  c.component_type,
  c.calculation_basis,
  c.default_amount_or_percent,
  c.applies_to_engine_types,
  true,
  true,
  c.display_order
FROM institutions i
CROSS JOIN (VALUES
  ('BASIC',   'Basic Pay',               'earning',    'flat',             0, ARRAY['faculty','non_teaching'], 1),
  ('HRA',     'House Rent Allowance',    'earning',    'percent_of_basic',  40, ARRAY['faculty','non_teaching'], 2),
  ('DA',      'Dearness Allowance',      'earning',    'percent_of_basic',  0, ARRAY['faculty','non_teaching'], 3),
  ('CA',      'Conveyance Allowance',    'earning',    'flat',             1600, ARRAY['faculty','non_teaching'], 4),
  ('SA',      'Special Allowance',       'earning',    'flat',             0, ARRAY['faculty','non_teaching'], 5),
  ('MA',      'Medical Allowance',       'earning',    'flat',             1250, ARRAY['faculty','non_teaching'], 6),
  ('LTA',     'Leave Travel Allowance',  'earning',    'percent_of_basic',  0, ARRAY['faculty'], 7)
) AS c(code, display_name, component_type, calculation_basis, default_amount_or_percent, applies_to_engine_types, display_order)
ON CONFLICT DO NOTHING;

-- Verify
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM hr_pay_components WHERE is_system = true;
  RAISE NOTICE '[T4.4] Seeded % system pay components across all institutions', v_count;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Pay component seed produced 0 rows — check institutions table';
  END IF;
END $$;
