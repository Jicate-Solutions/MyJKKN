# Payroll Organisation Bulk Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HR operator export the Payroll Organisation directory to Excel under the current on-screen filters, set the payer column from a dropdown offline, and upload it back through a five-step dialog that previews changes, validates every row, gates on errors, and reports exactly what was written.

**Architecture:** Export and validation both run in the browser, reusing the page's already-loaded directory rows and the shared `matchesDirectoryFilters` predicate — putting either on the server would require a second copy of the filter logic, which is the drift that caused the 2026-08-05 filter-count defect. The write reuses the module's existing browser-client + RLS path via one new service method that upserts mixed per-row organisations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TanStack Query v5, Supabase (Postgres + RLS), Shadcn UI, ExcelJS (writes, via `lib/utils/excel-compat.ts`), SheetJS `xlsx` (reads), vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-05-payroll-organisation-bulk-edit-design.md`

## Global Constraints

- **Permission keys:** `hr.payroll.institution.view` (read), `hr.payroll.institution.manage` (write). Export is available to viewers; Bulk Edit requires `.manage`.
- **The payer dropdown lists only `hr_organizations` rows with `is_payroll_entity = true`** (13 on live data). JKKN Main Office is excluded — `CHECK (is_payroll_entity)` and the composite FK `hr_staff_payroll_org_must_run_payroll` reject it.
- **A blank `New Payer` cell means "no change"**, never "clear the payer".
- **The row identity column is `staff_uuid`, never staff code.** 101 of 104 JKKN Main Office staff have a NULL staff code.
- **Every uploaded `Staff ID` must be matched against the in-memory directory.** `hr_staff_payroll_write` gates on the permission key alone with no institution predicate, so this match *is* the scope enforcement for the bulk path.
- **Never fire-and-forget a Supabase mutation.** Always destructure `{ error }` and check it; RLS denials and FK violations arrive there, not as a throw.
- **Supabase errors are plain objects.** Use `getErrorMessage()` from `@/lib/utils`, never `err instanceof Error`.
- **Sheet is selected by name, columns by header text** — never by index.
- **Counting semantics:** `updated` = written; `skipped` = no actual change (blank cell, or new payer equals current); `failed` = rejected by validation.
- **Run tests with `npx vitest run <path>`.** There is no `test` npm script. 14 tests across 22 files already fail on `main` — pre-existing, not regressions.
- **Typecheck with `npx tsc --noEmit` filtered to the module.** Full `tsc` is slow; `mcp__ide__getDiagnostics` is unavailable in this session.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook.ts` | **Create.** Sheet/header constants; build the export `CompatWorkbook`; trigger the download. |
| `app/(routes)/hr/payroll/organisation/_components/bulk-payer-parse.ts` | **Create.** Read the uploaded `.xlsx`, resolve each row against the directory, produce a typed report. Pure apart from reading the file. |
| `app/(routes)/hr/payroll/organisation/_components/bulk-payer-upload-dialog.tsx` | **Create.** The five-step dialog. |
| `lib/services/hr/payroll/staff-payroll-service.ts` | **Modify.** Add `setPayersFromRows` (holds the `skipInvalid` gate). |
| `hooks/hr/use-staff-payroll.ts` | **Modify.** Add `useSetStaffPayersFromRows`. |
| `app/(routes)/hr/payroll/organisation/page.tsx` | **Modify.** Export + Bulk Edit buttons; pass rows, organisations, filter summary. |
| `__tests__/hr/payroll/bulk-payer-workbook.test.ts` | **Create.** Workbook shape + dropdown wiring. |
| `__tests__/hr/payroll/bulk-payer-parse.test.ts` | **Create.** Validation rules + export→reupload round trip. |

Headers and the sheet name are declared **once**, in `bulk-payer-workbook.ts`, and imported by the parser. Two copies of a header string is the same class of bug as two copies of the filter predicate.

---

### Task 1: Export workbook builder

**Files:**
- Create: `app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook.ts`
- Test: `__tests__/hr/payroll/bulk-payer-workbook.test.ts`

