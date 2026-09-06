# Biometric Import Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate a biometric upload before it commits — report which people exist in the staff table, exclude those who don't, and refuse the import on duplicate enrolment codes.

**Architecture:** A new pure module computes the verdict in two phases (structural, then post-evaluation), the existing `/api/hr/attendance/import` route runs both phases in dry-run and commit alike and returns **409** when a block stands, and the wizard's existing Validate step renders the verdict with an acknowledgement checkbox.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role reads / session-client writes), React Query, Shadcn UI, `tsx` for the standalone test script.

**Spec:** `docs/superpowers/specs/2026-08-07-biometric-import-validation-design.md`

## Global Constraints

- **No database changes.** `staff_staff_id_key` and `staff_biometric_uq` already enforce both uniqueness rules. Do not add constraints or migrations.
- **Name matching classifies only, never imports.** `unlinked_match` and `ambiguous_match` are always `importable: false`. See the warning block in `lib/hr/biometric/normalize-name.ts`.
- **Duplicate detection runs on `normBiometricCode(...)` output, never the raw string.** `0017` and `017` are the same code.
- **One code path.** Both validation phases run identically for `dryRun=true` and `dryRun=false`. Only the final branch differs.
- **Never fire-and-forget a Supabase call.** Destructure `{ error }` and check it. Supabase errors are plain objects — use `getErrorMessage()` from `@/lib/utils`, not `err instanceof Error`.
- **Permission checks use `usePermissions().can(...)`.** The wired `useAuth()` returns only `{ profile, isLoading, error }`.
- **No test runner exists.** Verify with `npx tsx scripts/biometric-parser.test.ts` and `mcp__ide__getDiagnostics`. Never claim "tests pass" for anything else.
- Existing fields on `BiometricImportReport` keep their meaning; `unmatched_codes` stays for backward compatibility.

---

### Task 1: Pure validation module + types

**Files:**
- Modify: `types/hr-biometric.ts` (append after `BiometricFieldTotals`, before `ANOMALY_LABEL`)
- Create: `lib/hr/biometric/validate-upload.ts`
- Test: `scripts/biometric-parser.test.ts` (append a new section before the final summary)

**Interfaces:**
- Consumes: `normBiometricCode` from `./normalize-code`, `normPersonName` from `./normalize-name`, `BiometricEmployee` from `./parse-monthly-report`.
- Produces: `validateUpload(input) => BiometricUploadValidation`, `finaliseValidation(validation, unreconciled) => BiometricUploadValidation`, `interface ValidationStaffRow`. Task 2 imports all three.

- [ ] **Step 1: Add the types**

Append to `types/hr-biometric.ts`, immediately after the `BiometricFieldTotals` interface:

```ts
export type BiometricStaffMatchKind =
  | 'linked' | 'unlinked_match' | 'ambiguous_match' | 'absent';

export interface BiometricEmployeeValidation {
  /** Verbatim, as the machine printed it. */
  code: string;
  /** normBiometricCode output — null when the code is blank/unreadable. */
  normalised_code: string | null;
  device_name: string;
  match: BiometricStaffMatchKind;
  staff_uuid: string | null;
  staff_name: string | null;
  /** staff.staff_id — may legitimately be null (198 of 864 staff have none). */
  staff_code: string | null;
  candidate_count: number;
  importable: boolean;
  reason: string | null;
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
  detail: string[];
}

export interface BiometricWarning {
  kind: BiometricWarningKind;
  count: number;
  message: string;
  detail: string[];
}

export interface BiometricUploadValidation {
  employees: BiometricEmployeeValidation[];
  counts: {
    total: number; importable: number;
    unlinked_match: number; ambiguous_match: number; absent: number;
  };
  blocks: BiometricBlock[];
  warnings: BiometricWarning[];
  /** No hard blocks. Set only by finaliseValidation. */
  can_import: boolean;
  /** Acknowledgeable blocks present; commit needs acknowledge=true. */
  requires_acknowledgement: boolean;
}

export const BLOCK_LABEL: Record<BiometricBlockKind, string> = {
  duplicate_code_in_file: 'Duplicate enrolment code in file',
  invalid_code_in_file: 'Blank or unreadable enrolment code',
  zero_importable: 'Nothing to import',
  unknown_staff_present: 'People not in the staff table',
  unreconciled_totals: 'Totals do not reconcile',
};

export const MATCH_LABEL: Record<BiometricStaffMatchKind, string> = {
  linked: 'Linked',
  unlinked_match: 'Needs linking',
  ambiguous_match: 'Ambiguous name',
  absent: 'Not in staff table',
};
```

Then add one field to the existing `BiometricImportReport` interface, after `field_totals`:

```ts
  validation: BiometricUploadValidation;
```

- [ ] **Step 2: Write the failing test**

Append to `scripts/biometric-parser.test.ts`, immediately before the final summary block that prints failures. Add these imports at the top of the file, beside the existing ones:

```ts
import { validateUpload, finaliseValidation, type ValidationStaffRow } from '../lib/hr/biometric/validate-upload';
import type { BiometricEmployee } from '../lib/hr/biometric/parse-monthly-report';
```

