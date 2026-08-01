# MathWorks SAML SSO — Round 8 Fix Record (2026-08-01)

## Context

No new MathWorks report triggered this round. The last inbound message is Mohammed
Jamal's 5 May follow-up chasing the Round 7 test; the Round 7 fix shipped on 7 May
(`30ddbfea3`). This round is a re-audit of the SAML path prompted by re-reading that
thread, plus the hardening deferred at the end of
[FIXES_APPLIED_2026-05-07.md](FIXES_APPLIED_2026-05-07.md).

**Open comms question:** it is not established whether
[EMAIL_REPLY_TO_MATHWORKS_2026-05-07.md](EMAIL_REPLY_TO_MATHWORKS_2026-05-07.md) was
ever actually sent. Three months of silence on a thread that had been active weekly
suggests it may not have been. Confirm before any further engineering.

## Re-audit findings

The Round 7 fix is intact in `main` — all four hops of the `samlReqId` carry
(persist → thread through OAuth → resume in callback → resume on login page) are
present and correct. One layer the earlier rounds never audited, `proxy.ts`, is also
clean: `/api/saml/sso` short-circuits at the `path.startsWith('/api')` check, so
middleware never bounces an AuthnRequest to `/auth/login`.

Five separate defects were found, none of which are the original redirect bug.

### 1 — Failures never returned to the SP

Every error path in `/api/saml/sso` returned a JSON 500 served from jkkn.ai. This
directly contradicts MathWorks' stated acceptance criterion ("the flow continues back
to MathWorks... even if an error is shown") and SAML 2.0 Core §3.2.2, which requires
the IdP to report protocol and authentication failures to the requesting SP.

Consequence: *any* residual hiccup — an expired resume, a missing profile — reproduces
the exact "stuck on the JKKN dashboard" symptom the last three rounds were spent
fixing, even though the original cause is gone.

### 2 — Deactivated accounts could still obtain an assertion

The SAML resume short-circuit in `app/auth/callback/route.ts` returns before both the
invite-only gate and the `is_active === false` sign-out — deliberately, so role-based
routing is skipped. That left `/api/saml/sso` as the only remaining gate on the SAML
path, and it selected only `id, email, full_name, role`. A disabled MyJKKN account
therefore still received a signed assertion and could sign in to MATLAB.

### 3 — ACS URL was never validated against the registered SP

`parseAuthnRequest` used `extract.request.assertionConsumerServiceURL` verbatim,
falling back to the registered value only when the request omitted it. Because
`wantAuthnRequestsSigned` is `false`, nothing authenticates the AuthnRequest, so every
field in it is untrusted input. An attacker could craft a request naming MathWorks as
`Issuer` but their own `AssertionConsumerServiceURL`, lure a signed-in JKKN user to it,
and receive a valid signed assertion for that user's identity.

### 4 — Reflected XSS in the auto-submit form

`generateAutoSubmitForm` interpolated `acsUrl` and `relayState` into HTML attributes
unescaped. `RelayState` is copied verbatim from the SP's query string, so a `"` broke
out of the attribute and injected script into a page served from jkkn.ai.

### 5 — Pending request burned before the auth check

The deferred item from Round 7. The row was `DELETE`d immediately after lookup and
before `getUser()`, so a race burned it, and the audit trail was destroyed on every
successful login.

### 6 — `givenName` was the honorific

Titles are stored inline in `profiles.full_name` ("Mr. Ranjith K"), and the name split
took everything before the first space as the given name. MathWorks received
`givenName="Mr."` — and provisions MATLAB accounts under it. This affects **2 of the 4
SSO test accounts** and an unknown number of real users.

## Fixes applied

| # | File | Change |
|---|---|---|
| 1 | `lib/services/saml/saml-idp-service.ts` | New `generateErrorResponse()` — signed SAML `<Response>`, failure Status, no Assertion. Plus `escapeXml()`, `stripCertificate()`, `TOP_LEVEL_STATUS_CODES`. |
| 1 | `app/api/saml/sso/route.ts` | Hoisted request state out of the `try`; `catch` now POSTs a signed failure Response to the SP ACS. JSON 500 survives only where no SP can be identified. |
| 2 | `app/api/saml/sso/route.ts` | Select `is_active`; reject with `AuthnFailed` / `user_inactive`. |
| 3 | `lib/services/saml/saml-idp-service.ts` | Requested ACS URL must match the registered one (`isSameAcsUrl`); always emit the registered value. |
| 4 | `app/api/saml/sso/route.ts` | `escapeHtmlAttribute()` applied to `acsUrl`, `samlResponse`, `relayState`. |
| 5 | `app/api/saml/sso/route.ts` | Atomic single-use claim: `UPDATE … SET consumed_at WHERE id = ? AND consumed_at IS NULL … RETURNING`, replacing SELECT-then-DELETE. |
| 6 | `app/api/saml/sso/route.ts` | Leading honorific dropped from the `full_name` split (unless it is the only token). |

