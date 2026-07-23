# Staff Bulk-Upload Support for Labour / View-Only Employees

**Date:** 2026-05-15
**Author:** Boobalan (aiahs@jkkn.ac.in)
**Status:** Approved — ready for implementation plan
**Module:** Staff (`app/(routes)/staff/list/_components/bulk-upload-staff.tsx`)

---

## 1. Problem

The Staff bulk-upload feature currently requires a personal email and (via a service-layer fallback) an institution email on every row. That works for teaching staff and white-collar non-teaching staff, but it breaks for **labour-grade employees** — drivers, security guards, cooking masters, cleaners, attenders, hostel staff, transport workers — who in practice have **no institutional `@jkkn.ac.in` email and often no personal email either**. HR still needs them in the staff master for payroll, attendance, leave approvals, and reporting, but they must **never be able to log in** to MyJKKN.

Today, the workaround is a fabricated `@jkkn.ac.in` placeholder email — error-prone, hard to identify in reports, and indistinguishable from real users.

### Evidence (from current DB, 2026-05-15)

- 594 total staff rows; **zero have NULL/blank email** (NOT NULL has held).
- 60+ rows already follow the "no-login" pattern implicitly: `driver` (30 rows), `gate_security` (13), `housekeeping_staff`, `warden`, `office_assistant`, `mess_caterer` — all `is_pre_registered=true` and **0 rows present in `auth.users`**.
- 25 non-teaching `employment_categories` exist: `Driver`, `Security`, `Maintenance`, `Cooking Master`, `Hostel`, `Transport`, `Warden`, `Attender`, `Civil Supervisor`, `Office Assistant`, `Lab Assistant`, `Library`, `Typist`, `HR`, `Accounts`, etc. About half are labour-grade.

---

## 2. Constraints Discovered

These are the hard rails the design must respect:

1. **`staff.email`** — `NOT NULL`, UNIQUE (`staff_email_key`).
2. **`staff.institution_email`** — `NOT NULL`, UNIQUE (`staff_institution_email_key`).
3. **`profiles.email`** — UNIQUE (`profiles_email_unique`).
4. **`staff.role_key`** — `NOT NULL`, FK to `custom_roles`, default `'faculty'`.
5. **Trigger `trg_sync_staff_to_profiles`** auto-creates a `profiles` row keyed off `institution_email`. Writes `profiles.role = staff.role_key` and sets `staff.profile_id`. Skips profile creation only when `institution_email` is NULL/blank.
6. **Trigger `lowercase_institution_email`** lowercases `institution_email` BEFORE INSERT.
7. **Login mechanism:** Google OAuth on `@jkkn.ac.in` domain → matches `profiles.email`. Any non-`@jkkn.ac.in` profile email cannot login at all.
8. **Existing validation** in `bulk-upload-staff.tsx` requires `row.email`; `institution_email` is optional but, when blank, the service falls back to `institution_email: row.institution_email || row.email` (line 908) — so personal email gets reused.
9. **Many downstream FKs** point at `staff.profile_id` / `profiles.id`: HR forms (`assignee_profile_id`), audit trails (`created_by`), leave approvers, attendance records, `user_roles`. Dropping the profile row for labour staff would cascade rewrites.

---

## 3. Design

### 3.1 Core idea

Introduce a per-row **`login_enabled`** flag (default derived from category, override per row). When `false`:

- **Both email fields** become optional on the Excel and form.
- Server **auto-generates unique, deterministic synthetic emails** at the `@nolog.jkkn.local` domain so DB NOT NULL/UNIQUE constraints stay intact without schema relaxation.
- The `profiles` row **is still created** (preserves FK reachability everywhere) but is marked `is_active=false`, and a new `is_login_disabled=true` flag is set.
- Google OAuth at `@jkkn.ac.in` cannot match the `@nolog.jkkn.local` email, so the row is unreachable from the login flow regardless.

Three independent fences against accidental login:
1. Synthetic email domain (`@nolog.jkkn.local`) — Google OAuth cannot match it.
2. `profiles.is_active = false` — auth middleware already rejects inactive profiles.
3. `profiles.is_login_disabled = true` (explicit, new) — used by future audit & permission RPCs.

### 3.2 Excel signal — hybrid

A new optional column `login_enabled` (values: `true` / `false` / blank).

- **If blank:** derive from `employment_categories.allows_login`.
- **If present:** value wins.

