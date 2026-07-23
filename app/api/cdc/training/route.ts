// app/api/cdc/training/route.ts
// GET  /api/cdc/training — list programmes
// POST /api/cdc/training — create programme

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { CreateTrainingProgrammeDto, TrainingProgrammeFilters } from '@/types/cdc/training';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: TrainingProgrammeFilters = {
      search: sp.get('search') ?? undefined,
      training_type_id: sp.get('training_type_id') ?? undefined,
      status: (sp.get('status') as TrainingProgrammeFilters['status']) ?? undefined,
      institution_id: sp.get('institution_id') ?? undefined,
      date_from: sp.get('date_from') ?? undefined,
      date_to: sp.get('date_to') ?? undefined,
    };

     
    let query = (supabase as any)
      .from('cdc_training_programmes')
      .select(`*, training_type:cdc_training_types(id, config_key, display_name), institution:institutions(id, name)`)
      .order('created_at', { ascending: false });

    if (filters.search) query = query.ilike('name', `%${filters.search}%`);
    if (filters.training_type_id) query = query.eq('training_type_id', filters.training_type_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.date_from) query = query.gte('start_date', filters.date_from);
    if (filters.date_to) query = query.lte('end_date', filters.date_to);

    const { data, error } = await query;
    if (error) {
      console.error('[cdc/training] GET list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[cdc/training] GET unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateTrainingProgrammeDto = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

     
    const { data, error } = await (supabase as any)
      .from('cdc_training_programmes')
      .insert({ ...body, created_by: user.id })
      .select(`*, training_type:cdc_training_types(id, config_key, display_name), institution:institutions(id, name)`)
      .single();

    if (error) {
      console.error('[cdc/training] POST create error:', error);
      // L5: surface an RLS denial (42501) as a clean 403, not a masked 500.
      if (error.code === '42501') {
        return NextResponse.json({ error: 'You do not have permission to create a training programme' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[cdc/training] POST unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
