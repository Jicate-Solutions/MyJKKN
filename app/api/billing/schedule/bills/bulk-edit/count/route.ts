export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/count/route.ts
// GET — count of bills matching the bulk-edit filters (live preview). User-scoped.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type { BulkEditDownloadFilters } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: BulkEditDownloadFilters = {
      institution_id: sp.get('institution_id') || undefined,
      item_category_id: sp.get('item_category_id') || undefined,
      status: sp.get('status') || undefined,
      academic_year_id: sp.get('academic_year_id') || undefined,
      due_date_from: sp.get('due_date_from') || undefined,
      due_date_to: sp.get('due_date_to') || undefined
    };

    const count = await StudentBillService.countBillsForBulkEdit(filters, supabase);
    return NextResponse.json({ count });
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/count] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to count bills', message }, { status: 500 });
  }
}
