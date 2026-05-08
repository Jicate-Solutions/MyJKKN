# Student Self-Fill Enquiry — Security Review Log

**Date:** 2026-05-08
**Reviewer:** Claude (automated checklist run, Tasks 1–23 complete)
**Feature:** `student-self-fill-enquiry` — public QR-based student data entry via HMAC-signed tokens

---

## Summary

| # | Item | Result |
|---|------|--------|
| 1 | Whitelist hardness | PASS |
| 2 | HMAC secret never leaked to client | PASS (minor concern noted) |
| 3 | All 5 routes export `runtime='nodejs'` | PASS |
| 4 | Expired-token landing leaks no learner data | PASS |
| 5 | Service-role key not bundled to client | PASS |
| 6 | Token-state lockdown in `validateToken` | PASS |
| 7 | RLS policy on tokens table | PASS (concern noted) |
| 8 | Storage bucket sanity | PASS |
| 9 | Permission seed correctness | PASS |

**Overall: 9/9 PASS — feature is operationally ready.**

---

## Item 1 — Whitelist Hardness

**Result: PASS**

File: `lib/services/admission/student-form-write-whitelist.ts`

- `STUDENT_WRITABLE_COLUMNS` contains only safe student-owned fields across three sections (`basic`, `academic`, `contact`). None of `lifecycle_status`, `institution_id`, `is_profile_complete`, `created_by`, `created_at`, `application_id`, or `id` appear.
- `FORBIDDEN_COLUMNS` (line 56–59) explicitly names all seven of those columns.
- `filterToWhitelist()` is an allowlist (not a denylist): it builds a new object from scratch containing only keys that match the section's list, so unknown columns are dropped silently.
- `saveSection()` in `student-form-service.ts` (line 156) calls `filterToWhitelist(section, fields)` before every `UPDATE`.
- The PATCH endpoint at `app/api/student-form/[token]/route.ts` (line 71) routes all writes exclusively through `StudentFormService.saveSection()` — no direct DB write bypasses the whitelist.
- Note: `is_profile_complete=true` IS written by `saveSection` on final submit (line 237) but only via an explicit hard-coded service-layer call, never from `fields` input. This is intentional and correct.

---

## Item 2 — HMAC Secret Never Leaked to Client Bundle

**Result: PASS (minor concern)**

- `lib/services/admission/student-form-service.ts` has `import 'server-only';` at line 8, preventing any client component from importing it at build time.
- `lib/services/admission/student-form-hmac.ts` does **not** have `import 'server-only'` directly. However:
  - It imports `node:crypto` at line 9, which Next.js's bundler cannot resolve in the Edge or browser runtime — any accidental client import would fail the build loudly.
  - The only import sites are: `student-form-service.ts` (server-only guarded) and `scripts/verify-student-form-hmac.ts` (a `tsx` development script, never bundled).
  - `grep` over `app/` and `components/` for `from.*student-form-hmac` returned zero results.
- **Minor concern:** Adding `import 'server-only'` to `student-form-hmac.ts` directly would provide defence-in-depth. Currently protected only by `node:crypto` build-time failure and the single import chain. Risk is low but remediation is trivial.

**Recommended remediation (low priority):** Add `import 'server-only';` as line 1 of `lib/services/admission/student-form-hmac.ts`.

---

## Item 3 — All 5 Routes Export `runtime='nodejs'`

**Result: PASS**

Verified via `grep runtime` on all five files:

| File | Has `runtime = 'nodejs'` |
|------|--------------------------|
| `app/api/admission/student-form-tokens/route.ts` | Yes (line 3) |
| `app/api/admission/student-form-tokens/[learner_id]/status/route.ts` | Yes |
| `app/api/admission/student-form-tokens/[token_id]/revoke/route.ts` | Yes |
| `app/api/student-form/[token]/route.ts` | Yes (line 8) |
| `app/api/student-form/[token]/photo/route.ts` | Yes |

---

## Item 4 — Expired-Token Landing Leaks No Learner Data

**Result: PASS**

File: `app/student-form/[token]/expired/page.tsx`

- Marked `export const dynamic = 'force-static'` — rendered at build time with no server-side data fetching.
- Contains zero DB queries, zero imports of any service or Supabase client.
- Content is entirely static bilingual copy (English + Tamil) directing the student back to the admission desk.
- No learner PII, no error messages that reveal token state beyond "no longer valid".

---

## Item 5 — Service-Role Key Not Bundled to Client

**Result: PASS**

`grep` over `app/` and `components/` for `createServiceRoleClient` and `SUPABASE_SERVICE_ROLE_KEY` found these files:

| File | Client component? | Verdict |
|------|-------------------|---------|
| `app/(routes)/academic/privileges/verify/[memberId]/page.tsx` | No — server component (no `'use client'`) | OK |
| `app/student-form/[token]/page.tsx` | No — server component (no `'use client'`) | OK |
| `app/apply/[slug]/page.tsx` | No — server component (no `'use client'`) | OK |
| `app/apply/[slug]/thank-you/page.tsx` | No — server component (no `'use client'`) | OK |
| `components/layout/preview-banner.tsx` | No — rendered server-side in `app/layout.tsx` (no `'use client'`) | OK |
| `app/(routes)/application-hub/api-guidelines/...` | `SUPABASE_SERVICE_ROLE_KEY` appears only inside a code-display string literal — not an actual import | OK |

No client components (`'use client'`) import service-role utilities.

---

## Item 6 — Token-State Lockdown in `validateToken`

**Result: PASS**

File: `lib/services/admission/student-form-service.ts`, `validateToken()` (lines 95–140)

All required guards are present in order:

| Guard | Location | Throws |
|-------|----------|--------|
| Bad HMAC / malformed / expired JWT | line 97: `verifyToken(rawToken)` | `'bad_signature'` / `'malformed_token'` / `'bad_payload'` / `'expired'` |
| Token row not found | line 108 | `'token_not_found'` |
| Token DB id ≠ payload `tid` | line 109 | `'token_id_mismatch'` |
| Status not `'active'` | line 110 | `row.status` (consumed/superseded/expired) |
| Lazy expiry (DB `expires_at` past) | lines 113–119 | transitions to `'expired'` then throws `'expired'` |
| `is_profile_complete=true` | lines 128–129 | `'consumed'` (defence-in-depth, blocks active token once learner done) |

Caller (`route.ts` `mapErrorToResponse()`) correctly maps:
- HMAC/structural errors → 401
- Lifecycle terminal states → 410 Gone

---

## Item 7 — RLS Policy on Tokens Table

**Result: PASS (concern noted)**

Query: `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'learner_self_fill_tokens'`

Result:

| policyname | cmd | qual |
|------------|-----|------|
| `learner_self_fill_tokens_read` | SELECT | `is_super_admin() OR user_has_permission('admission.leads.student_form.generate')` |

- Exactly one policy exists on the table.
- It gates SELECT on the correct permission key (`admission.leads.student_form.generate`) or super_admin.
- No INSERT/UPDATE/DELETE policies exist — all mutations go through service-role client (bypasses RLS by design), which is the correct pattern for this feature.
- **Concern:** The SELECT policy uses `generate` permission as the gate for read access to tokens. Roles with `revoke` but not `generate` (none currently, but worth noting) could not read token state via RLS. Currently all roles that have `revoke` also have `generate`, so this is not a live issue.

---

## Item 8 — Storage Bucket Sanity

**Result: PASS**

Query: `SELECT id, public FROM storage.buckets WHERE id = 'student-avatars'`

Result: `id='student-avatars'`, `public=true`

- Bucket exists.
- `public=true` is correct: thumbnails must be renderable by both the student-form page (no auth) and the admission desk UI without generating signed URLs per request.
- Path scheme enforced in photo route: `{learner_id}/{token_id}.jpg` — namespaced by learner, unique per token issuance.

---

## Item 9 — Permission Seed Correctness

**Result: PASS**

Query result:

| role_key | gen | rev | override |
|----------|-----|-----|----------|
| `super_admin` | true | true | true |
| `admission` | true | true | true |
| `admission_staff` | true | true | false |
| `admission_counselor` | true | false | false |
| `expo_counselor` | false | false | false |

Matches expected truth-table exactly:
- `super_admin` t/t/t ✓
- `admission` t/t/t ✓
- `admission_staff` t/t/f ✓
- `admission_counselor` t/f/f ✓
- `expo_counselor` f/f/f ✓

---

## Findings Requiring Action

### Low Priority

**Item 2:** Add `import 'server-only';` to `lib/services/admission/student-form-hmac.ts` (line 1) for defence-in-depth. Currently protected by `node:crypto` import (build-time failure) and single server-only import chain, but explicit guard is best practice.

---

## Files Reviewed

- `lib/services/admission/student-form-write-whitelist.ts`
- `lib/services/admission/student-form-service.ts`
- `lib/services/admission/student-form-hmac.ts`
- `app/api/student-form/[token]/route.ts`
- `app/api/admission/student-form-tokens/route.ts`
- `app/api/admission/student-form-tokens/[learner_id]/status/route.ts`
- `app/api/admission/student-form-tokens/[token_id]/revoke/route.ts`
- `app/api/student-form/[token]/photo/route.ts`
- `app/student-form/[token]/expired/page.tsx`
- `app/student-form/[token]/page.tsx`
- `components/layout/preview-banner.tsx`