Test body:

```ts
// --- upload validation ----------------------------------------------------
// Fixture mirrors the real July export's shapes: a code-linked person, a person
// present in staff but unlinked, a duplicated name, and a device user who is
// nobody. 'Mr. RADHA KRISHNAN T' vs 'Radhakrishnan T' is the real honorific case.
console.log('=== upload validation ===');
{
  const staff: ValidationStaffRow[] = [
    { id: 'u1', staff_id: 'NOT100', first_name: 'Mr. RADHA KRISHNAN', last_name: 'T',
      institution_id: 'inst-1', biometric_id: '00002', biometric_institution_id: 'mach-1' },
    { id: 'u2', staff_id: 'CAS140', first_name: 'PRIYA', last_name: 'S',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
    // staff_id null AND institution with no HR organization -> both warnings
    { id: 'u3', staff_id: null, first_name: 'ARUN', last_name: 'K',
      institution_id: 'inst-2', biometric_id: '30', biometric_institution_id: 'mach-1' },
    { id: 'u4', staff_id: 'M1', first_name: 'MOHAN', last_name: 'R',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
    { id: 'u5', staff_id: 'M2', first_name: 'MOHAN', last_name: 'R',
      institution_id: 'inst-1', biometric_id: null, biometric_institution_id: null },
  ];
  const orgs = new Map<string, string>([['inst-1', 'org-1']]); // inst-2 deliberately absent

  const emp = (code: string, name: string): BiometricEmployee => ({
    code, name,
    summary: { present: null, weeklyOff: null, absent: null,
               totalWorkMinutes: null, totalOvertimeMinutes: null },
    days: [],
  });

  const v = validateUpload({
    employees: [
      emp('002', 'Radhakrishnan T'),  // linked via code (00002 -> 2, 002 -> 2)
      emp('0030', 'Arun K'),          // linked via code (30)
      emp('77', 'Priya S'),           // unlinked_match — one name hit
      emp('88', 'Mohan R'),           // ambiguous_match — two name hits
      emp('99', 'Nobody Here'),       // absent
    ],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  });

  check('counts.total is 5', v.counts.total === 5, String(v.counts.total));
  check('counts.importable is 2', v.counts.importable === 2, String(v.counts.importable));
  check('counts.unlinked_match is 1', v.counts.unlinked_match === 1, String(v.counts.unlinked_match));
  check('counts.ambiguous_match is 1', v.counts.ambiguous_match === 1, String(v.counts.ambiguous_match));
  check('counts.absent is 1', v.counts.absent === 1, String(v.counts.absent));

  const byCode = new Map(v.employees.map((e) => [e.code, e]));
  check('002 linked to u1', byCode.get('002')?.match === 'linked' && byCode.get('002')?.staff_uuid === 'u1');
  check('002 is importable', byCode.get('002')?.importable === true);
  check('77 is unlinked_match', byCode.get('77')?.match === 'unlinked_match');
  check('77 is NOT importable', byCode.get('77')?.importable === false);
  check('88 is ambiguous with 2 candidates',
    byCode.get('88')?.match === 'ambiguous_match' && byCode.get('88')?.candidate_count === 2);
  check('99 is absent', byCode.get('99')?.match === 'absent');

  const kinds = new Set(v.blocks.map((b) => b.kind));
  check('unknown_staff_present raised', kinds.has('unknown_staff_present'));
  check('unknown_staff_present counts 2 (ambiguous + absent)',
    v.blocks.find((b) => b.kind === 'unknown_staff_present')?.count === 2);
  check('unknown_staff_present is acknowledgeable',
    v.blocks.find((b) => b.kind === 'unknown_staff_present')?.severity === 'acknowledgeable');
  check('no hard block on the happy fixture', !v.blocks.some((b) => b.severity === 'hard'));

  const warn = new Map(v.warnings.map((w) => [w.kind, w]));
  check('missing_staff_code counts 1 (u3)', warn.get('missing_staff_code')?.count === 1);
  check('missing_organisation counts 1 (u3, inst-2)', warn.get('missing_organisation')?.count === 1);

  // phase 2 — no unreconciled employees
  const clean = finaliseValidation(v, []);
  check('can_import true when only acknowledgeable blocks', clean.can_import === true);
  check('requires_acknowledgement true', clean.requires_acknowledgement === true);

  // phase 2 — with unreconciled employees
  const shaky = finaliseValidation(v, [{ code: '002', name: 'Radhakrishnan T' }]);
  check('unreconciled_totals block appended',
    shaky.blocks.some((b) => b.kind === 'unreconciled_totals' && b.severity === 'acknowledgeable'));
  check('unreconciled does not make it a hard block', shaky.can_import === true);

  // --- duplicate normalised codes -> HARD block ---------------------------
  const dup = finaliseValidation(validateUpload({
    employees: [emp('0017', 'Priya S'), emp('017', 'Priya Sundaram')],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('0017 and 017 detected as one duplicated code',
    dup.blocks.some((b) => b.kind === 'duplicate_code_in_file' && b.count === 1));
  check('duplicate is a hard block',
    dup.blocks.find((b) => b.kind === 'duplicate_code_in_file')?.severity === 'hard');
  check('duplicate makes can_import false', dup.can_import === false);

  // --- blank code -> HARD block -------------------------------------------
  const blank = finaliseValidation(validateUpload({
    employees: [emp('   ', 'Ghost User'), emp('002', 'Radhakrishnan T')],
    staff, machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('blank code raises invalid_code_in_file',
    blank.blocks.some((b) => b.kind === 'invalid_code_in_file' && b.severity === 'hard'));
  check('blank code makes can_import false', blank.can_import === false);

  // --- nothing linked -> HARD block (today's real state: 0 staff mapped) ---
  const none = finaliseValidation(validateUpload({
    employees: [emp('77', 'Priya S'), emp('99', 'Nobody Here')],
    staff: staff.map((s) => ({ ...s, biometric_id: null, biometric_institution_id: null })),
    machineInstitutionId: 'mach-1', organisationByInstitution: orgs,
  }), []);
  check('zero importable raises zero_importable',
    none.blocks.some((b) => b.kind === 'zero_importable' && b.severity === 'hard'));
  check('zero importable makes can_import false', none.can_import === false);
}
```

