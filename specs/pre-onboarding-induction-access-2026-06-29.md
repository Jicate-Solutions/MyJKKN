# Pre-onboarding Learner Access to Induction — Implementation Plan

**Date:** 2026-06-29
**Status:** Awaiting confirmation (no code written yet)
**Related:** `specs/induction-program-module-2026-06-27.md` (the induction module itself)

---

## 1. Problem

Freshers in the admission funnel (`lifecycle_status` = `enquiry`, `enquiry_submitted`,
`reserved`, `admitted`) must be able to **log in with their institution email and reach
ONLY the Induction experience (My Induction + its per-session feedback) and complete their
profile — before they are onboarded.** Everything else stays closed until they become `active`.

Today they are blocked at **three** layers:

1. **OAuth auto-provision** (`app/auth/callback/route.ts` ~L389) only creates a student
   profile when a `learners_profiles` row matches `college_email` AND
   `lifecycle_status IN ('approved','active','graduated')`.
2. **DB trigger** `auto_link_profile_to_approved_learner` links the new profile to the
   learner only for the same 3 statuses (and sets `role='student'`, `learner_id`,
   institution/department, `profile_completed=true`).
3. **Lifecycle validation** `StudentValidationService.validateStudentAccess` (run in both
   `proxy.ts` and the callback) allows only `['active','graduated']`; all else is signed out.

Plus a **data wall**: of 1,171 target learners, only 1 has `college_email` set (363 have
`student_email`), and ~0 have auth accounts.

## 2. Decisions (confirmed 2026-06-29)

| # | Decision | Choice |
|---|---|---|
| 1 | Login mechanism | **Google OAuth** — populate `college_email` + widen the auto-provision gate so a student profile is created on first sign-in. |
| 2 | Eligible statuses | **All four:** `admitted`, `reserved`, `enquiry_submitted`, `enquiry`. |
| 3 | Allowed surface | **My Induction + per-session feedback + profile completion** (`/learners/my-induction`, `/learners/my-profile`, `/auth/complete-profile`). Everything else redirects to My Induction. |
| 4 | Feedback | **Existing per-session 1–5 rating + comment** (already inside My Induction). No new feedback module. |
| 5 | Architecture | **Approach A** — keep `role='student'`, add a restricted `induction_only` access tier. (Rejected Approach B "dedicated role" — higher blast radius, requires role-flip at onboarding.) |
| 6 | Email source | **Spreadsheet import** into `college_email` (user provides the file). |
| 7 | Google accounts | **All eligible learners already have @jkkn.ac.in Workspace accounts.** Pure code + data-mapping change. |

## 3. Verified facts (the substrate)

- `fn_induction_auto_enroll` enrolls `lifecycle_status NOT IN ('graduated','exited','inactive','rejected','alumni')` for the institution+academic-year — **the 4 target statuses are already eligible**; no enrollment change needed (coordinator just runs auto-enroll).
- `fn_induction_my_enrollments` / `get_my_learner_id()` resolve the caller via `profiles.learner_id` with **no lifecycle gate** — learner-facing reads work once the profile link exists.
- `auto_link_profile_to_approved_learner` is a BEFORE-INSERT trigger on `profiles`; the callback inserts the profile and the trigger links it. **Both gate on the same status list — they must widen together.**
- ProfileNudge in My Induction links to `/learners/my-profile` (whitelist must include it).
- `/auth/complete-profile` is already in `PUBLIC_PATHS_SET` (always reachable).

## 4. Design — changes by layer

### 4.1 Provisioning gates (let them log in)
- **`app/auth/callback/route.ts`** (~L389): extend the approved-learner `.in('lifecycle_status', [...])` list to include `'admitted','reserved','enquiry_submitted','enquiry'`. Define the eligible-status list as a shared constant so callback + service + trigger stay in sync.
- **Migration** — `CREATE OR REPLACE` `auto_link_profile_to_approved_learner` widening its `lifecycle_status IN (...)` to the same 8-status union. Keep all other behavior (sets `role='student'`, `learner_id`, institution/department, `full_name`, `profile_completed=true`). Mirror into `supabase/setup/04_triggers.sql` / `02_functions.sql`.

