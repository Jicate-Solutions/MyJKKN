# MathWorks LTI Integration — Email Draft Template

**Purpose:** Ready-to-send email template for handing off LTI test credentials to the MathWorks integration team.

**Audience:** MathWorks LTI engineers starting integration testing against MyJKKN.

**When to use:** After the LTI test accounts are seeded, the `NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN` feature flag is enabled on the target environment, and you have confirmed a manual login works end-to-end.

**Companion docs:**
- `docs/modules/lti/MATHWORKS-TEST-ACCESS.md` — MathWorks-facing integration guide (link to it from the email)
- `scripts/create-lti-test-accounts.ts` — idempotent account seeding
- `scripts/cleanup-lti-test-accounts.ts` — soft-ban + password rotate on sign-off

---

## Pre-Send Checklist

Do NOT send the email until all boxes are checked:

- [ ] `NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN=true` is set on the deployed environment (Vercel / hosting dashboard)
- [ ] That environment has been **rebuilt and redeployed** — `NEXT_PUBLIC_*` vars only take effect on rebuild
- [ ] `https://<your-env>/auth/lti-login` renders the email+password form (NOT the red "disabled" alert)
- [ ] You've logged in yourself with `lti.faculty@jkkn.ac.in` and confirmed a successful session
- [ ] You've chosen which secure channel will carry the password (1Password shared vault, Signal, encrypted email, PGP, etc.)
- [ ] You've delivered the password through that channel **before** sending this email — so MathWorks has credentials in hand when they read the instructions
- [ ] All `<angle-bracket placeholders>` below have been replaced

---

## Email Draft — Copy Into Your Mail Client

**Subject:** JKKN LTI Integration — Test Credentials & Setup for MathWorks Team

---

Hi **\<MathWorks contact name\>**,

Thank you for the collaboration on the LTI integration between JKKN's MyJKKN platform and the MATLAB toolchain. We've completed our platform-side implementation (LTI 1.3 with RS256 JWT signing, OIDC, AGS grade passback, and NRPS roster) and provisioned two dedicated test accounts for your team's integration testing.

### Test Login URL

```
https://<your-deployed-env>/auth/lti-login
```

> **⚠ Important — please read before your team logs in:**
>
> Use **this specific URL only**. Do NOT use our main login page at `/auth/login`.
>
> Our organisation uses Google Workspace with a policy that enforces phone-based 2-Step Verification on all Google OAuth sign-ins from external networks. Because your team will be testing from outside our internal network, Google OAuth will block login and demand a phone number.
>
> The `/auth/lti-login` route is a dedicated email + password form we built specifically for this integration. It authenticates directly against our database, bypassing Google OAuth entirely, so there is no MFA prompt.
>
> When you see the login page, it will have **only an email + password form** — there is no Google button. If you see a Google button, you're on the wrong URL.

### Test Account Credentials

| Role    | Email                       | Intended Use                                                                     |
|---------|-----------------------------|----------------------------------------------------------------------------------|
| Student | `lti.student@jkkn.ac.in`    | MATLAB Grader student launch, assignment submission, grade receipt              |
| Faculty | `lti.faculty@jkkn.ac.in`    | Faculty launch, NRPS roster, AGS grade passback, OAuth 2.0 client credentials   |

**Password** — sent separately via **\<1Password shared vault / encrypted email / Signal — specify which\>**. If you haven't received it, please reply to this email.

### What You Can Test Today

