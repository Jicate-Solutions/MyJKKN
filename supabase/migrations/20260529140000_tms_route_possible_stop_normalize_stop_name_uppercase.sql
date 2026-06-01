-- Normalize tms_route_possible_stop.stop_name to UPPER CASE. Enforced on every
-- insert/update via a BEFORE trigger. (Table currently empty; backfill is a
-- no-op safeguard for any rows added before this migration ran.)

CREATE OR REPLACE FUNCTION public.tms_route_possible_stop_normalize_fields()
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

DROP TRIGGER IF EXISTS trg_tms_route_possible_stop_normalize_fields ON public.tms_route_possible_stop;
CREATE TRIGGER trg_tms_route_possible_stop_normalize_fields
  BEFORE INSERT OR UPDATE OF stop_name
  ON public.tms_route_possible_stop
  FOR EACH ROW
  EXECUTE FUNCTION public.tms_route_possible_stop_normalize_fields();

-- Backfill: uppercase existing stop names that aren't already uppercase
UPDATE public.tms_route_possible_stop
SET stop_name = upper(stop_name),
    updated_at = now()
WHERE stop_name <> upper(stop_name);
