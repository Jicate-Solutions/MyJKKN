// app/api/service-requests/fee-categories/route.ts
//
// The billing category a fee step bills: 'ID Card Fee', and nothing else.
// Returned as a list (zero or one row) so the step builder can tell "not set
// up yet" from "ready". No other fee head is ever exposed here — a fee step
// must not be able to raise bills in Tuition / Hostel / Exam categories.
//
// Read with the service-role client on purpose: billing_categories RLS is
// gated on billing.categories.view, which the people who configure service
// types (principal office, HODs) do not hold. Only id / name / amount leave
// this route.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthSession, createServiceRoleClient } from '@/lib/supabase/server';
import { SERVICE_REQUEST_FEE_CATEGORY_NAME } from '@/types/service-request';

export async function GET() {
  const { session, error: sessionError } = await getAuthSession();
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient() as any;
  const { data, error } = await db
    .from('billing_categories')
    .select('id, category_name, amount')
    .eq('category_name', SERVICE_REQUEST_FEE_CATEGORY_NAME)
    .eq('is_active', true)
    .limit(1);

  if (error) {
    console.error('[service-requests/fee-categories] GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
