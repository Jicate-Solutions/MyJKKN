export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/apply/route.ts
// POST — re-parse + re-validate the uploaded file, UPDATE changed bills (RLS as
// the user), and write ONE audit row (summary + per-bill before→after) to
// user_activity_logs. Partial success: valid rows commit even if others fail.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/utils';
import { BulkEditBillsService } from '@/lib/services/billing/schedule/bulk-edit-bills-service';
import { logActivity } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';
import {
  EDITABLE_FIELD_LABELS,
  type BulkEditApplyResult
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 120;

// Cap on how many per-bill diffs are persisted inline in the audit metadata.
// The full set is always returned in the HTTP response (client report).
const AUDIT_CHANGES_CAP = 1000;

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
    const changeSet = await BulkEditBillsService.parseAndValidate(buffer, supabase);
    const unchanged = changeSet.computed.filter((r) => r.valid && r.changes.length === 0).length;

    const { applied, failed } = await BulkEditBillsService.apply(changeSet, supabase);

    const fieldsAffected = Array.from(
      new Set(applied.flatMap((a) => a.changes.map((c) => EDITABLE_FIELD_LABELS[c.field])))
    );

    // -- Audit (one summary row; per-bill before→after in metadata, capped) --
    if (applied.length > 0) {
      const cappedChanges = applied.slice(0, AUDIT_CHANGES_CAP).map((a) => ({
        bill_id: a.bill_id,
        roll_number: a.roll_number,
        student_name: a.student_name,
        diffs: a.changes.map((c) => ({ field: c.label, old: c.old, new: c.new }))
      }));
      await logActivity({
        userId: user.id,
        actionType: ACTIVITY_TYPES.UPDATE,
        resourceType: RESOURCE_TYPES.BILL,
        description: `Bulk-edited ${applied.length} student bill${applied.length !== 1 ? 's' : ''}${fieldsAffected.length ? ` — fields: ${fieldsAffected.join(', ')}` : ''}`,
        request,
        metadata: {
          sub_type: 'student_bill_bulk_edit',
          fields_changed: fieldsAffected,
          total_rows: changeSet.computed.length,
          changed: applied.length,
          unchanged,
          failed: failed.length,
          file_name: file.name,
          changes: cappedChanges,
          changes_truncated: applied.length > AUDIT_CHANGES_CAP,
          changes_overflow: Math.max(0, applied.length - AUDIT_CHANGES_CAP)
        }
      });
    }

    const result: BulkEditApplyResult = {
      success: failed.length === 0 && changeSet.errors.length === 0,
      changedRows: applied.length,
      unchangedRows: unchanged,
      failedRows: failed.length,
      errorCount: changeSet.errors.length + failed.length,
      fieldsAffected,
      applied,
      errors: [...changeSet.errors, ...failed]
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/apply] Error:', error);
    // Supabase errors are plain objects, not Error instances — an
    // `instanceof Error` check swallows them as "Unknown error".
    const message = getErrorMessage(error);
    return NextResponse.json({ error: 'Failed to apply changes', message }, { status: 500 });
  }
}
