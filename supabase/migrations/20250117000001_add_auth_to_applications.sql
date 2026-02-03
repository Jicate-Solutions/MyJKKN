-- Add authentication fields to existing applications table
-- This allows applications to optionally use parent app authentication

-- Add authentication-related columns to applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS uses_parent_auth BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS app_id VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS allowed_redirect_uris TEXT[],
ADD COLUMN IF NOT EXISTS allowed_scopes VARCHAR(50)[] DEFAULT '{read,write,profile}',
ADD COLUMN IF NOT EXISTS rate_limit_requests INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS rate_limit_window_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS last_auth_activity TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auth_enabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auth_enabled_by UUID REFERENCES auth.users(id);

-- Add comments for documentation
COMMENT ON COLUMN public.applications.uses_parent_auth IS 'Whether this application uses MyJKKN authentication instead of separate login';
COMMENT ON COLUMN public.applications.app_id IS 'Unique identifier for authentication (e.g., student_portal_v1)';
COMMENT ON COLUMN public.applications.api_key_hash IS 'SHA-256 hash of the API key for secure authentication';
COMMENT ON COLUMN public.applications.allowed_redirect_uris IS 'List of allowed redirect URIs after authentication';
COMMENT ON COLUMN public.applications.allowed_scopes IS 'Permission scopes the child app can access (uses roles_access field for role-based permissions)';
COMMENT ON COLUMN public.applications.rate_limit_requests IS 'Maximum API requests allowed within the time window';
COMMENT ON COLUMN public.applications.rate_limit_window_minutes IS 'Time window in minutes for rate limiting';
COMMENT ON COLUMN public.applications.last_auth_activity IS 'Last time authentication was used for this app';
COMMENT ON COLUMN public.applications.auth_enabled_at IS 'When parent authentication was enabled';
COMMENT ON COLUMN public.applications.auth_enabled_by IS 'User who enabled parent authentication';

-- Create index for app_id lookups
CREATE INDEX IF NOT EXISTS idx_applications_app_id ON public.applications(app_id) WHERE app_id IS NOT NULL;

-- Create index for active parent auth apps
CREATE INDEX IF NOT EXISTS idx_applications_parent_auth ON public.applications(uses_parent_auth) WHERE uses_parent_auth = true;