-- 20260613150100 — Create the "Establishment Fee" billing category (D2 step 2)
--
-- Operators tag establishment-fee bills with this category; such bills then route
-- to the institution's establishment-fee MID (e.g. Dental ESTAB) at payment time,
-- falling back to the institution default MID when no establishment account exists.
-- Idempotent: only inserts when no establishment category exists yet.
INSERT INTO public.billing_categories (category_name, kind, frequency, is_active, description)
SELECT 'Establishment Fee', 'establishment', 'one-time', true,
       'Establishment fee. Routes to the institution''s establishment-fee merchant account when configured.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_categories WHERE kind = 'establishment'
);
