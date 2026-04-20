# MathWorks LTI Integration — Test Account Access

**Last updated:** 2026-04-20
**Owner:** MyJKKN Platform Team
**Audience:** MathWorks integration engineers

---

## Quick Start (for MathWorks team)

### Login URL

```
https://<myjkkn-environment>/auth/lti-login
```

This is a **dedicated route just for LTI integration testing** — an email + password form, no Google button, no other login options. Ask your MyJKKN contact whether you're testing against **staging** or **production** and use the matching host.

> If you see an "LTI test login is disabled" message, the feature flag is off — contact your MyJKKN administrator to enable `NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN=true` for your test window.

### Credentials

| Email | Role | Purpose |
|---|---|---|
| `lti.student@jkkn.ac.in` | student | MATLAB Grader student launch, assignment submission, grade receipt |
| `lti.faculty@jkkn.ac.in` | faculty | Faculty launch, Names & Roles Service (NRPS), Assignment & Grade Services (AGS) |

**Password:** shared separately via secure channel (1Password / encrypted email).

### Why This Dedicated Route Exists

The main `/auth/login` page only offers Google OAuth, which triggers the `@jkkn.ac.in` Google Workspace policy demanding phone-based Multi-Factor Authentication for external-network logins — blocking MathWorks from testing.

`/auth/lti-login` is an independent email + password route that:
- Accepts only accounts matching `lti.*@jkkn.ac.in` (enforced client-side)
- Is feature-flag gated (`NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN`)
- Is removed/disabled after integration sign-off
- Never contacts Google — so Workspace MFA never fires

---

## Why This Setup Exists

Our organisation (`jkkn.ac.in`) is a Google Workspace tenant. Google enforces phone-based 2-Step Verification on all Workspace accounts when logged in from external networks (i.e. anywhere outside our campus IP range).

Because MathWorks tests from outside our network, Google OAuth always demands a phone number and blocks login — even for accounts we create specifically for testing.

**Supabase email + password authentication is a completely separate auth channel.** It verifies credentials against our Supabase `auth.users` table (bcrypt hash comparison) and never contacts Google. So these test accounts satisfy your requirement to test on the `@jkkn.ac.in` domain **without** being subject to Workspace MFA.

---

## Expected LTI Test Flow

### 1. Student launch (`lti.student@jkkn.ac.in`)

1. Log in via email + password
2. You land on the student dashboard
3. Navigate to the course / assignment that has a MATLAB Grader resource
4. Click the LTI launch button/link
5. MyJKKN generates a signed RS256 JWT and auto-POSTs an HTML form to your platform
6. You verify the JWT against our public keyset at `/api/lti/jwks`
7. Student completes the assignment in MATLAB Grader
8. MATLAB calls back to `/api/lti/grades` with the score → we record it

### 2. Faculty launch (`lti.faculty@jkkn.ac.in`)

1. Log in via email + password
2. Navigate to the LTI admin / course section
3. Launch with faculty context — the JWT includes LTI role `http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor`
4. You may call `/api/lti/names-roles?context_id=<from-launch>` with the OAuth 2.0 access token obtained from `/api/lti/token` (client_credentials grant) to retrieve the class roster

### 3. API endpoints reference

| Endpoint | Purpose |
|---|---|
| `GET /api/lti/jwks` | Our public keyset (JWK format) for verifying our signed JWTs |
| `POST /api/lti/auth` | OIDC login initiation (Step 1 of OIDC flow — if you initiate from your side) |
| `POST /api/lti/callback` | OIDC callback (receives `id_token`) |
| `POST /api/lti/token` | OAuth 2.0 token endpoint (client_credentials) for AGS / NRPS access tokens |
| `POST /api/lti/launch` | Internal endpoint — user-initiated launch generates JWT + auto-submit form |
| `GET /api/lti/names-roles` | NRPS roster (requires AGS/NRPS access token) |
| `POST /api/lti/grades` | Grade passback (AGS) |

