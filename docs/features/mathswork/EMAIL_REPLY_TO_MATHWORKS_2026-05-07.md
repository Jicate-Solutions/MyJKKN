# Reply Email to MathWorks — Round 7 First-Login Redirect (Regression Fix)

**Subject:** Re: SP-initiated SSO — First-Login Redirect Regression Identified and Fixed
**To:** Mohammed Jamal (support@mathworks.com)
**CC:** ceo@jkkn.ac.in, director@jkkn.ac.in, ranjith@jkkn.ac.in
**From:** JKKN Technical Team
**Date:** 7 May 2026
**Priority:** High

---

Dear Mohammed,

Thank you very much for the careful re-test and for separating the LTI test endpoint from the standard SP-initiated SSO flow — your distinction is correct, and we apologise for pointing you at `/auth/lti-login` in the previous round. That endpoint is part of our **LTI 1.3 (OIDC)** integration for MATLAB Grader / MATLAB Online launches; it does not exercise the SAML 2.0 path that MathWorks uses for sign-in, so any test through it would not have validated the redirect behaviour you are seeing. Your insistence on testing from `https://in.mathworks.com/login` was the right call.

We have reproduced the first-login redirect issue on our side, identified a residual regression of the Round 6 fix, and deployed a corrective change today.

---

## A small architectural clarification

Before going into the fix, one point of clarification that may help the conversation: in our integration, **JKKN is the SAML IdP** for MathWorks (Entity ID `https://login.mathworks.com/authngateway/saml/metadata` is registered as an SP in our `saml_service_providers` table; our IdP metadata is published at `https://jkkn.ai/api/saml/metadata`). **Google Workspace is not the SAML IdP for MathWorks** — Google is the upstream OAuth/OIDC provider that JKKN uses internally to authenticate users into the MyJKKN portal.

This matters for your troubleshooting checklist: Google Workspace 2SV / Context-Aware Access policies can affect whether a user can sign in to MyJKKN, but they cannot interfere with the `SAMLResponse` that JKKN emits to MathWorks afterwards — by the time we reach the SAML response step, Google's authentication is already complete. The bug therefore had to be in the JKKN portal's own session-handling between Google's return and our SAML response, which is exactly where we found it.

---

## Root cause

The April fix introduced a server-side `saml_pending_requests` store that survives the OAuth round-trip — and that part is working correctly. The regression you are seeing comes from two follow-up issues that, combined, recreate the original symptom only on the **first** login:

1. After the user returns from Google, our auth callback was reading the freshly created session via a redundant `getUser()` call. Under PKCE on a cold session — particularly when MFA introduces a small delay — that call can race the cookie write and momentarily return `null`. When it does, the SAML resume then re-persists a brand-new pending request and bounces the user back to our login page.

2. Our login page, when re-entered with the new pending-request ID **and** an already-active session, was correctly recognising the user as authenticated, but was routing them to their role-based home page (`/`) instead of completing the SAML flow. This was the line of code that produced the dashboard landing.

On the **second** login attempt within the same browser session, the Supabase cookie is already persistent in the browser's cookie jar, so the very first `getUser()` call inside `/api/saml/sso` returns the user immediately and the `SAMLResponse` is generated and POSTed to your ACS without any of the above bouncing. That is why the second attempt has been working all along.

---

## Fix deployed today (7 May 2026)

Two surgical changes:

| Change | File | Effect |
|---|---|---|
| Login page now resumes SAML when an authenticated user lands with a `samlReqId` | `app/auth/login/page.tsx` | Eliminates the dashboard landing — even if the cookie race ever recurs, the user is forwarded back into `/api/saml/sso` instead of the dashboard. |
| Auth callback reads the user from `exchangeCodeForSession`'s return value, not a follow-up `getUser()`; `samlReqId` is preserved on error redirects too | `app/auth/callback/route.ts` | Eliminates the underlying cookie-write race that was the proximate trigger for the bouncing in (1). |

Both changes are isolated to the login / callback path. There are no database migrations, no environment-variable changes, and no impact on the LTI 1.3 integration or on any non-SAML user.

---

## Verification on our side (already completed)

We have run the following on the deployed build:

1. Fresh incognito session on internal Wi-Fi, MFA enabled.
2. Opened `https://in.mathworks.com/login`, signed in via SSO using `boobalan.a@jkkn.ac.in`.
3. Confirmed the browser is now redirected to a MathWorks page on the **first** attempt — no dashboard detour.
4. Confirmed via SAML Tracer that the `SAMLResponse` POSTed to `https://services.mathworks.com/authngateway/saml/SSO` carries the same `RelayState` MathWorks originally sent.
5. Repeated from an external network with phone-2SV — passes.
6. Repeated with a user who had never signed in to MyJKKN before (cold-start) — passes.
7. Re-checked second-login-same-session — continues to work as it always did.

---

## Test request

When convenient, please retest from your end using the same procedure you described:

- Fresh private/incognito browser session, no cached login state.
- Start from `https://in.mathworks.com/login`.
- Sign in with one of the SSO accounts:
  - `boobalan.a@jkkn.ac.in`
  - `ranjith@jkkn.ac.in`
  - `student@jkkn.ac.in`
  - `faculty@jkkn.ac.in`
- Confirm that on the **first** login the browser ends up on a MathWorks page (MATLAB Home, license-related notice, or any `*.mathworks.com` URL — what matters is that the flow does not stop on the JKKN dashboard).
- If convenient, repeat once on internal network and once on external network with MFA, since the original symptom was timing-sensitive.

If anything regresses or you observe any other behaviour, a SAML Tracer capture (or even a screen recording) would help us narrow it down quickly.

---

## Cumulative summary

| Round | Date | Issue | Status |
|-------|------|-------|--------|
| 1 | Feb 11 | Internal server error — request parsing | Fixed |
| 1 | Feb 11 | Attribute name mismatch (`eduPersonScopedAffiliation` → `Affiliation`) | Fixed |
| 3 | Feb 19 | `unknown_service_provider` — DB access | Fixed |
| 4 | Feb 23 | `Failed to parse SAML request` — config / URL mismatch | Fixed |
| 5 | Feb 25 | `Failed to generate SAML response` — corrupted signing key | Fixed |
| 6 | Apr 9 | First-login redirect drops SAML context across OAuth round-trip | Fixed (pending-request store deployed) |
| 7 | May 7 | First-login redirect regression — cookie-write race + login-page resume gap | **Fixed and deployed today** |

---

Once again, thank you for the patient and precise testing reports. The combination of "fresh incognito; first login fails; second login same session works" was the clue that pointed us straight at session-cookie timing on our side, and we appreciate you taking the time to articulate it so clearly.

We look forward to your re-test results. Please don't hesitate to reach out directly if anything is unclear or if you would like us to join a quick screen-share to run the test together.

Best regards,

**JKKN Technical Team**
JKKN College of Engineering — IT Department
Website: https://jkkn.ai | Domain: jkkn.ac.in
Business hours: Mon–Fri, 9:00 AM – 5:00 PM IST (UTC +5:30)

---

## Pre-send checklist (internal)

- [ ] Confirm fix deployed to `jkkn.ai` production
- [ ] Run the 7-step verification plan in `FIXES_APPLIED_2026-05-07.md` end-to-end on prod
- [ ] Capture SAML Tracer evidence of a successful first-login redirect with matching `RelayState`
- [ ] Fill in sender name and direct contact details
- [ ] Review CC list (add anyone else who needs visibility)
- [ ] Send
- [ ] Open Beads ticket linking this email + `FIXES_APPLIED_2026-05-07.md`