**Interfaces:**
- Consumes: `StaffPayerRow`, `PayrollOrganization` from `@/lib/services/hr/payroll/staff-payroll-service`; `CompatWorkbook` + default export from `@/lib/utils/excel-compat`.
- Produces:
  - `BULK_PAYER_SHEET_NAME: 'Payroll Organisation'`
  - `BULK_PAYER_HEADERS` — object with keys `staffId | staffCode | personName | role | worksAt | currentPayer | newPayer` mapping to header strings.
  - `buildBulkPayerWorkbook(rows: StaffPayerRow[], organizations: PayrollOrganization[], filterSummary: string[]): CompatWorkbook`
  - `downloadBulkPayerWorkbook(rows: StaffPayerRow[], organizations: PayrollOrganization[], filterSummary: string[], today: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/hr/payroll/bulk-payer-workbook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BULK_PAYER_SHEET_NAME,
  BULK_PAYER_HEADERS,
  buildBulkPayerWorkbook,
} from '@/app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook';
import type {
  StaffPayerRow,
  PayrollOrganization,
} from '@/lib/services/hr/payroll/staff-payroll-service';

const ORGS: PayrollOrganization[] = [
  { id: 'org-eng', name: 'JKKN College of Engineering and Technology', institution_id: 'i1' },
  { id: 'org-dent', name: 'JKKN Dental College and Hospital', institution_id: 'i2' },
];

const ROWS: StaffPayerRow[] = [
  {
    staff_uuid: 'staff-1',
    staff_code: 'E100',
    person_name: 'Asha Rao',
    role_title: 'Lecturer',
    works_at_id: 'i1',
    works_at_name: 'JKKN College of Engineering and Technology',
    payer_org_id: 'org-eng',
    payer_org_name: 'JKKN College of Engineering and Technology',
  },
  {
    // The Main Office shape: no staff code, no payer. This is why the identity
    // column must be the uuid.
    staff_uuid: 'staff-2',
    staff_code: null,
    person_name: 'Bus Cleaner One',
    role_title: 'Bus Cleaner',
    works_at_id: 'i-mo',
    works_at_name: 'JKKN Main Office',
    payer_org_id: null,
    payer_org_name: null,
  },
];

describe('buildBulkPayerWorkbook', () => {
  it('puts the data on a named sheet with staff uuid first and an empty New Payer column', () => {
    const wb = buildBulkPayerWorkbook(ROWS, ORGS, []);
    const ws = wb.Sheets[BULK_PAYER_SHEET_NAME];
    expect(ws).toBeDefined();

    const [header, first, second] = ws._aoa;
    expect(header[0]).toBe(BULK_PAYER_HEADERS.staffId);
    expect(header[6]).toBe(BULK_PAYER_HEADERS.newPayer);

    expect(first[0]).toBe('staff-1');
    expect(first[5]).toBe('JKKN College of Engineering and Technology'); // current payer
    expect(first[6]).toBe(''); // New Payer always starts empty

    // Null staff code and null payer must render as empty strings, not "null".
    expect(second[0]).toBe('staff-2');
    expect(second[1]).toBe('');
    expect(second[5]).toBe('');
  });

  it('attaches a list dropdown to the New Payer column covering every data row', () => {
    const wb = buildBulkPayerWorkbook(ROWS, ORGS, []);
    const dv = wb.Sheets[BULK_PAYER_SHEET_NAME]['!dataValidation'];
    expect(dv).toHaveLength(1);
    expect(dv![0].type).toBe('list');
    // Column G, data rows start at 2 (row 1 is the header).
    expect(dv![0].sqref).toBe('G2:G3');
    expect(dv![0].formula1).toContain('JKKN College of Engineering and Technology');
    expect(dv![0].showErrorMessage).toBe(true);
  });

  it('hides the Lists sheet and records the filters the export was taken under', () => {
    const wb = buildBulkPayerWorkbook(ROWS, ORGS, ['Works at: JKKN Main Office']);
    expect(wb.Sheets['Lists']['!state']).toBe('hidden');
    const instructions = JSON.stringify(wb.Sheets['Instructions']._aoa);
    expect(instructions).toContain('Works at: JKKN Main Office');
    expect(instructions).toContain('Staff ID');
  });

  it('still produces a usable sheet when nothing is exported', () => {
    const wb = buildBulkPayerWorkbook([], ORGS, []);
    const ws = wb.Sheets[BULK_PAYER_SHEET_NAME];
    expect(ws._aoa).toHaveLength(1); // header only
    expect(ws['!dataValidation']).toBeUndefined(); // no rows to validate
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/hr/payroll/bulk-payer-workbook.test.ts`
Expected: FAIL — cannot resolve `bulk-payer-workbook`.

- [ ] **Step 3: Write the implementation**

Create `app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook.ts`:

```ts
/**
 * The Payroll Organisation bulk-edit export.
 *
 * Built in the BROWSER, from the rows the page already holds, so the export
 * reuses matchesDirectoryFilters instead of re-deriving the filters on a
 * server route. A second copy of that predicate is what made the "Works at"
 * dropdown advertise 104 rows the table could not produce (2026-08-05).
 *
 * Writes go through excel-compat, a SheetJS-shaped wrapper over ExcelJS, which
 * is what gives us cell dropdowns and spills an over-long list into a hidden
 * _ValidCodes sheet.
 */

import XLSXCompat, { type CompatWorkbook } from '@/lib/utils/excel-compat';
import type {
  PayrollOrganization,
  StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';

export const BULK_PAYER_SHEET_NAME = 'Payroll Organisation';
const LISTS_SHEET_NAME = 'Lists';
const INSTRUCTIONS_SHEET_NAME = 'Instructions';

/**
 * Declared once and imported by the parser. Two copies of a header string
 * drift exactly the way two copies of a filter predicate do.
 */
export const BULK_PAYER_HEADERS = {
  staffId: 'Staff ID',
  staffCode: 'Staff Code',
  personName: 'Team Member',
  role: 'Role',
  worksAt: 'Works At',
  currentPayer: 'Current Payer',
  newPayer: 'New Payer',
} as const;

const HEADER_ORDER = [
  BULK_PAYER_HEADERS.staffId,
  BULK_PAYER_HEADERS.staffCode,
  BULK_PAYER_HEADERS.personName,
  BULK_PAYER_HEADERS.role,
  BULK_PAYER_HEADERS.worksAt,
  BULK_PAYER_HEADERS.currentPayer,
  BULK_PAYER_HEADERS.newPayer,
];

const COLUMN_WIDTHS = [38, 14, 26, 22, 30, 30, 34];

/** Column G — the only editable one. 1-based, matching Excel. */
const NEW_PAYER_COLUMN_LETTER = 'G';

function instructionRows(
  organizations: PayrollOrganization[],
  filterSummary: string[]
): string[][] {
  const lines: string[][] = [
    ['Payroll Organisation — bulk edit'],
    [''],
    [`Edit ONLY the "${BULK_PAYER_HEADERS.newPayer}" column. Everything else is reference.`],
    [`"${BULK_PAYER_HEADERS.staffId}" identifies the row — do not edit, reorder or delete it.`],
    ['Staff Code is not the identity: most campus-services staff do not have one.'],
    [''],
    [`Leave "${BULK_PAYER_HEADERS.newPayer}" BLANK to leave that person unchanged.`],
    ['Clearing a payer is done on the screen, not in this sheet.'],
    [''],
    ['Pick a value from the dropdown. Only organisations that run a payroll appear:'],
    ...organizations.map((o) => [`  • ${o.name}`]),
    [''],
  ];

  lines.push(
    filterSummary.length > 0
      ? ['Exported with these filters applied:']
      : ['Exported with no filters applied — every active team member.']
  );
  for (const f of filterSummary) lines.push([`  • ${f}`]);

  return lines;
}

export function buildBulkPayerWorkbook(
  rows: StaffPayerRow[],
  organizations: PayrollOrganization[],
  filterSummary: string[]
): CompatWorkbook {
  const aoa: (string | number | null)[][] = [
    [...HEADER_ORDER],
    // `?? ''` and not `?? null`: a null lands in the cell as an empty string
    // either way, but '' keeps the round-trip parser reading a string.
    ...rows.map((r) => [
      r.staff_uuid,
      r.staff_code ?? '',
      r.person_name ?? '',
      r.role_title ?? '',
      r.works_at_name ?? '',
      r.payer_org_name ?? '',
      '',
    ]),
  ];

  const sheet = XLSXCompat.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  sheet['!freeze'] = { ySplit: 1 };

  // Only attach validation when there is at least one data row: an empty
  // export would otherwise produce the range G2:G1, which Excel rejects.
  if (rows.length > 0) {
    const lastRow = rows.length + 1;
    sheet['!dataValidation'] = [
      {
        type: 'list',
        sqref: `${NEW_PAYER_COLUMN_LETTER}2:${NEW_PAYER_COLUMN_LETTER}${lastRow}`,
        formula1: `"${organizations.map((o) => o.name).join(',')}"`,
        showDropDown: true,
        showErrorMessage: true,
        errorTitle: 'Not a payroll organisation',
        error:
          'Pick from the list. Only organisations that run a payroll can be recorded as a payer.',
      },
    ];
  }

  const lists = XLSXCompat.utils.aoa_to_sheet(
    organizations.map((o) => [o.name])
  );
  lists['!state'] = 'hidden';

  const instructions = XLSXCompat.utils.aoa_to_sheet(
    instructionRows(organizations, filterSummary)
  );
  instructions['!cols'] = [{ wch: 96 }];

  const wb = XLSXCompat.utils.book_new();
  XLSXCompat.utils.book_append_sheet(wb, sheet, BULK_PAYER_SHEET_NAME);
  XLSXCompat.utils.book_append_sheet(wb, lists, LISTS_SHEET_NAME);
  XLSXCompat.utils.book_append_sheet(wb, instructions, INSTRUCTIONS_SHEET_NAME);
  return wb;
}

/** `today` is passed in rather than read here so the builder stays pure. */
export async function downloadBulkPayerWorkbook(
  rows: StaffPayerRow[],
  organizations: PayrollOrganization[],
  filterSummary: string[],
  today: string
): Promise<void> {
  const wb = buildBulkPayerWorkbook(rows, organizations, filterSummary);
  await XLSXCompat.writeFile(wb, `payroll-organisation-${today}.xlsx`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/hr/payroll/bulk-payer-workbook.test.ts`