**Category seeding policy (decided 2026-05-15 with user):**
ALL employment categories default to `allows_login = true` after this migration. The user will manually toggle specific labour categories (Driver, Security, etc.) to `false` in the Staff → Categories admin UI after deployment. Rationale: avoids hardcoded category-name assumptions that drift as new categories are added; keeps the migration data-neutral and reversible.

A small UI addition is required on the Category management page so the user can flip this flag — see §3.10.

### 3.3 Database changes

```sql
-- 1. New per-row flag on staff
ALTER TABLE staff
  ADD COLUMN login_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. New per-category default
ALTER TABLE employment_categories
  ADD COLUMN allows_login BOOLEAN NOT NULL DEFAULT true;

-- 3. New explicit profile flag
ALTER TABLE profiles
  ADD COLUMN is_login_disabled BOOLEAN NOT NULL DEFAULT false;

-- No category seeding — user will toggle allows_login per category
-- via the Category management UI (see §3.13) after deployment.
```

### 3.4 Synthetic email generator

Server-side helper, **deterministic** so re-upload of the same row generates the same email (idempotent):

```ts
// lib/services/staff/synthetic-email.ts
export const NOLOG_DOMAIN = 'nolog.jkkn.local';

export function generateSyntheticEmail(
  kind: 'personal' | 'institution',
  staffId: string | null,
  phone: string,
): string {
  const digits = phone.replace(/\D/g, '');
  const slug = staffId?.toLowerCase().replace(/[^a-z0-9]/g, '') || digits.slice(-10);
  if (!slug) throw new Error('Cannot generate synthetic email — need staff_id or phone');
  return `staff.${slug}.${kind}@${NOLOG_DOMAIN}`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${NOLOG_DOMAIN}`);
}
```

### 3.5 Trigger amendment

Modify `sync_staff_to_profiles` — add **one branch** after the profile is created/updated:

```sql
-- inside sync_staff_to_profiles, after the INSERT/UPDATE on profiles:
IF NEW.login_enabled = false THEN
  UPDATE profiles
  SET is_active = false,
      is_login_disabled = true
  WHERE id = NEW.profile_id;
