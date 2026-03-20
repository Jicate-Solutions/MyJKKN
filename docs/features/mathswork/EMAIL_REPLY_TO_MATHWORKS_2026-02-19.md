# Reply Email to MathWorks — Round 3 Fix

**Subject:** Re: SSO Testing Enabled — SAML Error Resolved (unknown_service_provider)
**To:** Mohammed Jamal (support@mathworks.com)
**CC:** ceo@jkkn.ac.in, director@jkkn.ac.in, ranjith@jkkn.ac.in
**From:** JKKN Technical Team
**Date:** 19 February 2026
**Priority:** High

---

Dear Mohammed,

Thank you for the continued follow-up and for sharing the detailed error information. We have identified and resolved the issue causing the `unknown_service_provider` error.

---

## Root Cause

The error you received:

```
statusDetail: unknown_service_provider
error: Unknown service provider: https://login.mathworks.com/authngateway/saml/metadata
```

...was being returned **by our own IdP**, not by MathWorks. We traced it to a database access control issue in our SAML implementation.

**The MathWorks Service Provider was correctly registered on our side** with the exact Entity ID `https://login.mathworks.com/authngateway/saml/metadata`. However, our database row-level security policy was written to restrict SP lookups to authenticated admin users only. When MathWorks redirects the user's browser to our SSO endpoint (`https://jkkn.ai/api/saml/sso`), the user has not yet logged in — so our system was unable to read the MathWorks SP configuration and incorrectly reported it as unknown.

In short: the data was correct; our code was blocking itself from reading it during the login phase.

---

## Fix Applied

We have updated our SAML service layer to use server-side credentials (bypassing the user-auth restriction) when looking up Service Provider configuration during the SSO handshake. This is the architecturally correct approach — the IdP must be able to validate incoming AuthnRequests before a user session exists.

The fix has been deployed to production.

---

## Request for Re-Testing

We kindly request you to re-test SSO with the following accounts:

- **boobalan.a@jkkn.ac.in**
- **ranjith@jkkn.ac.in**

**Testing steps:**
1. Go to [https://www.mathworks.com](https://www.mathworks.com) or MATLAB Online
2. Click **Sign In** → **Sign in with your organization's account**
3. Enter one of the test emails above (e.g., `boobalan.a@jkkn.ac.in`)
4. You should be redirected to `https://jkkn.ai/api/saml/sso`
5. Log in with their MyJKKN credentials
6. You should be automatically returned to MathWorks and granted access

If possible, please use the **SAML Tracer** browser extension (available for Chrome and Firefox) to capture the SAML exchange and share the attributes sent in our SAMLResponse. This will help us confirm that `Affiliation`, `email`, `givenName`, `sn`, and `displayName` are being received correctly.

---

## Summary of All Fixes to Date

| Round | Issue | Status |
|-------|-------|--------|
| Round 1 (Feb 11) | Internal server error — double formData() read, missing DEFLATE decompression, wrong binding interface | ✅ Fixed |
| Round 1 (Feb 11) | Wrong attribute name (`eduPersonScopedAffiliation` → `Affiliation`) | ✅ Fixed |
| Round 3 (Feb 19) | `unknown_service_provider` — RLS policy blocking SP lookup during unauthenticated SSO phase | ✅ Fixed |

---

We appreciate your patience and thorough testing. Please let us know if the SSO flow works correctly or if any further issues arise. We are available for a joint testing session if that would be helpful.

Best regards,

**JKKN Technical Team**
JKKN College of Engineering
IT Department
Website: https://jkkn.ai | Domain: jkkn.ac.in
Business Hours: Mon–Fri, 9:00 AM – 5:00 PM IST (UTC +5:30)

---

## Pre-Send Checklist

- [ ] Confirm code fixes are deployed to production (`https://jkkn.ai/api/saml/sso` responsive)
- [ ] Test SSO locally if possible before sending
- [ ] Fill in sender name and direct contact details
- [ ] Review CC list (management, IT team)
- [ ] Send
