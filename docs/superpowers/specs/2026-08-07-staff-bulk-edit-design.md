# Staff Bulk Edit — Design

**Date:** 2026-08-07
**Module:** Staff (`/staff/list`)
**Status:** Approved, ready for implementation planning

---

## 1. Problem

`/staff/list` can bulk **create** (`bulk-upload-staff.tsx`), bulk-upload **images**, download a
**template** and **export**. There is no way to bulk **correct** existing staff.

Three concrete corrections are waiting on this:

- **198 of 864 staff (23%) have no `staff_id`.**
- ~400 staff have no biometric enrolment, so they are invisible to the attendance import
  (`20260806120000_staff_biometric_identity.sql`). The import wizard maps in bulk; single
  corrections currently require opening each staff form.
- Routine contact/personal drift (phone, address, blood group) after an HR data audit.

## 2. Scope

**In scope.** A five-step bulk edit of existing staff from a filled spreadsheet:
`select → preview → validate → uploading → result`.

**Out of scope — deliberately.**

| Excluded | Why |
|---|---|
| `institution_id` | Re-tenants a person. Changes RLS visibility across the app. |
| `role_key` | RBAC. Grants/revokes permissions in bulk. |
| `is_active`, `login_enabled` | Access control; can lock a person out. |
| `employment_type` | No CHECK constraint, absent from `staff-form-schema.ts` and `types/staff.ts`, and all 864 rows hold the same value. Including it would mean inventing a vocabulary. |
| Creating staff | Already exists (`bulk-upload-staff.tsx`). A row that does not match is an **error**, never an insert. |
| Deleting or clearing fields | A blank cell means *leave unchanged*. Clearing is a single-record operation. |

## 3. Evidence that shaped the design

Measured against the live `staff` table (864 rows) on 2026-08-07.

### 3.1 The match key must be `institution_email`

| Candidate | Blank | Distinct | DB constraint | Verdict |
|---|---|---|---|---|
| `staff_id` | **198 (23%)** | 665 of 666 | `staff_staff_id_key UNIQUE (staff_id)` — case-sensitive | ✗ 23% unmatchable |
| `institution_email` | **0** | **864 of 864** | `staff_institution_email_key UNIQUE (institution_email)` | ✓ **match key** |

`institution_email` is **globally unique at the database level**, not per-institution. Note that
the header comment in `bulk-upload-staff.tsx` claims "Email + Institution combination must be
unique (enforced by `staff_institution_email_key`)" — that is **wrong**; the constraint is
`UNIQUE (institution_email)` alone. Do not propagate the comment's claim.

`staff_id` is unique *when present*, but the index is case-sensitive, so variants coexist:

```
[cop083]  KLNCFWDKF;Qe';qwe   akdhd@jkkn.ac.in          <- junk test record
[COP083]  MR. ABDUL NAZEER    abdulnazeer_m@jkkn.ac.in
```

Both satisfy `UNIQUE (staff_id)`. A case-insensitive match on `staff_id` would be ambiguous.

**Even so, matching is defensive:** resolve by `lower(btrim(institution_email))` and if the lookup
returns anything other than exactly one row *within the caller's accessible institutions*, emit a
`record` issue (`not_found` or `ambiguous`). Never guess.

### 3.2 The template must write the RAW `institution_email`, never `displayEmail()`

**124 of 864 staff (14%) hold a synthetic institution email** at `@nolog.jkkn.local` — the
view-only / labour staff (drivers, security) who have no real address. `staff.email` and
`staff.institution_email` are both `NOT NULL` and `UNIQUE`, so
`lib/services/staff/synthetic-email.ts` generates a deterministic placeholder
(`staff.<slug>.institution@nolog.jkkn.local`) to satisfy those constraints.

`app/api/staff/export/route.ts` imports `displayEmail()` to *hide* these from exports. The bulk-edit
template **must not** do that: the synthetic address is the real stored value and therefore the real
match key. Rendering `displayEmail()` in the `Institution Email` column would leave 14% of rows
unmatchable on re-upload.

The `Institution Email` column is locked, so the user never has to look at it — but it must carry the
true value.

(119 staff also hold a synthetic *personal* `email`. That column is editable; the template shows the
stored value as-is. Note the synthetic address is derived from `staff_id`/`phone`, so editing a
view-only staff member's `Staff ID (new)` leaves their synthetic email stale. That is cosmetic drift,
not breakage — the stored values remain valid and unique — and is out of scope to reconcile.)

### 3.3 Editable columns that carry their own UNIQUE index

Two of the editable fields can raise `23505` on write, so validation must check them **both
within the file and against the database**:

