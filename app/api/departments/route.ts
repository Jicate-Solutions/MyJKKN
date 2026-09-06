export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { withAuth } from '@/lib/auth/with-auth';


/**
 * Guarded 2026-09-01. This had NO auth and used `createAdminClient()` — a
 * SERVICE-ROLE client that bypasses RLS — so any anonymous caller received all
 * 91 departments with their internal UUIDs. Not sensitive in itself (a college's
 * department list is public), but the ids are useful for enumerating other
 * endpoints, and nothing about the route was meant to be public: all three
 * callers are authenticated admin surfaces (/users/new, the user edit form, and
 * the bug-reports hook).
 */
export const GET = withAuth(async (request) => {
  await connection();
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const institution_id = searchParams.get('institution_id');

    let query = supabase
      .from('departments')
      .select('id, department_name')
      .order('department_name');

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    const { data: departments, error } = await query;

    if (error) throw error;

    // Transform the data to match the expected format
    const transformedDepartments =
      departments?.map((dept: any) => ({
        id: dept.id,
        name: dept.department_name
      })) || [];

    return NextResponse.json(transformedDepartments);
  } catch (error) {
    console.error('[DEPARTMENTS_GET] Error fetching departments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}, { requiredPermission: 'read' });
