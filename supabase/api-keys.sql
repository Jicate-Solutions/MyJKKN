-- api-keys.sql
-- Functions and policies for API key handling

-- Function to check if an API key has a specific permission
CREATE OR REPLACE FUNCTION public.api_key_has_permission(permission_name text)
RETURNS boolean AS $$
DECLARE
  api_key_value text;
  api_key_record RECORD;
  permissions_value jsonb;
BEGIN
  -- Get the API key from the request header
  api_key_value := current_setting('request.header.x-api-key', true);
  
  -- If no API key is provided, try the apikey header
  IF api_key_value IS NULL THEN
    api_key_value := current_setting('request.header.apikey', true);
  END IF;
  
  -- If still no API key, try the authorization header
  IF api_key_value IS NULL THEN
    api_key_value := current_setting('request.header.authorization', true);
    -- Extract token from Bearer format if present
    IF api_key_value IS NOT NULL AND api_key_value LIKE 'Bearer %' THEN
      api_key_value := substring(api_key_value FROM 8);
    END IF;
  END IF;
  
  -- If no API key is provided, return false
  IF api_key_value IS NULL THEN
    RETURN false;
  END IF;
  
  -- Find the API key in the database
  SELECT * INTO api_key_record FROM api_keys
  WHERE key_value = api_key_value
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > now());
  
  -- Log for debugging (will appear in Supabase logs)
  PERFORM pg_notify('api_key_debug', 'Checking key: ' || coalesce(api_key_value, 'NULL') || 
                   ', Found: ' || coalesce(api_key_record.id::text, 'NULL'));
  
  -- If API key not found or inactive, return false
  IF api_key_record IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get the permissions value
  permissions_value := api_key_record.permissions::jsonb;
  
  -- Check if permissions is an array
  IF jsonb_typeof(permissions_value) = 'array' THEN
    -- Check if the permission is in the array
    RETURN permissions_value ? permission_name;
  -- Check if permissions is an object
  ELSIF jsonb_typeof(permissions_value) = 'object' THEN
    -- Check if the permission is a property with value true
    RETURN (permissions_value ->> permission_name)::boolean = true;
  ELSE
    -- Unknown permissions format
    RETURN false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for programs
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.programs;
CREATE POLICY "Enable read access for API keys" ON public.programs
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for degrees
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.degrees;
CREATE POLICY "Enable read access for API keys" ON public.degrees
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for departments
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.departments;
CREATE POLICY "Enable read access for API keys" ON public.departments
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for institutions
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.institutions;
CREATE POLICY "Enable read access for API keys" ON public.institutions
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for courses
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.courses;
CREATE POLICY "Enable read access for API keys" ON public.courses
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for semesters
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.semesters;
CREATE POLICY "Enable read access for API keys" ON public.semesters
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);

-- Update RLS policies for sections
DROP POLICY IF EXISTS "Enable read access for API keys" ON public.sections;
CREATE POLICY "Enable read access for API keys" ON public.sections
FOR SELECT TO public
USING (
  public.api_key_has_permission('read')
);