- `staff_email_key UNIQUE (email)` — personal email is globally unique.
- `staff_staff_id_key UNIQUE (staff_id)` — case-sensitive.

### 3.4 Authoritative value vocabularies (from DB CHECK constraints)

These are the source of truth for the template dropdowns and the validator — not the form schema,
which can drift.

| Column | Constraint | Allowed |
|---|---|---|
| `gender` | `staff_gender_check` | `male`, `female`, `bigender` |
| `marital_status` | `staff_marital_status_check` | `single`, `married`, `divorced`, `widow` |
| `blood_group` | `staff_blood_group_check` | `A+ A- B+ B- AB+ AB- O+ O- A1+ A1B` (NULL permitted) |
| `staff_id` | `staff_staff_id_not_empty` | NULL, or length > 0 |
| `biometric_id` + `biometric_institution_id` | `staff_biometric_scope_chk` | a code requires a machine |

Stored values are lowercase (`male`, `married`). Compare case-insensitively, **write lowercase**.

### 3.5 Biometric pair rules

- `staff_biometric_scope_chk` — a code without a machine is rejected by the database.
- `staff_biometric_uq` — `UNIQUE (biometric_institution_id, fn_norm_biometric_code(biometric_id))`
  where the code is non-blank. `fn_norm_biometric_code` makes all-digit codes compare numerically,
  so **`00002`, `002` and `2` are the same code**. Duplicate detection must normalise the same way,
  both within the file and against the database.
- `biometric_institution_id` is the institution that **owns the machine** — deliberately *not*
  `staff.institution_id`; staff routinely punch on another institution's machine. Its value must
  therefore be validated against *all* institutions, not just the row's own institution.

## 4. Entry point and permission gating

A `<BulkEditStaffDialog />` button in the existing action bar of
`app/(routes)/staff/list/page.tsx`, beside `<BulkUploadStaff />`:

```tsx
{!isOwnRecordsScope && (
  <div className='flex flex-wrap items-center gap-2 mb-6'>
    {canViewStaff && <DownloadStaffTemplateButton />}
    {canCreateStaff && <BulkUploadStaff />}
    {canEditStaff && <BulkEditStaffDialog />}   {/* new */}
    {isSuperAdmin && <CreateMissingProfilesButton />}
    {canEditStaff && <BulkUploadStaffImages />}
  </div>
)}
```

Gate on the **existing** `canEditStaff = isSuperAdmin || canAccess('staff', 'edit')`.

**No new permission key.** In this codebase a key only exists once it is present in each role's
`custom_roles.permissions` JSONB; declaring one in `lib/constants/permissions.ts` without a grant
migration produces a silently empty UI. Reusing `staff.edit` needs no migration and cannot regress.

Inside `!isOwnRecordsScope` for the same reason the other bulk actions are: an `own_records` user's
list is a single row.

## 5. The template

`GET /api/staff/bulk-edit/template`

Returns an `.xlsx` **pre-filled with the current values** of the staff the caller can see, honouring
the list's active filters (institution, department, category, search, active). Editing in place is
what makes this usable for correction work — you can see what is there before changing it.

**Two sheets.** The data sheet is named **`Staff`** and is located **by name**, never by index —
`SheetNames[0]` is not stable across Excel round-trips. The second sheet, `Instructions`, holds the
rules and the allowed values.

**Columns are matched by header name, never by position.** Reordering or inserting a column in
Excel must not corrupt the import.

| Block | Column header | Writes to | Notes |
|---|---|---|---|
| Identify | `Institution Email` | — | **match key**, locked, RAW value — never `displayEmail()` (§3.2) |
| Identify | `Staff ID (current)` | — | locked; for human recognition |
| Identify | `Name` | — | locked |
| Identify | `Institution` | — | locked |
| Personal | `Phone` | `phone` | |
| Personal | `Personal Email` | `email` | UNIQUE — see 3.2 |
| Personal | `Date of Birth` | `date_of_birth` | |
| Personal | `Gender` | `gender` | dropdown |
| Personal | `Marital Status` | `marital_status` | dropdown |
| Personal | `Blood Group` | `blood_group` | dropdown |
| Personal | `Address` | `address` | |
| Personal | `State` | `state` | |
| Personal | `District` | `district` | |
| Personal | `Pincode` | `pincode` | |
| Employment | `Staff ID (new)` | `staff_id` | UNIQUE — fills the 198 blanks |
| Employment | `Designation` | `designation` | |
| Employment | `Date of Joining` | `date_of_joining` | |
| Employment | `Department` | `department_id` | by name, resolved within the row's institution |
| Employment | `Category` | `category_id` | by name |
| Biometric | `Biometric Code` | `biometric_id` | |
| Biometric | `Biometric Machine` | `biometric_institution_id` | institution by name; **any** institution |

