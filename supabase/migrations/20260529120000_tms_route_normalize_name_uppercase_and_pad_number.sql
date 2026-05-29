-- Normalize tms_route.route_name to UPPER CASE and zero-pad purely-numeric
-- route_number to at least 2 digits (01, 02, ... 10). Enforced on every
-- insert/update via a BEFORE trigger; existing rows backfilled below.

CREATE OR REPLACE FUNCTION public.tms_route_normalize_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- route_name: always stored UPPER CASE
  IF NEW.route_name IS NOT NULL THEN
    NEW.route_name := upper(NEW.route_name);
  END IF;

  -- route_number: zero-pad purely-numeric values to >= 2 digits.
  -- lpad never truncates, so values already >= 2 chars (incl. "100") are unchanged.
  IF NEW.route_number ~ '^[0-9]+$' THEN
    NEW.route_number := lpad(NEW.route_number, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tms_route_normalize_fields ON public.tms_route;
CREATE TRIGGER trg_tms_route_normalize_fields
  BEFORE INSERT OR UPDATE OF route_name, route_number
  ON public.tms_route
  FOR EACH ROW
  EXECUTE FUNCTION public.tms_route_normalize_fields();

-- Backfill: uppercase existing route names that aren't already uppercase
UPDATE public.tms_route
SET route_name = upper(route_name),
    updated_at = now()
WHERE route_name <> upper(route_name);

-- Backfill: zero-pad single-digit (and any short numeric) route numbers
UPDATE public.tms_route
SET route_number = lpad(route_number, 2, '0'),
    updated_at = now()
WHERE route_number ~ '^[0-9]+$'
  AND route_number <> lpad(route_number, 2, '0');