Our platform exposes the following LTI 1.3 endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/lti/jwks` | Our public keyset (JWK format) for verifying signed JWTs |
| `POST /api/lti/auth` | OIDC login initiation (Step 1 of OIDC flow, if you initiate) |
| `POST /api/lti/callback` | OIDC callback (receives `id_token`) |
| `POST /api/lti/token` | OAuth 2.0 token endpoint (client_credentials) for AGS / NRPS access tokens |
| `POST /api/lti/launch` | User-initiated launch — generates signed JWT + auto-submits to your platform |
| `GET /api/lti/names-roles` | NRPS roster (requires AGS/NRPS access token) |
| `POST /api/lti/grades` | Grade passback (AGS) |

Our platform issuer (`iss` claim in all launch JWTs):

```
https://myjkkn.jkkn.ac.in
```

### What We Need From Your Team

To complete the tool registration on our side so launches can resolve to MATLAB Grader, please share the following six values:

1. **`client_id`** — MathWorks-assigned identifier for MyJKKN as a tool consumer
2. **`deployment_id`** — MathWorks deployment ID for our tenant
3. **`launch_url`** — the endpoint we should POST the signed JWT to
4. **`public_keyset_url`** — your JWKS URL so we can verify tokens your side signs
5. **`oidc_auth_url`** — your OIDC authorisation endpoint
6. **`redirect_uri`** — post-launch redirect URI

And one decision:

7. **`tool_type`** — one of `matlab_grader`, `matlab_online`, `matlab_academy`, or `matlab_production_server`. We're assuming `matlab_grader` by default — please confirm.

Once we receive these, tool registration takes ~2 minutes on our side, after which the in-app LTI launch buttons will be live for your team to trigger end-to-end launch tests.

### Access Window & Security

- These accounts are **feature-flag gated** on our platform and will be automatically disabled after integration sign-off.
- Please restrict credential sharing to your LTI integration team only.
- Every launch is recorded in our audit log (user, tool, IP, timestamp, JWT nonce) — we can surface this to you on request.
- After sign-off, we'll rotate the passwords and soft-ban the accounts.

### Primary Contact

For any questions, issues, or to share the six config values above, please reply to this email or reach me directly at **\<your-email@jkkn.ac.in\>**.

Looking forward to a smooth integration.

Best regards,
**\<Your Name\>**
JKKN Educational Institutions

---

## Separate Secure-Channel Message (For The Password)

Send this via the secure channel you referenced in the email (1Password shared vault / encrypted email / Signal) — **NEVER** paste the password into the email body or any unencrypted channel.

**Suggested short note:**

```
JKKN LTI Integration Test Credentials
─────────────────────────────────────
Accounts:  lti.student@jkkn.ac.in
           lti.faculty@jkkn.ac.in
Password:  <shared-password>
URL:       https://<your-deployed-env>/auth/lti-login

⚠ Use the email + password form only. Do NOT click "Sign in with Google"
  — it will trigger MFA and block login.
```

---

## Placeholders to Replace Before Sending

| Placeholder | Replace With | Appears In |
|---|---|---|
| `<MathWorks contact name>` | Actual recipient name (e.g., "Sarah") | Email greeting |
| `<your-deployed-env>` | Deployed hostname with feature flag on (e.g., `myjkkn.jkkn.ac.in` or `staging.myjkkn.jkkn.ac.in`) | Email body + secure-channel note |
| `<1Password shared vault / encrypted email / Signal — specify which>` | Your chosen secure delivery method | Email "Password" row |
| `<your-email@jkkn.ac.in>` | Your reply-to address (default: `aicse@jkkn.ac.in`) | Primary Contact section |
| `<Your Name>` | Sender's full name | Email sign-off |
| `<shared-password>` | Actual password set via `LTI_TEST_PASSWORD` env var when seeding | Secure-channel message only |

---

## After MathWorks Provides Their 6 Values

Register the tool in `lti_tools` by re-running the seed script with the `MATHWORKS_*` env vars set — the script is idempotent and will either INSERT the tool row or UPDATE the existing one (matched by `client_id`):

```bash
cd D:/Projects/MyJKKN
set -a && source .env && set +a
export LTI_TEST_PASSWORD='<same-password-as-before>'

export MATHWORKS_CLIENT_ID='<value-from-mathworks>'
export MATHWORKS_DEPLOYMENT_ID='<value-from-mathworks>'
export MATHWORKS_LAUNCH_URL='<value-from-mathworks>'
export MATHWORKS_PUBLIC_KEYSET_URL='<value-from-mathworks>'
export MATHWORKS_OIDC_AUTH_URL='<value-from-mathworks>'
export MATHWORKS_REDIRECT_URI='<value-from-mathworks>'
export MATHWORKS_TOOL_TYPE='matlab_grader'   # or whatever they confirm

npx tsx scripts/create-lti-test-accounts.ts
```

The output will include `✓ LTI tool registered: MathWorks — matlab_grader (client_id=...)` in place of the earlier `ℹ Tool registration: skipped` line.

---

## After Integration Sign-Off

1. Run the cleanup script to soft-ban accounts and rotate passwords:
   ```bash
   npx tsx scripts/cleanup-lti-test-accounts.ts
   ```
2. Flip the feature flag off:
   ```
   NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN=false
   ```
3. Redeploy so the `/auth/lti-login` route renders the "disabled" alert.
4. (Optional) Send a follow-up email thanking the MathWorks team and noting credentials are now invalid.

---

## Template Maintenance Notes

- If the LTI endpoint list changes (new endpoints added, renamed, removed), update the "What You Can Test Today" table.
- If the activation mechanism changes (e.g., a different feature flag name), update the pre-send checklist.
- Keep this template specific to MathWorks. For a different integration partner (e.g., Respondus, Turnitin), create a separate file in `docs/modules/lti/` rather than genericising this one — each partner has different endpoints, capabilities, and security expectations worth calling out explicitly.
