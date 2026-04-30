export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { ImportError, ImportResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * POST /api/billing/schedule/bills/import
 *
 * Bulk-creates Student Bills from an uploaded Excel file. Each Excel row
 * is treated as one self-contained bill. Validation runs row-by-row;
 * valid rows commit even when other rows fail (partial-success contract).
 *
 * Excel columns:
 *   A Roll Number      (required)  → resolves to learners_profiles.id + institution_id
 *   B Billing Category (required)  → resolves to billing_categories.id
 *   C Bill Description (optional)
 *   D Due Date         (required)  → ISO yyyy-mm-dd
 *   E Billing Amount   (required)  → number ≥ 0
 *   F Remarks          (optional)
 *
 * Response: { success, successCount, errorCount, totalRows, errors[] }
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
  remarks: z.string().optional().nullable()
});

type CleanedRow = z.infer<typeof billRowSchema>;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // -- File ----------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json({ error: 'No sheet found in workbook' }, { status: 400 });
    }

    // Parse to AOA so we can keep row indices honest with respect to header row
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'File is empty or contains only a header row' },
        { status: 400 }
      );
    }

    const dataRows = rows.slice(1); // drop header
    const errors: ImportError[] = [];
    const cleanedRows: Array<{ rowNumber: number; cleaned: CleanedRow }> = [];

    // -- Pre-flight: parse, type-coerce, schema-validate per row -------
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed Excel row, +1 for header
      const cells = dataRows[i] || [];

      // Skip fully blank rows quietly
      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;

      const parsed = {
        roll_number: cellToString(cells[0]),
        billing_category_name: cellToString(cells[1]),
        bill_description: cellToString(cells[2]) || undefined,
        due_date: cellToISODate(cells[3]) ?? '',
        billing_amount: cellToNumber(cells[4]),
        remarks: cellToString(cells[5]) || undefined
      };

      if (parsed.billing_amount === null) {
        errors.push({
          row: rowNumber,
          field: 'Billing Amount',
          message: 'Billing amount is missing or not a number.'
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
            message: issue.message
          });
        }
        continue;
      }

      cleanedRows.push({ rowNumber, cleaned: validation.data });
    }

    if (cleanedRows.length === 0) {
      const totalAttempted = dataRows.filter(
        (r) => !r.every((c) => c === null || c === undefined || String(c).trim() === '')
      ).length;
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: totalAttempted,
        errors
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
      .select('id, roll_number, institution_id')
      .in('roll_number', uniqueRollNumbers);

    const studentByRoll = new Map<string, { id: string; institution_id: string | null }>();
    (students ?? []).forEach((s: any) => {
      // If the same roll number appears for multiple students, keep the first
      // and surface ambiguity as a per-row error below.
      if (!studentByRoll.has(s.roll_number)) {
        studentByRoll.set(s.roll_number, { id: s.id, institution_id: s.institution_id });
      } else {
        // Mark the roll as ambiguous by using a sentinel
        studentByRoll.set(s.roll_number, { id: '__AMBIGUOUS__', institution_id: null });
      }
    });

    const { data: categories } = await supabase
      .from('billing_categories')
      .select('id, category_name, is_active')
      .in('category_name', uniqueCategoryNames);

    const categoryByName = new Map<string, string>();
    (categories ?? []).forEach((c: any) => {
      if (c.is_active !== false) {
        categoryByName.set(c.category_name, c.id);
      }
    });

    // -- Build insert rows for entries that pass lookup ----------------
    const insertRows: any[] = [];
    const passedRowNumbers: number[] = [];

    for (const { rowNumber, cleaned } of cleanedRows) {
      const studentMatch = studentByRoll.get(cleaned.roll_number);
      if (!studentMatch) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `No student found with roll number "${cleaned.roll_number}".`
        });
        continue;
      }
      if (studentMatch.id === '__AMBIGUOUS__') {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Roll number "${cleaned.roll_number}" matches multiple students — please disambiguate before importing.`
        });
        continue;
      }
      if (!studentMatch.institution_id) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Student "${cleaned.roll_number}" has no institution attached — fix the student record first.`
        });
        continue;
      }

      const categoryId = categoryByName.get(cleaned.billing_category_name);
      if (!categoryId) {
        errors.push({
          row: rowNumber,
          field: 'Billing Category',
          message: `Billing category "${cleaned.billing_category_name}" does not exist or is inactive.`
        });
        continue;
      }

      const totalAmount = cleaned.billing_amount; // quantity defaults to 1, no tax in this flow
      insertRows.push({
        student_id: studentMatch.id,
        institution_id: studentMatch.institution_id,
        item_category_id: categoryId,
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
      passedRowNumbers.push(rowNumber);
    }

    if (insertRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: cleanedRows.length,
        errors
      });
    }

    // -- Insert in one batch (RLS-respecting; auth user will be evaluated)
    const { data: inserted, error: insertError } = await supabase
      .from('billing_student_bills')
      .insert(insertRows)
      .select('id');

    if (insertError) {
      console.error('[bills/import] Insert error:', insertError);
      // Surface the DB error against the first attempted row so the user
      // sees something actionable rather than a silent server error.
      errors.push({
        row: passedRowNumbers[0] ?? 0,
        message: `Database insert failed: ${insertError.message}`
      });
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: cleanedRows.length,
        errors
      });
    }

    const successCount = inserted?.length ?? insertRows.length;

    return NextResponse.json<ImportResult>({
      success: errors.length === 0,
      successCount,
      errorCount: errors.length,
      totalRows: cleanedRows.length,
      errors
    });
  } catch (error) {
    console.error('[billing/schedule/bills/import] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process import', message: errorMessage },
      { status: 500 }
    );
  }
}
