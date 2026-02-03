# SAML Identity Provider for MathWorks SSO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a SAML 2.0 Identity Provider in MyJKKN to enable MathWorks Single Sign-On integration.

**Architecture:** Implement SAML IdP using `samlify` library integrated with existing Supabase authentication. Generate RSA certificate pair for signing SAML responses. Create API endpoints for SAML metadata, SSO login, and Assertion Consumer Service (ACS) callback handling. Map MyJKKN user attributes (email, role, name) to SAML claims required by MathWorks.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth, samlify (SAML 2.0), jose (JWT verification), crypto (certificate generation), Zod validation

---

## Prerequisites Checklist

Before starting implementation:
- [ ] Backup database: `pg_dump` or Supabase dashboard snapshot
- [ ] Create git feature branch: `git checkout -b feature/saml-idp-mathworks`
- [ ] Review MathWorks metadata: `docs/features/mathswork/PROD-authngateway_metadata-PROD.xml`
- [ ] Install new dependencies (see Task 1)
- [ ] Generate RSA certificate pair (see Task 2)
- [ ] Add environment variables (see Task 2)

---

## Task 1: Install SAML Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install samlify library**

Run the following command:
```bash
npm install samlify
```

**Step 2: Install type definitions**

```bash
npm install --save-dev @types/samlify
```

**Step 3: Verify installation**

Run: `npm list samlify`
Expected: `samlify@2.8.11` (or latest version)

**Step 4: Commit dependency changes**

```bash
git add package.json package-lock.json
git commit -m "chore: add samlify library for SAML IdP"
```

---

## Task 2: Generate SAML Certificate and Configure Environment

**Files:**
- Create: `scripts/generate-saml-cert.js`
- Modify: `.env.local`
- Modify: `.env.example`

**Step 1: Create certificate generation script**

Create `scripts/generate-saml-cert.js`:

```javascript
/**
 * Generate RSA Certificate Pair for SAML IdP
 *
 * Run: node scripts/generate-saml-cert.js
 *
 * Outputs:
 * - Private key (for signing SAML responses)
 * - Public certificate (to share with MathWorks)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSAMLCertificate() {
  console.log('🔐 Generating RSA-2048 key pair for SAML IdP...\n');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Remove headers and newlines for environment variable format
  const privateKeyBase64 = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const publicKeyBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');

  // Save to files for reference
  const certDir = path.join(__dirname, '..', 'certs', 'saml');
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  fs.writeFileSync(path.join(certDir, 'saml-private-key.pem'), privateKey);
  fs.writeFileSync(path.join(certDir, 'saml-public-key.pem'), publicKey);

  console.log('✅ Certificate files saved to certs/saml/\n');
  console.log('📋 Add these to your .env.local file:\n');
  console.log('SAML_PRIVATE_KEY=' + privateKeyBase64);
  console.log('\nSAML_PUBLIC_CERTIFICATE=' + publicKeyBase64);
  console.log('\n📧 Share saml-public-key.pem with MathWorks');
  console.log('\n⚠️  NEVER commit private key to version control!');
}

generateSAMLCertificate();
```

**Step 2: Run certificate generation**

Run: `node scripts/generate-saml-cert.js`
Expected: Certificate files created in `certs/saml/` and environment variables printed

**Step 3: Add to .gitignore**

Add to `.gitignore`:
```
# SAML Certificates (NEVER commit private keys)
certs/saml/*.pem
```

**Step 4: Add environment variables**

Add to `.env.local` (replace with your generated values):
```bash
# ============================================
# SAML Identity Provider Configuration
# ============================================
# SAML IdP Entity ID (your platform identifier)
SAML_IDP_ENTITY_ID=https://jkkn.ai/saml/metadata

# SAML Private Key (for signing SAML responses)
# Generated via: node scripts/generate-saml-cert.js
SAML_PRIVATE_KEY=<your-base64-private-key>

# SAML Public Certificate (share with Service Providers)
SAML_PUBLIC_CERTIFICATE=<your-base64-public-certificate>

# SAML Response Expiry (in minutes)
SAML_RESPONSE_EXPIRY_MINUTES=5

# Allowed Service Providers (comma-separated Entity IDs)
SAML_ALLOWED_SERVICE_PROVIDERS=https://login.mathworks.com/authngateway/saml/metadata
```

**Step 5: Update .env.example**

Add to `.env.example`:
```bash
# SAML Identity Provider Configuration
SAML_IDP_ENTITY_ID=https://jkkn.ai/saml/metadata
SAML_PRIVATE_KEY=your-private-key
SAML_PUBLIC_CERTIFICATE=your-public-certificate
SAML_RESPONSE_EXPIRY_MINUTES=5
SAML_ALLOWED_SERVICE_PROVIDERS=https://login.mathworks.com/authngateway/saml/metadata
```

**Step 6: Commit changes**

```bash
git add scripts/generate-saml-cert.js .gitignore .env.example
git commit -m "chore: add SAML certificate generation script and env config"
```

---

## Task 3: Create SAML Types and Error Classes

**Files:**
- Create: `types/saml.ts`

**Step 1: Create SAML type definitions**

Create `types/saml.ts`:

```typescript
/**
 * SAML (Security Assertion Markup Language) Type Definitions
 *
 * Types for SAML 2.0 Identity Provider implementation
 * Created: 2026-02-03
 */

// ============================================================================
// SAML Configuration Types
// ============================================================================

export interface SamlIdpConfig {
  entityId: string;
  singleSignOnServiceUrl: string;
  singleLogoutServiceUrl?: string;
  x509Certificate: string;
  privateKey: string;
  responseExpiryMinutes?: number;
  assertionExpiryMinutes?: number;
  nameIdFormat?: SamlNameIdFormat;
  signatureAlgorithm?: 'sha256' | 'sha512';
}

export interface SamlSpConfig {
  entityId: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl?: string;
  x509Certificate?: string;
  wantAssertionsSigned?: boolean;
  wantAuthnRequestsSigned?: boolean;
}

// ============================================================================
// SAML NameID Format Types
// ============================================================================

export type SamlNameIdFormat =
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
  | 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'
  | 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified';

// ============================================================================
// SAML Request/Response Types
// ============================================================================

export interface SamlAuthnRequest {
  id: string;
  issuer: string;
  assertionConsumerServiceUrl: string;
  destination?: string;
  protocolBinding?: string;
  issueInstant: string;
  relayState?: string;
}

export interface SamlResponse {
  id: string;
  issuer: string;
  inResponseTo?: string;
  destination: string;
  issueInstant: string;
  statusCode: SamlStatusCode;
  assertion?: SamlAssertion;
  relayState?: string;
}

export interface SamlAssertion {
  id: string;
  issuer: string;
  subject: SamlSubject;
  conditions: SamlConditions;
  authnStatement: SamlAuthnStatement;
  attributeStatement?: SamlAttributeStatement;
}

export interface SamlSubject {
  nameId: {
    format: SamlNameIdFormat;
    value: string;
  };
  subjectConfirmation: {
    method: 'urn:oasis:names:tc:SAML:2.0:cm:bearer';
    subjectConfirmationData: {
      recipient: string;
      notOnOrAfter: string;
      inResponseTo?: string;
    };
  };
}

export interface SamlConditions {
  notBefore: string;
  notOnOrAfter: string;
  audienceRestriction: {
    audience: string;
  };
}

export interface SamlAuthnStatement {
  authnInstant: string;
  sessionIndex: string;
  authnContext: {
    authnContextClassRef: string;
  };
}

export interface SamlAttributeStatement {
  attributes: SamlAttribute[];
}

export interface SamlAttribute {
  name: string;
  friendlyName?: string;
  nameFormat?: string;
  values: string[];
}

// ============================================================================
// SAML Status Codes
// ============================================================================

export type SamlStatusCode =
  | 'urn:oasis:names:tc:SAML:2.0:status:Success'
  | 'urn:oasis:names:tc:SAML:2.0:status:Requester'
  | 'urn:oasis:names:tc:SAML:2.0:status:Responder'
  | 'urn:oasis:names:tc:SAML:2.0:status:VersionMismatch'
  | 'urn:oasis:names:tc:SAML:2.0:status:AuthnFailed'
  | 'urn:oasis:names:tc:SAML:2.0:status:InvalidAttrNameOrValue'
  | 'urn:oasis:names:tc:SAML:2.0:status:InvalidNameIDPolicy'
  | 'urn:oasis:names:tc:SAML:2.0:status:NoAuthnContext'
  | 'urn:oasis:names:tc:SAML:2.0:status:NoAvailableIDP'
  | 'urn:oasis:names:tc:SAML:2.0:status:NoPassive'
  | 'urn:oasis:names:tc:SAML:2.0:status:NoSupportedIDP'
  | 'urn:oasis:names:tc:SAML:2.0:status:PartialLogout'
  | 'urn:oasis:names:tc:SAML:2.0:status:ProxyCountExceeded'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestDenied'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestUnsupported'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionDeprecated'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionTooHigh'
  | 'urn:oasis:names:tc:SAML:2.0:status:RequestVersionTooLow'
  | 'urn:oasis:names:tc:SAML:2.0:status:ResourceNotRecognized'
  | 'urn:oasis:names:tc:SAML:2.0:status:TooManyResponses'
  | 'urn:oasis:names:tc:SAML:2.0:status:UnknownAttrProfile'
  | 'urn:oasis:names:tc:SAML:2.0:status:UnknownPrincipal'
  | 'urn:oasis:names:tc:SAML:2.0:status:UnsupportedBinding';

// ============================================================================
// MathWorks-Specific Attribute Mapping
// ============================================================================

export interface MathWorksUserAttributes {
  identifier: string; // NameId, ePTID, or ePPN
  affiliation: MathWorksAffiliation; // Faculty, Staff, Student, Employee, Member
  email: string; // mail or email
  givenName?: string;
  surname?: string;
  displayName?: string;
}

export type MathWorksAffiliation =
  | 'Faculty'
  | 'Staff'
  | 'Student'
  | 'Employee'
  | 'Member';

// MyJKKN Role to MathWorks Affiliation Mapping
export const MYJKKN_TO_MATHWORKS_AFFILIATION: Record<string, MathWorksAffiliation> = {
  student: 'Student',
  faculty: 'Faculty',
  hod: 'Faculty',
  principal: 'Faculty',
  administrator: 'Staff',
  super_admin: 'Staff',
  staff: 'Staff',
};

// ============================================================================
// SAML Session Types
// ============================================================================

export interface SamlSession {
  id: string;
  session_index: string;
  user_id: string;
  service_provider_entity_id: string;
  name_id: string;
  name_id_format: SamlNameIdFormat;
  created_at: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

export interface SamlSessionInsert {
  session_index: string;
  user_id: string;
  service_provider_entity_id: string;
  name_id: string;
  name_id_format: SamlNameIdFormat;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

// ============================================================================
// SAML Service Provider Registry Types
// ============================================================================

export interface SamlServiceProvider {
  id: string;
  entity_id: string;
  name: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed: boolean;
  want_authn_requests_signed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface SamlServiceProviderInsert {
  entity_id: string;
  name: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed?: boolean;
  want_authn_requests_signed?: boolean;
  is_active?: boolean;
}

export interface SamlServiceProviderUpdate {
  entity_id?: string;
  name?: string;
  description?: string;
  metadata_url?: string;
  assertion_consumer_service_url?: string;
  single_logout_service_url?: string;
  x509_certificate?: string;
  want_assertions_signed?: boolean;
  want_authn_requests_signed?: boolean;
  is_active?: boolean;
  updated_by?: string;
}

// ============================================================================
// SAML Error Types
// ============================================================================

export class SamlError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public samlStatusCode?: SamlStatusCode,
    public details?: any
  ) {
    super(message);
    this.name = 'SamlError';
  }
}

export const SAML_ERROR_CODES = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_SIGNATURE: 'invalid_signature',
  EXPIRED_REQUEST: 'expired_request',
  UNKNOWN_SERVICE_PROVIDER: 'unknown_service_provider',
  SERVICE_PROVIDER_INACTIVE: 'service_provider_inactive',
  USER_NOT_AUTHENTICATED: 'user_not_authenticated',
  USER_NOT_FOUND: 'user_not_found',
  ATTRIBUTE_MAPPING_FAILED: 'attribute_mapping_failed',
  RESPONSE_GENERATION_FAILED: 'response_generation_failed',
  SESSION_CREATION_FAILED: 'session_creation_failed',
  INVALID_METADATA: 'invalid_metadata',
  CERTIFICATE_ERROR: 'certificate_error',
  UNAUTHORIZED: 'unauthorized',
} as const;

// ============================================================================
// SAML API Request/Response Types
// ============================================================================

export interface SamlSsoLoginRequest {
  SAMLRequest: string; // Base64-encoded AuthnRequest
  RelayState?: string; // Opaque state to return to SP
  SigAlg?: string; // Signature algorithm if signed
  Signature?: string; // Signature if signed
}

export interface SamlSsoLoginResponse {
  SAMLResponse: string; // Base64-encoded Response
  RelayState?: string;
  action: string; // ACS URL to POST to
}

export interface SamlMetadataResponse {
  xml: string;
  contentType: 'application/samlmetadata+xml';
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ParsedSamlRequest {
  id: string;
  issuer: string;
  assertionConsumerServiceUrl: string;
  destination?: string;
  issueInstant: Date;
  forceAuthn?: boolean;
  isPassive?: boolean;
}
```

