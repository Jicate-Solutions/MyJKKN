export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-template/count/route.ts
//
// Companion to ../route.ts (the actual template generator). Returns just
// the count of outstanding bills matching the filter set so the dialog
// can render a live preview as the user adjusts the hierarchy filters,
// without forcing a full Excel build per keystroke.
//
// Auth mirrors the parent endpoint: super admin, or a role holding
// billing.receipts.bulk_create scoped to its accessible institutions. The
// count itself is not sensitive but the filter combinations leak the
// hierarchy and we keep them gated identically.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBulkReceiptAccess,
  assertInstitutionInScope
} from '@/lib/auth/bulk-receipt-access';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';

// Matches the parent template endpoint's maxDuration so a slow count
// query has the same headroom as the actual template build. In practice
// a properly-indexed COUNT(*) on billing_student_bills should be sub-second,
// but the ceiling protects against a missing index in older environments.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await resolveBulkReceiptAccess(user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  try {
    const sp = request.nextUrl.searchParams;
    const requestedInstitutionId = sp.get('institution_id') || undefined;

    // 403 rather than an empty count: silently returning 0 would read as
    // "no outstanding bills for this institution", which is both wrong and
    // unactionable.
    const scopeError = assertInstitutionInScope(access, requestedInstitutionId);
    if (scopeError) {
      return NextResponse.json({ error: scopeError }, { status: 403 });
    }

    const filters = {
      institution_id: requestedInstitutionId,
      // Super admins pass undefined (unrestricted); everyone else is bounded
      // to their accessible institutions because this route runs on the
      // service-role client and RLS is not in the path.
      institution_ids: access.isSuperAdmin ? undefined : access.institutionIds,
      item_category_id: sp.get('item_category_id') || undefined,
      degree_id: sp.get('degree_id') || undefined,
      department_id: sp.get('department_id') || undefined,
      program_id: sp.get('program_id') || undefined,
      semester_id: sp.get('semester_id') || undefined,
      section_id: sp.get('section_id') || undefined,
      academic_year_id: sp.get('academic_year_id') || undefined,
      due_date_from: sp.get('due_date_from') || undefined,
      due_date_to: sp.get('due_date_to') || undefined
    };

    const supabase = createServiceRoleClient();
    const count = await BillingReceiptService.countOutstandingBillsForBulk(
      filters,
      supabase as any
    );

    return NextResponse.json({ count });
  } catch (error) {
    console.error(
      '[billing/receipts/bulk-template/count] Error:',
      error
    );
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to count bills', message },
      { status: 500 }
    );
  }
}
