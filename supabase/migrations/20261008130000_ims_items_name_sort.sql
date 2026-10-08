-- Alphabetical item listing: sort chemical names by their first LETTER, so
-- "2-ETHYL HEXANOL" files under E and "1.2 DICHLORO ETHANE" under D, instead of
-- all digit-leading names bunching at the top. PostgREST cannot ORDER BY an
-- expression, hence a stored generated column.
ALTER TABLE public.ims_items
  ADD COLUMN IF NOT EXISTS name_sort text
  GENERATED ALWAYS AS (lower(regexp_replace(name, '^[^A-Za-z]+', ''))) STORED;

COMMENT ON COLUMN public.ims_items.name_sort IS
  'Lower-cased name with leading digits/punctuation stripped; ORDER BY this for A-Z listings.';
