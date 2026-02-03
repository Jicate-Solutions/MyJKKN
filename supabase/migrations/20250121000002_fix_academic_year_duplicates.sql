-- Fix academic year name with trailing/leading spaces
UPDATE academic_years 
SET academic_year_name = TRIM(academic_year_name)
WHERE academic_year_name != TRIM(academic_year_name);

-- Add a trigger to automatically trim academic year names on insert/update
CREATE OR REPLACE FUNCTION trim_academic_year_name()
RETURNS TRIGGER AS $$
BEGIN
    -- Trim the academic year name to remove any whitespace
    NEW.academic_year_name = TRIM(NEW.academic_year_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trim_academic_year_name_trigger ON academic_years;

-- Create trigger to auto-trim on insert or update
CREATE TRIGGER trim_academic_year_name_trigger
BEFORE INSERT OR UPDATE ON academic_years
FOR EACH ROW
EXECUTE FUNCTION trim_academic_year_name();

-- Add comment for documentation
COMMENT ON TRIGGER trim_academic_year_name_trigger ON academic_years 
IS 'Automatically trims leading and trailing whitespace from academic_year_name to prevent duplicates';