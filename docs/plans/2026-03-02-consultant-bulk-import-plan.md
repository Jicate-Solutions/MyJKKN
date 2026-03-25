# Consultant Bulk Import — Bug Fix + Preview Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken consultant bulk import (all rows fail due to column mapping bug + DB field name mismatches) and add a client-side Excel preview table with per-row validation highlights and an animated progress bar.

**Architecture:** Two file changes only — fix the server-side import route's column mapping, then enhance the client-side import dialog with a two-phase flow: parse-on-select (client-side xlsx) → upload-and-import (server). No new API endpoints or packages required.

**Tech Stack:** Next.js 15 App Router, TypeScript, `xlsx` (already installed), shadcn/ui (Dialog, Badge, Tooltip, Progress), Tailwind CSS.

**Design doc:** `docs/plans/2026-03-02-consultant-bulk-import-design.md`

---

## Task 1: Fix the `mapColumns` call in the import route

The root cause of the bulk upload failure. `CONSULTANT_COLUMN_MAPPING` is `{ excelHeader: dbField }` but the `mapColumns` utility expects `{ dbField: string[] }`. The `as any` cast hides the type error and causes every field lookup to iterate over individual characters of the DB field name — so every field maps to `undefined` and every row fails with "Missing required fields."

**Files:**
- Modify: `app/api/admission/consultants/import/route.ts`

**Step 1: Add `mapConsultantRow` helper right after the imports block**

Open `app/api/admission/consultants/import/route.ts`. After the last `import` statement (line ~17), add this helper function:

```typescript
/**
 * Map Excel row data to DB fields using CONSULTANT_COLUMN_MAPPING.
 * The mapping is { excelHeader: dbField }, so we iterate over its entries
 * and look up each Excel header key in the raw row data.
 */
function mapConsultantRow(rowData: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [excelHeader, dbField] of Object.entries(CONSULTANT_COLUMN_MAPPING)) {
    const value = rowData[excelHeader];
    if (value !== undefined && value !== null && value !== '') {
      mapped[dbField] = value;
    }
  }
  return mapped;
}
```

**Step 2: Replace the broken `mapColumns` call**

Find line 109 (inside the `for (const row of parseResult.rows)` loop):
```typescript
// OLD — broken, iterates over characters of dbField name:
const mappedData = mapColumns(row.data, CONSULTANT_COLUMN_MAPPING as any);
```

Replace with:
```typescript
// NEW — correct direct lookup:
const mappedData = mapConsultantRow(row.data);
```

Also remove the unused `mapColumns` import from line 6 since it's no longer used:
```typescript
// REMOVE this import:
import { parseExcelFile, mapColumns } from '@/lib/utils/excel-parser';

// REPLACE with:
import { parseExcelFile } from '@/lib/utils/excel-parser';
```

**Step 3: Manual smoke test** (optional but fast)
- Upload a valid Excel template with 1–2 rows filled in
- Expect: records are created instead of "Missing required fields" errors

---

## Task 2: Fix DB column name mismatches in the import route

Three fields in the consultant insert object use the wrong DB column names. After fixing Task 1, these would silently write `null` to the wrong columns.

**Files:**
- Modify: `app/api/admission/consultants/import/route.ts`

**Step 1: Fix `address` → `address_line1`**

Find the consultant insert object (around line 189). Locate:
```typescript
address: mappedData.address?.trim() || null,
```
Replace with:
```typescript
address_line1: mappedData.address_line1?.trim() || null,
```

**Step 2: Fix `bank_ifsc` → `bank_ifsc_code`**

Locate:
```typescript
bank_ifsc: mappedData.bank_ifsc?.toUpperCase().trim() || null,
```
Replace with:
```typescript
bank_ifsc_code: mappedData.bank_ifsc_code?.toUpperCase().trim() || null,
```

**Step 3: Fix `total_conversions` → `successful_conversions`**

