# Staff Bulk-Upload Support for Labour / View-Only Employees — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow HR to add labour-grade staff (drivers, security guards, cooking masters, attenders, etc.) via bulk upload OR single-add form without requiring personal or institutional email — these rows become "view-only" records that cannot log in but stay reachable as foreign-key targets for HR / payroll / attendance.

**Architecture:** Per-row `login_enabled` flag (default derived from category's `allows_login` flag) + deterministic synthetic emails at `@nolog.jkkn.local` to satisfy DB UNIQUE/NOT NULL constraints + amended `sync_staff_to_profiles` trigger that flips `profiles.is_active=false` + new `is_login_disabled=true` on the linked profile. Three independent fences against login: synthetic domain (OAuth can't match), `is_active=false` (middleware rejects), `is_login_disabled=true` (explicit audit flag).

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres + RLS) · React Hook Form · Shadcn UI · Tailwind · `xlsx` library · react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md`

---

## File Structure (Decomposition Map)

| Phase | File | Action | Responsibility |
|---|---|---|---|
| 1 | `supabase/migrations/20260515001000_staff_login_enabled.sql` | Create | Add 3 new columns; amend trigger |
| 1 | `supabase/setup/02_functions.sql` | Modify | Replace `sync_staff_to_profiles` body (mirrors migration) |
| 2 | `lib/services/staff/synthetic-email.ts` | Create | Pure helpers: `generateSyntheticEmail`, `isSyntheticEmail`, `displayEmail` |
| 2 | `types/staff.ts` | Modify | Add `login_enabled` to `Staff` type and DTOs |
| 2 | `lib/services/staff/staff-service.ts` | Modify | Extend `CreateStaffDto`; apply synthetic email in `createStaff()` |
| 2 | `lib/services/staff/category-service.ts` | Modify | Read/write `allows_login` column |
| 3 | `app/(routes)/staff/list/_components/bulk-upload-staff.tsx` | Modify | Conditional email validation; pass `login_enabled` |
| 3 | `app/(routes)/staff/list/_components/download-staff-template.tsx` | Modify | New column + instructions + filled example |
| 4 | `app/(routes)/staff/list/_components/staff-form-tabs/basic-tab.tsx` | Modify | Login Switch; conditional email-field disabling |
| 4 | `app/(routes)/staff/list/_components/staff-form.tsx` | Modify | Forward `login_enabled` to service |
| 4 | `app/(routes)/staff/category/_components/category-form.tsx` | Modify | `allows_login` Switch |
| 4 | `app/(routes)/staff/category/_components/category-list.tsx` | Modify | "Login default: OFF" badge |
| 5 | `app/(routes)/staff/list/_components/staff-list.tsx` | Modify | "View-only" badge + filter |
| 5 | `app/api/staff/route.ts` | Modify | Accept `login_enabled` in POST |
| 5 | `app/api/staff/[id]/route.ts` | Modify | Accept `login_enabled` in PATCH |
| 5 | `app/api/staff/export/route.ts` | Modify | Mask synthetic emails as `—` |

---

## Phase 1 — Database Foundation

### Task 1.1: Create migration file with new columns

**Files:**
- Create: `supabase/migrations/20260515001000_staff_login_enabled.sql`

- [ ] **Step 1: Create the migration file**

Write the file `supabase/migrations/20260515001000_staff_login_enabled.sql`:

```sql
-- Staff Bulk-Upload Support for Labour / View-Only Employees
-- Spec: docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md
-- Adds per-row login_enabled, per-category allows_login default, and
-- per-profile is_login_disabled explicit flag.

BEGIN;

-- 1. Per-row flag on staff. Default true preserves existing behaviour.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.staff.login_enabled IS
  'When false, this staff row is "view-only" — used for HR/payroll/attendance only. '
  'Linked profile is deactivated and synthetic @nolog.jkkn.local emails are used. '
  'Spec: 2026-05-15-staff-bulk-upload-labour-employees-design.md';

-- 2. Per-category default. UI lets user toggle per category; no rows seeded.
ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS allows_login BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.employment_categories.allows_login IS
  'When false, new staff added to this category default to login_enabled=false '
  '(view-only). Per-row override on staff still wins.';

-- 3. Explicit profile flag (additional fence beyond is_active).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_login_disabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_login_disabled IS
  'Set true by sync_staff_to_profiles trigger when the linked staff row has '
  'login_enabled=false. Independent of is_active for audit clarity.';

COMMIT;
```

- [ ] **Step 2: Apply the migration via MCP**

Run via Supabase MCP:
```
mcp__supabase__apply_migration:
  name: "20260515001000_staff_login_enabled"
  query: <contents of the file above>
```

- [ ] **Step 3: Verify schema**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='staff' AND column_name='login_enabled')
       OR (table_name='employment_categories' AND column_name='allows_login')
       OR (table_name='profiles' AND column_name='is_login_disabled'))
ORDER BY table_name, column_name;
```

Expected: 3 rows returned, all `is_nullable=NO`, defaults `true`/`true`/`false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260515001000_staff_login_enabled.sql
git commit -m "feat(staff): add login_enabled flag for view-only labour staff

- staff.login_enabled (default true) gates view-only behaviour per row
- employment_categories.allows_login is the default for new staff
- profiles.is_login_disabled is the explicit audit fence

Spec: docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md"
```

---

### Task 1.2: Update `sync_staff_to_profiles` trigger function

**Files:**
- Modify: `supabase/setup/02_functions.sql` (canonical source for trigger functions)
- Create: `supabase/migrations/20260515001001_sync_staff_to_profiles_login_disabled.sql`

- [ ] **Step 1: Create the trigger-update migration**

Write `supabase/migrations/20260515001001_sync_staff_to_profiles_login_disabled.sql`:

