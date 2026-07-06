// app/api/cdc/training/[id]/route.ts
// GET   /api/cdc/training/[id] — get programme + enrollments
// PATCH /api/cdc/training/[id] — update programme

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UpdateTrainingProgrammeDto } from '@/types/cdc/training';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

     
    const sb = supabase as any;
    const [programmeRes, enrollmentsRes] = await Promise.all([
      sb.from('cdc_training_programmes')
        .select(`*, training_type:cdc_training_types(id, config_key, display_name, description), institution:institutions(id, name)`)
        .eq('id', id)
        .maybeSingle(),
      sb.from('cdc_training_enrollments')
        .select(`*, learner:learners_profiles(id, first_name, last_name, roll_number, institution:institutions(id, name))`)
        .eq('programme_id', id)
        .order('enrolled_at', { ascending: false }),
    ]);

    if (programmeRes.error) {
      return NextResponse.json({ error: programmeRes.error.message }, { status: 500 });
    }
    if (enrollmentsRes.error) {
      console.error('[cdc/training] GET enrollments error:', enrollmentsRes.error);
      return NextResponse.json({ error: enrollmentsRes.error.message }, { status: 500 });
    }
    if (!programmeRes.data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        ...programmeRes.data,
        enrollments: enrollmentsRes.data ?? [],
      },
    });
  } catch (err) {
    console.error('[cdc/training] GET [id] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: UpdateTrainingProgrammeDto = await request.json();

     
    const { data, error } = await (supabase as any)
      .from('cdc_training_programmes')
      .update({ ...body, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, training_type:cdc_training_types(id, config_key, display_name), institution:institutions(id, name)`)
      .single();

    if (error) {
      console.error('[cdc/training] PATCH error:', error);
      // L5: surface an RLS denial (42501) as a clean 403, not a masked 500.
      if (error.code === '42501') {
        return NextResponse.json({ error: 'You do not have permission to update this training programme' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[cdc/training] PATCH unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
