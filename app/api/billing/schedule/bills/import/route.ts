export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/route.ts
// POST — commit. Re-validates the uploaded workbook, then inserts the rows that
// pass. The dry-run sibling that writes nothing is ./preview/route.ts.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import { BulkCreateBillsService } from '@/lib/services/billing/schedule/bulk-create-bills-service';
import type { ImportResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

export const maxDuration = 60;

/**
 * POST /api/billing/schedule/bills/import
 *
 * Bulk-creates Student Bills from an uploaded Excel file. One sheet row = one
 * bill. All parsing, lookup resolution and rule evaluation live in
 * `BulkCreateBillsService.parseAndValidate` — the same call the preview route
 * makes — so what the user reviewed is what gets committed.
 *
 * The file is re-parsed here rather than accepting a payload from the client:
 * the browser must not be able to hand us insert rows it assembled itself, and
 * the database may have moved since the preview (another user creating the
 * conflicting bill is the realistic case).
 *
 * Form fields:
 *   file        (required) the .xlsx / .xls workbook
 *   skipInvalid (optional) 'false' → refuse to write anything if ANY row is
 *               invalid. Absent or 'true' → commit the valid rows and report
 *               the rest, which is the long-standing partial-success behaviour.
 *               The multi-step UI sends 'false' until the user explicitly ticks
 *               "skip the invalid rows", which turns that checkbox into a real
 *               server-side gate rather than a cosmetic one.
 *
 * Response: always ImportResult — { success, successCount, errorCount,
 * totalRows, errors[], successes[] } — including on failure. See `failure`.
 */

/**
 * Every failure exit returns an ImportResult-shaped body, not a bare
 * `{ error }`. The client types the response as ImportResult and reads
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

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
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

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return failure('No file was received by the server. Please pick the file again.', 400);
    }
    // Absent → true, preserving the behaviour every existing caller relies on.
    const skipInvalid = formData.get('skipInvalid') !== 'false';

    const analysis = await BulkCreateBillsService.parseAndValidate(
      await file.arrayBuffer(),
      supabase
    );

    // File-level problem (no readable sheet, no data rows, missing column).
    if (analysis.fatal) {
      return failure(analysis.fatal, 400);
    }

    const preview = BulkCreateBillsService.toPreviewResult(analysis);

    // Caller asked for all-or-nothing and the sheet isn't clean. Return the
    // full error list so the client can show exactly what to fix — the same
    // payload a preview would have produced, minus any write.
    if (!skipInvalid && preview.errorRows > 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: preview.errors.length,
        totalRows: preview.totalRows,
        errors: preview.errors,
        successes: []
      });
    }

    if (analysis.inserts.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false,
        successCount: 0,
        errorCount: preview.errors.length,
        totalRows: preview.totalRows,
        errors: preview.errors,
        successes: []
      });
    }

    const { successes, errors: commitErrors } = await BulkCreateBillsService.commit(
      analysis,
      supabase,
      user.id
    );

    // Validation issues and insert failures are both "rows that didn't become
    // bills", so the report lists them together in sheet order.
    const errors = [...preview.errors, ...commitErrors].sort((a, b) => a.row - b.row);

    return NextResponse.json<ImportResult>({
      success: errors.length === 0,
      successCount: successes.length,
      errorCount: errors.length,
      totalRows: preview.totalRows,
      errors,
      successes
    });
  } catch (error) {
    console.error('[billing/schedule/bills/import] Error:', error);
    // Supabase errors are plain objects, not Error instances — an
    // `instanceof Error` check swallows them as "Unknown error".
    return failure(`Failed to process import: ${getErrorMessage(error)}`, 500);
  }
}
