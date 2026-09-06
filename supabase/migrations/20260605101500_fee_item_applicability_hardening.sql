-- 20260605101500_fee_item_applicability_hardening.sql
-- Hardening for 20260605101000:
--  (1) range-guard applies_year_of_study so a bad capture (e.g. a 4-digit
--      calendar year) fails loudly instead of writing a nonsense year;
--  (2) re-run the tuition backfill case-insensitively so any "N year ..."
--      names (lowercase) the original case-sensitive pass missed get tagged.
ALTER TABLE public.admission_fee_structure_items
  DROP CONSTRAINT IF EXISTS afsi_applies_year_range_chk,
  ADD CONSTRAINT afsi_applies_year_range_chk
    CHECK (applies_year_of_study IS NULL OR applies_year_of_study BETWEEN 1 AND 10);

UPDATE public.admission_fee_structure_items i
SET applies_to = 'specific_year',
    applies_year_of_study = (regexp_match(lower(c.category_name), '^\s*(\d+)\s*year'))[1]::int
FROM public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind = 'tuition'
  AND c.category_name ~* '^\s*\d+\s*year'
  AND (regexp_match(lower(c.category_name), '^\s*(\d+)\s*year'))[1]::int BETWEEN 1 AND 10;
