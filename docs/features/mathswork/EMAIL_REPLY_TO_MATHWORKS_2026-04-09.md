# Reply Email to MathWorks — Round 6 First-Login Redirect Fix

**Subject:** Re: SSO Testing Summary — First-Login Redirect Issue Identified and Fix In Progress
**To:** Mohammed Jamal (support@mathworks.com)
**CC:** ceo@jkkn.ac.in, director@jkkn.ac.in, ranjith@jkkn.ac.in
**From:** JKKN Technical Team
**Date:** 9 April 2026
**Priority:** High

---

Dear Mohammed,

Thank you very much for the detailed testing summary and the excellent troubleshooting guidance. Your description of the observed behaviour — first login landing on our internal dashboard, second login in the same session redirecting correctly to MathWorks — was extremely precise and allowed us to reproduce and locate the root cause on our side very quickly.

We want to confirm upfront: **the issue is on our IdP, not on the MathWorks configuration.** Your ACS URL, binding, and RelayState handling are all correct. The defect is in how our IdP preserves the pending SAML request across our own login flow.

---

## Root Cause

On our IdP, the SP-initiated SSO flow works as follows:

1. MathWorks redirects the user to `https://jkkn.ai/api/saml/sso` with the `SAMLRequest` and `RelayState` parameters.
2. If the user is **not yet authenticated**, our IdP redirects them to our login page, carrying the original SAML request URL in a `redirectedFrom` query parameter.
3. The user signs in via our Google OAuth provider.
4. After OAuth completes, our auth callback handler is **supposed** to read `redirectedFrom` and resume the SAML flow by redirecting back to `/api/saml/sso`, which would then generate and POST the `SAMLResponse` to the MathWorks ACS.

**What actually happens on first login:**

Because the user is bounced out to Google for OAuth, the browser loses our original `redirectedFrom` query parameter on the return trip. Our auth callback never sees it, and therefore routes the newly authenticated user to their role-based internal dashboard instead of resuming the SAML flow. The pending `SAMLRequest` and `RelayState` are effectively dropped at this point.

**Why the second login works:**

On the second attempt within the same browser session, the user is already authenticated (our session cookie is valid). MathWorks redirects to `/api/saml/sso`, our IdP sees the active session, **skips the login/OAuth detour entirely**, generates the `SAMLResponse` immediately, and auto-POSTs it to the MathWorks ACS with the correct `RelayState`. This is why the second login returns the user to the MATLAB Home page as expected.

In short: the SAML context is preserved correctly when the user is already logged in, but it is lost during the Google OAuth round-trip on the first login.

---

## Fix In Progress

We are implementing a server-side pending-request store so that the SAML request can survive the OAuth round-trip reliably. Specifically:

1. When an unauthenticated SAML request arrives, our IdP will persist the `SAMLRequest`, `RelayState`, and SP entity ID in a short-lived (5-minute TTL) server-side record keyed by an opaque ID.
2. Only that opaque ID will be carried through the login and OAuth flow.
3. Our auth callback will read the opaque ID, look up the stored SAML context, and resume the original `/api/saml/sso` flow, which will then generate and POST the `SAMLResponse` to the MathWorks ACS with the original `RelayState` intact.

This approach follows the standard SP-initiated SSO pattern recommended in the SAML 2.0 bindings specification and eliminates any dependency on URL query parameters surviving the OAuth redirect.

**We expect to deploy this fix to production within 24–48 hours** and will write to you again as soon as it is live for re-testing.

---

## Verification of Your Guidance

To confirm your troubleshooting checklist against our configuration:

| Your Check | Our Status |
|---|---|
| SP-initiated SSO enabled on the IdP | Enabled |
| MathWorks ACS URL and binding correct | `https://services.mathworks.com/authngateway/saml/SSO`, HTTP-POST — correct |
| RelayState preserved during initial login flow | **This is the defect** — RelayState is received and echoed correctly once the SAML endpoint is reached, but the request itself is dropped during the OAuth round-trip. The fix above addresses this. |
| IdP post-login redirect not overriding SAML response | Currently, our role-based post-login redirect is indeed overriding the SAML resume. The fix will make the SAML resume take precedence whenever a pending SAML request exists. |

Your guidance was spot-on and directly led us to the right area of the code. Thank you.

---

## Testing Plan After Deployment

Once the fix is deployed, we will run the following verification on our side before asking you to re-test:

1. Clear all cookies for `jkkn.ai` and start a completely fresh browser session.
2. Initiate SP-initiated SSO from MathWorks using the test accounts below.
3. Confirm that the **first** login attempt lands the user on the MATLAB Home page.
4. Confirm via SAML Tracer that the `RelayState` returned in the `SAMLResponse` matches the one MathWorks originally sent.
5. Repeat across Chrome, Firefox, Safari, and in private/incognito windows.
6. Repeat with a user who has never signed in to MyJKKN before (cold-start scenario).

**Test accounts:**
- boobalan.a@jkkn.ac.in
- ranjith@jkkn.ac.in

Once our internal verification passes, we will email you to coordinate a joint re-test.

---

## Summary of All Fixes to Date

| Round | Date | Issue | Status |
|-------|------|-------|--------|
| 1 | Feb 11 | Internal server error — request parsing bugs | Fixed |
| 1 | Feb 11 | Attribute name mismatch (`eduPersonScopedAffiliation` → `Affiliation`) | Fixed |
| 3 | Feb 19 | `unknown_service_provider` — database access control | Fixed |
| 4 | Feb 23 | `Failed to parse SAML request` — configuration and URL mismatch | Fixed |
| 5 | Feb 25 | `Failed to generate SAML response` — corrupted signing private key | Fixed |
| 6 | Apr 9 | First-login redirect drops SAML context across OAuth round-trip | **Fix in progress, deploying in 24–48h** |

---

We sincerely appreciate your patience and the high quality of your testing reports throughout this integration. Your clear separation of expected vs observed behaviour, together with the specific troubleshooting checklist, made this issue straightforward to locate.

We will write to you again as soon as the fix is deployed and verified on our side.

Best regards,

**JKKN Technical Team**
JKKN College of Engineering
IT Department
Website: https://jkkn.ai | Domain: jkkn.ac.in
Business Hours: Mon–Fri, 9:00 AM – 5:00 PM IST (UTC +5:30)

---

## Pre-Send Checklist

- [ ] Confirm fix approach (Option A minimal vs Option B pending-request table) with engineering lead
- [ ] Create tracking issue in Beads (`bd create "SAML first-login redirect fix" -t bug -p 0`)
- [ ] Fill in sender name and direct contact details
- [ ] Review CC list
- [ ] Send email
- [ ] After deployment, run internal verification plan above
- [ ] Follow up with MathWorks to coordinate joint re-test
