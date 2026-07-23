# My Hostel — Resident Self-Service Module (Spec)

- **Date:** 2026-05-31
- **Module:** Campus Living → `my-hostel`
- **Status:** Design approved; awaiting implementation-plan confirmation
- **Author:** Boobalan (with Claude)

## 1. Problem & Goal

Campus Living is built for wardens / hostel office / chief warden. A hosteler (a
student who lives in a hostel) has no clean, own-scoped place to see *their* hostel
details. The existing `/campus-living/my-hostel` page only shows an active
allocation + vacate flow, is not access-gated, and relies on an admin permission to
read data.

**Goal:** A resident-only "My Hostel" area where a **hosteler** can view their own
hostel category, fee structure, allocation (if any), and request history, and manage
their own emergency/medical profile and self-service requests — and **only**
hostelers see it.

## 2. Key Findings (current state — verified against the live DB)

1. **`hostel_allocations` is EMPTY (0 rows).** Gating "My Hostel" on an *active
   allocation* (what `useIsHostelResident` and the current page do) would lock out
   everyone. The real population lives on `learners_profiles`.
2. **Identity bridge = `profiles.learner_id`.** `learners_profiles.id` ≠
   `profiles.id` (0 overlap). The logged-in user (`auth.uid()` = `profiles.id`)
   reaches their learner record via `profiles.learner_id → learners_profiles.id`
   (4,698/4,698 valid). The SECURITY DEFINER resolver **`get_my_learner_id()`**
   already exists (`SELECT learner_id FROM profiles WHERE id = auth.uid()`).
3. **Accommodation signal:** `learners_profiles.accommodation_type_id →
   accommodation_types(id)`; trustworthy code is `accommodation_types.code='hostel'`
   (duplicated per-institution — must match on **code**, never a single id). Raw
   `learners_profiles.accommodation_type` text is dirty (`HOSTEL`, `HOSTELLER`,
   `HOSTLER`, `''`, `NA`, …) → used only as a fallback.
4. **Target population:** 769 student-role hostelers (767 by clean code + 2 by text)
   vs ~3,900 day-scholars/PG. The gate cleanly separates them.
5. **`student` role is over-permissioned:** 1,137 keys (≈ administrator), including
   144 campus_living **admin** keys (`allocations.create`, `blocks.warden_assign`,
   `wardens.assign`, `fees.config`, …). This is why the current page "works" — and
   why a student would see the full warden admin nav.
6. **Hostel data already on the learner record:** `learners_profiles.hostel_category_id`
   (→ `hostel_categories`), `hostel_fee`, `mess_category_id` (→ `mess_categories`).
7. **RLS already present:** `learners_profiles` own-read (`students_view_own_learner_profile`),
   `hostel_categories` / `hostel_category_fees` / `mess_categories` open to
   authenticated, `hostel_vacate_requests` `view_own` branch.
8. **RLS gaps:** `hostel_leave_requests` and `hostel_gate_passes` are admin-only (no
   `view_own`); `learner_hostel_profiles` has no own read/edit branch;
   `hostel_allocations` has no own branch.

## 3. Access Model

Effective access to My Hostel =

```
hasPermission('campus_living.my_hostel.view')   -- the role MAY have it
AND user_is_hosteler()                            -- this user qualifies
```

`user_is_hosteler()` — **new** `STABLE SECURITY DEFINER` fn, `search_path=public`,
built on `get_my_learner_id()`:

```sql
CREATE OR REPLACE FUNCTION public.user_is_hosteler()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM learners_profiles lp
    LEFT JOIN accommodation_types at ON at.id = lp.accommodation_type_id
    WHERE lp.id = public.get_my_learner_id()
      AND (at.code = 'hostel' OR lp.accommodation_type ILIKE 'hostel%')
  );
$$;
```

A day-scholar student carries the key but the gate fails → never sees the module.
Exposed to the client via a `useIsHosteler()` hook (RPC or direct, RLS-safe).

## 4. Permissions & Role Grants (migration)

**New keys** in `lib/constants/permissions.ts` (`campus_living` module):

- `campus_living.my_hostel.view` — module entry gate
- `campus_living.allocations.view_own`
- `campus_living.fees.view_own`
- `campus_living.profile.view_own`
- `campus_living.profile.edit_own`

**Resident bundle granted to `student` role** (≈ 15 keys; reused keys already in catalog):

```
campus_living.view
campus_living.my_hostel.view
campus_living.allocations.view_own
campus_living.fees.view_own
campus_living.profile.view_own
campus_living.profile.edit_own
campus_living.vacate_requests.view_own
campus_living.vacate_requests.submit
campus_living.leave.view_own
campus_living.leave.request
campus_living.gate_passes.view_own
campus_living.gate_passes.create
campus_living.premium.pick_room
campus_living.premium.invite_roommate
campus_living.premium.view_dashboard
```

