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
      .select(`*, learner:learners_profiles(id, first_name, last_name, roll_number, institution:institutions(id, name))`)
      .single();

    if (error) {
      console.error('[cdc/training] POST enrollment error:', error);
      // L5: surface an RLS denial (42501) as a clean 403, not a masked 500.
      if (error.code === '42501') {
        return NextResponse.json({ error: 'You do not have permission to enroll learners in this programme' }, { status: 403 });
      }
      // D9 / clean-400: a learner_id (or programme_id) that does not resolve to a
      // real row fails the FK (23503) — surface as a 400, not a 500.
      if (error.code === '23503') {
        return NextResponse.json({ error: 'learner_id does not reference an existing learner' }, { status: 400 });
      }
      // Duplicate enrollment via the unique (programme_id, learner_id) index.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Learner is already enrolled in this programme' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // NOTE (cohort spine): this thin REST path inserts the authoritative extension
    // row but does NOT mint the cohort_memberships mirror inline (to keep the route
    // lean and avoid duplicating the service twin under a different client). The
    // mirror is minted by TrainingService.addEnrollment (the UI Add/Bulk hook path)
    // and self-heals via the best-effort upsert in TrainingService.updateEnrollment
    // on the first status change. Roster reads stay authoritative on the extension
    // (nullable link, FK ON DELETE SET NULL), so a lagging mirror never drops a
    // learner. If a bulk API-import path that never updates is added later, route it
    // through TrainingService.addEnrollment or run a one-off spine backfill.
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[cdc/training] POST enrollment unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
