# Payroll Organisation — Bulk Edit via Excel

**Date:** 2026-08-05
**Module:** `/hr/payroll/organisation`
**Permission keys:** `hr.payroll.institution.view` (read), `hr.payroll.institution.manage` (write)

## Problem

The Payroll Organisation directory records **who pays** each of ~744 active staff. Today a
payer is set one row at a time, or by selecting rows on the current page and picking one
organisation from the toolbar. Neither reaches the real workload: 104 people at JKKN Main
Office have no payer at all, and they are spread across ~40 roles, so page-by-page
selection is slow and error-prone.

Operators want to work in Excel: export what exists, fill in the payer column offline,
upload it back, and see exactly what changed before anything is written.

## Scope

**In scope.** Export the directory (respecting the on-screen filters) to `.xlsx` with a
dropdown on the payer column; re-upload that sheet to set/change payers through a five-step
dialog with a real validation gate and a result report.

**Out of scope.** Creating or deactivating staff; editing name/role/work location (the sheet
carries them as read-only reference); changing which organisations run payroll;
adding institution scoping to the write RLS policy (see *Known gap*).

## Decisions

Settled with the requester on 2026-08-05:

1. **The payer dropdown lists only the 13 organisations with `is_payroll_entity = true`.**
   JKKN Main Office is excluded. `hr_staff_payroll` carries
   `CHECK (is_payroll_entity)` plus a composite FK
   `hr_staff_payroll_org_must_run_payroll (hr_organization_id, is_payroll_entity)
   REFERENCES hr_organizations(id, is_payroll_entity)`, so a Main Office assignment is
   rejected by the database. Offering it would guarantee failed rows.
2. **A blank `New Payer` cell means "no change".** The row is counted as skipped and the
   existing assignment is untouched. This is what lets an operator export all 744 rows,
   fill in only the 104 they care about, and upload the whole sheet safely. Clearing a
   payer stays a per-row action on the table (the existing ✕ button).
3. **The export contains whatever the filters currently show.** "Works at = JKKN Main
   Office" exports exactly those 104 rows. The Instructions sheet records which filters
   were applied, so a sheet is self-describing weeks later.

## Architecture

### Export — client-side, deliberately

The page already holds every row (`useStaffPayerDirectory`) and owns the filter state, and
the filters are applied in memory by `matchesDirectoryFilters`. Building the workbook in
the browser reuses that predicate directly.

A server-side `/template/route.ts` — the more common shape in this repo — would need a
**second copy of the filter logic**. That duplication is exactly what caused the
2026-08-05 defect where the "Works at" dropdown advertised 104 rows the table could not
produce. One predicate, one meaning.

Writes go through `lib/utils/excel-compat.ts`, a SheetJS-shaped wrapper over ExcelJS
already used for this purpose. `XLSXCompat.writeFile(wb, filename)` is browser-only and
downloads directly; dropdowns come from a `!dataValidation` array on the worksheet, and it
already handles spilling >255 chars of list into a hidden `_ValidCodes` sheet.

### Workbook shape

Sheet `Payroll Organisation` — one row per exported staff member:

| Col | Header | Source | Role |
|-----|--------|--------|------|
| A | `Staff ID` | `staff_uuid` | **identity — must not be edited** |
| B | `Staff Code` | `staff_code` | reference |
| C | `Team Member` | `person_name` | reference |
| D | `Role` | `role_title` | reference |
| E | `Works At` | `works_at_name` | reference |
| F | `Current Payer` | `payer_org_name` | reference (blank = awaiting) |
| G | `New Payer` | *empty* | **the only editable column**, dropdown |

Column A is the match key, **not** Staff Code. 101 of the 104 JKKN Main Office staff have a
NULL `staff_id` (staff code) — the exact population this feature exists to serve — so code
cannot identify a row. Column A stays visible rather than hidden, because a hidden column
is deleted by accident more often than an obviously-labelled one.

Plus two supporting sheets:
- `Lists` (hidden) — the 13 payroll organisation names backing the column G dropdown.
- `Instructions` — what to edit, what a blank cell means, and the filters this export was
  taken under.

Filename: `payroll-organisation-<yyyy-mm-dd>.xlsx`.

### Upload — five steps

Mirrors `app/(routes)/learners/profiles/_components/bulk-edit-exited-dialog.tsx`, the
reference implementation for this shape in this repo, and billing's bulk-create before it.

```
Upload  →  Review changes  →  Validation  →  Writing…  →  Result
```

- **Upload.** Drop the `.xlsx`. Read with SheetJS. Pick the data sheet **by name**
  (`Payroll Organisation`), not by index — a user who reorders sheets otherwise silently
  imports the Instructions tab. Columns are located **by header text**, not by position,
  so inserting a scratch column does not corrupt the import; `Staff ID` and `New Payer`
  are the only two required headers, and a sheet missing either is rejected whole with a
  message naming the header, rather than importing 700 rows of nothing. Reference columns
  (B–F) are ignored on read: they are there for the human, and the database is the truth
  for everything except column G. Rows added by hand below the exported set are validated
  like any other — a real uuid is accepted, anything else becomes a record issue.
- **Review changes.** Per row: current payer → new payer, and whether that is a set, a
  change, or no change. Nothing is written yet.
