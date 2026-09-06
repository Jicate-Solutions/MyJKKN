// app/api/cdc/internships/[id]/route.ts
// CDC Sprint 4 — Get detail + update status for a single internship

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ASSIGNMENT_SELECT = `
  id, institution_id, cycle_id, learner_id, site_id, facilitator_id,
  preceptor_id, program_id, department_rotation,
  rotation_start_date, rotation_end_date, assignment_join_date,
  required_attendance_pct, status, internship_type,
  total_days, days_present, attendance_percentage, overall_grade,
  created_at, updated_at, created_by, updated_by,
  site:internship_external_sites (
    id, institution_id, site_name, internship_type,
    city, state, address_line1, is_active, operates_weekends, created_at
  ),
  certificate:internship_certificates (
    id, institution_id, assignment_id, certificate_number, issued_date,
    attendance_percentage, evaluation_average,
    certificate_pdf_url, verification_url, is_revoked, created_at, created_by
  )
`;

/**
 * GET /api/cdc/internships/[id]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[CDC Internships API] GET /[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/cdc/internships/[id]
 * Body: { status: string }
 * Triggers the status-guard trigger on the DB side.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    const allowedRoles = ['cdc_head', 'cdc_coordinator', 'admin'];
    if (!profile?.is_super_admin && !allowedRoles.includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden — CDC staff only' }, { status: 403 });
    }

    const body: { status: string } = await request.json();
    if (!body.status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('internship_assignments')
      .update({ status: body.status, updated_by: user.id })
      .eq('id', id)
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) {
      // DB trigger may raise an exception for illegal transitions — surface it.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[CDC Internships API] PATCH /[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