Locate:
```typescript
total_conversions: parseNumberField(mappedData.total_conversions, 0),
```
Replace with:
```typescript
successful_conversions: parseNumberField(mappedData.successful_conversions, 0),
```

**Step 4: Commit the route fixes**

```bash
git add app/api/admission/consultants/import/route.ts
git commit -m "fix(consultants): fix broken column mapping and DB field names in import route

- Replace mapColumns(as any) with mapConsultantRow() helper that correctly
  uses CONSULTANT_COLUMN_MAPPING as { excelHeader → dbField } dictionary
- Fix address → address_line1
- Fix bank_ifsc → bank_ifsc_code
- Fix total_conversions → successful_conversions"
```

---

## Task 3: Add preview types, imports, and state to the import dialog

Set up all the scaffolding in `import-dialog.tsx` before touching any JSX.

**Files:**
- Modify: `app/(routes)/admission/consultants/_components/import-dialog.tsx`

**Step 1: Add new imports at the top of the file**

After the existing imports block, add:
```typescript
import { useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CONSULTANT_COLUMN_MAPPING } from '@/lib/utils/mappings/consultant-excel-mappings';
```

Also add `useRef` to the existing React import:
```typescript
// Change:
import { useState } from 'react';
// To:
import { useState, useRef } from 'react';
```

**Step 2: Add `PreviewRow` interface after the existing `ImportResult` interface**

```typescript
interface PreviewRow {
  rowNumber: number;
  name: string;
  phone: string;
  type: string;
  email: string;
  errors: string[];
  isValid: boolean;
}
```

**Step 3: Add new state variables inside the component, after the existing state declarations**

```typescript
const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null);
const [isParsing, setIsParsing] = useState(false);
const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

---

## Task 4: Add client-side parse and validation helpers

These functions run entirely in the browser — no network call. They mirror the server's validation rules so users see errors before uploading.

**Files:**
- Modify: `app/(routes)/admission/consultants/_components/import-dialog.tsx`

**Step 1: Add validation constants and `validatePreviewRow` helper above the component**

Place these between the interfaces and the `export function ConsultantImportDialog` declaration:

```typescript
// Valid consultant types (mirrors server validation)
const VALID_CONSULTANT_TYPES = new Set([
  'external', 'internal', 'institutional', 'alumni', 'student',
]);
const CONSULTANT_TYPE_ALIASES: Record<string, string> = {
  agent: 'external',
  partner: 'external',
};

