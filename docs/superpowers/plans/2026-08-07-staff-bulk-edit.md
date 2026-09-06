# Staff Bulk Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a five-step bulk edit (`select → preview → validate → uploading → result`) to `/staff/list` that corrects existing staff from a pre-filled spreadsheet, matched on `institution_email`.

**Architecture:** Four pure, unit-tested modules (column contract → parser → validator → field validators) sit underneath one `BaseService` class and three API routes. The `preview` and `apply` routes import and call the *same* validator, so a rule can never exist in one path and not the other. The UI is a single dialog driving a five-state machine.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query, Shadcn UI, SheetJS (`xlsx`) for reading, ExcelJS for writing, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-08-07-staff-bulk-edit-design.md` — read it before Task 1. Section references below (§3.2 etc.) point at it.

## Global Constraints

- **Match key is `institution_email`**, resolved as `lower(btrim(...))`. Never `staff_id` (23% null, case-sensitive unique index). Never guess on a multi-row match — emit an `ambiguous` record issue.
- **The template writes the RAW `institution_email`**, never `displayEmail()`. 124 of 864 staff (14%) hold a synthetic `@nolog.jkkn.local` address which IS their real key (§3.2).
- **Blank editable cell = leave unchanged.** Bulk edit never clears a field, and never inserts.
- **Value vocabularies come from DB CHECK constraints, not from `staff-form-schema.ts`** (§3.4). Compare case-insensitively; **write lowercase**.
- **Biometric codes compare through `normaliseBiometricCode`**, mirroring the SQL `fn_norm_biometric_code`: all-digit codes ≤18 chars compare numerically (`00002` = `002` = `2`); everything else is trimmed and uppercased.
- **`preview` and `apply` call the same exported validator.** Neither may inline a rule. `apply` re-validates server-side and never trusts a client preview.
- **Never fire-and-forget a Supabase mutation** — destructure and check `{ error }`. `try/catch` does not catch RLS denials or constraint violations.
- **Supabase errors are plain objects, not `Error` instances** — surface with `getErrorMessage()` from `@/lib/utils`.
- **`'' → null`** for `biometric_institution_id` before write, or Postgres raises `22P02`.
- **Chunk `.in()` lookups** at 200 values; long lists overflow the URL and return `400`.
- **An EMPTY `accessibleInstitutionIds` array means ALL institutions, not none.** `createApiInstitutionFilter` (`lib/auth/api-institution-filter.ts:91`) returns `institutionIds: []` for super admins and admission-global roles — its own comment reads *"Empty means access to all"* — and `applyInstitutionFilterToQuery` skips filtering entirely in that case. Code that calls `.in('institution_id', ids)` unconditionally matches **zero rows** for exactly those users, so every row reports "not found" while the data is fine. Apply the filter only when `ids.length > 0`. Branch on the list being empty, **never** on an `isSuperAdmin` flag.
- **Any query embedding `institutions` on `staff` must use the explicit hint** `institutions!staff_institution_id_fkey(...)`, or it fails with `PGRST201`.
- **Permission gating — the option name matters and the two are NOT interchangeable.**
  - Server (all three routes): `withAuth(handler, { requirePermission: 'staff.manage_imports' })`.
    **`requirePermission`** (no "d") is the real RBAC gate — `lib/auth/with-auth.ts:192-211` runs the canonical triad `is_super_admin() OR is_admin() OR user_has_permission(key)`.
    **`requiredPermission: 'read'|'write'` is NOT a gate for signed-in users.** `handleSessionAuth` takes it as `_requiredPermission` (line 345, unused); it is enforced only at line 416 for API-key callers. Using it on a session route leaves the route effectively ungated.
  - Client (the button): `canAccess('staff', 'manage_imports')`, which resolves to the same `staff.manage_imports` key (`use-permissions.ts:515` builds `` `${module}.${action}` ``). **Nav visibility must mirror the route guard** — gating the button on `staff.edit` while the route requires `staff.manage_imports` shows a button that 403s.
- **No new permission key, and no migration.** `staff.manage_imports` already exists in `lib/constants/permissions.ts` AND is already granted in `custom_roles.permissions`. Verified live on 2026-08-07: **`staff.manage_imports` → 3 of 88 roles** (Administrator, HOD, Payment Audit Admin), versus **`staff.edit` → 72 of 88** (including `driver`, `client`, `cohort_member`). `staff.edit` is too broadly granted to be a boundary. Do not invent a new key — an ungranted key produces a silent 403 for everyone.
- **No migration.** This writes existing columns through the existing staff `UPDATE` RLS policy.
- **Test command:** `npx vitest run <file>` (there is no `npm test` script; `vitest.config.js` provides the `@` alias and a `node` environment).

---

### Task 1: Shared field validators

Extract the email/phone/date validators that already exist inside `bulk-upload-staff.tsx` so the upload and edit paths cannot disagree about what a valid phone number is. Nothing else in that 1,451-line file is touched.

**Files:**
- Create: `lib/utils/staff-field-validators.ts`
- Modify: `app/(routes)/staff/list/_components/bulk-upload-staff.tsx` (delete the local copies, import instead)
- Test: `__tests__/staff/staff-field-validators.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `validateEmail(value: string): boolean`
  - `validatePhone(value: string): boolean`
  - `parseFlexibleDate(value: unknown): { isValid: boolean; convertedDate: string; error?: string }` — returns `convertedDate` as `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/staff/staff-field-validators.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validatePhone,
  parseFlexibleDate
} from '@/lib/utils/staff-field-validators';

describe('validateEmail', () => {
  it('accepts a normal address', () => {
    expect(validateEmail('abdulnazeer_m@jkkn.ac.in')).toBe(true);
  });
  it('accepts the synthetic no-login address', () => {
    expect(validateEmail('staff.cop083.institution@nolog.jkkn.local')).toBe(true);
  });
  it('rejects a missing @', () => {
    expect(validateEmail('not-an-email')).toBe(false);
  });
  it('rejects embedded whitespace', () => {
    expect(validateEmail('a b@jkkn.ac.in')).toBe(false);
  });
});

describe('validatePhone', () => {
  it('accepts 10 plain digits', () => {
    expect(validatePhone('9876543210')).toBe(true);
  });
  it('accepts +91 with spaces', () => {
    expect(validatePhone('+91 98765 43210')).toBe(true);
  });
  it('rejects 9 digits', () => {
    expect(validatePhone('987654321')).toBe(false);
  });
});

describe('parseFlexibleDate', () => {
  it('passes through ISO', () => {
    expect(parseFlexibleDate('1990-05-02').convertedDate).toBe('1990-05-02');
  });
  it('reads DD/MM/YYYY', () => {
    expect(parseFlexibleDate('02/05/1990').convertedDate).toBe('1990-05-02');
  });
  it('reads DD-MM-YYYY', () => {
    expect(parseFlexibleDate('02-05-1990').convertedDate).toBe('1990-05-02');
  });
  it('reads DD.MM.YYYY', () => {
    expect(parseFlexibleDate('02.05.1990').convertedDate).toBe('1990-05-02');
  });
  it('reads a real Date (xlsx cellDates)', () => {
    expect(parseFlexibleDate(new Date(Date.UTC(1990, 4, 2))).convertedDate).toBe('1990-05-02');
  });
  it('flags junk', () => {
    expect(parseFlexibleDate('not a date').isValid).toBe(false);
  });
  it('flags an empty value', () => {
    expect(parseFlexibleDate('').isValid).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/staff/staff-field-validators.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/utils/staff-field-validators"`.

- [ ] **Step 3: Create the module**

Open `app/(routes)/staff/list/_components/bulk-upload-staff.tsx` and read the existing
`validateEmail` (line ~60), `validatePhone` (line ~64) and the date parser (lines ~68–290).
Move them verbatim into `lib/utils/staff-field-validators.ts`, preserving the regexes exactly:

```ts
/**
 * Field validators shared by staff bulk upload (create) and staff bulk edit (update).
 *
 * Extracted from bulk-upload-staff.tsx on 2026-08-07 so the two flows cannot drift on
 * what counts as a valid phone number or a parseable date. The regexes are unchanged —
 * do not "tighten" them here without checking the upload path still accepts real data.
 */

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone: string): boolean {
  return /^\+?[\d\s-()]{10,}$/.test(phone);
}

export interface ParsedDate {
  isValid: boolean;
  convertedDate: string; // YYYY-MM-DD
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseFlexibleDate(value: unknown): ParsedDate {
  // xlsx with `cellDates: true` hands back a real Date.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      isValid: true,
      convertedDate: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    };
  }

  const raw = value == null ? '' : String(value).trim();
  if (raw === '') {
    return { isValid: false, convertedDate: '', error: 'Date is required' };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { isValid: true, convertedDate: raw };
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY — day first, matching the existing upload path.
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { isValid: true, convertedDate: `${y}-${pad(month)}-${pad(day)}` };
    }
    return { isValid: false, convertedDate: '', error: `Out-of-range date: ${raw}` };
  }

  // YYYY/MM/DD
  const ymd = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return { isValid: true, convertedDate: `${y}-${pad(Number(m))}-${pad(Number(d))}` };
  }

  return {
    isValid: false,
    convertedDate: '',
    error: `Unrecognised date "${raw}". Use YYYY-MM-DD or DD/MM/YYYY.`
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/staff/staff-field-validators.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Point the upload path at the shared module**

In `app/(routes)/staff/list/_components/bulk-upload-staff.tsx`, delete the local
`validateEmail`, `validatePhone` and date-parser definitions and add near the other imports:

```ts
import { validateEmail, validatePhone, parseFlexibleDate } from '@/lib/utils/staff-field-validators';
```

If the local date parser was named something else (e.g. `validateAndConvertDate`), alias it at the
import rather than renaming call sites:

```ts
import { parseFlexibleDate as validateAndConvertDate } from '@/lib/utils/staff-field-validators';
```

- [ ] **Step 6: Verify the upload path still compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep bulk-upload-staff` (or check IDE diagnostics for the file)
Expected: no errors naming `bulk-upload-staff.tsx`.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/staff-field-validators.ts __tests__/staff/staff-field-validators.test.ts "app/(routes)/staff/list/_components/bulk-upload-staff.tsx"
git commit -m "refactor(staff): share the bulk-upload field validators"
```

---

### Task 2: The template column contract

One module owns the header names and their mapping to `staff` columns. The template writer, the
parser and the error-sheet writer all read it, so a header can never mean two things.

**Files:**
- Create: `lib/services/staff/staff-bulk-edit-columns.ts`
- Test: `__tests__/staff/staff-bulk-edit-columns.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type StaffEditableField` — union of the writable `staff` column names.
  - `interface BulkEditColumn { header: string; field: StaffEditableField | null; kind: 'text'|'date'|'enum'|'lookup'; enumValues?: readonly string[] }`
  - `BULK_EDIT_COLUMNS: readonly BulkEditColumn[]` — in sheet order.
  - `EDITABLE_COLUMNS: readonly BulkEditColumn[]` — those with a non-null `field`.
  - `MATCH_KEY_HEADER = 'Institution Email'`
  - `GENDERS`, `MARITAL_STATUSES`, `BLOOD_GROUPS`

- [ ] **Step 1: Write the failing test**

Create `__tests__/staff/staff-bulk-edit-columns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BULK_EDIT_COLUMNS,
  EDITABLE_COLUMNS,
  MATCH_KEY_HEADER,
  GENDERS,
  MARITAL_STATUSES,
  BLOOD_GROUPS
} from '@/lib/services/staff/staff-bulk-edit-columns';

