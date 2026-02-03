-- ============================================================================
-- SAML Identity Provider Tables
-- Created: 2026-02-03
-- Purpose: Store SAML service providers and sessions for SSO
-- ============================================================================

-- ============================================================================
-- Table: saml_service_providers
-- Purpose: Registry of trusted SAML Service Providers (e.g., MathWorks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS saml_service_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Service Provider Identity
  entity_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,

  -- Endpoints
  metadata_url TEXT,
  assertion_consumer_service_url TEXT NOT NULL,
  single_logout_service_url TEXT,

  -- Certificates
  x509_certificate TEXT, -- SP's public certificate (if signed requests)

  -- Configuration
  want_assertions_signed BOOLEAN NOT NULL DEFAULT true,
  want_authn_requests_signed BOOLEAN NOT NULL DEFAULT false,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_saml_service_providers_entity_id ON saml_service_providers(entity_id);
CREATE INDEX idx_saml_service_providers_is_active ON saml_service_providers(is_active);

-- Updated timestamp trigger
CREATE TRIGGER set_saml_service_providers_updated_at
  BEFORE UPDATE ON saml_service_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Admin-only access)
ALTER TABLE saml_service_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view service providers"
  ON saml_service_providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY "Admin users can insert service providers"
  ON saml_service_providers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'administrator')
    )
  );

CREATE POLICY "Admin users can update service providers"
  ON saml_service_providers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('super_admin', 'administrator')
    )
  );

-- ============================================================================
-- Table: saml_sessions
-- Purpose: Track active SAML SSO sessions for Single Logout support
-- ============================================================================

CREATE TABLE IF NOT EXISTS saml_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session Identity
  session_index TEXT NOT NULL UNIQUE,

  -- User
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Service Provider
  service_provider_entity_id TEXT NOT NULL,

  -- NameID
  name_id TEXT NOT NULL,
  name_id_format TEXT NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Metadata
  ip_address TEXT,
  user_agent TEXT,

  -- Indexes
  CONSTRAINT fk_service_provider
    FOREIGN KEY (service_provider_entity_id)
    REFERENCES saml_service_providers(entity_id)
    ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_saml_sessions_user_id ON saml_sessions(user_id);
CREATE INDEX idx_saml_sessions_session_index ON saml_sessions(session_index);
CREATE INDEX idx_saml_sessions_expires_at ON saml_sessions(expires_at);
CREATE INDEX idx_saml_sessions_service_provider ON saml_sessions(service_provider_entity_id);

-- RLS Policies
ALTER TABLE saml_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sessions"
  ON saml_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service can create sessions"
  ON saml_sessions FOR INSERT
  WITH CHECK (true); -- Service layer will handle authorization

CREATE POLICY "Users can delete their own sessions"
  ON saml_sessions FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- Function: Cleanup expired sessions
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_saml_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM saml_sessions
  WHERE expires_at < NOW();
END;
$$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE saml_service_providers IS 'Registry of trusted SAML Service Providers for SSO integration';
COMMENT ON TABLE saml_sessions IS 'Active SAML SSO sessions for Single Logout support';
COMMENT ON FUNCTION cleanup_expired_saml_sessions IS 'Remove expired SAML sessions (run via cron)';