```sql
-- Amend sync_staff_to_profiles to mark profiles inactive + login-disabled
-- when the linked staff row has login_enabled=false.
-- Keeps the profile row (preserves FK chains in HR / attendance / audit).

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    existing_profile_id UUID;
BEGIN
    IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
        -- Priority 1: durable FK survives email rename.
        IF NEW.profile_id IS NOT NULL THEN
            SELECT id INTO existing_profile_id
            FROM profiles WHERE id = NEW.profile_id;
        END IF;

        -- Priority 2: email lookup with deterministic ordering.
        IF existing_profile_id IS NULL THEN
            SELECT p.id INTO existing_profile_id
            FROM profiles p
            WHERE p.email = NEW.institution_email
            ORDER BY
                (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) DESC,
                p.updated_at DESC
            LIMIT 1;
        END IF;

        IF existing_profile_id IS NOT NULL THEN
            UPDATE profiles
            SET email             = NEW.institution_email,
                full_name         = CONCAT(NEW.first_name, ' ', NEW.last_name),
                phone_number      = NEW.phone,
                avatar_url        = COALESCE(NEW.profile_picture, avatar_url),
                institution_id    = NEW.institution_id,
                department_id     = NEW.department_id,
                gender            = NEW.gender,
                designation       = NEW.designation,
                role              = NEW.role_key,
                -- New: view-only staff get is_active=false, is_login_disabled=true
                is_active         = CASE WHEN NEW.login_enabled = false THEN false
                                         ELSE NEW.is_active END,
                is_login_disabled = (NEW.login_enabled = false),
                updated_at        = NOW()
            WHERE id = existing_profile_id;
            NEW.profile_id := existing_profile_id;
        ELSE
            existing_profile_id := gen_random_uuid();
            INSERT INTO profiles (
                id, email, full_name, phone_number, avatar_url,
                institution_id, department_id, gender, designation,
                role, is_pre_registered, is_active, is_login_disabled
            ) VALUES (
                existing_profile_id,
                NEW.institution_email,
                CONCAT(NEW.first_name, ' ', NEW.last_name),
                NEW.phone,
                NEW.profile_picture,
                NEW.institution_id,
                NEW.department_id,
                NEW.gender,
                NEW.designation,
                NEW.role_key,
                true,
                CASE WHEN NEW.login_enabled = false THEN false
                     ELSE NEW.is_active END,
                (NEW.login_enabled = false)
            );
            NEW.profile_id := existing_profile_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMIT;
```

- [ ] **Step 2: Apply via MCP**

```
mcp__supabase__apply_migration:
  name: "20260515001001_sync_staff_to_profiles_login_disabled"
  query: <contents of the file above>
```

- [ ] **Step 3: Verify the trigger function updated**

Run via Supabase MCP `execute_sql`:
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'sync_staff_to_profiles';
```

Expected: returned function body contains `is_login_disabled = (NEW.login_enabled = false)`.

- [ ] **Step 4: Mirror the function body into `supabase/setup/02_functions.sql`**

Find the existing `CREATE OR REPLACE FUNCTION public.sync_staff_to_profiles()` block in `supabase/setup/02_functions.sql` and replace it with the same body used in step 1 (so future fresh-installs match prod). Per project memory: "Placeholder migrations hide column-name typos" — keeping setup/02_functions.sql aligned prevents drift.

- [ ] **Step 5: Smoke-test the trigger with a real INSERT**

Run via Supabase MCP `execute_sql`:
```sql
-- Pick any institution / category to construct a test row
SELECT id FROM institutions LIMIT 1;
SELECT id FROM employment_categories WHERE is_teaching = false LIMIT 1;
```

Then test (substitute the IDs):
```sql
BEGIN;
INSERT INTO staff (
  first_name, last_name, gender, date_of_birth, marital_status,
  email, phone, date_of_joining, designation,
  institution_email, category_id, institution_id, role_key,
  login_enabled
) VALUES (
  'Test', 'Labour', 'male', '1990-01-01', 'single',
  'test.labour@nolog.jkkn.local', '9999999999', '2024-01-01', 'Driver',
  'test.labour@nolog.jkkn.local', '<category_uuid>', '<institution_uuid>', 'driver',
  false
)
RETURNING id, profile_id, login_enabled;

SELECT id, email, is_active, is_login_disabled
FROM profiles
WHERE id = (SELECT profile_id FROM staff WHERE first_name='Test' AND last_name='Labour');

ROLLBACK;
```

Expected: profile row has `is_active=false`, `is_login_disabled=true`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260515001001_sync_staff_to_profiles_login_disabled.sql supabase/setup/02_functions.sql
git commit -m "feat(staff): sync_staff_to_profiles deactivates profile for view-only staff

When staff.login_enabled=false the linked profile is marked is_active=false
and is_login_disabled=true. Three-fence defence against login: synthetic
@nolog.jkkn.local domain (OAuth can't match), is_active=false (middleware
rejects), is_login_disabled=true (explicit audit flag).

Spec: docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md"
```

---

## Phase 2 — Types & Service Layer

### Task 2.1: Synthetic-email helper module

**Files:**
- Create: `lib/services/staff/synthetic-email.ts`

- [ ] **Step 1: Write the module**

Create `lib/services/staff/synthetic-email.ts`:

```ts
/**
 * Synthetic emails for "view-only" / no-login staff (drivers, security, labour, etc.)
 *
 * Why synthetic emails:
 *   public.staff requires email + institution_email both NOT NULL and globally UNIQUE.
 *   For staff who have no real email, we generate deterministic placeholder values
 *   at @nolog.jkkn.local so the DB constraints stay intact and the row is unreachable
 *   from Google OAuth login (which is restricted to @jkkn.ac.in).
 *
 * Determinism: re-running a bulk upload of the same row hits the UNIQUE constraint
 * cleanly because the generator produces the same email for the same (staff_id, phone, kind).
 */

export const NOLOG_DOMAIN = 'nolog.jkkn.local';

/**
 * Generate a deterministic synthetic email for a view-only staff row.
 * Returns `staff.<slug>.<kind>@nolog.jkkn.local`.
 *
 * Slug rule:
 *   - if `staffId` is non-empty, use lowercased alphanumeric of it
 *   - otherwise fall back to the last 10 digits of the phone
 *   - if both are blank/unusable, throw — the caller must provide at least one
 */
export function generateSyntheticEmail(
  kind: 'personal' | 'institution',
  staffId: string | null | undefined,
  phone: string | null | undefined,
): string {
  const cleanStaffId = (staffId ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const phoneDigits = (phone ?? '').replace(/\D/g, '');
  const slug = cleanStaffId || phoneDigits.slice(-10);
  if (!slug) {
    throw new Error(
      'Cannot generate synthetic email — provide either staff_id or phone (10+ digits) for view-only staff',
    );
  }
  return `staff.${slug}.${kind}@${NOLOG_DOMAIN}`;
}

/** Pattern-match an email against the synthetic domain. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${NOLOG_DOMAIN}`);
}

/**
 * Convert a possibly-synthetic email into a user-friendly display string.
 * Returns the literal email for real addresses, "—" for synthetic ones.
 * Use this in tables, exports, and read-only UIs where the synthetic value would confuse a viewer.
 */