**Blank editable cell = leave unchanged.** Bulk edit never clears a field.

Because the template arrives pre-filled, a blank cell arises in exactly two ways, and **both mean
the same thing — no change**:

- the stored value is already empty (e.g. the 198 missing `staff_id`, the 119 null `blood_group`);
- the user deleted the contents of a cell. This is treated as *leave unchanged*, **not** as
  *clear the field*. Clearing a field is a single-record operation, done in the staff form.

This is also mostly forced by the schema: `gender`, `date_of_birth`, `marital_status`, `email`,
`phone`, `designation`, `date_of_joining` and `category_id` are all `NOT NULL`, so "clear" is not
a legal outcome for most of the sheet.

Locked columns are written to the sheet but ignored on import. Do not rely on Excel sheet
protection to enforce this — the server ignores them regardless.

## 6. The five steps

### Step 1 — Select
Download the template, or upload a filled one. Shows the file name, the resolved sheet name and
the parsed row count. Date cells are read with `cellDates: true`, and text dates go through the
existing tolerant multi-format parser (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`).

### Step 2 — Preview
*"What will change. Nothing has been written."*

One row per **changed** staff member, listing each changed field as **old → new**. Header counters:
rows with changes, rows with no changes, rows not matched.

### Step 3 — Validate
Every rule the write enforces, run before anything is written. Issues are grouped by **where the
fix lives** — a flat error list hides this distinction:

**Fix the cell (`format`)**
- `Personal Email` fails `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `Phone` fails `/^\+?[\d\s-()]{10,}$/`
- `Date of Birth` / `Date of Joining` unparseable
- `Gender`, `Marital Status`, `Blood Group` outside the §3.4 vocabulary
- `Pincode` not 6 digits
- `Staff ID (new)` present but blank/whitespace-only (violates `staff_staff_id_not_empty`)
- `Biometric Code` present with no `Biometric Machine` (violates `staff_biometric_scope_chk`)

**Fix the record (`record`)**
- `Institution Email` not found, or outside the caller's accessible institutions
- `Institution Email` matched more than one row → **ambiguous**, never guessed
- the same `Institution Email` appears twice in the file
- `Department` / `Category` name not found (department resolved within the row's institution)
- `Biometric Machine` name is not a real institution
- `Personal Email` or `Staff ID (new)` already belongs to another staff member, or is duplicated
  within the file (would raise `23505`)
- `Biometric Code` already issued to someone else on that machine, compared through
  `fn_norm_biometric_code` (would violate `staff_biometric_uq`)

### Step 4 — Uploading
Progress state.

### Step 5 — Result
Opens with a plain-language banner: **all updated / partially updated / nothing updated / no
changes needed**, over three counters:

| Counter | Meaning |
|---|---|
| `updated` | actually written |
| `skipped` | matched, but no cell differed from the stored value |
| `failed` | rejected by validation or record resolution |

Failed rows download as an error sheet carrying the original row number and its issues.

## 7. The gate

A `skipInvalid` switch, **enforced on the server**, not merely in the UI:

- **off (default)** — refuse the batch, write **nothing**, return `400` whose body is the *full
  success-shaped report* (with `updated_staff: []`) so the typed client can render it.
- **on** — write the valid rows, report the rest.

The client renders the report whenever the body carries `total_rows`, and only throws when there is
no report at all (transport or permission failure). A partial success must never be rendered as a
total failure.

## 8. Validation must not drift

`preview` and `apply` **call the same exported function** from
`lib/services/staff/staff-bulk-edit-validation.ts`. Neither route may inline a rule.

This is the single most important structural requirement in this document. In the learners'
equivalent feature the preview route imported the validator and never called it, so format errors
first appeared *after* the write had run — exactly what a preview screen exists to prevent.

`apply` re-runs the full validation server-side. It never trusts a client-supplied preview.

## 9. API contracts

```
GET  /api/staff/bulk-edit/template   -> xlsx  (query: same filters as the list)
POST /api/staff/bulk-edit/preview    -> BulkEditReport   (multipart: file)          writes nothing
POST /api/staff/bulk-edit/apply      -> BulkEditReport   (multipart: file, skipInvalid)
```

```ts
interface BulkEditIssue {
  field: string;                       // template header, e.g. 'Personal Email'
  message: string;
  kind: 'format' | 'record';
}

interface BulkEditRow {
  rowNumber: number;                   // 1-based sheet row, for the error sheet
  institutionEmail: string;
  name: string;
  status: 'change' | 'nochange' | 'error';
  changes: { field: string; from: string | null; to: string | null }[];
  issues: BulkEditIssue[];
}

interface BulkEditReport {
  total_rows: number;                  // presence of this key = "render me"
  counts: { updated: number; skipped: number; failed: number };
  rows: BulkEditRow[];
  updated_staff: { id: string; institution_email: string }[];
}
```

All three routes wrap their body in `withAuth` (`lib/auth/with-auth.ts`) so `BaseService.supabase`
resolves to the request-scoped client and RLS sees the real user.

## 10. Files

**New**

```
app/(routes)/staff/list/_components/bulk-edit-staff-dialog.tsx   five-step dialog + step rail
app/api/staff/bulk-edit/template/route.ts                        pre-filled xlsx
app/api/staff/bulk-edit/preview/route.ts                         diff + validate; writes nothing
app/api/staff/bulk-edit/apply/route.ts                           re-validate, then write
lib/services/staff/bulk-staff-edit-service.ts                    BaseService: parse, resolve, diff, write
lib/services/staff/staff-bulk-edit-validation.ts                 the ONE validator both routes call
```

**Modified**

```
app/(routes)/staff/list/page.tsx                                 mount the button in the action bar
lib/query/query-keys.ts                                          invalidate the staff list after apply
```

**Targeted extraction (not speculative refactoring).** `bulk-upload-staff.tsx` already contains
`validateEmail`, `validatePhone` and the tolerant multi-format date parser. Move them to a shared
module and have both the upload and the edit path import them, so the two flows cannot disagree
about what a valid phone number is. Nothing else in that 1,451-line file is touched.

**No migration.** This writes existing columns through the existing staff `UPDATE` policy.

## 11. Repo-specific traps this design accounts for

- **Sheet by name, columns by header name** — never by index.
- **`'' → null`** for `biometric_institution_id` before write; an empty string reaches Postgres as a
  literal and raises `22P02`.
- **Never fire-and-forget a Supabase mutation** — destructure and check `{ error }`. `try/catch`
  does not catch RLS denials or constraint violations.
- **Supabase errors are plain objects**, not `Error` instances — surface them with `getErrorMessage()`.
- **Chunk `.in()` lookups** (institution emails, department and category names); a long list makes
  the URL exceed the limit and returns `400`.
- **Institution scope comes from the accessible-institution IDs**, never from branching on
  `isSuperAdmin` — that silently strips `scope='all'` secondary roles.
- **Case-insensitive compare, lowercase write** for `gender` and `marital_status`.
- **`fn_norm_biometric_code`** for every biometric duplicate comparison.
- **`staff` embeds `institutions` with the explicit FK hint** `institutions!staff_institution_id_fkey`
  (see `20260806140000_staff_biometric_drop_institution_fk.sql`); any new query in this feature that
  embeds institutions on staff must do the same or it will fail with `PGRST201`.

## 12. Smoke sheet

One upload that exercises every branch:

| Row | Content | Expected |
|---|---|---|
| 1 | valid phone + address change | `updated` |
| 2 | every editable cell blank | `skipped` (no changes) |
| 3 | `Personal Email` = `not-an-email` | `format` issue |
| 4 | `Gender` = `Male ` (padded, wrong case) | accepted, written as `male` |
| 5 | `Institution Email` not in the database | `record` — not found |
| 6 | `Institution Email` of another institution | `record` — outside scope |
| 7 | `Biometric Code` filled, `Biometric Machine` blank | `format` — pair rule |
| 8 | `Biometric Code` `002` where another staff holds `2` on that machine | `record` — normalised clash |
| 9 | `Staff ID (new)` duplicating an existing `staff_id` | `record` — would raise `23505` |
| 10 | same `Institution Email` as row 1 | `record` — duplicate in file |

Run once with `skipInvalid` off (expect: nothing written, `400`, full report rendered) and once with
it on (expect: rows 1 and 4 written, 2 skipped, the rest failed).

**On testing.** `CLAUDE.md` states this repo has no test runner. That is out of date: there is a
`vitest.config.js`, **150 test files under `__tests__/`**, and `vitest ^4.1.7` in `devDependencies`
— there is simply no `npm test` script. Verified on 2026-08-07:
`npx vitest run __tests__/accreditation/my-gaps-worklist.test.ts` → 38 passed in 446 ms, with the
`@` alias resolving.

Verification for this feature is therefore three-layered:

1. **Unit tests (`npx vitest run`)** for the pure logic — the validator, the code normaliser, the
   header/column contract and the sheet parser. This is where the correctness rules in §3 live, and
   they are all pure functions.
2. **Typecheck** the touched files.
3. **Browser**, using the smoke sheet above in both gate positions.
