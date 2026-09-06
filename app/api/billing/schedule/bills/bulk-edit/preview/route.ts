export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/preview/route.ts
// POST — dry-run. Parse + validate + diff the uploaded file vs current DB
// values and return the change-set. NOTHING is written.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import { BulkEditBillsService } from '@/lib/services/billing/schedule/bulk-edit-bills-service';
import {
  EDITABLE_FIELD_LABELS,
  type BulkEditPreviewResult,
  type BulkEditRowPreview
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { computed, errors } = await BulkEditBillsService.parseAndValidate(buffer, supabase);

    const changedComputed = computed.filter((r) => r.valid && r.changes.length > 0);
    const unchanged = computed.filter((r) => r.valid && r.changes.length === 0).length;

    const rows: BulkEditRowPreview[] = changedComputed.map((r) => ({
      row: r.row,
      bill_id: r.bill_id,
      roll_number: r.roll_number,
      student_name: r.student_name,
      status: r.status,
      changes: r.changes
    }));

    const fieldsAffected = Array.from(
      new Set(changedComputed.flatMap((r) => r.changes.map((c) => EDITABLE_FIELD_LABELS[c.field])))
    );

    const result: BulkEditPreviewResult = {
      totalRows: computed.length,
      changedRows: changedComputed.length,
      unchangedRows: unchanged,
      errorCount: errors.length,
      fieldsAffected,
      rows,
      errors
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/preview] Error:', error);
    // Supabase errors are plain objects, not Error instances — an
    // `instanceof Error` check swallows them as "Unknown error".
    const message = getErrorMessage(error);
    return NextResponse.json({ error: 'Failed to preview changes', message }, { status: 500 });
  }
}
