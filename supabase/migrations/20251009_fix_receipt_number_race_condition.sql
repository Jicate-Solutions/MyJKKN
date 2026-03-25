-- =====================================================
-- Migration: Fix Receipt Number Generation Race Condition
-- Date: 2025-10-09
-- Issue: Duplicate receipt numbers when multiple receipts created concurrently
-- Error: "duplicate key value violates unique constraint billing_receipts_receipt_number_key"
-- Root Cause: generate_receipt_number() function uses MAX() which is not atomic
-- Solution: Use PostgreSQL sequence for atomic number generation
-- =====================================================

-- =====================================================
-- PART 1: Create Receipt Number Sequence
-- =====================================================

-- Create a sequence for generating receipt numbers
-- Start from 1 for each year
CREATE SEQUENCE IF NOT EXISTS billing_receipt_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- =====================================================
-- PART 2: Find Current Maximum and Reset Sequence
-- =====================================================

DO $$
DECLARE
    current_year TEXT;
    current_max INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;

    -- Get the current maximum receipt number for this year
    -- RCP-2025-000001 -> SUBSTRING FROM 10 gives "000001"
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 10) AS INTEGER)), 0)
    INTO current_max
    FROM public.billing_receipts
    WHERE receipt_number LIKE 'RCP-' || current_year || '-%';

    -- Set the sequence to start from the next number
    EXECUTE format('ALTER SEQUENCE billing_receipt_number_seq RESTART WITH %s', current_max + 1);

    RAISE NOTICE 'Current year: %, Max receipt number: %, Sequence will start from: %',
        current_year, current_max, current_max + 1;
END $$;

-- =====================================================
-- PART 3: Update generate_receipt_number Function
-- =====================================================

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  receipt_num TEXT;
BEGIN
  year_part := EXTRACT(YEAR FROM NOW())::TEXT;

  -- Get the next value from the sequence (atomic operation)
  sequence_num := nextval('billing_receipt_number_seq');

  -- Format: RCP-YYYY-NNNNNN
  receipt_num := 'RCP-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');

  RETURN receipt_num;
END;
$function$;

-- Update function comment
COMMENT ON FUNCTION public.generate_receipt_number() IS
'Generates unique receipt numbers in format RCP-YYYY-NNNNNN using a PostgreSQL sequence.
Updated: 2025-10-09 - Fixed race condition by using sequence instead of MAX().
This ensures atomic number generation and prevents duplicates in concurrent scenarios.';

-- =====================================================
-- PART 4: Create Function to Reset Sequence for New Year
-- =====================================================

-- Function to reset the sequence at the start of a new year
CREATE OR REPLACE FUNCTION public.reset_receipt_number_sequence_for_year()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    current_year TEXT;
    current_max INTEGER;
BEGIN
    current_year := EXTRACT(YEAR FROM NOW())::TEXT;

    -- Get the current maximum receipt number for this year
    -- RCP-2025-000001 -> SUBSTRING FROM 10 gives "000001"
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 10) AS INTEGER)), 0)
    INTO current_max
    FROM public.billing_receipts
    WHERE receipt_number LIKE 'RCP-' || current_year || '-%';

    -- Reset sequence to start from the next number
    PERFORM setval('billing_receipt_number_seq', current_max + 1, false);

    RAISE NOTICE 'Receipt number sequence reset for year %. Starting from: %',
        current_year, current_max + 1;
END;
$function$;

COMMENT ON FUNCTION public.reset_receipt_number_sequence_for_year() IS
'Resets the receipt number sequence based on the maximum receipt number for the current year.
Call this function at the start of each new year to reset numbering to 1.
This can also be called if the sequence gets out of sync with actual data.';

-- =====================================================
-- PART 5: Verification
-- =====================================================

DO $$
DECLARE
    test_number_1 TEXT;
    test_number_2 TEXT;
    test_number_3 TEXT;
BEGIN
    RAISE NOTICE '=== Migration Verification ===';

    -- Test that the function generates unique sequential numbers
    test_number_1 := generate_receipt_number();
    test_number_2 := generate_receipt_number();
    test_number_3 := generate_receipt_number();

    RAISE NOTICE 'Test receipt number 1: %', test_number_1;
    RAISE NOTICE 'Test receipt number 2: %', test_number_2;
    RAISE NOTICE 'Test receipt number 3: %', test_number_3;

    -- Verify numbers are sequential
    IF test_number_1 < test_number_2 AND test_number_2 < test_number_3 THEN
        RAISE NOTICE '✓ Receipt numbers are sequential and unique';
    ELSE
        RAISE WARNING 'Numbers may not be sequential: %, %, %',
            test_number_1, test_number_2, test_number_3;
    END IF;

    -- Roll back the sequence to before the test
    PERFORM setval('billing_receipt_number_seq',
        currval('billing_receipt_number_seq') - 3,
        true);
    RAISE NOTICE 'Test numbers rolled back';
END $$;

-- =====================================================
-- PART 6: Usage Notes
-- =====================================================

/*
USAGE NOTES:

1. The sequence will automatically generate unique numbers for receipts
2. Receipt numbers will be in format: RCP-YYYY-NNNNNN
3. At the start of each new year, you should call:
   SELECT reset_receipt_number_sequence_for_year();

4. If the sequence ever gets out of sync (e.g., after manual data import), call:
   SELECT reset_receipt_number_sequence_for_year();

5. To check the current sequence value:
   SELECT currval('billing_receipt_number_seq');

6. To check the next value without incrementing:
   SELECT last_value FROM billing_receipt_number_seq;

CONCURRENCY:
- The sequence guarantees unique numbers even with concurrent INSERT operations
- No race conditions or duplicate key errors
- Handles thousands of concurrent receipt generations safely
*/

-- =====================================================
-- End of Migration
-- =====================================================
