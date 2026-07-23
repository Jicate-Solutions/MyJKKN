-- File: supabase/migrations/20260517000003_billing_categories_kind_enum.sql
BEGIN;

CREATE TYPE billing_category_kind AS ENUM
  ('application_fee','tuition','hostel','transport','exam','library','other');

ALTER TABLE public.billing_categories
  ADD COLUMN kind billing_category_kind NOT NULL DEFAULT 'other';

-- One-time best-effort backfill by name pattern.
UPDATE public.billing_categories SET kind='application_fee'
  WHERE category_name ILIKE 'Application Fee%'
     OR category_name ILIKE 'App. Fee%'
     OR category_name ILIKE 'Application Charges%';

UPDATE public.billing_categories SET kind='tuition'
  WHERE category_name ILIKE 'Tuition%'
     OR category_name ILIKE 'Course Fee%';

UPDATE public.billing_categories SET kind='hostel'
  WHERE category_name ILIKE 'Hostel%'
     OR category_name ILIKE 'Accommodation%';

UPDATE public.billing_categories SET kind='transport'
  WHERE category_name ILIKE 'Transport%' OR category_name ILIKE 'Bus%';

UPDATE public.billing_categories SET kind='exam'
  WHERE category_name ILIKE 'Exam%' OR category_name ILIKE 'University Reg%';

UPDATE public.billing_categories SET kind='library'
  WHERE category_name ILIKE 'Library%';

CREATE INDEX idx_billing_categories_kind ON public.billing_categories(kind);

COMMIT;
