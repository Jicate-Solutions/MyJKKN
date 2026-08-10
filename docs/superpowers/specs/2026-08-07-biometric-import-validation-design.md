# Biometric import — pre-commit validation

**Date:** 2026-08-07
**Module:** HR › Attendance › Import Biometric Punches (`/hr/attendance/import`)
**Builds on:** `docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md`

## Problem

The importer resolves an employee only by their stored enrolment code. Everything
else about the upload is either unchecked or reported *after* the write:

1. **No staff-existence report.** `unmatched_codes` lists codes that matched no
   staff row, but cannot distinguish "this person is not our employee" from
   "this person is our employee whose code nobody has linked yet". Those need
   opposite responses.
2. **No uniqueness check on the file.** Postgres already guarantees uniqueness on
   the *table* (below), but nothing checks the *upload*. Two employee blocks
   sharing a code both match the same staff row, and the commit's
   `upsert(onConflict: 'employee_id,work_date')` silently keeps whichever landed
   last — one person's month overwritten by another's, with no error.
3. **Silent write-time losses.** `skipped_no_organization` (`route.ts:417`) drops
   days for any staff member whose institution has no `hr_organizations` row. The
   count is only visible in the response, after the data is gone.
4. **Zero-match reads as success.** With no codes linked, the route returns
   HTTP 200 and `"Imported 0 day-record(s) for 0 employee(s)"`.

### What the database already guarantees

Verified against the live database on 2026-08-07:

| Index / constraint | Definition |
| --- | --- |
| `staff_staff_id_key` | `UNIQUE (staff_id)` |
| `staff_biometric_uq` | `UNIQUE (biometric_institution_id, fn_norm_biometric_code(biometric_id))`, partial `WHERE biometric_id IS NOT NULL AND btrim(biometric_id) <> ''` |
| `staff_biometric_scope_chk` | `CHECK` — a `biometric_id` requires a `biometric_institution_id` |

A duplicate staff ID, or a duplicate enrolment code on one machine, is already
impossible to insert. **This spec adds no uniqueness constraints.** It adds the
checks that live *upstream* of the database, where nothing looks today.

### Live data state (2026-08-07)

| Fact | Value | Consequence |
| --- | --- | --- |
| Staff rows | 864 | — |
| Staff with a `biometric_id` | **0** | Every upload currently matches zero employees |
| `hr_attendance_records` | **0** | No import has ever succeeded |
| Duplicate `staff_id` values | **0** | Uniqueness holds |
| Staff with null/blank `staff_id` | **198** (23%) | `UNIQUE` permits unlimited NULLs |
| `hr_shift_timings` | 196 | Evaluation config is in place |

## Approach

Extend the existing dry-run report rather than adding a validation endpoint.

The module's founding invariant is stated at `app/api/hr/attendance/import/route.ts:22`:
*"TWO MODES, ONE CODE PATH: everything above the write is identical for dryRun=true
and dryRun=false, so the preview cannot disagree with the commit."* A separate
`/validate` endpoint would re-parse the file, re-resolve the institution and
re-query staff — two round trips and two chances to disagree with what the commit
actually does. Computing validation client-side was also rejected: the client
cannot be a gate, and `/api/hr/biometric-mapping/suggest` is gated on `staff.edit`
while import is gated on `hr.attendance.override`, so an importer without
`staff.edit` would get a 403 and no validation at all.

## Components

### 1. `lib/hr/biometric/validate-upload.ts` (new, pure)

Synchronous and dependency-free so it can be tested beside
`scripts/biometric-parser.test.ts`.

Validation runs in **two phases**, because one of the five blocks depends on work
the evaluation loop has not done yet. `unreconciled_totals` derives from the
`reconciled` flag, which is only known after every day of every matched employee
has been evaluated (`route.ts:314-469`). So:

```ts
/** Phase 1 — structural. Everything knowable from the file + roster alone. */
export function validateUpload(input: {
  employees: BiometricEmployee[];        // from parseMonthlyReportFile
  staff: ValidationStaffRow[];           // FULL roster, not just this machine
  machineInstitutionId: string;
  organisationByInstitution: Map<string, string>;
}): BiometricUploadValidation

/** Phase 2 — called after the evaluation loop. Appends the reconciliation block
 *  and derives can_import / requires_acknowledgement from the complete set. */
export function finaliseValidation(
  validation: BiometricUploadValidation,
  unreconciled: Array<{ code: string; name: string }>,
): BiometricUploadValidation
```

`can_import` and `requires_acknowledgement` are computed **only** in
`finaliseValidation`, so no caller can read a half-formed verdict. Phase 1
returns them as `false`/`false` placeholders that phase 2 overwrites.

`ValidationStaffRow` is the projection the route already selects, plus the two
biometric columns:

```ts
export interface ValidationStaffRow {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  institution_id: string | null;
  biometric_id: string | null;
  biometric_institution_id: string | null;
}
```