END IF;
```

No change to the existing main flow. The profile is still created/updated; only the activation state is flipped for no-login rows.

### 3.6 Bulk-upload TypeScript changes

In `validateRow()` (`bulk-upload-staff.tsx`):

1. Accept a new param `categoryAllowsLoginMap: Map<string, boolean>`.
2. After category resolution, compute the effective `login_enabled`:
   ```ts
   const categoryAllowsLogin = categoryAllowsLoginMap.get(valid_category_id) ?? true;
   const loginEnabledRaw = String(row.login_enabled ?? '').toLowerCase().trim();
   const loginEnabled =
     loginEnabledRaw === '' ? categoryAllowsLogin :
     loginEnabledRaw === 'true' || loginEnabledRaw === '1' || loginEnabledRaw === 'yes';
   ```
3. Email validation becomes conditional:
   - **If `loginEnabled === true`:** existing rules — `email` required, `institution_email` (if provided) must end with `@jkkn.ac.in`.
   - **If `loginEnabled === false`:** `email` optional; `institution_email` optional. If either is provided, format-validate it but **reject `@nolog.jkkn.local`** (users must not write synthetic values manually).
4. Phone **stays required** regardless (used as the slug fallback for synthetic emails).
5. Pass `loginEnabled` through into the row object so `handleUpload()` can forward it.

In `handleUpload()`, before `StaffService.createStaff()`:

```ts
const loginEnabled = row.loginEnabled ?? true;
const finalEmail = row.email || (loginEnabled ? null : generateSyntheticEmail('personal', row.staff_id, row.phone));
const finalInstEmail = row.institution_email || (loginEnabled ? row.email : generateSyntheticEmail('institution', row.staff_id, row.phone));
const staffData = {
  ...,
  email: finalEmail,
  institution_email: finalInstEmail,
  login_enabled: loginEnabled,
};
```

### 3.7 Single-add staff form changes

`staff-form-tabs/basic-tab.tsx`:

1. New `Switch` field: **"Login user — can sign in to MyJKKN with Google"** (default `true`).
2. When the category dropdown changes, the switch's default flips to the category's `allows_login` (only if the user hasn't manually toggled it).
3. When switch is `false`:
   - Personal email + institution email inputs become disabled, placeholder text: `"Auto-generated for view-only staff"`.
   - Phone field gets a help-text: `"Required — used to generate a unique system identifier"`.
4. On submit, `StaffService.createStaff()` receives `login_enabled` along with possibly-blank emails; service applies the same synthetic-email logic.

### 3.8 Download-template changes

`download-staff-template.tsx`:

- Add `login_enabled` column to both `ID_BASED_SAMPLE_DATA` and `NAME_BASED_SAMPLE_DATA` (sample value: `''` blank).
- Add `V` to `COLUMN_WIDTHS` for the new column.
- Add Excel data validation for `login_enabled` column: `"true,false,"` (list).
- New section in the **Instructions** sheet: **"View-Only / Labour Staff"** explaining:
  - When `login_enabled=false`, email fields can be left blank.
  - Phone is still required.
  - The listed categories (Driver, Security, etc.) default to `false` automatically.
- Add one extra row to the **Filled Example** sheet showing a labour row: e.g., category `Driver`, `login_enabled=false`, blank emails, populated name/phone/staff_id/dob/doj.
- Add a new section to the Instructions: list the categories with their `allows_login` flag (similar to how `is_teaching` is already shown).

### 3.9 Staff list UI

`staff-list.tsx`:

1. New column or inline badge: **"View-only"** pill on rows where `login_enabled=false`. Style: gray/muted to differentiate from active staff.
2. Filter dropdown: add a "Login users / View-only / All" toggle next to the existing active/inactive filter.
3. The existing export route should map synthetic emails (`isSyntheticEmail()`) to display as `—` or `View-only` rather than the literal `staff.xxx@nolog.jkkn.local` value.

### 3.10 Category management UI — `allows_login` toggle

`app/(routes)/staff/category/_components/category-form.tsx` and `category-list.tsx`:

1. Add an `allows_login` `Switch` field to the category create/edit form (label: **"New staff in this category can log in to MyJKKN by default"**, helper text: `"When off, staff added via bulk upload or single-add will default to 'view-only' (no login). Users can still override per row."`).
2. Add a small badge on the category list (`category-list.tsx`) showing `"Login default: OFF"` for categories where `allows_login=false`.
3. Update `CategoryService` (`lib/services/staff/category-service.ts`) to read/write the new column.

This is the **only UI** the user will need to flag a category as labour-grade after the feature ships.

### 3.11 Service layer changes

`lib/services/staff/staff-service.ts`:

- `CreateStaffDto` adds optional `login_enabled?: boolean` (default `true`).
- `createStaff()`:
  - If `login_enabled === false` and emails are missing, call `generateSyntheticEmail()` for both.
  - Still run the existing uniqueness checks (the deterministic generator guarantees the synthetic emails are unique per staff_id/phone).
  - Skip the toast message "User can now login with Google" when `login_enabled=false`; show `"View-only employee added — no login created"` instead.

### 3.12 What does NOT change

- DB unique constraints on `staff.email`, `staff.institution_email`, `profiles.email` — preserved via deterministic synthetic values.
- Existing trigger main shape — only one branch added.
- Permission plumbing (`role_key` → `user_roles` → `custom_roles`) — unchanged.
- API route auth/permission checks — unchanged.
- Existing 594 staff rows — unchanged (no backfill required, optional in §3.12).

### 3.13 Optional backfill (recommended, separate ticket)

After deployment, run a one-time backfill to flip `login_enabled=false` for historical labour staff:

```sql
-- Heuristic: pre-registered profile + no auth.users row + non-teaching labour category
UPDATE staff s
SET login_enabled = false
FROM profiles p
LEFT JOIN auth.users u ON u.id = p.id
JOIN employment_categories c ON c.id = s.category_id
WHERE s.profile_id = p.id
  AND p.is_pre_registered = true
  AND u.id IS NULL
  AND c.allows_login = false
  AND s.created_at < NOW() - INTERVAL '60 days';