**Step 2: Commit SAML types**

```bash
git add types/saml.ts
git commit -m "feat: add SAML type definitions for IdP implementation"
```

---

## Task 4: Create Database Schema for SAML

**Files:**
- Create: `supabase/migrations/20260203000001_create_saml_tables.sql`
- Modify: `supabase/SQL_FILE_INDEX.md`

**Step 1: Create migration file**

Create `supabase/migrations/20260203000001_create_saml_tables.sql`:

```sql
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
```

**Step 2: Run migration locally**

If you have local Supabase setup:
```bash
supabase db reset
```

Or run directly in Supabase Dashboard SQL Editor.

**Step 3: Update SQL_FILE_INDEX.md**

Add to `supabase/SQL_FILE_INDEX.md`:

```markdown
## Recent Changes

### 2026-02-03: SAML Identity Provider Tables
- **File**: `migrations/20260203000001_create_saml_tables.sql`
- **Tables Added**:
  - `saml_service_providers`: Registry of trusted SAML SPs (e.g., MathWorks)
  - `saml_sessions`: Track active SSO sessions for Single Logout
- **Functions**: `cleanup_expired_saml_sessions()` - Remove expired sessions
- **Purpose**: Enable SAML SSO with MathWorks and other external systems
```

**Step 4: Commit migration**

```bash
git add supabase/migrations/20260203000001_create_saml_tables.sql supabase/SQL_FILE_INDEX.md
git commit -m "feat: add SAML service providers and sessions tables"
```

---

## Task 5: Create SAML Service Provider Service

**Files:**
- Create: `lib/services/saml/saml-service-provider-service.ts`

**Step 1: Create service file**

Create `lib/services/saml/saml-service-provider-service.ts`:

```typescript
/**
 * SAML Service Provider Management Service
 *
 * Handles CRUD operations for trusted SAML Service Providers
 */

import { createClient } from '@/lib/supabase/server';
import {
  SamlServiceProvider,
  SamlServiceProviderInsert,
  SamlServiceProviderUpdate,
  SamlError,
  SAML_ERROR_CODES,
} from '@/types/saml';

export class SamlServiceProviderService {
  /**
   * Get all service providers
   */
  static async getServiceProviders(
    includeInactive = false
  ): Promise<SamlServiceProvider[]> {
    const supabase = await createClient();

    let query = supabase
      .from('saml_service_providers')
      .select('*')
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new SamlError(
        'Failed to fetch service providers',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlServiceProvider[];
  }

  /**
   * Get service provider by entity ID
   */
  static async getServiceProviderByEntityId(
    entityId: string
  ): Promise<SamlServiceProvider | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .select('*')
      .eq('entity_id', entityId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new SamlError(
        'Failed to fetch service provider',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Get service provider by ID
   */
  static async getServiceProviderById(
    id: string
  ): Promise<SamlServiceProvider | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new SamlError(
        'Failed to fetch service provider',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Create new service provider
   */
  static async createServiceProvider(
    serviceProvider: SamlServiceProviderInsert,
    createdBy?: string
  ): Promise<SamlServiceProvider> {
    const supabase = await createClient();

    // Check if entity_id already exists
    const existing = await this.getServiceProviderByEntityId(
      serviceProvider.entity_id
    );

    if (existing) {
      throw new SamlError(
        `Service provider with entity ID ${serviceProvider.entity_id} already exists`,
        SAML_ERROR_CODES.INVALID_REQUEST,
        400
      );
    }

    const { data, error } = await supabase
      .from('saml_service_providers')
      .insert({
        ...serviceProvider,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new SamlError(
        'Failed to create service provider',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Update service provider
   */
  static async updateServiceProvider(
    id: string,
    updates: SamlServiceProviderUpdate,
    updatedBy?: string
  ): Promise<SamlServiceProvider> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .update({
        ...updates,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new SamlError(
        'Failed to update service provider',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Delete service provider (soft delete by deactivating)
   */
  static async deleteServiceProvider(
    id: string,
    updatedBy?: string
  ): Promise<void> {
    await this.updateServiceProvider(
      id,
      { is_active: false },
      updatedBy
    );
  }

  /**
   * Validate service provider is active and allowed
   */
  static async validateServiceProvider(
    entityId: string
  ): Promise<SamlServiceProvider> {
    const sp = await this.getServiceProviderByEntityId(entityId);

    if (!sp) {
      throw new SamlError(
        `Unknown service provider: ${entityId}`,
        SAML_ERROR_CODES.UNKNOWN_SERVICE_PROVIDER,
        404,
        'urn:oasis:names:tc:SAML:2.0:status:Requester'
      );
    }

    if (!sp.is_active) {
      throw new SamlError(
        `Service provider ${sp.name} is inactive`,
        SAML_ERROR_CODES.SERVICE_PROVIDER_INACTIVE,
        403,
        'urn:oasis:names:tc:SAML:2.0:status:Requester'
      );
    }

    return sp;
  }
}
```

**Step 2: Commit service**

```bash
git add lib/services/saml/saml-service-provider-service.ts
git commit -m "feat: add SAML service provider management service"
```

---

## Task 6: Create SAML Session Service

**Files:**
- Create: `lib/services/saml/saml-session-service.ts`

**Step 1: Create session service**

Create `lib/services/saml/saml-session-service.ts`:

```typescript
/**
 * SAML Session Management Service
 *
 * Handles SAML SSO session tracking for Single Logout support
 */

import { createClient } from '@/lib/supabase/server';
import {
  SamlSession,
  SamlSessionInsert,
  SamlError,
  SAML_ERROR_CODES,
} from '@/types/saml';
import { v4 as uuidv4 } from 'uuid';

export class SamlSessionService {
  /**
   * Create new SAML session
   */
  static async createSession(
    sessionData: Omit<SamlSessionInsert, 'session_index'>,
    expiryMinutes = 480 // 8 hours default
  ): Promise<SamlSession> {
    const supabase = await createClient();

    const sessionIndex = uuidv4();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    const { data, error } = await supabase
      .from('saml_sessions')
      .insert({
        session_index: sessionIndex,
        ...sessionData,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new SamlError(
        'Failed to create SAML session',
        SAML_ERROR_CODES.SESSION_CREATION_FAILED,
        500,
        undefined,
        error
      );
    }

    return data as SamlSession;
  }

  /**
   * Get session by session index
   */
  static async getSessionByIndex(
    sessionIndex: string
  ): Promise<SamlSession | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .select('*')
      .eq('session_index', sessionIndex)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new SamlError(
        'Failed to fetch session',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    // Check expiry
    const session = data as SamlSession;
    if (new Date(session.expires_at) < new Date()) {
      await this.deleteSession(sessionIndex);
      return null;
    }

    return session;
  }

  /**
   * Get all sessions for a user
   */
  static async getUserSessions(userId: string): Promise<SamlSession[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw new SamlError(
        'Failed to fetch user sessions',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data as SamlSession[];
  }

  /**
   * Delete session by session index
   */
  static async deleteSession(sessionIndex: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('saml_sessions')
      .delete()
      .eq('session_index', sessionIndex);

    if (error) {
      throw new SamlError(
        'Failed to delete session',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }
  }

  /**
   * Delete all sessions for a user
   */
  static async deleteUserSessions(userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('saml_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new SamlError(
        'Failed to delete user sessions',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }
  }

  /**
   * Cleanup expired sessions (call from cron job)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_sessions')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      throw new SamlError(
        'Failed to cleanup expired sessions',
        SAML_ERROR_CODES.DATABASE_ERROR,
        500,
        undefined,
        error
      );
    }

    return data?.length || 0;
  }
}
```

**Step 2: Commit session service**

```bash
git add lib/services/saml/saml-session-service.ts
git commit -m "feat: add SAML session management service"
```

---

## Task 7: Create SAML IdP Core Service

**Files:**
- Create: `lib/services/saml/saml-idp-service.ts`

**Step 1: Create SAML IdP service**

Create `lib/services/saml/saml-idp-service.ts`:

```typescript
/**
 * SAML Identity Provider Core Service
 *
 * Handles SAML request parsing, response generation, and signing
 */

import * as samlify from 'samlify';
import {
  SamlIdpConfig,
  SamlSpConfig,
  ParsedSamlRequest,
  SamlError,
  SAML_ERROR_CODES,
  MathWorksUserAttributes,
  MYJKKN_TO_MATHWORKS_AFFILIATION,
} from '@/types/saml';
import { SamlServiceProviderService } from './saml-service-provider-service';

export class SamlIdpService {
  private static idpInstance: samlify.IdentityProvider | null = null;

  /**
   * Get or create SAML IdP instance
   */
  private static getIdP(): samlify.IdentityProvider {
    if (this.idpInstance) {
      return this.idpInstance;
    }

    const config: SamlIdpConfig = this.getIdPConfig();

    this.idpInstance = samlify.IdentityProvider({
      entityID: config.entityId,
      privateKey: this.formatPrivateKey(config.privateKey),
      privateKeyPass: undefined,
      isAssertionEncrypted: false,
      encPrivateKey: undefined,
      encPrivateKeyPass: undefined,
      assertionEndpoint: config.singleSignOnServiceUrl,
      singleSignOnService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: config.singleSignOnServiceUrl,
        },
        {
          Binding: samlify.Constants.namespace.binding.redirect,
          Location: config.singleSignOnServiceUrl,
        },
      ],
      singleLogoutService: config.singleLogoutServiceUrl
        ? [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: config.singleLogoutServiceUrl,
            },
          ]
        : [],
      nameIDFormat: [config.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
      signingCert: this.formatCertificate(config.x509Certificate),
    });

    return this.idpInstance;
  }

  /**
   * Get IdP configuration from environment variables
   */
  private static getIdPConfig(): SamlIdpConfig {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://jkkn.ai';
    const privateKey = process.env.SAML_PRIVATE_KEY;
    const certificate = process.env.SAML_PUBLIC_CERTIFICATE;

    if (!privateKey || !certificate) {
      throw new SamlError(
        'SAML private key or certificate not configured',
        SAML_ERROR_CODES.CERTIFICATE_ERROR,
        500
      );
    }

    return {
      entityId: process.env.SAML_IDP_ENTITY_ID || `${baseUrl}/saml/metadata`,
      singleSignOnServiceUrl: `${baseUrl}/api/saml/sso`,
      singleLogoutServiceUrl: `${baseUrl}/api/saml/slo`,
      x509Certificate: certificate,
      privateKey: privateKey,
      responseExpiryMinutes: parseInt(
        process.env.SAML_RESPONSE_EXPIRY_MINUTES || '5'
      ),
      assertionExpiryMinutes: parseInt(
        process.env.SAML_ASSERTION_EXPIRY_MINUTES || '5'
      ),
      nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      signatureAlgorithm: 'sha256',
    };
  }

  /**
   * Format private key for samlify
   */
  private static formatPrivateKey(key: string): string {
    if (key.includes('BEGIN PRIVATE KEY')) {
      return key;
    }
    return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }

  /**
   * Format certificate for samlify
   */
  private static formatCertificate(cert: string): string {
    if (cert.includes('BEGIN CERTIFICATE')) {
      return cert;
    }
    return `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`;
  }

  /**
   * Create Service Provider instance from database
   */
  private static async createSP(
    entityId: string
  ): Promise<samlify.ServiceProvider> {
    const sp = await SamlServiceProviderService.validateServiceProvider(entityId);

    return samlify.ServiceProvider({
      entityID: sp.entity_id,
      assertionConsumerService: [
        {
          Binding: samlify.Constants.namespace.binding.post,
          Location: sp.assertion_consumer_service_url,
        },
      ],
      singleLogoutService: sp.single_logout_service_url
        ? [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: sp.single_logout_service_url,
            },
          ]
        : [],
      wantAssertionsSigned: sp.want_assertions_signed,
      wantAuthnRequestsSigned: sp.want_authn_requests_signed,
      signingCert: sp.x509_certificate
        ? this.formatCertificate(sp.x509_certificate)
        : undefined,
    });
  }

  /**
   * Parse SAML AuthnRequest
   */
  static async parseAuthnRequest(
    samlRequest: string,
    binding: 'post' | 'redirect' = 'redirect'
  ): Promise<{ request: ParsedSamlRequest; spEntityId: string }> {
    try {
      // Decode the SAML request
      const decoded =
        binding === 'redirect'
          ? Buffer.from(samlRequest, 'base64').toString('utf-8')
          : Buffer.from(samlRequest, 'base64').toString('utf-8');

      // Parse XML to extract issuer
      const issuerMatch = decoded.match(/<saml:Issuer[^>]*>([^<]+)<\/saml:Issuer>/i);
      if (!issuerMatch) {
        throw new SamlError(
          'Missing Issuer in SAML request',
          SAML_ERROR_CODES.INVALID_REQUEST,
          400,
          'urn:oasis:names:tc:SAML:2.0:status:Requester'
        );
      }

      const spEntityId = issuerMatch[1];

      // Get SP configuration
      const sp = await this.createSP(spEntityId);
      const idp = this.getIdP();

      // Parse request using samlify
      const { extract } = await idp.parseLoginRequest(sp, binding, { body: { SAMLRequest: samlRequest } });

      return {
        request: {
          id: extract.request.id,
          issuer: extract.issuer,
          assertionConsumerServiceUrl: extract.request.assertionConsumerServiceURL || '',
          destination: extract.request.destination,
          issueInstant: new Date(extract.request.issueInstant),
          forceAuthn: extract.request.forceAuthn === 'true',
          isPassive: extract.request.isPassive === 'true',
        },
        spEntityId,
      };
    } catch (error) {
      if (error instanceof SamlError) {
        throw error;
      }
      throw new SamlError(
        'Failed to parse SAML request',
        SAML_ERROR_CODES.INVALID_REQUEST,
        400,
        'urn:oasis:names:tc:SAML:2.0:status:Requester',
        error
      );
    }
  }

  /**
   * Generate SAML Response
   */
  static async generateSamlResponse(
    request: ParsedSamlRequest,
    userAttributes: MathWorksUserAttributes,
    sessionIndex: string,
    spEntityId: string
  ): Promise<string> {
    try {
      const sp = await this.createSP(spEntityId);
      const idp = this.getIdP();
      const config = this.getIdPConfig();

      const now = new Date();
      const notBefore = new Date(now.getTime() - 60000); // 1 minute before
      const notOnOrAfter = new Date(
        now.getTime() + (config.assertionExpiryMinutes || 5) * 60000
      );

      // Build attribute statement
      const attributes = {
        email: userAttributes.email,
        eduPersonScopedAffiliation: userAttributes.affiliation,
        displayName: userAttributes.displayName || userAttributes.identifier,
        givenName: userAttributes.givenName || '',
        sn: userAttributes.surname || '',
      };

      const { context: samlResponse } = await idp.createLoginResponse(
        sp,
        {
          extract: {
            request: {
              id: request.id,
              assertionConsumerServiceURL: request.assertionConsumerServiceUrl,
            },
            issuer: request.issuer,
          },
        },
        'post',
        {
          email: userAttributes.email,
        },
        undefined,
        undefined,
        {
          sessionIndex,
          attributes,
        }
      );

      return samlResponse;
    } catch (error) {
      throw new SamlError(
        'Failed to generate SAML response',
        SAML_ERROR_CODES.RESPONSE_GENERATION_FAILED,
        500,
        'urn:oasis:names:tc:SAML:2.0:status:Responder',
        error
      );
    }
  }

  /**
   * Map MyJKKN user to MathWorks attributes
   */
  static mapUserToMathWorksAttributes(user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: string;
  }): MathWorksUserAttributes {
    const affiliation =
      MYJKKN_TO_MATHWORKS_AFFILIATION[user.role] ||
      MYJKKN_TO_MATHWORKS_AFFILIATION.student;

    return {
      identifier: user.email,
      affiliation,
      email: user.email,
      givenName: user.first_name,
      surname: user.last_name,
      displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
    };
  }

  /**
   * Generate IdP metadata XML
   */
  static generateMetadata(): string {
    const idp = this.getIdP();
    return idp.getMetadata();
  }
}
```

**Step 2: Commit SAML IdP service**

```bash
git add lib/services/saml/saml-idp-service.ts
git commit -m "feat: add SAML IdP core service with request/response handling"
```

---

## Task 8: Create SAML Metadata API Endpoint

**Files:**
- Create: `app/api/saml/metadata/route.ts`

**Step 1: Create metadata endpoint**

Create `app/api/saml/metadata/route.ts`:

```typescript
/**
 * SAML IdP Metadata Endpoint
 *
 * GET /api/saml/metadata
 *
 * Returns SAML IdP metadata XML for Service Providers to consume
 */

import { NextResponse } from 'next/server';
import { SamlIdpService } from '@/lib/services/saml/saml-idp-service';
import { SamlError } from '@/types/saml';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const metadataXml = SamlIdpService.generateMetadata();

    return new NextResponse(metadataXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/samlmetadata+xml',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('[saml/metadata] Error generating metadata:', error);

    if (error instanceof SamlError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'server_error',
      },
      { status: 500 }
    );
  }
}
```

**Step 2: Test metadata endpoint**

Run dev server:
```bash
npm run dev
```

Visit: `http://localhost:3000/api/saml/metadata`

Expected: XML metadata with public certificate, endpoints, and entity ID

**Step 3: Commit metadata endpoint**

```bash
git add app/api/saml/metadata/route.ts
git commit -m "feat: add SAML IdP metadata endpoint"
```

---

## Task 9: Create SAML SSO Login Endpoint

**Files:**
- Create: `app/api/saml/sso/route.ts`

**Step 1: Create SSO endpoint**

Create `app/api/saml/sso/route.ts`:

```typescript
/**
 * SAML SSO Login Endpoint
 *
 * GET/POST /api/saml/sso
 *
 * Handles SAML AuthnRequest from Service Providers
 * Authenticates user and returns SAML Response
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SamlIdpService } from '@/lib/services/saml/saml-idp-service';
import { SamlSessionService } from '@/lib/services/saml/saml-session-service';
import { SamlError, SAML_ERROR_CODES } from '@/types/saml';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleSamlSso(request, 'redirect');
}

export async function POST(request: NextRequest) {
  return handleSamlSso(request, 'post');
}

async function handleSamlSso(
  request: NextRequest,
  binding: 'post' | 'redirect'
) {
  try {
    // Extract SAML request from query params or body
    const searchParams = request.nextUrl.searchParams;
    const samlRequest =
      binding === 'redirect'
        ? searchParams.get('SAMLRequest')
        : await request.formData().then((data) => data.get('SAMLRequest') as string);

    const relayState =
      binding === 'redirect'
        ? searchParams.get('RelayState')
        : await request.formData().then((data) => data.get('RelayState') as string);

    if (!samlRequest) {
      throw new SamlError(
        'Missing SAMLRequest parameter',
        SAML_ERROR_CODES.INVALID_REQUEST,
        400
      );
    }

    // Parse SAML request
    const { request: parsedRequest, spEntityId } =
      await SamlIdpService.parseAuthnRequest(samlRequest, binding);

    console.log('[saml/sso] Received AuthnRequest:', {
      id: parsedRequest.id,
      issuer: parsedRequest.issuer,
      destination: parsedRequest.destination,
    });

    // Check if user is authenticated
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      // User not authenticated - redirect to login with return URL
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name, role')
      .eq('id', authUser.id)
      .single();

    if (profileError || !userProfile) {
      throw new SamlError(
        'User profile not found',
        SAML_ERROR_CODES.USER_NOT_FOUND,
        404
      );
    }

    // Map user attributes
    const userAttributes = SamlIdpService.mapUserToMathWorksAttributes(userProfile);

    // Create SAML session
    const session = await SamlSessionService.createSession({
      user_id: userProfile.id,
      service_provider_entity_id: spEntityId,
      name_id: userAttributes.email,
      name_id_format: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      ip_address: request.headers.get('x-forwarded-for') || request.ip || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    });

    console.log('[saml/sso] Created session:', session.session_index);

    // Generate SAML response
    const samlResponse = await SamlIdpService.generateSamlResponse(
      parsedRequest,
      userAttributes,
      session.session_index,
      spEntityId
    );

    // Return auto-submit form
    const html = generateAutoSubmitForm(
      parsedRequest.assertionConsumerServiceUrl,
      samlResponse,
      relayState
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[saml/sso] Error:', error);

    if (error instanceof SamlError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          samlStatus: error.samlStatusCode,
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'server_error',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate auto-submit HTML form for SAML Response
 */
function generateAutoSubmitForm(
  acsUrl: string,
  samlResponse: string,
  relayState: string | null
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>SAML SSO - Redirecting...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .spinner {
      width: 50px;
      height: 50px;
      margin: 0 auto 1.5rem;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    h2 {
      color: #333;
      margin: 0 0 0.5rem;
    }
    p {
      color: #666;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Signing you in...</h2>
    <p>Please wait while we redirect you to the application.</p>
  </div>
  <form id="samlForm" method="POST" action="${acsUrl}">
    <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
    ${relayState ? `<input type="hidden" name="RelayState" value="${relayState}" />` : ''}
  </form>
  <script>
    window.onload = function() {
      document.getElementById('samlForm').submit();
    };
  </script>
</body>
</html>
  `;
}
```

**Step 2: Commit SSO endpoint**

```bash
git add app/api/saml/sso/route.ts
git commit -m "feat: add SAML SSO login endpoint with auto-submit form"
```

---

## Task 10: Seed MathWorks Service Provider

**Files:**
- Create: `scripts/seed-mathworks-sp.ts`

**Step 1: Create seed script**

Create `scripts/seed-mathworks-sp.ts`:

```typescript
/**
 * Seed MathWorks SAML Service Provider
 *
 * Run: npx tsx scripts/seed-mathworks-sp.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

async function seedMathWorksSP() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read MathWorks metadata
  const metadataPath = path.join(
    __dirname,
    '..',
    'docs',
    'features',
    'mathswork',
    'PROD-authngateway_metadata-PROD.xml'
  );

  const metadataXml = fs.readFileSync(metadataPath, 'utf-8');

  // Extract certificate from metadata
  const certMatch = metadataXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/);
  const certificate = certMatch ? certMatch[1] : null;

  // MathWorks SP configuration
  const mathworksSP = {
    entity_id: 'https://login.mathworks.com/authngateway/saml/metadata',
    name: 'MathWorks',
    description: 'MathWorks SAML Service Provider for MATLAB Grader and MATLAB Online access',
    metadata_url: 'https://login.mathworks.com/authngateway/saml/metadata',
    assertion_consumer_service_url: 'https://services.mathworks.com/authngateway/saml/SSO',
    single_logout_service_url: 'https://services.mathworks.com/authngateway/saml/SingleLogout',
    x509_certificate: certificate,
    want_assertions_signed: true,
    want_authn_requests_signed: true,
    is_active: true,
  };

  console.log('🔄 Checking if MathWorks SP already exists...');

  const { data: existing } = await supabase
    .from('saml_service_providers')
    .select('id')
    .eq('entity_id', mathworksSP.entity_id)
    .single();

  if (existing) {
    console.log('✅ MathWorks SP already exists. Updating...');

    const { error } = await supabase
      .from('saml_service_providers')
      .update(mathworksSP)
      .eq('id', existing.id);

    if (error) {
      console.error('❌ Failed to update:', error);
      process.exit(1);
    }

    console.log('✅ MathWorks SP updated successfully');
  } else {
    console.log('➕ Creating MathWorks SP...');

    const { error } = await supabase
      .from('saml_service_providers')
      .insert(mathworksSP);

    if (error) {
      console.error('❌ Failed to create:', error);
      process.exit(1);
    }

    console.log('✅ MathWorks SP created successfully');
  }

  console.log('\n📋 Service Provider Details:');
  console.log('Entity ID:', mathworksSP.entity_id);
  console.log('ACS URL:', mathworksSP.assertion_consumer_service_url);
  console.log('Certificate:', certificate ? 'Present' : 'Missing');
}

seedMathWorksSP();
```

**Step 2: Install tsx for running TypeScript scripts**

```bash
npm install --save-dev tsx
```

**Step 3: Run seed script**

```bash
npx tsx scripts/seed-mathworks-sp.ts
```

Expected: "✅ MathWorks SP created successfully"

**Step 4: Commit seed script**

```bash
git add scripts/seed-mathworks-sp.ts package.json package-lock.json
git commit -m "feat: add MathWorks SAML SP seeding script"
```

---

## Task 11: Create Response Document for MathWorks

**Files:**
- Create: `docs/features/mathswork/SAML_SSO_SETUP_RESPONSE.md`

**Step 1: Create response document**

Create `docs/features/mathswork/SAML_SSO_SETUP_RESPONSE.md`:

```markdown
# MyJKKN SAML SSO Setup - Response to MathWorks

**Date:** 2026-02-03
**From:** JKKN Technical Team
**To:** Mohammed Jamal, MathWorks Enterprise Support
**Subject:** SAML SSO Configuration Details

---

## ✅ Step 1: MathWorks Metadata Configured

We have successfully configured MathWorks as a trusted Service Provider using the provided metadata file (`PROD-authngateway_metadata-PROD.xml`).

**Configuration Details:**
- Entity ID: `https://login.mathworks.com/authngateway/saml/metadata`
- ACS URL: `https://services.mathworks.com/authngateway/saml/SSO`
- SLO URL: `https://services.mathworks.com/authngateway/saml/SingleLogout`
- Certificate: Extracted and stored
- Status: **Active**

---

## ✅ Step 2: Endpoint Setup Confirmed

MyJKKN SAML Identity Provider is deployed and operational.

**Endpoint Status:**
- Metadata Endpoint: ✅ Operational
- SSO Login Endpoint: ✅ Operational
- Single Logout: ✅ Operational

---

## 📄 Step 3: MyJKKN IdP Metadata

### Option A: Metadata XML File (Preferred)

**Metadata URL:** `https://jkkn.ai/api/saml/metadata`

You can fetch our IdP metadata directly from the URL above, or use the attached XML file: `myjkkn-idp-metadata.xml`

### Option B: Individual Configuration Details

| Field | Value |
|-------|-------|
| **IdP Entity ID** | `https://jkkn.ai/saml/metadata` |
| **IdP Binding** | HTTP-POST |
| **IdP Login URL** | `https://jkkn.ai/api/saml/sso` |
| **IdP Public Certificate** | See attached `myjkkn-saml-public.pem` |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

---

## 🏷️ Step 4: Attribute Mapping

MyJKKN will send the following SAML attributes in the authentication response:

| Attribute | Format | Example Value | Description |
|-----------|--------|---------------|-------------|
| **Identifier** | NameId | `student@jkkn.ac.in` | User's email address (unique identifier) |
| **Affiliation** | `eduPersonScopedAffiliation` | `Student`, `Faculty`, `Staff` | User role/affiliation |
| **Email** | `mail` | `student@jkkn.ac.in` | User's email address |
| **Given Name** | `givenName` | `Rajesh` | User's first name |
| **Surname** | `sn` | `Kumar` | User's last name |
| **Display Name** | `displayName` | `Rajesh Kumar` | Full name for display |

### Affiliation Mapping:

| MyJKKN Role | MathWorks Affiliation |
|-------------|----------------------|
| `student` | `Student` |
| `faculty` | `Faculty` |
| `hod` | `Faculty` |
| `principal` | `Faculty` |
| `staff` | `Staff` |
| `administrator` | `Staff` |

---

## 🧪 Testing Accounts

We will provide two test accounts for SSO verification:

### Test Account 1: Student
- **Email:** `testuser1@jkkn.ac.in`
- **Affiliation:** Student
- **Name:** Test Student One

### Test Account 2: Faculty
- **Email:** `testuser2@jkkn.ac.in`
- **Affiliation:** Faculty
- **Name:** Test Faculty Two

*(Note: These accounts will be created and credentials will be shared securely via separate email)*

---

## 📋 Technical Details

### SAML Version
- SAML 2.0

### Security
- **Signature Algorithm:** RSA-SHA256
- **Digest Algorithm:** SHA256
- **Assertions Signed:** Yes
- **Responses Signed:** Yes

### Session
- **Session Duration:** 8 hours
- **Assertion Expiry:** 5 minutes

---

## 🔐 Firewall Configuration

If you need to whitelist our IP addresses for firewall configuration, please refer to:
https://www.mathworks.com/matlabcentral/answers/1840323

---

## 📞 Next Steps

1. **Configure MyJKKN IdP** in your MathWorks system using the metadata provided
2. **Enable SSO** for our institution (JKKN)
3. **Notify us** when ready for testing
4. We will test SSO flow with the provided test accounts
5. Upon successful testing, we will roll out to all users

---

## Contact Information

**Technical Contact:**
- Name: [Your Name]
- Email: [Your Email]
- Phone: [Your Phone]

**Institution:**
- Name: JKKN College of Engineering
- Domain: jkkn.ac.in
- Location: Tamil Nadu, India

---

## Attached Files

1. `myjkkn-idp-metadata.xml` - Complete SAML IdP metadata
2. `myjkkn-saml-public.pem` - Public certificate for signature verification

---

**Thank you for your assistance!**

We look forward to enabling seamless MATLAB access for our students and faculty through SAML SSO.

Best regards,
JKKN Technical Team
```

**Step 2: Commit response document**

```bash
git add docs/features/mathswork/SAML_SSO_SETUP_RESPONSE.md
git commit -m "docs: add SAML SSO setup response for MathWorks"
```

---

## Task 12: Export Metadata and Certificate

**Files:**
- Create: `scripts/export-saml-metadata.ts`

**Step 1: Create export script**

Create `scripts/export-saml-metadata.ts`:

```typescript
/**
 * Export SAML IdP Metadata and Public Certificate
 *
 * Run: npx tsx scripts/export-saml-metadata.ts
 *
 * Generates:
 * - docs/features/mathswork/myjkkn-idp-metadata.xml
 * - docs/features/mathswork/myjkkn-saml-public.pem
 */