export function displayEmail(email: string | null | undefined): string {
  if (!email) return '';
  return isSyntheticEmail(email) ? '—' : email;
}
```

- [ ] **Step 2: Sanity-check determinism in your head**

For input `('institution', 'STAFF-007', '9876543210')` the function must always return `staff.staff007.institution@nolog.jkkn.local`. (`STAFF-007` → strip non-alphanumeric → `staff007`.)

For input `('personal', '', '+91 98765-43210')` → `staff.9876543210.personal@nolog.jkkn.local` (strip non-digits, take last 10).

For input `('personal', '', '')` → throws.

- [ ] **Step 3: Commit**

```bash
git add lib/services/staff/synthetic-email.ts
git commit -m "feat(staff): synthetic-email helpers for view-only staff

generateSyntheticEmail() is deterministic on (staff_id, phone, kind) so
re-uploads hit UNIQUE cleanly. isSyntheticEmail() pattern-matches the
@nolog.jkkn.local domain. displayEmail() returns '—' for synthetic values
so tables and exports stay readable."
```

---

### Task 2.2: Extend Staff TypeScript types

**Files:**
- Modify: `types/staff.ts`

- [ ] **Step 1: Read current `types/staff.ts`**

Use the Read tool to open `types/staff.ts`. Locate the `Staff` interface and the `StaffFilters` interface (if present).

- [ ] **Step 2: Add `login_enabled` to the `Staff` interface**

In the `Staff` interface, add (alongside existing fields like `is_active`):

```ts
  login_enabled: boolean;
```

If there is a `RESERVED_STAFF_ROLE_KEYS` `Set` export, leave it untouched.

- [ ] **Step 3: Add `login_enabled` to filter types**

If `StaffFilters` interface exists, add (optional):

```ts
  login_enabled?: boolean;
```

- [ ] **Step 4: Add `allows_login` to `EmploymentCategory` type (if defined here)**

Search the file for an `EmploymentCategory` interface. If found, add:

```ts
  allows_login: boolean;
```

If the type is defined elsewhere (e.g., `types/employment-category.ts` or inline in the category service), apply the addition there instead.

- [ ] **Step 5: Commit**

```bash
git add types/staff.ts
git commit -m "feat(staff): add login_enabled to Staff type and filters"
```

---

### Task 2.3: Extend `CategoryService` to read/write `allows_login`

**Files:**
- Modify: `lib/services/staff/category-service.ts`

- [ ] **Step 1: Read the file to find SELECT and INSERT/UPDATE call sites**

Open `lib/services/staff/category-service.ts`. Identify:
- `.select(...)` clauses on `employment_categories` — add `allows_login`
- The DTO used by `createCategory`/`updateCategory` — add `allows_login?: boolean` (default true)
- The INSERT/UPDATE payloads — pass `allows_login` through

- [ ] **Step 2: Add `allows_login` to category DTOs and queries**

Wherever a category SELECT lists columns (e.g., `'id, category_name, is_teaching, is_active'`), append `, allows_login`. Use `replace_all` if the string repeats.

If the file uses `select('*')`, no change is needed for SELECTs — PostgREST will return the new column automatically.

- [ ] **Step 3: Update create/update DTOs**

Find `CreateCategoryDto` / `UpdateCategoryDto` (or the in-line argument types) and add:

```ts
  allows_login?: boolean; // default true at DB level
```

In the `createCategory` / `updateCategory` implementation, the spread of `data` will already forward `allows_login` — no extra code needed unless there's an explicit field-allow-list.

- [ ] **Step 4: Commit**

```bash
git add lib/services/staff/category-service.ts
git commit -m "feat(staff): category-service supports allows_login flag"
```

---

### Task 2.4: Extend `StaffService.createStaff` to apply synthetic email

**Files:**
- Modify: `lib/services/staff/staff-service.ts`

- [ ] **Step 1: Update the `CreateStaffDto` interface**

In `lib/services/staff/staff-service.ts`, locate the `CreateStaffDto` interface (top of file). Modify:

```ts
interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'bigender';
  date_of_birth: string;
  marital_status: 'single' | 'married' | 'divorced' | 'widow';
  blood_group?: string;
  email?: string;                 // CHANGED: was required, now optional for view-only
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  institution_email?: string;     // CHANGED: was required, now optional for view-only
  category_id: string;
  institution_id: string;
  department_id?: string | null;
  role_key: string;
  is_active: boolean;
  login_enabled?: boolean;        // NEW: default true
}
```

- [ ] **Step 2: Import the synthetic-email helper at the top of the file**

Add near the other imports:

```ts
import { generateSyntheticEmail, NOLOG_DOMAIN } from './synthetic-email';
```

- [ ] **Step 3: Apply synthetic-email logic in `createStaff()`**

Inside `createStaff(data, suppressToast)`, immediately after the `role_key` validation block (after the `RESERVED_STAFF_ROLE_KEYS.has(...)` check) but **before** the existing `data.staff_id === ''` normalization, insert:

```ts
      // View-only / labour staff: generate deterministic synthetic emails
      // when login_enabled=false and emails are blank. Synthetic domain is
      // @nolog.jkkn.local so Google OAuth (restricted to @jkkn.ac.in) cannot
      // match — and the trigger flips the linked profile to is_active=false.
      const loginEnabled = data.login_enabled !== false; // default true
      if (!loginEnabled) {
        if (!data.email || data.email.trim() === '') {
          data.email = generateSyntheticEmail('personal', data.staff_id, data.phone);
        }
        if (!data.institution_email || data.institution_email.trim() === '') {
          data.institution_email = generateSyntheticEmail('institution', data.staff_id, data.phone);
        }
      } else {
        // Login staff still require both emails (existing behaviour). The caller
        // (form / bulk-upload) is responsible for validating they're non-empty.
        if (!data.email) {
          throw new Error('Email is required for login-enabled staff');
        }
        if (!data.institution_email) {
          throw new Error('Institution email is required for login-enabled staff');
        }
      }
      // Persist the flag through to the DB (default true if undefined).
      data.login_enabled = loginEnabled;
```

- [ ] **Step 4: Update the success toast to match the staff type**

Find the existing toast block near the end of `createStaff`:

```ts
      if (staff?.institution_email) {
        ...
        if (!suppressToast) {
          toast.success(
            `Staff created successfully! User can now login with Google using ${staff.institution_email}`
          );
        }
      }
```

Replace with:

```ts
      if (staff?.institution_email) {
        const isViewOnly = staff.login_enabled === false;
        if (!suppressToast) {
          if (isViewOnly) {
            toast.success(`View-only staff added — no login created`);
          } else {
            toast.success(
              `Staff created successfully! User can now login with Google using ${staff.institution_email}`
            );
          }
        }
      }
