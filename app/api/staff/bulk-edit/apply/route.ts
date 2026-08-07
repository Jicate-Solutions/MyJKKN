export const dynamic = 'force-dynamic';

// app/api/staff/bulk-edit/apply/route.ts
//
// POST — write an uploaded bulk-edit workbook. Runs the identical evaluate() the preview
// route runs (via BulkStaffEditService.apply) before it writes anything, so preview and
// apply can never disagree.
//
// The `skipInvalid` gate is enforced HERE on the server, inside BulkStaffEditService.apply:
// when there are failed rows and skipInvalid is false, nothing is written and the service
// returns refused: true. The client's switch only SENDS the flag — it never decides.

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
    // The switch only SENDS this. The server is what enforces it.
    const skipInvalid = form.get('skipInvalid') === 'true';

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

    const { report, refused } = await BulkStaffEditService.apply(parsed.rows, filter.institutionIds, skipInvalid);

    // Refused batches return the FULL success-shaped report at 400 so the typed client can
    // render it. A partial success must never be rendered as a total failure: the equivalent
    // learners feature once threw the whole report away on one bad row out of 400 and left
    // the user unable to tell that the other 399 HAD been written.
    return NextResponse.json(report, { status: refused ? 400 : 200 });
  } catch (err) {
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}, { requirePermission: 'staff.manage_imports' });
