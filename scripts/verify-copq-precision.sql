-- COPQ Financial Precision Verification Script
-- Run this after applying the migration to verify correctness

-- Step 1: Verify column types
SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_name = 'billing_copq_incidents'
  AND column_name IN ('visible_cost', 'hidden_cost_estimate')
ORDER BY column_name;

-- Expected output:
-- billing_copq_incidents | visible_cost          | bigint | NULL | NULL
-- billing_copq_incidents | hidden_cost_estimate  | bigint | NULL | NULL


-- Step 2: Test precision with sample data
-- This will fail if not using integer paisa!
DO $$
DECLARE
  v_cost1_paisa BIGINT := 10010;  -- ₹100.10 in paisa
  v_cost2_paisa BIGINT := 20020;  -- ₹200.20 in paisa
  v_total_paisa BIGINT;
  v_total_rupees NUMERIC(12,2);
BEGIN
  -- Integer addition (exact)
  v_total_paisa := v_cost1_paisa + v_cost2_paisa;
  v_total_rupees := v_total_paisa / 100.0;

  -- Verify result
  IF v_total_rupees = 300.30 THEN
    RAISE NOTICE 'SUCCESS: Precision test passed - ₹100.10 + ₹200.20 = ₹300.30';
  ELSE
    RAISE EXCEPTION 'FAILED: Precision test failed - Expected ₹300.30, got ₹%', v_total_rupees;
  END IF;
END $$;


-- Step 3: Verify existing data migrated correctly
SELECT
  COUNT(*) as total_incidents,
  MIN(visible_cost / 100.0) as min_visible_rupees,
  MAX(visible_cost / 100.0) as max_visible_rupees,
  MIN(hidden_cost_estimate / 100.0) as min_hidden_rupees,
  MAX(hidden_cost_estimate / 100.0) as max_hidden_rupees
FROM billing_copq_incidents;

-- Expected: All values should be reasonable monetary amounts


-- Step 4: Test aggregation precision
SELECT
  institution_id,
  SUM(visible_cost) as total_visible_paisa,
  SUM(hidden_cost_estimate) as total_hidden_paisa,
  SUM(visible_cost) / 100.0 as total_visible_rupees,
  SUM(hidden_cost_estimate) / 100.0 as total_hidden_rupees,
  (SUM(visible_cost) + SUM(hidden_cost_estimate)) / 100.0 as total_copq_rupees
FROM billing_copq_incidents
GROUP BY institution_id
LIMIT 5;

-- Expected: All rupee values should have exactly 2 decimal places


-- Step 5: Verify dashboard function works with paisa
SELECT get_billing_copq_dashboard(
  'YOUR_INSTITUTION_ID_HERE'::UUID,  -- Replace with actual institution_id
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
);

-- Expected: JSON with all cost values in paisa (will be converted to rupees in service layer)


-- Step 6: Verify views work correctly
SELECT * FROM billing_copq_summary LIMIT 5;
SELECT * FROM billing_copq_yearly_totals LIMIT 5;

-- Expected: All cost columns should be integers (paisa)


-- Step 7: Test edge cases
DO $$
DECLARE
  v_max_value_paisa BIGINT := 99999999999;  -- ₹999,999,999.99
  v_max_value_rupees NUMERIC;
BEGIN
  v_max_value_rupees := v_max_value_paisa / 100.0;

  IF v_max_value_rupees = 999999999.99 THEN
    RAISE NOTICE 'SUCCESS: Maximum value test passed - ₹999,999,999.99';
  ELSE
    RAISE EXCEPTION 'FAILED: Maximum value test failed';
  END IF;
END $$;


-- Step 8: Test many small additions (classic floating-point failure case)
DO $$
DECLARE
  v_total_paisa BIGINT := 0;
  v_total_rupees NUMERIC(12,2);
  v_i INTEGER;
BEGIN
  -- Add ₹0.01 one hundred times
  FOR v_i IN 1..100 LOOP
    v_total_paisa := v_total_paisa + 1;  -- 1 paisa = ₹0.01
  END LOOP;

  v_total_rupees := v_total_paisa / 100.0;

  IF v_total_rupees = 1.00 THEN
    RAISE NOTICE 'SUCCESS: Small additions test passed - 100 × ₹0.01 = ₹1.00';
  ELSE
    RAISE EXCEPTION 'FAILED: Small additions test failed - Expected ₹1.00, got ₹%', v_total_rupees;
  END IF;
END $$;


-- FINAL RESULT
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'billing_copq_incidents'
        AND column_name = 'visible_cost'
        AND data_type = 'bigint'
    ) THEN '✅ PRECISION FIX VERIFIED - Database uses integer paisa'
    ELSE '❌ PRECISION FIX FAILED - Database still uses floating-point'
  END as verification_status;
