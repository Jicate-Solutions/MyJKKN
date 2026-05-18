// app/api/cdc/training/[id]/enrollments/route.ts
// POST /api/cdc/training/[id]/enrollments — add learner enrollment

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CreateEnrollmentDto } from '@/types/cdc/training';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: programme_id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: Omit<CreateEnrollmentDto, 'programme_id'> = await request.json();
    if (!body.learner_id) {
      return NextResponse.json({ error: 'learner_id is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Prevent duplicate enrollment
    const { data: existing } = await sb
      .from('cdc_training_enrollments')
      .select('id')
      .eq('programme_id', programme_id)
      .eq('learner_id', body.learner_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Learner is already enrolled in this programme' }, { status: 409 });
    }

    const { data, error } = await sb
      .from('cdc_training_enrollments')
      .insert({ ...body, programme_id })
      .select(`*, learner:learner_profiles(id, name, roll_number, institution:institutions(id, name))`)
      .single();

    if (error) {
      console.error('[cdc/training] POST enrollment error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[cdc/training] POST enrollment unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
