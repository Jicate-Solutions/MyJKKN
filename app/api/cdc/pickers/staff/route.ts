export const dynamic = 'force-dynamic';

// app/api/cdc/pickers/staff/route.ts
// GET /api/cdc/pickers/staff — institution-scoped staff option source for
// CDC "new" form pickers (facilitator / coordinator / mentor selectors).
//
// WHY service-role: same RLS gap as the learners picker — a CDC coordinator
// holds cdc.* but not staff.*, so the browser (anon/RLS) client returns 0
// rows and the picker looks empty. This route reads via the service-role
// client to bypass that RLS gap, then re-imposes the SAME institution scope
// every other API route uses. super_admin and admission roles keep their
// cross-institution bypass; everyone else only ever sees their own
// institutions' staff — no cross-tenant leak.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery,
} from '@/lib/auth/api-institution-filter';

interface StaffPickerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  staff_id: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Step 1: Session auth — must be a logged-in user
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Resolve caller's institution scope (super_admin/admission bypass
  // preserved — they return institutionIds: [] which means "all").
  const filter = await createApiInstitutionFilter(request);
  if (!filter.isAllowed) {
    return NextResponse.json(
      { error: filter.reason || 'Institution access denied' },
      { status: 403 }
    );
  }

  try {
    // Step 3: Service-role read (bypasses staff RLS) ...
    const supabase = createServiceRoleClient();
    let query = supabase
      .from('staff')
      .select('id, first_name, last_name, staff_id')
      .eq('is_active', true)
      .order('first_name', { ascending: true })
      .limit(5000);

    // Step 4: ... then re-impose institution scope (NEVER cross-tenant).
    query = applyInstitutionFilterToQuery(query, filter);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/pickers/staff] query failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to load staff' },
        { status: 500 }
      );
    }

    const options = ((data || []) as StaffPickerRow[]).map((s) => ({
      value: s.id,
      label:
        `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() +
        (s.staff_id ? ` (${s.staff_id})` : ''),
    }));

    return NextResponse.json(
      { options },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[cdc/pickers/staff] error:', err);
    return NextResponse.json(
      { error: 'Failed to load staff' },
      { status: 500 }
    );
  }
}