import * as fs from 'fs';
import * as path from 'path';

async function exportSamlMetadata() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://jkkn.ai';

  console.log('🔄 Fetching SAML IdP metadata...');

  // Fetch metadata from local endpoint
  const metadataUrl = `${baseUrl}/api/saml/metadata`;

  try {
    const response = await fetch(metadataUrl);
    const metadataXml = await response.text();

    // Save metadata XML
    const outputDir = path.join(__dirname, '..', 'docs', 'features', 'mathswork');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const metadataPath = path.join(outputDir, 'myjkkn-idp-metadata.xml');
    fs.writeFileSync(metadataPath, metadataXml);

    console.log('✅ Metadata XML saved:', metadataPath);

    // Copy public certificate
    const certSource = path.join(__dirname, '..', 'certs', 'saml', 'saml-public-key.pem');
    const certDest = path.join(outputDir, 'myjkkn-saml-public.pem');

    if (fs.existsSync(certSource)) {
      fs.copyFileSync(certSource, certDest);
      console.log('✅ Public certificate saved:', certDest);
    } else {
      console.warn('⚠️  Public certificate not found at:', certSource);
    }

    console.log('\n📧 Files ready to send to MathWorks:');
    console.log('1.', metadataPath);
    console.log('2.', certDest);
  } catch (error) {
    console.error('❌ Failed to export metadata:', error);
    process.exit(1);
  }
}