Expected: PASS, 4 tests.

If the dropdown test fails on `formula1`, read `lib/utils/excel-compat.ts` around the `INLINE_LIMIT = 255` constant — a long organisation list spills into the `_ValidCodes` sheet and `formula1` becomes a range reference instead of a quoted literal. If the 13 live names exceed 255 chars, change the assertion to accept either form; do **not** change `excel-compat`.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook.ts" __tests__/hr/payroll/bulk-payer-workbook.test.ts
git commit -m "feat(hr/payroll): build the bulk-edit export workbook"
```

---

### Task 2: Parse and validate the uploaded sheet

**Files:**
- Create: `app/(routes)/hr/payroll/organisation/_components/bulk-payer-parse.ts`
- Test: `__tests__/hr/payroll/bulk-payer-parse.test.ts`

**Interfaces:**
- Consumes: `BULK_PAYER_SHEET_NAME`, `BULK_PAYER_HEADERS`, `buildBulkPayerWorkbook` from Task 1; `StaffPayerRow`, `PayrollOrganization`.
- Produces:
  - `type PayerIssueKind = 'format' | 'record'`
  - `interface PayerRowIssue { kind: PayerIssueKind; message: string }`
  - `interface ParsedPayerRow { rowNumber, staffId, newPayerName, staff, targetOrgId, currentPayerName, status: 'update'|'skip'|'error', skipReason?: 'blank'|'unchanged', issues }`
  - `interface BulkPayerReport { rows, totalRows, updateCount, skipCount, errorCount, assignments }`
  - `parseBulkPayerFile(file: File, directory: StaffPayerRow[], organizations: PayrollOrganization[]): Promise<BulkPayerReport>`
  - `BulkPayerSheetError` (thrown when the sheet or a required header is missing)

- [ ] **Step 1: Write the failing test**

Create `__tests__/hr/payroll/bulk-payer-parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseBulkPayerFile,
  BulkPayerSheetError,
} from '@/app/(routes)/hr/payroll/organisation/_components/bulk-payer-parse';
import {
  BULK_PAYER_SHEET_NAME,
  BULK_PAYER_HEADERS as H,
  buildBulkPayerWorkbook,
} from '@/app/(routes)/hr/payroll/organisation/_components/bulk-payer-workbook';
import { writeBuffer } from '@/lib/utils/excel-compat';
import type {
  StaffPayerRow,
  PayrollOrganization,
} from '@/lib/services/hr/payroll/staff-payroll-service';

const ORGS: PayrollOrganization[] = [
  { id: 'org-eng', name: 'JKKN College of Engineering and Technology', institution_id: 'i1' },
  { id: 'org-dent', name: 'JKKN Dental College and Hospital', institution_id: 'i2' },
];

const DIRECTORY: StaffPayerRow[] = [
  {
    staff_uuid: '11111111-1111-4111-8111-111111111111',
    staff_code: 'E100', person_name: 'Asha Rao', role_title: 'Lecturer',
    works_at_id: 'i1', works_at_name: 'Engineering',
    payer_org_id: 'org-eng', payer_org_name: 'JKKN College of Engineering and Technology',
  },
  {
    staff_uuid: '22222222-2222-4222-8222-222222222222',
    staff_code: null, person_name: 'Bus Cleaner One', role_title: 'Bus Cleaner',
    works_at_id: 'i-mo', works_at_name: 'JKKN Main Office',
    payer_org_id: null, payer_org_name: null,
  },
];