#### Three-way staff resolution

Per employee block, in order:

| Outcome | Rule | Importable |
| --- | --- | --- |
| `linked` | `normBiometricCode(emp.code)` matches a staff row whose `biometric_institution_id` is this machine | **yes** |
| `unlinked_match` | not linked; `normPersonName(emp.name)` matches **exactly one** staff row | no — route to Link codes |
| `ambiguous_match` | not linked; `normPersonName(emp.name)` matches **2 or more** staff rows | no — needs a manual link |
| `absent` | not linked; no name match | no — excluded, listed by code + device name |

> **Do not extend name matching into the import path.** `lib/hr/biometric/normalize-name.ts`
> documents why: honorific-stripped matching reaches 36 of 48 on the real July
> export — *"75% is fine for a suggestion someone reviews; it is not fine for
> silently attributing a month of attendance."* Name matching here only
> **classifies** a row for a human to act on. `unlinked_match` and
> `ambiguous_match` are **never importable**; only a stored code makes a row
> importable.

#### Duplicate detection

Group employee blocks by `normBiometricCode(emp.code)` — the **normalised** key,
never the raw string. `normBiometricCode` compares all-digit codes numerically, so
`0017` and `017` are one code; comparing raw strings would miss it until Postgres
rejected it.

- key with 2+ blocks → `duplicate_code_in_file`
- `normBiometricCode` returns `null` (blank/whitespace code) → `invalid_code_in_file`

### 2. Blocking model

| Kind | Severity | Rationale |
| --- | --- | --- |
| `duplicate_code_in_file` | **hard** | Silently overwrites a month today |
| `invalid_code_in_file` | **hard** | Cannot be attributed to anyone |
| `zero_importable` | **hard** | Currently returns 200 "Imported 0" — reads as success |
| `unknown_staff_present` | acknowledgeable | Excluded and shown, behind a deliberate tick |
| `unreconciled_totals` | acknowledgeable | Real disagreement, but one bad employee must not stop the rest |

`unreconciled_totals` reuses the existing `reconciled` flag (`route.ts:450-452`),
which already tolerates the designed weekly-off flip by comparing the machine's
Absent against `our_absent + our_weekly_off`. A failure there is a genuine
arithmetic disagreement, not the expected Sunday behaviour.

### 3. Server-side gate

The block is enforced by the route, not by a disabled button — a disabled button
is bypassable with a hand-rolled `fetch`.

- `POST /api/hr/attendance/import` accepts a new form field `acknowledge=true`.
- Phase 1 runs immediately after `matched`/`unmatched` are built; phase 2 runs
  after the evaluation loop. Both run in **both** modes.
- `dryRun=true` → always 200, validation included in the body. Never blocks; previewing is safe.
- `dryRun=false`:
  - any **hard** block → **409**, no write, validation in the body. `acknowledge` is ignored.
  - any **acknowledgeable** block and `acknowledge !== 'true'` → **409**, no write.
  - otherwise → write as today.

409 (Conflict) rather than 400: the request is well-formed, but the current state
of the file and roster forbids it.

### 4. Two additional pre-commit warnings

Non-blocking, reported on the importable set only. Both are currently invisible
until after the write:

- **`missing_staff_code`** — importable staff whose `staff_id` is null or blank.
  198 of 864 staff repo-wide. `UNIQUE(staff_id)` permits unlimited NULLs, so
  "unique" does not imply "present"; the preview's `staff_code` column renders empty.
- **`missing_organisation`** — importable staff whose `institution_id` has no
  `hr_organizations` row. `hr_attendance_records.hr_organization_id` is `NOT NULL`,
  so these days are discarded mid-write and counted into `skipped_no_organization`
  *after* the commit. Surfacing it pre-commit converts a silent loss into a
  visible warning naming the affected people.

### 5. Route change — fetch the full roster

`route.ts:185-190` currently selects only staff enrolled on this machine
(`.eq('biometric_institution_id', machine.id)`). Distinguishing `absent` from
`unlinked_match` needs the whole roster, exactly as
`app/api/hr/biometric-mapping/suggest/route.ts:87-90` already does. 864 rows;
the existing `.limit(5000)` covers it. Reads stay on the service-role client so a
restrictive staff policy cannot shrink the match set.

Building the code→staff map (`route.ts:200-204`) keeps its first-wins guard, but a
collision now records a `duplicate_code_in_file` block instead of being dropped
silently. The query has no `ORDER BY`, so which row won was never deterministic.

### 6. UI — the Validate step

`app/(routes)/hr/attendance/_components/biometric-import-dialog.tsx` already has a
`validate` step; it gains the validation summary. New component
`_components/upload-validation-step.tsx`:

- **Counts strip** — total in file / importable / needs linking / ambiguous / not in staff table.
- **Blocks list** — red for hard, amber for acknowledgeable, each naming its count and the affected codes.
- **Excluded roster** — code + device name for every `absent` and `ambiguous_match` row, so the operator can see exactly who is being left out. Capped at 200 with an overflow count.
- **Warnings** — `missing_staff_code`, `missing_organisation`, plus existing parser warnings.
- **Acknowledgement checkbox** — rendered only when there are acknowledgeable blocks and no hard blocks. Label states the exact counts. The Import button stays disabled until it is ticked; `acknowledge=true` is then posted.

Permission checks use `usePermissions().can(...)`, never `useAuth()` — the wired
`useAuth()` returns only `{ profile, isLoading, error }`.

## Types — `types/hr-biometric.ts`

```ts
export type BiometricStaffMatchKind =
  | 'linked' | 'unlinked_match' | 'ambiguous_match' | 'absent';

export interface BiometricEmployeeValidation {
  code: string;                     // verbatim, as the machine printed it
  normalised_code: string | null;   // normBiometricCode output
  device_name: string;
  match: BiometricStaffMatchKind;
  staff_uuid: string | null;        // resolved staff.id, when unambiguous
  staff_name: string | null;
  staff_code: string | null;        // staff.staff_id — may be null
  candidate_count: number;          // >1 for ambiguous_match
  importable: boolean;
  reason: string | null;            // human-readable, shown in the excluded list
}

export type BiometricBlockKind =
  | 'duplicate_code_in_file' | 'invalid_code_in_file' | 'zero_importable'
  | 'unknown_staff_present'  | 'unreconciled_totals';

export type BiometricWarningKind = 'missing_staff_code' | 'missing_organisation';

export interface BiometricBlock {
  kind: BiometricBlockKind;
  severity: 'hard' | 'acknowledgeable';
  count: number;
  message: string;
  detail: string[];                 // capped at 50 entries
}

export interface BiometricUploadValidation {
  employees: BiometricEmployeeValidation[];
  counts: {
    total: number; importable: number;
    unlinked_match: number; ambiguous_match: number; absent: number;
  };
  blocks: BiometricBlock[];
  warnings: Array<{ kind: BiometricWarningKind; count: number; message: string; detail: string[] }>;
  /** No hard blocks. */
  can_import: boolean;
  /** Acknowledgeable blocks present; commit needs acknowledge=true. */
  requires_acknowledgement: boolean;
}
```

`BiometricImportReport` gains `validation: BiometricUploadValidation`. Existing
fields are unchanged — `unmatched_codes` stays for backward compatibility and is
now a strict subset of the non-`linked` employees.

## Data flow

```
upload .xls
  -> parseMonthlyReportFile
  -> resolveInstitutionFromReport            (which machine?)
  -> fetch FULL staff roster + hr_organizations      (service role)
  -> validateUpload(...)                     <-- NEW, phase 1 (pure)
  -> resolve shift timings (bulk RPC)
  -> evaluate every day  ->  reconciliation[]
  -> finaliseValidation(v, unreconciled)     <-- NEW, phase 2 (pure)
  -> dryRun ? 200 + validation
            : hard block          -> 409, no write
            : ack block, no ack   -> 409, no write
            : write hr_attendance_records + hr_attendance_exceptions
```

Both phases run identically for `dryRun=true` and `dryRun=false`, preserving the
module's one-code-path invariant. Only the final branch differs.

## Error handling

- Every Supabase call destructures `{ error }` and returns a mapped response;
  Supabase errors are plain objects, so `getErrorMessage()` is used rather than
  `err instanceof Error`.
- `validateUpload` is pure and throws nothing; an unparseable employee block
  becomes an `invalid_code_in_file` entry, not an exception.
- A 409 returns the full validation payload so the dialog renders the same screen
  it showed at preview, with no second round trip.

## Verification

No test runner is wired into npm scripts, so:

1. **Unit** — extend `scripts/biometric-parser.test.ts` with `validateUpload` cases:
   duplicate normalised codes (`0017`/`017`), blank code, zero importable,
   three-way resolution across linked/unlinked/ambiguous/absent, and the
   acknowledgement gate. Run with `npx tsx scripts/biometric-parser.test.ts`.
2. **Route** — with 0 staff mapped (today's real state), a dry run must report
   48 total / 0 importable / `zero_importable` hard block; a commit must 409 and
   write nothing.
3. **Browser** — upload the real `Main Office July 2026 Report.xls`, confirm the
   three-way counts, tick the acknowledgement, confirm the import writes only the
   linked employees.
4. `mcp__ide__getDiagnostics` on every touched file.

## Out of scope

- Changing any database constraint — uniqueness is already enforced.
- Auto-linking codes from names. Deliberate: see `normalize-name.ts`.
- Backfilling the empty `staff.biometric_id` roster — that is the Link codes step's job.
- The unrelated `useAuth()` defect at `app/(routes)/accreditation/naac/surveys/consent/page.tsx:99`.
