# Google Workspace offboarding (account suspension) — setup & design

**Status:** Code merged dark. **Inert until the two Google-side steps below are done.**
**Date:** 2026-07-24

## Why this exists

MyJKKN login *is* Google OAuth restricted to `@jkkn.ac.in`. Suspending a person's
Google Workspace account therefore also blocks their MyJKKN login — plus Gmail,
Drive, Meet. It is the **upstream master switch** for offboarding. MyJKKN's own
`is_active = false` only closes the MyJKKN door; Workspace suspension closes the
whole identity.

## What the code provides

| File | Purpose |
|---|---|
| `lib/google/workspace-admin.ts` | Directory API helper: `suspendWorkspaceUser`, `unsuspendWorkspaceUser`, `signOutWorkspaceUser`, `getWorkspaceUser`, `isWorkspaceAdminConfigured`. Reuses the **existing Drive service account**. |
| `app/api/users/[id]/workspace-suspend/route.ts` | `POST` endpoint. super_admin-only, cannot target self, fails closed (501) when unconfigured, audit-logged to `user_activity_logs`. Body: `{ action: 'suspend' \| 'unsuspend', alsoSignOut?: boolean }`. |

Design choices:
- **Suspend only** (reversible). No delete path is exposed anywhere.
- **Never suspends a Workspace admin** — the helper reads `isAdmin`/`isDelegatedAdmin`
  first and refuses, mirroring the app's own refusal to deactivate a `super_admin`.
- Reuses the Drive service account, which **already has domain-wide delegation**
  configured and proven (Drive uploads run through it).

## The two Google-side steps required to activate (a Workspace super-admin must do these)

### 1. Add the Directory scope to the existing delegation

The service account in `GOOGLE_DRIVE_CLIENT_EMAIL` already has domain-wide
delegation. Add one scope to its authorization.

- Google Admin console → **Security → Access and data control → API controls → Domain-wide delegation**.
- Find the existing entry for the service account's **client ID** (same account as `GOOGLE_DRIVE_CLIENT_EMAIL`).
- Edit its scopes and **add** (comma-separated, alongside the existing Drive scope):
  ```
  https://www.googleapis.com/auth/admin.directory.user
  ```
- Save. (Adding a scope does not affect the existing Drive scope.)

### 2. Choose an admin identity to impersonate, and set the env var

The Directory API refuses user writes unless the impersonated subject is an admin.
The Drive subject (`GOOGLE_DRIVE_IMPERSONATE_SUBJECT`) may be a non-admin, so this
is a **separate** variable.

- Pick (or create) a Workspace user that holds an admin role with the **Users**
  (user management) privilege. A dedicated service admin (e.g. `svc-offboarding@jkkn.ac.in`)
  is cleaner than a person.
- In Vercel (Production), add:
  ```
  GOOGLE_ADMIN_IMPERSONATE_SUBJECT = <that-admin@jkkn.ac.in>
  ```
- Redeploy (an env-only change needs a no-op commit to trigger a build).

Once both are done, `isWorkspaceAdminConfigured()` returns true and the endpoint
goes live. Until then it returns **501** and changes nothing.

## Verifying it works (safe, on a test account)

```bash
# As a super_admin session, dry-read a user's Workspace state via getWorkspaceUser
# (exposed through the endpoint's suspend→unsuspend round-trip on a disposable test user).
curl -X POST https://www.jkkn.ai/api/users/<TEST_USER_ID>/workspace-suspend \
  -H 'Content-Type: application/json' -d '{"action":"suspend","alsoSignOut":true}'
# then immediately:
curl -X POST https://www.jkkn.ai/api/users/<TEST_USER_ID>/workspace-suspend \
  -H 'Content-Type: application/json' -d '{"action":"unsuspend"}'
```

## Known limitations / follow-ups

- **Live MyJKKN session gap:** suspension blocks *new* Google logins immediately,
  but an already-issued Supabase JWT survives ~1h (middleware does not re-check
  Google per request). For instant cut-off, pair with `alsoSignOut: true` **and**
  a Supabase session ban on `auth.users`.
- **No UI yet.** This PR ships the capability + endpoint + runbook only. A gated
  "Also suspend Google Workspace" control on the user-deactivate screen is the
  next step, to be wired *after* the two Google-side steps are confirmed working
  (so the button never points at an inert 501 endpoint).
- **Direction of truth:** long-term, Google is the identity source of truth;
  a reverse sync (suspended-in-Google → `is_active=false` in MyJKKN) would close
  the loop. Out of scope here.
