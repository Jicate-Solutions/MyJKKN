# SAML Integration Testing Guide

**Date:** 2026-02-05
**Module:** MathWorks SAML SSO Integration
**Version:** 1.0

---

## Overview

This guide provides comprehensive testing procedures for the SAML 2.0 Identity Provider (IdP) integration with MathWorks. It explains how to test SAML endpoints, troubleshoot common issues, and verify the integration before production deployment.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding SAML Flows](#understanding-saml-flows)
3. [Testing SAML Endpoints](#testing-saml-endpoints)
4. [SP-Initiated vs IdP-Initiated](#sp-initiated-vs-idp-initiated)
5. [Troubleshooting](#troubleshooting)
6. [Production Checklist](#production-checklist)

---

## Prerequisites

### 1. Valid SAML Certificates

Ensure you have generated proper X.509 certificates:

```bash
# Generate new certificates
node scripts/generate-saml-cert.js

# Verify certificate validity
openssl x509 -in certs/saml/certificate.pem -text -noout
```

### 2. Environment Configuration

Verify all SAML environment variables are set:

```bash
# Check .env and .env.local files
grep "^SAML_" .env
```

Required variables:
- `SAML_PRIVATE_KEY` - Base64-encoded private key
- `SAML_PUBLIC_CERTIFICATE` - Base64-encoded X.509 certificate
- `SAML_IDP_ENTITY_ID` - Your IdP Entity ID (https://jkkn.ai/api/saml/metadata)
- `SAML_RESPONSE_EXPIRY_MINUTES` - Response validity period (default: 5)
- `SAML_ALLOWED_SERVICE_PROVIDERS` - Comma-separated list of allowed SP Entity IDs

### 3. Service Provider Configuration

MathWorks (or any SP) must be configured in your database:

```sql
SELECT * FROM saml_service_providers
WHERE entity_id = 'https://login.mathworks.com/authngateway/saml/metadata';
```

---

## Understanding SAML Flows

### SP-Initiated Flow (Most Common)

This is the standard SAML authentication flow used by MathWorks:

```
┌─────────┐                    ┌──────────┐                    ┌─────────┐
│  User   │                    │ MathWorks│                    │ MyJKKN  │
│ Browser │                    │   (SP)   │                    │  (IdP)  │
└────┬────┘                    └────┬─────┘                    └────┬────┘
     │                              │                               │
     │ 1. Access MathWorks          │                               │
     ├─────────────────────────────>│                               │
     │                              │                               │
     │ 2. Redirect with SAMLRequest │                               │
     │<─────────────────────────────┤                               │
     │                              │                               │
     │ 3. GET /api/saml/sso?SAMLRequest=...                        │
     ├──────────────────────────────────────────────────────────────>│
     │                              │                               │
     │ 4. Login page (if not authenticated)                         │
     │<──────────────────────────────────────────────────────────────┤
     │                              │                               │
     │ 5. Enter credentials         │                               │
     ├──────────────────────────────────────────────────────────────>│
     │                              │                               │
     │ 6. Auto-submit form with SAMLResponse                        │
     │<──────────────────────────────────────────────────────────────┤
     │                              │                               │
     │ 7. POST SAMLResponse         │                               │
     ├─────────────────────────────>│                               │
     │                              │                               │
     │ 8. Access granted            │                               │
     │<─────────────────────────────┤                               │
     │                              │                               │
```

### IdP-Initiated Flow (Not Currently Supported)

This flow is initiated directly from the IdP (MyJKKN) without a SAMLRequest.

**Note:** Our current implementation requires SP-initiated flow. Direct access to `/api/saml/sso` without a SAMLRequest will return an error.

---

## Testing SAML Endpoints

### 1. Test Metadata Endpoint

The metadata endpoint provides your IdP configuration to Service Providers.

#### Testing Command:

```bash
# Test metadata endpoint
curl -i https://jkkn.ai/api/saml/metadata
```

#### Expected Response:

```xml
HTTP/1.1 200 OK
Content-Type: application/samlmetadata+xml
Cache-Control: public, max-age=3600

<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="https://jkkn.ai/api/saml/metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    ...
  </IDPSSODescriptor>
</EntityDescriptor>
```

#### Common Issues:

**Error: "SAML private key or certificate not configured"**
- **Cause:** Missing or invalid `SAML_PRIVATE_KEY` or `SAML_PUBLIC_CERTIFICATE` in .env
- **Fix:** Run `node scripts/generate-saml-cert.js` and update .env files

**Error: 404 Not Found**
- **Cause:** Wrong URL (using `/saml/metadata` instead of `/api/saml/metadata`)
- **Fix:** Use correct endpoint `/api/saml/metadata`

---

### 2. Test SSO Endpoint (Cannot Be Tested Directly)

**IMPORTANT:** The SSO endpoint `/api/saml/sso` **CANNOT** be tested directly in a browser because it requires a valid SAMLRequest from a Service Provider.

#### What Happens When You Try:

```bash
# This will fail as expected
curl https://jkkn.ai/api/saml/sso
```

#### Expected Response:

```json
{
  "error": "Missing SAMLRequest parameter",
  "statusCode": "urn:oasis:names:tc:SAML:2.0:status:Requester",
  "statusDetail": "invalid_request"
}
```

**This is CORRECT behavior!** The SSO endpoint requires:
1. A valid `SAMLRequest` parameter (from SP)
2. User authentication (MyJKKN login session)
3. Valid SP configuration in database

---

### 3. Test SSO with MathWorks (SP-Initiated)

To properly test the SSO flow, MathWorks must initiate the request:

#### Prerequisites:

1. **MathWorks Configuration**
   - MathWorks has configured MyJKKN IdP using our metadata
   - Institution domain (jkkn.ac.in) is registered
   - SSO is enabled for your institution

2. **Test User Accounts**
   - User has active MyJKKN account
   - User email ends with @jkkn.ac.in
   - User has appropriate role (student, faculty, staff)

#### Testing Steps:

1. **Access MathWorks Service**
   ```
   Go to: https://www.mathworks.com/products/matlab-online.html
   Click: "Sign In"
   Select: "Sign in with your organization's account"
   Enter: your-email@jkkn.ac.in
   ```

2. **Verify Redirect to MyJKKN**
   - You should be redirected to `https://jkkn.ai/api/saml/sso?SAMLRequest=...`
   - If not logged in, you'll see MyJKKN login page

3. **Login to MyJKKN**
   - Enter your MyJKKN credentials
   - Click "Sign In"

4. **Auto-Redirect to MathWorks**
   - You should see a "Signing you in..." loading screen
   - Browser will auto-submit a form with SAMLResponse
   - You'll be redirected back to MathWorks

5. **Verify Access**
   - You should now have access to MATLAB Online
   - Your name and email should be correctly displayed

---

## SP-Initiated vs IdP-Initiated

### SP-Initiated (Supported ✅)

**Flow:** User starts at MathWorks → Redirected to MyJKKN → Back to MathWorks

**Advantages:**
- Industry standard
- More secure (prevents SAML Response replay attacks)
- Provides context (SP knows what resource user was trying to access)

**When to Use:**
- All production deployments
- Standard SSO integration

### IdP-Initiated (Not Currently Supported ❌)

**Flow:** User starts at MyJKKN → Clicks "Access MathWorks" → Goes to MathWorks

**Why Not Supported:**
- Requires pre-configured ACS URL (no SAMLRequest to provide it)
- Security concerns (no InResponseTo field)
- MathWorks may not support IdP-initiated flow

**To Implement (Future):**
- Store default ACS URL for each SP
- Generate SAML Response without InResponseTo
- Add UI in MyJKKN for launching external applications

---

## Troubleshooting

### Error: "SAML private key or certificate not configured"

**Location:** `/api/saml/metadata`

**Causes:**
1. Missing environment variables
2. Invalid base64 encoding
3. Malformed certificate (not proper X.509)

**Debug Steps:**

```bash
# 1. Check if variables exist
echo $SAML_PRIVATE_KEY | wc -c
echo $SAML_PUBLIC_CERTIFICATE | wc -c

# 2. Decode and verify private key
echo $SAML_PRIVATE_KEY | base64 -d | openssl rsa -check -noout

# 3. Decode and verify certificate
echo $SAML_PUBLIC_CERTIFICATE | base64 -d | openssl x509 -text -noout
```

**Solution:**
```bash
# Regenerate certificates
node scripts/generate-saml-cert.js

# Update .env and .env.local with output
# Restart application
```

---

### Error: "User profile not found"

**Location:** `/api/saml/sso` (during authentication)

**Causes:**
1. User not in `user_profiles` table
2. User ID mismatch between auth and profile

**Debug Steps:**

```sql
-- Check if user profile exists
SELECT * FROM user_profiles
WHERE email = 'user@jkkn.ac.in';

-- Check auth user
SELECT * FROM auth.users
WHERE email = 'user@jkkn.ac.in';
```

**Solution:**
- Ensure user has completed registration
- Verify user profile was created
- Check RLS policies allow access

---

### Error: "Service Provider not found"

**Location:** `/api/saml/sso` (SAML validation)

**Causes:**
1. SP not registered in database
2. Entity ID mismatch
3. SP is inactive

**Debug Steps:**

```sql
-- Check SP configuration
SELECT * FROM saml_service_providers
WHERE entity_id LIKE '%mathworks%';

-- Verify SP is active
SELECT entity_id, is_active, name
FROM saml_service_providers;
```

**Solution:**
```sql
-- Register MathWorks SP (if missing)
INSERT INTO saml_service_providers (
  entity_id,
  name,
  assertion_consumer_service_url,
  is_active
) VALUES (
  'https://login.mathworks.com/authngateway/saml/metadata',
  'MathWorks',
  'https://services.mathworks.com/authngateway/saml/SSO',
  true
);
```

---

### Error: "Invalid signature" (from MathWorks)

**Location:** MathWorks validation (after receiving SAMLResponse)

**Causes:**
1. Certificate mismatch (MathWorks has old certificate)
2. Clock skew (time difference between servers)
3. Corrupted SAML Response

**Debug Steps:**

```bash
# 1. Verify certificate matches
diff docs/features/mathswork/myjkkn-saml-public.pem certs/saml/certificate.pem

# 2. Check server time
date

# 3. Check SAML response expiry
grep "SAML_RESPONSE_EXPIRY_MINUTES" .env
```

**Solution:**
- Re-send updated certificate to MathWorks
- Synchronize server clocks (NTP)
- Increase response expiry (cautiously)

---

### Error: "Assertion expired"

**Location:** MathWorks validation

**Causes:**
1. Network latency between redirect
2. Expiry time too short
3. Clock skew

**Solution:**

```bash
# Increase assertion expiry (in .env)
SAML_RESPONSE_EXPIRY_MINUTES=10  # Increase from 5 to 10
```

---

## Production Checklist

Before deploying SAML integration to production:

### 1. Certificate Management

- [ ] Valid X.509 certificates generated
- [ ] Private key secured (not in git)
- [ ] Public certificate shared with MathWorks
- [ ] Certificate expiry tracked (10 years from generation)

### 2. Environment Configuration

- [ ] All SAML env variables set in production
- [ ] SAML_IDP_ENTITY_ID matches production URL
- [ ] SAML_ALLOWED_SERVICE_PROVIDERS configured
- [ ] Response expiry time appropriate (5-10 minutes)

### 3. Database Configuration

- [ ] MathWorks SP registered and active
- [ ] SP certificate configured
- [ ] RLS policies tested
- [ ] Audit logging enabled

### 4. Testing

- [ ] Metadata endpoint accessible (https://jkkn.ai/api/saml/metadata)
- [ ] Test user can authenticate via MathWorks
- [ ] Attribute mapping verified (name, email, role)
- [ ] Session logout works correctly
- [ ] Error handling tested

### 5. Security

- [ ] HTTPS enabled (required for SAML)
- [ ] Private keys rotated from dev certificates
- [ ] Audit logs reviewed
- [ ] Rate limiting configured
- [ ] Session timeout appropriate

### 6. Monitoring

- [ ] SAML login events logged
- [ ] Error tracking configured
- [ ] Alerts for authentication failures
- [ ] Dashboard for SAML metrics

### 7. Documentation

- [ ] User guide for MathWorks SSO access
- [ ] Admin guide for troubleshooting
- [ ] Certificate renewal process documented
- [ ] Contact information for support

---

## Testing Tools

### SAML Tracer (Browser Extension)

Install SAML Tracer to debug SAML flows:

**Chrome/Firefox:** Search for "SAML Tracer" in extension store

**Usage:**
1. Open SAML Tracer
2. Initiate SSO flow
3. View captured SAMLRequest and SAMLResponse
4. Verify assertions, attributes, signatures

### Online SAML Validators

- **SAMLTool.com** - Decode and validate SAML messages
- **SAML Developer Tools** - Test SAML assertions

---

## Additional Resources

### Internal Documentation

- `/docs/features/mathswork/SAML_SSO_SETUP_RESPONSE.md` - MathWorks configuration
- `/lib/services/saml/` - SAML service implementations
- `/types/saml.ts` - TypeScript type definitions

### External References

- [SAML 2.0 Specification](https://docs.oasis-open.org/security/saml/v2.0/)
- [MathWorks SSO Documentation](https://www.mathworks.com/support/saml)
- [samlify Library Docs](https://github.com/tngan/samlify)

---

## Support

For SAML integration issues, contact:

**Technical Team:**
- Email: admin@jkkn.ai
- Create issue: [GitHub Issues](https://github.com/your-repo/issues)

**MathWorks Support:**
- Email: support@mathworks.com
- Reference Case: [Your case number]

---

**Last Updated:** 2026-02-05
**Maintained By:** JKKN Technical Team