### 4.2 Lifecycle validation (`lib/services/auth/student-validation-service.ts`)
- Fix the stale `LifecycleStatus` union to match the live DB enum (add `enquiry`, `enquiry_submitted`, `reserved`, `account`).
- Extend `StudentValidationResult` with `accessTier: 'full' | 'induction_only'`.
- Logic: `active`/`graduated` → `{ allowed:true, accessTier:'full' }`; the 4 pre-onboarding statuses → `{ allowed:true, accessTier:'induction_only' }`; everything else → blocked (unchanged). Keep `getErrorMessage`/reason codes for the still-blocked statuses.

### 4.3 Route restriction (`proxy.ts`) — the core
- Define `INDUCTION_ONLY_ALLOWED` (exact + prefix): `/learners/my-induction`, `/learners/my-profile`, `/auth` (login/callback/logout/complete-profile), `/unauthorized`, `/error`.
- In the `role === 'student'` branch, after `validation.allowed` is true, if `validation.accessTier === 'induction_only'` and the path is not in `INDUCTION_ONLY_ALLOWED` → `redirect('/learners/my-induction')`. Default-deny (anything not whitelisted redirects), so a future new route can't silently leak.
- Place the check so it also catches `/` (dashboard) → My Induction.

### 4.4 Post-login landing (`app/auth/callback/route.ts`)
- For `accessTier === 'induction_only'`, set `destination = '/learners/my-induction'` (instead of `/`).

### 4.5 Navigation (cosmetic; proxy is the real gate)
- **`hooks/use-auth-provider.tsx`**: it currently selects `profiles.*` only. Add the learner's `lifecycle_status` (lightweight join/extra read on `learners_profiles` keyed by `profile.learner_id`) and expose `isInductionOnly` from the auth context/`useAuth()`.
- **`lib/sidebarMenuLink.ts`** (`GetRoleBasedPages`, student branch): when `isInductionOnly`, return only **My Induction** + **My Profile** (and Dashboard rewritten/hidden as appropriate).

### 4.6 Data — `college_email` importer
- A `scripts/` one-off (XLSX → `learners_profiles.college_email`) keyed on a stable identifier present in both the sheet and the DB (roll/register number, application no., or existing `student_email`). The exact join key is read from the provided spreadsheet header.
- Only sets `college_email` where currently empty, for the 4 eligible statuses. Idempotent; logs unmatched rows.
- **Blocked on receiving the spreadsheet.**

## 5. Build sequence
1. Shared eligible-status constant + migration widening `auto_link_profile_to_approved_learner` (+ mirror to `supabase/setup/`).
2. `student-validation-service.ts` — type fix + `accessTier`.
3. `proxy.ts` (restriction + `/` redirect) and `callback/route.ts` (gate widening + landing).
4. `use-auth-provider.tsx` (`isInductionOnly`) + `sidebarMenuLink.ts` (nav filter).
5. `college_email` importer; run once the sheet arrives.
6. Verify (see §6).

## 6. Verification (no test suite — verify by diagnostics + browser)
- `mcp__ide__getDiagnostics` clean on every touched file.
- DB: pick one `reserved` learner, set `college_email` to a test @jkkn.ac.in account; sign in with that Google account → lands on `/learners/my-induction`.
- Confirm: visiting `/`, `/users`, `/billing/*`, etc. all redirect to `/learners/my-induction`; `/learners/my-profile` + `/auth/complete-profile` reachable.
- Confirm enrolled induction renders (coordinator runs auto-enroll for that institution+year first); per-session rating submit works.
- Flip that learner to `active` → full student access returns with no other change (the auto-graduation property).
- `npm run check:menus` / nav reachability gates if sidebar entries changed.

## 7. Risks & dependencies
- **Default-deny discipline** in the proxy whitelist is load-bearing — a permissive check would hand a pre-onboarding learner full student access. Whitelist, never blacklist.
- **`profile_completed=true`** is set by the trigger on link, so these learners skip the complete-profile wizard and land in induction (intended); detailed profile is driven by the induction nudge → My Profile.
- **Auto-enroll prerequisite:** target learners need `institution_id` + `academic_year_id` set, and an induction event must exist for that institution+year, or My Induction shows the empty state.
- **External dependency:** the `college_email` spreadsheet (user) + real Google Workspace accounts (confirmed present).
- Keep the eligible-status list in ONE place (callback, service, trigger all reference it) to avoid the classic 4-layer drift.

## 8. Out of scope
- No new feedback module (per-session rating already exists).
- No change to coordinator/admin induction pages.
- No change to the onboarding/account-transition that flips learners to `active`.
- No new login mechanism (Google OAuth retained).
