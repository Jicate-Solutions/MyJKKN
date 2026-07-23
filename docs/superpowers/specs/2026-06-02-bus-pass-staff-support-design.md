# Bus Pass Request — Staff Support (Learner OR Staff)

**Date:** 2026-06-02
**Status:** Design approved (proceeding to plan + implementation)
**Builds on:** [2026-06-02 Bus Pass Request](2026-06-02-bus-pass-request-transport-approval-profile-sync-design.md) (shipped, PR #1211)

## Goal
Let **staff** (not just learners) submit a Bus Pass Request. Add a read-only **Passenger Type** indicator (Learner / Staff), mirror the transport columns onto the `staff` table, and route the on-approval sync to the correct table by the requester's real identity. The TMS app then reads bus-needing staff from `staff WHERE bus_required = true`, same as learners.

## Decisions (locked)
1. **Passenger type = auto-detected**, shown read-only; the approval RPC routes by identity (form value is informational only).
2. **All staff roles** eligible (every distinct `staff.role_key` + `student` + `super_admin`).

## Key facts (verified)
- Learner link: `profiles.learner_id → learners_profiles.id`. Staff link: `staff.profile_id → profiles.id` (FK confirmed). `staff.id` = row PK; `staff.staff_id` = human text code (do NOT use for FK).
- `learners_profiles.transport_route_id`/`transport_stop_id` are FKs to `tms_route`/`tms_route_stop` — mirror these on `staff`.
- `staff` has **no** transport columns yet. 23 distinct staff role_keys today (dynamic set).
- `useAuth().profile` is `select('*')` of `profiles`, so `profile.learner_id` is available client-side at runtime.
- The sync RPC `sync_bus_pass_to_learner_profile` is already hardened (caller must hold `service_requests.approve`/super-admin AND request must be `approved`/`fulfilled`) and called from `handleApproved` for `slug='transport-request'`.

## Design

### 1. `staff` transport columns (migration)
Add `bus_required boolean NOT NULL DEFAULT false`, `transport_route_id uuid REFERENCES tms_route(id) ON DELETE SET NULL`, `transport_stop_id uuid REFERENCES tms_route_stop(id) ON DELETE SET NULL` — mirroring `learners_profiles`.

### 2. `passenger_type` field type (auto-detected, read-only)
- Add `passenger_type` to `ServiceFieldType` (TS union + zod `field_type` enum) and the `service_field_type` Postgres enum (own migration — enum value can't be used in the txn that adds it).
- `PassengerTypeFieldControl` in `dynamic-request-form.tsx`: a read-only badge "Applying as: Learner/Staff", auto-detected via `useAuth()` (`profile?.learner_id ? 'learner' : 'staff'`), written to `form_data.passenger_type` on mount. `buildDynamicSchema`: optional string.
- Seeded as the first field (`display_order` 0) on the `transport-request` type.

### 3. Sync RPC routes by identity (migration, CREATE OR REPLACE)
Keep the name `sync_bus_pass_to_learner_profile` (called from `handleApproved`). After the existing authz + state + route/stop-existence guards, branch:
- `SELECT learner_id` from `profiles` for the requester → if non-null, UPDATE `learners_profiles` (current behavior).
- else `SELECT id FROM staff WHERE profile_id = requester` → if found, UPDATE that `staff` row (`bus_required=true`, `transport_route_id`, `transport_stop_id`, `updated_at=now()`).
- else → logged no-op.
Routing is by identity, NOT by `form_data.passenger_type`, so a tampered field cannot misroute the write. Mirror into `supabase/setup/02_functions.sql`.

### 4. Eligibility — widen `allowed_roles` (migration)
`UPDATE service_types SET allowed_roles = <deduped(all distinct staff.role_key) + 'student' + 'super_admin'>` for `slug='transport-request'`. Computed from the staff table at apply time. Caveat: a new custom staff role added later needs a one-line top-up.

### 5. Parity
- `transport-seed.ts`: add the `passenger_type` field (display_order 0) and broaden `allowed_roles` (static representative set incl. `'staff','faculty','student','super_admin'`) for fresh installs.
- `staff` columns aren't read by any TS (sync is SQL via RPC), so no `types/supabase.ts` change required for this feature.

## Edge cases
- A person who is both learner and staff → treated as **Learner** (learner_id checked first), client and server consistent.
- Staff with no `staff` row for their profile (shouldn't happen for a real staff login) → RPC logged no-op.
- Existing learner flow unchanged.

## Out of scope
- `transport_fee` on `staff` (we don't sync fee — matches the learner decision).
- An in-app bus-required report (TMS reads the DB directly).

## Verification
- Lint touched files (0 errors); `getDiagnostics` unavailable in this env → verify by reading.
- Migrations applied to the DB and verified (columns exist + FKs; enum value present; allowed_roles widened; RPC routes).
- Rolled-back transaction tests: (a) staff requester on a fulfilled request → `staff` row updated; (b) learner path still works; (c) unauthorized caller still rejected `42501`.
- Browser: submit as a staff user (badge shows "Staff"), approve as transport head, confirm `staff.bus_required` flips.