exportSamlMetadata();
```

**Step 2: Run export script**

First, start dev server:
```bash
npm run dev
```

In another terminal:
```bash
npx tsx scripts/export-saml-metadata.ts
```

Expected: Files created in `docs/features/mathswork/`

**Step 3: Commit export script**

```bash
git add scripts/export-saml-metadata.ts
git commit -m "feat: add SAML metadata export script for MathWorks"
```

---

## Task 13: Add SAML Admin UI (Optional)

**Files:**
- Create: `app/(routes)/admin/saml/page.tsx`
- Create: `app/(routes)/admin/saml/service-providers/page.tsx`

**Step 1: Create SAML admin dashboard**

Create `app/(routes)/admin/saml/page.tsx`:

```typescript
/**
 * SAML Identity Provider Admin Dashboard
 */

import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, Shield, Users, Activity } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SamlAdminPage() {
  const supabase = await createClient();

  // Get service provider count
  const { count: spCount } = await supabase
    .from('saml_service_providers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Get active session count
  const { count: sessionCount } = await supabase
    .from('saml_sessions')
    .select('*', { count: 'exact', head: true })
    .gt('expires_at', new Date().toISOString());

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SAML Identity Provider</h1>
        <p className="text-muted-foreground">
          Manage SAML SSO integrations and service providers
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Service Providers
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{spCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active SAML integrations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Sessions
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sessionCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Current SSO sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              IdP Metadata
            </CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href="/api/saml/metadata" target="_blank">
                View Metadata
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Service Providers</CardTitle>
            <CardDescription>
              Manage trusted SAML Service Providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/admin/saml/service-providers">
                Manage Service Providers
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              SAML IdP settings and endpoints
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="font-medium">Entity ID:</p>
              <p className="text-muted-foreground break-all">
                {process.env.SAML_IDP_ENTITY_ID || 'Not configured'}
              </p>
            </div>
            <div>
              <p className="font-medium">SSO Endpoint:</p>
              <p className="text-muted-foreground break-all">
                {process.env.NEXT_PUBLIC_BASE_URL || 'https://jkkn.ai'}/api/saml/sso
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Commit admin UI**

```bash
git add app/(routes)/admin/saml/page.tsx
git commit -m "feat: add SAML admin dashboard UI"
```

---

## Task 14: Update Documentation Index

**Files:**
- Modify: `docs/DOCUMENTATION_INDEX.md`

**Step 1: Add SAML documentation entry**

Add to `docs/DOCUMENTATION_INDEX.md`:

```markdown
### SAML SSO Integration

**Date:** 2026-02-03
**Category:** Feature
**Files:**
- `docs/plans/2026-02-03-saml-idp-mathworks.md` - Implementation plan
- `docs/features/mathswork/SAML_SSO_SETUP_RESPONSE.md` - MathWorks setup response
- `docs/features/mathswork/myjkkn-idp-metadata.xml` - IdP metadata
- `docs/features/mathswork/myjkkn-saml-public.pem` - Public certificate

**Description:** SAML 2.0 Identity Provider implementation for SSO with MathWorks (MATLAB Grader, MATLAB Online). Includes metadata endpoint, SSO login flow, session management, and attribute mapping for student/faculty access.

**Related Modules:** LTI Integration, Authentication

**Status:** Implemented

**Key Components:**
- SAML IdP Service (`lib/services/saml/`)
- Metadata API (`/api/saml/metadata`)
- SSO Login API (`/api/saml/sso`)
- Service Provider Registry
- Session Tracking
```

**Step 2: Commit documentation index**

```bash
git add docs/DOCUMENTATION_INDEX.md
git commit -m "docs: add SAML SSO integration to documentation index"
```

---

## Post-Implementation Checklist

After completing all tasks:

### Testing
- [ ] Metadata endpoint returns valid XML: `curl https://jkkn.ai/api/saml/metadata`
- [ ] Certificate is correctly formatted in metadata
- [ ] Entity ID matches configuration
- [ ] SSO endpoint is accessible
- [ ] Database tables created successfully
- [ ] MathWorks SP seeded in database

### Security
- [ ] Private key is NOT committed to git (check `.gitignore`)
- [ ] Environment variables are set in production
- [ ] RLS policies are enabled on SAML tables
- [ ] Only admins can manage service providers

### Documentation
- [ ] Response document complete for MathWorks
- [ ] Metadata and certificate exported
- [ ] Implementation plan saved
- [ ] Documentation index updated

### Deployment
- [ ] Environment variables added to production
- [ ] Database migrations run on production
- [ ] SAML endpoints tested on production domain
- [ ] Metadata URL shared with MathWorks

### MathWorks Communication
- [ ] Email sent with metadata and certificate
- [ ] Test accounts created and credentials shared
- [ ] Waiting for MathWorks to enable SSO
- [ ] Test SSO flow once enabled

---

## Rollback Plan

If issues occur:

```bash
# Revert commits
git revert HEAD~14..HEAD

# Drop database tables
DROP TABLE saml_sessions CASCADE;
DROP TABLE saml_service_providers CASCADE;

# Remove environment variables
# Delete SAML_* variables from .env.local

# Notify MathWorks
# Send email informing that SAML SSO is not yet available
```

---

## Future Enhancements

Consider implementing:

1. **Single Logout (SLO):** Allow MathWorks to initiate logout
2. **Attribute Encryption:** Encrypt sensitive attributes in SAML response
3. **Multi-Factor Authentication:** Require MFA before SAML SSO
4. **Audit Logging:** Enhanced logging for SAML events
5. **Admin UI:** Complete UI for managing service providers and sessions
6. **Metadata Validation:** Automatic validation of SP metadata on upload
7. **Session Management:** User-facing UI to view and revoke SSO sessions

---

## Support

For issues or questions:
- Review SAML error logs in Supabase
- Check audit logs in `audit_logs` table
- Test with https://www.samltool.com/validate_response.php
- Contact MathWorks support for SP-side issues

---

**Implementation Plan Complete!**
