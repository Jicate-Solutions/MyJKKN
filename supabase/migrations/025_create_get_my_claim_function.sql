-- Function to safely get a claim from the current user's JWT.
-- This is a stable and secure way to get user metadata for RLS policies.
CREATE OR REPLACE FUNCTION public.get_my_claim(claim TEXT)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb ->> claim, null)::jsonb;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_claim(TEXT) TO authenticated; 