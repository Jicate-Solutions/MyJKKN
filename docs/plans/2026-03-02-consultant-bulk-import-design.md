# Design: Consultant Bulk Import — Bug Fix + Preview Enhancement
**Date**: 2026-03-02
**Status**: Approved
**Scope**: `app/api/admission/consultants/import/route.ts`, `app/(routes)/admission/consultants/_components/import-dialog.tsx`

---

## Problem

The consultant bulk import is completely broken. Three compounding bugs prevent any row from being imported:

1. **`mapColumns` signature mismatch** — `CONSULTANT_COLUMN_MAPPING` is `{ excelHeader: dbField }` but `mapColumns()` expects `{ dbField: string[] }`. Called with `as any`, it iterates over individual characters of the DB field name as row lookup keys, making every mapped field `undefined`. Every row fails with "Missing required fields".

2. **DB column name mismatches** in the insert object:
   - `address:` should be `address_line1:`
   - `bank_ifsc:` should be `bank_ifsc_code:`
   - `total_conversions:` should be `successful_conversions:`

3. **Fake progress bar** — hardcoded jumps to 10 → 30 → 70 → 100 with no real stage feedback.

Additionally, there is no client-side preview — users have no visibility into their data before uploading.

---

## Solution: Approach A — Fix Bugs + Enhanced Dialog

### Bug Fixes (`route.ts`)

Replace the broken `mapColumns` call with a dedicated `mapConsultantRow()` helper that uses `CONSULTANT_COLUMN_MAPPING` correctly (direct Excel header → value lookup using the mapping as a dictionary). Fix the three DB column name mismatches in the insert object.

### Enhanced Dialog Flow (`import-dialog.tsx`)

Two-phase flow inside the same dialog:

**Phase 1 — Parse & Preview** (triggered immediately on file select):
- Parse Excel client-side using `xlsx` (already installed)
- Show a scrollable preview table: columns `#`, `Name`, `Phone`, `Type`, `Email`, `Status`
- Each row: green background (✓ valid) or red background (✗ errors)
- Hover tooltip on red rows shows specific error messages
- Summary bar: `42 rows detected · ✓ 38 valid · ✗ 4 errors`
- Import button label: `"Import 38 valid rows"` (or all rows if no errors)
- Table capped at 100 visible rows with overflow footer

**Phase 2 — Upload & Results** (after clicking Import):
- 4-stage animated progress bar with meaningful labels:
  - `Uploading file...` (0–25%)
  - `Parsing Excel...` (25–50%)
  - `Checking duplicates...` (50–75%)
  - `Creating records...` (75–100%)
- `setInterval`-based animation between stages, resolves to 100% on response
- Existing success/partial/error results panel unchanged

---

## Data Structures

```typescript
// New state slice in import-dialog.tsx
interface PreviewRow {
  rowNumber: number;
  data: Record<string, string>;  // raw display values for the 6 preview columns
  errors: string[];              // client-side validation error messages
  isValid: boolean;
}

// Client-side validation checks (mirrors server, no DB duplicate check)
// - Required: name, phone, consultant_type
// - Phone: cleaned digits >= 10
// - Email: regex format if present
// - Type: enum match (external|internal|institutional|alumni|student + aliases)
```

---

## Files Changed

| File | Change |
|---|---|
| `app/api/admission/consultants/import/route.ts` | Fix `mapColumns` call, fix 3 DB column names |
| `app/(routes)/admission/consultants/_components/import-dialog.tsx` | Add preview state, client-side parse, preview table, animated progress bar |

## Files NOT Changed

- `lib/utils/mappings/consultant-excel-mappings.ts` — correct as-is, only the usage was wrong
- `lib/utils/excel-parser.ts` — unchanged
- All other consultant module files — untouched

---

## Constraints

- No new API endpoints
- No new npm packages (xlsx already installed)
- Dialog max-width: `max-w-3xl` → `max-w-4xl` to fit preview table
- Client-side validation is advisory only; server always re-validates on upload