describe('BULK_EDIT_COLUMNS', () => {
  it('has unique headers', () => {
    const headers = BULK_EDIT_COLUMNS.map(c => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it('starts with the match key', () => {
    expect(BULK_EDIT_COLUMNS[0].header).toBe(MATCH_KEY_HEADER);
  });

  it('never writes through a locked column', () => {
    const locked = BULK_EDIT_COLUMNS.filter(c => c.field === null).map(c => c.header);
    expect(locked).toEqual([
      'Institution Email',
      'Staff ID (current)',
      'Name',
      'Institution'
    ]);
  });

  it('maps every editable column to a distinct staff field', () => {
    const fields = EDITABLE_COLUMNS.map(c => c.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('excludes tenancy and access-control fields', () => {
    const fields = EDITABLE_COLUMNS.map(c => c.field as string);
    for (const forbidden of ['institution_id', 'role_key', 'is_active', 'login_enabled', 'employment_type']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it('exposes Staff ID twice — locked for identity, editable for correction', () => {
    expect(BULK_EDIT_COLUMNS.find(c => c.header === 'Staff ID (current)')?.field).toBeNull();
    expect(BULK_EDIT_COLUMNS.find(c => c.header === 'Staff ID (new)')?.field).toBe('staff_id');
  });

  it('carries the DB CHECK vocabularies verbatim', () => {
    expect(GENDERS).toEqual(['male', 'female', 'bigender']);
    expect(MARITAL_STATUSES).toEqual(['single', 'married', 'divorced', 'widow']);
    expect(BLOOD_GROUPS).toEqual(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B']);
  });

  it('gives every enum column its values', () => {
    for (const col of EDITABLE_COLUMNS.filter(c => c.kind === 'enum')) {
      expect(col.enumValues && col.enumValues.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-columns.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
/**
 * The staff bulk-edit template contract: header names and what they write to.
 *
 * ONE source of truth for the template writer, the sheet parser and the error-sheet
 * writer. Columns are matched by HEADER NAME, never by position, so reordering columns
 * in Excel cannot corrupt an import.
 *
 * The vocabularies below are copied from the DB CHECK constraints, NOT from
 * staff-form-schema.ts. The constraint is what actually rejects the write; the Zod
 * schema is a copy and copies drift.
 *   staff_gender_check         male | female | bigender
 *   staff_marital_status_check single | married | divorced | widow
 *   staff_blood_group_check    A+ A- B+ B- AB+ AB- O+ O- A1+ A1B
 */

export const GENDERS = ['male', 'female', 'bigender'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widow'] as const;
export const BLOOD_GROUPS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'
] as const;

export type StaffEditableField =
  | 'phone'
  | 'email'
  | 'date_of_birth'
  | 'gender'
  | 'marital_status'
  | 'blood_group'
  | 'address'
  | 'state'
  | 'district'
  | 'pincode'
  | 'staff_id'
  | 'designation'
  | 'date_of_joining'
  | 'department_id'
  | 'category_id'
  | 'biometric_id'
  | 'biometric_institution_id';

export interface BulkEditColumn {
  header: string;
  /** null = identify-only. Written to the sheet, ignored on import. */
  field: StaffEditableField | null;
  kind: 'text' | 'date' | 'enum' | 'lookup';
  enumValues?: readonly string[];
  /** Shown on the Instructions sheet. */
  note?: string;
}

export const MATCH_KEY_HEADER = 'Institution Email';

export const BULK_EDIT_COLUMNS: readonly BulkEditColumn[] = [
  // ── Identify (locked) ───────────────────────────────────────────────
  { header: MATCH_KEY_HEADER, field: null, kind: 'text',
    note: 'Match key. Do not edit. This is the raw stored address — for view-only staff it is a @nolog.jkkn.local placeholder, which is still the real key.' },
  { header: 'Staff ID (current)', field: null, kind: 'text', note: 'Do not edit. Shown so you can recognise the row.' },
  { header: 'Name',              field: null, kind: 'text', note: 'Do not edit.' },
  { header: 'Institution',       field: null, kind: 'text', note: 'Do not edit. Bulk edit cannot move a person between institutions.' },

  // ── Personal & contact ──────────────────────────────────────────────
  { header: 'Phone',          field: 'phone',          kind: 'text' },
  { header: 'Personal Email', field: 'email',          kind: 'text', note: 'Must be unique across all staff.' },
  { header: 'Date of Birth',  field: 'date_of_birth',  kind: 'date' },
  { header: 'Gender',         field: 'gender',         kind: 'enum', enumValues: GENDERS },
  { header: 'Marital Status', field: 'marital_status', kind: 'enum', enumValues: MARITAL_STATUSES },
  { header: 'Blood Group',    field: 'blood_group',    kind: 'enum', enumValues: BLOOD_GROUPS },
  { header: 'Address',        field: 'address',        kind: 'text' },
  { header: 'State',          field: 'state',          kind: 'text' },
  { header: 'District',       field: 'district',       kind: 'text' },
  { header: 'Pincode',        field: 'pincode',        kind: 'text', note: '6 digits.' },

  // ── Employment ──────────────────────────────────────────────────────
  { header: 'Staff ID (new)',  field: 'staff_id',        kind: 'text', note: 'Must be unique across all staff. Fills the 198 currently blank.' },
  { header: 'Designation',     field: 'designation',     kind: 'text' },
  { header: 'Date of Joining', field: 'date_of_joining', kind: 'date' },
  { header: 'Department',      field: 'department_id',   kind: 'lookup', note: 'Department NAME, resolved within this person’s institution.' },
  { header: 'Category',        field: 'category_id',     kind: 'lookup', note: 'Employment category NAME.' },

  // ── Biometric attendance ────────────────────────────────────────────
  { header: 'Biometric Code',    field: 'biometric_id',             kind: 'text',
    note: 'Empcode from the machine. Leading zeros are ignored — 00002, 002 and 2 are one code.' },
  { header: 'Biometric Machine', field: 'biometric_institution_id', kind: 'lookup',
    note: 'Institution that OWNS the machine — often NOT this person’s institution. Required whenever a code is given.' }
] as const;

export const EDITABLE_COLUMNS = BULK_EDIT_COLUMNS.filter(
  (c): c is BulkEditColumn & { field: StaffEditableField } => c.field !== null
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-columns.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/services/staff/staff-bulk-edit-columns.ts __tests__/staff/staff-bulk-edit-columns.test.ts
git commit -m "feat(staff): define the bulk-edit template column contract"
```

---

### Task 3: The validator

The single function both `preview` and `apply` call. Pure — it takes a parsed row plus the lookup
maps and returns issues. No database access, so it is fully unit-testable.

**Files:**
- Create: `lib/services/staff/staff-bulk-edit-validation.ts`
- Test: `__tests__/staff/staff-bulk-edit-validation.test.ts`

**Interfaces:**
- Consumes: `validateEmail`, `validatePhone`, `parseFlexibleDate` (Task 1); `GENDERS`, `MARITAL_STATUSES`, `BLOOD_GROUPS`, `EDITABLE_COLUMNS`, `StaffEditableField` (Task 2).
- Produces:
  - `normaliseBiometricCode(code: string | null | undefined): string | null`
  - `interface BulkEditIssue { field: string; message: string; kind: 'format' | 'record' }`
  - `interface ParsedStaffRow { rowNumber: number; institutionEmail: string; cells: Record<string, string> }` (keys are template headers)
  - `interface ValidationContext { staffByEmail: Map<string, StaffLookupRow>; departmentsByInstitution: Map<string, Map<string, string>>; categoriesByName: Map<string, string>; institutionsByName: Map<string, string>; emailOwner: Map<string, string>; staffIdOwner: Map<string, string>; biometricOwner: Map<string, string>; }`
  - `interface StaffLookupRow { id: string; institution_id: string; institution_email: string; [field: string]: unknown }`
  - `validateStaffBulkEditRow(row: ParsedStaffRow, ctx: ValidationContext, seenEmails: Set<string>): { issues: BulkEditIssue[]; updates: Partial<Record<StaffEditableField, string | null>> }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/staff/staff-bulk-edit-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normaliseBiometricCode,
  validateStaffBulkEditRow,
  type ValidationContext,
  type ParsedStaffRow
} from '@/lib/services/staff/staff-bulk-edit-validation';

const STAFF_ID = 'c6e43a58-477f-4c5a-bde8-68e4dd63ae7d';
const INST_ID = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5';
const OTHER_STAFF_ID = '481e97c2-1f44-4efb-9338-7c057618ba1e';

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    staffByEmail: new Map([
      ['abdulnazeer_m@jkkn.ac.in', {
        id: STAFF_ID,
        institution_id: INST_ID,
        institution_email: 'abdulnazeer_m@jkkn.ac.in',
        phone: '9876543210',
        gender: 'male',
        staff_id: 'COP083',
        email: 'nazeer@gmail.com',
        biometric_id: null,
        biometric_institution_id: null
      }]
    ]),
    departmentsByInstitution: new Map([[INST_ID, new Map([['pharmacy practice', 'dept-1']])]]),
    categoriesByName: new Map([['assistant professor', 'cat-1']]),
    institutionsByName: new Map([['jkkn dental college and hospital', INST_ID]]),
    emailOwner: new Map([['taken@jkkn.ac.in', OTHER_STAFF_ID]]),
    staffIdOwner: new Map([['cop999', OTHER_STAFF_ID]]),
    biometricOwner: new Map([[`${INST_ID}|2`, OTHER_STAFF_ID]]),
    ...over
  };
}

function row(cells: Record<string, string>, rowNumber = 2): ParsedStaffRow {
  return { rowNumber, institutionEmail: 'abdulnazeer_m@jkkn.ac.in', cells };
}

describe('normaliseBiometricCode', () => {
  it('collapses leading zeros like fn_norm_biometric_code', () => {
    expect(normaliseBiometricCode('00002')).toBe('2');
    expect(normaliseBiometricCode('002')).toBe('2');
    expect(normaliseBiometricCode('2')).toBe('2');
  });
  it('uppercases a non-numeric code', () => {
    expect(normaliseBiometricCode(' cas140 ')).toBe('CAS140');
  });
  it('treats blank as absent', () => {
    expect(normaliseBiometricCode('   ')).toBeNull();
    expect(normaliseBiometricCode(null)).toBeNull();
  });
  it('does not numerically collapse a 19-digit code', () => {
    const long = '1'.repeat(19);
    expect(normaliseBiometricCode(long)).toBe(long);
  });
});

describe('validateStaffBulkEditRow', () => {
  it('accepts a clean phone change and produces one update', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '9000000001' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ phone: '9000000001' });
  });

  it('treats a blank cell as no change', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '   ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({});
  });

  it('ignores a value identical to the stored one', () => {
    const r = validateStaffBulkEditRow(row({ Phone: '9876543210' }), ctx(), new Set());
    expect(r.updates).toEqual({});
  });

  it('lowercases an enum given in the wrong case', () => {
    const r = validateStaffBulkEditRow(row({ Gender: ' Female ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ gender: 'female' });
  });

  it('rejects a value outside the vocabulary as a format issue', () => {
    const r = validateStaffBulkEditRow(row({ Gender: 'unknown' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Gender', kind: 'format' });
  });

  it('rejects a malformed email as a format issue', () => {
    const r = validateStaffBulkEditRow(row({ 'Personal Email': 'not-an-email' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Personal Email', kind: 'format' });
  });

  it('rejects a pincode that is not 6 digits', () => {
    const r = validateStaffBulkEditRow(row({ Pincode: '1234' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Pincode', kind: 'format' });
  });

  it('reports an unmatched institution email as a record issue', () => {
    const r = validateStaffBulkEditRow(
      { rowNumber: 2, institutionEmail: 'ghost@jkkn.ac.in', cells: { Phone: '9000000001' } },
      ctx(),
      new Set()
    );
    expect(r.issues[0]).toMatchObject({ kind: 'record' });
    expect(r.issues[0].message).toMatch(/not found/i);
  });

  it('reports a duplicate institution email within the file', () => {
    const seen = new Set(['abdulnazeer_m@jkkn.ac.in']);
    const r = validateStaffBulkEditRow(row({ Phone: '9000000001' }), ctx(), seen);
    expect(r.issues[0]).toMatchObject({ kind: 'record' });
    expect(r.issues[0].message).toMatch(/more than once/i);
  });

  it('rejects a personal email already owned by someone else', () => {
    const r = validateStaffBulkEditRow(row({ 'Personal Email': 'taken@jkkn.ac.in' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Personal Email', kind: 'record' });
  });

  it('rejects a staff id already owned by someone else', () => {
    const r = validateStaffBulkEditRow(row({ 'Staff ID (new)': 'COP999' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Staff ID (new)', kind: 'record' });
  });

  it('resolves a department name within the institution', () => {
    const r = validateStaffBulkEditRow(row({ Department: ' Pharmacy Practice ' }), ctx(), new Set());
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ department_id: 'dept-1' });
  });

  it('reports an unknown department as a record issue', () => {
    const r = validateStaffBulkEditRow(row({ Department: 'Astrology' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Department', kind: 'record' });
  });

  it('rejects a biometric code with no machine (staff_biometric_scope_chk)', () => {
    const r = validateStaffBulkEditRow(row({ 'Biometric Code': '00002' }), ctx(), new Set());
    expect(r.issues[0]).toMatchObject({ field: 'Biometric Code', kind: 'format' });
  });

  it('rejects a biometric code already held on that machine, comparing normalised', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '002', 'Biometric Machine': 'JKKN Dental College and Hospital' }),
      ctx(),
      new Set()
    );
    expect(r.issues[0]).toMatchObject({ field: 'Biometric Code', kind: 'record' });
  });

  it('accepts a free biometric code with its machine', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '00007', 'Biometric Machine': 'JKKN Dental College and Hospital' }),
      ctx(),
      new Set()
    );
    expect(r.issues).toEqual([]);
    expect(r.updates).toEqual({ biometric_id: '00007', biometric_institution_id: INST_ID });
  });

  it('reports an unknown machine as a record issue', () => {
    const r = validateStaffBulkEditRow(
      row({ 'Biometric Code': '7', 'Biometric Machine': 'Hogwarts' }),
      ctx(),
      new Set()
    );
    expect(r.issues.some(i => i.field === 'Biometric Machine' && i.kind === 'record')).toBe(true);
  });

  it('never writes through a locked column', () => {
    const r = validateStaffBulkEditRow(
      row({ Institution: 'Some Other College', Name: 'Hacked', 'Staff ID (current)': 'XXX' }),
      ctx(),
      new Set()
    );
    expect(r.updates).toEqual({});
    expect(r.issues).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

```ts
/**
 * The ONE validator for staff bulk edit.
 *
 * Both /api/staff/bulk-edit/preview and /api/staff/bulk-edit/apply import and call this.
 * Neither route may inline a rule. In the learners' equivalent feature the preview route
 * imported its validator and never called it, so format errors first appeared AFTER the
 * write had run — exactly what a preview screen exists to prevent.
 *
 * Pure: no database access. The caller supplies every lookup through ValidationContext.
 */
import { validateEmail, validatePhone, parseFlexibleDate } from '@/lib/utils/staff-field-validators';
import {
  EDITABLE_COLUMNS,
  GENDERS,
  MARITAL_STATUSES,
  BLOOD_GROUPS,
  type StaffEditableField
} from './staff-bulk-edit-columns';

export interface BulkEditIssue {
  field: string;
  message: string;
  kind: 'format' | 'record';
}

export interface StaffLookupRow {
  id: string;
  institution_id: string;
  institution_email: string;
  [field: string]: unknown;
}

export interface ParsedStaffRow {
  rowNumber: number;
  institutionEmail: string;
  /** keyed by template header */
  cells: Record<string, string>;
}

export interface ValidationContext {
  /** lower(btrim(institution_email)) -> staff row, already scoped to accessible institutions */
  staffByEmail: Map<string, StaffLookupRow>;
  /** institution_id -> (lowercased department name -> id) */
  departmentsByInstitution: Map<string, Map<string, string>>;
  /** lowercased category name -> id */
  categoriesByName: Map<string, string>;
  /** lowercased institution name -> id (ALL institutions: a machine may belong to another) */
  institutionsByName: Map<string, string>;
  /** lowercased personal email -> owning staff id */
  emailOwner: Map<string, string>;
  /** lowercased staff_id -> owning staff id */
  staffIdOwner: Map<string, string>;
  /** `${institution_id}|${normalisedCode}` -> owning staff id */
  biometricOwner: Map<string, string>;
}

/**
 * Mirror of the SQL fn_norm_biometric_code. All-digit codes of 1..18 chars compare
 * numerically (00002 = 002 = 2); anything else is trimmed and uppercased. The 18-char
 * cap matches the SQL, which caps there so a long code cannot overflow bigint.
 */
export function normaliseBiometricCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const t = code.trim();
  if (t === '') return null;
  if (/^[0-9]{1,18}$/.test(t)) return BigInt(t).toString();
  return t.toUpperCase();
}

const norm = (v: string | null | undefined) => (v ?? '').trim();
const lower = (v: string | null | undefined) => norm(v).toLowerCase();

export function validateStaffBulkEditRow(
  row: ParsedStaffRow,
  ctx: ValidationContext,
  seenEmails: Set<string>
): { issues: BulkEditIssue[]; updates: Partial<Record<StaffEditableField, string | null>> } {
  const issues: BulkEditIssue[] = [];
  const updates: Partial<Record<StaffEditableField, string | null>> = {};

  const key = lower(row.institutionEmail);

  if (seenEmails.has(key)) {
    issues.push({
      field: 'Institution Email',
      kind: 'record',
      message: `${row.institutionEmail} appears more than once in this file.`
    });
    return { issues, updates };
  }

  const staff = ctx.staffByEmail.get(key);
  if (!staff) {
    issues.push({
      field: 'Institution Email',
      kind: 'record',
      message: `No staff member with institution email ${row.institutionEmail} was found in the institutions you can access.`
    });
    return { issues, updates };
  }

  // Read the biometric pair together — the DB CHECK couples them.
  const bioCodeRaw = norm(row.cells['Biometric Code']);
  const bioMachineRaw = norm(row.cells['Biometric Machine']);

  for (const col of EDITABLE_COLUMNS) {
    const raw = norm(row.cells[col.header]);
    if (raw === '') continue; // blank = leave unchanged, never clear

    switch (col.field) {
      case 'email': {
        if (!validateEmail(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a valid email address.` });
          break;
        }
        const owner = ctx.emailOwner.get(raw.toLowerCase());
        if (owner && owner !== staff.id) {
          issues.push({ field: col.header, kind: 'record', message: `${raw} already belongs to another staff member.` });
          break;
        }
        if (raw !== (staff.email as string)) updates.email = raw;
        break;
      }

      case 'phone': {
        if (!validatePhone(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a valid phone number (at least 10 digits).` });
          break;
        }
        if (raw !== (staff.phone as string)) updates.phone = raw;
        break;
      }

      case 'staff_id': {
        const owner = ctx.staffIdOwner.get(raw.toLowerCase());
        if (owner && owner !== staff.id) {
          issues.push({ field: col.header, kind: 'record', message: `Staff ID ${raw} already belongs to another staff member.` });
          break;
        }
        if (raw !== (staff.staff_id as string | null)) updates.staff_id = raw;
        break;
      }

      case 'pincode': {
        if (!/^\d{6}$/.test(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a 6-digit pincode.` });
          break;
        }
        if (raw !== (staff.pincode as string | null)) updates.pincode = raw;
        break;
      }

      case 'date_of_birth':
      case 'date_of_joining': {
        const parsed = parseFlexibleDate(raw);
        if (!parsed.isValid) {
          issues.push({ field: col.header, kind: 'format', message: parsed.error ?? `"${raw}" is not a valid date.` });
          break;
        }
        if (parsed.convertedDate !== (staff[col.field] as string | null)) {
          updates[col.field] = parsed.convertedDate;
        }
        break;
      }

      case 'gender':
      case 'marital_status': {
        const allowed = (col.field === 'gender' ? GENDERS : MARITAL_STATUSES) as readonly string[];
        const value = raw.toLowerCase();
        if (!allowed.includes(value)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not allowed. Use one of: ${allowed.join(', ')}.` });
          break;
        }
        if (value !== (staff[col.field] as string | null)) updates[col.field] = value;
        break;
      }

      case 'blood_group': {
        const match = (BLOOD_GROUPS as readonly string[]).find(b => b.toLowerCase() === raw.toLowerCase());
        if (!match) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not allowed. Use one of: ${BLOOD_GROUPS.join(', ')}.` });
          break;
        }
        if (match !== (staff.blood_group as string | null)) updates.blood_group = match;
        break;
      }

      case 'department_id': {
        const byName = ctx.departmentsByInstitution.get(staff.institution_id);
        const id = byName?.get(raw.toLowerCase());
        if (!id) {
          issues.push({ field: col.header, kind: 'record', message: `No department named "${raw}" exists in this person's institution.` });
          break;
        }
        if (id !== (staff.department_id as string | null)) updates.department_id = id;
        break;
      }

      case 'category_id': {
        const id = ctx.categoriesByName.get(raw.toLowerCase());
        if (!id) {
          issues.push({ field: col.header, kind: 'record', message: `No employment category named "${raw}" exists.` });
          break;
        }
        if (id !== (staff.category_id as string | null)) updates.category_id = id;
        break;
      }

      case 'biometric_id': {
        // The machine is validated in its own case below; here we only need the pair rule
        // and the uniqueness check, both of which need the resolved machine.
        if (bioMachineRaw === '') {
          issues.push({
            field: col.header,
            kind: 'format',
            message: 'A biometric code needs its machine. Fill in "Biometric Machine" as well, or clear the code.'
          });
          break;
        }
        const machineId = ctx.institutionsByName.get(bioMachineRaw.toLowerCase());
        if (!machineId) break; // the Biometric Machine case reports this

        const normalised = normaliseBiometricCode(raw);
        const owner = normalised ? ctx.biometricOwner.get(`${machineId}|${normalised}`) : undefined;
        if (owner && owner !== staff.id) {
          issues.push({
            field: col.header,
            kind: 'record',
            message: `Code ${raw} is already issued to another staff member on that machine (codes ignore leading zeros).`
          });
          break;
        }
        const currentNormalised = normaliseBiometricCode(staff.biometric_id as string | null);
        if (normalised !== currentNormalised || machineId !== (staff.biometric_institution_id as string | null)) {
          updates.biometric_id = raw;
        }
        break;
      }

      case 'biometric_institution_id': {
        const machineId = ctx.institutionsByName.get(raw.toLowerCase());
        if (!machineId) {
          issues.push({ field: col.header, kind: 'record', message: `No institution named "${raw}" exists, so it cannot own a machine.` });
          break;
        }
        if (machineId !== (staff.biometric_institution_id as string | null)) {
          updates.biometric_institution_id = machineId;
        }
        break;
      }

      default: {
        // plain text: address, state, district, designation
        if (raw !== (staff[col.field] as string | null)) updates[col.field] = raw;
      }
    }
  }

  // If the code changed but the machine cell was left blank while the person already has a
  // machine on file, keep the stored machine — the pair stays satisfied.
  if (updates.biometric_id !== undefined && updates.biometric_institution_id === undefined) {
    const machineId = ctx.institutionsByName.get(bioMachineRaw.toLowerCase());
    if (machineId) updates.biometric_institution_id = machineId;
  }

  return { issues, updates };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-validation.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/services/staff/staff-bulk-edit-validation.ts __tests__/staff/staff-bulk-edit-validation.test.ts
git commit -m "feat(staff): add the shared bulk-edit row validator"
```

---

### Task 4: The sheet parser

Turn an uploaded workbook into `ParsedStaffRow[]`. Selects the data sheet by inspecting headers —
the same technique `bulk-upload-staff.tsx` already uses, because `SheetNames[0]` is the
Instructions sheet after an Excel round-trip.

**Files:**
- Create: `lib/services/staff/staff-bulk-edit-parser.ts`
- Test: `__tests__/staff/staff-bulk-edit-parser.test.ts`

**Interfaces:**
- Consumes: `BULK_EDIT_COLUMNS`, `MATCH_KEY_HEADER` (Task 2); `ParsedStaffRow` (Task 3).
- Produces: `parseStaffBulkEditWorkbook(buffer: ArrayBuffer | Buffer): { rows: ParsedStaffRow[]; sheetName: string; error?: string }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/staff/staff-bulk-edit-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStaffBulkEditWorkbook } from '@/lib/services/staff/staff-bulk-edit-parser';

function build(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const HEADERS = ['Institution Email', 'Staff ID (current)', 'Name', 'Institution', 'Phone', 'Gender'];

describe('parseStaffBulkEditWorkbook', () => {
  it('reads the data sheet and keys cells by header', () => {
    const buf = build({
      Staff: [HEADERS, ['a@jkkn.ac.in', 'COP083', 'Nazeer', 'Dental', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.error).toBeUndefined();
    expect(out.sheetName).toBe('Staff');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].institutionEmail).toBe('a@jkkn.ac.in');
    expect(out.rows[0].cells.Phone).toBe('9000000001');
  });

  it('skips the Instructions sheet even when it comes first', () => {
    const buf = build({
      Instructions: [['How to use this template'], ['Blank means leave unchanged']],
      Staff: [HEADERS, ['a@jkkn.ac.in', '', 'Nazeer', 'Dental', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.sheetName).toBe('Staff');
    expect(out.rows).toHaveLength(1);
  });

  it('finds the data sheet even if it was renamed', () => {
    const buf = build({
      Instructions: [['notes']],
      'Staff (edited)': [HEADERS, ['a@jkkn.ac.in', '', 'N', 'D', '9000000001', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.sheetName).toBe('Staff (edited)');
  });

  it('tolerates reordered columns', () => {
    const buf = build({
      Staff: [
        ['Gender', 'Phone', 'Institution Email'],
        ['male', '9000000001', 'a@jkkn.ac.in']
      ]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows[0].institutionEmail).toBe('a@jkkn.ac.in');
    expect(out.rows[0].cells.Gender).toBe('male');
  });

  it('reports a workbook with no match-key column', () => {
    const buf = build({ Sheet1: [['Phone', 'Gender'], ['9000000001', 'male']] });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.error).toMatch(/Institution Email/);
    expect(out.rows).toEqual([]);
  });

  it('drops rows whose match key is blank', () => {
    const buf = build({
      Staff: [HEADERS, ['', '', '', '', '9000000001', 'male'], ['a@jkkn.ac.in', '', '', '', '9', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows).toHaveLength(1);
  });

  it('numbers rows by their real sheet position', () => {
    const buf = build({
      Staff: [HEADERS, ['a@jkkn.ac.in', '', '', '', '1', 'male'], ['b@jkkn.ac.in', '', '', '', '2', 'male']]
    });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows.map(r => r.rowNumber)).toEqual([2, 3]);
  });

  it('stringifies a date cell to YYYY-MM-DD', () => {
    const wb = XLSX.utils.book_new();
    const aoa = [
      ['Institution Email', 'Date of Birth'],
      ['a@jkkn.ac.in', new Date(Date.UTC(1990, 4, 2))]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Staff');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
    const out = parseStaffBulkEditWorkbook(buf);
    expect(out.rows[0].cells['Date of Birth']).toBe('1990-05-02');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

```ts
/**
 * Read an uploaded staff bulk-edit workbook into rows.
 *
 * The data sheet is found by INSPECTING HEADERS, not by index and not by name:
 * SheetNames[0] is the Instructions sheet after an Excel round-trip, and users rename
 * sheets. bulk-upload-staff.tsx uses the same technique for the same reason.
 *
 * Columns are read by header name, so reordering or inserting a column is harmless.
 */
import * as XLSX from 'xlsx';
import { BULK_EDIT_COLUMNS, MATCH_KEY_HEADER } from './staff-bulk-edit-columns';
import type { ParsedStaffRow } from './staff-bulk-edit-validation';

const KNOWN_HEADERS = new Set(BULK_EDIT_COLUMNS.map(c => c.header));

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`;
  }
  return String(value).trim();
}

export function parseStaffBulkEditWorkbook(
  buffer: ArrayBuffer | Buffer
): { rows: ParsedStaffRow[]; sheetName: string; error?: string } {
  const workbook = XLSX.read(buffer, { cellDates: true });

  let sheetName = '';
  let headerRow: string[] = [];

  for (const name of workbook.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      blankrows: false
    });
    if (aoa.length === 0) continue;
    const headers = (aoa[0] as unknown[]).map(h => cellToString(h));
    if (headers.includes(MATCH_KEY_HEADER)) {
      sheetName = name;
      headerRow = headers;
      break;
    }
  }

  if (!sheetName) {
    return {
      rows: [],
      sheetName: '',
      error: `No sheet in this file has an "${MATCH_KEY_HEADER}" column. Download a fresh template and fill that in.`
    };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false
  });

  const rows: ParsedStaffRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const values = aoa[i] as unknown[];
    const cells: Record<string, string> = {};
    headerRow.forEach((header, col) => {
      if (KNOWN_HEADERS.has(header)) cells[header] = cellToString(values?.[col]);
    });

    const institutionEmail = cells[MATCH_KEY_HEADER] ?? '';
    if (institutionEmail === '') continue; // blank key = spacer row

    rows.push({ rowNumber: i + 1, institutionEmail, cells });
  }

  return { rows, sheetName };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/staff/staff-bulk-edit-parser.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole staff test folder**

Run: `npx vitest run __tests__/staff/`
Expected: PASS — all four files, ~55 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/services/staff/staff-bulk-edit-parser.ts __tests__/staff/staff-bulk-edit-parser.test.ts
git commit -m "feat(staff): parse the bulk-edit workbook by header, not by position"
```

---

### Task 5: The service

Builds the `ValidationContext` from the database, runs the validator over every row, and writes.

**Files:**
- Create: `lib/services/staff/bulk-staff-edit-service.ts`
- Test: `__tests__/staff/bulk-staff-edit-service.test.ts` (counting semantics only — pure function, no DB)

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `interface BulkEditRow { rowNumber: number; institutionEmail: string; name: string; status: 'change' | 'nochange' | 'error'; changes: { field: string; from: string | null; to: string | null }[]; issues: BulkEditIssue[] }`
  - `interface BulkEditReport { total_rows: number; counts: { updated: number; skipped: number; failed: number }; rows: BulkEditRow[]; updated_staff: { id: string; institution_email: string }[] }`
  - `claimUniqueValues(ctx: ValidationContext, staff: StaffLookupRow, updates: Partial<Record<StaffEditableField, string | null>>): void` — registers the unique values a row just claimed so a later row in the same file collides with them
  - `class BulkStaffEditService`
    - `static async buildContext(emails: string[], accessibleInstitutionIds: string[]): Promise<ValidationContext>`
    - `static async evaluate(rows: ParsedStaffRow[], accessibleInstitutionIds: string[]): Promise<{ report: BulkEditReport; writes: Map<string, Partial<Record<StaffEditableField, string | null>>>; ctx: ValidationContext }>` — never writes. It returns `ctx` as well because `apply()` reuses the same lookup maps rather than rebuilding them.
    - `static async apply(rows: ParsedStaffRow[], accessibleInstitutionIds: string[], skipInvalid: boolean): Promise<{ report: BulkEditReport; refused: boolean }>`

- [ ] **Step 1: Write the failing test for counting semantics**

Create `__tests__/staff/bulk-staff-edit-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summariseRows } from '@/lib/services/staff/bulk-staff-edit-service';
import type { BulkEditRow } from '@/lib/services/staff/bulk-staff-edit-service';

const mk = (status: BulkEditRow['status'], n: number): BulkEditRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 2,
    institutionEmail: `s${i}@jkkn.ac.in`,
    name: `S ${i}`,
    status,
    changes: status === 'change' ? [{ field: 'Phone', from: '1', to: '2' }] : [],
    issues: status === 'error' ? [{ field: 'Phone', message: 'bad', kind: 'format' as const }] : []
  }));

describe('summariseRows', () => {
  it('counts written, skipped and failed separately', () => {
    const counts = summariseRows([...mk('change', 3), ...mk('nochange', 2), ...mk('error', 4)]);
    expect(counts).toEqual({ updated: 3, skipped: 2, failed: 4 });
  });

  it('reports an all-clean batch', () => {
    expect(summariseRows(mk('change', 5))).toEqual({ updated: 5, skipped: 0, failed: 0 });
  });

  it('reports a no-changes-needed batch', () => {
    expect(summariseRows(mk('nochange', 5))).toEqual({ updated: 0, skipped: 5, failed: 0 });
  });

  it('handles an empty batch', () => {
    expect(summariseRows([])).toEqual({ updated: 0, skipped: 0, failed: 0 });
  });
});

// Two rows of the SAME upload both claiming one new value is invisible to the per-row
// validator — neither value exists in the database yet. Without claimUniqueValues the
// second row validates clean and then 23505s at write time.
describe('claimUniqueValues', () => {
  const INST = 'inst-1';
  const ctx = () => ({
    staffByEmail: new Map(),
    departmentsByInstitution: new Map(),
    categoriesByName: new Map(),
    institutionsByName: new Map(),
    emailOwner: new Map<string, string>(),
    staffIdOwner: new Map<string, string>(),
    biometricOwner: new Map<string, string>()
  }) as any;

  const staff = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    institution_id: INST,
    institution_email: `${id}@jkkn.ac.in`,
    biometric_id: null,
    biometric_institution_id: null,
    ...over
  }) as any;

  it('claims a new personal email so a later row collides', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { email: 'New@JKKN.ac.in' });
    expect(c.emailOwner.get('new@jkkn.ac.in')).toBe('s1');
  });

  it('claims a new staff id case-insensitively', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { staff_id: 'COP900' });
    expect(c.staffIdOwner.get('cop900')).toBe('s1');
  });

  it('claims a biometric code normalised, against the new machine', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { biometric_id: '00002', biometric_institution_id: INST });
    expect(c.biometricOwner.get(`${INST}|2`)).toBe('s1');
  });

  it('falls back to the machine already on file when only the code changed', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1', { biometric_institution_id: INST }), { biometric_id: '7' });
    expect(c.biometricOwner.get(`${INST}|7`)).toBe('s1');
  });

  it('falls back to the code already on file when only the machine changed', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1', { biometric_id: '0009' }), { biometric_institution_id: INST });
    expect(c.biometricOwner.get(`${INST}|9`)).toBe('s1');
  });

  it('claims nothing when the row changed no unique field', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { phone: '9000000001' });
    expect(c.emailOwner.size).toBe(0);
    expect(c.staffIdOwner.size).toBe(0);
    expect(c.biometricOwner.size).toBe(0);
  });
});
```

Add `claimUniqueValues` to the import at the top of this test file alongside `summariseRows`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/staff/bulk-staff-edit-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `lib/services/staff/bulk-staff-edit-service.ts`. Follow the shape of an existing
`BaseService` subclass — read `lib/services/staff/staff-service.ts` first for the house style.

```ts
/**
 * Staff bulk edit: build the lookup context, evaluate every row, then write.
 *
 * evaluate() is what BOTH preview and apply run. apply() calls evaluate() first and never
 * trusts a client-supplied preview.
 */
import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import {
  validateStaffBulkEditRow,
  normaliseBiometricCode,
  type ParsedStaffRow,
  type ValidationContext,
  type BulkEditIssue,
  type StaffLookupRow
} from './staff-bulk-edit-validation';
import { EDITABLE_COLUMNS, type StaffEditableField } from './staff-bulk-edit-columns';

export interface BulkEditRow {
  rowNumber: number;
  institutionEmail: string;
  name: string;
  status: 'change' | 'nochange' | 'error';
  changes: { field: string; from: string | null; to: string | null }[];
  issues: BulkEditIssue[];
}

export interface BulkEditReport {
  total_rows: number;
  counts: { updated: number; skipped: number; failed: number };
  rows: BulkEditRow[];
  updated_staff: { id: string; institution_email: string }[];
}

/**
 * Register the unique values a row has just claimed, so a LATER row in the same file
 * collides with them.
 *
 * Why this exists: validateStaffBulkEditRow is per-row and pure. It catches a value that
 * is already owned in the DATABASE (via ctx.emailOwner / ctx.staffIdOwner /
 * ctx.biometricOwner), but it cannot see that two DIFFERENT rows of the same upload both
 * claim the same NEW Personal Email or Staff ID — neither is in the database yet, so both
 * validate cleanly and the second one raises 23505 at write time. That is precisely the
 * late failure the preview screen exists to prevent.
 *
 * Exported so it can be unit-tested without a database.
 */
export function claimUniqueValues(
  ctx: ValidationContext,
  staff: StaffLookupRow,
  updates: Partial<Record<StaffEditableField, string | null>>
): void {
  if (updates.email) {
    ctx.emailOwner.set(String(updates.email).toLowerCase(), staff.id);
  }
  if (updates.staff_id) {
    ctx.staffIdOwner.set(String(updates.staff_id).toLowerCase(), staff.id);
  }
  // The pair is coupled: a code claims a slot on a machine. Use the new value where the
  // row supplied one, otherwise what is already on file — the same "effective pair" rule
  // the validator uses.
  const machine =
    (updates.biometric_institution_id as string | null) ??
    (staff.biometric_institution_id as string | null);
  const code = normaliseBiometricCode(
    (updates.biometric_id as string | null) ?? (staff.biometric_id as string | null)
  );
  if (machine && code) {
    ctx.biometricOwner.set(`${machine}|${code}`, staff.id);
  }
}

/** Exported for unit test. `updated` counts rows that WILL be / WERE written. */
export function summariseRows(rows: BulkEditRow[]) {
  return {
    updated: rows.filter(r => r.status === 'change').length,
    skipped: rows.filter(r => r.status === 'nochange').length,
    failed: rows.filter(r => r.status === 'error').length
  };
}

/** PostgREST URLs blow past the length limit on long IN lists and return 400. */
const CHUNK = 200;
function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class BulkStaffEditService extends BaseService {
  static async buildContext(
    emails: string[],
    accessibleInstitutionIds: string[]
  ): Promise<ValidationContext> {
    const supabase = this.supabase as any;
    const keys = Array.from(new Set(emails.map(e => e.trim().toLowerCase()))).filter(Boolean);

    // ── staff rows for the uploaded emails, scoped to accessible institutions ──
    // NOTE: no `institutions` embed here on purpose. If you ever add one, it MUST be
    // institutions!staff_institution_id_fkey(...) or PostgREST raises PGRST201.
    const staffByEmail = new Map<string, StaffLookupRow>();
    const selectCols = [
      'id', 'institution_id', 'institution_email', 'first_name', 'last_name',
      ...EDITABLE_COLUMNS.map(c => c.field)
    ].join(', ');

    for (const part of chunk(keys)) {
      let q = supabase.from('staff').select(selectCols).in('institution_email', part);

      // An EMPTY accessibleInstitutionIds means "ALL institutions", NOT "none".
      // createApiInstitutionFilter (lib/auth/api-institution-filter.ts) returns
      // `institutionIds: []` for a super admin and for admission-global roles, with the
      // comment "Empty means access to all"; the repo's own applyInstitutionFilterToQuery
      // encodes the same convention (`if (isSuperAdmin || institutionIds.length === 0)
      // return query`). Calling .in('institution_id', []) would match ZERO rows, so every
      // row would report "not found" for exactly the users who can see everything.
      //
      // Branch on the list being empty — never on an isSuperAdmin flag. Branching on
      // isSuperAdmin silently strips access from scope='all' secondary roles.
      if (accessibleInstitutionIds.length > 0) {
        q = q.in('institution_id', accessibleInstitutionIds);
      }

      const { data, error } = await q;
      if (error) throw new Error(getErrorMessage(error));
      for (const row of data ?? []) {
        staffByEmail.set(String(row.institution_email).trim().toLowerCase(), row as StaffLookupRow);
      }
    }

    // ── uniqueness owners: personal email, staff_id, biometric (machine, code) ──
    const emailOwner = new Map<string, string>();
    const staffIdOwner = new Map<string, string>();
    const biometricOwner = new Map<string, string>();
    {
      const { data, error } = await supabase
        .from('staff')
        .select('id, email, staff_id, biometric_id, biometric_institution_id');
      if (error) throw new Error(getErrorMessage(error));
      for (const r of data ?? []) {
        if (r.email) emailOwner.set(String(r.email).toLowerCase(), r.id);
        if (r.staff_id) staffIdOwner.set(String(r.staff_id).toLowerCase(), r.id);
        const code = normaliseBiometricCode(r.biometric_id);
        if (code && r.biometric_institution_id) {
          biometricOwner.set(`${r.biometric_institution_id}|${code}`, r.id);
        }
      }
    }

    // ── name -> id lookups ──
    const departmentsByInstitution = new Map<string, Map<string, string>>();
    {
      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name, institution_id');
      if (error) throw new Error(getErrorMessage(error));
      for (const d of data ?? []) {
        if (!departmentsByInstitution.has(d.institution_id)) {
          departmentsByInstitution.set(d.institution_id, new Map());
        }
        departmentsByInstitution
          .get(d.institution_id)!
          .set(String(d.department_name).trim().toLowerCase(), d.id);
      }
    }

    const categoriesByName = new Map<string, string>();
    {
      const { data, error } = await supabase.from('employment_categories').select('id, category_name');
      if (error) throw new Error(getErrorMessage(error));
      for (const c of data ?? []) categoriesByName.set(String(c.category_name).trim().toLowerCase(), c.id);
    }

    // ALL institutions — a biometric machine may belong to another institution.
    const institutionsByName = new Map<string, string>();
    {
      const { data, error } = await supabase.from('institutions').select('id, name');
      if (error) throw new Error(getErrorMessage(error));
      for (const i of data ?? []) institutionsByName.set(String(i.name).trim().toLowerCase(), i.id);
    }

    return {
      staffByEmail,
      departmentsByInstitution,
      categoriesByName,
      institutionsByName,
      emailOwner,
      staffIdOwner,
      biometricOwner
    };
  }

  static async evaluate(rows: ParsedStaffRow[], accessibleInstitutionIds: string[]) {
    const ctx = await this.buildContext(rows.map(r => r.institutionEmail), accessibleInstitutionIds);
    const seen = new Set<string>();
    const reportRows: BulkEditRow[] = [];
    const writes = new Map<string, Partial<Record<StaffEditableField, string | null>>>();

    const headerOf = new Map(EDITABLE_COLUMNS.map(c => [c.field, c.header] as const));

    for (const row of rows) {
      const key = row.institutionEmail.trim().toLowerCase();
      const { issues, updates } = validateStaffBulkEditRow(row, ctx, seen);
      seen.add(key);

      const staff = ctx.staffByEmail.get(key);
      const name = staff ? `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim() : '';

      if (issues.length > 0) {
        reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'error', changes: [], issues });
        continue;
      }

      const changes = Object.entries(updates).map(([field, to]) => ({
        field: headerOf.get(field as StaffEditableField) ?? field,
        from: (staff?.[field] as string | null) ?? null,
        to: (to as string | null) ?? null
      }));

      if (changes.length === 0) {
        reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'nochange', changes: [], issues: [] });
        continue;
      }

      reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'change', changes, issues: [] });
      if (staff) {
        writes.set(staff.id, updates);

        // CLAIM the newly-taken unique values into ctx as we go.
        //
        // validateStaffBulkEditRow is per-row and pure, so on its own it cannot see that
        // TWO DIFFERENT rows in the same file both claim the same new Personal Email or
        // Staff ID. `seen` only tracks the match key (Institution Email). Without this
        // block, both rows validate cleanly and the second one raises 23505 at write time
        // — the exact class of late failure the preview screen exists to prevent.
        // Registering the claim here makes the later row collide in ctx.emailOwner /
        // ctx.staffIdOwner / ctx.biometricOwner and surface as a `record` issue instead.
        claimUniqueValues(ctx, staff, updates);
      }
    }

    const report: BulkEditReport = {
      total_rows: rows.length,
      counts: summariseRows(reportRows),
      rows: reportRows,
      updated_staff: []
    };
    return { report, writes, ctx };
  }

  static async apply(
    rows: ParsedStaffRow[],
    accessibleInstitutionIds: string[],
    skipInvalid: boolean
  ): Promise<{ report: BulkEditReport; refused: boolean }> {
    const { report, writes, ctx } = await this.evaluate(rows, accessibleInstitutionIds);

    // The gate is enforced HERE, on the server. The UI switch only sends the flag.
    if (report.counts.failed > 0 && !skipInvalid) {
      return { report, refused: true };
    }

    const supabase = this.supabase as any;
    const updated: { id: string; institution_email: string }[] = [];

    for (const [staffId, updates] of writes) {
      // '' -> null for the nullable FK, or Postgres raises 22P02.
      const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
      if (payload.biometric_institution_id === '') payload.biometric_institution_id = null;

      const { error } = await supabase.from('staff').update(payload).eq('id', staffId);

      if (error) {
        const row = report.rows.find(r => ctx.staffByEmail.get(r.institutionEmail.toLowerCase())?.id === staffId);
        if (row) {
          row.status = 'error';
          row.changes = [];
          row.issues = [{ field: 'Institution Email', kind: 'record', message: getErrorMessage(error) }];
        }
        continue;
      }

      const email = ctx.staffByEmail.get(
        [...ctx.staffByEmail.entries()].find(([, s]) => s.id === staffId)?.[0] ?? ''
      )?.institution_email;
      updated.push({ id: staffId, institution_email: email ?? '' });
    }

    report.counts = summariseRows(report.rows);
    report.updated_staff = updated;
    return { report, refused: false };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/staff/bulk-staff-edit-service.test.ts`
Expected: PASS (10 tests — 4 for `summariseRows`, 6 for `claimUniqueValues`).

- [ ] **Step 5: Commit**

```bash
git add lib/services/staff/bulk-staff-edit-service.ts __tests__/staff/bulk-staff-edit-service.test.ts
git commit -m "feat(staff): add the bulk-edit service (context, evaluate, apply)"
```

---

### Task 6: Template route

**Files:**
- Create: `app/api/staff/bulk-edit/template/route.ts`

**Interfaces:**
- Consumes: `BULK_EDIT_COLUMNS` (Task 2).
- Produces: `GET /api/staff/bulk-edit/template` → `.xlsx`.

- [ ] **Step 1: Write the route**

Mirror the auth and `connection()` pattern of `app/api/staff/export/route.ts`, and build the
workbook with ExcelJS (SheetJS's community build cannot write dropdowns).

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { BULK_EDIT_COLUMNS, EDITABLE_COLUMNS } from '@/lib/services/staff/staff-bulk-edit-columns';
import { BaseService } from '@/lib/services/base-service';

export const GET = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id') || undefined;
    const departmentId = url.searchParams.get('department_id') || undefined;
    const categoryId = url.searchParams.get('category_id') || undefined;

    const supabase = (BaseService as any).supabase;
    let query = supabase
      .from('staff')
      .select(
        'id, institution_email, staff_id, first_name, last_name, institution_id, ' +
          'phone, email, date_of_birth, gender, marital_status, blood_group, address, state, district, pincode, ' +
          'designation, date_of_joining, department_id, category_id, biometric_id, biometric_institution_id, ' +
          'institution:institutions!staff_institution_id_fkey(id, name), ' +
          'department:departments(id, department_name), ' +
          'category:employment_categories(id, category_name)'
      )
      .order('first_name', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (departmentId) query = query.eq('department_id', departmentId);
    if (categoryId) query = query.eq('category_id', categoryId);

    const { data: staff, error } = await query;
    if (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }

    // Machine names for the Biometric Machine dropdown — ALL institutions.
    // `id` is REQUIRED here, not just `name`: the row loop below does
    // `institutions.find(i => i.id === s.biometric_institution_id)`. Selecting only `name`
    // makes that find() never match, so every Biometric Machine cell renders blank —
    // silently, with no error. Invisible in today's data (biometric_institution_id is NULL
    // for all 864 staff) and it would start lying the moment anyone sets one.
    const { data: institutions, error: institutionsError } = await supabase
      .from('institutions')
      .select('id, name')
      .order('name');
    if (institutionsError) {
      return NextResponse.json({ error: getErrorMessage(institutionsError) }, { status: 400 });
    }

    const wb = new ExcelJS.Workbook();

    // ── Instructions ────────────────────────────────────────────────
    const help = wb.addWorksheet('Instructions');
    help.columns = [{ width: 32 }, { width: 90 }];
    help.addRow(['Staff Bulk Edit', '']);
    help.addRow(['', '']);
    help.addRow(['Blank cell', 'Leaves the field unchanged. Bulk edit never clears a field and never creates staff.']);
    help.addRow(['Institution Email', 'The match key. Do not edit it, and do not delete the column.']);
    help.addRow(['Locked columns', 'Institution Email, Staff ID (current), Name, Institution are ignored on upload.']);
    help.addRow(['', '']);
    for (const col of BULK_EDIT_COLUMNS) {
      if (col.note) help.addRow([col.header, col.note]);
      if (col.enumValues) help.addRow([`${col.header} — allowed`, col.enumValues.join(', ')]);
    }

    // ── Staff ───────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Staff');
    ws.columns = BULK_EDIT_COLUMNS.map(c => ({
      header: c.header,
      key: c.header,
      width: Math.max(16, Math.min(40, c.header.length + 8))
    }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const s of staff ?? []) {
      ws.addRow({
        // RAW institution_email — never displayEmail(). 124 staff hold a synthetic
        // @nolog.jkkn.local address and that IS their key.
        'Institution Email': s.institution_email,
        'Staff ID (current)': s.staff_id ?? '',
        Name: `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
        Institution: s.institution?.name ?? '',
        Phone: s.phone ?? '',
        'Personal Email': s.email ?? '',
        'Date of Birth': s.date_of_birth ?? '',
        Gender: s.gender ?? '',
        'Marital Status': s.marital_status ?? '',
        'Blood Group': s.blood_group ?? '',
        Address: s.address ?? '',
        State: s.state ?? '',
        District: s.district ?? '',
        Pincode: s.pincode ?? '',
        'Staff ID (new)': s.staff_id ?? '',
        Designation: s.designation ?? '',
        'Date of Joining': s.date_of_joining ?? '',
        Department: s.department?.department_name ?? '',
        Category: s.category?.category_name ?? '',
        'Biometric Code': s.biometric_id ?? '',
        'Biometric Machine': (institutions ?? []).find((i: any) => i.id === s.biometric_institution_id)?.name ?? ''
      });
    }

    // Dropdowns on the enum columns, for rows 2..(n+500) so pasted rows keep them.
    const lastRow = (staff?.length ?? 0) + 500;
    BULK_EDIT_COLUMNS.forEach((col, idx) => {
      if (!col.enumValues) return;
      const letter = ws.getColumn(idx + 1).letter;
      for (let r = 2; r <= lastRow; r++) {
        ws.getCell(`${letter}${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${col.enumValues.join(',')}"`]
        };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="staff-bulk-edit-${new Date().toISOString().slice(0, 10)}.xlsx"`
      }
    });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requirePermission: 'staff.manage_imports' });
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "bulk-edit/template"`
Expected: no output.

- [ ] **Step 3: Verify it downloads**

Start the dev server (`npm run dev`), sign in, and open
`http://localhost:3000/api/staff/bulk-edit/template` in the browser.
Expected: an `.xlsx` downloads; opening it shows an `Instructions` sheet and a `Staff` sheet whose
first column is `Institution Email` populated with real addresses (including some
`@nolog.jkkn.local` ones), and `Gender` shows a dropdown.

- [ ] **Step 4: Commit**

```bash
git add app/api/staff/bulk-edit/template/route.ts
git commit -m "feat(staff): pre-filled bulk-edit template with validated dropdowns"
```

---

### Task 7: Preview route

**Files:**
- Create: `app/api/staff/bulk-edit/preview/route.ts`

**Interfaces:**
- Consumes: `parseStaffBulkEditWorkbook` (Task 4), `BulkStaffEditService.evaluate` (Task 5).
- Produces: `POST /api/staff/bulk-edit/preview` → `BulkEditReport`. Writes nothing.

- [ ] **Step 1: Write the route**

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { parseStaffBulkEditWorkbook } from '@/lib/services/staff/staff-bulk-edit-parser';
import { BulkStaffEditService } from '@/lib/services/staff/bulk-staff-edit-service';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export const POST = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const parsed = parseStaffBulkEditWorkbook(await file.arrayBuffer());
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'That sheet has no data rows.' }, { status: 400 });
    }

    // Scope from accessible institution IDs — never from branching on isSuperAdmin,
    // which silently strips scope='all' secondary roles.
    // NOTE: `lib/auth/institution-scope.ts` exists but exports resolveInstitutionScope /
    // canAccessAllInstitutions — there is NO resolveAccessibleInstitutionIds. Use
    // createApiInstitutionFilter, which carries the BUG-004195 fix (calling the
    // SECURITY INVOKER RPC through the session-bearing server client rather than the
    // browser singleton, which would yield auth.uid() = null and 403 every non-super-admin).
    const filter = await createApiInstitutionFilter(request, { requireInstitutionAccess: true });
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'No institution access' }, { status: 403 });
    }
    // Pass institutionIds through UNMODIFIED — an empty array means ALL institutions
    // (super-admin / admission-global bypass). The service handles it via
    // scopesToInstitutions(). Never branch on filter.isSuperAdmin here.
    const accessible = filter.institutionIds;

    const { report } = await BulkStaffEditService.evaluate(parsed.rows, accessible);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requirePermission: 'staff.manage_imports' });
```

- [ ] **Step 2: Use the EXISTING scope helper — do not write a new one**

`lib/auth/api-institution-filter.ts` already exports `createApiInstitutionFilter`, returning:

```ts
export interface ApiInstitutionFilterResult {
  isAllowed: boolean;
  institutionIds: string[];
  reason?: string;
  userRole?: string;
  isSuperAdmin: boolean;
}
```

**Do not write your own RPC call.** That file carries a load-bearing fix (BUG-004195): the
`get_user_accessible_institutions` RPC is SECURITY INVOKER, so calling it through the browser
singleton server-side gives `auth.uid() = null`, RLS returns zero rows, and **every**
non-super-admin 403s with "User has no institution access". `createApiInstitutionFilter` calls it
through the session-bearing server client. Reimplementing it reintroduces that bug.

So the preview route becomes:

```ts
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

const filter = await createApiInstitutionFilter(request, { requireInstitutionAccess: true });
if (!filter.isAllowed) {
  return NextResponse.json({ error: filter.reason ?? 'No institution access' }, { status: 403 });
}
const { report } = await BulkStaffEditService.evaluate(parsed.rows, filter.institutionIds);
```

Read `createApiInstitutionFilter`'s signature at `lib/auth/api-institution-filter.ts:22` and match
its actual options object; adjust the call above if it differs. Apply the identical change in
Task 8's apply route.

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "bulk-edit/preview"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/staff/bulk-edit/preview/route.ts
git commit -m "feat(staff): bulk-edit preview route (validates, writes nothing)"
```

---

### Task 8: Apply route

**Files:**
- Create: `app/api/staff/bulk-edit/apply/route.ts`

**Interfaces:**
- Consumes: `parseStaffBulkEditWorkbook` (Task 4), `BulkStaffEditService.apply` (Task 5), `createApiInstitutionFilter` (`lib/auth/api-institution-filter.ts`, same as Task 7).
- Produces: `POST /api/staff/bulk-edit/apply` → `BulkEditReport`, status `200` or `400`.

- [ ] **Step 1: Write the route**

```ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { parseStaffBulkEditWorkbook } from '@/lib/services/staff/staff-bulk-edit-parser';
import { BulkStaffEditService } from '@/lib/services/staff/bulk-staff-edit-service';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export const POST = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }
    // The switch only SENDS this. The server is what enforces it.
    const skipInvalid = form.get('skipInvalid') === 'true';

    const parsed = parseStaffBulkEditWorkbook(await file.arrayBuffer());
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // NOTE: `lib/auth/institution-scope.ts` exists but exports resolveInstitutionScope /
    // canAccessAllInstitutions — there is NO resolveAccessibleInstitutionIds. Use
    // createApiInstitutionFilter, which carries the BUG-004195 fix (calling the
    // SECURITY INVOKER RPC through the session-bearing server client rather than the
    // browser singleton, which would yield auth.uid() = null and 403 every non-super-admin).
    const filter = await createApiInstitutionFilter(request, { requireInstitutionAccess: true });
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'No institution access' }, { status: 403 });
    }
    // Pass institutionIds through UNMODIFIED — an empty array means ALL institutions
    // (super-admin / admission-global bypass). The service handles it via
    // scopesToInstitutions(). Never branch on filter.isSuperAdmin here.
    const accessible = filter.institutionIds;
    const { report, refused } = await BulkStaffEditService.apply(parsed.rows, accessible, skipInvalid);

    // Refused batches return the FULL success-shaped report at 400 so the typed client
    // can render it. A partial success must never be rendered as a total failure.
    return NextResponse.json(report, { status: refused ? 400 : 200 });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requirePermission: 'staff.manage_imports' });
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "bulk-edit/apply"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/staff/bulk-edit/apply/route.ts
git commit -m "feat(staff): bulk-edit apply route with a server-enforced skipInvalid gate"
```

---

### Task 9: The dialog

**Files:**
- Create: `app/(routes)/staff/list/_components/bulk-edit-staff-dialog.tsx`

**Interfaces:**
- Consumes: `BulkEditReport`, `BulkEditRow` (Task 5); the three routes (Tasks 6–8).
- Produces: `export function BulkEditStaffDialog(): JSX.Element`

Read `app/(routes)/learners/profiles/_components/bulk-edit-exited-dialog.tsx` first — it is the
reference implementation of this exact five-state shell (step rail at lines ~430–510, per-step
panels from ~511). Mirror its structure; do not copy its learner-specific fields.

- [ ] **Step 1: Build the state machine and shell**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Upload, Download, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useQueryClient } from '@tanstack/react-query';
// NOTE: two different `staffKeys` exist — lib/query-keys.ts:116 and hooks/staff/use-staff.ts:28.
// The staff list reads through the hook's copy, so import THAT one. Both root at ['staff'],
// and React Query matches by prefix, so invalidating `staffKeys.all` clears list, stats and detail.
import { staffKeys } from '@/hooks/staff/use-staff';
import type { BulkEditReport, BulkEditRow } from '@/lib/services/staff/bulk-staff-edit-service';

type Step = 'select' | 'preview' | 'validate' | 'uploading' | 'result';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'select',   label: 'Upload' },
  { key: 'preview',  label: 'Review' },
  { key: 'validate', label: 'Validation' },
  { key: 'result',   label: 'Summary' }
];

const STEP_BLURB: Record<Step, string> = {
  select:    'Download the sheet, change only the cells you want to update, and upload it back',
  preview:   'What will change — nothing has been written yet',
  validate:  'Every rule the update enforces, checked before anything is written',
  uploading: 'Applying your changes…',
  result:    'Finished — this is exactly what was written'
};

export function BulkEditStaffDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<BulkEditReport | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const queryClient = useQueryClient();

  const reset = () => {
    setStep('select');
    setFile(null);
    setReport(null);
    setSkipInvalid(false);
  };

  const activeIndex = STEPS.findIndex(s => s.key === (step === 'uploading' ? 'validate' : step));

  // ... panels below
}
```

- [ ] **Step 2: Add the preview call**

```tsx
  async function runPreview() {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/staff/bulk-edit/preview', { method: 'POST', body });
    const json = await res.json();
    if (!res.ok && json?.total_rows === undefined) {
      toast.error(json?.error ?? 'Could not read that file.');
      return;
    }
    setReport(json as BulkEditReport);
    setStep('preview');
  }
```

- [ ] **Step 3: Add the apply call — render the report, do not throw it away**

```tsx
  async function runApply() {
    if (!file) return;
    setStep('uploading');
    const body = new FormData();
    body.append('file', file);
    body.append('skipInvalid', String(skipInvalid));

    const res = await fetch('/api/staff/bulk-edit/apply', { method: 'POST', body });
    const json = await res.json();

    // A refused batch comes back at 400 WITH a full report. Render it. Only a body with
    // no report at all (transport/permission) is a real failure.
    if (json?.total_rows === undefined) {
      toast.error(json?.error ?? 'The update could not be applied.');
      setStep('validate');
      return;
    }

    setReport(json as BulkEditReport);
    setStep('result');

    if ((json.counts?.updated ?? 0) > 0) {
      await queryClient.invalidateQueries({ queryKey: staffKeys.all });
    }
  }
```

- [ ] **Step 4: Add the validation panel with the two issue groups**

```tsx
  const errorRows = (report?.rows ?? []).filter(r => r.status === 'error');
  const formatRows = errorRows.filter(r => r.issues.some(i => i.kind === 'format'));
  const recordRows = errorRows.filter(r => r.issues.some(i => i.kind === 'record'));
```

Render `formatRows` under the heading **"Fix the cell"** with the sub-line
*"These values are the wrong shape. Correct them in the sheet and upload again."*, and `recordRows`
under **"Fix the record"** with *"These rows point at something that does not exist or is already
taken."* Each row shows its sheet row number, the person's name, the column and the message.

The gate switch sits below both groups, labelled
**"Skip the rows with problems and update the rest"**, with helper text
*"Off: nothing is written until every row is clean."*

- [ ] **Step 5: Add the result banner**

```tsx
  function resultBanner(r: BulkEditReport) {
    const { updated, skipped, failed } = r.counts;
    if (updated === 0 && failed === 0) return { tone: 'neutral', text: 'Nothing needed changing — every row already matched the sheet.' };
    if (failed === 0) return { tone: 'success', text: `All done. ${updated} staff updated${skipped ? `, ${skipped} already up to date` : ''}.` };
    if (updated === 0) return { tone: 'error', text: `Nothing was written. ${failed} rows have problems that need fixing first.` };
    return { tone: 'warning', text: `Partly done. ${updated} updated, ${failed} skipped because of problems.` };
  }
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "bulk-edit-staff-dialog"`
Expected: no output.

`staffKeys` is confirmed to exist at `hooks/staff/use-staff.ts:28` with `all`, `lists()`, `list()`,
`detail()`, `stats()`. Import from there, not from `lib/query-keys.ts` (which defines a second,
differently-shaped `staffKeys` that the list does not use).

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/staff/list/_components/bulk-edit-staff-dialog.tsx"
git commit -m "feat(staff): five-step bulk-edit dialog"
```

---

### Task 10: Mount it and run the smoke sheet

**Files:**
- Modify: `app/(routes)/staff/list/page.tsx` (the action bar, around line 264)

**Interfaces:**
- Consumes: `BulkEditStaffDialog` (Task 9).
- Produces: the feature, reachable.

- [ ] **Step 1: Mount the button**

Add the import beside the other bulk components:

```tsx
import { BulkEditStaffDialog } from './_components/bulk-edit-staff-dialog';
```

and derive the gate next to the existing `canEditStaff` / `canCreateStaff` lines (around line 77):

```tsx
// Mirrors the routes' server-side gate exactly. All three bulk-edit routes use
// withAuth(..., { requirePermission: 'staff.manage_imports' }), so gating the button on
// anything looser (e.g. staff.edit, held by 72 of 88 roles) shows a button that 403s.
const canManageStaffImports = isSuperAdmin || canAccess('staff', 'manage_imports');
```

and place it in the action bar, inside the existing `!isOwnRecordsScope` block:

```tsx
{canViewStaff && <DownloadStaffTemplateButton />}
{canCreateStaff && <BulkUploadStaff />}
{canManageStaffImports && <BulkEditStaffDialog />}
{isSuperAdmin && <CreateMissingProfilesButton />}
{canEditStaff && <BulkUploadStaffImages />}
```

- [ ] **Step 2: Run every test in the feature**

Run: `npx vitest run __tests__/staff/`
Expected: PASS — 5 files, ~59 tests.

- [ ] **Step 3: Typecheck the touched files**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "bulk-edit|staff-field-validators|staff/list/page"`
Expected: no output.

- [ ] **Step 4: Build the smoke sheet**

Download the template from the running app, then edit it to contain exactly these rows:

| Row | Content | Expected |
|---|---|---|
| 1 | change `Phone` and `Address` on a real person | `updated` |
| 2 | a real person, no cell changed | `skipped` |
| 3 | `Personal Email` = `not-an-email` | *fix the cell* |
| 4 | `Gender` = `Female ` (padded, wrong case) | accepted, written as `female` |
| 5 | `Institution Email` = `ghost@jkkn.ac.in` | *fix the record* — not found |
| 6 | a staff member from an institution you cannot access | *fix the record* — not found |
| 7 | `Biometric Code` = `00002`, `Biometric Machine` blank | *fix the cell* — pair rule |
| 8 | `Biometric Code` = `002` where someone already holds `2` on that machine | *fix the record* — normalised clash |
| 9 | `Staff ID (new)` = an existing `staff_id` from another person | *fix the record* |
| 10 | duplicate of row 1's `Institution Email` | *fix the record* — twice in file |
| 11 | a DIFFERENT staff member given the SAME new `Personal Email` as row 1 | *fix the record* — claimed earlier in this file |
| 12 | a DIFFERENT staff member given the SAME new `Staff ID (new)` as row 9 | *fix the record* — claimed earlier in this file |

**Rows 11–12 are the only check on `claimUniqueValues`' live wiring — do not skip them.** That
function is unit-tested in isolation, but the cross-row collision *through* `evaluate()`'s loop has
no unit test. Neither value exists in the database yet, so only a real two-row upload proves the
claim is registered and the later row collides. Row 10 does **not** cover this: it duplicates the
match key, which `seenEmails` catches by a completely different mechanism. Without rows 11–12 the
second row validates clean and raises `23505` at write time — exactly the failure this feature
exists to prevent.

- [ ] **Step 5: Run the gate in both positions**

Upload with the switch **off**.
Expected: the result step says nothing was written; confirm in the DB that row 1's phone is unchanged:
`SELECT phone FROM staff WHERE institution_email = '<row 1 email>';`

Upload again with the switch **on**.
Expected: banner reads *"Partly done"*; rows 1 and 4 written, row 2 skipped, the rest failed; the
staff table refreshes without a page reload. Confirm:
`SELECT phone, gender FROM staff WHERE institution_email IN ('<row 1>', '<row 4>');`

- [ ] **Step 6: Verify a SUPER ADMIN sees rows (the highest-risk untested path)**

`createApiInstitutionFilter` returns `institutionIds: []` for a super admin, meaning *all
institutions*. If any layer filters with `.in('institution_id', [])`, it matches zero rows and
**every** row reports "not found" — while the data is perfectly fine.

Sign in as a super admin, download the template and upload it unmodified.
Expected: every row comes back `skipped` (no changes needed).
A result of "N rows not found" means the empty-list-means-all convention was broken somewhere.

Then repeat as a **non**-super-admin with access to exactly one institution. Expected: their own
institution's rows resolve, and a row from an institution they cannot access reports
*fix the record — not found*. Both directions must work; testing only one hides the bug.

- [ ] **Step 7: Verify the synthetic-email path**

Include one `@nolog.jkkn.local` staff member in the sheet and change their `Phone`.
Expected: matched and updated — this is the 14% of staff that a `displayEmail()` template would have
broken.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/staff/list/page.tsx"
git commit -m "feat(staff): mount bulk edit in the staff list action bar"
```

---

## Self-review notes

- **Spec coverage.** §4 gating → Task 10. §5 template → Tasks 2 and 6. §6 steps → Task 9. §7 gate → Tasks 8 and 9. §8 no-drift → Tasks 3, 5, 7, 8 (one validator, imported by both routes). §9 contracts → Tasks 5, 7, 8. §10 files → all tasks. §11 traps → Global Constraints. §12 smoke sheet → Task 10.
- **Naming is consistent across tasks:** `validateStaffBulkEditRow`, `normaliseBiometricCode`, `parseStaffBulkEditWorkbook`, `BulkStaffEditService.evaluate/apply`, `summariseRows`, `BULK_EDIT_COLUMNS`, `EDITABLE_COLUMNS`, `MATCH_KEY_HEADER`.
- **Both open questions were resolved against the repo while writing this plan**, and the answers changed the plan:
  - Institution scope: `createApiInstitutionFilter` (`lib/auth/api-institution-filter.ts:22`) already exists and contains the BUG-004195 fix. Task 7 now *reuses* it instead of creating `lib/auth/institution-scope.ts`, which would have reintroduced a 403-for-every-non-super-admin bug.
  - Query key: there is no `queryKeys.staff`. The list uses `staffKeys` from `hooks/staff/use-staff.ts:28`; a **second, differently-shaped `staffKeys` also exists** at `lib/query-keys.ts:116`. Task 9 imports the hook's copy.
- **Known repo inconsistencies this plan deliberately does not fix** (out of scope, flagged for later): the duplicate `staffKeys` definitions, and the incorrect header comment in `bulk-upload-staff.tsx` claiming `staff_institution_email_key` is a composite `(email, institution)` constraint when it is `UNIQUE (institution_email)`.
