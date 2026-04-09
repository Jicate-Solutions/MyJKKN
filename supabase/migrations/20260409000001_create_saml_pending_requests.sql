-- ============================================================================
-- SAML Pending Requests Table
-- Created: 2026-04-09
-- Purpose: Durably store SP-initiated SAML AuthnRequest context across the
--          OAuth login round-trip so the first-login SP-initiated SSO flow
--          completes correctly.
--
-- Background: Previously the pending SAMLRequest/RelayState were piped
-- through the URL as `?redirectedFrom=/api/saml/sso?SAMLRequest=...` which
-- was lost during the Google OAuth bounce (Google returns only ?code=). On
-- second login the active Supabase session skipped the OAuth leg entirely,
-- so the bug appeared only on first login. See docs/features/mathswork/
-- EMAIL_REPLY_TO_MATHWORKS_2026-04-09.md for full context.
-- ============================================================================

CREATE TABLE IF NOT EXISTS saml_pending_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Captured AuthnRequest context
  saml_request TEXT NOT NULL,          -- base64 (or base64+DEFLATE) SAMLRequest
  relay_state TEXT,                    -- opaque state value from SP
  binding TEXT NOT NULL CHECK (binding IN ('post', 'redirect')),
  sp_entity_id TEXT NOT NULL,          -- resolved SP entity id (audit/trace)

  -- Request fingerprint (for audit / debugging)
  user_agent TEXT,
  ip_address TEXT,

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  consumed_at TIMESTAMPTZ               -- set when the request is resumed; row
                                        -- is then deleted by the resume handler
);

-- Lookup is always by primary key, but expiry sweep needs this index
CREATE INDEX idx_saml_pending_requests_expires_at
  ON saml_pending_requests(expires_at);

-- Enable RLS. No client-side roles are granted — all access is through the
-- service-role client used by the SAML SSO and auth callback routes, both
-- of which run server-side in Next.js route handlers.
ALTER TABLE saml_pending_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE saml_pending_requests IS
  'Short-lived store (10 min TTL) for SP-initiated SAML AuthnRequests awaiting user authentication. Written by /api/saml/sso, read+deleted by /api/saml/sso after the auth callback resumes the flow.';

-- Optional cleanup function — can be scheduled via pg_cron if desired.
CREATE OR REPLACE FUNCTION cleanup_expired_saml_pending_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM saml_pending_requests
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
