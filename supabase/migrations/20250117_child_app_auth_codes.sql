-- Create child_app_auth_codes table for OAuth flow
CREATE TABLE IF NOT EXISTS public.child_app_auth_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(255) NOT NULL UNIQUE,
  app_id VARCHAR(100) NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_child_app_auth_codes_code ON public.child_app_auth_codes(code);
CREATE INDEX idx_child_app_auth_codes_expires ON public.child_app_auth_codes(expires_at);

-- Enable RLS
ALTER TABLE public.child_app_auth_codes ENABLE ROW LEVEL SECURITY;

-- Create policy for service role only (no direct user access)
CREATE POLICY "Service role only" ON public.child_app_auth_codes
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Create function to clean up expired codes
CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM public.child_app_auth_codes 
  WHERE expires_at < NOW() OR used_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a scheduled job to clean up expired codes (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-auth-codes', '*/5 * * * *', 'SELECT public.cleanup_expired_auth_codes();');