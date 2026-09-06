export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/route.ts
// POST — commit. Re-validates the uploaded workbook, then inserts the rows that
// pass. The dry-run sibling that writes nothing is ./preview/route.ts.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import { BulkCreateBillsService } from '@/lib/services/billing/schedule/bulk-create-bills-service';
import { logActivity } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';
import type { ImportResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

export const maxDuration = 60;

// Cap on how many per-bill entries are persisted inline in the audit metadata.
// Matches AUDIT_CHANGES_CAP in bulk-edit/apply. The full set always goes back
// in the HTTP response, which is what the client report renders from.
const AUDIT_BILLS_CAP = 1000;

/**
 * POST /api/billing/schedule/bills/import
 *
 * Bulk-creates learner bills from an uploaded Excel file. One sheet row = one
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

    // -- Audit -------------------------------------------------------------
    // ONE summary row per upload, per-bill detail in metadata (capped) —
    // the same shape bulk-edit/apply writes.
    //
    // This route is where essentially all bulk bill creation actually happens,
    // and until now it wrote nothing: the only trace of an upload was
    // `billing_student_bills.created_by` + `created_at`. Bulk delete and bulk
    // edit both logged, so /billing/activities showed every bulk verb EXCEPT
    // create — which reads as "no bulk create happened" rather than "bulk
    // create isn't instrumented".
    //
    // `sub_type` deliberately matches the client-side template used by the
    // form path (StudentBillService.bulkCreateStudentBills), so one filter in
    // the activity feed covers both ways of bulk-creating a bill.
    if (successes.length > 0) {
      // institution_id lives on the insert payload, not on ImportSuccessRow.
      // Worth carrying: a sheet is keyed by roll number, so a single upload
      // can span several institutions without the operator ever naming one.
      // Recording the spread is what makes that visible afterwards.
      const institutionByRow = new Map<number, string>();
      analysis.inserts.forEach((insert) => {
        const id = insert.payload.institution_id;
        if (typeof id === 'string') institutionByRow.set(insert.row, id);
      });
      const institutionIds = Array.from(
        new Set(
          successes
            .map((s) => institutionByRow.get(s.row))
            .filter((id): id is string => Boolean(id))
        )
      );

      const learnerCount = new Set(successes.map((s) => s.roll_number)).size;
      const totalAmount = successes.reduce((sum, s) => sum + (s.billing_amount || 0), 0);

      await logActivity({
        userId: user.id,
        actionType: ACTIVITY_TYPES.CREATE,
        resourceType: RESOURCE_TYPES.BILL,
        description:
          `Bulk created ${successes.length} bill${successes.length !== 1 ? 's' : ''} ` +
          `for ${learnerCount} learner${learnerCount !== 1 ? 's' : ''} ` +
          `(₹${totalAmount.toLocaleString('en-IN')}) from ${file.name}`,
        request,
        // Stamped only when the upload really did touch exactly one
        // institution — a single id on a multi-institution sheet would be
        // worse than a blank, because it reads as a scope that was never true.
        institutionId: institutionIds.length === 1 ? institutionIds[0] : undefined,
        metadata: {
          sub_type: 'student_bill_bulk',
          file_name: file.name,
          total_rows: preview.totalRows,
          created: successes.length,
          failed: errors.length,
          // Whether the operator explicitly accepted skipping invalid rows.
          // That's a control decision, not a UI detail, so it belongs here.
          skip_invalid: skipInvalid,
          learner_count: learnerCount,
          total_amount: totalAmount,
          institution_ids: institutionIds,
          bills: successes.slice(0, AUDIT_BILLS_CAP).map((s) => ({
            bill_id: s.bill_id,
            row: s.row,
            roll_number: s.roll_number,
            student_name: s.student_name,
            billing_category: s.billing_category,
            due_date: s.due_date,
            amount: s.billing_amount
          })),
          bills_truncated: successes.length > AUDIT_BILLS_CAP,
          bills_overflow: Math.max(0, successes.length - AUDIT_BILLS_CAP)
        }
      });
    }

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