- [ ] **Step 2b: Run the test to verify it fails**

Run: `npx tsx scripts/biometric-parser.test.ts`
Expected: FAIL — `Cannot find module '../lib/hr/biometric/validate-upload'`

- [ ] **Step 3: Write the implementation**

Create `lib/hr/biometric/validate-upload.ts`:

```ts
/**
 * Pre-commit validation for a biometric monthly-report upload.
 * Created: 2026-08-07.
 * Spec: docs/superpowers/specs/2026-08-07-biometric-import-validation-design.md
 *
 * Pure and synchronous so scripts/biometric-parser.test.ts exercises it with no
 * database.
 *
 * TWO PHASES. Everything decidable from the file plus the roster is phase 1
 * (validateUpload). The reconciliation block is only knowable once every day of
 * every matched employee has been evaluated, so it arrives in phase 2
 * (finaliseValidation) — which is also the ONLY place can_import is decided, so
 * no caller can read a half-formed verdict.
 *
 * NAME MATCHING CLASSIFIES, IT NEVER IMPORTS. normPersonName reaches 36 of 48 on
 * the real July export; lib/hr/biometric/normalize-name.ts explains why that is
 * fine for a suggestion a human reviews and not fine for attributing a month of
 * attendance. unlinked_match and ambiguous_match are ALWAYS importable:false —
 * only a stored enrolment code makes a row importable.
 */
import { normBiometricCode } from './normalize-code';
import { normPersonName } from './normalize-name';
import type { BiometricEmployee } from './parse-monthly-report';
import type {
  BiometricBlock,
  BiometricEmployeeValidation,
  BiometricUploadValidation,
  BiometricWarning,
} from '@/types/hr-biometric';

/** A bad month can name hundreds of people; cap what each block carries. */
const DETAIL_LIMIT = 50;

export interface ValidationStaffRow {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  institution_id: string | null;
  biometric_id: string | null;
  biometric_institution_id: string | null;
}

function fullName(s: ValidationStaffRow): string {
  return [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '(no name)';
}

export function validateUpload(input: {
  employees: BiometricEmployee[];
  /** FULL roster — needed to tell "not our employee" from "not linked yet". */
  staff: ValidationStaffRow[];
  machineInstitutionId: string;
  organisationByInstitution: Map<string, string>;
}): BiometricUploadValidation {
  const { employees, staff, machineInstitutionId, organisationByInstitution } = input;

  const byId = new Map<string, ValidationStaffRow>();
  for (const s of staff) byId.set(s.id, s);

  // Codes enrolled on THIS machine only: an enrolment number means nothing
  // apart from the machine that issued it.
  const staffByCode = new Map<string, ValidationStaffRow>();
  for (const s of staff) {
    if (s.biometric_institution_id !== machineInstitutionId) continue;
    const key = normBiometricCode(s.biometric_id);
    if (key && !staffByCode.has(key)) staffByCode.set(key, s);
  }

  // Name index — classification only, never a write path.
  const byName = new Map<string, string[]>();
  for (const s of staff) {
    const key = normPersonName([s.first_name, s.last_name].filter(Boolean).join(' '));
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(s.id);
    else byName.set(key, [s.id]);
  }

  // Duplicates are grouped on the NORMALISED key. Comparing raw strings would
  // read '0017' and '017' as two people right up until Postgres rejected them.
  const blocksByCode = new Map<string, BiometricEmployee[]>();
  const invalid: BiometricEmployee[] = [];
  for (const emp of employees) {
    const key = normBiometricCode(emp.code);
    if (!key) { invalid.push(emp); continue; }
    const list = blocksByCode.get(key);
    if (list) list.push(emp);
    else blocksByCode.set(key, [emp]);
  }
  const duplicates = [...blocksByCode.entries()].filter(([, l]) => l.length > 1);

  const rows: BiometricEmployeeValidation[] = employees.map((emp) => {
    const key = normBiometricCode(emp.code);
    const linked = key ? (staffByCode.get(key) ?? null) : null;

    if (linked) {
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'linked', staff_uuid: linked.id, staff_name: fullName(linked),
        staff_code: linked.staff_id, candidate_count: 1,
        importable: true, reason: null,
      };
    }

    const hits = byName.get(normPersonName(emp.name)) ?? [];

    if (hits.length === 1) {
      const s = byId.get(hits[0]);
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'unlinked_match', staff_uuid: s ? s.id : null,
        staff_name: s ? fullName(s) : null, staff_code: s ? s.staff_id : null,
        candidate_count: 1, importable: false,
        reason: 'In the staff table, but this enrolment code is not linked yet. Link it in the Link codes step.',
      };
    }

    if (hits.length > 1) {
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'ambiguous_match', staff_uuid: null, staff_name: null,
        staff_code: null, candidate_count: hits.length, importable: false,
        reason: `${hits.length} staff members share this name — link this code manually.`,
      };
    }

    return {
      code: emp.code, normalised_code: key, device_name: emp.name,
      match: 'absent', staff_uuid: null, staff_name: null, staff_code: null,
      candidate_count: 0, importable: false,
      reason: 'No staff record matches this person. They will not be imported.',
    };
  });

  const counts = {
    total: rows.length,
    importable: rows.filter((r) => r.importable).length,
    unlinked_match: rows.filter((r) => r.match === 'unlinked_match').length,
    ambiguous_match: rows.filter((r) => r.match === 'ambiguous_match').length,
    absent: rows.filter((r) => r.match === 'absent').length,
  };

  const blocks: BiometricBlock[] = [];

  if (duplicates.length > 0) {
    blocks.push({
      kind: 'duplicate_code_in_file',
      severity: 'hard',
      count: duplicates.length,
      message:
        `${duplicates.length} enrolment code(s) appear more than once in this file. ` +
        'Attendance is stored per employee per day, so one person\'s month would overwrite the other\'s.',
      detail: duplicates.slice(0, DETAIL_LIMIT).map(
        ([key, list]) => `code ${key}: ${list.map((e) => `${e.code} (${e.name || 'no name'})`).join(' , ')}`,
      ),
    });
  }

  if (invalid.length > 0) {
    blocks.push({
      kind: 'invalid_code_in_file',
      severity: 'hard',
      count: invalid.length,
      message: `${invalid.length} employee block(s) have a blank or unreadable enrolment code and cannot be attributed to anyone.`,
      detail: invalid.slice(0, DETAIL_LIMIT).map((e) => e.name || '(no name)'),
    });
  }

  if (counts.importable === 0) {
    blocks.push({
      kind: 'zero_importable',
      severity: 'hard',
      count: rows.length,
      message:
        `None of the ${rows.length} employee(s) in this file are linked to a staff record, ` +
        'so this import would write nothing. Link the codes first.',
      detail: [],
    });
  }

  const unknown = rows.filter((r) => r.match === 'absent' || r.match === 'ambiguous_match');
  if (unknown.length > 0) {
    blocks.push({
      kind: 'unknown_staff_present',
      severity: 'acknowledgeable',
      count: unknown.length,
      message: `${unknown.length} person(s) in this file have no usable staff record and will be excluded from the import.`,
      detail: unknown.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.device_name || '(no name)'}`),
    });
  }

  const warnings: BiometricWarning[] = [];
  const importableRows = rows.filter((r) => r.importable);

  // UNIQUE(staff_id) permits unlimited NULLs, so "unique" does not imply
  // "present" — 198 of 864 staff have none.
  const noCode = importableRows.filter((r) => !r.staff_code || r.staff_code.trim() === '');
  if (noCode.length > 0) {
    warnings.push({
      kind: 'missing_staff_code',
      count: noCode.length,
      message: `${noCode.length} employee(s) being imported have no staff ID on their record.`,
      detail: noCode.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.staff_name ?? r.device_name}`),
    });
  }

  // hr_attendance_records.hr_organization_id is NOT NULL, so these days are
  // dropped mid-write and only counted afterwards. Say so before the commit.
  const noOrg = importableRows.filter((r) => {
    const s = r.staff_uuid ? byId.get(r.staff_uuid) : null;
    if (!s) return false;
    return !s.institution_id || !organisationByInstitution.has(s.institution_id);
  });
  if (noOrg.length > 0) {
    warnings.push({
      kind: 'missing_organisation',
      count: noOrg.length,
      message:
        `${noOrg.length} employee(s) belong to an institution with no HR organization. ` +
        'Their day records cannot be stored and will be skipped.',
      detail: noOrg.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.staff_name ?? r.device_name}`),
    });
  }

  return {
    employees: rows,
    counts,
    blocks,
    warnings,
    // Placeholders. finaliseValidation is the only place these are decided.
    can_import: false,
    requires_acknowledgement: false,
  };
}

