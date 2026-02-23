# SAML SSO Integration Fixes – Round 4

**Date:** 2026-02-23
**Status:** Applied
**Triggered By:** MathWorks reported new error after Round 3 fixes: `Failed to parse SAML request`

---

## Error Received from MathWorks

```json
{
  "error": "Failed to parse SAML request",
  "statusCode": "urn:oasis:names:tc:SAML:2.0:status:Requester",
  "statusDetail": "invalid_request"
}
```

HTTP 500 at `POST https://www.jkkn.ai/api/saml/sso`

---

## Root Cause Analysis

The Round 3 fixes resolved `unknown_service_provider` (RLS blocking the SP lookup).
With that unblocked, the flow now reaches `samlify.parseLoginRequest()` — but three
bugs caused it to throw a JavaScript Error (not a SamlError), which was being silently
swallowed into the generic "Failed to parse SAML request" response.

---

### Bug 1 — `wantAuthnRequestsSigned` missing from IdP config (CRITICAL)

**File:** `lib/services/saml/saml-idp-service.ts` — `getIdP()`

**Problem:**
`samlify.IdentityProvider()` was not passed `wantAuthnRequestsSigned: false`. Our IdP
metadata XML correctly says `WantAuthnRequestsSigned="false"` (samlify generates this),
but that is the **metadata output**, not the **runtime configuration**. Without the
explicit flag in code, samlify's internal behaviour when encountering a signed
AuthnRequest was to attempt validation. Since the SP `signingCert` was absent (Bug 2),
this threw a samlify-internal error.

**Fix:**
Added `wantAuthnRequestsSigned: false` to the `IdentityProvider()` configuration.

---

### Bug 2 — MathWorks signing certificate not stored in DB (CRITICAL)

**File:** `supabase/migrations/20260223000001_update_mathworks_saml_sp_certificate.sql`

**Problem:**
When the MathWorks SP was registered (Round 3 fix), only `entity_id`, `acs_url`,
`slo_url`, and `is_active` were stored. The `x509_certificate` field was never
populated from their SP metadata. `createSP()` therefore passed `signingCert: undefined`
to samlify. Additionally, `want_authn_requests_signed` was at its default (likely
reflecting `AuthnRequestsSigned="true"` from their metadata), causing samlify to
attempt to validate the signature without a certificate.

**Fix:**
- DB migration stores the MathWorks signing certificate (from `PROD-authngateway_metadata-PROD.xml`)
- DB migration sets `want_authn_requests_signed = false`
- Code change: `createSP()` now hardcodes `authnRequestsSigned: false` (overrides DB value)
  since our IdP policy is to not validate SP signatures regardless.

---

### Bug 3 — www.jkkn.ai vs jkkn.ai URL mismatch in Destination validation (HIGH)

**File:** `lib/services/saml/saml-idp-service.ts` — `getIdP()`

**Problem:**
The HTTP request in the browser devtools showed `https://www.jkkn.ai/api/saml/sso`.
Our IdP metadata was generated with `https://jkkn.ai/api/saml/sso` (no www).
samlify validates the `Destination` attribute in the incoming AuthnRequest XML against
the IdP's configured SSO service URL. If MathWorks configured their SP to hit the
`www.` subdomain, their AuthnRequest would have `Destination="https://www.jkkn.ai/api/saml/sso"`
but our IdP was expecting `https://jkkn.ai/api/saml/sso` — this mismatch causes
samlify to reject the request, again swallowed as the generic error.

**Fix:**
`getIdP()` now registers **both** the canonical and www-variant SSO endpoints in the
`singleSignOnService` array. samlify checks the `Destination` against any registered
SSO location, so both URL forms are now valid. A `console.warn` is emitted when a
mismatch is detected so the exact production URL can be confirmed.

---

### Bug 4 — Catch block swallowed the real samlify error (DIAGNOSTIC)

**File:** `lib/services/saml/saml-idp-service.ts` — `parseAuthnRequest()` catch block

**Problem:**
Any non-SamlError thrown by samlify's `parseLoginRequest` was logged only with
`console.error('[saml-idp] Failed to parse SAML request:', error)` — but the actual
error *object* was not being serialised. This made all three bugs above look identical
in production logs.

**Fix:**
The catch block now logs both `error.message` and `error.stack`, making the actual
samlify error visible in Vercel function logs.

---

## Files Modified

1. `lib/services/saml/saml-idp-service.ts`
   - `getIdP()`: Added `wantAuthnRequestsSigned: false`; added www/non-www SSO URL variants; added Destination diagnostic warning
   - `createSP()`: Hardcoded `authnRequestsSigned: false`
   - `parseAuthnRequest()` catch: Improved error serialisation

2. `supabase/migrations/20260223000001_update_mathworks_saml_sp_certificate.sql`
   - Updates MathWorks SP record: stores `x509_certificate`, sets `want_authn_requests_signed = false`

---

## Deploy Checklist

- [ ] Run the DB migration: `supabase db push` or execute in Supabase SQL editor
- [ ] Deploy updated code to Vercel (triggers fresh serverless instance — clears static IdP singleton)
- [ ] Ask MathWorks to retry login at https://in.mathworks.com/login
- [ ] Check Vercel function logs for `[saml-idp]` entries:
  - If `Destination URL mismatch` warning appears → confirms Bug 3 was active; also check `NEXT_PUBLIC_BASE_URL` in Vercel env matches what MathWorks is hitting
  - If `parseLoginRequest threw` still appears → check the new detailed error message for the specific samlify rejection reason
- [ ] If login succeeds, ask MathWorks to share SAML Tracer output to verify attributes

---

## Environment Variable Check (IMPORTANT)

Verify in Vercel dashboard that:
```
NEXT_PUBLIC_BASE_URL=https://jkkn.ai   # OR https://www.jkkn.ai — must match what MathWorks is hitting
```

If the value differs from what was used to generate the IdP metadata shared with MathWorks,
regenerate the metadata from `/api/saml/metadata` and re-share it with MathWorks so they
can update their SP configuration.

---

Completed By: Claude Sonnet 4.6
Date: 2026-02-23