/** A File-like whose arrayBuffer() returns a real xlsx byte array. */
function makeFile(rows: Record<string, unknown>[], sheetName = BULK_PAYER_SHEET_NAME): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return { arrayBuffer: async () => buf } as unknown as File;
}

describe('parseBulkPayerFile', () => {
  it('records an assignment when a known staff id gets a new organisation', async () => {
    const f = makeFile([
      { [H.staffId]: DIRECTORY[1].staff_uuid, [H.newPayer]: 'JKKN Dental College and Hospital' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.updateCount).toBe(1);
    expect(r.errorCount).toBe(0);
    expect(r.assignments).toEqual([
      { staffId: DIRECTORY[1].staff_uuid, hrOrganizationId: 'org-dent' },
    ]);
  });

  it('skips a blank New Payer instead of clearing the payer', async () => {
    const f = makeFile([{ [H.staffId]: DIRECTORY[0].staff_uuid, [H.newPayer]: '' }]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.skipCount).toBe(1);
    expect(r.rows[0].skipReason).toBe('blank');
    expect(r.assignments).toHaveLength(0);
  });

  it('skips a row whose new payer already equals the current one', async () => {
    const f = makeFile([
      { [H.staffId]: DIRECTORY[0].staff_uuid, [H.newPayer]: 'JKKN College of Engineering and Technology' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.skipCount).toBe(1);
    expect(r.rows[0].skipReason).toBe('unchanged');
    expect(r.assignments).toHaveLength(0);
  });

  it('raises a format issue for an organisation that is not on the list', async () => {
    const f = makeFile([
      { [H.staffId]: DIRECTORY[1].staff_uuid, [H.newPayer]: 'JKKN Main Office' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.errorCount).toBe(1);
    expect(r.rows[0].issues[0].kind).toBe('format');
    expect(r.rows[0].issues[0].message).toContain('JKKN Main Office');
  });

  it('raises a record issue for a staff id that is not in the directory', async () => {
    const f = makeFile([
      { [H.staffId]: '99999999-9999-4999-8999-999999999999', [H.newPayer]: 'JKKN Dental College and Hospital' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.errorCount).toBe(1);
    expect(r.rows[0].issues[0].kind).toBe('record');
  });

  it('raises a format issue for a malformed uuid', async () => {
    const f = makeFile([{ [H.staffId]: 'not-a-uuid', [H.newPayer]: 'JKKN Dental College and Hospital' }]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.rows[0].issues[0].kind).toBe('format');
  });

  it('flags every row of a duplicated staff id, not just the second', async () => {
    const id = DIRECTORY[1].staff_uuid;
    const f = makeFile([
      { [H.staffId]: id, [H.newPayer]: 'JKKN Dental College and Hospital' },
      { [H.staffId]: id, [H.newPayer]: 'JKKN College of Engineering and Technology' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.errorCount).toBe(2);
    expect(r.rows.every((x) => x.issues.some((i) => i.kind === 'record'))).toBe(true);
    expect(r.assignments).toHaveLength(0);
  });

  it('matches organisation names case-insensitively and ignores surrounding space', async () => {
    const f = makeFile([
      { [H.staffId]: DIRECTORY[1].staff_uuid, [H.newPayer]: '  jkkn dental college and hospital ' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.updateCount).toBe(1);
  });

  it('finds columns by header text even when a scratch column is inserted first', async () => {
    const f = makeFile([
      { Scratch: 'x', [H.staffId]: DIRECTORY[1].staff_uuid, [H.newPayer]: 'JKKN Dental College and Hospital' },
    ]);
    const r = await parseBulkPayerFile(f, DIRECTORY, ORGS);
    expect(r.updateCount).toBe(1);
  });

  it('rejects the whole file when the data sheet is absent', async () => {
    const f = makeFile([{ [H.staffId]: 'x', [H.newPayer]: 'y' }], 'Some Other Sheet');
    await expect(parseBulkPayerFile(f, DIRECTORY, ORGS)).rejects.toThrow(BulkPayerSheetError);
  });

  it('rejects the whole file when a required header is missing, naming it', async () => {
    const f = makeFile([{ [H.staffId]: DIRECTORY[0].staff_uuid }]);
    await expect(parseBulkPayerFile(f, DIRECTORY, ORGS)).rejects.toThrow(H.newPayer);
  });

  it('round-trips: exporting and re-uploading unchanged produces no writes', async () => {
    const wb = buildBulkPayerWorkbook(DIRECTORY, ORGS, []);
    const ab = await writeBuffer(wb);
    const file = { arrayBuffer: async () => new Uint8Array(ab) } as unknown as File;

    const r = await parseBulkPayerFile(file, DIRECTORY, ORGS);
    expect(r.totalRows).toBe(2);
    expect(r.skipCount).toBe(2);
    expect(r.updateCount).toBe(0);
    expect(r.errorCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/hr/payroll/bulk-payer-parse.test.ts`
Expected: FAIL — cannot resolve `bulk-payer-parse`.

- [ ] **Step 3: Write the implementation**

Create `app/(routes)/hr/payroll/organisation/_components/bulk-payer-parse.ts`:

```ts
/**
 * Read an uploaded bulk-edit sheet and resolve it against the directory.
 *
 * Every Staff ID is matched against `directory`, which the RPC already filtered
 * by role_has_institution_access. That match is not cosmetic: the write policy
 * on hr_staff_payroll gates on the permission key ALONE, with no institution
 * predicate, so the database would accept a payer row for someone the uploader
 * cannot see. Selection-driven bulk assign is accident-proof because you can
 * only select rendered rows; a spreadsheet is not, because any uuid can be
 * typed in. This is where that hole is closed.
 *
 * Reads use SheetJS. Writes (the export) use ExcelJS via excel-compat.
 */

import * as XLSX from 'xlsx';

import type {
  PayrollOrganization,
  StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';
import { BULK_PAYER_HEADERS, BULK_PAYER_SHEET_NAME } from './bulk-payer-workbook';

/** 'format' = fix the cell. 'record' = fix the source data. */
export type PayerIssueKind = 'format' | 'record';

export interface PayerRowIssue {
  kind: PayerIssueKind;
  message: string;
}

export interface ParsedPayerRow {
  /** 1-based row in the sheet as the user sees it; the header is row 1. */
  rowNumber: number;
  staffId: string;
  newPayerName: string;
  staff: StaffPayerRow | null;
  currentPayerName: string | null;
  targetOrgId: string | null;
  status: 'update' | 'skip' | 'error';
  skipReason?: 'blank' | 'unchanged';
  issues: PayerRowIssue[];
}

export interface BulkPayerReport {
  rows: ParsedPayerRow[];
  totalRows: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  /** Exactly the rows that would be written. */
  assignments: Array<{ staffId: string; hrOrganizationId: string }>;
}

/** The file is unusable as a whole — a bad sheet, or a missing header. */
export class BulkPayerSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkPayerSheetError';
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cell(row: Record<string, unknown>, header: string): string {
  const v = row[header];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function parseBulkPayerFile(
  file: File,
  directory: StaffPayerRow[],
  organizations: PayrollOrganization[]
): Promise<BulkPayerReport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // BY NAME, never by index: a user who drags the Instructions tab to the
  // front would otherwise import it and get 20 unreadable rows.
  const sheet = wb.Sheets[BULK_PAYER_SHEET_NAME];
  if (!sheet) {
    throw new BulkPayerSheetError(
      `This workbook has no "${BULK_PAYER_SHEET_NAME}" sheet. Upload the file produced by Export, with its sheet names unchanged.`
    );
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  // Headers are read from the sheet itself so an inserted scratch column does
  // not shift the import. Only these two are required; B–F are for the human.
  const present = new Set(
    (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []).map((h) =>
      String(h).trim()
    )
  );
  for (const required of [BULK_PAYER_HEADERS.staffId, BULK_PAYER_HEADERS.newPayer]) {
    if (!present.has(required)) {
      throw new BulkPayerSheetError(
        `The sheet has no "${required}" column. Nothing was read — re-export and try again.`
      );
    }
  }

  const staffById = new Map(directory.map((r) => [r.staff_uuid, r]));
  const orgByName = new Map(
    organizations.map((o) => [o.name.trim().toLowerCase(), o])
  );

  // Counted first so BOTH copies of a duplicate can be flagged. Flagging only
  // the second would let the first be written, which is arbitrary.
  const idCounts = new Map<string, number>();
  for (const r of raw) {
    const id = cell(r, BULK_PAYER_HEADERS.staffId);
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  const rows: ParsedPayerRow[] = raw.map((r, i) => {
    const staffId = cell(r, BULK_PAYER_HEADERS.staffId);
    const newPayerName = cell(r, BULK_PAYER_HEADERS.newPayer);
    const staff = staffById.get(staffId) ?? null;
    const org = orgByName.get(newPayerName.toLowerCase()) ?? null;
    const issues: PayerRowIssue[] = [];

    if (!staffId) {
      issues.push({ kind: 'format', message: 'Staff ID is empty.' });
    } else if (!UUID_RE.test(staffId)) {
      issues.push({
        kind: 'format',
        message: `"${staffId}" is not a valid Staff ID. Do not edit this column.`,
      });
    } else if (!staff) {
      issues.push({
        kind: 'record',
        message:
          'This Staff ID is not in your directory — they may be inactive, or at an institution you do not have access to.',
      });
    } else if ((idCounts.get(staffId) ?? 0) > 1) {
      issues.push({
        kind: 'record',
        message:
          'This Staff ID appears on more than one row. Keep one row per person.',
      });
    }

    if (newPayerName && !org) {
      issues.push({
        kind: 'format',
        message: `"${newPayerName}" is not an organisation that runs a payroll. Pick from the dropdown.`,
      });
    }

    const base = {
      rowNumber: i + 2,
      staffId,
      newPayerName,
      staff,
      currentPayerName: staff?.payer_org_name ?? null,
      issues,
    };

    if (issues.length > 0) {
      return { ...base, targetOrgId: null, status: 'error' as const };
    }
    if (!newPayerName) {
      return {
        ...base,
        targetOrgId: null,
        status: 'skip' as const,
        skipReason: 'blank' as const,
      };
    }
    if (staff && org && staff.payer_org_id === org.id) {
      return {
        ...base,
        targetOrgId: org.id,
        status: 'skip' as const,
        skipReason: 'unchanged' as const,
      };
    }
    return { ...base, targetOrgId: org!.id, status: 'update' as const };
  });

  return {
    rows,
    totalRows: rows.length,
    updateCount: rows.filter((r) => r.status === 'update').length,
    skipCount: rows.filter((r) => r.status === 'skip').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
    assignments: rows
      .filter((r) => r.status === 'update' && r.targetOrgId)
      .map((r) => ({ staffId: r.staffId, hrOrganizationId: r.targetOrgId! })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/hr/payroll/bulk-payer-parse.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/hr/payroll/organisation/_components/bulk-payer-parse.ts" __tests__/hr/payroll/bulk-payer-parse.test.ts
git commit -m "feat(hr/payroll): parse and validate the bulk-edit sheet"
```

---

### Task 3: Service method and mutation hook

**Files:**
- Modify: `lib/services/hr/payroll/staff-payroll-service.ts` (add after `setPayersBulk`)
- Modify: `hooks/hr/use-staff-payroll.ts` (add after `useSetStaffPayersBulk`)
- Test: `__tests__/hr/payroll/set-payers-from-rows.test.ts`

**Interfaces:**
- Consumes: `BulkPayerReport` from Task 2.
- Produces:
  - `StaffPayrollService.setPayersFromRows(supabase, report: Pick<BulkPayerReport,'assignments'|'errorCount'>, opts: { skipInvalid: boolean }): Promise<number>` — returns the number of rows written.
  - `useSetStaffPayersFromRows()` — mutation taking `{ report, skipInvalid }`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/hr/payroll/set-payers-from-rows.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { StaffPayrollService } from '@/lib/services/hr/payroll/staff-payroll-service';

function makeSupabase(upsertResult: { error: unknown } = { error: null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  return {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn(() => ({ upsert })),
    } as never,
    upsert,
  };
}

const OK = {
  errorCount: 0,
  assignments: [
    { staffId: 's1', hrOrganizationId: 'o1' },
    { staffId: 's2', hrOrganizationId: 'o2' },
  ],
};

describe('StaffPayrollService.setPayersFromRows', () => {
  it('upserts every assignment on staff_id, keeping per-row organisations', async () => {
    const { client, upsert } = makeSupabase();
    const written = await StaffPayrollService.setPayersFromRows(client, OK, {
      skipInvalid: false,
    });

    expect(written).toBe(2);
    const [payload, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'staff_id' });
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ staff_id: 's1', hr_organization_id: 'o1' });
    expect(payload[1]).toMatchObject({ staff_id: 's2', hr_organization_id: 'o2' });
  });

  it('refuses the batch and writes nothing when there are errors and skipInvalid is off', async () => {
    const { client, upsert } = makeSupabase();
    await expect(
      StaffPayrollService.setPayersFromRows(
        client,
        { errorCount: 1, assignments: OK.assignments },
        { skipInvalid: false }
      )
    ).rejects.toThrow(/1 row/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('writes the valid rows when skipInvalid is on', async () => {
    const { client, upsert } = makeSupabase();
    const written = await StaffPayrollService.setPayersFromRows(
      client,
      { errorCount: 1, assignments: OK.assignments },
      { skipInvalid: true }
    );
    expect(written).toBe(2);
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('does not call the database when there is nothing to write', async () => {
    const { client, upsert } = makeSupabase();
    const written = await StaffPayrollService.setPayersFromRows(
      client,
      { errorCount: 0, assignments: [] },
      { skipInvalid: false }
    );
    expect(written).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('surfaces an RLS or FK rejection from the error channel, not a throw', async () => {
    const { client } = makeSupabase({
      error: { code: '23503', message: 'violates foreign key constraint' },
    });
    await expect(
      StaffPayrollService.setPayersFromRows(client, OK, { skipInvalid: false })
    ).rejects.toThrow(/foreign key/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/hr/payroll/set-payers-from-rows.test.ts`
Expected: FAIL — `setPayersFromRows is not a function`.

- [ ] **Step 3: Add the service method**

In `lib/services/hr/payroll/staff-payroll-service.ts`, insert after `setPayersBulk`:

```ts
  /**
   * Record payers from an uploaded sheet — DIFFERENT organisations per row.
   *
   * setPayersBulk cannot do this: it forces one organisation for every staff
   * id, which is right for "select 30 drivers, pick one payer" and wrong for a
   * spreadsheet. One upsert still covers the batch, because each element of the
   * array carries its own hr_organization_id.
   *
   * This method also OWNS the skipInvalid gate. The learner flow enforces its
   * equivalent in an API route; this module has none by design (RLS is the
   * enforcement point and a route would only re-wrap it), so the gate lives at
   * the single choke point every caller must pass through rather than as a
   * conditional in the dialog. It is a data-quality guard, not a security
   * boundary — permission is still RLS's job.
   *
   * Returns the number of rows written.
   */
  static async setPayersFromRows(
    supabase: SupabaseClient,
    report: { assignments: Array<{ staffId: string; hrOrganizationId: string }>; errorCount: number },
    opts: { skipInvalid: boolean }
  ): Promise<number> {
    if (report.errorCount > 0 && !opts.skipInvalid) {
      throw new Error(
        `${report.errorCount} row${report.errorCount === 1 ? '' : 's'} did not pass validation. Fix them, or switch on "Skip invalid rows" to record the rest.`
      );
    }
    if (report.assignments.length === 0) return 0;

    const { data: userData } = await supabase.auth.getUser();
    const updatedBy = userData?.user?.id ?? null;
    const updatedAt = new Date().toISOString();

    const { error } = await (supabase as any).from('hr_staff_payroll').upsert(
      report.assignments.map((a) => ({
        staff_id: a.staffId,
        hr_organization_id: a.hrOrganizationId,
        updated_by: updatedBy,
        updated_at: updatedAt,
      })),
      { onConflict: 'staff_id' }
    );

    if (error) {
      throw new Error(
        `Failed to record the payroll organisation for ${report.assignments.length} team members: ${getErrorMessage(error)}`
      );
    }

    return report.assignments.length;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/hr/payroll/set-payers-from-rows.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the mutation hook**

In `hooks/hr/use-staff-payroll.ts`, insert after `useSetStaffPayersBulk`:

```ts
/**
 * Record payers from an uploaded sheet. Invalidates the same keys as the other
 * mutations so the coverage cards, the queue and the table move together — a
 * partial refresh would leave the cards claiming work the table shows as done.
 */
export function useSetStaffPayersFromRows() {
  const supabase = useMemo(() => createClientSupabaseClient(), []);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      report,
      skipInvalid,
    }: {
      report: { assignments: Array<{ staffId: string; hrOrganizationId: string }>; errorCount: number };
      skipInvalid: boolean;
    }) => StaffPayrollService.setPayersFromRows(supabase, report, { skipInvalid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.awaitingPayer });
      queryClient.invalidateQueries({ queryKey: STAFF_PAYROLL_KEYS.directory });
    },
  });
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit 2>&1 | grep -E "staff-payroll|use-staff-payroll" ; echo done`
Expected: no lines before `done`.

```bash
git add lib/services/hr/payroll/staff-payroll-service.ts hooks/hr/use-staff-payroll.ts __tests__/hr/payroll/set-payers-from-rows.test.ts
git commit -m "feat(hr/payroll): setPayersFromRows with the skipInvalid gate"
```

---

### Task 4: The five-step upload dialog

**Files:**
- Create: `app/(routes)/hr/payroll/organisation/_components/bulk-payer-upload-dialog.tsx`

**Interfaces:**
- Consumes: `parseBulkPayerFile`, `BulkPayerReport`, `ParsedPayerRow`, `BulkPayerSheetError` (Task 2); `useSetStaffPayersFromRows` (Task 3).
- Produces: `BulkPayerUploadDialog({ open, onOpenChange, directory, organizations })`.

**Reference:** `app/(routes)/learners/profiles/_components/bulk-edit-exited-dialog.tsx` — the step rail, the format/record issue split and the result banner all come from there. Read lines 120–135 (step type + `STEPS`) and 1324+ (result step) before starting. Do **not** copy its 1,534-line structure wholesale; this dialog has one editable column and needs far less.

- [ ] **Step 1: Build the component**

Create the file with this structure:

```tsx
'use client';

/**
 * Five-step bulk edit for the Payroll Organisation directory.
 *
 * upload → preview → validate → writing → result
 *
 * The directory is passed IN rather than re-fetched: the page already holds
 * it, it is what the uploaded Staff IDs are validated against, and a second
 * fetch would let the two drift mid-flow.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getErrorMessage } from '@/lib/utils';
import { useSetStaffPayersFromRows } from '@/hooks/hr/use-staff-payroll';
import type {
  PayrollOrganization, StaffPayerRow,
} from '@/lib/services/hr/payroll/staff-payroll-service';

import {
  parseBulkPayerFile, type BulkPayerReport, type ParsedPayerRow,
} from './bulk-payer-parse';

type Step = 'upload' | 'preview' | 'validate' | 'writing' | 'result';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'upload', label: 'Upload' },
  { key: 'preview', label: 'Review changes' },
  { key: 'validate', label: 'Validation' },
  { key: 'result', label: 'Result' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: StaffPayerRow[];
  organizations: PayrollOrganization[];
}

export function BulkPayerUploadDialog({ open, onOpenChange, directory, organizations }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [report, setReport] = useState<BulkPayerReport | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [written, setWritten] = useState(0);
  const setPayers = useSetStaffPayersFromRows();

  const reset = useCallback(() => {
    setStep('upload');
    setReport(null);
    setSkipInvalid(false);
    setWritten(0);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const r = await parseBulkPayerFile(file, directory, organizations);
        setReport(r);
        setStep('preview');
      } catch (err) {
        // A BulkPayerSheetError means the file is unusable as a whole —
        // wrong sheet or a missing header. Nothing was read.
        toast.error(getErrorMessage(err));
      }
    },
    [directory, organizations]
  );

  const handleSubmit = useCallback(async () => {
    if (!report) return;
    setStep('writing');
    try {
      const n = await setPayers.mutateAsync({ report, skipInvalid });
      setWritten(n);
      setStep('result');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setStep('validate');
    }
  }, [report, skipInvalid, setPayers]);

  // ... render per step, see steps below
}
```

Render requirements per step:

- **`upload`** — a file input accepting `.xlsx`. Copy: "Export first, fill in the New Payer column, then upload the same file here."
- **`preview`** — a table of rows whose `status === 'update'`, columns: Row, Team member, Works at, Current payer → New payer. Above it: `{updateCount} to update · {skipCount} unchanged · {errorCount} with issues`. Buttons: Back, and "Continue to validation" → `setStep('validate')`.
- **`validate`** — two sections, rendered only when non-empty:
  - **"Fix the cell"** — rows with a `format` issue.
  - **"Fix the record"** — rows with a `record` issue.
  Each lists `Row {rowNumber}` + `person_name ?? staffId` + the messages. When `errorCount === 0`, show a green "Every row passed validation" panel instead.
  A `Switch` bound to `skipInvalid`, labelled "Record the valid rows anyway", **disabled and hidden when `errorCount === 0`**.
  The submit button is disabled when `errorCount > 0 && !skipInvalid`, and when `updateCount === 0`.
  Its label is `Record {updateCount} payer{s}`.
- **`writing`** — a spinner and "Recording payroll organisations…".
- **`result`** — a banner chosen by outcome, then the counts:
  - `written > 0 && errorCount === 0` → green, "All {written} recorded."
  - `written > 0 && errorCount > 0` → amber, "{written} recorded, {errorCount} skipped because of issues."
  - `written === 0 && updateCount === 0` → neutral, "Nothing needed changing."
  - `written === 0 && errorCount > 0` → red, "Nothing was recorded."
  Buttons: "Upload another" → `reset()`, and "Close" → `onOpenChange(false)` then `reset()`.

Also render the step rail in the header, mapping `writing` onto the `validate` pip so the rail never shows a fifth dot:

```tsx
const activeIndex = STEPS.findIndex(
  (s) => s.key === (step === 'writing' ? 'validate' : step)
);
```

- [ ] **Step 2: Lint and typecheck**

```bash
npx eslint "app/(routes)/hr/payroll/organisation/_components/bulk-payer-upload-dialog.tsx"
npx tsc --noEmit 2>&1 | grep "bulk-payer" ; echo done
```
Expected: eslint silent; no lines before `done`.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/hr/payroll/organisation/_components/bulk-payer-upload-dialog.tsx"
git commit -m "feat(hr/payroll): five-step bulk payer upload dialog"
```

---

### Task 5: Wire Export and Bulk Edit into the page

**Files:**
- Modify: `app/(routes)/hr/payroll/organisation/page.tsx`

**Interfaces:**
- Consumes: `downloadBulkPayerWorkbook` (Task 1), `BulkPayerUploadDialog` (Task 4), and the existing `filters` / `rows` / `organizations` / `canManage` already in the component.

- [ ] **Step 1: Add the filter summary helper**

Above the component, next to the other builders:

```ts
/**
 * Human-readable description of the active filters, written into the export's
 * Instructions sheet so a file found weeks later says what it contains.
 */
function describeFilters(
  f: PayerDirectoryFilterState,
  worksAtOptions: FilterOption[],
  payerOptions: FilterOption[],
  roleOptions: FilterOption[]
): string[] {
  const out: string[] = [];
  if (f.payerStatus !== 'all') {
    out.push(
      `Payer status: ${f.payerStatus === 'awaiting' ? 'Awaiting a payer' : 'Payer recorded'}`
    );
  }
  const label = (opts: FilterOption[], v: string) =>
    opts.find((o) => o.value === v)?.label ?? v;
  if (f.worksAtId) out.push(`Works at: ${label(worksAtOptions, f.worksAtId)}`);
  if (f.payerOrgId) out.push(`Paid by: ${label(payerOptions, f.payerOrgId)}`);
  if (f.roleKey) out.push(`Role: ${label(roleOptions, f.roleKey)}`);
  return out;
}
```

- [ ] **Step 2: Add state and the export handler inside the component**

After the existing `blockingFilter` memo:

```ts
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Exports what the filters currently show, using the SAME predicate the
   * table uses. Deriving this on a server route instead would mean a second
   * copy of the filter logic — the drift that made the "Works at" count
   * disagree with the table.
   */
  const handleExport = useCallback(async () => {
    const visible = rows.filter((r) => matchesDirectoryFilters(r, filters));
    if (visible.length === 0) {
      toast.error('Nothing to export under these filters.');
      return;
    }
    setIsExporting(true);
    try {
      await downloadBulkPayerWorkbook(
        visible,
        organizations,
        describeFilters(filters, worksAtOptions, payerOptions, roleOptions),
        new Date().toISOString().slice(0, 10)
      );
      toast.success(`Exported ${visible.length} team member${visible.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsExporting(false);
    }
  }, [rows, filters, organizations, worksAtOptions, payerOptions, roleOptions]);
```

- [ ] **Step 3: Add the buttons next to Refresh**

Replace the lone Refresh `<Button>` with a flex group containing, in order: **Export**, **Bulk Edit** (only when `canManage`), **Refresh**. Use `Download` and `FileSpreadsheet` from `lucide-react`, `variant='outline' size='sm' className='h-8'` to match. Export is deliberately available to read-only viewers — reading the data is what `.view` grants.

- [ ] **Step 4: Mount the dialog before `</ContentLayout>`**

```tsx
{canManage && (
  <BulkPayerUploadDialog
    open={bulkOpen}
    onOpenChange={setBulkOpen}
    directory={rows}
    organizations={organizations}
  />
)}
```

- [ ] **Step 5: Lint and typecheck**

```bash
npx eslint "app/(routes)/hr/payroll/organisation/page.tsx"
npx tsc --noEmit 2>&1 | grep "payroll/organisation" ; echo done
```
Expected: eslint silent; no lines before `done`.

- [ ] **Step 6: Full module test run**

Run: `npx vitest run __tests__/hr/payroll/`
Expected: PASS, 21 tests across 3 files.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/hr/payroll/organisation/page.tsx"
git commit -m "feat(hr/payroll): export and bulk edit on the Payroll Organisation page"
```

---

### Task 6: Browser verification

**Files:** none — this is the gate that makes the feature "done".

There is no automated coverage of the dialog or of ExcelJS's real output, so this step is not optional.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Do **not** run this while another dev server is up: `predev` prunes the Turbopack cache and corrupts the running server.

- [ ] **Step 2: Export under a filter**

Go to `/hr/payroll/organisation`, set **Works at = JKKN Main Office**, click **Export**.
Expected: `payroll-organisation-<today>.xlsx` with 104 data rows; column G empty with a working dropdown of 13 organisations and no JKKN Main Office; the Instructions sheet naming the filter; the Lists sheet hidden.

- [ ] **Step 3: Round trip with no edits**

Upload that file unchanged.
Expected: preview shows 0 to update / 104 unchanged; result says "Nothing needed changing"; no write occurs.

- [ ] **Step 4: The smoke sheet**

Build one file containing all seven cases and upload it:

| Case | Expected |
|---|---|
| Valid uuid + valid organisation | update |
| Valid uuid + `JKKN Main Office` in column G | format issue |
| `not-a-uuid` in column A | format issue |
| A uuid not in the directory | record issue |
| The same uuid on two rows | record issue on **both** |
| Valid uuid + blank column G | skipped (blank) |
| Valid uuid + its current payer | skipped (unchanged) |

Expected: with the switch **off**, submit is disabled and nothing is written. With it **on**, only the valid row is written, and the result banner reads "1 recorded, 4 skipped because of issues."

- [ ] **Step 5: Confirm the write landed**

```sql
SELECT s.first_name, o.name, p.updated_at
FROM hr_staff_payroll p
JOIN staff s ON s.id = p.staff_id
JOIN hr_organizations o ON o.id = p.hr_organization_id
ORDER BY p.updated_at DESC LIMIT 5;
```

Expected: the row from Step 4 at the top, with the organisation you chose.

- [ ] **Step 6: Confirm the read-only path**

As a role holding `hr.payroll.institution.view` but not `.manage`: Export is present and works; **Bulk Edit is absent**.

---

## Self-Review

**Spec coverage.** Export respecting filters → Task 1 + Task 5. Dropdown limited to payroll entities → Task 1 (`organizations` is already `is_payroll_entity = true` from `listPayrollOrganizations`). Blank = no change → Task 2. Staff-uuid identity → Tasks 1–2. Sheet by name, columns by header → Task 2. Scope enforcement via directory match → Task 2. Five steps → Task 4. Format/record split → Tasks 2 and 4. `skipInvalid` gate at one choke point → Task 3. Counting semantics → Task 2. Result banner → Task 4. Round-trip check → Task 2 (automated) and Task 6 (real file). Known RLS gap → explicitly out of scope.

**Placeholders.** None: every code step carries the actual code. Task 4's render is specified per step with exact copy and disable conditions rather than a code dump, because the reference dialog it mirrors is 1,534 lines and transcribing it would be worse than describing it precisely.

**Type consistency.** `BulkPayerReport.assignments` is `Array<{ staffId, hrOrganizationId }>` in Task 2, and `setPayersFromRows` in Task 3 accepts exactly `{ assignments, errorCount }` — a structural subset, so passing the whole report typechecks. `BULK_PAYER_HEADERS` is defined in Task 1 and imported by Tasks 2 and its tests. `ParsedPayerRow.rowNumber` is 1-based-with-header throughout.