```

This is purely cosmetic — for cleaner reports and filter accuracy. Skipping it has no functional impact.

---

## 4. Risks & Verifications

| Risk | Mitigation | Verify how |
|---|---|---|
| HR notification templates email `@nolog.jkkn.local` addresses | All notification senders check `isSyntheticEmail()` or `staff.login_enabled` before sending | Grep `lib/services/*/notification` and HR WhatsApp/email senders during implementation |
| `user_has_permission()` RPC might still grant perms to inactive profiles | Audit RPC; add `AND p.is_active = true` clause if missing | `mcp__supabase__execute_sql` to read the RPC body and patch in same migration |
| Faculty/incharge pickers may show labour staff | Picker queries already filter `is_active=true` — verify each picker | Grep usages of `staff` table in dropdowns and confirm `is_active` filter |
| Export route renders synthetic emails literally | Map via `isSyntheticEmail()` to `—` in CSV/XLSX export | Manual test export after implementation |
| Re-upload of same labour row generates duplicate-email error | Synthetic generator is deterministic on (staff_id, phone, kind) | Unit test for `generateSyntheticEmail()` |
| Single-add form race when category changes after switch toggle | Track `hasUserManuallyToggled` ref; only auto-flip if user hasn't touched it | Manual UI test |

---

## 5. File Inventory

Files that will be modified or created in implementation:

**Database (new migration):**
- `supabase/migrations/2026XXXXXXXX_staff_login_enabled.sql` (new)
- `supabase/setup/02_functions.sql` (update `sync_staff_to_profiles` body)

**Service layer:**
- `lib/services/staff/synthetic-email.ts` (new)
- `lib/services/staff/staff-service.ts` (extend `CreateStaffDto`, `createStaff()`)

**UI — bulk upload:**
- `app/(routes)/staff/list/_components/bulk-upload-staff.tsx` (validation + handleUpload)
- `app/(routes)/staff/list/_components/download-staff-template.tsx` (add column, instructions, example)

**UI — single-add form:**
- `app/(routes)/staff/list/_components/staff-form-tabs/basic-tab.tsx` (new Switch + email field disabling)
- `app/(routes)/staff/list/_components/staff-form.tsx` (forward `login_enabled` to service)

**UI — staff list:**
- `app/(routes)/staff/list/_components/staff-list.tsx` (View-only badge, filter)

**UI — category management (NEW):**
- `app/(routes)/staff/category/_components/category-form.tsx` (add `allows_login` Switch)
- `app/(routes)/staff/category/_components/category-list.tsx` (show "Login default: OFF" badge)
- `lib/services/staff/category-service.ts` (read/write `allows_login` column)

**API:**
- `app/api/staff/route.ts` (POST — accept `login_enabled`, pass through to insert)
- `app/api/staff/[id]/route.ts` (PATCH — same)
- `app/api/staff/export/route.ts` (mask synthetic emails in CSV/XLSX)

**Types:**
- `types/staff.ts` (`Staff` type adds `login_enabled: boolean`)

**Tests (optional, project doesn't require):**
- Unit test for `generateSyntheticEmail()` deterministic output
- Integration: bulk-upload one teaching + one labour row end-to-end

---

## 6. Acceptance Criteria

1. Bulk-upload a row with category `Driver`, `login_enabled` blank, no emails, valid phone+name → succeeds; staff appears in list with "View-only" badge; profile exists with `is_active=false`; cannot log in via Google.
2. Bulk-upload a row with category `Driver`, `login_enabled=true`, valid `@jkkn.ac.in` institution_email → succeeds; profile is `is_active=true`; user can log in.
3. Bulk-upload a row with category `Teaching` and no email → fails with clear error (login_enabled defaults to true from category).
4. Re-uploading the same labour row twice → first succeeds, second fails with "Staff ID already exists" or "Email already exists" (synthetic generator is deterministic → same email → uniqueness blocks duplicate).
5. Single-add form: toggling switch off and selecting `Teaching` category → switch can be manually re-toggled but doesn't auto-flip back.
6. Single-add form: changing category from `Teaching` to `Driver` without manual toggle → switch auto-flips to off.
7. Exporting staff list returns `—` (or "View-only") instead of `staff.xxx@nolog.jkkn.local` for synthetic-email rows.
8. HR forms that pick approvers/assignees do NOT show no-login staff (filtered by `profiles.is_active=true`).

---

## 7. Out of Scope

- Mass-converting all existing 60+ implicit-labour staff (covered as optional §3.12).
- Changing the OAuth provider or login flow itself.
- Adding a "labour" sub-table separate from `staff` — overkill; current schema with `login_enabled` is sufficient.
- WhatsApp / SMS-based identity verification for labour staff (future ticket).
- Allowing labour staff to log in through a different mechanism (e.g., phone OTP) — design explicitly forbids this path.

---

## 8. Approvals

- **Designer/Author:** Boobalan — 2026-05-15
- **Approved by user:** 2026-05-15 ("ok fine proceed")
- **Next step:** Write implementation plan via `writing-plans` skill once user re-reviews this spec.
