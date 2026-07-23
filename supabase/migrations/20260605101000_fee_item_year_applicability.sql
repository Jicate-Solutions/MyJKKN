-- 20260605101000_fee_item_year_applicability.sql
-- Adds per-year-of-study applicability to admission fee structure items.
ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'every_year',
  ADD COLUMN IF NOT EXISTS applies_year_of_study int NULL;

ALTER TABLE public.admission_fee_structure_items
  DROP CONSTRAINT IF EXISTS afsi_applies_to_chk,
  ADD CONSTRAINT afsi_applies_to_chk
    CHECK (applies_to IN ('first_year_only','every_year','specific_year'));

ALTER TABLE public.admission_fee_structure_items
  DROP CONSTRAINT IF EXISTS afsi_applies_year_chk,
  ADD CONSTRAINT afsi_applies_year_chk
    CHECK ((applies_to = 'specific_year') = (applies_year_of_study IS NOT NULL));

-- Backfill: application + university fees apply in year 1 only.
UPDATE public.admission_fee_structure_items i
SET applies_to = 'first_year_only', applies_year_of_study = NULL
FROM public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind IN ('application_fee','university_fee');

-- Backfill: "N Year Tuition Fee" rows apply in that specific year of study.
UPDATE public.admission_fee_structure_items i
SET applies_to = 'specific_year',
    applies_year_of_study = (regexp_match(c.category_name, '^\s*(\d+)\s*Year'))[1]::int
FROM public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind = 'tuition'
  AND c.category_name ~ '^\s*\d+\s*Year';

-- Everything else (exam, library, transport, other, un-numbered tuition) stays 'every_year' (the default).