**`student` role JSONB rewrite — campus_living namespace ONLY:** remove the 144
admin campus_living keys, set exactly the bundle above. Done via migration
(`custom_roles.permissions` minus the admin keys, `||` the bundle). **Other modules'
student perms untouched** (separate audit, out of scope). `super_admin`/`admin`
bypass RLS, so they keep full visibility for support.

> ⚠️ Four-layer move (known gotcha): role JSONB + `MENU_PERMISSIONS` + RLS +
> page guards must flip in the same change. Removing `allocations.view` from
> `student` REQUIRES the `allocations.view_own` RLS branch in the same migration.

## 5. RLS Changes

| Table | Today | Change |
|---|---|---|
| `learners_profiles` | ✅ own-read exists | none |
| `hostel_categories`, `hostel_category_fees`, `mess_categories` | ✅ open | none |
| `hostel_vacate_requests` | ✅ `view_own` | none |
| `hostel_leave_requests` | ❌ admin-only | add `view_own` SELECT (`learner_id = auth.uid()` / `get_my_learner_id()`) + own INSERT gated by `leave.request` |
| `hostel_gate_passes` | ❌ admin-only | add `view_own` SELECT + own INSERT gated by `gate_passes.create` |
| `learner_hostel_profiles` | ❌ admin-only | add own SELECT + own UPDATE/INSERT (`learner_id = get_my_learner_id()`), gated by `profile.view_own` / `profile.edit_own` |
| `hostel_allocations` | ❌ no own branch (empty) | add `view_own` SELECT branch (`learner_id = auth.uid()`) gated by `allocations.view_own` |

Verify exact `learner_id` semantics per table before writing (allocations/vacate use
`profiles.id = auth.uid()`; leave/gate-pass/learner_hostel_profiles may use
`learners_profiles.id = get_my_learner_id()`). All SQL committed to
`supabase/migrations/` and mirrored into `supabase/setup/03_policies.sql` /
`02_functions.sql`.

## 6. UI — My Hostel Hub

Rebuild `app/(routes)/campus-living/my-hostel/page.tsx` as a **URL-param tabbed hub**
(`?tab=` — avoids Radix eager-render of all tabs), data sourced primarily from
`learners_profiles` (allocations empty):

- **Overview** — accommodation status; current allocation (block/room/bed) if present,
  else category-based summary from `learners_profiles`.
- **My Category & Fees** — `hostel_category_id → hostel_categories`; fee breakdown from
  `hostel_fee` + `hostel_category_fees` (active hostel year); mess category.
- **Requests** — vacate (existing), leave, gate passes: trackers + history + "new" CTAs.
- **Profile & Emergency** — view/edit own emergency contact + medical
  (`learner_hostel_profiles`).

New `useMyHostel()` hook(s) + a `MyHostelService` (or thin additions to existing
services) resolve everything for the current user. Student landing on `/campus-living`
must route to `/campus-living/my-hostel` (the admin dashboard requires
`dashboard.view`, which students won't hold).

## 7. Navigation / Visibility

- Add `/campus-living/my-hostel*` to `MENU_PERMISSIONS` → `campus_living.my_hostel.view`.
- Admin "Residents" bucket chips already map to admin keys the trimmed `student` role
  won't hold → they vanish for students automatically.
- Page-level client guard via `useIsHosteler()`: a day-scholar who guesses the URL
  gets a clean "not a resident" state (defense-in-depth on top of RLS).

## 8. Phasing

- **P1 — Access spine:** `user_is_hosteler()`, new permission keys, `student` JSONB
  rewrite, RLS own-branches, `MENU_PERMISSIONS`, `useIsHosteler()` + page guard.
  *(Delivers correct gating, verifiable in isolation.)*
- **P2 — Read hub:** tabbed Overview + My Category & Fees; student landing redirect.
- **P3 — Requests + Profile:** leave/gate-pass own views + self-service actions;
  editable emergency/medical.

## 9. Out of Scope

`student` role's non-campus_living over-grants; seeding `hostel_allocations`; payment
gateway; parent portal; mess booking surfaces.

## 10. Verification

- `mcp__ide__getDiagnostics` on every touched file.
- `npm run check:menus` + `npm run check:reachability` (routes/keys touched).
- **RLS impersonation** (`BEGIN; SET LOCAL request.jwt.claims = '{"sub":"<uuid>"}'; …
  ROLLBACK;`) for (a) a hosteler — sees only own rows; (b) a day-scholar — gate fails,
  no rows; (c) a warden — unaffected.
- Browser walkthrough as a real hosteler vs a day-scholar.

## 11. Risks

- Removing admin campus_living keys from `student` could surprise any student-role
  account currently (incorrectly) relying on them — acceptable; they shouldn't have had
  them. Mitigated by phasing + impersonation tests.
- `learner_id` semantics differ per table — must be verified per policy, not assumed.
- Allocations empty → Overview's room/bed card is empty until allocations are seeded;
  design must degrade gracefully to the category-based summary.
