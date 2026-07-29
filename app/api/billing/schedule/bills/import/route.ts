export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type {
  ImportError,
  ImportResult,
  ImportSuccessRow
} from '@/lib/utils/mappings/student-bill-excel-mappings';
import { resolveStudentBillColumns } from '@/lib/utils/mappings/student-bill-excel-mappings';
import {
  isOncePerLearnerViolation,
  oncePerLearnerMessage
} from '@/lib/utils/billing-duplicate-error';

/**
 * POST /api/billing/schedule/bills/import
 *
 * Bulk-creates Student Bills from an uploaded Excel file. Each Excel row
 * is treated as one self-contained bill. Validation runs row-by-row;
 * valid rows commit even when other rows fail (partial-success contract).
 *
 * Columns are matched by HEADER TEXT (see STUDENT_BILL_HEADER_ALIASES), not by
 * position, so sheets may gain or reorder columns freely:
 *   Roll Number      (required)  → resolves to learners_profiles.id + institution_id
 *   Academic Year    (required)  → resolves to academic_years.id, scoped to the
 *                                  student's institution
 *   Billing Category (required)  → resolves to billing_categories.id
 *   Due Date         (required)  → ISO yyyy-mm-dd
 *   Billing Amount   (required)  → number ≥ 0
 *   Institution      (optional)  → cross-checked against the learner's own
 *                                  institution; drives the template's cascading
 *                                  Academic Year dropdown
 *   First/Last Name  (optional)  → reference only; names the learner in reports
 *   Bill Description (optional)
 *   Remarks          (optional)
 *
 * Response: always ImportResult — { success, successCount, errorCount,
 * totalRows, errors[], successes[] } — including on failure.
 */

