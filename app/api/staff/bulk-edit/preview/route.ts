export const dynamic = 'force-dynamic';

// app/api/staff/bulk-edit/preview/route.ts
//
// POST — evaluate an uploaded bulk-edit workbook against current staff records and return
// the report of what WOULD change. Writes nothing: it calls BulkStaffEditService.evaluate(),
// never .apply(). The apply route (Task 8) runs the identical evaluate() before it writes,
// so preview and apply can never disagree.

import { NextRequest, NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { parseStaffBulkEditWorkbook } from '@/lib/services/staff/staff-bulk-edit-parser';
import { BulkStaffEditService } from '@/lib/services/staff/bulk-staff-edit-service';
import { createApiInstitutionFilter } from '@/lib/auth/api-institution-filter';

export const POST = withAuth(async (request: NextRequest, auth) => {
  await connection();
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const parsed = parseStaffBulkEditWorkbook(await file.arrayBuffer());
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'That sheet has no data rows.' }, { status: 400 });
    }

    // Institution scope via the session-bearing server client — see BUG-004195 in
    // lib/auth/api-institution-filter.ts. An empty institutionIds array means "all
    // institutions" (super-admin / admission-global bypass) and is passed through
    // unmodified: BulkStaffEditService.scopesToInstitutions() is what interprets it,
    // not a branch on filter.isSuperAdmin here.
    const filter = await createApiInstitutionFilter(request, { requireInstitutionAccess: true });
    if (!filter.isAllowed) {
      return NextResponse.json({ error: filter.reason ?? 'No institution access' }, { status: 403 });
    }

    const { report } = await BulkStaffEditService.evaluate(parsed.rows, filter.institutionIds);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requirePermission: 'staff.manage_imports' });
