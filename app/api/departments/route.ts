import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';

export async function GET(request: Request) {
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

    return NextResponse.json(departments || []);
  } catch (error) {
    console.error('[DEPARTMENTS_GET] Error fetching departments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}