// ----------------------------------------------------------------------
// Schema for the cleaned, type-coerced row before DB lookup
// ----------------------------------------------------------------------
const billRowSchema = z.object({
  roll_number: z.string().min(1, 'Roll number is required'),
  billing_category_name: z.string().min(1, 'Billing category is required'),
  bill_description: z.string().optional().nullable(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be yyyy-mm-dd'),
  billing_amount: z.number().nonnegative('Billing amount must be ≥ 0'),
  remarks: z.string().optional().nullable(),
  // Required as of 2026-07-29. Previously optional (blank → NULL), but only
  // 62 of 10,990 production bills ever had a null academic year, so blanks
  // were mistakes rather than a used workflow.
  academic_year_name: z.string().min(1, 'Academic year is required'),
  // Optional. Drives the template's cascading Academic Year dropdown; when
  // present it is cross-checked against the learner's real institution so a
  // mismatched pick is caught instead of silently failing year resolution.
  institution_name: z.string().optional().nullable()
});

type CleanedRow = z.infer<typeof billRowSchema>;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Every failure exit returns an ImportResult-shaped body, not a bare
 * `{ error }`. The dialog types the response as ImportResult and reads
 * `result.errors` — six exits used to return a shape without it, which crashed
 * the dialog on `result.errors.length` AND discarded the very message that
 * explained the failure. Keep the HTTP status honest, keep the body renderable.
 */
function failure(message: string, status: number, field?: string) {
  return NextResponse.json<ImportResult>(
    {
      success: false,
      successCount: 0,
      errorCount: 1,
      totalRows: 0,
      errors: [{ row: 0, field, message }],
      successes: []
    },
    { status }
  );
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[, ₹]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  // Excel date serial (number of days since 1900-01-00)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000); // 25569 = days from 1900-01-01 to 1970-01-01
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  // String — accept yyyy-mm-dd directly, otherwise try Date.parse
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();
  try {
    // -- Auth ----------------------------------------------------------
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return failure(
        'Your session has expired or is not valid. Refresh the page, sign in again, and re-upload.',
        401
      );
    }

    // -- File ----------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return failure('No file was received by the server. Please pick the file again.', 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    // Pick the data sheet BY NAME. Taking SheetNames[0] breaks as soon as a
    // sheet is reordered or the file is re-saved by a tool that moves
    // "Instructions" to the front — and the resulting "file is empty" error
    // points nowhere near the real cause.
    const NON_DATA_SHEETS = new Set(['lists', 'instructions']);
    const sheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'bills') ??
      workbook.SheetNames.find((n) => !NON_DATA_SHEETS.has(n.trim().toLowerCase())) ??
      workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      return failure(
        'No readable sheet found in this workbook. Expected a sheet named "Bills".',
        400
      );
    }

    // Parse to AOA so we can keep row indices honest with respect to header row
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });

    if (rows.length < 2) {
      return failure(
        `Sheet "${sheetName}" has a header row but no data rows. Add at least one bill row below the header and re-upload.`,
        400
      );
    }

    // Resolve columns by HEADER TEXT, not position. This is what lets the
    // template gain columns (First Name / Last Name) without shifting every
    // field one to the right in sheets already in circulation.
    const col = resolveStudentBillColumns((rows[0] ?? []) as unknown[]);

    const REQUIRED_COLUMNS: Array<[string, string]> = [
      ['roll_number', 'Roll Number'],
      // Required since 2026-07-29. Caught at header level so a sheet without
      // the column fails once with a clear message, rather than every row
      // failing individually with "Academic year is required".
      ['academic_year_name', 'Academic Year'],
      ['billing_category_name', 'Billing Category'],
      ['due_date', 'Due Date'],
      ['billing_amount', 'Billing Amount']
    ];
    const missingColumns = REQUIRED_COLUMNS.filter(([field]) => col[field] === undefined);
    if (missingColumns.length > 0) {
      return failure(
        `Sheet "${sheetName}" is missing required column${missingColumns.length > 1 ? 's' : ''}: ` +
          `${missingColumns.map(([, label]) => `"${label}"`).join(', ')}. ` +
          'Download a fresh template, or check the header row spelling.',
        400
      );
    }

    const dataRows = rows.slice(1); // drop header
    const errors: ImportError[] = [];
    const cleanedRows: Array<{
      rowNumber: number;
      cleaned: CleanedRow;
      /** First+Last as typed in the sheet — names the learner when the roll doesn't resolve. */
      sheetLearnerName: string;
    }> = [];
    // Count every non-blank row once so totalRows reconciles with
    // successes + failures regardless of which stage a row dies in.
    let attemptedRowCount = 0;

    // -- Pre-flight: parse, type-coerce, schema-validate per row -------
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed Excel row, +1 for header
      const cells = dataRows[i] || [];

      // Skip fully blank rows quietly
      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;
      attemptedRowCount++;

      // Read through the resolved header map. A column the sheet doesn't carry
      // reads as null rather than silently picking up its neighbour's value.
      const cell = (field: string): unknown =>
        col[field] === undefined ? null : cells[col[field]] ?? null;

      const parsed = {
        roll_number: cellToString(cell('roll_number')),
        billing_category_name: cellToString(cell('billing_category_name')),
        bill_description: cellToString(cell('bill_description')) || undefined,
        due_date: cellToISODate(cell('due_date')) ?? '',
        billing_amount: cellToNumber(cell('billing_amount')),
        remarks: cellToString(cell('remarks')) || undefined,
        academic_year_name: cellToString(cell('academic_year_name')),
        institution_name: cellToString(cell('institution_name')) || undefined
      };

      // Name as typed in the sheet. Used to identify the learner in error
      // reports when the roll number doesn't resolve to a DB record.
      const sheetLearnerName = [cellToString(cell('first_name')), cellToString(cell('last_name'))]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (parsed.billing_amount === null) {
        errors.push({
          row: rowNumber,
          field: 'Billing Amount',
          message: 'Billing amount is missing or not a number.',
          roll_number: parsed.roll_number || undefined,
          student_name: sheetLearnerName || undefined
        });
        continue;
      }

      const validation = billRowSchema.safeParse({
        ...parsed,
        billing_amount: parsed.billing_amount
      });

      if (!validation.success) {
        for (const issue of validation.error.issues) {
          errors.push({
            row: rowNumber,
            field: issue.path.join('.') || undefined,
            message: issue.message,
            roll_number: parsed.roll_number || undefined,
            student_name: sheetLearnerName || undefined
          });
        }
        continue;
      }

      cleanedRows.push({ rowNumber, cleaned: validation.data, sheetLearnerName });
    }

    if (cleanedRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    // -- Resolve lookups in batch --------------------------------------
    const uniqueRollNumbers = Array.from(
      new Set(cleanedRows.map((r) => r.cleaned.roll_number))
    );
    const uniqueCategoryNames = Array.from(
      new Set(cleanedRows.map((r) => r.cleaned.billing_category_name))
    );

    const { data: students } = await supabase
      .from('learners_profiles')
      .select('id, roll_number, institution_id, first_name, last_name')
      .in('roll_number', uniqueRollNumbers);

    const studentByRoll = new Map<
      string,
      { id: string; institution_id: string | null; name: string }
    >();
    (students ?? []).forEach((s: any) => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      // If the same roll number appears for multiple students, keep the first
      // and surface ambiguity as a per-row error below.
      if (!studentByRoll.has(s.roll_number)) {
        studentByRoll.set(s.roll_number, {
          id: s.id,
          institution_id: s.institution_id,
          name
        });
      } else {
        // Mark the roll as ambiguous by using a sentinel
        studentByRoll.set(s.roll_number, {
          id: '__AMBIGUOUS__',
          institution_id: null,
          name: ''
        });
      }
    });

    // Batch-load academic years for the institutions in play. Years are
    // per-institution, so the same name (e.g. "2024-2025") repeats across
    // institutions with different ids — we key resolution by institution.
    const institutionIds = Array.from(
      new Set(
        Array.from(studentByRoll.values())
          .map((s) => s.institution_id)
          .filter((x): x is string => Boolean(x))
      )
    );
    const { data: acadYears } = await supabase
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .in(
        'institution_id',
        institutionIds.length ? institutionIds : ['00000000-0000-0000-0000-000000000000']
      );
    const acadYearByInstName = new Map<string, string>();
    // Valid year names per institution, used to make the rejection message
    // actionable ("… available: 2024-2025, 2025-2026") instead of a dead end.
    const acadYearNamesByInst = new Map<string, string[]>();
    (acadYears ?? []).forEach((y: any) => {
      const name = String(y.academic_year_name).trim();
      acadYearByInstName.set(`${y.institution_id}::${name.toLowerCase()}`, y.id);
      const list = acadYearNamesByInst.get(y.institution_id) ?? [];
      if (!list.includes(name)) list.push(name);
      acadYearNamesByInst.set(y.institution_id, list);
    });

    // Institution name -> id, for validating the (optional) Institution column
    // against the learner the roll number actually resolved to. Names are
    // unique across the 14 institutions, so a name is a safe key —
    // counselling_code is NOT (both Arts & Science colleges share "CAS").
    const { data: institutionRows } = await supabase
      .from('institutions')
      .select('id, name');
    const institutionIdByName = new Map<string, string>();
    const institutionNameById = new Map<string, string>();
    (institutionRows ?? []).forEach((i: any) => {
      if (!i.name) return;
      institutionIdByName.set(String(i.name).trim().toLowerCase(), i.id);
      institutionNameById.set(i.id, String(i.name));
    });

    const { data: categories } = await supabase
      .from('billing_categories')
      .select('id, category_name, is_active, once_per_learner')
      .in('category_name', uniqueCategoryNames);

    const categoryByName = new Map<string, string>();
    // Categories that permit only one live bill per learner. The DB trigger is
    // the real enforcement, but this import commits every row in ONE batch —
    // so letting the trigger fire would abort the whole sheet over a single
    // offending row, breaking the partial-success contract the dialog promises.
    // Pre-checking lets the offending rows fail individually and the rest land.
    const oncePerLearnerCategoryIds = new Set<string>();
    (categories ?? []).forEach((c: any) => {
      if (c.is_active !== false) {
        categoryByName.set(c.category_name, c.id);
        if (c.once_per_learner) oncePerLearnerCategoryIds.add(c.id);
      }
    });

    // Existing live bills for the restricted categories, limited to the
    // learners actually named in this sheet.
    const existingRestrictedPairs = new Set<string>();
    if (oncePerLearnerCategoryIds.size > 0) {
      const studentIds = Array.from(
        new Set(
          Array.from(studentByRoll.values())
            .map((s) => s.id)
            .filter((id) => id && id !== '__AMBIGUOUS__')
        )
      );
      // Chunked: an unbounded .in() builds a URL PostgREST rejects with a 400
      // once a sheet gets large.
      const CHUNK = 200;
      for (let i = 0; i < studentIds.length; i += CHUNK) {
        const { data: existing, error: existingError } = await supabase
          .from('billing_student_bills')
          .select('student_id, item_category_id')
          .in('student_id', studentIds.slice(i, i + CHUNK))
          .in('item_category_id', Array.from(oncePerLearnerCategoryIds))
          .not('status', 'in', '("cancelled","superseded")');

        if (existingError) {
          console.error('[bills/import] Duplicate pre-check failed:', existingError);
          return failure(
            `Failed to check for existing bills: ${existingError.message}`,
            500
          );
        }
        (existing ?? []).forEach((b: any) =>
          existingRestrictedPairs.add(`${b.student_id}::${b.item_category_id}`)
        );
      }
    }

    // Pairs claimed by an earlier row of THIS sheet — catches a sheet that
    // lists the same learner and category twice, which the DB would otherwise
    // reject only after the first row had already been accepted.
    const claimedInThisSheet = new Set<string>();

    // -- Build insert rows for entries that pass lookup ----------------
    const insertRows: any[] = [];
    // Per-row learner detail kept in lockstep with insertRows (same index)
    // so successes can be echoed back — and named — after the batch insert.
    const pendingSuccesses: ImportSuccessRow[] = [];

    for (const { rowNumber, cleaned, sheetLearnerName } of cleanedRows) {
      const studentMatch = studentByRoll.get(cleaned.roll_number);
      if (!studentMatch) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `No student found with roll number "${cleaned.roll_number}".`,
          roll_number: cleaned.roll_number,
          student_name: sheetLearnerName || undefined
        });
        continue;
      }
      if (studentMatch.id === '__AMBIGUOUS__') {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Roll number "${cleaned.roll_number}" matches multiple students — please disambiguate before importing.`,
          roll_number: cleaned.roll_number,
          student_name: sheetLearnerName || undefined
        });
        continue;
      }
      if (!studentMatch.institution_id) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Student "${cleaned.roll_number}" has no institution attached — fix the student record first.`,
          roll_number: cleaned.roll_number,
          student_name: studentMatch.name
        });
        continue;
      }

      // Institution column is advisory — the roll number is what identifies the
      // learner. But if it was filled in and disagrees, say so plainly: it
      // means the wrong row was picked, and the academic year chosen from that
      // institution's dropdown would fail resolution a few lines below with a
      // far less obvious message.
      if (cleaned.institution_name) {
        const claimedId = institutionIdByName.get(
          cleaned.institution_name.trim().toLowerCase()
        );
        if (!claimedId) {
          errors.push({
            row: rowNumber,
            field: 'Institution',
            message: `Institution "${cleaned.institution_name}" does not exist. Pick one from the dropdown.`,
            roll_number: cleaned.roll_number,
            student_name: studentMatch.name || sheetLearnerName || undefined
          });
          continue;
        }
        if (claimedId !== studentMatch.institution_id) {
          errors.push({
            row: rowNumber,
            field: 'Institution',
            message:
              `This row says "${cleaned.institution_name}", but roll number "${cleaned.roll_number}" ` +
              `belongs to "${institutionNameById.get(studentMatch.institution_id) ?? 'another institution'}". ` +
              'Fix the Institution cell (and re-pick the Academic Year, which depends on it).',
            roll_number: cleaned.roll_number,
            student_name: studentMatch.name || sheetLearnerName || undefined
          });
          continue;
        }
      }

      const categoryId = categoryByName.get(cleaned.billing_category_name);
      if (!categoryId) {
        errors.push({
          row: rowNumber,
          field: 'Billing Category',
          message: `Billing category "${cleaned.billing_category_name}" does not exist or is inactive.`,
          roll_number: cleaned.roll_number,
          student_name: studentMatch.name
        });
        continue;
      }

      // "Once per learner" guard. Rejected here rather than at the database so
      // one offending row fails alone instead of aborting the whole batch.
      if (oncePerLearnerCategoryIds.has(categoryId)) {
        const pairKey = `${studentMatch.id}::${categoryId}`;
        if (existingRestrictedPairs.has(pairKey)) {
          errors.push({
            row: rowNumber,
            field: 'Billing Category',
            message: `"${cleaned.billing_category_name}" allows only one bill per learner, and this learner already has one. Cancel the existing bill first, or turn off "Once per learner" on the category.`,
            roll_number: cleaned.roll_number,
            student_name: studentMatch.name
          });
          continue;
        }
        if (claimedInThisSheet.has(pairKey)) {
          errors.push({
            row: rowNumber,
            field: 'Billing Category',
            message: `"${cleaned.billing_category_name}" allows only one bill per learner, and an earlier row in this file already bills this learner for it.`,
            roll_number: cleaned.roll_number,
            student_name: studentMatch.name
          });
          continue;
        }
        claimedInThisSheet.add(pairKey);
      }

      // Resolve the academic year against this student's institution. Years are
      // per-institution and the sets differ sharply between colleges, so a name
      // valid elsewhere is still rejected here.
      const academicYearId = acadYearByInstName.get(
        `${studentMatch.institution_id}::${cleaned.academic_year_name.trim().toLowerCase()}`
      );
      if (!academicYearId) {
        const available = acadYearNamesByInst.get(studentMatch.institution_id) ?? [];
        errors.push({
          row: rowNumber,
          field: 'Academic Year',
          message:
            `Academic year "${cleaned.academic_year_name}" does not exist for ` +
            `"${institutionNameById.get(studentMatch.institution_id) ?? "this student's institution"}". ` +
            (available.length > 0
              ? `Available: ${available.slice().sort().join(', ')}.`
              : 'That institution has no academic years set up yet — create one first.'),
          roll_number: cleaned.roll_number,
          student_name: studentMatch.name
        });
        continue;
      }

      const totalAmount = cleaned.billing_amount; // quantity defaults to 1, no tax in this flow
      insertRows.push({
        student_id: studentMatch.id,
        institution_id: studentMatch.institution_id,
        item_category_id: categoryId,
        academic_year_id: academicYearId,
        bill_description: cleaned.bill_description || null,
        due_date: cleaned.due_date,
        quantity: 1,
        unit_amount: cleaned.billing_amount,
        total_amount: totalAmount,
        tax_amount: 0,
        final_amount: totalAmount,
        balance_amount: totalAmount,
        remarks: cleaned.remarks || null,
        is_recurring: false,
        created_by: user.id
      });
      pendingSuccesses.push({
        row: rowNumber,
        roll_number: cleaned.roll_number,
        student_name: studentMatch.name,
        billing_category: cleaned.billing_category_name,
        due_date: cleaned.due_date,
        billing_amount: cleaned.billing_amount,
        academic_year: cleaned.academic_year_name || null
      });
    }

    if (insertRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    // -- Insert in one batch (RLS-respecting; auth user will be evaluated)
    const { data: inserted, error: insertError } = await supabase
      .from('billing_student_bills')
      .insert(insertRows)
      .select('id');

    if (insertError) {
      console.error('[bills/import] Insert error:', insertError);
      // The pre-check above catches the ordinary case. Reaching here means a
      // concurrent session created the conflicting bill between our check and
      // this insert — rare, but the batch is all-or-nothing, so say what to do.
      if (isOncePerLearnerViolation(insertError)) {
        insertError.message = `${oncePerLearnerMessage(insertError)} Another user appears to have created it while this file was uploading — re-upload to import the remaining rows.`;
      }
      // The batch insert is all-or-nothing, so every pending row failed —
      // surface each learner so the failure report names them all.
      for (const pending of pendingSuccesses) {
        errors.push({
          row: pending.row,
          message: `Database insert failed: ${insertError.message}`,
          roll_number: pending.roll_number,
          student_name: pending.student_name
        });
      }
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: attemptedRowCount,
        errors,
        successes: []
      });
    }

    const successCount = inserted?.length ?? insertRows.length;
    // PostgREST returns inserted rows in input order, so index i of
    // `inserted` is the bill created from insertRows[i] / pendingSuccesses[i].
    const successes: ImportSuccessRow[] = pendingSuccesses.map((s, i) => ({
      ...s,
      bill_id: inserted?.[i]?.id
    }));

    return NextResponse.json<ImportResult>({
      success: errors.length === 0,
      successCount,
      errorCount: errors.length,
      totalRows: attemptedRowCount,
      errors,
      successes
    });
  } catch (error) {
    console.error('[billing/schedule/bills/import] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return failure(`Failed to process import: ${errorMessage}`, 500);
  }
}
