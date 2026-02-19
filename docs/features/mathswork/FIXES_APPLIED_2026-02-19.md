# SAML SSO Integration Fixes - Round 3

**Date:** 2026-02-19
**Status:** All Fixes Applied
**Triggered By:** MathWorks support email (Mohammed Jamal, 16 Feb 2026) — SAML error: `unknown_service_provider`

---

## Error Received from MathWorks

```json
{
  "error": "Unknown service provider: https://login.mathworks.com/authngateway/saml/metadata",
  "statusCode": "urn:oasis:names:tc:SAML:2.0:status:Requester",
  "statusDetail": "unknown_service_provider"
}
```

---

## Root Cause Analysis

### Bug 1: RLS Policy blocks SP lookup during unauthenticated SSO phase (CRITICAL)

**File:** `lib/services/saml/saml-service-provider-service.ts`

**Problem:**
The `saml_service_providers` table has RLS enabled with a SELECT policy that requires
`auth.uid()` to match a `super_admin` or `administrator` profile:

```sql
CREATE POLICY "Admin users can view service providers"
  ON saml_service_providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()                -- Returns NULL for unauthenticated requests
      AND profiles.role IN ('super_admin', 'administrator')
    )
  );
```

**SAML Architecture Conflict:**
SAML SSO operates in two phases:
1. **Phase 1 (unauthenticated):** MathWorks redirects the browser to our `/api/saml/sso`.
   At this point, no user session exists. Our code must look up the SP to validate the
   AuthnRequest — but `auth.uid()` is NULL, the EXISTS check fails silently, the query
   returns 0 rows, and our code throws `unknown_service_provider`.
2. **Phase 2 (authenticated):** After the user logs in, we generate and sign the SAML
   response. A user session exists at this point.

The MathWorks SP WAS correctly registered in the database with the right entity ID
(`https://login.mathworks.com/authngateway/saml/metadata`) — the data was there but
the RLS policy was blocking access to it.

**Fix:**
Changed `getServiceProviderByEntityId()` to use `createServiceRoleClient()` (bypasses RLS)
instead of `createClient()` (uses anon key + RLS). SP metadata is a system-level read
that must work before user authentication.

```typescript
// Before (broken for unauthenticated SSO phase):
const supabase = await createClient();

// After (correct — service role bypasses RLS):
const supabase = createServiceRoleClient();
```

---

### Bug 2: ACS URL falls back to empty string if AuthnRequest omits it (MODERATE)

**File:** `lib/services/saml/saml-idp-service.ts`

**Problem:**
SAML 2.0 §3.4.1.2 permits SPs to omit `AssertionConsumerServiceURL` from their
AuthnRequest, relying instead on the IdP's pre-registered ACS URL. Our code used:

```typescript
assertionConsumerServiceUrl: extract.request.assertionConsumerServiceURL || '',
```

If MathWorks omits the ACS URL from their request, the auto-submit form would have
`action=""` — posting the SAMLResponse back to `/api/saml/sso` instead of to
`https://services.mathworks.com/authngateway/saml/SSO`.

**Fix:**
Now falls back to the SP's registered ACS URL from the database:

```typescript
const acsUrl =
  extract.request.assertionConsumerServiceURL ||
  spConfig.assertion_consumer_service_url;  // From DB: https://services.mathworks.com/...
```

---

### Bug 3: Admin dashboard uses wrong column name (MINOR)

**File:** `app/(routes)/admin/saml/page.tsx`

**Problem:** `.eq('active', true)` — column is `is_active`, not `active`.

**Fix:** Changed to `.eq('is_active', true)`.

---

## Files Modified

1. `lib/services/saml/saml-service-provider-service.ts`
   - Import `createServiceRoleClient`
   - Changed `getServiceProviderByEntityId` to use `createServiceRoleClient()`

2. `lib/services/saml/saml-idp-service.ts`
   - Added `spConfig` fetch alongside `createSP` in `parseAuthnRequest`
   - Added ACS URL fallback from database SP config

3. `app/(routes)/admin/saml/page.tsx`
   - Fixed column name: `active` → `is_active`

---

## Database State (Verified)

The MathWorks SP is correctly registered in `saml_service_providers`:

| Field | Value |
|-------|-------|
| `entity_id` | `https://login.mathworks.com/authngateway/saml/metadata` |
| `assertion_consumer_service_url` | `https://services.mathworks.com/authngateway/saml/SSO` |
| `single_logout_service_url` | `https://services.mathworks.com/authngateway/saml/SingleLogout` |
| `is_active` | `true` |

No database changes needed — data was always correct; RLS was the blocker.

---

## Next Steps

- Deploy the code fixes to production
- Notify MathWorks (see reply email) to re-test with `boobalan.a@jkkn.ac.in`
- Ask MathWorks to use SAML Tracer to capture the successful SAMLResponse attributes

Completed By: Claude Sonnet 4.6
Date: 2026-02-19
