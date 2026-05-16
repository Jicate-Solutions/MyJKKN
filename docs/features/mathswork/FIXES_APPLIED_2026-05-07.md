# MathWorks SAML SSO — Round 7 Fix Record (2026-05-07)

## Problem report

MathWorks (Mohammed Jamal) reported on 2026-05-07 that the first-login redirect bug is still observable after the April 9 deployment:

- SP-initiated SSO from `https://in.mathworks.com/login` succeeds at the IdP
- **First login** in a fresh incognito session: user lands on the JKKN dashboard, never returns to MathWorks
- **Second login** in the same browser session: redirects correctly to the MATLAB Home page

This is the same symptom as Round 6, partially regressed.

## Root cause (multi-layered)

The April 2026 fix correctly introduced `saml_pending_requests` (Option B) and a `samlReqId` opaque token threaded through the OAuth round-trip. However, three residual issues, when combined, reproduce the exact symptom:

### Bug 1 — `/auth/login` page is `samlReqId`-blind for authenticated users

`app/auth/login/page.tsx`, `useEffect` lines 98–171.

When the page is loaded with `?samlReqId=XYZ` AND a Supabase session cookie is already present, the auth-check effect fetches the user's role and routes via `router.push(destination)` to `/` or `/driver`, **never inspecting `samlReqId`**. The SAML resume context is silently discarded at this point.

### Bug 2 — `/auth/callback` calls `getUser()` after `exchangeCodeForSession`

`app/auth/callback/route.ts` lines 75–85 (pre-fix).

This is the documented anti-pattern in `feedback_use_sign_in_return_not_getuser.md`: a follow-up `getUser()` races the cookie write under PKCE and `detectSessionInUrl`, returning `null` on first SAML SSO and on external networks under MFA latency. The session token is already present in the exchange's return value.

### Bug 3 — `/api/saml/sso` deletes the pending request before the auth check

`app/api/saml/sso/route.ts` line 86.

On the resume path the row is deleted immediately after lookup, then `getUser()` runs at line 122. If `getUser()` races (Bug 2 cascade), the resume re-creates a NEW pending request with a new ID and redirects to `/auth/login?samlReqId=NEW_UUID` — at which point Bug 1 strands the user on the dashboard.

### Failure chain on first login

```
MathWorks → AuthnRequest → /api/saml/sso (no session)
   → persist as XYZ → 302 /auth/login?samlReqId=XYZ
User signs in via Google
   → /auth/callback?code=…&samlReqId=XYZ
   → exchangeCodeForSession sets Set-Cookie
   → 302 /api/saml/sso?samlReqId=XYZ
/api/saml/sso?samlReqId=XYZ
   → load pending XYZ → DELETE XYZ
   → getUser() RACES → null  (Bug 2 timing)
   → re-persist as NEW_UUID → 302 /auth/login?samlReqId=NEW_UUID
/auth/login?samlReqId=NEW_UUID
   → useEffect getUser() succeeds (cookie now in jar)
   → IGNORES samlReqId  (Bug 1)
   → router.push('/')
✗ User lands on JKKN dashboard. SAMLResponse never emitted.
```

### Why the second login worked

On the second SAML SSO from MathWorks within the same browser session, the Supabase session cookie is already in the browser's persistent cookie jar from the failed attempt. `/api/saml/sso` finds the user on its very first `getUser()` call, generates the SAMLResponse, and POSTs the auto-submit form to MathWorks ACS with the original `RelayState`.

## Fixes applied

### Fix A — `app/auth/login/page.tsx`

Inserted at the top of the `if (!error && data.user)` branch in the auth-check `useEffect` (right after `console.log('[Login Page] User authenticated')`):

```ts
const samlReqIdResume = params.get('samlReqId');
if (samlReqIdResume) {
  console.log(
    '[Login Page] 🔁 Resuming SAML SSO for already-authenticated user:',
    samlReqIdResume
  );
  window.location.replace(
    `/api/saml/sso?samlReqId=${encodeURIComponent(samlReqIdResume)}`
  );
  return;
}
```

`window.location.replace` is used (not `router.push`) because `/api/saml/sso` returns an HTML auto-submit form (not a Next.js page) and must be reached via a full browser navigation.

This single change is sufficient to eliminate the user-visible symptom even if Bug 2's race recurs, because the resume redirect from `/api/saml/sso` now correctly hands the user back into the SAML flow instead of the dashboard.

### Fix B — `app/auth/callback/route.ts`

1. Read the `User` from `exchangeCodeForSession()`'s return value instead of a follow-up `getUser()`:

```ts
const { data: exchangeData, error: exchangeError } =
  await supabase.auth.exchangeCodeForSession(code);
// …
const user = exchangeData?.user ?? null;
```

2. Preserve `samlReqId` in error redirects via a `loginUrlWithSamlContext(errorCode)` helper, so a transient code-exchange failure no longer strands the SP-initiated SAML flow.

This eliminates the cookie-write race that was the proximate trigger for Bug 3's re-persist loop.

## Files changed

| File | Lines | Change |
|---|---|---|
| `app/auth/login/page.tsx` | +18 in `useEffect` | Honor `samlReqId` for already-authenticated users |
| `app/auth/callback/route.ts` | +13 / -10 | Use exchange return value; preserve `samlReqId` on error |

No schema migrations. No environment variable changes. No new packages.

## Verification plan (internal, before notifying MathWorks)

1. Clear all `jkkn.ai` cookies + close all browser windows (or use a fresh incognito profile).
2. Open `https://in.mathworks.com/login`.
3. Click the SSO option and enter `boobalan.a@jkkn.ac.in`.
4. Complete Google sign-in including 2SV.
5. **Expected:** browser lands on a MATLAB page (Home, license-error, or anything `*.mathworks.com`). Capture URL.
6. Open SAML Tracer; confirm the SAMLResponse posted to `https://services.mathworks.com/authngateway/saml/SSO` carries the same `RelayState` MathWorks originally sent.
7. Repeat from internal Wi-Fi, mobile hotspot, and external network (MFA paths differ).
8. Repeat with a user who has never signed in to MyJKKN before (cold-start).
9. Repeat in Chrome, Firefox, Safari, Edge.
10. Re-test the second-login-same-session path — must continue to work.

## Defense-in-depth follow-ups (deferred, not blocking)

- Move the `saml_pending_requests` deletion in `/api/saml/sso` to AFTER `generateSamlResponse` succeeds (use `consumed_at = NOW()` UPDATE instead of DELETE on the resume lookup), so a single race doesn't burn the row.
- Add a server-side telemetry log every time `/auth/login` resumes a `samlReqId` for an authenticated user — gives us a metric to monitor for any future regression.
- Add a Cypress / Playwright E2E that exercises the cold-start SP-initiated SSO loop end-to-end using a stub SP.
