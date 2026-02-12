/**
 * Social Media Manual Entries API
 * POST /api/social-media/manual-entries - Create manual entry
 * RBAC: Admin, Principal, HOD can submit; faculty/students cannot
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createManualEntrySchema } from '@/lib/validations/social-media';

const ENTRY_ROLES = ['super_admin', 'admin', 'principal', 'hod'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role — only admin/principal/HOD can submit manual entries
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !ENTRY_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions to submit manual entries' }, { status: 403 });
    }

    const body = await request.json();
    const dto = createManualEntrySchema.parse(body);

    const { data, error } = await supabase
      .from('sm_manual_entries')
      .insert({ ...dto, entered_by: user.id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