No schema migrations (`consumed_at` already existed, unused). No environment-variable
changes. No new packages. No impact on the LTI 1.3 integration.

### Design note on #1 vs #3

The ACS validation in #3 throws inside `parseAuthnRequest`, which runs *before* the
route records an ACS URL for #1. A request with a mismatched ACS therefore falls
through to the JSON 500 — a failure Response is never POSTed to an unverified
endpoint. This ordering is load-bearing; preserve it.

For the same reason `generateErrorResponse` truncates `StatusMessage` to 200 chars and
non-`SamlError` throws are collapsed to a generic message: the destination is only as
trustworthy as the SP registration behind it.

## Verification

Ran against a throwaway self-signed keypair and the live database (read-only):

- **Error Response, 30/30** — XML well-formed; root is `Response`; no Assertion; correct
  top-level code with `AuthnFailed` correctly nested (top-level must be one of
  Success/Requester/Responder/VersionMismatch per §3.2.2.2); `StatusMessage`
  XML-escaped; `InResponseTo` echoed; `Destination` set; ID a valid NCName; **enveloped
  message signature verifies**; `<ds:Signature>` positioned after `<saml:Issuer>`.
- **ACS comparison, 13/13** — exact, trailing-slash, host-case and scheme-case matches
  accepted; path-case, different-host, suffix-host (`…mathworks.com.evil.example`),
  userinfo (`…mathworks.com@evil.example`), http-downgrade and extra-query rejected;
  unparseable input falls back to exact compare (fail-closed).
- **Name split, 22/22** — honorific dropped for `Mr./Dr./Prof.` with and without the
  dot; `"Mr."` alone preserved rather than blanked; `"Marshall"` not mistaken for a
  title; whitespace collapsed; empty input safe.
- `tsc --noEmit` and `eslint` clean on both files.

A gotcha worth recording: `samlify`'s `getKeyInfo()` needs the **bare base64 DER body**
for `signingCert`, while the file's existing `formatCertificate()` *adds* PEM headers.
Passing full PEM throws `Unparsed DER bytes remain after ASN.1 parsing`. Hence the
separate `stripCertificate()`. This only affects direct `constructSAMLSignature` calls;
`generateSamlResponse` goes through samlify's `IdentityProvider`, which normalises the
cert itself.

## Test-account readiness

New script: `scripts/diagnose-mathworks-sso-accounts.mjs` (read-only).

```bash
node scripts/diagnose-mathworks-sso-accounts.mjs
```

It checks `auth.users` and `profiles` **both by email and by auth id**, because
`/api/saml/sso` resolves the profile with `.eq('id', authUser.id)` — a row under a
different id makes the email look registered while the SAML lookup finds nothing.

Current state: **0 blockers.** `student@`, `faculty@`, `boobalan.a@` and
`viswanathan.s@` (which replaces `ranjith@` as the tester) all have matching auth and
profile rows, non-null emails, `is_active` true, and sensible role→Affiliation
mappings. The MathWorks SP is registered and active.

Not checkable from the database: whether each address is a real Google Workspace
mailbox with a working 2SV method. Verify in Google Admin — Google is the upstream
OIDC provider, so a 2SV-locked mailbox fails before SAML is reached and looks
identical to an IdP bug from MathWorks' side.

## Still open

- **Not committed and not deployed.** Both files are an uncommitted working diff.
- `wantAuthnRequestsSigned` remains `false`. #3 makes that survivable, but registering
  MathWorks' signing certificate and turning it on is the real fix.
- No E2E coverage of the cold-start SP-initiated loop (carried over from Round 7).
- Key-diagnostic `console.log`s in `saml-idp-service.ts` fire on every cold start. No
  key material is logged, but they are noise.