```

- [ ] **Step 5: Verify by reading the file**

Use Read to confirm the new logic appears in the file. Look for the literal string `loginEnabled` — it should appear at least twice in `createStaff`.

- [ ] **Step 6: Commit**

```bash
git add lib/services/staff/staff-service.ts
git commit -m "feat(staff): createStaff generates synthetic emails for view-only rows

When login_enabled=false and email/institution_email are blank, the service
generates deterministic synthetic emails via generateSyntheticEmail(). DB
trigger then flips the linked profile to is_active=false."
```

---

## Phase 3 — Bulk Upload UI

### Task 3.1: Add `login_enabled` column to download template

**Files:**
- Modify: `app/(routes)/staff/list/_components/download-staff-template.tsx`

- [ ] **Step 1: Add `login_enabled` to both sample data constants**

In `ID_BASED_SAMPLE_DATA`, after the `role_key` field, add (last property before `is_active`):

```ts
    login_enabled: '', // leave blank to default from category; or 'true' / 'false'
```

Do the same for `NAME_BASED_SAMPLE_DATA`.

- [ ] **Step 2: Extend `COLUMN_WIDTHS`**

Add `V: 18` after `U: 10` in the `COLUMN_WIDTHS` object so the new column has a sensible width.

- [ ] **Step 3: Update both instruction blocks**

In `ID_BASED_INSTRUCTIONS` and `NAME_BASED_INSTRUCTIONS`, find the "Optional Fields" section and add a new optional bullet:

```ts
  ['11. Login Enabled - Values: true, false, or blank (defaults from category)'],
```

Then add a new block immediately before "Date Format Notes":

```ts
  [''],
  ['View-Only / Labour Staff:'],
  ['- Use login_enabled=false for staff who should NOT log in to MyJKKN'],
  ['  (drivers, security, cooking masters, attenders, hostel staff, etc.)'],
  ['- For view-only staff, email and institution_email can be left blank'],
  ['- Phone is STILL required (used to generate a unique system identifier)'],
  ['- The category default applies when login_enabled is blank — toggle a'],
  ['  category to "Login default OFF" in Staff → Categories admin'],
  ['- View-only staff cannot log in via Google OAuth regardless of role_key'],
```

- [ ] **Step 4: Add Excel data-validation list for the new column**

Find the `validations` object near the `ws['!dataValidation']` line and add:

```ts
        V: {
          // login_enabled
          type: 'list',
          operator: 'equal',
          formula1: '"true,false,"'
        }
```

- [ ] **Step 5: Update the Format Examples (`createExampleData`)**

Inside `createExampleData()`, after the `is_active` row, add:

```ts
    exampleData.push([
      'login_enabled',
      'false',
      'Optional — true / false / blank. Blank = derive from category'
    ]);
```

Move the existing `exampleData.push(['is_active', ...])` line ABOVE this new row so the order matches the template column order.

- [ ] **Step 6: Add a labour-row to the Filled Example sheet**

Find the `if (templateType === 'id')` block inside `handleDownload`. After the existing single `exampleData` array containing one row, change it to include a second row (a labour example). Apply the same change in the `else` branch (name-based):

For the ID-based branch:
```ts
const exampleData = [
  {
    ...ID_BASED_SAMPLE_DATA[0],
    category_id: categories[0].id,
    institution_id: institutions[0].id,
    department_id:
      departments.find((d: any) => d.institution_id === institutions[0].id)?.id || departments[0].id
  },
  {
    ...ID_BASED_SAMPLE_DATA[0],
    first_name: 'Ramesh',
    last_name: 'Kumar',
    email: '',
    institution_email: '',
    staff_id: 'STAFF-DRV-001',
    designation: 'Driver',
    phone: '9876543210',
    category_id: categories.find((c) => !c.is_teaching)?.id || categories[0].id,
    institution_id: institutions[0].id,
    department_id: '',
    role_key: 'driver',
    login_enabled: 'false'
  }
];
```

Mirror for the name-based branch (use `category_name`, `institution_name`, `department_name`).

- [ ] **Step 7: Smoke-test the download**

Run `npm run dev`, navigate to Staff → list page, click Download Template → ID-Based. Open the downloaded XLSX in Excel/LibreOffice. Verify:
- Template sheet has a `login_enabled` column.
- Filled Example sheet shows 2 rows; second row has blank emails and `login_enabled=false`.
- Instructions sheet contains the "View-Only / Labour Staff" section.

- [ ] **Step 8: Commit**

```bash
git add app/\(routes\)/staff/list/_components/download-staff-template.tsx
git commit -m "feat(staff): bulk-upload template adds login_enabled column

Optional column with values true/false/blank. Blank derives from category
allows_login default. Instructions sheet documents view-only staff workflow.
Filled Example includes a driver row demonstrating blank-emails labour case."
```

---

### Task 3.2: Bulk-upload validation supports `login_enabled`

**Files:**
- Modify: `app/(routes)/staff/list/_components/bulk-upload-staff.tsx`

- [ ] **Step 1: Add a fetch for `allows_login` per category**

In `processFile()`, the existing `Promise.all` fetches categories via `CategoryService.getCategories(...)`. The category data must include `allows_login`. If `CategoryService.getCategories` already does `select('*')`, no change needed — the new column is already in the response. Otherwise update the select clause (handled in Task 2.3).

After the `categoryTeachingMap` line, add:

```ts
      const categoryAllowsLoginMap = new Map<string, boolean>(
        categoriesResult.data.map((cat) => [cat.id, (cat as any).allows_login !== false])
      );
```

- [ ] **Step 2: Extend `validateRow` signature**

Change the `validateRow` declaration's signature to accept `categoryAllowsLoginMap`. The new last parameter:

```ts
  categoryAllowsLoginMap: Map<string, boolean>
```

And add this constant near the existing `RESERVED_BULK_ROLE_KEYS` declaration at the top of the file:

```ts
const NOLOG_DOMAIN = 'nolog.jkkn.local';
```

- [ ] **Step 3: Compute `loginEnabled` inside `validateRow`**

After the category resolution block (after the line that sets `isTeachingRow`), add:

```ts
  // Resolve login_enabled: explicit row override → category default → true
  const categoryAllowsLogin = valid_category_id
    ? categoryAllowsLoginMap.get(valid_category_id) ?? true
    : true;
  const loginEnabledRaw = String(row.login_enabled ?? '').toLowerCase().trim();
  const loginEnabled =
    loginEnabledRaw === ''
      ? categoryAllowsLogin
      : loginEnabledRaw === 'true' || loginEnabledRaw === '1' || loginEnabledRaw === 'yes';