function validatePreviewRow(
  mapped: Record<string, any>,
  rowNumber: number
): PreviewRow {
  const errors: string[] = [];

  const name = String(mapped.name || '').trim();
  const rawPhone = String(mapped.phone || '');
  const phone = rawPhone.replace(/\D/g, '');
  const typeRaw = String(mapped.consultant_type || '').toLowerCase().trim();
  const email = String(mapped.email || '').toLowerCase().trim();

  if (!name) errors.push('Missing: Name');

  if (!rawPhone) {
    errors.push('Missing: Phone');
  } else if (phone.length < 10) {
    errors.push(`Phone too short (${phone.length} digits, need ≥10)`);
  }

  if (!mapped.consultant_type) {
    errors.push('Missing: Type');
  } else if (!VALID_CONSULTANT_TYPES.has(typeRaw) && !CONSULTANT_TYPE_ALIASES[typeRaw]) {
    errors.push(
      `Invalid type: "${mapped.consultant_type}" — use: external, internal, institutional, alumni, student`
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Invalid email: ${email}`);
  }

  return {
    rowNumber,
    name: name || '—',
    phone: phone || rawPhone || '—',
    type: String(mapped.consultant_type || '') || '—',
    email: email || '—',
    errors,
    isValid: errors.length === 0,
  };
}
```

**Step 2: Add `parseFileForPreview` inside the component, after the existing state declarations**

```typescript
const parseFileForPreview = async (file: File) => {
  setIsParsing(true);
  setPreviewData(null);
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);

    // Find the "Consultants" sheet, or the first non-instructions sheet
    const sheetName =
      workbook.SheetNames.find((n) => n.toLowerCase().includes('consultant')) ??
      workbook.SheetNames.find(
        (n) =>
          !n.toLowerCase().includes('instruction') &&
          !n.toLowerCase().includes('reference')
      ) ??
      workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

    const rows: PreviewRow[] = jsonData.map((row, index) => {
      // Apply CONSULTANT_COLUMN_MAPPING: { excelHeader: dbField }
      const mapped: Record<string, any> = {};
      for (const [header, field] of Object.entries(CONSULTANT_COLUMN_MAPPING)) {
        if (row[header] !== undefined && row[header] !== null && row[header] !== '') {
          mapped[field] = row[header];
        }
      }
      return validatePreviewRow(mapped, index + 2); // +2: 1-indexed + header row
    });

    setPreviewData(rows);
  } catch {
    // Silently fail preview — server will catch the real error on upload
    setPreviewData([]);
  } finally {
    setIsParsing(false);
  }
};
```

---

## Task 5: Add progress animation helpers and update `handleUpload`

Replace the fake hardcoded `setProgress` jumps with a smooth animated progress bar that advances through 4 labelled stages.

**Files:**
- Modify: `app/(routes)/admission/consultants/_components/import-dialog.tsx`

**Step 1: Add `startProgressAnimation`, `stopProgressAnimation`, and `getProgressLabel` inside the component, after `parseFileForPreview`**

```typescript
const startProgressAnimation = () => {
  setProgress(0);
  let p = 0;
  progressIntervalRef.current = setInterval(() => {
    p = Math.min(p + 1, 99);
    setProgress(p);
    if (p >= 99) clearInterval(progressIntervalRef.current!);
  }, 60); // 60ms per tick ≈ 6 seconds to reach 99%
};

const stopProgressAnimation = () => {
  if (progressIntervalRef.current) {
    clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = null;
  }
  setProgress(100);
};

const getProgressLabel = (p: number): string => {
  if (p < 25) return 'Uploading file...';
  if (p < 50) return 'Parsing Excel...';
  if (p < 75) return 'Checking duplicates...';
  return 'Creating records...';
};
```

**Step 2: Update `handleUpload` — replace fake progress calls**

Find the `handleUpload` function. Remove these lines:
```typescript
setProgress(10);   // line ~126
setProgress(30);   // line ~138 (after formData.append)
setProgress(70);   // line ~143 (after response)
setProgress(100);  // line ~145 (after setResult)
```

Replace with:
- At the very start of `handleUpload` (before `setUploading(true)`): `startProgressAnimation();`
- In the `finally` block, before `setUploading(false)`: `stopProgressAnimation();`

The updated `handleUpload` should look like:
```typescript
const handleUpload = async () => {
  if (!file) return;

  startProgressAnimation();   // ← replaces all setProgress() calls
  setUploading(true);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/admission/consultants/import', {
      method: 'POST',
      body: formData,
    });

    const data: ImportResult = await response.json();
    setResult(data);

    if (data.success) {
      toast.success(
        `Successfully imported ${data.successCount} consultant${data.successCount !== 1 ? 's' : ''}!`
      );
      if (onImportComplete) setTimeout(() => onImportComplete(), 500);
    } else if (data.successCount > 0) {
      toast.warning(
        `Imported ${data.successCount} with ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}`
      );
      if (onImportComplete) setTimeout(() => onImportComplete(), 500);
    } else {
      toast.error(`Import failed with ${data.errorCount} error${data.errorCount !== 1 ? 's' : ''}`);
    }
  } catch (error) {
    console.error('[ConsultantImportDialog] Upload error:', error);
    toast.error('Upload failed');
    setResult({
      success: false,
      successCount: 0,
      errorCount: 1,
      totalRows: 0,
      errors: [{ row: 0, message: error instanceof Error ? error.message : 'Upload failed' }],
    });
  } finally {
    stopProgressAnimation();  // ← replaces setProgress(100)
    setUploading(false);
  }
};
```

**Step 3: Update `handleOpenChange` to clear preview state and cancel any in-flight interval**

Find `handleOpenChange`. Add two lines to the `if (!newOpen)` block:
```typescript
const handleOpenChange = (newOpen: boolean) => {
  if (!newOpen) {
    setFile(null);
    setResult(null);
    setProgress(0);
    setPreviewData(null);          // ← NEW
    setIsParsing(false);           // ← NEW
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }
  onOpenChange(newOpen);
};
```

**Step 4: Update `handleFileChange` to trigger preview parsing**

Find `handleFileChange`. After `setFile(selectedFile)`, add:
```typescript
const handleFileChange = (selectedFile: File | null) => {
  if (selectedFile) {
    if (
      !selectedFile.name.endsWith('.xlsx') &&
      !selectedFile.name.endsWith('.xls')
    ) {
      toast.error('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setFile(selectedFile);
    setResult(null);
    setPreviewData(null);           // ← NEW: clear stale preview
    parseFileForPreview(selectedFile); // ← NEW: start client-side parse
  }
};
```

**Step 5: Update the "Try Again" button handler to clear preview state**

Find the "Try Again" button's `onClick`. Add `setPreviewData(null)` and `setIsParsing(false)`:
```typescript
onClick={() => {
  setFile(null);
  setResult(null);
  setProgress(0);
  setPreviewData(null);   // ← NEW
  setIsParsing(false);    // ← NEW
}}
```

---

## Task 6: Add preview table to the dialog JSX

Insert the preview table between the drop zone and the progress bar.

**Files:**
- Modify: `app/(routes)/admission/consultants/_components/import-dialog.tsx`

**Step 1: Change `DialogContent` max-width from `max-w-3xl` to `max-w-4xl`**

```tsx
// OLD:
<DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
// NEW:
<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
```

**Step 2: Add parsing indicator inside the drop zone**

In the file-selected branch of the drop zone (where `{file ? (...)` renders the file name row), add a parsing indicator below the file info row:
```tsx
{isParsing && (
  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
    <Loader2 className="h-3 w-3 animate-spin" />
    Analyzing file...
  </p>
)}
```

**Step 3: Add the preview table block after the drop zone `</div>` and before the progress bar section**

Insert this block after the closing `)}` of the `{!result && (...)}` drop zone section:

```tsx
{/* Preview Table — shown after client-side parse, before upload */}
{previewData !== null && previewData.length > 0 && !result && (
  <div className="space-y-2">
    {/* Summary bar */}
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground font-medium">
        {previewData.length} row{previewData.length !== 1 ? 's' : ''} detected
      </span>
      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300">
        ✓ {previewData.filter((r) => r.isValid).length} valid
      </Badge>
      {previewData.some((r) => !r.isValid) && (
        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300">
          ✗ {previewData.filter((r) => !r.isValid).length} errors
        </Badge>
      )}
    </div>

    {/* Scrollable table */}
    <div className="border rounded-lg overflow-hidden">
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground w-10">#</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Phone</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-2 py-2 w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <TooltipProvider>
              {previewData.slice(0, 100).map((row) => (
                <Tooltip key={row.rowNumber}>
                  <TooltipTrigger asChild>
                    <tr
                      className={
                        row.isValid
                          ? 'hover:bg-muted/30 cursor-default'
                          : 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100/70 dark:hover:bg-red-900/20 cursor-default'
                      }
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">{row.rowNumber}</td>
                      <td
                        className={`px-2 py-1.5 max-w-[140px] truncate ${
                          row.errors.some((e) => e.includes('Name'))
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : ''
                        }`}
                      >
                        {row.name}
                      </td>
                      <td
                        className={`px-2 py-1.5 ${
                          row.errors.some((e) => e.includes('Phone'))
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : ''
                        }`}
                      >
                        {row.phone}
                      </td>
                      <td
                        className={`px-2 py-1.5 ${
                          row.errors.some((e) => e.includes('type') || e.includes('Type'))
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : ''
                        }`}
                      >
                        {row.type}
                      </td>
                      <td
                        className={`px-2 py-1.5 max-w-[140px] truncate ${
                          row.errors.some((e) => e.includes('email') || e.includes('Email'))
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : ''
                        }`}
                      >
                        {row.email}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.isValid ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                      </td>
                    </tr>
                  </TooltipTrigger>
                  {!row.isValid && (
                    <TooltipContent side="left" className="max-w-xs">
                      <ul className="text-xs space-y-0.5">
                        {row.errors.map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}
            </TooltipProvider>
          </tbody>
        </table>
      </div>
      {previewData.length > 100 && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/50">
          ... and {previewData.length - 100} more rows (all will be imported)
        </div>
      )}
    </div>
  </div>
)}

{/* Empty file warning */}
{previewData !== null && previewData.length === 0 && !result && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>
      No data rows found in the file. Make sure the Excel sheet is named &quot;Consultants&quot; and has data below the header row.
    </AlertDescription>
  </Alert>
)}
```

**Step 4: Update the progress bar label to use `getProgressLabel`**

Find the progress bar section:
```tsx
<p className="text-sm text-center text-gray-600 dark:text-gray-400">
  {progress < 30 && 'Uploading file...'}
  {progress >= 30 && progress < 70 && 'Validating data and checking duplicates...'}
  {progress >= 70 && 'Creating consultant records...'}
</p>
```

Replace with:
```tsx
<p className="text-sm text-center text-gray-600 dark:text-gray-400">
  {getProgressLabel(progress)}
</p>
```

**Step 5: Update the Import button to show row count**

Find the Import button in `DialogFooter`. Replace the button content:
```tsx
<Button onClick={handleUpload} disabled={!file || uploading || isParsing}>
  {uploading ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Uploading...
    </>
  ) : isParsing ? (
    <>
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      Analyzing...
    </>
  ) : previewData && previewData.length > 0 ? (
    <>
      <Upload className="h-4 w-4 mr-2" />
      Import {previewData.filter((r) => r.isValid).length || previewData.length} row
      {(previewData.filter((r) => r.isValid).length || previewData.length) !== 1 ? 's' : ''}
    </>
  ) : (
    <>
      <Upload className="h-4 w-4 mr-2" />
      Import
    </>
  )}
</Button>
```

**Step 6: Final commit**

```bash
git add app/(routes)/admission/consultants/_components/import-dialog.tsx
git commit -m "feat(consultants): add Excel preview table with validation highlights and animated progress bar

- Parse Excel client-side on file select using xlsx
- Show scrollable preview table: Name, Phone, Type, Email columns
- Color-code rows: green = valid, red = has errors
- Hover tooltip on error rows shows specific field-level messages
- Summary bar: 'N rows · ✓ valid · ✗ errors'
- Import button shows row count: 'Import 38 rows'
- Replace fake hardcoded progress with smooth animated 4-stage bar
- Empty file detection with helpful error message"
```

---

## Verification

After both tasks are committed, do a manual end-to-end test:

1. Navigate to `/admission/consultants`
2. Click **Import**
3. Download the template, fill in 3–5 rows including 1 intentionally bad row (e.g., blank Name, or phone `12345`)
4. Drop the file into the dialog
5. **Expected**: Preview table appears immediately. Good rows show green, bad row shows red. Hover the bad row → tooltip lists errors. Import button shows `"Import N rows"`
6. Click Import
7. **Expected**: Progress bar animates smoothly through 4 stages with correct labels
8. **Expected**: Success result showing imported count
9. **Expected**: Consultant list refreshes with the new records
