# MyJKKN — User Login with Role

**Date:** 2026-08-25
**Status:** As-built specification (normative). Documents the contract the current
code implements; every clause is verified against the source cited beside it.
**Scope:** Authentication + role resolution + role-based routing/authorization for
the **staff & learner** domain (Supabase `auth.users`). The four sibling identity
domains are specified only at their boundary (§3).
**Related:** `specs/pre-onboarding-induction-access-2026-06-29.md`,
`specs/director-desk/SPEC.md`, `CUSTOM_ROLE_PERMISSION_SYSTEM.md`

---

## 1. Purpose

Define, as a single reference, what happens between "user clicks Sign in" and "user
lands on a page they are allowed to see" — including which role they hold, where
that role comes from, where they land, what they are confined to, and every way the
attempt can be denied.

This is the document to read **before** adding a role, adding a login method,
changing a landing destination, or debugging "why can this user see / not see X".

## 2. Definitions

| Term | Meaning |
|---|---|
| **Primary role** | `profiles.role` — a plain `text` column, not an enum. The single string every middleware check and ~146 RLS policies read. |
| **Built-in role** | One of the 11 strings hardcoded at [proxy.ts:757-772](proxy.ts#L757-L772): `super_admin`, `administrator`, `faculty`, `staff`, `student`, `guest`, `driver`, `hod`, `admission`, `registrar`, `principal`. |
| **Custom role** | Any other `profiles.role` value. Its permissions live in `custom_roles.permissions` (JSONB map of `permission_key` → boolean). |
| **Secondary role** | A row in `user_roles` with `is_primary = false`. Contributes to *merged permissions* only — see the gap in §10.2. |
| **Permission key** | Dot-notation string, e.g. `academic.bos-syllabus.view`. Catalog: [lib/constants/permissions.ts](lib/constants/permissions.ts). Route enforcement map: `MENU_PERMISSIONS` in [lib/sidebarMenuLink.ts](lib/sidebarMenuLink.ts). |
| **Proxy** | This repo's Next.js middleware. The file is [proxy.ts](proxy.ts) (named `proxy`, not `middleware`). |

## 3. Identity domains (boundary contract)

One origin hosts five mutually isolated auth domains. **The proxy dispatches on
path prefix and returns early**, before the Supabase flow is ever constructed —
required, because a parent has no Supabase session and would otherwise be bounced
to the staff Google login.

| Domain | Path prefix | Credential | Gate | Handled at |
|---|---|---|---|---|
| **Staff & learners** *(this spec)* | everything else | Supabase session cookie (Google OAuth) | `getSession()` → `getUser()` | [proxy.ts:305](proxy.ts#L305) |
| Parent portal | `/parent/*` | `parent_session` JWT | `verifyParentSession()` | [proxy.ts:46](proxy.ts#L46) |
| Schools Network HM | `/schools-portal/*` | `school_portal_session` JWT (magic link) | `verifySchoolPortalSession()` | [proxy.ts:87](proxy.ts#L87) |
| SF100 external mentor/investor | `/external/*` | `sf100_external_session` JWT | `verifyExternalSession()` | [proxy.ts:118](proxy.ts#L118) |
| External course participant | `/my-courses/*` | JKKN ID + password → Supabase user flagged `is_external_participant` | proxy confinement (§8.2) | [proxy.ts:713](proxy.ts#L713) |

**Invariant:** each domain's `/api/*` routes are authorized **in-route**, never by
the proxy — `isPublicPath()` returns `true` for all of `/api/*`. The proxy's only
API responsibility is forcing `Cache-Control: private, no-store` on them
([proxy.ts:386](proxy.ts#L386)), because a `public, s-maxage` header is keyed by
URL and not by cookie, which previously leaked one parent's data to another.

## 4. Login entry points

| Route | Credential | Availability | Purpose |
|---|---|---|---|
| `/auth/login` | **Google OAuth only** | Always | Canonical staff + learner sign-in. Google One Tap also mounted. |
| `/auth/callback` | PKCE `?code=` | Always | The only role-resolution and provisioning point (§5). |
| `/auth/participant-login` | JKKN ID + password | Always | External course participants — no Google account, often no email. |
| `/auth/dev-login` | Supabase magic-link token | `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | Exchanges `admin.generate_link` tokens; `/auth/callback` only handles PKCE. |
| `/auth/test-login` | email + password | Dev only | Role/permission testing. |
| `/auth/lti-login` | email + password | Feature-flagged | MathWorks LTI integration testing. |
| `/auth/audit-login` | email + password | Feature-flagged | Razorpay payment-gateway security audit. |

All are in `PUBLIC_PATHS_SET` ([proxy.ts:166](proxy.ts#L166)) and excluded from the
proxy `matcher` ([proxy.ts:836](proxy.ts#L836)).

**Unauthenticated deep-link rule:** the destination is preserved as
`?redirectedFrom=<path+search>` on every bounce, and the sign-in page is chosen by
path, not by person — `/my-courses/*` → `/auth/participant-login`, everything else
→ `/auth/login` (`loginUrlFor()`, [proxy.ts:158](proxy.ts#L158)). There is no
session to read a role from at that moment, so path is the only available signal.

## 5. Canonical login sequence

Google OAuth → [app/auth/callback/route.ts](app/auth/callback/route.ts).

1. **Exchange.** `exchangeCodeForSession(code)`. The user MUST be read from the
   exchange's return value, never a follow-up `getUser()` — a second call races the
   cookie write under PKCE and returns `null` on first SAML SSO and under MFA
   latency. On failure → `/auth/login?error=exchange` or `?error=session`.
2. **SAML resume short-circuit.** If `?samlReqId` is present, redirect straight to
   `/api/saml/sso?samlReqId=...` and **skip all role routing** — the SP-initiated
   flow must emit the SAMLResponse itself.
3. **Profile lookup** via **service-role client** (bypasses RLS; RLS blocking the
   `SELECT` previously caused duplicate profile creation).
4. **Identity reconciliation.** No profile for `auth.users.id`, but one exists for
   the email → delegate the swap to the `migrate_pre_registered_profile_to_auth`
   RPC. It dynamically detaches **every** blocking FK to `profiles(id)` (280+).
   Event ownership (`event_registrations.owner_id`, `event_team_members.profile_id`)
   is snapshotted first and re-linked after, because the RPC nulls nullable FKs.
5. **Invite-only gate** (policy 2026-04-14, revised 2026-05-06). No profile at all:
   - Match `learners_profiles.college_email ILIKE <email>` with `lifecycle_status IN
     ('approved','active','graduated', ...INDUCTION_ELIGIBLE)` → insert a profile with
     **no role**; the DB default (`student`) plus the
     `auto_link_profile_to_approved_learner` trigger populate `role`, `learner_id`,
     `institution_id`, `department_id`.
   - Otherwise → **delete the `auth.users` row**, `signOut()`, redirect to
     `/auth/access-denied?reason=not_registered`. Deliberately unaudited: authorized
     users are created inside the app, so a denial is simply an unauthorized attempt.
6. **Active check.** `profile.is_active === false` → `signOut()` → `/unauthorized?reason=inactive`.
7. **Side effects, all non-blocking.** Activity log (`ActivityTemplates.userLogin`);
   analytics session (`analytics_session_id` cookie, httpOnly, 24 h); Cal.com identity
   provisioning registered via Vercel `waitUntil` so the cross-DB write survives the
   response — a bare `void` would be truncated on instance reclaim and orphan a key.
8. **Profile completion.** `profile_completed === false` → `/auth/complete-profile`.
9. **Role routing** → §7.

## 6. Role model

### 6.1 Storage

- `profiles.role` — **the** authorization key. Written by admins, by the learner
  auto-link trigger, and by `sync_primary_role_to_profile()` when a `user_roles`
  row is flipped to `is_primary`
  ([20251128_add_multi_role_support.sql:217](supabase/migrations/20251128_add_multi_role_support.sql#L217)).
- `profiles.is_super_admin` — boolean escape hatch; ORed with `role === 'super_admin'`
  in [hooks/use-permissions.ts:203-206](hooks/use-permissions.ts#L203-L206).
- `profiles.is_external_participant` — hard discriminator for the `/my-courses`
  confinement. Checked **instead of** the role string, because the role is editable
  in Role Management and the flag is not.
- `custom_roles` — `role_key`, `role_name`, `permissions` JSONB, `institution_scope`
  (`all` | `own`), `module_scopes` (per-module override), `is_active`.
- `user_roles` — `(user_id, role_id)` unique; a partial unique index enforces
  **one** `is_primary = true` per user.

### 6.2 Resolution order at request time

| Consumer | Source | Notes |
|---|---|---|
| Proxy (page gate) | `profiles.role` **only** | Custom roles trigger one `custom_roles` read. Secondary roles are **not** consulted. |
| Client (`usePermissions`) | `get_user_merged_permissions(user_id)` — OR-merge across all `user_roles` | Falls back to a client-side merge if the RPC fails, then ORs Director's-Desk handover keys. |
| API routes (`withAuth`) | `is_super_admin()` OR `is_admin()` OR `user_has_permission(key)` | `requireRole` string lists are **deprecated** — they drift as roles are added. |
| RLS (~859 policies) | `profiles.role` string + `role_has_institution_access()` | See gap §10.2. |

## 7. Landing destination by role

Decided once in the callback ([app/auth/callback/route.ts:543](app/auth/callback/route.ts#L543)).

| Condition | Destination |
|---|---|
| `?samlReqId` present | `/api/saml/sso?samlReqId=...` (bypasses everything below) |
| `profile_completed = false` | `/auth/complete-profile` |
| `role = 'guest'` | `/guest` |
| `role = 'driver'` | `/driver` |
| `role = 'student'`, portal flag **off** | `/auth/login?reason=student_redirect` (signed out) |
| `role = 'student'`, `accessTier = 'induction_only'` | `/learners/my-induction` (**not** signed out) |
| `role = 'student'`, `validation.allowed = false` | `/auth/login?reason=<code>` (signed out) |
| `role = 'student'`, allowed | `/` |
| New approved learner, induction-eligible status | `/learners/my-induction` |
| New approved learner, other | `/auth/complete-profile` |
| **Any other role** (including every custom role) | `/` |

Student access is gated by `FEATURE_FLAGS.ENABLE_STUDENT_PORTAL`
(`NEXT_PUBLIC_ENABLE_STUDENT_PORTAL === 'true'`) and by
`StudentValidationService.validateStudentAccess()`. Accounts matching
`lti.*@jkkn.ac.in` bypass both (MathWorks test seeds).

## 8. Per-request authorization (the proxy)

Runs on every non-public path. Order is load-bearing.

### 8.1 Session

1. `getSession()` — local cookie read, no network.
2. Access token → `tokenValidationCache` (in-memory, TTL **60 s** or the token's
   own `exp`, whichever is sooner; max 5000 entries, LRU). **Only successful
   validations are cached** — fail-closed.
3. Cache miss → real `getUser()`, with **one** 200 ms retry. Mobile LTE handoffs
   routinely produce a single transient failure; without the retry that logs the
   user out.
4. Cookie options from Supabase must be forwarded **verbatim**. Dropping `maxAge`
   downgrades the auth cookie to a session cookie on every refresh — the cause of
   iOS PWA users being logged out on app close.

### 8.2 Profile and confinement

5. `profileCache` (in-memory, TTL **5 min**), one 200 ms retry on a failed fetch.
   Two failures → `/auth/login?error=profile_load_failed`.
6. `is_active === false` → clear cookies → `/unauthorized?reason=inactive`.
7. Student / induction-only scoping (§7). Induction-only allowed set:
   `/learners/my-induction*`, `/learners/my-profile`, `/unauthorized`, `/error`.
8. `user_metadata.account_disabled === true` → `/auth/login?reason=disabled`.
9. `profile_completed = false` → `/auth/complete-profile` (except onboarding/guest).
10. Calendar-connect lock, when applicable → `/auth/connect-calendar`.
11. **Confinements** — each holder below sees exactly one subtree:

    | Holder | Confined to |
    |---|---|
    | `is_external_participant = true` | `/my-courses*`, `/auth*`, `/api/auth*`, `/api/courses/payments*` |
    | `role = 'guest'` | `/guest*`, `/auth*` |
    | `role = 'driver'` | `/driver*`, `/auth*` |
    | everyone else | blocked **from** `/guest*` and `/driver*` → `/` |

    The `/api/courses/payments` exemption is deliberate and narrow: without it the
    confinement 307s the participant's checkout fetch and Razorpay receives HTML
    where it expected JSON.

### 8.3 Permission check

12. If `profiles.role` is **not** a built-in ([proxy.ts:757-772](proxy.ts#L757-L772)),
    read `custom_roles.permissions` for that `role_key` where `is_active = true`.
13. `routeMatcher.hasAccess(path, role, permissions)`
    ([lib/auth/route-matcher.ts:305](lib/auth/route-matcher.ts#L305)) — two tries:
    - `PROTECTED_ROUTES` (static role lists) — currently `/system`, `/profile`,
      `/users/roles`, `/users/role-management`, `/guest`, `/driver`.
    - `MENU_PERMISSIONS` (dynamic permission keys), O(1) trie lookup with wildcard
      segments for `[id]` routes.

    Resolution: unmatched path → **allow**; permission required **and** permissions
    supplied → `permissions[key] === true`; permission required and **no**
    permissions (i.e. a built-in role) → **allow**, deferring to client-side
    enforcement; static roles → `roles.includes(role)`.
14. On denial, the **fifth layer**: `routeAllowedByHandover()` (Director's Desk).
    300 ms ceiling, fails closed, no-ops while `fn_my_handover_permissions` is
    unapplied. Grants stamp `x-access-via: director-handover`.
15. Denied → `/unauthorized`. Allowed → set `x-user-id`, `x-user-email`,
    `x-user-role`, `x-required-permission`, and `Cache-Control: no-store`.

## 9. Denial states

| Reason / URL | Trigger |
|---|---|
| `/auth/access-denied?reason=not_registered` | Google account with no profile and no eligible learner. `auth.users` row deleted. |
| `/auth/access-denied?reason=profile_creation_failed` | Learner matched but profile insert failed. Auth row deleted. |
| `/unauthorized?reason=inactive` | `profiles.is_active = false`. |
| `/unauthorized` | Role/permission check failed and no handover grant. |
| `/auth/login?reason=student_redirect` | Student, portal flag off. |
| `/auth/login?reason=<validation code>` | Student blocked on lifecycle status. |
| `/auth/login?reason=disabled` | `user_metadata.account_disabled`. |
| `/auth/login?error=profile_load_failed` | Two consecutive profile-fetch failures (transient, not a permission problem). |
| `/auth/login?error=exchange` / `=session` / `=no_code` / `=general` | OAuth exchange faults. |
| `/error` | Unhandled proxy exception. |

## 10. Known gaps — do not "fix" without reading these

### 10.1 Built-in roles are not enforced in middleware
`hasAccess` returns `true` for a built-in role on any `MENU_PERMISSIONS` route,
because the proxy never fetches permissions for them (§8.3, step 13). Fine-grained
enforcement for built-in roles is **client-side only**, via `usePermissions`. Any
route that must be server-enforced needs either a `PROTECTED_ROUTES` entry or an
in-route `withAuth({ requirePermission })` guard.

### 10.2 Secondary roles do not reach the proxy or RLS
`profiles.role` holds the **primary** role only. Merged permissions from
`user_roles` are computed client-side or in RPCs; the proxy check and the
role-string-gated RLS policies see only the primary string. A user granted a
second role therefore gets the *UI* without the *data*, or the reverse.

### 10.3 Client permission revoke is not instant
Merged permissions are cached by React Query for a 5-minute `staleTime`. A revoked
user keeps page gates open until refetch; the **data** closes immediately because
RLS re-asks the database. Worst case is an empty shell, not a leak.

### 10.4 Permission keys must exist in two places
A key is only enforced on a route if it appears in `MENU_PERMISSIONS`. A key
present in the catalog but absent from `MENU_PERMISSIONS` gates nothing; a route
absent from `MENU_PERMISSIONS` is invisible in nav to every non-super-admin.

### 10.5 Key-format drift
The DB has historically stored underscore-form keys while code uses dot-form, and
repo migrations can sit unapplied. Repair template:
`scripts/fix-bos-permission-format-drift.sql`.

## 11. Change checklist

**Adding a role**
1. Insert into `custom_roles` (`role_key`, `permissions`, `institution_scope`,
   `module_scopes`, `is_active = true`). No schema migration — the role is data.
2. Decide built-in vs custom. To skip the `custom_roles` lookup, add it to the list
   at [proxy.ts:757-772](proxy.ts#L757-L772) — and accept §10.1.
3. Landing page: default is `/`. A confined role needs an explicit branch in **both**
   the callback (§7) and the proxy confinement block (§8.2) — they must agree.
4. Grant permission keys that exist in `MENU_PERMISSIONS`, else nav stays empty.
5. Check RLS: policies keyed on role strings will not know the new role
   (`role_has_institution_access` is the shared, CAS-aware helper).
6. Optional: `ROLE_DEFAULT_FAVORITES` in [lib/navigation/role-defaults.ts](lib/navigation/role-defaults.ts).

**Adding a login method**
1. Add the page path to `PUBLIC_PATHS_SET` **and** to the proxy `matcher` exclusion.
2. Add its POST endpoint under `/api/*` (already public) and authorize in-route.
3. If the identity is not in `auth.users`, follow the parent/schools-portal shape:
   own JWT cookie plus an early dispatch in `proxy()` before the Supabase client is
   built.

## 12. Acceptance criteria

| # | Scenario | Expected |
|---|---|---|
| 1 | Unknown Google account signs in | `/auth/access-denied?reason=not_registered`; no `auth.users` row remains |
| 2 | Pre-registered profile, first Google sign-in | Profile migrated via RPC; staff / user_roles / event links intact |
| 3 | Approved learner, no profile | Student profile auto-created; lands `/auth/complete-profile` |
| 4 | Induction-eligible learner | Lands `/learners/my-induction`; every other path redirects back; **not** signed out |
| 5 | `is_active = false` | `/unauthorized?reason=inactive` on both the callback and proxy paths |
| 6 | Guest / driver / external participant | Confined to their subtree; other roles blocked from `/guest`, `/driver` |
| 7 | Custom role lacking the route's key | `/unauthorized` |
| 8 | Custom role holding the key | Page renders; `x-user-role` + `x-required-permission` set |
| 9 | Deep link while logged out | `?redirectedFrom` preserved through the whole roundtrip |
| 10 | SAML SP-initiated login | Reaches `/api/saml/sso`; **never** `/dashboard` |
| 11 | Second request within 60 s | No `/auth/v1/user` network call (token cache hit) |
| 12 | iOS PWA close and reopen | Session persists (cookie `maxAge` forwarded) |
