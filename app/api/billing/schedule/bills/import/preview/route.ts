export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/import/preview/route.ts
// POST — dry run. Parse the uploaded workbook, resolve every lookup, evaluate
// the configured billing rules, and return the verdict. NOTHING is written.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import { BulkCreateBillsService } from '@/lib/services/billing/schedule/bulk-create-bills-service';
import type { BulkCreatePreviewResult } from '@/lib/utils/mappings/student-bill-excel-mappings';

export const maxDuration = 60;

/**
 * Every exit returns a BulkCreatePreviewResult, never a bare `{ error }`.
 *
 * The client types this response as BulkCreatePreviewResult and reads
 * `result.rows` / `result.errors` directly. A failure shape without those keys
 * crashes the page on `.length` AND throws away the message that explained what
 * went wrong — the exact bug that bit the old import dialog (see the `failure`
 * helper in ../route.ts). `fatal` is the field the UI renders for file-level
 * problems, so put the explanation there.
 */
function fatal(message: string, status: number) {
  return NextResponse.json<BulkCreatePreviewResult>(
    {
      sheetName: '',
      fatal: message,
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      learnerCount: 0,
      totalAmount: 0,
      issueCounts: { format: 0, lookup: 0, condition: 0 },
      conditionChecks: [],
      categoryBreakdown: [],
      rows: [],
      rowsTruncated: false,
      errors: [{ row: 0, message }]
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
      return fatal(
        'Your session has expired or is not valid. Refresh the page, sign in again, and re-upload.',
        401
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return fatal('No file was received by the server. Please pick the file again.', 400);
    }

    const analysis = await BulkCreateBillsService.parseAndValidate(
      await file.arrayBuffer(),
      supabase
    );

    // toPreviewResult reads only the client-safe rows — the resolved database
    // ids held in `analysis.inserts` never leave the server.
    return NextResponse.json<BulkCreatePreviewResult>(
      BulkCreateBillsService.toPreviewResult(analysis)
    );
  } catch (error) {
    console.error('[billing/schedule/bills/import/preview] Error:', error);
    // Supabase errors are plain objects, not Error instances — an
    // `instanceof Error` check swallows them as "Unknown error".
    return fatal(`Failed to read this file: ${getErrorMessage(error)}`, 500);
  }
}