```

- [ ] **Step 4: Make email validation conditional on `loginEnabled`**

Find the existing email-required block:

```ts
  if (!row.email) {
    errors.push('Email is required');
  } else if (!validateEmail(row.email)) {
    errors.push('Invalid email format');
  }

  if (row.institution_email) {
    row.institution_email = row.institution_email.toLowerCase().trim();
    if (!validateEmail(row.institution_email)) {
      errors.push('Invalid institution email format');
    } else if (!row.institution_email.endsWith('@jkkn.ac.in')) {
      errors.push('Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)');
    }
  }
```

Replace with:

```ts
  if (loginEnabled) {
    // Login-enabled staff (existing rules)
    if (!row.email) {
      errors.push('Email is required for login-enabled staff');
    } else if (!validateEmail(row.email)) {
      errors.push('Invalid email format');
    }

    if (row.institution_email) {
      row.institution_email = row.institution_email.toLowerCase().trim();
      if (!validateEmail(row.institution_email)) {
        errors.push('Invalid institution email format');
      } else if (!row.institution_email.endsWith('@jkkn.ac.in')) {
        errors.push('Institution email must use @jkkn.ac.in domain (e.g., staff@jkkn.ac.in)');
      }
    }
  } else {
    // View-only / labour staff: emails optional, but reject the synthetic
    // domain (users must not write @nolog.jkkn.local values manually) and
    // format-validate anything that IS provided.
    if (row.email) {
      const e = row.email.toLowerCase().trim();
      if (e.endsWith(`@${NOLOG_DOMAIN}`)) {
        errors.push(`Cannot manually provide a @${NOLOG_DOMAIN} email — leave blank for view-only staff`);
      } else if (!validateEmail(row.email)) {
        errors.push('Invalid email format');
      }
    }
    if (row.institution_email) {
      const e = row.institution_email.toLowerCase().trim();
      row.institution_email = e;
      if (e.endsWith(`@${NOLOG_DOMAIN}`)) {
        errors.push(`Cannot manually provide a @${NOLOG_DOMAIN} institution email — leave blank for view-only staff`);
      } else if (!validateEmail(e)) {
        errors.push('Invalid institution email format');
      } else if (!e.endsWith('@jkkn.ac.in')) {
        errors.push('Institution email must use @jkkn.ac.in domain when provided');
      }
    }
  }
```

- [ ] **Step 5: Return `loginEnabled` from `validateRow`**

Extend the `ValidationResult` interface at the top of the file:

```ts
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  valid_institution_id: string;
  valid_department_id: string;
  valid_category_id: string;
  valid_role_key: string;
  converted_date_of_birth?: string;
  converted_date_of_joining?: string;
  login_enabled: boolean;  // NEW
}
```

At the bottom of `validateRow`, change the `return` to include:

```ts
  return {
    isValid: errors.length === 0,
    errors,
    valid_institution_id,
    valid_department_id,
    valid_category_id,
    valid_role_key,
    converted_date_of_birth,
    converted_date_of_joining,
    login_enabled: loginEnabled
  };
