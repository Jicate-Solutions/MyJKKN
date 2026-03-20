# SAML SSO Integration Fixes - Round 2

**Date:** 2026-02-11
**Status:** All Fixes Complete
**Triggered By:** MathWorks testing feedback (Mohammed Jamal, Enterprise Install and Licensing Support)

## Issues Reported

### Issue 1: IdP Login Error
- Test users (boobalan.a@jkkn.ac.in, ranjith@jkkn.ac.in) redirected to SSO endpoint receive `{"error":"Internal server error"}`
- Expected behavior: Login page or SAML response

### Issue 2: Attribute Schema Mismatch
- MathWorks expects `Affiliation=affiliation` for direct SSO
- Our implementation was using `eduPersonScopedAffiliation` (for federated SSO via eduGAIN)

## Root Cause Analysis

### Bug 1: Double formData() consumption (CRITICAL)
**File:** `app/api/saml/sso/route.ts` (lines 31-39)
**Problem:** `request.formData()` called twice for POST binding - body stream consumed on first read, second call throws TypeError
**Impact:** POST binding completely broken, generic "Internal server error" returned
**Fix:** Read formData once, extract both SAMLRequest and RelayState from single read

### Bug 2: Missing DEFLATE decompression (CRITICAL)
**File:** `lib/services/saml/saml-idp-service.ts` (lines 152-155)
**Problem:** SAML HTTP-Redirect binding specifies DEFLATE compression before base64 encoding. Code only did base64 decode without decompression, producing garbled binary
**Impact:** Redirect binding produces invalid XML, issuer extraction fails, non-SamlError exception thrown
**Fix:** Added `zlib.inflateRawSync()` with fallback for non-compressed requests

### Bug 3: Wrong samlify library interface (CRITICAL)
**File:** `lib/services/saml/saml-idp-service.ts` (line 174)
**Problem:** samlify expects `{ query: {...} }` for redirect binding but `{ body: {...} }` for post binding. Code used `{ body: {...} }` for both
**Impact:** samlify parseLoginRequest throws for redirect binding
**Fix:** Dynamic interface selection based on binding type

### Bug 4: Attribute name mismatch (MODERATE)
**File:** `lib/services/saml/saml-idp-service.ts` (line 224)
**Problem:** Used `eduPersonScopedAffiliation` but MathWorks expects `Affiliation` for direct SSO
**Impact:** MathWorks cannot read user affiliation/role from SAML response
**Fix:** Changed attribute name to `Affiliation`

Also improved: Issuer regex to handle `saml:`, `saml2:`, and no-prefix namespace variants

## Files Modified

1. `app/api/saml/sso/route.ts` - Fixed double formData() consumption
2. `lib/services/saml/saml-idp-service.ts` - Fixed DEFLATE, samlify interface, attribute name, issuer regex

## Testing

After these fixes, the SSO flow should work as follows:
1. User enters @jkkn.ac.in email on MathWorks sign-in
2. MathWorks redirects to `https://jkkn.ai/api/saml/sso?SAMLRequest=...`
3. SSO endpoint decompresses and parses the AuthnRequest
4. If user not logged in → redirect to MyJKKN login page
5. After authentication → generate signed SAML Response with correct attributes
6. Auto-submit form posts SAMLResponse to MathWorks ACS URL
7. User granted access to MathWorks products

## Next Steps
- Test users to re-test SSO flow
- MathWorks to verify SAML response attributes (especially `Affiliation`)
- Capture and share SAML response from testing browser (using SAML Tracer extension)

Completed By: Claude Opus 4.6
Date: 2026-02-11
