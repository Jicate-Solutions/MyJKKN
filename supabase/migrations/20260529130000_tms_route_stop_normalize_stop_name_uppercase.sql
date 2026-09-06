-- Normalize tms_route_stop.stop_name to UPPER CASE. Enforced on every
-- insert/update via a BEFORE trigger; existing rows backfilled below.

CREATE OR REPLACE FUNCTION public.tms_route_stop_normalize_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- stop_name: always stored UPPER CASE
  IF NEW.stop_name IS NOT NULL THEN
    NEW.stop_name := upper(NEW.stop_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tms_route_stop_normalize_fields ON public.tms_route_stop;
CREATE TRIGGER trg_tms_route_stop_normalize_fields
  BEFORE INSERT OR UPDATE OF stop_name
  ON public.tms_route_stop
  FOR EACH ROW
  EXECUTE FUNCTION public.tms_route_stop_normalize_fields();

-- Backfill: uppercase existing stop names that aren't already uppercase
UPDATE public.tms_route_stop
SET stop_name = upper(stop_name),
    updated_at = now()
WHERE stop_name <> upper(stop_name);