- **Validation.** Every rule the write enforces, checked first. Issues are split by where
  the fix lives, because a flat list hides that:
  - **format** (fix the cell) — `New Payer` is not one of the 13 organisation names;
    `Staff ID` is not a well-formed uuid.
  - **record** (fix the source) — `Staff ID` is not in your directory (unknown, inactive,
    or outside your institution scope); the same `Staff ID` appears on more than one row.
- **Gate.** A `skipInvalid` switch. Off (the default) ⇒ refuse the batch, write nothing,
  and show the report. On ⇒ write the valid rows and report the rest.

  The learner flow enforces this in an API route. This module has none — reads and writes
  go straight to the browser Supabase client, because RLS is the enforcement point and a
  route would only re-wrap it. So the gate lives in **`setPayersFromRows` itself**, which
  refuses a report carrying errors unless `skipInvalid` is set. That makes it one choke
  point every caller must pass through rather than a conditional in the dialog, which is
  the strongest form available without inventing a route. It is a data-quality guard, not
  a security boundary; permission remains RLS's job.
- **Writing…** then **Result**, which opens with a plain-language banner —
  all updated / partially updated / nothing updated / no changes needed.

### Validation is the scope enforcement

`hr_staff_payroll`'s write policy gates on `user_has_permission('hr.payroll.institution.manage')`
**alone** — it carries no institution predicate — while the read RPC
`hr_staff_payroll_directory()` applies `role_has_institution_access(s.institution_id)`.

The database will therefore accept a payer row for a staff member the uploader cannot see.
With selection-driven bulk assign this is harmless: you can only select rendered rows. A
spreadsheet removes that accident-proofing, because any uuid can be typed into column A.

So: **every uploaded `Staff ID` is matched against the in-memory directory, which is
already scope-filtered by the RPC, and unmatched ids are rejected as record issues.** This
is not merely a nicety — it is what keeps the bulk path inside the uploader's scope.

### Write path

One new service method:

```ts
StaffPayrollService.setPayersFromRows(
  supabase: SupabaseClient,
  rows: Array<{ staffId: string; hrOrganizationId: string }>
): Promise<void>
```

A single `upsert` with `onConflict: 'staff_id'` (a real UNIQUE constraint on the table).
The existing `setPayersBulk` cannot be reused: it forces **one** organisation for every
staff id, and an uploaded sheet assigns different organisations per row.

`is_payroll_entity` is not passed — it is defaulted on the table and constrained by the
composite FK, the same as the existing `setPayer`/`setPayersBulk` writes.

### Counting semantics

Preserved from the learner flow so the two screens report the same way:

- `updated` — a row that was written.
- `skipped` — a row with no actual change: blank `New Payer`, or the new payer equals the
  current one.
- `failed` — a row rejected by validation.

## Files

```
app/(routes)/hr/payroll/organisation/_components/
  bulk-payer-workbook.ts          build + download the export
  bulk-payer-parse.ts             parse sheet → typed rows → validation report
  bulk-payer-upload-dialog.tsx    the five-step UI
  payer-directory-filters.tsx     (unchanged — reuses matchesDirectoryFilters)
app/(routes)/hr/payroll/organisation/page.tsx
                                  Export + Bulk Edit buttons, gated on canManage
lib/services/hr/payroll/staff-payroll-service.ts
                                  + setPayersFromRows
hooks/hr/use-staff-payroll.ts     + useSetStaffPayersFromRows (invalidates directory
                                    + awaitingPayer, same as the other mutations)
```

Split three ways on purpose: the reference dialog is 1,534 lines in a single file, and the
parse/validate logic is the part worth reading and exercising on its own.

## Error handling

- Supabase errors are plain objects — surface them with `getErrorMessage()`, never
  `err instanceof Error`.
- The upsert's `{ error }` is always destructured and checked; an RLS denial or an FK
  violation arrives there, not as a throw.
- A partial write must never be rendered as total failure: the result step renders whenever
  a report exists, and only throws when there is no report at all (transport/permission).

## Verification

CLAUDE.md says there is no test runner. That is out of date: **vitest 4.1.7 is installed
and `vitest.config.js` is configured** (node environment, `@` alias), with 143 test files
and 1,693 tests under `__tests__/`. There is simply no `test` npm script — run
`npx vitest run <path>`. 14 tests across 22 files already fail on `main`; those are
pre-existing and must not be mistaken for regressions from this work.

The parse/validate core is pure and gets real tests, modelled on
`__tests__/procurement/quotation-import.test.ts`, which builds a real `.xlsx` in memory and
feeds it through the parser.

"Done" means:

1. New tests pass; touched files lint clean; `tsc --noEmit` reports no errors in the module.
2. Exercised in a browser against live data with a deliberate smoke sheet:
   one clean assignment, one unknown organisation name (format issue), one bogus uuid
   (format issue), one uuid for an inactive/out-of-scope staff member (record issue), one
   duplicated Staff ID (record issue), one blank `New Payer` (skipped), and one row whose
   `New Payer` equals its current payer (skipped). That hits every branch, both gate
   positions, and all three counters in one upload.
3. Round-trip check: export a filtered set, change nothing, re-upload — expect
   "no changes needed" and zero writes.

## Known gap (not addressed here)

`hr_staff_payroll_write` has no institution scoping. Closing it means adding a
`role_has_institution_access(...)` predicate over the staff row, which affects the existing
per-row and toolbar bulk assigns too. It is a one-policy migration with its own blast
radius and should be scoped separately.