export function finaliseValidation(
  validation: BiometricUploadValidation,
  unreconciled: Array<{ code: string; name: string }>,
): BiometricUploadValidation {
  const blocks = [...validation.blocks];

  if (unreconciled.length > 0) {
    blocks.push({
      kind: 'unreconciled_totals',
      severity: 'acknowledgeable',
      count: unreconciled.length,
      message:
        `${unreconciled.length} employee(s) do not reconcile against the machine's own ` +
        'Present/Absent totals. The expected weekly-off flip is already accounted for, so this is a genuine disagreement.',
      detail: unreconciled.slice(0, DETAIL_LIMIT).map((u) => `${u.code} · ${u.name || '(no name)'}`),
    });
  }

  return {
    ...validation,
    blocks,
    can_import: !blocks.some((b) => b.severity === 'hard'),
    requires_acknowledgement: blocks.some((b) => b.severity === 'acknowledgeable'),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/biometric-parser.test.ts`
Expected: PASS on every new `=== upload validation ===` line, and the pre-existing parser/evaluator/normaliser lines still PASS.

- [ ] **Step 5: Check types**

Run `mcp__ide__getDiagnostics` on `lib/hr/biometric/validate-upload.ts` and `types/hr-biometric.ts`.
Expected: no errors. (`BiometricImportReport.validation` will be flagged as missing at `app/api/hr/attendance/import/route.ts` — that is Task 2.)

- [ ] **Step 6: Commit**

```bash
git add types/hr-biometric.ts lib/hr/biometric/validate-upload.ts scripts/biometric-parser.test.ts
git commit -m "feat(hr/attendance): pre-commit validation module for biometric uploads"
```

---

### Task 2: Wire validation into the import route

**Files:**
- Modify: `app/api/hr/attendance/import/route.ts`

**Interfaces:**
- Consumes: `validateUpload`, `finaliseValidation`, `ValidationStaffRow` from Task 1.
- Produces: `BiometricImportReport.validation` in every 200 response; HTTP **409** with the same body shape when a block stands. Task 3 consumes both.

- [ ] **Step 1: Add the imports**

In `app/api/hr/attendance/import/route.ts`, after the `evaluateDay` import (line 47):

```ts
import { validateUpload, finaliseValidation } from '@/lib/hr/biometric/validate-upload';
```

And add `BiometricUploadValidation` to the existing type-only import from `@/types/hr-biometric`.

- [ ] **Step 2: Fetch the full roster instead of only this machine's enrolments**

Replace the staff query at lines 185-190:

```ts
    const { data: enrolled, error: staffErr } = await svc
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id')
      .eq('biometric_institution_id', machine.id)
      .not('biometric_id', 'is', null)
      .limit(5000);
```

with:

```ts
    // FULL roster, not just this machine's enrolments. Telling "not our employee"
    // apart from "our employee whose code nobody linked yet" needs every staff
    // row — the same select /api/hr/biometric-mapping/suggest already does.
    // Service role so a restrictive staff policy cannot shrink the match set.
    const { data: roster, error: staffErr } = await svc
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id, biometric_institution_id')
      .limit(5000);
```

- [ ] **Step 3: Filter by machine when building the code map**

Replace the `StaffRow` interface and map construction at lines 196-204:

```ts
    interface StaffRow {
      id: string; staff_id: string | null; first_name: string | null;
      last_name: string | null; institution_id: string | null; biometric_id: string | null;
    }
    const staffByCode = new Map<string, StaffRow>();
    for (const s of (enrolled ?? []) as StaffRow[]) {
      const key = normBiometricCode(s.biometric_id);
      if (key && !staffByCode.has(key)) staffByCode.set(key, s);
    }
```

with:

```ts
    interface StaffRow {
      id: string; staff_id: string | null; first_name: string | null;
      last_name: string | null; institution_id: string | null;
      biometric_id: string | null; biometric_institution_id: string | null;
    }
    const rosterRows = (roster ?? []) as StaffRow[];

    // Matching stays code-only and machine-scoped. The roster widened; the rule
    // did not. A collision here is now reported as duplicate_code_in_file rather
    // than silently dropped — this query has no ORDER BY, so which row won was
    // never deterministic.
    const staffByCode = new Map<string, StaffRow>();
    for (const s of rosterRows) {
      if (s.biometric_institution_id !== machine.id) continue;
      const key = normBiometricCode(s.biometric_id);
      if (key && !staffByCode.has(key)) staffByCode.set(key, s);
    }
```

- [ ] **Step 4: Run validation phase 1**

Insert immediately after the `missingStatus` guard block ends (after line 290, before the `// ---- Evaluate ----` comment):

```ts
    // ---- Validation, phase 1 (structural) -----------------------------------
    // Runs in BOTH modes so the preview cannot promise what the commit refuses.
    // The whole pipeline still runs even when a hard block is already known: the
    // 409 body must be a complete report the dialog can render without a second
    // round trip, and a 48-employee file is cheap.
    const validationPhase1 = validateUpload({
      employees: report.employees,
      staff: rosterRows,
      machineInstitutionId: machine.id,
      organisationByInstitution: orgByInstitution,
    });
```

- [ ] **Step 5: Run validation phase 2 after the evaluation loop**

Insert immediately after the `for (const { staff, emp } of matched) { ... }` loop closes (after line 469, before `const base = {`):

```ts
    // ---- Validation, phase 2 (needs the reconciliation) ---------------------
    const unreconciled = reconciliation
      .filter((r) => !r.reconciled)
      .map((r) => ({ code: r.code, name: r.staff_name ?? r.name }));
    const validation: BiometricUploadValidation = finaliseValidation(validationPhase1, unreconciled);
```

- [ ] **Step 6: Add validation to the response body**

In the `base` object, after the `field_totals` line:

```ts
      validation,
```

- [ ] **Step 7: Gate the commit**

Insert immediately after the `if (dryRun) { ... }` block closes (after line 503), before `// ---- Commit`:

```ts
    // ---- Gate ---------------------------------------------------------------
    // Enforced here, not by a disabled button — a disabled button is bypassable
    // with a hand-rolled fetch. 409 (Conflict), not 400: the request is
    // well-formed, the state of the file and roster forbids it.
    const acknowledge = String(formData.get('acknowledge') ?? '') === 'true';
    const hardBlocks = validation.blocks.filter((b) => b.severity === 'hard');

    if (hardBlocks.length > 0) {
      return NextResponse.json(
        {
          ...base,
          success: false,
          error: 'Import blocked',
          message: hardBlocks.map((b) => b.message).join(' '),
        },
        { status: 409 },
      );
    }

    if (validation.requires_acknowledgement && !acknowledge) {
      return NextResponse.json(
        {
          ...base,
          success: false,
          error: 'Acknowledgement required',
          message:
            'This file has issues that need review before importing: ' +
            validation.blocks
              .filter((b) => b.severity === 'acknowledgeable')
              .map((b) => b.message)
              .join(' '),
        },
        { status: 409 },
      );
    }
```

- [ ] **Step 8: Check types**

Run `mcp__ide__getDiagnostics` on `app/api/hr/attendance/import/route.ts`.
Expected: no errors. Confirm no reference to the removed `enrolled` variable remains — search the file for `enrolled` and expect zero hits.

- [ ] **Step 9: Verify against the live database state**

With 0 staff currently holding a `biometric_id`, upload the real export at `/hr/attendance/import` and confirm the dry-run response contains:
- `validation.counts.importable === 0`
- a `zero_importable` block with `severity: 'hard'`
- `validation.can_import === false`

Then confirm a commit attempt returns **409** and that `SELECT count(*) FROM hr_attendance_records` is still `0`.

- [ ] **Step 10: Commit**

```bash
git add app/api/hr/attendance/import/route.ts
git commit -m "feat(hr/attendance): gate biometric import on pre-commit validation"
```

---

### Task 3: Validation step UI

**Files:**
- Create: `app/(routes)/hr/attendance/_components/upload-validation-step.tsx`
- Modify: `app/(routes)/hr/attendance/_components/biometric-import-dialog.tsx`

**Interfaces:**
- Consumes: `BiometricImportReport.validation` from Task 2; `BLOCK_LABEL`, `MATCH_LABEL` from Task 1.
- Produces: `<UploadValidationStep validation acknowledged onAcknowledgedChange />`.

- [ ] **Step 1: Create the validation step component**

Create `app/(routes)/hr/attendance/_components/upload-validation-step.tsx`:

```tsx
'use client';

// ============================================================================
// Pre-commit validation summary for a biometric upload.
// Spec: docs/superpowers/specs/2026-08-07-biometric-import-validation-design.md
//
// Hard blocks cannot be ticked past — only acknowledgeable ones get the
// checkbox, and only when no hard block stands. The server enforces the same
// rule; this is the affordance, not the gate.
// ============================================================================

import { AlertTriangle, Ban, CheckCircle2, Info } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BLOCK_LABEL, MATCH_LABEL,
  type BiometricStaffMatchKind, type BiometricUploadValidation,
} from '@/types/hr-biometric';

const MATCH_CLASS: Record<BiometricStaffMatchKind, string> = {
  linked: 'bg-green-100 text-green-800 hover:bg-green-100',
  unlinked_match: 'bg-amber-100 text-amber-900 hover:bg-amber-100',
  ambiguous_match: 'bg-orange-100 text-orange-900 hover:bg-orange-100',
  absent: 'bg-red-100 text-red-800 hover:bg-red-100',
};

const EXCLUDED_LIMIT = 200;

interface Props {
  validation: BiometricUploadValidation;
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
}

export function UploadValidationStep({ validation, acknowledged, onAcknowledgedChange }: Props) {
  const hard = validation.blocks.filter((b) => b.severity === 'hard');
  const soft = validation.blocks.filter((b) => b.severity === 'acknowledgeable');
  const excluded = validation.employees.filter(
    (e) => e.match === 'absent' || e.match === 'ambiguous_match',
  );
  const needsLinking = validation.employees.filter((e) => e.match === 'unlinked_match');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cell label="In file" value={validation.counts.total} />
        <Cell label="Will import" value={validation.counts.importable} tone="good" />
        <Cell label="Needs linking" value={validation.counts.unlinked_match} tone="warn" />
        <Cell label="Ambiguous name" value={validation.counts.ambiguous_match} tone="warn" />
        <Cell label="Not in staff table" value={validation.counts.absent} tone="bad" />
      </div>

      {hard.map((b) => (
        <Alert key={b.kind} variant="destructive">
          <Ban className="h-4 w-4" />
          <AlertDescription>
            <strong>{BLOCK_LABEL[b.kind]}.</strong> {b.message}
            {b.detail.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs">
                {b.detail.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {soft.map((b) => (
        <Alert key={b.kind}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{BLOCK_LABEL[b.kind]}.</strong> {b.message}
            {b.detail.length > 0 && (
              <ul className="mt-2 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto font-mono text-xs">
                {b.detail.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {validation.warnings.map((w) => (
        <Alert key={w.kind}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {w.message}
            {w.detail.length > 0 && (
              <ul className="mt-2 max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto font-mono text-xs">
                {w.detail.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {needsLinking.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">
            In the staff table but not linked ({needsLinking.length})
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            A staff record matches these names, but the enrolment code is not linked to it. Go back
            to Link codes to attach them — they will not import until you do.
          </p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {needsLinking.map((e) => (
              <Badge key={e.code} variant="outline" className="font-mono text-xs">
                {e.code} · {e.device_name} → {e.staff_name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">Excluded from this import ({excluded.length})</p>
          <div className="max-h-56 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name on device</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {excluded.slice(0, EXCLUDED_LIMIT).map((e) => (
                  <tr key={e.code} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{e.code}</td>
                    <td className="px-3 py-2">{e.device_name || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={MATCH_CLASS[e.match]}>
                        {MATCH_LABEL[e.match]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {excluded.length > EXCLUDED_LIMIT && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the first {EXCLUDED_LIMIT} of {excluded.length}.
            </p>
          )}
        </div>
      )}

      {validation.blocks.length === 0 && validation.warnings.length === 0 && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Every person in this file is linked to a staff record and no duplicate codes were found.
          </AlertDescription>
        </Alert>
      )}

      {hard.length === 0 && soft.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <Checkbox
            id="biometric-ack"
            checked={acknowledged}
            onCheckedChange={(v) => onAcknowledgedChange(v === true)}
            className="mt-0.5"
          />
          <label htmlFor="biometric-ack" className="cursor-pointer text-sm">
            I have reviewed the {soft.map((b) => `${b.count} ${BLOCK_LABEL[b.kind].toLowerCase()}`).join(' and ')}
            {' '}above. Import the {validation.counts.importable} linked employee(s) anyway.
          </label>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value, tone }: {
  label: string; value: number; tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass = tone === 'good' ? 'text-green-700'
    : tone === 'warn' ? 'text-amber-700'
    : tone === 'bad' ? 'text-red-700' : '';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: (Verified 2026-08-07) `components/ui/checkbox.tsx` is already present**

No install needed — `@/components/ui/checkbox` resolves. Nothing to do; this step exists so the
import in Step 1 is not mistaken for a missing dependency.

- [ ] **Step 3: Preserve the 409 body in `post()`**

In `biometric-import-dialog.tsx`, replace the `post` callback (lines 107-115):

```tsx
  const post = useCallback(async (f: File, dryRun: boolean): Promise<BiometricImportReport> => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', dryRun ? 'true' : 'false');
    const res = await fetch('/api/hr/attendance/import', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
    return body as BiometricImportReport;
  }, []);
```

with:

```tsx
  const post = useCallback(async (
    f: File, dryRun: boolean, acknowledge = false,
  ): Promise<BiometricImportReport> => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', dryRun ? 'true' : 'false');
    if (acknowledge) fd.append('acknowledge', 'true');
    const res = await fetch('/api/hr/attendance/import', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));

    // A 409 carries the SAME full report the preview showed. Keep it — throwing
    // only the message would drop the validation and leave the screen stale.
    if (res.status === 409 && body?.validation) {
      const err = new Error(body?.message || 'Import blocked by validation.') as
        Error & { report?: BiometricImportReport };
      err.report = body as BiometricImportReport;
      throw err;
    }
    if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
    return body as BiometricImportReport;
  }, []);