```

- [ ] **Step 6: Pass the new map into `validateRow`**

In `processFile`, find the `validatedData = await Promise.all(...)` block and update the `validateRow(...)` call to add `categoryAllowsLoginMap` as the last argument.

In the returned row object inside the map, add `login_enabled: validation.login_enabled` so it flows into `previewData`.

- [ ] **Step 7: Update the duplicate-email scan to skip view-only rows**

The existing block:

```ts
      // Check for duplicate emails within the uploaded data (per institution)
      const emailInstitutionCounts = new Map<string, number[]>();
      validatedData.forEach((row) => {
        if (row.email && row.email.trim() && row.institution_id) {
```

Add a `&& row.login_enabled !== false` guard to the inner `if`:

```ts
        if (row.email && row.email.trim() && row.institution_id && row.login_enabled !== false) {
```

Apply the same guard to the second `validatedData.forEach` (the one that marks duplicates as invalid).

Rationale: view-only rows will all share blank email fields in the spreadsheet — that's expected, not a duplicate-error. The synthetic-email generator handles uniqueness server-side.

- [ ] **Step 8: Forward `login_enabled` in `handleUpload`**

In the existing `staffData = { ... }` block, add at the end (before the closing `}`):

```ts
            login_enabled: row.login_enabled,
```

Service-layer logic in Task 2.4 will generate synthetic emails when needed.

- [ ] **Step 9: Smoke-test**

Run `npm run dev`. Download the latest template. Fill in:
- Row 1: a teaching staff with full email — should validate as Valid
- Row 2: a driver row with blank `email`, blank `institution_email`, `login_enabled=false`, phone `9876543210` — should validate as Valid
- Row 3: a driver row with blank email but `login_enabled=true` — should validate as Invalid ("Email is required for login-enabled staff")

Upload. Confirm in Supabase Studio that the labour row inserted, with synthetic emails and `login_enabled=false`.

- [ ] **Step 10: Commit**

```bash
git add app/\(routes\)/staff/list/_components/bulk-upload-staff.tsx
git commit -m "feat(staff): bulk-upload validation supports login_enabled

View-only rows (login_enabled=false or labour-category default) skip
email-required validation. Duplicate-email pass also skips view-only rows
since their emails are auto-generated server-side."
```

---

## Phase 4 — Single-Add Form & Category Admin

### Task 4.1: Add `allows_login` Switch to category form

**Files:**
- Modify: `app/(routes)/staff/category/_components/category-form.tsx`

- [ ] **Step 1: Open and locate the form schema**

Read `app/(routes)/staff/category/_components/category-form.tsx`. Identify:
- The Zod schema (likely `formSchema = z.object({...})`)
- The default-values block
- The render section with existing form fields like `is_teaching`

- [ ] **Step 2: Extend the schema and defaults**

In the Zod schema, after `is_teaching` add:

```ts
  allows_login: z.boolean().default(true),
```

In the default-values block, add:

```ts
  allows_login: initialData?.allows_login ?? true,
```

- [ ] **Step 3: Add the Switch field**

Find where `is_teaching` is rendered as a Switch. Immediately after that field, add an analogous block:

```tsx
            <FormField
              control={form.control}
              name='allows_login'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Login default (new staff can sign in)</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      When off, new staff added to this category default to
                      &quot;view-only&quot; (no login). Users can still override per row.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
```

If `Switch` is not yet imported, add `import { Switch } from '@/components/ui/switch';` near the top.

- [ ] **Step 4: Smoke-test the form**

Run `npm run dev`. Navigate to Staff → Categories → New (or edit existing). Verify:
- The "Login default" switch appears below "Is Teaching".
- Toggling it off and saving persists `allows_login=false` (check via Supabase Studio).
- Editing the same category re-loads with the saved switch state.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/staff/category/_components/category-form.tsx
git commit -m "feat(staff/category): admin can flip allows_login default per category

When off, new staff added to this category default to view-only (login_enabled=false)
on both bulk upload and single-add form. Per-row override on staff still wins."
```

---

### Task 4.2: Show "Login default: OFF" badge on category list

**Files:**
- Modify: `app/(routes)/staff/category/_components/category-list.tsx`

- [ ] **Step 1: Read the file and find the row render**

Open the file. Locate where each category row renders (it likely shows category_name, is_teaching, is_active in a `Table` row).

- [ ] **Step 2: Add a badge for categories with `allows_login=false`**

In the row render, near the existing badges (e.g., next to "Teaching/Non-Teaching"), add:

```tsx
{!category.allows_login && (
  <Badge variant='secondary' className='text-xs'>Login default: OFF</Badge>
)}
```

If `Badge` is not imported, add `import { Badge } from '@/components/ui/badge';`.

- [ ] **Step 3: Smoke-test**

Reload the categories page. A category toggled off in Task 4.1 should show the badge.

- [ ] **Step 4: Commit**

```bash
git add app/\(routes\)/staff/category/_components/category-list.tsx
git commit -m "feat(staff/category): list shows 'Login default: OFF' badge"
```

---

### Task 4.3: Add Login Switch to single-add staff form

**Files:**
- Modify: `app/(routes)/staff/list/_components/staff-form-tabs/basic-tab.tsx`

- [ ] **Step 1: Locate the form schema and category-change handler**

Open the file. Find the basic-tab form fields and the field handling `category_id`. Determine the form-state mechanism (React Hook Form). Locate where the email and institution_email inputs are rendered.

- [ ] **Step 2: Add `login_enabled` to the form schema**

In the relevant Zod schema (likely `staff-form.tsx` parent — check there first), add:

```ts
  login_enabled: z.boolean().default(true),
```

Default-value block needs `login_enabled: initialData?.login_enabled ?? true`.

- [ ] **Step 3: Render the Login Switch below the category dropdown**

Inside the basic-tab JSX, immediately after the category-select field, add:

```tsx
            <FormField
              control={form.control}
              name='login_enabled'
              render={({ field }) => (
                <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm'>
                  <div className='space-y-0.5'>
                    <FormLabel>Login user — can sign in to MyJKKN</FormLabel>
                    <p className='text-xs text-muted-foreground'>
                      Off = view-only staff. Emails optional and auto-generated;
                      profile is deactivated. Phone is still required.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
```

If `Switch` is not imported, add it.

- [ ] **Step 4: Auto-derive `login_enabled` from category (only if user hasn't manually toggled)**

Add a `useRef` near the top of the component:

```tsx
import { useRef } from 'react';
// ...
  const userToggledLoginEnabled = useRef(false);
```

Wrap the Switch's `onCheckedChange` to track manual interaction:

```tsx
                    <Switch
                      checked={field.value}
                      onCheckedChange={(v) => {
                        userToggledLoginEnabled.current = true;
                        field.onChange(v);
                      }}
                    />
```

Add an effect that listens for category changes and applies the default only if untouched:

```tsx
  const watchedCategoryId = form.watch('category_id');
  useEffect(() => {
    if (!watchedCategoryId) return;
    if (userToggledLoginEnabled.current) return;
    const cat = categories?.find((c: any) => c.id === watchedCategoryId);
    if (cat && typeof (cat as any).allows_login === 'boolean') {
      form.setValue('login_enabled', (cat as any).allows_login);
    }
  }, [watchedCategoryId, categories, form]);
```

Ensure `useEffect` is imported and that `categories` (the list fetched for the dropdown) is in scope.

- [ ] **Step 5: Disable email inputs when `login_enabled=false`**

Find the email and institution_email `<Input>` fields. Add `disabled={!form.watch('login_enabled')}` to each. Update placeholder text:

```tsx
                    <Input
                      {...field}
                      disabled={!form.watch('login_enabled')}
                      placeholder={
                        form.watch('login_enabled')
                          ? 'staff@example.com'
                          : 'Auto-generated for view-only staff'
                      }
                    />
```

- [ ] **Step 6: Make email fields optional in form validation**

In the form schema (parent file), change email/institution_email rules to optional when `login_enabled=false`. Use a Zod `.superRefine`:

```ts
const formSchema = z.object({
  // existing fields...
  email: z.string().optional().or(z.literal('')),
  institution_email: z.string().optional().or(z.literal('')),
  login_enabled: z.boolean().default(true),
  // ...
}).superRefine((data, ctx) => {
  if (data.login_enabled !== false) {
    if (!data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Email is required for login-enabled staff',
      });
    }
    if (!data.institution_email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['institution_email'],
        message: 'Institution email is required for login-enabled staff',
      });
    }
  }
});
```

- [ ] **Step 7: Smoke-test the form**

Run `npm run dev`. Open Staff → New. Verify:
1. Switch defaults to ON.
2. Selecting category "Driver" (after toggling its `allows_login=off` in Task 4.1) auto-flips switch to OFF.
3. Manually toggling switch then changing category does NOT auto-flip.
4. Toggling switch OFF disables email fields and shows placeholder.
5. Submitting with switch OFF and blank emails (phone filled) succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/\(routes\)/staff/list/_components/staff-form-tabs/basic-tab.tsx app/\(routes\)/staff/list/_components/staff-form.tsx
git commit -m "feat(staff): single-add form supports login_enabled toggle

Switch auto-derives from selected category's allows_login. Manual user
toggle sticks across subsequent category changes. Email fields disable
and emails become optional when switch is off."
```

---

### Task 4.4: Forward `login_enabled` from staff-form to service

**Files:**
- Modify: `app/(routes)/staff/list/_components/staff-form.tsx`

- [ ] **Step 1: Find the submit handler**

Open `staff-form.tsx`. Locate the function that calls `StaffService.createStaff(...)` or `updateStaff(...)`.

- [ ] **Step 2: Forward `login_enabled` to the service call**

In the data object passed to `createStaff`, add `login_enabled: values.login_enabled`. Same for `updateStaff` (the service / API will accept it on update via the existing spread).

If the data object uses an explicit allow-list, append `login_enabled` to that allow-list.

- [ ] **Step 3: Commit**

```bash
git add app/\(routes\)/staff/list/_components/staff-form.tsx
git commit -m "feat(staff): forward login_enabled from form to service"
```

---

## Phase 5 — Staff List, API & Export

### Task 5.1: "View-only" badge and filter on staff list

**Files:**
- Modify: `app/(routes)/staff/list/_components/staff-list.tsx`

- [ ] **Step 1: Add a badge column / inline badge**

Open the file. Find the existing `is_active` badge (likely "Active/Inactive"). Add an adjacent badge:

```tsx
{row.original.login_enabled === false && (
  <Badge variant='outline' className='text-xs text-muted-foreground'>View-only</Badge>
)}
```

If the file uses a `columns` array (TanStack Table), add it to the appropriate `cell` renderer.

- [ ] **Step 2: Add a filter dropdown for login type**

Find the existing filter row (institution + active/inactive). Add a new `Select` for login type:

```tsx
            <Select
              value={loginFilter}
              onValueChange={(v) => setLoginFilter(v as 'all' | 'login' | 'view_only')}
            >
              <SelectTrigger className='w-[160px]'>
                <SelectValue placeholder='Login type' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All staff</SelectItem>
                <SelectItem value='login'>Login users</SelectItem>
                <SelectItem value='view_only'>View-only</SelectItem>
              </SelectContent>
            </Select>
```

Add the local state:

```tsx
  const [loginFilter, setLoginFilter] = useState<'all' | 'login' | 'view_only'>('all');
```

Apply the filter to the row data:

```ts
  const filteredStaff = staffData.filter((s) => {
    if (loginFilter === 'login') return s.login_enabled !== false;
    if (loginFilter === 'view_only') return s.login_enabled === false;
    return true;
  });
```

(Or, if the list uses a server-side filter, append `?login_enabled=true/false` to the query — see Task 5.2 below to ensure the API supports it.)

- [ ] **Step 3: Mask synthetic emails in the email cell**

Wherever the table renders `row.email` or `row.institution_email`, wrap with the helper:

Add import:
```ts
import { displayEmail } from '@/lib/services/staff/synthetic-email';
```

Replace `{row.original.email}` with `{displayEmail(row.original.email)}` (and the same for `institution_email`).

- [ ] **Step 4: Smoke-test**

Reload the staff list. Confirm:
- Existing rows render unchanged.
- Newly-added view-only row shows the "View-only" pill and "—" for email columns.
- Filter dropdown narrows down correctly.

- [ ] **Step 5: Commit**

```bash
git add app/\(routes\)/staff/list/_components/staff-list.tsx
git commit -m "feat(staff): list shows View-only badge + login-type filter

Synthetic @nolog.jkkn.local emails render as '—' so the table stays readable.
Filter dropdown lets HR narrow to view-only or login users."
```

---

### Task 5.2: API routes accept `login_enabled`

**Files:**
- Modify: `app/api/staff/route.ts`
- Modify: `app/api/staff/[id]/route.ts`

- [ ] **Step 1: Accept `login_enabled` in POST `/api/staff`**

Open `app/api/staff/route.ts`. The POST handler currently spreads `json` into the insert payload:

```ts
    const { data: staff, error: createError } = await supabaseAdmin
      .from('staff')
      .insert([{ ...json, created_by: ..., updated_by: ... }])
```

The spread already includes `login_enabled` if the client sent it. The required-fields check is:

```ts
    if (!json.first_name || !json.last_name || !json.email) {
```

Change the `!json.email` clause to allow blank email when `login_enabled=false`:

```ts
    if (!json.first_name || !json.last_name) {
      return NextResponse.json(
        { error: 'Missing required fields: first_name, last_name' },
        { status: 400 }
      );
    }
    if (json.login_enabled !== false && !json.email) {
      return NextResponse.json(
        { error: 'Email is required for login-enabled staff' },
        { status: 400 }
      );
    }
```

Add the same synthetic-email generation as the service (so direct API callers without the client-side service get the same behaviour):

```ts
    // Import at top:
    // import { generateSyntheticEmail } from '@/lib/services/staff/synthetic-email';

    if (json.login_enabled === false) {
      if (!json.email || json.email.trim() === '') {
        json.email = generateSyntheticEmail('personal', json.staff_id, json.phone);
      }
      if (!json.institution_email || json.institution_email.trim() === '') {
        json.institution_email = generateSyntheticEmail('institution', json.staff_id, json.phone);
      }
    }
```

Place this block right before the existing `if (json.staff_id) { ... duplicate check ... }`.

- [ ] **Step 2: Accept GET filter `?login_enabled=true|false`**

In the same file's GET handler, find the query-parameter parsing block and add:

```ts
    const loginEnabledParam = searchParams.get('login_enabled');
```

Then near the other filter applications:

```ts
    if (loginEnabledParam === 'true') {
      query = query.eq('login_enabled', true);
    } else if (loginEnabledParam === 'false') {
      query = query.eq('login_enabled', false);
    }
```

- [ ] **Step 3: PATCH `/api/staff/[id]` accepts `login_enabled`**

Open `app/api/staff/[id]/route.ts`. The PATCH handler spreads the JSON body — confirm `login_enabled` flows through. If the file has an explicit allow-list, add `login_enabled` to it.

- [ ] **Step 4: Smoke-test**

Use curl or browser fetch (from an authenticated session):

```js
fetch('/api/staff?login_enabled=false&limit=5').then(r=>r.json()).then(console.log)
```

Should return only view-only rows.

- [ ] **Step 5: Commit**

```bash
git add app/api/staff/route.ts app/api/staff/\[id\]/route.ts
git commit -m "feat(staff/api): accept login_enabled in POST + filter in GET

POST generates synthetic emails server-side when login_enabled=false and
emails are blank — defence-in-depth so direct API callers behave like the
client service. GET supports ?login_enabled=true|false for filtering."
```

---

### Task 5.3: Mask synthetic emails in CSV/XLSX export

**Files:**
- Modify: `app/api/staff/export/route.ts`

- [ ] **Step 1: Import the helper**

Add at the top:

```ts
import { displayEmail } from '@/lib/services/staff/synthetic-email';
```

- [ ] **Step 2: Map email columns through `displayEmail`**

Find where the export rows are constructed (likely `rows.map(staff => ({ email: staff.email, ...}))`). Wrap email columns:

```ts
      email: displayEmail(staff.email),
      institution_email: displayEmail(staff.institution_email),
```

Add a new column `Login Type`:

```ts
      login_type: staff.login_enabled === false ? 'View-only' : 'Login user',
```

- [ ] **Step 3: Update header row if export uses fixed headers**

If the file defines an `HEADERS` array, add `'Login Type'` at an appropriate position (e.g., next to "Status").

- [ ] **Step 4: Smoke-test the export**

Trigger export from the UI. Open the file. Confirm:
- Synthetic emails appear as `—`, not literal `@nolog.jkkn.local`.
- New `Login Type` column shows correct values.

- [ ] **Step 5: Commit**

```bash
git add app/api/staff/export/route.ts
git commit -m "feat(staff/export): mask synthetic emails as '—' and add Login Type column"
```

---

## Phase 6 — End-to-End Verification

### Task 6.1: Run all acceptance criteria from the spec

- [ ] **Step 1: AC1 — Bulk-upload a labour row (blank emails, login_enabled blank)**

Download a fresh template. Add a row:
- first_name: `Test`, last_name: `Driver`
- gender: `male`, date_of_birth: `1990-01-01`, marital_status: `single`
- email: BLANK, phone: `9000000001`, institution_email: BLANK
- staff_id: `TEST-DRV-001`, date_of_joining: `2024-01-01`, designation: `Driver`
- category_name/id: a category toggled to `allows_login=false` (toggle Driver via Category UI first)
- role_key: `driver`, institution_name/id: any institution
- login_enabled: BLANK

Upload. Expected: row inserts; staff list shows "View-only" badge; profile (visible in Supabase Studio → profiles) has `is_active=false`, `is_login_disabled=true`, email like `staff.testdrv001.institution@nolog.jkkn.local`.

- [ ] **Step 2: AC2 — Driver row with login_enabled=true and valid email**

Same as AC1, but: institution_email = `realdriver@jkkn.ac.in`, login_enabled = `true`. Expected: profile is_active=true, can log in via Google (if user account exists).

- [ ] **Step 3: AC3 — Teaching row with no email rejected**

Add a teaching-category row with blank email. Expected: validation marks Invalid with "Email is required for login-enabled staff".

- [ ] **Step 4: AC4 — Re-upload same labour row idempotent**

Run the AC1 upload again with the same file. Expected: first row reports "Staff ID 'TEST-DRV-001' already exists" or "Email already exists" — failure is loud, not silent.

- [ ] **Step 5: AC5 — Single-add: manual toggle sticks**

Open Staff → New. Toggle switch OFF manually. Then change category to a `Teaching` one. Expected: switch stays OFF.

- [ ] **Step 6: AC6 — Single-add: auto-flip when untouched**

Open Staff → New (fresh page). Without touching the switch, change category to `Driver` (which has `allows_login=false`). Expected: switch auto-flips to OFF.

- [ ] **Step 7: AC7 — Export masks synthetic emails**

Export staff list. Open. Expected: AC1's labour row shows `—` for both email columns and `View-only` in Login Type.

- [ ] **Step 8: AC8 — HR pickers exclude view-only staff**

Open any HR form that picks an approver/assignee (e.g., leave-approval form, attendance-incharge picker). Expected: AC1's labour row does NOT appear in the dropdown (because `profiles.is_active=false`).

- [ ] **Step 9: Document any failed AC**

If any AC fails, capture the failure in a fresh markdown note under `docs/superpowers/qa/2026-05-15-staff-bulk-upload-labour-qa.md` and revisit the relevant task.

- [ ] **Step 10: Final commit (notes only, if needed)**

```bash
git add docs/superpowers/qa/2026-05-15-staff-bulk-upload-labour-qa.md 2>/dev/null || true
git diff --cached --quiet || git commit -m "docs(staff): bulk-upload labour QA log"
```

---

## Self-Review Checklist (Run Once After Reading Whole Plan)

- [ ] **Spec §3.1 (Core idea)** → covered by Tasks 1.1, 1.2, 2.1, 2.4 (synthetic emails + trigger + service)
- [ ] **Spec §3.2 (Excel signal — hybrid)** → covered by Task 3.2 (validateRow login_enabled resolution)
- [ ] **Spec §3.3 (Database changes)** → Task 1.1 (3 new columns) + Task 1.2 (trigger)
- [ ] **Spec §3.4 (Synthetic email generator)** → Task 2.1
- [ ] **Spec §3.5 (Trigger amendment)** → Task 1.2
- [ ] **Spec §3.6 (Bulk-upload TS validation)** → Task 3.2
- [ ] **Spec §3.7 (Single-add form)** → Tasks 4.3 + 4.4
- [ ] **Spec §3.8 (Download template)** → Task 3.1
- [ ] **Spec §3.9 (Staff list UI)** → Task 5.1
- [ ] **Spec §3.10 (Category management UI)** → Tasks 4.1 + 4.2 + 2.3
- [ ] **Spec §3.11 (Service layer changes)** → Task 2.4
- [ ] **Spec §3.12 (What does NOT change)** → No tasks needed (negative scope)
- [ ] **Spec §3.13 (Optional backfill)** → Intentionally NOT in this plan — separate ticket
- [ ] **Spec §4 (Risks & Verifications)** → Task 6.1 covers AC1-AC8
- [ ] **Spec §6 (Acceptance Criteria 1-8)** → Task 6.1
- [ ] **Placeholder scan:** no TODOs, no "implement later", every code step has full code
- [ ] **Type consistency:** `login_enabled` is `boolean` everywhere (DTO, schema, DB column, form field); `allows_login` is `boolean`; `is_login_disabled` is `boolean`. The synthetic-email function signature `(kind, staffId, phone)` matches in all call sites (Tasks 2.4, 5.2).
- [ ] **Field name consistency:** Spec uses `login_enabled` (snake_case for DB), TypeScript uses `login_enabled` matching column. Form uses same name.

---

## Notes for the Executor

1. **Migration order matters.** Run Task 1.1 BEFORE Task 1.2 — the trigger update references `NEW.login_enabled` which must exist as a column first.

2. **The synthetic-email helper is a pure function.** No imports of Supabase, no async. Treat it as a leaf module.

3. **`@nolog.jkkn.local` is NEVER a real DNS-resolvable domain.** It's chosen to:
   - Pattern-match easily (`isSyntheticEmail`)
   - Be obviously fake to anyone reading raw data
   - Not collide with `@jkkn.ac.in` (OAuth) or any real `.com`/`.in` domain
   - Look like an internal-network address rather than a typo

4. **Don't backfill existing 60+ implicit-labour staff in this plan.** They keep their `@jkkn.ac.in` placeholder emails and `login_enabled=true` defaults. Spec §3.13 explicitly defers this to a separate ticket so this plan stays focused and reversible.

5. **Commit per task.** Each task commit message follows conventional-commits style (`feat(staff): ...`, `feat(staff/api): ...`, etc.) so the git history reads as a story.

6. **If a task's smoke test fails:** stop, investigate, fix the prior task, re-test. Do not chain failures forward.
