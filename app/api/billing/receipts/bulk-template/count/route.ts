export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-template/count/route.ts
//
// Companion to ../route.ts (the actual template generator). Returns just
// the count of outstanding bills matching the filter set so the dialog
// can render a live preview as the user adjusts the hierarchy filters,
// without forcing a full Excel build per keystroke.
//
// Auth mirrors the parent endpoint: super-admin only. The count itself
// is not sensitive but the filter combinations leak the hierarchy and
// we keep them gated identically.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';

// Matches the parent template endpoint's maxDuration so a slow count
// query has the same headroom as the actual template build. In practice
// a properly-indexed COUNT(*) on billing_student_bills should be sub-second,
// but the ceiling protects against a missing index in older environments.
export const maxDuration = 60;

async function assertSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return (
    profile?.is_super_admin === true || profile?.role === 'super_admin'
  );
}

export async function GET(request: NextRequest) {
  await connection();

  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = await assertSuperAdmin(user.id);
  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: 'Forbidden — super-admin only' },
      { status: 403 }
    );
  }

  try {
    const sp = request.nextUrl.searchParams;
    const filters = {
      institution_id: sp.get('institution_id') || undefined,
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