```

- [ ] **Step 4: Add acknowledgement state and reset it whenever the report changes**

Add beside the other `useState` calls (after line 66, `suggestion`):

```tsx
  const [acknowledged, setAcknowledged] = useState(false);
```

In `reset` (line 72-75), add `setAcknowledged(false);` to the body.

In `analyse` (line 125), add `setAcknowledged(false);` to the first line alongside `setStep('analyzing')` — a fresh dry run must never inherit a previous tick.

- [ ] **Step 5: Derive the submit gate**

Replace lines 183-184:

```tsx
  const writable = report ? report.total_day_cells - report.counts.EXCEPTION : 0;
  const nothingToImport = !report || report.matched_employees === 0 || writable === 0;
```

with:

```tsx
  const writable = report ? report.total_day_cells - report.counts.EXCEPTION : 0;
  const validation = report?.validation ?? null;
  // Mirrors the server gate in app/api/hr/attendance/import/route.ts. The server
  // is the real gate; this only keeps the button honest.
  const blockedHard = validation ? !validation.can_import : false;
  const needsAck = validation?.requires_acknowledgement ?? false;
  const nothingToImport =
    !report || report.matched_employees === 0 || writable === 0
    || blockedHard || (needsAck && !acknowledged);
```

- [ ] **Step 6: Render the validation summary at the top of the Validate step**

In the `step === 'validate' && report && (` block, replace the opening stat grid (lines 351-356):

```tsx
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Will import" value={writable} tone="good" />
                <Stat label="Need review" value={report.counts.EXCEPTION} tone="warn" />
                <Stat label="Unmapped codes" value={report.unmatched_codes.length} tone="bad" />
              </div>
```

with:

```tsx
            <div className="space-y-4">
              {report.validation && (
                <UploadValidationStep
                  validation={report.validation}
                  acknowledged={acknowledged}
                  onAcknowledgedChange={setAcknowledged}
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Day records to write" value={writable} tone="good" />
                <Stat label="Need review" value={report.counts.EXCEPTION} tone="warn" />
                <Stat label="Unmapped codes" value={report.unmatched_codes.length} tone="bad" />
              </div>
```

Add the import beside the `LinkCodesStep` import (line 38):

```tsx
import { UploadValidationStep } from './upload-validation-step';
```

- [ ] **Step 7: Pass the acknowledgement on submit and keep the 409 report**

Replace the `submit` callback (lines 163-176):

```tsx
  const submit = useCallback(async () => {
    if (!file) return;
    setStep('submitting'); setProgress(35);
    try {
      const r = await post(file, false);
      setProgress(100); setReport(r); setStep('results');
      onImportComplete?.();
      toast.success(r.message ?? 'Import complete');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStep('validate');
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally { setProgress(0); }
  }, [file, post, onImportComplete]);
```

with:

```tsx
  const submit = useCallback(async () => {
    if (!file) return;
    setStep('submitting'); setProgress(35);
    try {
      const r = await post(file, false, acknowledged);
      setProgress(100); setReport(r); setStep('results');
      onImportComplete?.();
      toast.success(r.message ?? 'Import complete');
    } catch (err) {
      // A 409 carries a full report; re-render the Validate screen from it so the
      // reason the server refused is visible, not just a toast.
      const blocked = err as Error & { report?: BiometricImportReport };
      if (blocked.report) setReport(blocked.report);
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setStep('validate');
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally { setProgress(0); }
  }, [file, post, acknowledged, onImportComplete]);
```

- [ ] **Step 8: Check types**

Run `mcp__ide__getDiagnostics` on `upload-validation-step.tsx` and `biometric-import-dialog.tsx`.
Expected: no errors.

- [ ] **Step 9: Exercise in the browser**

At `/hr/attendance/import`, with the current live state (0 staff mapped):
1. Upload the real `Main Office July 2026 Report.xls`.
2. Skip linking, go to Validate.
3. Confirm the summary shows `In file 48 / Will import 0`, a red **Nothing to import** block, and **no** acknowledgement checkbox (hard blocks are not tickable).
4. Confirm the Import button is disabled.
5. Link at least one code, re-run, and confirm the counts move and the checkbox appears once only acknowledgeable blocks remain.
6. Tick it and confirm the Import button enables and the import writes.

- [ ] **Step 10: Commit**

```bash
git add app/\(routes\)/hr/attendance/_components/upload-validation-step.tsx app/\(routes\)/hr/attendance/_components/biometric-import-dialog.tsx
git commit -m "feat(hr/attendance): surface upload validation and acknowledgement in the import wizard"
```

---

## Self-Review Notes

**Spec coverage:** three-way resolution → Task 1 Step 3; duplicate detection on normalised key → Task 1 Step 3; five blocks with severities → Task 1 Steps 3, tested Step 2; two-phase split → Task 1; full-roster fetch → Task 2 Step 2; server 409 gate → Task 2 Step 7; `acknowledge` field → Task 2 Step 7 + Task 3 Step 7; `missing_staff_code` / `missing_organisation` → Task 1 Step 3; UI summary, excluded roster, checkbox → Task 3 Step 1; `usePermissions` constraint → already satisfied in the dialog, unchanged by this plan.

**Type consistency:** `validateUpload` / `finaliseValidation` / `ValidationStaffRow` are named identically in Tasks 1, 2 and 3. `BiometricUploadValidation.can_import` and `.requires_acknowledgement` are read in Task 2 Step 7 and Task 3 Step 5 with the same meaning set in Task 1. `BLOCK_LABEL` and `MATCH_LABEL` are defined in Task 1 Step 1 and consumed in Task 3 Step 1.

**Known trade-off:** the pipeline runs to completion even when a hard block is already known after phase 1, so the bulk shift-timing RPC is spent on a file that will be refused. Accepted deliberately: the 409 body must be a complete report the dialog can render without a second round trip, and these files are ~48 employees.