Our platform issuer: `https://myjkkn.jkkn.ac.in` (the value in the `iss` claim of launch JWTs; confirm with your MyJKKN contact if testing on staging).

---

## What The Test Accounts Can Access

| Account | Institution | Program | Semester | Section | LTI tools |
|---|---|---|---|---|---|
| `lti.student@jkkn.ac.in` | (first active institution — ask for exact name) | (first active program) | (first semester) | (first section) | Whichever MATLAB tools are registered in `lti_tools` |
| `lti.faculty@jkkn.ac.in` | Same institution | — | — | — | Faculty-scoped LTI access |

The student account has a `learners_profiles` row with `lifecycle_status = 'active'`, `activated_at` set, and synthetic `TEST-` prefixed personal data (which satisfies NOT NULL constraints but clearly marks the row as test-only).

---

## Security & Audit Notes (internal)

- Password is stored only in Supabase as bcrypt hash — never in this doc.
- Password is rotated via env var: `export LTI_TEST_PASSWORD='<new>' && npx tsx scripts/create-lti-test-accounts.ts`
- Every LTI launch is recorded in `lti_launches` (user_id, tool_id, IP, user-agent, JWT nonce) for audit.
- After MathWorks integration sign-off, run `npx tsx scripts/cleanup-lti-test-accounts.ts` to soft-ban the accounts (password rotated to random, `banned_until` set to 100 years). Audit rows are preserved.
- Re-running the seed script at any time unbans + restores the accounts.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "LTI test login is disabled" page | Feature flag `NEXT_PUBLIC_ENABLE_LTI_TEST_LOGIN` is off | Ask MyJKKN admin to enable the flag and redeploy |
| "This page only accepts dedicated LTI test accounts" | Email doesn't match `lti.*@jkkn.ac.in` | Use the exact seeded emails (typo check) |
| "Invalid login credentials" | Password rotated or account was cleaned up | Contact your MyJKKN integration lead for a fresh seed |
| Landed on Google OAuth screen with MFA prompt | You went to `/auth/login` instead of `/auth/lti-login` | Use the correct URL — `/auth/lti-login` |
| Lands on profile-completion screen instead of dashboard | `profiles.profile_completed` drifted to `false` | Re-run `create-lti-test-accounts.ts` — it resets the flag to `true` |
| LTI launch button missing | Student's program has no LTI-enabled course / tool not registered | Verify `lti_tools.is_active = true` and the course has a matching resource link |
| JWT verification fails on your side | Key rotation on our end | Re-fetch `/api/lti/jwks` — our public key may have rotated |
| `403` on `/api/lti/names-roles` | Access token missing AGS/NRPS scope | Request correct scopes in your `/api/lti/token` call |

---

## Verification Query (internal)

Run this after seeding to confirm all 5 table rows exist per account:

```sql
-- Run in Supabase SQL Editor as service_role
WITH targets AS (
  SELECT id, email FROM auth.users
  WHERE email IN ('lti.student@jkkn.ac.in', 'lti.faculty@jkkn.ac.in')
)
SELECT
  t.email,
  t.id AS user_id,
  p.is_active          AS profile_active,
  p.profile_completed,
  p.role               AS profile_role,
  p.institution_id,
  cr.role_key          AS assigned_role,
  ur.is_primary        AS role_is_primary,
  uia.access_type,
  uia.is_active        AS institution_access_active,
  lp.lifecycle_status  AS learner_lifecycle,
  lp.program_id        AS learner_program
FROM targets t
LEFT JOIN profiles p              ON p.id = t.id
LEFT JOIN user_roles ur           ON ur.user_id = t.id AND ur.is_primary = true
LEFT JOIN custom_roles cr         ON cr.id = ur.role_id
LEFT JOIN user_institution_access uia ON uia.user_id = t.id
LEFT JOIN learners_profiles lp    ON lp.student_email = t.email;
```

Expected output: 2 rows, all boolean columns `true`, `profile_role` matches `assigned_role`, student has `learner_lifecycle = 'active'` and non-null `learner_program`.
